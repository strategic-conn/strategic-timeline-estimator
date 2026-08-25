import "server-only";

import { NextResponse } from "next/server";

import { createClient as createServiceClient } from "@supabase/supabase-js";

import { requireZohoReader, requireZohoWriter } from "@/lib/zoho/guard";
import { PUSHABLE_STAGES } from "@/lib/zoho/push-state";
import { zohoFetch } from "@/lib/zoho/tokens";

/**
 * List Zoho CRM Deals for the Estimator's import picker — read-only.
 *
 * GET /api/zoho/deals?stage=Proposal%20Requested   (stage optional)
 *     /api/zoho/deals?q=acme                       (free-text, overrides stage)
 *
 * Notes from probing the live org:
 *  - `criteria` only supports equals/starts_with, so stage filtering uses
 *    `(Stage:equals:<stage>)` and free text uses `word=`.
 *  - `Amount` and `Service_Interested_in` are often 0/null on real deals, so the
 *    UI must treat them as optional rather than promising a value.
 *  - `Account_Name` / `Contact_Name` / `Owner` come back as {id,name} objects.
 *  - Zoho returns no record URL, so the deep link is constructed from the org id
 *    (fetched once per server instance) and the CRM web host.
 */
const FIELDS = [
  "Deal_Name",
  "Stage",
  "Amount",
  "Currency",
  "Closing_Date",
  "Service_Interested_in",
  "Account_Name",
  "Contact_Name",
  "Owner",
  "Description",
  "Quote_number",
  "Modified_Time",
].join(",");

/** Stages worth quoting, most actionable first. */
export const IMPORTABLE_STAGES = [
  "Proposal Requested",
  "Discovery",
  "Negotiation",
  "Verbal Yes",
  "Proposal Sent",
] as const;

export type ZohoDeal = {
  id: string;
  name: string | null;
  stage: string | null;
  amount: number | null;
  currency: string | null;
  closingDate: string | null;
  service: string | null;
  account: string | null;
  contact: string | null;
  owner: string | null;
  description: string | null;
  quoteNumber: string | number | null;
  webUrl: string | null;
};

/** org id is stable per workspace — cache it for the life of the instance. */
let orgIdCache: string | null = null;
async function crmWebBase(): Promise<string | null> {
  try {
    if (!orgIdCache) {
      const res = await zohoFetch("/crm/v2/org");
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      orgIdCache = data?.org?.[0]?.id ?? null;
    }
    return orgIdCache ? `crm/org${orgIdCache}/tab/Potentials` : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const gate = await requireZohoReader();
  if ("error" in gate) return gate.error;

  const params = new URL(req.url).searchParams;
  const q = (params.get("q") ?? "").trim();
  // Whitelist the stage: it's interpolated into a Zoho `criteria` filter, so an
  // arbitrary value could reshape the query. (The caller is already an
  // admin/manager who may read every deal, so this is defence in depth.)
  const requested = (params.get("stage") ?? "").trim();
  const stage = (IMPORTABLE_STAGES as readonly string[]).includes(requested)
    ? requested
    : "";

  // Free text wins over the stage filter; otherwise filter by stage; otherwise
  // fall back to the most recently touched deals.
  let path: string;
  if (q.length >= 2) {
    path = `/crm/v2/Deals/search?word=${encodeURIComponent(q)}&fields=${FIELDS}&per_page=25`;
  } else if (stage) {
    path = `/crm/v2/Deals/search?criteria=${encodeURIComponent(`((Stage:equals:${stage}))`)}&fields=${FIELDS}&per_page=25`;
  } else {
    path = `/crm/v2/Deals?fields=${FIELDS}&per_page=25&sort_by=Modified_Time&sort_order=desc`;
  }

  try {
    const [res, webBase] = await Promise.all([zohoFetch(path), crmWebBase()]);
    if (res.status === 204) return NextResponse.json({ deals: [] });
    if (!res.ok) {
      const body = await res.text();
      console.error("[zoho deals]", res.status, body.slice(0, 300));
      return NextResponse.json(
        { error: "Zoho request failed.", status: res.status },
        { status: 502 },
      );
    }
    const data = await res.json();
    const apiDomain = "https://crm.zoho.com";
    const deals: ZohoDeal[] = (data?.data ?? []).map(
      (d: Record<string, unknown>) => {
        const named = (v: unknown) =>
          (v as { name?: string } | null)?.name ?? null;
        const amount = d.Amount as number | null;
        return {
          id: String(d.id),
          name: (d.Deal_Name as string) ?? null,
          stage: (d.Stage as string) ?? null,
          // Real deals often carry 0 — treat that as "no figure".
          amount: typeof amount === "number" && amount > 0 ? amount : null,
          currency: (d.Currency as string) ?? null,
          closingDate: (d.Closing_Date as string) ?? null,
          service: (d.Service_Interested_in as string) ?? null,
          account: named(d.Account_Name),
          contact: named(d.Contact_Name),
          owner: named(d.Owner),
          description: (d.Description as string) ?? null,
          quoteNumber: (d.Quote_number as string | number) ?? null,
          webUrl: webBase ? `${apiDomain}/${webBase}/${String(d.id)}` : null,
        };
      },
    );
    return NextResponse.json({ deals, stages: IMPORTABLE_STAGES });
  } catch (e) {
    console.error("[zoho deals]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Zoho is not connected." },
      { status: 503 },
    );
  }
}

/**
 * Create a NEW Zoho Deal from an estimate that didn't come from one, and
 * optionally attach its proposal PDF.
 *
 * POST /api/zoho/deals
 *   multipart/form-data: proposalId, name, stage, closingDate, accountId,
 *                        contactId?, description?, file?
 *
 * The inverse of the import flow: a hand-made quote becomes a CRM record. Care
 * taken here, in rough order of how badly each would hurt:
 *  - **No duplicate deals.** A quote already carrying a `deal_id` is refused,
 *    and the row is claimed with a compare-and-set before Zoho is called, so two
 *    concurrent requests can't both create. There is no DELETE scope — a
 *    duplicate in a ~900-deal CRM has to be cleaned up by hand.
 *  - **Stages are whitelisted** (`CREATABLE_STAGES`), same rule as the push:
 *    this app never opens a deal at a revenue stage.
 *  - **The PDF is attached only at "Proposal Sent"**, and that push is recorded,
 *    so the editor's own push button won't attach a second copy later (Zoho does
 *    not dedupe attachments).
 *  - `Amount` / `Quote_number` are NOT sent: formula and autonumber fields on
 *    this org (proven live — see docs/zoho-workflow-automation-plan.md).
 */
const CREATABLE_STAGES = [
  PUSHABLE_STAGES.discovery,
  PUSHABLE_STAGES.proposalSent,
] as const;

/** A claim older than this is assumed to be a crashed request, and stealable. */
const CLAIM_TTL_MS = 2 * 60 * 1000;

function serviceDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role is not configured.");
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(req: Request) {
  const gate = await requireZohoWriter();
  if ("error" in gate) return gate.error;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data." },
      { status: 400 },
    );
  }
  const str = (k: string) => String(form.get(k) ?? "").trim();
  const proposalId = str("proposalId");
  const name = str("name").slice(0, 255);
  const stage = str("stage");
  const closingDate = str("closingDate");
  const accountId = str("accountId");
  const contactId = str("contactId");
  const description = str("description").slice(0, 2000);
  const file = form.get("file");

  if (!proposalId || !name) {
    return NextResponse.json(
      { error: "A quote and a deal name are required." },
      { status: 400 },
    );
  }
  if (!(CREATABLE_STAGES as readonly string[]).includes(stage)) {
    return NextResponse.json(
      { error: `A new deal can't be opened at "${stage}".` },
      { status: 400 },
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(closingDate)) {
    return NextResponse.json(
      { error: "A closing date (YYYY-MM-DD) is required." },
      { status: 400 },
    );
  }
  // Zoho's Deal layout requires an Account. We deliberately do NOT create one:
  // guessing at a company in a CRM with ~4k accounts is how duplicates start.
  if (!/^\d+$/.test(accountId)) {
    return NextResponse.json(
      {
        error:
          "Link a Zoho account first — use “Find in Zoho” on the Client field.",
      },
      { status: 400 },
    );
  }
  if (contactId && !/^\d+$/.test(contactId)) {
    return NextResponse.json({ error: "Invalid contact." }, { status: 400 });
  }

  const supabase = serviceDb();
  const { data: proposal, error: readErr } = await supabase
    .from("proposals")
    .select("id, zoho")
    .eq("id", proposalId)
    .maybeSingle();
  if (readErr || !proposal) {
    console.error("[zoho create] proposal lookup failed", readErr);
    return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  }
  const zoho = (proposal.zoho ?? {}) as Record<string, unknown>;
  if (zoho.deal_id) {
    return NextResponse.json(
      { error: "This quote is already linked to a Zoho deal." },
      { status: 409 },
    );
  }

  // ── Claim the row (compare-and-set) so a double submit can't create twice ──
  const prior = typeof zoho.creating_at === "string" ? zoho.creating_at : null;
  if (prior && Date.now() - new Date(prior).getTime() < CLAIM_TTL_MS) {
    return NextResponse.json(
      { error: "A deal is already being created for this quote." },
      { status: 409 },
    );
  }
  const claimedAt = new Date().toISOString();
  const claim = supabase
    .from("proposals")
    .update({ zoho: { ...zoho, creating_at: claimedAt } })
    .eq("id", proposalId)
    .filter("zoho->>deal_id", "is", null);
  const { data: claimed, error: claimErr } = await (prior
    ? // Steal a stale claim, but only if it is still the exact one we read.
      claim.filter("zoho->>creating_at", "eq", prior)
    : claim.filter("zoho->>creating_at", "is", null)
  ).select("id");
  if (claimErr || !claimed?.length) {
    console.error("[zoho create] claim failed", claimErr);
    return NextResponse.json(
      { error: "Couldn't start creating the deal — try again in a moment." },
      { status: 409 },
    );
  }

  /** Put the row back the way we found it when Zoho refuses the create. */
  const release = async () => {
    await supabase.from("proposals").update({ zoho }).eq("id", proposalId);
  };

  // ── Create the Deal ──
  let dealId: string;
  try {
    const record: Record<string, unknown> = {
      Deal_Name: name,
      Stage: stage,
      Closing_Date: closingDate,
      Account_Name: { id: accountId },
    };
    if (contactId) record.Contact_Name = { id: contactId };
    if (description) record.Description = description;

    const res = await zohoFetch("/crm/v2/Deals", {
      method: "POST",
      body: JSON.stringify({ data: [record] }),
    });
    const body = await res.json().catch(() => null);
    const row = body?.data?.[0];
    if (!res.ok || row?.code !== "SUCCESS" || !row?.details?.id) {
      // Zoho reports per-record failures inside a 2xx envelope, and names the
      // offending field for MANDATORY_NOT_FOUND — pass that straight through,
      // since it's the only way to learn what this org's layout requires.
      const detail =
        row?.message ??
        body?.message ??
        (res.status === 401
          ? "the connection has no deal-create rights yet (Disconnect → Connect with the wider scopes)"
          : `HTTP ${res.status}`);
      console.error("[zoho create] failed", res.status, JSON.stringify(body));
      await release();
      return NextResponse.json(
        { error: `Zoho didn't create the deal: ${detail}` },
        { status: 502 },
      );
    }
    dealId = String(row.details.id);
  } catch (e) {
    console.error("[zoho create] threw", e);
    await release();
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Zoho is not connected." },
      { status: 503 },
    );
  }

  // ── Attach the PDF (only meaningful once the proposal is going out) ──
  const warnings: string[] = [];
  let attachmentUploaded = false;
  if (
    stage === PUSHABLE_STAGES.proposalSent &&
    file instanceof File &&
    file.size > 0
  ) {
    try {
      const upload = new FormData();
      upload.append("file", file, file.name || "proposal.pdf");
      const res = await zohoFetch(`/crm/v2/Deals/${dealId}/Attachments`, {
        method: "POST",
        body: upload,
      });
      const body = await res.json().catch(() => null);
      attachmentUploaded = res.ok && body?.data?.[0]?.code === "SUCCESS";
      if (!attachmentUploaded) {
        console.error(
          "[zoho create] attachment failed",
          res.status,
          JSON.stringify(body),
        );
        warnings.push("The deal was created, but the PDF couldn't be attached.");
      }
    } catch (e) {
      console.error("[zoho create] attachment threw", e);
      warnings.push("The deal was created, but the PDF couldn't be attached.");
    }
  }

  // ── Link it to the quote. The deal EXISTS now, so a failure here is a warning,
  //    never a rollback: losing the link is recoverable, a duplicate deal isn't.
  const now = new Date().toISOString();
  const webBase = await crmWebBase();
  const nextZoho: Record<string, unknown> = {
    ...zoho,
    deal_id: dealId,
    deal_name: name,
    account_id: accountId,
    contact_id: contactId || (zoho.contact_id ?? null),
    stage,
    stage_synced_at: now,
    closing_date: closingDate,
    web_url: webBase ? `https://crm.zoho.com/${webBase}/${dealId}` : null,
    created_in_zoho_at: now,
    imported_at: (zoho.imported_at as string) ?? now,
  };
  delete nextZoho.creating_at;
  if (attachmentUploaded) {
    // Zoho does not dedupe attachments, so record this as the Proposal Sent
    // push: the editor's own button must not send the same PDF again.
    nextZoho.pushes = {
      ...((zoho.pushes as Record<string, string>) ?? {}),
      [stage]: now,
    };
    nextZoho.pushed_at = now;
    nextZoho.pushed_stage = stage;
  }
  const { error: linkErr } = await supabase
    .from("proposals")
    .update({ zoho: nextZoho })
    .eq("id", proposalId);
  if (linkErr) {
    console.error("[zoho create] couldn't link the new deal", linkErr);
    warnings.push(
      `Deal ${dealId} was created in Zoho, but this quote couldn't be linked to it.`,
    );
  }

  return NextResponse.json({
    dealId,
    stage,
    attachmentUploaded,
    webUrl: nextZoho.web_url,
    warnings,
  });
}
