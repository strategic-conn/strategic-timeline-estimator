import "server-only";

import { stageIsWon, type ZohoStageInfo } from "@/lib/zoho/push-state";
import { zohoFetch } from "@/lib/zoho/tokens";

/**
 * The Deal `Stage` picklist, read from the org and cached.
 *
 * Stage names are org configuration, not something this app can hardcode: the
 * pipeline gains and renames stages without telling us, and every guess we've
 * made about this CRM so far (the base path, the Bearer header, a custom field's
 * API name) has been wrong at least once. This module is the single reader, so
 * the stage picker offers exactly the stages the push route will accept — two
 * lists would eventually disagree, and the symptom would be a 400 on a stage the
 * UI just showed.
 *
 * Covered by `ZohoCRM.settings.READ`, already granted.
 */
export type ZohoStage = ZohoStageInfo;

let cache: { at: number; stages: ZohoStage[] } | null = null;
const TTL_MS = 30 * 60 * 1000;

export async function getDealStages(): Promise<{
  stages: ZohoStage[];
  cached: boolean;
}> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return { stages: cache.stages, cached: true };
  }

  const res = await zohoFetch("/crm/v2/settings/fields?module=Deals");
  if (!res.ok) {
    throw new Error(`Couldn't read the Deals layout (HTTP ${res.status}).`);
  }
  const data = await res.json().catch(() => null);
  const fields = (data?.fields ?? []) as Record<string, unknown>[];
  const stageField = fields.find((f) => f.api_name === "Stage");
  const values = (stageField?.pick_list_values ?? []) as Record<string, unknown>[];

  const stages: ZohoStage[] = values
    .map((v) => ({
      value: String(v.display_value ?? v.actual_value ?? ""),
      order: Number(v.sequence_number ?? -1),
      // `forecast_type` is the READABLE bucket ("Closed Won" / "Closed Lost" /
      // "Open"). `forecast_category` looks like the right field and is not — it
      // is an opaque id ("3805132000000006789"), so matching on it silently
      // classified every stage as not-won, which would have refused billing on
      // deals that were genuinely won. Verified against the live picklist.
      forecast:
        (v.forecast_type as string | undefined) ??
        ((v.record_category_value as { api_name?: string } | undefined)?.api_name ??
          null),
      probability: typeof v.probability === "number" ? v.probability : null,
    }))
    .filter((s) => s.value)
    .sort((a, b) => a.order - b.order);

  // Don't cache an empty answer — more likely a bad read than a pipeline with no
  // stages, and caching it would hide the fault for half an hour.
  if (stages.length) cache = { at: Date.now(), stages };
  return { stages, cached: false };
}

/**
 * Is this a stage the org actually has?
 *
 * The trust boundary for every stage write: the client may send any string, and
 * a typo'd stage is rejected by Zoho anyway — but this keeps a crafted request
 * from reaching the CRM at all, and gives a readable error instead of a 502.
 *
 * Fails OPEN when the picklist can't be read: a settings outage shouldn't block
 * a legitimate stage move that Zoho itself would validate.
 */
export async function isKnownStage(stage: string): Promise<boolean> {
  try {
    const { stages } = await getDealStages();
    return stages.length === 0 || stages.some((s) => s.value === stage);
  } catch {
    return true;
  }
}

/**
 * Has this deal been won? Answered by Zoho's own forecast bucket, not by name.
 *
 * Both "Closed Won" and "Project Completed" sit in the won bucket in this org.
 * Gating strictly on the name "Closed Won" would strand a deal that jumped
 * straight to Project Completed — it can never go back, so its PO could never
 * be created. A delivered deal is certainly billable.
 */
export async function isWonStage(stage: string | null | undefined): Promise<boolean> {
  let stages: ZohoStage[] = [];
  try {
    ({ stages } = await getDealStages());
  } catch {
    // Fall through to the name check — better than blocking billing on a
    // settings read, and the fallback names are this org's actual won stages.
  }
  return stageIsWon(stage, stages);
}
