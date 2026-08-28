import "server-only";

import { NextResponse } from "next/server";

import { isPbsConfigured, pbsConfig } from "@/lib/pbs/config";
import { getPbsDirectory, resolveDefaultClient } from "@/lib/pbs/directory";
import { requirePbsReader } from "@/lib/pbs/guard";

/**
 * The PBS clients an estimate can be billed to — read-only.
 *
 * GET /api/pbs/clients   → { clients: PbsClient[], derivedFrom: number }
 *
 * Derived from PO history because PBS exposes no clients endpoint (see
 * `lib/pbs/clients.ts`). The read and its cache live in `lib/pbs/directory.ts`
 * so that PO creation resolves a client's template from exactly the same data
 * this picker showed — two caches would eventually disagree, and the only
 * symptom would be a PO on the wrong template.
 */

export async function GET() {
  const gate = await requirePbsReader();
  if ("error" in gate) return gate.error;

  if (!isPbsConfigured) {
    return NextResponse.json(
      { error: "PBS isn't configured on the server." },
      { status: 503 },
    );
  }

  try {
    return NextResponse.json({
      ...(await getPbsDirectory()),
      /** Used when an estimate has no billing client of its own. */
      defaultClient: await resolveDefaultClient(),
      // When set, this overrides every client's own template server-side — the
      // UI has to know, or its confirmation would name the wrong one.
      templateOverride: pbsConfig.projectTemplateId.trim() || null,
    });
  } catch (e) {
    console.error("[pbs clients]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "PBS is unreachable." },
      { status: 503 },
    );
  }
}
