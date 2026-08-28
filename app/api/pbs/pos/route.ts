import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { isPbsConfigured } from "@/lib/pbs/config";
import { resolveTemplateForClient } from "@/lib/pbs/directory";
import { requirePbsWriter } from "@/lib/pbs/guard";
import { pbsFetch } from "@/lib/pbs/tokens";
import {
  findSiblingWithPo,
  type DealHolder,
} from "@/lib/zoho/deal-exclusivity";
import { isWonStage } from "@/lib/zoho/stages";
import { zohoFetch } from "@/lib/zoho/tokens";

/**
 * Create a PO in PBS from an estimate.
 *
 * POST /api/pbs/pos   { proposalId, name, clientId }
 *
 * This is the app's only PBS write, and the riskiest call in the integration:
 * **PBS has no delete endpoint**, so a duplicate PO is a manual cleanup in a
 * live billing system. Hence, in order:
 *
 *  - a quote that already carries a `po_no` is refused outright;
 *  - the row is claimed with a compare-and-set before PBS is called, so two
 *    concurrent submits can't both create;
 *  - the claim is released if PBS refuses, so a retry is possible;
 *  - the link write is retried once, because a created PO that failed to record
 *    itself looks like "no PO yet" to the next click.
 *
 * The PO is intentionally a shell — `name`, template and client. The API accepts
 * nothing else: `rate_per_hour` is pinned to 0 server-side, and there is no
 * line-item or amount field. The estimate's figures stay in this app and Zoho.
 */
const CLAIM_TTL_MS = 2 * 60 * 1000;

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role is not configured.");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(req: Request) {
  const gate = await requirePbsWriter();
  if ("error" in gate) return gate.error;

  if (!isPbsConfigured) {
    return NextResponse.json(
      { error: "PBS isn't configured on the server." },
      { status: 503 },
    );
  }

  let input: { proposalId?: string; name?: string; clientId?: string };
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const proposalId = String(input.proposalId ?? "").trim();
  const name = String(input.name ?? "").trim().slice(0, 255);
  const clientId = String(input.clientId ?? "").trim();

  if (!proposalId || !name) {
    return NextResponse.json(
      { error: "A quote and a PO name are required." },
      { status: 400 },
    );
  }
  // PBS client ids are small integers; anything else can't be a valid target.
  if (!/^\d+$/.test(clientId)) {
    return NextResponse.json(
      { error: "Pick a PBS billing client on the Setup tab first." },
      { status: 400 },
    );
  }

  const supabase = db();
  const { data: proposal, error: readErr } = await supabase
    .from("proposals")
    .select("id, zoho, pbs")
    .eq("id", proposalId)
    .maybeSingle();
  if (readErr || !proposal) {
    console.error("[pbs po] proposal lookup failed", readErr);
    return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  }
  const pbs = (proposal.pbs ?? {}) as Record<string, unknown>;
  if (pbs.po_no || pbs.po_id) {
    return NextResponse.json(
      { error: `This quote already has PO ${pbs.po_no ?? pbs.po_id}.` },
      { status: 409 },
    );
  }

  // ── One PO per deal, not just per estimate ──
  // Estimates that share a Zoho deal are the same piece of work; billing it
  // twice would leave two POs that PBS cannot delete.
  const dealId = (proposal.zoho as { deal_id?: string } | null)?.deal_id;
  if (dealId) {
    const { data: siblings } = await supabase
      .from("proposals")
      .select("id, title, status, zoho, pbs")
      .neq("id", proposalId)
      .filter("zoho->>deal_id", "eq", dealId);
    const billed = findSiblingWithPo((siblings ?? []) as unknown as DealHolder[]);
    if (billed) {
      return NextResponse.json(
        {
          error: `This deal is already billed as ${billed.pbs?.po_no ?? billed.pbs?.po_id} on the estimate "${billed.title ?? "another estimate"}". PBS can't remove a PO, so a second one isn't created.`,
        },
        { status: 409 },
      );
    }

    // ── Billing waits for the win ──
    // A PO is raised once sales has actually won the deal, not when a quote goes
    // out. Read the stage live rather than trusting `zoho.stage` (a cache that
    // refreshes on view) or the client, and FAIL CLOSED: PBS has no delete
    // endpoint, so "couldn't confirm" must not create a PO. Only a deal with no
    // Zoho link at all skips this — there is nothing to check, and hand-made
    // estimates were billable before this rule existed.
    let liveStage: string | null = null;
    try {
      const res = await zohoFetch(
        `/crm/v2/Deals/${encodeURIComponent(dealId)}?fields=Stage`,
      );
      const body = await res.json().catch(() => null);
      liveStage = (body?.data?.[0]?.Stage as string) ?? null;
    } catch (e) {
      console.error("[pbs po] couldn't read the deal stage", e);
    }
    if (!liveStage) {
      return NextResponse.json(
        {
          error:
            "Couldn't confirm the deal's stage in Zoho, so no PO was created. Try again once Zoho is reachable.",
        },
        { status: 502 },
      );
    }
    if (!(await isWonStage(liveStage))) {
      return NextResponse.json(
        {
          error: `This deal is at "${liveStage}". A PO is only created once it reaches Closed Won.`,
          currentStage: liveStage,
        },
        { status: 409 },
      );
    }
  }

  // ── Claim the row so a double submit can't create two POs ──
  const prior = typeof pbs.creating_at === "string" ? pbs.creating_at : null;
  if (prior && Date.now() - new Date(prior).getTime() < CLAIM_TTL_MS) {
    return NextResponse.json(
      { error: "A PO is already being created for this quote." },
      { status: 409 },
    );
  }
  const claim = supabase
    .from("proposals")
    .update({ pbs: { ...pbs, creating_at: new Date().toISOString() } })
    .eq("id", proposalId)
    .filter("pbs->>po_no", "is", null);
  const { data: claimed, error: claimErr } = await (prior
    ? // Steal a stale claim, but only if it is still the exact one we read.
      claim.filter("pbs->>creating_at", "eq", prior)
    : claim.filter("pbs->>creating_at", "is", null)
  ).select("id");
  if (claimErr || !claimed?.length) {
    console.error("[pbs po] claim failed", claimErr);
    return NextResponse.json(
      { error: "Couldn't start creating the PO — try again in a moment." },
      { status: 409 },
    );
  }
  const release = async () => {
    await supabase.from("proposals").update({ pbs }).eq("id", proposalId);
  };

  // ── Which template? Env override, else this client's own history ──
  let template;
  try {
    template = await resolveTemplateForClient(clientId);
  } catch (e) {
    await release();
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "PBS is unreachable." },
      { status: 503 },
    );
  }
  if (!template.templateId) {
    await release();
    return NextResponse.json(
      {
        error:
          "No project template for this client — it has no POs to learn from. Set PBS_PROJECT_TEMPLATE_ID, or create this client's first PO in PBS.",
      },
      { status: 400 },
    );
  }

  // ── Create it ──
  try {
    const res = await pbsFetch<{ po?: Record<string, unknown> }>("create-po", {
      name,
      client_id: Number(clientId),
      project_template_id: Number(template.templateId),
    });
    const po = res.body?.data?.po;
    if (!res.ok || !po) {
      await release();
      return NextResponse.json(
        { error: `PBS didn't create the PO: ${res.error ?? "unknown error"}` },
        { status: 502 },
      );
    }

    const now = new Date().toISOString();
    const nextPbs: Record<string, unknown> = {
      ...pbs,
      client_id: clientId,
      po_id: po.id ?? null,
      po_no: po.po_no ?? null,
      created_at: now,
    };
    delete nextPbs.creating_at;

    // Retried once: the PO EXISTS now, and a quote that didn't record it looks
    // unlinked — so the next click would happily create a second one.
    let linkErr = (
      await supabase.from("proposals").update({ pbs: nextPbs }).eq("id", proposalId)
    ).error;
    if (linkErr) {
      await new Promise((r) => setTimeout(r, 400));
      linkErr = (
        await supabase.from("proposals").update({ pbs: nextPbs }).eq("id", proposalId)
      ).error;
    }

    return NextResponse.json({
      poId: po.id ?? null,
      poNo: po.po_no ?? null,
      templateId: template.templateId,
      templateSource: template.source,
      warnings: linkErr
        ? [
            `PO ${po.po_no} was created in PBS, but this quote couldn't be linked to it. Record it by hand — creating another would duplicate it.`,
          ]
        : [],
    });
  } catch (e) {
    console.error("[pbs po] create threw", e);
    await release();
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "PBS is unreachable." },
      { status: 503 },
    );
  }
}
