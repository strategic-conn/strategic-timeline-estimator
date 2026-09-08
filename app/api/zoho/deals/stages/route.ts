import "server-only";

import { NextResponse } from "next/server";

import { resolvePackagesLayout } from "@/lib/zoho/deal-estimate-sync";
import { requireZohoReader } from "@/lib/zoho/guard";
import { zohoFetch } from "@/lib/zoho/tokens";

/**
 * Current state of a set of linked Deals — read-only. This is the app's whole
 * Zoho→app direction: there is no webhook, so the badge, the stored CRM amount
 * and the send dialog's "what's on the deal right now" all come from here.
 *
 * GET /api/zoho/deals/stages?ids=<id>,<id>,…
 *   → { stages:      { "<dealId>": "Discovery" | null },
 *       amounts:     { "<dealId>": 20000 | null },
 *       packageRows: { "<dealId>": 2 | null },   // null = couldn't determine
 *       checkedAt: ISO }
 *
 * `Amount` is read but never written — Zoho recomputes it from the Packages
 * subform, so the row count travels with it: together they say whether a send
 * would be replacing someone else's numbers or filling an empty table.
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
    return NextResponse.json({
      stages: {},
      amounts: {},
      packageRows: {},
      checkedAt: new Date().toISOString(),
    });
  }

  const stages: Record<string, string | null> = {};
  const amounts: Record<string, number | null> = {};
  // `null` = the subform couldn't be resolved, so the row count is UNKNOWN.
  // Reporting 0 there would tell the send dialog "nothing to replace" and it
  // would drop the warning before an irreversible subform overwrite.
  const packageRows: Record<string, number | null> = {};
  // Cached per server instance, so this is a metadata call once and free after.
  // Null (no resolvable subform) just means the row count is unknown, which the
  // callers already treat as "don't claim anything about existing rows".
  const layout = await resolvePackagesLayout();
  const fields = ["Stage", "Amount", layout?.apiName].filter(Boolean).join(",");
  try {
    for (let i = 0; i < ids.length; i += BATCH) {
      await Promise.all(
        ids.slice(i, i + BATCH).map(async (id) => {
          const res = await zohoFetch(
            `/crm/v2/Deals/${id}?fields=${encodeURIComponent(fields)}`,
          );
          if (!res.ok) {
            // A deleted or inaccessible deal shouldn't fail the whole batch.
            stages[id] = null;
            amounts[id] = null;
            packageRows[id] = null;
            return;
          }
          const rec = (await res.json().catch(() => null))?.data?.[0] ?? {};
          stages[id] = (rec.Stage as string) ?? null;
          amounts[id] = typeof rec.Amount === "number" ? rec.Amount : null;
          if (!layout) {
            packageRows[id] = null;
          } else {
            const rows = rec[layout.apiName];
            packageRows[id] = Array.isArray(rows) ? rows.length : 0;
          }
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

  return NextResponse.json({
    stages,
    amounts,
    packageRows,
    checkedAt: new Date().toISOString(),
  });
}
