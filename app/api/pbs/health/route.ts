import "server-only";

import { NextResponse } from "next/server";

import { isPbsConfigured, pbsConfig } from "@/lib/pbs/config";
import { pbsFetch } from "@/lib/pbs/tokens";
import { requireAdmin } from "@/lib/supabase/require-admin";

/**
 * Whether the PBS connection works, and what it can see — admin only.
 *
 * GET /api/pbs/health
 *
 * Read-only: mints a token (harmless — PBS tokens coexist and minting revokes
 * nothing) and calls the two read endpoints. Nothing is created.
 *
 * It also derives the **client list from PO history**, which is the input
 * Phase 2 needs: PBS exposes no clients endpoint, but a PO number's first three
 * letters are its client's code, so existing POs reveal every `client_id` this
 * app could file against.
 */
type PoRow = {
  po_no?: string;
  client_id?: number | string;
  project_template_id?: number | string;
  create_by?: string;
};

export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;

  if (!isPbsConfigured) {
    return NextResponse.json({
      configured: false,
      message:
        "PBS_APP_ID / PBS_APP_SECRET are not set — add them to the server environment.",
      baseUrl: pbsConfig.baseUrl,
    });
  }

  const checks: { what: string; ok: boolean; detail: string }[] = [];

  // 1. Token + app identity. A failure here is credentials or base URL.
  let app: Record<string, unknown> | null = null;
  try {
    const res = await pbsFetch<{ app_id?: string; app_name?: string; status?: number }>(
      "fetch",
    );
    app = (res.body?.data as Record<string, unknown>) ?? null;
    checks.push({
      what: "Mint a token and read the application",
      ok: res.ok,
      detail: res.ok ? `app "${app?.app_name ?? "?"}"` : (res.error ?? "failed"),
    });
  } catch (e) {
    checks.push({
      what: "Mint a token and read the application",
      ok: false,
      detail: e instanceof Error ? e.message : "request failed",
    });
    // Nothing else can work without a token.
    return NextResponse.json({
      configured: true,
      baseUrl: pbsConfig.baseUrl,
      ready: false,
      checks,
      summary: "Couldn't authenticate with PBS.",
    });
  }

  // 2. Read POs, and mine them for the client ids Phase 2 will offer.
  const clients = new Map<
    string,
    { clientId: string; code: string; poCount: number; templates: Set<string> }
  >();
  let poRead = false;
  try {
    // 500 is enough to see every client that has ever been billed; `limit` is
    // unvalidated server-side, so we bound it rather than trusting a default.
    const res = await pbsFetch<{ count?: number; po?: PoRow[] }>("fetch-all-po", {
      limit: 500,
    });
    poRead = res.ok;
    const rows = res.body?.data?.po ?? [];
    for (const r of rows) {
      const clientId = String(r.client_id ?? "");
      if (!clientId) continue;
      const code = String(r.po_no ?? "").slice(0, 3);
      const entry = clients.get(clientId) ?? {
        clientId,
        code,
        poCount: 0,
        templates: new Set<string>(),
      };
      entry.poCount += 1;
      if (r.project_template_id != null) {
        entry.templates.add(String(r.project_template_id));
      }
      clients.set(clientId, entry);
    }
    checks.push({
      what: "List purchase orders",
      ok: res.ok,
      detail: res.ok
        ? `${rows.length} read, ${clients.size} distinct client${clients.size === 1 ? "" : "s"}`
        : (res.error ?? "failed"),
    });
  } catch (e) {
    checks.push({
      what: "List purchase orders",
      ok: false,
      detail: e instanceof Error ? e.message : "request failed",
    });
  }

  const failed = checks.filter((c) => !c.ok);
  return NextResponse.json({
    configured: true,
    baseUrl: pbsConfig.baseUrl,
    app,
    ready: failed.length === 0,
    checks,
    /** Derived from PO history — PBS has no clients endpoint (see the plan). */
    clients: poRead
      ? [...clients.values()]
          .map((c) => ({ ...c, templates: [...c.templates] }))
          .sort((a, b) => b.poCount - a.poCount)
      : [],
    projectTemplateId: pbsConfig.projectTemplateId || null,
    summary: failed.length
      ? `Failing: ${failed.map((c) => c.what).join(", ")}.`
      : "PBS is reachable and readable.",
    note: "Read-only. No PO is created by this check.",
  });
}
