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

/** A PO as PBS returns it. Field names verified live against `fetch-all-po`. */
export type PbsPo = {
  id?: number | string | null;
  po_no?: string | null;
  name?: string | null;
  client_id?: number | string | null;
  project_template_id?: number | string | null;
  status?: string | null;
  create_date?: string | null;
  create_by?: string | null;
  update_date?: string | null;
  /** Set once the PO is attached to a project in PBS. */
  project_id?: number | string | null;
};

export type PoCandidate = {
  po_id: string | null;
  po_no: string;
  name: string;
  client_id: string | null;
  project_template_id: string | null;
  create_date: string | null;
  create_by: string | null;
  /** How many POs matched. >1 means the name is ambiguous even for one client. */
  matchCount: number;
};

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * A PO in `rows` that might be the one this app created for `name` under
 * `clientId` — a **candidate**, never an identity.
 *
 * PBS has no get-by-name, so the only thing to match on is the `name` this app
 * sets at create time, and a name is not an identifier:
 *
 *  - two estimates can share a title ("Website Redesign") for different
 *    clients, so name alone can point at another customer's PO — hence the
 *    client match is required, not optional;
 *  - a repeat client can have the same job name twice a year, so name **and**
 *    client can still point at last year's PO. Nothing here closes that, which
 *    is why callers must not link on this automatically. `matchCount` is
 *    reported so an ambiguous name is visible rather than silently resolved.
 *
 * Pure, and separated from the fetch for exactly that reason: this is the
 * decision that could bill work against the wrong purchase order.
 */
export function pickPoCandidate(
  rows: PbsPo[],
  name: string,
  clientId: string,
): PoCandidate | null {
  const wanted = norm(name);
  // An empty name would match every unnamed PO; a non-numeric client id can't
  // be a real PBS client and would make the client check vacuous.
  if (!wanted || !/^\d+$/.test(String(clientId))) return null;

  const matches = rows
    .filter(
      (r) =>
        norm(String(r.name ?? "")) === wanted &&
        String(r.client_id ?? "") === String(clientId) &&
        String(r.po_no ?? "").trim(),
    )
    // Newest first, made explicit rather than trusting PBS's ordering.
    .sort((a, b) =>
      String(b.create_date ?? "").localeCompare(String(a.create_date ?? "")),
    );

  const top = matches[0];
  if (!top) return null;
  return {
    po_id: top.id != null ? String(top.id) : null,
    po_no: String(top.po_no).trim(),
    name: String(top.name ?? ""),
    client_id: top.client_id != null ? String(top.client_id) : null,
    project_template_id:
      top.project_template_id != null ? String(top.project_template_id) : null,
    create_date: top.create_date ?? null,
    create_by: top.create_by ?? null,
    matchCount: matches.length,
  };
}

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
