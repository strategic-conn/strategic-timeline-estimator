import "server-only";

import {
  clientsFromPos,
  pickPoCandidate,
  type PbsClient,
  type PbsPo,
  type PoCandidate,
} from "@/lib/pbs/clients";
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

let cache: {
  at: number;
  clients: PbsClient[];
  derivedFrom: number;
  rows: PbsPo[];
} | null = null;

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
  if (clients.length) {
    cache = { at: Date.now(), clients, derivedFrom: rows.length, rows: rows as PbsPo[] };
  }
  return { clients, derivedFrom: rows.length, cached: false };
}

/**
 * The raw PO rows behind the directory.
 *
 * Same fetch, same cache: PBS has no "get PO by name" endpoint, so finding one
 * means reading history — and history is already read to derive the client
 * list. Reading it twice would double a 500-row call and let the two views
 * disagree.
 */
export async function getPoRows(): Promise<PbsPo[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  await getPbsDirectory();
  return cache?.rows ?? [];
}

/**
 * The default billing client, resolved from its code against live PO history.
 *
 * Resolved rather than hardcoded: if the code names a client that has never had
 * a PO, there is nothing to bill against and no template to infer, so it returns
 * null and the picker simply starts empty — better than defaulting to an id that
 * would fail at create time.
 */
export async function resolveDefaultClient(): Promise<PbsClient | null> {
  const wanted = pbsConfig.defaultClient.toUpperCase();
  if (!wanted) return null;
  try {
    const { clients } = await getPbsDirectory();
    return (
      clients.find((c) => c.code.toUpperCase() === wanted) ??
      clients.find((c) => c.clientId === wanted) ??
      null
    );
  } catch {
    return null;
  }
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

/**
 * A PO already in PBS that might be this estimate's — see `pickPoCandidate`
 * for why this is a candidate and not an answer, and why nothing links on it
 * automatically. This wrapper only supplies the rows.
 */
export async function findPoCandidate(
  name: string,
  clientId: string,
): Promise<PoCandidate | null> {
  return pickPoCandidate(await getPoRows(), name, clientId);
}

/**
 * One PO, read live by its PBS id.
 *
 * This is the PBS→app direction, and unlike `pickPoCandidate` it has no
 * guesswork in it: the id was recorded when the PO was created, so the match is
 * exact. That is why status can be synced automatically while *linking* still
 * needs a human.
 *
 * Three outcomes, kept distinct on purpose:
 *   - a row      — the PO as PBS holds it right now;
 *   - `"missing"` — PBS explicitly answered "PO not found", so the app is
 *     showing a PO number that no longer exists. Worth saying out loud.
 *   - `null`      — the read failed. Unknown is not the same as gone, and
 *     treating it as gone would raise a false alarm every time PBS blinks.
 *
 * ⚠️ `po_id` is mandatory. `fetch-po` with no key answers **HTTP 200 with 200
 * arbitrary POs** (verified live) — the same shape a success takes, so a missing
 * parameter would silently yield somebody else's purchase order.
 */
export async function fetchPoById(
  poId: string | number,
): Promise<PbsPo | "missing" | null> {
  const id = String(poId).trim();
  if (!/^\d+$/.test(id)) return null;
  try {
    const res = await pbsFetch<{ po?: PbsPo }>("fetch-po", { po_id: Number(id) });
    if (res.ok) {
      const po = res.body?.data?.po;
      // A single object is the documented success shape. An array means the key
      // was ignored and PBS returned a page of unrelated POs — never trust it.
      return po && !Array.isArray(po) ? po : null;
    }
    return /not found/i.test(res.error ?? "") ? "missing" : null;
  } catch (e) {
    console.error("[pbs] fetchPoById", e);
    return null;
  }
}
