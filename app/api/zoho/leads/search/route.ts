import "server-only";

import { NextResponse } from "next/server";

import { requireZohoReader } from "@/lib/zoho/guard";
import { zohoFetch } from "@/lib/zoho/tokens";

/**
 * Search Zoho CRM leads — read-only, nothing stored locally.
 *
 * Uses Zoho's `word` search: one query matches across name, company and phone
 * (verified: "Chapman", "Myrtle", "843-918-6023" and the partial "Chap" all hit).
 * `criteria` was rejected for `contains`, so `word` is the right primitive for a
 * single search box.
 *
 * GET /api/zoho/leads/search?q=chapman
 */
const FIELDS = [
  "Full_Name",
  "Company",
  "Phone",
  "Email",
  "Lead_Status",
  "Lead_Source",
  "Created_Time",
].join(",");

export type ZohoLead = {
  id: string;
  name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  status: string | null;
  source: string | null;
  createdAt: string | null;
};

export async function GET(req: Request) {
  const gate = await requireZohoReader();
  if ("error" in gate) return gate.error;

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  // Zoho requires 2+ chars; below that a search returns everything/nothing useful.
  if (q.length < 2) {
    return NextResponse.json({ leads: [], message: "Type at least 2 characters." });
  }

  try {
    const res = await zohoFetch(
      `/crm/v2/Leads/search?word=${encodeURIComponent(q)}&fields=${FIELDS}&per_page=25`,
    );
    // Zoho answers 204 (no body) when nothing matches.
    if (res.status === 204) return NextResponse.json({ leads: [] });
    if (!res.ok) {
      const body = await res.text();
      console.error("[zoho leads search]", res.status, body.slice(0, 300));
      return NextResponse.json(
        { error: "Zoho search failed.", status: res.status },
        { status: 502 },
      );
    }
    const data = await res.json();
    const leads: ZohoLead[] = (data?.data ?? []).map(
      (l: Record<string, unknown>) => ({
        id: String(l.id),
        name: (l.Full_Name as string) ?? null,
        company: (l.Company as string) ?? null,
        phone: (l.Phone as string) ?? null,
        email: (l.Email as string) ?? null,
        status: (l.Lead_Status as string) ?? null,
        source: (l.Lead_Source as string) ?? null,
        createdAt: (l.Created_Time as string) ?? null,
      }),
    );
    return NextResponse.json({ leads });
  } catch (e) {
    // Thrown when there's no Zoho connection at all.
    console.error("[zoho leads search]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Zoho is not connected." },
      { status: 503 },
    );
  }
}
