import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { requireZohoWriter } from "@/lib/zoho/guard";
import { zohoFetch } from "@/lib/zoho/tokens";

/**
 * Push a sent quote to its linked Zoho Deal: move the stage and attach the PDF.
 *
 * POST /api/zoho/deals/<dealId>/push
 *   multipart/form-data: proposalId=<uuid>, file=<the proposal PDF>
 *
 * Verified against the live CRM before building (see
 * docs/zoho-workflow-automation-plan.md §Phase 3):
 *  - Only `Stage` is writable. `Amount` is a formula field (a write "succeeds"
 *    then Zoho recalculates it back within ~1s) and `Quote_number` is a system
 *    autonumber — so neither is sent here.
 *  - Zoho does NOT dedupe attachments: uploading the same filename twice creates
 *    two records. Hence the server-side `pushed_at` guard below.
 */

import { applyEstimateToDeal } from "@/lib/zoho/deal-estimate-sync";
import {
  dealTakenMessage,
  findSiblingPushedStage,
  type DealHolder,
} from "@/lib/zoho/deal-exclusivity";
import { parsePackageInput } from "@/lib/zoho/deal-packages";
import {
  AUTO_ADVANCE_FROM,
  PUSHABLE_STAGES,
  isPushableStage,
  zohoPushes,
} from "@/lib/zoho/push-state";

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role is not configured.");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Merge fields into `proposals.zoho`. Used by the skip paths too: whatever Zoho
 * reports as the live stage is worth storing even when nothing was pushed, so
 * the stage badge stops showing the value from import time. Returns an error
 * object only when the write failed.
 */
async function recordStage(
  supabase: ReturnType<typeof db>,
  proposalId: string,
  zoho: Record<string, unknown>,
  patch: { stage: string; dealId?: string; pushes?: Record<string, string> },
): Promise<{ message: string } | null> {
  const next: Record<string, unknown> = {
    ...zoho,
    stage: patch.stage,
    stage_synced_at: new Date().toISOString(),
  };
  if (patch.dealId) next.deal_id = patch.dealId;
  if (patch.pushes) {
    next.pushes = patch.pushes;
    // Legacy mirrors, so anything still reading these keeps working.
    next.pushed_at = new Date().toISOString();
    next.pushed_stage = patch.stage;
  }
  const { error } = await supabase
    .from("proposals")
    .update({ zoho: next })
    .eq("id", proposalId);
  return error ? { message: error.message } : null;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireZohoWriter();
  if ("error" in gate) return gate.error;

  const { id: dealId } = await ctx.params;
  if (!dealId) {
    return NextResponse.json({ error: "Missing deal id." }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }
  const proposalId = String(form.get("proposalId") ?? "").trim();
  const file = form.get("file");
  if (!proposalId) {
    return NextResponse.json({ error: "Missing proposalId." }, { status: 400 });
  }

  // Whitelisted so a crafted request can't drive the deal to an arbitrary stage
  // (e.g. Closed Won, which is sales' call, not this app's).
  const requested = String(form.get("stage") ?? PUSHABLE_STAGES.proposalSent);
  if (!isPushableStage(requested)) {
    return NextResponse.json(
      { error: `"${requested}" is not a stage this app may set.` },
      { status: 400 },
    );
  }
  const targetStage = requested;

  const supabase = db();

  // ── Idempotency, enforced server-side so a double-click can't race past it ──
  const { data: proposal, error: readErr } = await supabase
    .from("proposals")
    .select("id, zoho")
    .eq("id", proposalId)
    .maybeSingle();
  if (readErr || !proposal) {
    console.error("[zoho push] proposal lookup failed", readErr);
    return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  }
  const zoho = (proposal.zoho ?? {}) as Record<string, unknown>;
  if (zoho.deal_id && zoho.deal_id !== dealId) {
    return NextResponse.json(
      { error: "This quote is linked to a different Zoho deal." },
      { status: 409 },
    );
  }
  // Per-stage guard: the deal legitimately advances more than once, but each
  // stage may only be pushed a single time (a re-push would duplicate the PDF).
  const pushes = zohoPushes(zoho as never);
  if (pushes[targetStage]) {
    return NextResponse.json(
      {
        alreadyPushed: true,
        stage: targetStage,
        pushedAt: pushes[targetStage],
        message: `Already pushed "${targetStage}" for this quote.`,
      },
      { status: 200 },
    );
  }

  // ── One estimate per deal, enforced on the DEAL not the quote ──
  // The guard above reads this proposal's own `pushes`, so a second estimate
  // sharing the deal would look like a first push: stage moved again, a second
  // PDF attached (Zoho does not dedupe), and the Packages write skipped because
  // rows already exist. Ask about the deal instead.
  const { data: siblings } = await supabase
    .from("proposals")
    .select("id, title, status, zoho, pbs")
    .neq("id", proposalId)
    .filter("zoho->>deal_id", "eq", dealId);
  const clash = findSiblingPushedStage(
    (siblings ?? []) as unknown as DealHolder[],
    targetStage,
  );
  if (clash) {
    return NextResponse.json(
      {
        error: `"${targetStage}" was already pushed to this deal by another estimate. ${dealTakenMessage(clash)}`,
      },
      { status: 409 },
    );
  }

  // ── Never regress the pipeline ──
  // Stages this app sets as a side effect (Discovery, on import) may only move a
  // deal FORWARD, so read the live stage first: one already at Negotiation or
  // Verbal Yes must stay where sales put it, and so must one in a stage this app
  // doesn't know. Explicit-button stages skip this — the click is the intent.
  const allowedFrom = AUTO_ADVANCE_FROM[targetStage];
  if (allowedFrom) {
    let currentStage: string | null = null;
    try {
      const res = await zohoFetch(
        `/crm/v2/Deals/${encodeURIComponent(dealId)}?fields=Stage`,
      );
      const body = await res.json().catch(() => null);
      currentStage = (body?.data?.[0]?.Stage as string) ?? null;
    } catch (e) {
      console.error("[zoho push] couldn't read current stage", e);
    }
    if (!currentStage || !allowedFrom.includes(currentStage)) {
      // Not an error: importing a deal that's further along is normal. Record
      // what Zoho actually says, so the app stops showing a stale stage.
      if (currentStage) {
        await recordStage(supabase, proposalId, zoho, { stage: currentStage });
      }
      return NextResponse.json({
        skipped: true,
        stageUpdated: false,
        currentStage,
        message: !currentStage
          ? "Couldn't read the deal's current stage, so it was left untouched."
          : currentStage === targetStage
            ? `Deal is already at "${currentStage}".`
            : `Left at "${currentStage}" — an import only advances a deal from ${allowedFrom
                .map((s) => `"${s}"`)
                .join(" or ")}.`,
      });
    }
  }

  const result: {
    stageUpdated: boolean;
    attachmentUploaded: boolean;
    warnings: string[];
  } = { stageUpdated: false, attachmentUploaded: false, warnings: [] };

  // ── 1. Move the stage (the only field this app writes) ──
  try {
    const res = await zohoFetch(`/crm/v2/Deals/${encodeURIComponent(dealId)}`, {
      method: "PUT",
      body: JSON.stringify({ data: [{ Stage: targetStage }] }),
    });
    const body = await res.json().catch(() => null);
    const row = body?.data?.[0];
    if (res.ok && row?.code === "SUCCESS") {
      result.stageUpdated = true;
    } else {
      // Zoho reports per-record errors inside a 2xx envelope, so check the row.
      const msg = row?.message ?? `HTTP ${res.status}`;
      console.error("[zoho push] stage update failed", res.status, JSON.stringify(body));
      return NextResponse.json(
        { error: `Couldn't update the deal stage: ${msg}` },
        { status: 502 },
      );
    }
  } catch (e) {
    console.error("[zoho push] stage update threw", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Zoho is not connected." },
      { status: 503 },
    );
  }

  // ── 2. Carry the estimate's content across, for deals that came FROM Zoho ──
  // An imported deal only ever got a stage move, so its Packages table stayed
  // empty and its Amount stayed 0. Same shared write as "Create deal", which
  // skips anything the deal already has — sales may have filled those rows by
  // hand, and a subform write replaces all of them.
  if (targetStage === PUSHABLE_STAGES.proposalSent) {
    let products: ReturnType<typeof parsePackageInput> = [];
    try {
      products = parsePackageInput(JSON.parse(String(form.get("products") ?? "[]")));
    } catch {
      products = [];
    }
    const description = String(form.get("description") ?? "").slice(0, 2000);
    if (products.length || description) {
      const sync = await applyEstimateToDeal(dealId, { products, description });
      result.warnings.push(...sync.warnings);
    }
  }

  // ── 3. Attach the PDF (best-effort: the stage move already succeeded) ──
  if (file && file instanceof File && file.size > 0) {
    try {
      const upload = new FormData();
      upload.append("file", file, file.name || "proposal.pdf");
      // zohoFetch detects the FormData body and leaves Content-Type to fetch,
      // so the multipart boundary is preserved.
      const res = await zohoFetch(
        `/crm/v2/Deals/${encodeURIComponent(dealId)}/Attachments`,
        { method: "POST", body: upload },
      );
      const body = await res.json().catch(() => null);
      if (res.ok && body?.data?.[0]?.code === "SUCCESS") {
        result.attachmentUploaded = true;
      } else {
        console.error("[zoho push] attachment failed", res.status, JSON.stringify(body));
        result.warnings.push(
          "The deal stage was updated, but the PDF couldn't be attached.",
        );
      }
    } catch (e) {
      console.error("[zoho push] attachment threw", e);
      result.warnings.push(
        "The deal stage was updated, but the PDF couldn't be attached.",
      );
    }
  } else if (targetStage === PUSHABLE_STAGES.proposalSent) {
    // Only the proposal push is meant to carry a file; a completion push isn't.
    result.warnings.push("No PDF was supplied, so nothing was attached.");
  }

  // ── 4. Record the push so a retry can't duplicate the attachment ──
  const writeErr = await recordStage(supabase, proposalId, zoho, {
    stage: targetStage,
    dealId,
    pushes: { ...pushes, [targetStage]: new Date().toISOString() },
  });
  if (writeErr) {
    console.error("[zoho push] couldn't record pushed_at", writeErr);
    result.warnings.push(
      "Pushed to Zoho, but we couldn't record it — a re-push could duplicate the attachment.",
    );
  }

  return NextResponse.json(result);
}
