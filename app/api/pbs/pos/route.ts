import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { isPbsConfigured } from "@/lib/pbs/config";
import {
  fetchPoById,
  findPoCandidate,
  resolveTemplateForClient,
} from "@/lib/pbs/directory";
import { requirePbsReader, requirePbsWriter } from "@/lib/pbs/guard";
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
 * POST /api/pbs/pos   { proposalId, name, clientId, startDate?, endDate? }
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
 * The PO is intentionally a shell — `name`, template, client and a project date
 * range. The API accepts nothing else: `rate_per_hour` is pinned to 0
 * server-side, and there is no line-item or amount field. The estimate's figures
 * stay in this app and Zoho.
 *
 * `start_date` / `end_date` are optional to PBS and **both default to the
 * current UTC date when omitted** — which would file a months-long project as
 * starting and ending today. So the dialog always derives them from the
 * estimate's own timeline and sends them; they are validated here rather than
 * trusted, because PBS stores them in a `po_parameter` record created in the
 * same transaction as the PO, and there is no endpoint to correct either one.
 */
const CLAIM_TTL_MS = 2 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role is not configured.");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Is there already a PO in PBS that might be this estimate's? — read-only.
 *
 * GET /api/pbs/pos?proposalId=<uuid>&clientId=<pbs client id>
 *   → { candidate: { po_no, po_id, create_date, create_by, matchCount, … } | null }
 * GET /api/pbs/pos?proposalIds=<uuid>,<uuid>,…
 *   → { live: { "<proposalId>": { po_no, name, status, missing } } }
 *
 * Two shapes, because they answer different questions about different
 * estimates: **candidate** is "does a PO for this UNLINKED estimate already
 * exist" (a guess, matched by name, confirmed by a human), and **live** is
 * "what do the POs these estimates are ALREADY linked to look like now" (exact,
 * keyed on the stored `po_id`, safe to apply automatically).
 *
 * Matched on the estimate's title within one client (see `findPoCandidate` for
 * why that is a candidate and not an answer). Purely so the Create PO dialog can
 * show what it found *before* anyone clicks — the same rule as the Zoho send
 * dialog: nothing irreversible without seeing it first.
 *
 * Writes nothing, links nothing. The server-side refusal in POST is the guard;
 * this is the preview.
 */
export async function GET(req: Request) {
  const gate = await requirePbsReader();
  if ("error" in gate) return gate.error;

  if (!isPbsConfigured) {
    return NextResponse.json(
      { error: "PBS isn't configured on the server." },
      { status: 503 },
    );
  }

  const q = new URL(req.url).searchParams;
  const supabase0 = db();

  // ── Mode 2: live state of POs these estimates are ALREADY linked to ──
  // Keyed on the stored `po_id`, so this is an exact read with none of the
  // name-matching ambiguity that keeps linking manual. This is the whole
  // PBS→app direction: a PO's status moves in the billing system (N/A/B/C/E
  // all occur in live history) and nothing else would ever tell the app.
  const many = String(q.get("proposalIds") ?? "").trim();
  if (many) {
    const ids = [
      ...new Set(
        many
          .split(",")
          .map((s) => s.trim())
          .filter((s) => UUID.test(s)),
      ),
    ].slice(0, 25);
    if (!ids.length) return NextResponse.json({ live: {} });

    const { data: rows } = await supabase0
      .from("proposals")
      .select("id, pbs")
      .in("id", ids);

    const live: Record<string, unknown> = {};
    const linked = (rows ?? []).filter(
      (r) => ((r.pbs ?? {}) as Record<string, unknown>).po_id,
    );
    // PBS has no read-many-by-id, so this fans out — in small batches rather
    // than one at a time, which at the 25 cap was 25 sequential round-trips
    // blocking the estimator list.
    const BATCH = 5;
    for (let i = 0; i < linked.length; i += BATCH) {
      await Promise.all(
        linked.slice(i, i + BATCH).map(async (r) => {
          const poId = ((r.pbs ?? {}) as Record<string, unknown>).po_id;
          const po = await fetchPoById(String(poId));
          if (po === null) return; // couldn't read — say nothing rather than guess
          live[r.id] =
            po === "missing"
              ? { missing: true }
              : {
                  po_no: po.po_no ?? null,
                  name: po.name ?? null,
                  status: po.status ?? null,
                  project_id: po.project_id ?? null,
                  project_template_id:
                    po.project_template_id != null
                      ? String(po.project_template_id)
                      : null,
                  update_date: po.update_date ?? null,
                  missing: false,
                };
        }),
      );
    }
    return NextResponse.json({ live, checkedAt: new Date().toISOString() });
  }

  // ── Mode 1: a PO that might already exist for an UNLINKED estimate ──
  const proposalId = String(q.get("proposalId") ?? "").trim();
  const clientId = String(q.get("clientId") ?? "").trim();
  if (!UUID.test(proposalId) || !/^\d+$/.test(clientId)) {
    return NextResponse.json({ candidate: null });
  }

  const { data: proposal } = await supabase0
    .from("proposals")
    .select("id, title, pbs")
    .eq("id", proposalId)
    .maybeSingle();
  if (!proposal) {
    return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  }
  // Already linked — there is nothing to recover, and reporting a candidate
  // would invite re-linking a quote that is settled.
  const pbs = (proposal.pbs ?? {}) as Record<string, unknown>;
  if (pbs.po_no || pbs.po_id) return NextResponse.json({ candidate: null });

  try {
    return NextResponse.json({
      candidate: await findPoCandidate(String(proposal.title ?? ""), clientId),
    });
  } catch (e) {
    console.error("[pbs po lookup]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "PBS request failed." },
      { status: 502 },
    );
  }
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

  let input: {
    proposalId?: string;
    name?: string;
    clientId?: string;
    /**
     * A PO number the user explicitly chose to link instead of creating. Must
     * equal the candidate the server finds — never trusted on its own, so a
     * crafted value can't attach an arbitrary PO to a quote.
     */
    linkExisting?: string;
    /** Project date range, `YYYY-MM-DD`. See the header for why these matter. */
    startDate?: string;
    endDate?: string;
  };
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const proposalId = String(input.proposalId ?? "").trim();
  const name = String(input.name ?? "").trim().slice(0, 255);
  const clientId = String(input.clientId ?? "").trim();
  const linkExisting = String(input.linkExisting ?? "").trim();

  // Optional to PBS, so absence is allowed (it defaults both to today) — but a
  // malformed or backwards range is rejected rather than passed on: the PO and
  // its date record are written transactionally and neither can be edited after.
  const YMD = /^\d{4}-\d{2}-\d{2}$/;
  const startDate = String(input.startDate ?? "").trim();
  const endDate = String(input.endDate ?? "").trim();
  // A real calendar day, not just the right shape. `Date.parse` is not enough:
  // it ROLLS OVER, so "2026-02-31" parses happily as March 3rd and "2026-04-31"
  // as May 1st (verified). PBS would then store the rolled-over date, in a
  // record with no edit endpoint — a typo becomes permanent and silent. Only a
  // value that round-trips to itself is the date the user actually typed.
  const isRealYmd = (v: string) => {
    if (!YMD.test(v)) return false;
    const t = Date.parse(`${v}T00:00:00Z`);
    return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
  };
  for (const [label, v] of [
    ["startDate", startDate],
    ["endDate", endDate],
  ] as const) {
    if (v && !isRealYmd(v)) {
      return NextResponse.json(
        { error: `${label} must be a real date in YYYY-MM-DD form.` },
        { status: 400 },
      );
    }
  }
  if (startDate && endDate && endDate < startDate) {
    // PBS enforces this too; failing here keeps a doomed write off the wire.
    return NextResponse.json(
      { error: "The end date must be on or after the start date." },
      { status: 400 },
    );
  }

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
  // ── No deal, no PO ──
  // Billing waits for the win, and the win is a Zoho deal reaching Closed Won.
  // An estimate with no deal has nothing that can be won, so it is refused
  // rather than skipping the check — PBS can't delete a PO, so "billable by
  // default" was the wrong way round. Send it to Zoho (or link a deal) first.
  if (!dealId) {
    return NextResponse.json(
      {
        error:
          "This estimate isn't linked to a Zoho deal. A PO is only created once its deal reaches Closed Won — send it to Zoho first.",
      },
      { status: 409 },
    );
  }
  {
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
    // endpoint, so "couldn't confirm" must not create a PO.
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

  // ── Does PBS already have a PO that might be this one? ──
  // The quote's own `pbs` field is not proof: the PO is created in PBS first
  // and linked second, so a Supabase failure in between leaves a real PO this
  // app has no record of (verified live). Creating a second one is the only
  // unrecoverable outcome here — PBS has no delete endpoint — so ask PBS.
  //
  // On a hit this **refuses** and hands the candidate back. It does not adopt:
  // the match is on the estimate's title within one client, and a repeat client
  // can have the same job name twice. Guessing wrong would bill work against
  // an unrelated PO silently, which is worse than the visible mess of a
  // duplicate. `linkExisting` is how a human says "yes, that one".
  let candidate: Awaited<ReturnType<typeof findPoCandidate>> = null;
  try {
    candidate = await findPoCandidate(name, clientId);
  } catch (e) {
    // A PBS read we can't complete must not become "no PO exists, go create
    // one". Fail closed, like the Zoho won-stage check above.
    console.error("[pbs po] existing-PO check failed", e);
    return NextResponse.json(
      {
        error:
          "Couldn't check PBS for an existing PO, so none was created. PBS can't delete a PO, so this check isn't skipped.",
      },
      { status: 502 },
    );
  }

  if (candidate) {
    // The client confirmed this exact PO — record the link, call nothing.
    if (linkExisting && linkExisting === candidate.po_no) {
      const linked: Record<string, unknown> = {
        ...pbs,
        client_id: candidate.client_id ?? clientId,
        po_id: candidate.po_id,
        po_no: candidate.po_no,
        created_at: candidate.create_date ?? new Date().toISOString(),
        adopted: true,
      };
      delete linked.creating_at;
      const { error: linkErr } = await supabase
        .from("proposals")
        .update({ pbs: linked })
        .eq("id", proposalId);
      if (linkErr) {
        console.error("[pbs po] link write failed", linkErr);
        return NextResponse.json(
          { error: `Couldn't link PO ${candidate.po_no} to this estimate.` },
          { status: 500 },
        );
      }
      return NextResponse.json({
        poId: candidate.po_id,
        poNo: candidate.po_no,
        linked: true,
        warnings: [`Linked to the existing PO ${candidate.po_no}. Nothing was created in PBS.`],
      });
    }
    return NextResponse.json(
      {
        error: `PBS already has PO ${candidate.po_no} named "${candidate.name}" for this client${
          candidate.create_date ? `, created ${candidate.create_date}` : ""
        }. Nothing was created. Link that PO if it is this estimate's, or rename the estimate if it's a different job.`,
        candidate,
      },
      { status: 409 },
    );
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
      // Omitted rather than sent empty when absent: PBS treats a missing key as
      // "default to today", and an empty string is not a date.
      ...(startDate ? { start_date: startDate } : {}),
      ...(endDate ? { end_date: endDate } : {}),
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
      // The PO row PBS returns carries no dates — they live in the separate
      // `po_parameter` record, which nothing this app can read exposes. So this
      // is the only record of the range the PO was filed with.
      ...(startDate ? { start_date: startDate } : {}),
      ...(endDate ? { end_date: endDate } : {}),
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
