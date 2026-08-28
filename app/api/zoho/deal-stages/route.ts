import "server-only";

import { NextResponse } from "next/server";

import { requireZohoReader } from "@/lib/zoho/guard";
import { getDealStages } from "@/lib/zoho/stages";

/**
 * The Deal `Stage` picklist — read-only.
 *
 * GET /api/zoho/deal-stages -> { stages: [{ value, order, forecast, probability }] }
 *
 * The read, the cache and the won-bucket rule all live in `lib/zoho/stages.ts`
 * so the stage picker offers exactly what the push route accepts.
 */
export async function GET() {
  const gate = await requireZohoReader();
  if ("error" in gate) return gate.error;

  try {
    return NextResponse.json(await getDealStages());
  } catch (e) {
    console.error("[zoho deal-stages]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Zoho is not connected." },
      { status: 503 },
    );
  }
}
