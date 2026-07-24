import "server-only";

import { NextResponse } from "next/server";

import { requireAdmin, serverError } from "@/lib/supabase/require-admin";
import { zohoFetch } from "@/lib/zoho/tokens";

/**
 * Proof-of-connection: fetches the connected Zoho org (exercises the refresh +
 * API path end to end). Admin-only. A 200 here means the integration works.
 */
export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;

  try {
    const res = await zohoFetch("/crm/v2/org");
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json(
        { error: "Zoho API error", status: res.status, data },
        { status: 502 },
      );
    }
    return NextResponse.json({ org: data?.org?.[0] ?? data });
  } catch (e) {
    return serverError("zoho org", e, 502);
  }
}
