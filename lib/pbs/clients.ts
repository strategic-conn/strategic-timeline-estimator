/**
 * The PBS client list — derived, because PBS has no clients endpoint.
 *
 * Probed on 2026-08-26: `/api/clients`, `/api/fetch-clients`, `/api/client-list`
 * and six variants all return 404 "Endpoint not found." What PBS *does* expose
 * is purchase orders, and a PO number's first three characters are the client's
 * code (the API builds `MBA000001` from `client_code` MBA). So every client this
 * app could file a PO against is visible in PO history.
 *
 * That makes the derivation a stopgap with a clean upgrade path: if PBS ever
 * adds a real clients endpoint, only the source changes — the shape the picker
 * consumes stays the same.
 */
export type PbsClient = {
  /** Numeric PBS client id — what `create-po` needs. */
  clientId: string;
  /** Three-letter client code, taken from the PO prefix. */
  code: string;
  /** How many POs carry this client, i.e. how confident the derivation is. */
  poCount: number;
  /** Project templates seen on this client's POs, newest usage first. */
  templates: string[];
};

type PoRow = {
  po_no?: string | null;
  client_id?: number | string | null;
  project_template_id?: number | string | null;
};

/**
 * Fold PO rows into one entry per client.
 *
 * A client's code is taken from its most common prefix rather than the first
 * one seen: a single mis-keyed PO number shouldn't rename a client.
 */
export function clientsFromPos(rows: PoRow[]): PbsClient[] {
  const acc = new Map<
    string,
    { prefixes: Map<string, number>; templates: Map<string, number>; poCount: number }
  >();

  for (const row of rows) {
    const clientId = String(row.client_id ?? "").trim();
    // Only numeric ids are usable as a `create-po` target.
    if (!/^\d+$/.test(clientId)) continue;
    const entry = acc.get(clientId) ?? {
      prefixes: new Map<string, number>(),
      templates: new Map<string, number>(),
      poCount: 0,
    };
    entry.poCount += 1;

    const prefix = String(row.po_no ?? "")
      .trim()
      .slice(0, 3)
      .toUpperCase();
    if (/^[A-Z]{3}$/.test(prefix)) {
      entry.prefixes.set(prefix, (entry.prefixes.get(prefix) ?? 0) + 1);
    }
    const template = String(row.project_template_id ?? "").trim();
    if (/^\d+$/.test(template)) {
      entry.templates.set(template, (entry.templates.get(template) ?? 0) + 1);
    }
    acc.set(clientId, entry);
  }

  const byCount = (a: [string, number], b: [string, number]) => b[1] - a[1];
  return [...acc.entries()]
    .map(([clientId, e]) => ({
      clientId,
      code: [...e.prefixes.entries()].sort(byCount)[0]?.[0] ?? "",
      poCount: e.poCount,
      templates: [...e.templates.entries()].sort(byCount).map(([t]) => t),
    }))
    // Busiest client first: the one someone is most likely to want.
    .sort((a, b) => b.poCount - a.poCount || a.code.localeCompare(b.code));
}
