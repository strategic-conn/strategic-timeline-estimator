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

/** The one stage this app is allowed to set (decision: "sent" → Proposal Sent). */
const TARGET_STAGE = "Proposal Sent";

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role is not configured.");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
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
  if (zoho.pushed_at) {
    return NextResponse.json(
      {
        alreadyPushed: true,
        pushedAt: zoho.pushed_at,
        message: "This quote was already pushed to Zoho.",
      },
      { status: 200 },
    );
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
      body: JSON.stringify({ data: [{ Stage: TARGET_STAGE }] }),
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

  // ── 2. Attach the PDF (best-effort: the stage move already succeeded) ──
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
  } else {
    result.warnings.push("No PDF was supplied, so nothing was attached.");
  }

  // ── 3. Record the push so a retry can't duplicate the attachment ──
  const { error: writeErr } = await supabase
    .from("proposals")
    .update({
      zoho: {
        ...zoho,
        deal_id: dealId,
        pushed_at: new Date().toISOString(),
        pushed_stage: TARGET_STAGE,
      },
    })
    .eq("id", proposalId);
  if (writeErr) {
    console.error("[zoho push] couldn't record pushed_at", writeErr);
    result.warnings.push(
      "Pushed to Zoho, but we couldn't record it — a re-push could duplicate the attachment.",
    );
  }

  return NextResponse.json(result);
}
