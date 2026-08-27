import "server-only";

import { clientsFromPos, type PbsClient } from "@/lib/pbs/clients";
import { pbsConfig } from "@/lib/pbs/config";
import { pbsFetch } from "@/lib/pbs/tokens";

/**
 * The PBS "directory" — clients and their project templates, both derived from
 * PO history because PBS exposes neither over the API.
 *
 * One cache shared by the picker (`/api/pbs/clients`) and PO creation, so the
 * template a PO is filed under is the same one the UI showed. Two caches would
 * eventually disagree, and the disagreement would only surface as a PO on the
 * wrong template — with no delete endpoint to fix it.
 */
const PO_SAMPLE = 500;
const TTL_MS = 10 * 60 * 1000;

let cache: { at: number; clients: PbsClient[]; derivedFrom: number } | null = null;

export async function getPbsDirectory(): Promise<{
  clients: PbsClient[];
  derivedFrom: number;
  cached: boolean;
}> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return { clients: cache.clients, derivedFrom: cache.derivedFrom, cached: true };
  }
  const res = await pbsFetch<{ po?: unknown[] }>("fetch-all-po", { limit: PO_SAMPLE });
  if (!res.ok) throw new Error(res.error ?? "PBS request failed.");

  const rows = (res.body?.data?.po ?? []) as Parameters<typeof clientsFromPos>[0];
  const clients = clientsFromPos(rows);
  // Never cache an empty list: no clients is far more likely a bad read than a
  // billing system with no customers, and caching it would hide the fault.
  if (clients.length) cache = { at: Date.now(), clients, derivedFrom: rows.length };
  return { clients, derivedFrom: rows.length, cached: false };
}

export type TemplateChoice = {
  templateId: string | null;
  /** Where the value came from, so the caller can explain itself. */
  source: "env" | "client-history" | "none";
  /** How many of that client's POs use it — the confidence behind a derivation. */
  poCount?: number;
};

/**
 * Which project template a new PO for this client should use.
 *
 * `PBS_PROJECT_TEMPLATE_ID` wins when set. Otherwise the template is taken from
 * the client's own PO history, because the live data says templates are
 * **client-scoped**: across 500 POs and nine templates, no template was shared
 * by two clients. Filing a PO under another client's template would be a
 * data-integrity problem inside the billing system, so a global default is only
 * used when someone has explicitly chosen one.
 */
export async function resolveTemplateForClient(
  clientId: string,
): Promise<TemplateChoice> {
  const override = pbsConfig.projectTemplateId.trim();
  if (override) return { templateId: override, source: "env" };

  const { clients } = await getPbsDirectory();
  const client = clients.find((c) => c.clientId === clientId);
  const templateId = client?.templates[0] ?? null;
  return templateId
    ? { templateId, source: "client-history", poCount: client?.poCount }
    : { templateId: null, source: "none" };
}
