import "server-only";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/supabase/require-admin";
import { isZohoConfigured, zohoConfig } from "@/lib/zoho/config";
import { getConnectionMeta, zohoFetch } from "@/lib/zoho/tokens";

/**
 * What the LIVE connection can actually do — admin only, safe to run any time.
 *
 * GET /api/zoho/health
 *
 * Scopes freeze at consent and Zoho gives us no way to read them back, so
 * "does this connection have write rights?" was previously only answerable by
 * attempting a real write and seeing it fail. This probes each capability
 * instead, in a way that cannot change a record:
 *
 *  - Reads are ordinary reads (`per_page=1`).
 *  - Writes are aimed at deal id `1`, which cannot exist — Zoho ids are 18-19
 *    digits — or, for create, at an EMPTY record, which is rejected because
 *    Deal_Name and Stage are mandatory.
 *
 * Either way Zoho answers the only question that matters first: a missing scope
 * is `401 OAUTH_SCOPE_MISMATCH`, while any other error means the call got past
 * authorisation. Nothing is created, updated, or deleted.
 */

/** An id Zoho can never match: real record ids are 18-19 digits. */
const NO_SUCH_DEAL = "1";

type Verdict = "granted" | "denied" | "unknown";

type Check = {
  what: string;
  scope: string;
  verdict: Verdict;
  detail: string;
};

/** Zoho error codes that prove the request got past scope checking. */
const PAST_AUTH = [
  "MANDATORY_NOT_FOUND",
  "INVALID_DATA",
  "REQUIRED_PARAM_MISSING",
  "INVALID_URL_PATTERN",
  "RESOURCE_NOT_FOUND",
  "INVALID_REQUEST",
];

async function probe(
  what: string,
  scope: string,
  path: string,
  init?: RequestInit,
): Promise<Check> {
  try {
    const res = await zohoFetch(path, init);
    // 204 = no content, still a successful authorised read.
    if (res.ok || res.status === 204) {
      return { what, scope, verdict: "granted", detail: `HTTP ${res.status}` };
    }
    const body = await res.json().catch(() => null);
    const code: string | undefined =
      body?.code ?? body?.data?.[0]?.code ?? undefined;

    if (res.status === 401 && code === "OAUTH_SCOPE_MISMATCH") {
      return {
        what,
        scope,
        verdict: "denied",
        detail: "OAUTH_SCOPE_MISMATCH — reconnect with this scope",
      };
    }
    if (res.status === 401) {
      return {
        what,
        scope,
        verdict: "unknown",
        detail: `401 ${code ?? "unauthorised"} — the token itself may be bad`,
      };
    }
    // Anything Zoho rejected on content rather than permission means the scope
    // is there: the call reached the module.
    if (code && PAST_AUTH.includes(code)) {
      return { what, scope, verdict: "granted", detail: `reached the module (${code})` };
    }
    return {
      what,
      scope,
      verdict: "unknown",
      detail: `HTTP ${res.status}${code ? ` ${code}` : ""}`,
    };
  } catch (e) {
    return {
      what,
      scope,
      verdict: "unknown",
      detail: e instanceof Error ? e.message : "request failed",
    };
  }
}

/** Fields POST /api/zoho/deals actually writes. */
const FIELDS_WE_SEND = [
  "Deal_Name",
  "Stage",
  "Closing_Date",
  "Account_Name",
  "Contact_Name",
  "Description",
];

/**
 * What the Deals layout demands and what it offers — read-only, and only as good
 * as `settings.READ`. Returns empties rather than failing the health check.
 *
 *  - `requiredFields`: everything Zoho won't accept a Deal without, each marked
 *    with whether this app sends it. A `covered: false` row is a create that
 *    will fail with MANDATORY_NOT_FOUND until we add it.
 *  - `subforms`: custom subforms (e.g. "Packages") with their row fields — the
 *    API names needed to write product line items onto a deal.
 */
async function dealLayout(): Promise<{
  requiredFields: { apiName: string; label: string; type: string; covered: boolean }[];
  subforms: { apiName: string; label: string; rowFields: { apiName: string; label: string; type: string }[] }[];
}> {
  const empty = { requiredFields: [], subforms: [] };
  try {
    const res = await zohoFetch("/crm/v2/settings/fields?module=Deals");
    if (!res.ok) return empty;
    const data = await res.json().catch(() => null);
    const fields = (data?.fields ?? []) as Record<string, unknown>[];

    const requiredFields = fields
      .filter((f) => f.system_mandatory === true && f.read_only !== true)
      .map((f) => ({
        apiName: String(f.api_name ?? ""),
        label: String(f.field_label ?? ""),
        type: String(f.data_type ?? ""),
        covered: FIELDS_WE_SEND.includes(String(f.api_name ?? "")),
      }));

    const out = [];
    for (const f of fields) {
      if (f.data_type !== "subform") continue;
      const sub = f.subform as { module?: string } | null;
      const rowFields: { apiName: string; label: string; type: string }[] = [];
      if (sub?.module) {
        const r = await zohoFetch(
          `/crm/v2/settings/fields?module=${encodeURIComponent(sub.module)}`,
        );
        if (r.ok) {
          const rd = await r.json().catch(() => null);
          for (const rf of (rd?.fields ?? []) as Record<string, unknown>[]) {
            rowFields.push({
              apiName: String(rf.api_name ?? ""),
              label: String(rf.field_label ?? ""),
              type: String(rf.data_type ?? ""),
            });
          }
        }
      }
      out.push({
        apiName: String(f.api_name ?? ""),
        label: String(f.field_label ?? ""),
        rowFields,
      });
    }
    return { requiredFields, subforms: out };
  } catch {
    return empty;
  }
}

export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;

  const meta = await getConnectionMeta();
  if (!isZohoConfigured || !meta) {
    return NextResponse.json({
      configured: isZohoConfigured,
      connected: Boolean(meta),
      message: meta
        ? "Zoho env vars are missing."
        : "No Zoho connection — an admin needs to Connect.",
    });
  }

  // Reads first (cheap, harmless), then the three writes this app is allowed to
  // make. Sequential rather than parallel: a scope problem is usually total, and
  // there's no reason to hammer the API to find that out a second sooner.
  const checks: Check[] = [];
  checks.push(
    await probe("Read CRM records", "ZohoCRM.modules.READ", "/crm/v2/Deals?per_page=1"),
  );
  checks.push(
    await probe("Read Products", "ZohoCRM.modules.READ", "/crm/v2/Products?per_page=1"),
  );
  checks.push(
    await probe(
      "Read field metadata",
      "ZohoCRM.settings.READ",
      "/crm/v2/settings/fields?module=Deals",
    ),
  );
  // The same call already tells us the layout, so report the custom subforms
  // (e.g. "Packages") while we're here. Writing product line items onto a Deal
  // needs the subform's API name and its per-row field names, and guessing them
  // against a production CRM isn't acceptable — this is how we learn them.
  const layout = await dealLayout();
  checks.push(await probe("Read org", "ZohoCRM.org.READ", "/crm/v2/org"));
  checks.push(
    await probe("Read users", "ZohoCRM.users.READ", "/crm/v2/users?type=CurrentUser"),
  );
  checks.push(
    await probe(
      "Move a deal's stage",
      "ZohoCRM.modules.deals.UPDATE (or modules.UPDATE)",
      `/crm/v2/Deals/${NO_SUCH_DEAL}`,
      { method: "PUT", body: JSON.stringify({ data: [{ Stage: "Discovery" }] }) },
    ),
  );
  checks.push(
    await probe(
      "Create a deal",
      "ZohoCRM.modules.deals.CREATE (or modules.CREATE)",
      "/crm/v2/Deals",
      // An empty record can never be created: Deal_Name and Stage are mandatory.
      { method: "POST", body: JSON.stringify({ data: [{}] }) },
    ),
  );
  checks.push(
    await probe(
      "Attach a file to a deal",
      "ZohoCRM.modules.attachments.CREATE",
      `/crm/v2/Deals/${NO_SUCH_DEAL}/Attachments`,
      // No file body: rejected on content if the scope is present.
      { method: "POST", body: new FormData() },
    ),
  );

  const denied = checks.filter((c) => c.verdict === "denied");
  const unknown = checks.filter((c) => c.verdict === "unknown");

  return NextResponse.json({
    connected: true,
    connectedAt: meta.connected_at,
    apiDomain: meta.api_domain,
    /** What the NEXT consent would request — not what this connection holds. */
    scopesConfiguredForNextConsent: zohoConfig.scopes.split(","),
    checks,
    /** Mandatory Deals fields, and whether the create route sends each. */
    dealRequiredFields: layout.requiredFields,
    /** Custom subforms on Deals — what a Packages write would need. */
    dealSubforms: layout.subforms,
    missingRequiredFields: layout.requiredFields
      .filter((f) => !f.covered)
      .map((f) => `${f.label} (${f.apiName})`),
    ready: denied.length === 0 && unknown.length === 0,
    summary: denied.length
      ? `Missing: ${denied.map((c) => c.what).join(", ")}. An admin with Zoho edit rights needs to Disconnect → Connect.`
      : unknown.length
        ? `Couldn't confirm: ${unknown.map((c) => c.what).join(", ")}.`
        : "Every capability this app uses is granted.",
    note:
      "Probes only. Writes target a non-existent deal or an empty record, so nothing is created, updated, or deleted. coql/bulk/notifications aren't probed — the app doesn't call them yet.",
  });
}
