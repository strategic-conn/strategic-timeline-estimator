import "server-only";

import { NextResponse } from "next/server";

import { requireZohoReader } from "@/lib/zoho/guard";
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
  const stage = (params.get("stage") ?? "").trim();

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
