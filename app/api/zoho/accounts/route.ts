import "server-only";

import { NextResponse } from "next/server";

import { requireZohoReader } from "@/lib/zoho/guard";
import { zohoFetch } from "@/lib/zoho/tokens";

/**
 * Zoho CRM Accounts (companies) + their Contacts (people) — read-only.
 *
 * Accounts/Contacts are the *qualified* customer records (~4.0k / ~3.7k), as
 * opposed to raw Leads (~122k, mostly unqualified). One account can have many
 * contacts, so this powers a two-step picker.
 *
 *   GET /api/zoho/accounts?q=acme          -> matching companies
 *   GET /api/zoho/accounts?contactsOf=<id> -> that company's people
 *
 * If a company search finds nothing, it falls back to searching *people* and
 * returns their companies — so typing a person's name still works.
 */
const ACCOUNT_FIELDS = "Account_Name,Phone,Website,Billing_City,Owner";
const CONTACT_FIELDS = "Full_Name,Email,Phone,Title,Account_Name";

export type ZohoAccount = {
  id: string;
  name: string | null;
  phone: string | null;
  website: string | null;
  city: string | null;
  owner: string | null;
  /** Set when this company was found via one of its people, not by its own name. */
  viaContact?: string | null;
  webUrl: string | null;
};

export type ZohoContact = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  accountId: string | null;
  accountName: string | null;
};

let orgIdCache: string | null = null;
async function orgId(): Promise<string | null> {
  if (orgIdCache) return orgIdCache;
  try {
    const res = await zohoFetch("/crm/v2/org");
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    orgIdCache = data?.org?.[0]?.id ?? null;
  } catch {
    return null;
  }
  return orgIdCache;
}

const named = (v: unknown) => (v as { name?: string } | null)?.name ?? null;
const namedId = (v: unknown) => (v as { id?: string } | null)?.id ?? null;

export async function GET(req: Request) {
  const gate = await requireZohoReader();
  if ("error" in gate) return gate.error;

  const params = new URL(req.url).searchParams;
  const contactsOf = (params.get("contactsOf") ?? "").trim();
  const q = (params.get("q") ?? "").trim();

  try {
    // ── mode 1: the people at one company ──
    if (contactsOf) {
      const res = await zohoFetch(
        `/crm/v2/Accounts/${encodeURIComponent(contactsOf)}/Contacts?fields=${CONTACT_FIELDS}&per_page=50`,
      );
      if (res.status === 204) return NextResponse.json({ contacts: [] });
      if (!res.ok) {
        const body = await res.text();
        console.error("[zoho contacts]", res.status, body.slice(0, 200));
        return NextResponse.json({ error: "Zoho request failed." }, { status: 502 });
      }
      const data = await res.json();
      const contacts: ZohoContact[] = (data?.data ?? []).map(
        (x: Record<string, unknown>) => ({
          id: String(x.id),
          name: (x.Full_Name as string) ?? null,
          email: (x.Email as string) ?? null,
          phone: (x.Phone as string) ?? null,
          title: (x.Title as string) ?? null,
          accountId: namedId(x.Account_Name),
          accountName: named(x.Account_Name),
        }),
      );
      return NextResponse.json({ contacts });
    }

    // ── mode 2: find companies ──
    const org = await orgId();
    const link = (id: string, tab: "Accounts") =>
      org ? `https://crm.zoho.com/crm/org${org}/tab/${tab}/${id}` : null;

    const path =
      q.length >= 2
        ? `/crm/v2/Accounts/search?word=${encodeURIComponent(q)}&fields=${ACCOUNT_FIELDS}&per_page=25`
        : `/crm/v2/Accounts?fields=${ACCOUNT_FIELDS}&per_page=25&sort_by=Modified_Time&sort_order=desc`;

    const res = await zohoFetch(path);
    let rows: Record<string, unknown>[] = [];
    if (res.ok) rows = (await res.json())?.data ?? [];
    else if (res.status !== 204) {
      const body = await res.text();
      console.error("[zoho accounts]", res.status, body.slice(0, 200));
      return NextResponse.json({ error: "Zoho request failed." }, { status: 502 });
    }

    const accounts: ZohoAccount[] = rows.map((a) => ({
      id: String(a.id),
      name: (a.Account_Name as string) ?? null,
      phone: (a.Phone as string) ?? null,
      website: (a.Website as string) ?? null,
      city: (a.Billing_City as string) ?? null,
      owner: named(a.Owner),
      webUrl: link(String(a.id), "Accounts"),
    }));

    // Fallback: no company matched -> search people, surface their companies.
    if (!accounts.length && q.length >= 2) {
      const cres = await zohoFetch(
        `/crm/v2/Contacts/search?word=${encodeURIComponent(q)}&fields=${CONTACT_FIELDS}&per_page=25`,
      );
      if (cres.ok) {
        const cdata = await cres.json();
        const seen = new Set<string>();
        for (const x of cdata?.data ?? []) {
          const accId = namedId(x.Account_Name);
          if (!accId || seen.has(accId)) continue;
          seen.add(accId);
          accounts.push({
            id: accId,
            name: named(x.Account_Name),
            phone: (x.Phone as string) ?? null,
            website: null,
            city: null,
            owner: null,
            viaContact: (x.Full_Name as string) ?? null,
            webUrl: link(accId, "Accounts"),
          });
        }
      }
    }

    return NextResponse.json({ accounts });
  } catch (e) {
    console.error("[zoho accounts]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Zoho is not connected." },
      { status: 503 },
    );
  }
}
