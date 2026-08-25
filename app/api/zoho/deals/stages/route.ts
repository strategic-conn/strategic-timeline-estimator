import "server-only";

import { NextResponse } from "next/server";

import { requireZohoReader } from "@/lib/zoho/guard";
import { zohoFetch } from "@/lib/zoho/tokens";

/**
 * Current Stage for a set of linked Deals — read-only, used to refresh the CRM
 * stage badge when an estimate (or the Estimator list) is opened.
 *
 * GET /api/zoho/deals/stages?ids=<id>,<id>,…
 *   → { stages: { "<dealId>": "Discovery" | null }, checkedAt: ISO }
 *
 * Zoho has no "get these N records by id" endpoint on the scopes this app holds:
 * `criteria` doesn't support `id`, and COQL (`/crm/v3/coql`, which does) would
 * need `ZohoCRM.coql.READ` — a new scope means Disconnect → Connect on a live
 * connection. So it fans out over the single-record GET, in small batches to
 * stay well inside Zoho's concurrency limits.
 *
 * ponytail: N single GETs, capped at MAX_IDS. Switch to one COQL query if a
 * workspace ever links enough deals for this to matter — that's a scope change.
 */
const MAX_IDS = 25;
const BATCH = 5;

export async function GET(req: Request) {
  const gate = await requireZohoReader();
  if ("error" in gate) return gate.error;

  const ids = [
    ...new Set(
      (new URL(req.url).searchParams.get("ids") ?? "")
        .split(",")
        .map((s) => s.trim())
        // Zoho record ids are numeric strings; reject anything else rather than
        // interpolating it into a request path.
        .filter((s) => /^\d+$/.test(s)),
    ),
  ].slice(0, MAX_IDS);

  if (!ids.length) {
    return NextResponse.json({ stages: {}, checkedAt: new Date().toISOString() });
  }

  const stages: Record<string, string | null> = {};
  try {
    for (let i = 0; i < ids.length; i += BATCH) {
      await Promise.all(
        ids.slice(i, i + BATCH).map(async (id) => {
          const res = await zohoFetch(`/crm/v2/Deals/${id}?fields=Stage`);
          if (!res.ok) {
            // A deleted or inaccessible deal shouldn't fail the whole batch.
            stages[id] = null;
            return;
          }
          const body = await res.json().catch(() => null);
          stages[id] = (body?.data?.[0]?.Stage as string) ?? null;
        }),
      );
    }
  } catch (e) {
    console.error("[zoho stages]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Zoho is not connected." },
      { status: 503 },
    );
  }

  return NextResponse.json({ stages, checkedAt: new Date().toISOString() });
}
