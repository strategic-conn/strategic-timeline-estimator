import type { ClientQuote, ProposalLineItem } from "@/types/proposal.types";

/**
 * Esther's reference: this workspace's own past work, handed to her with each
 * draft (decided 2026-11-21). Claude is not trained on it — the app picks the
 * relevant history every time and puts it in the prompt, so the more approved
 * estimates and finished tasks there are, the more consistent her drafts get.
 *
 * Two kinds, worth different things:
 *  - APPROVED estimates on the same platform = how this agency quotes. Only
 *    approved ones (not draft / sent / rejected): an unagreed quote isn't a
 *    reference.
 *  - FINISHED tasks with logged time = how long the work really took. Per
 *    catalog task: the typical actual ÷ estimate. This is what lets Esther
 *    resize a catalog task (`allowedAdjustment`), and only within bounds.
 *
 * Client names never leave: every title and line is scrubbed of the client's
 * name, Zoho company and contact, and any web address before it is rendered.
 * Pure — `e2e/esther-history.spec.ts`.
 */

export type HistoryQuote = Pick<
  ClientQuote,
  "id" | "title" | "client_name" | "line_items" | "zoho" | "context" | "updated_at"
>;

export type HistoryTask = {
  source_line_item_id: string;
  estimated_hours: number | null;
  logged_hours: number | null;
};

/** What the draft is allowed to learn from one catalog task's finished work. */
export type CatalogActual = { samples: number; ratio: number; estimated: number; actual: number };

export type EstherHistory = {
  /** The estimates shown to Esther (ids, for the "Based on" links). */
  used: string[];
  /** catalog id → typical actual ÷ estimate over finished tasks. */
  actuals: Record<number, CatalogActual>;
  /** The prompt section, or "" when there's no history yet. */
  prompt: string;
  /** How many uploaded past estimates (esther_references) were shown too. */
  references?: number;
};

const MAX_EXAMPLES = 5;
const MAX_LINES_PER_EXAMPLE = 40;
const MAX_CUSTOM_ACTUALS = 15;

// ── Removing client names ────────────────────────────────────────────────

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Every name that identifies this quote's client, longest first. The estimate
 * title and deal name are on it because in practice they ARE the client
 * ("Willow School", "Granite Law") — which is also why past titles are never
 * sent at all (`historyFor` numbers them instead).
 */
function clientNames(q: HistoryQuote): string[] {
  const names = [q.client_name, q.zoho?.account, q.zoho?.contact, q.zoho?.deal_name, q.title]
    .map((n) => (n ?? "").trim())
    .filter((n) => n.length >= 2);
  // "Sunrise Bakery LLC" also appears as "Sunrise Bakery".
  const extra = names.map((n) => n.replace(/[,.]?\s+(inc|llc|ltd|co|corp|corporation|company|group)\.?$/i, "").trim());
  return [...new Set([...names, ...extra])].filter((n) => n.length >= 2).sort((a, b) => b.length - a.length);
}

/** Removes the client's names (whole words only), emails, web addresses and phone numbers. */
export function anonymize(text: string, names: string[]): string {
  let out = text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .replace(/\bhttps?:\/\/\S+|\bwww\.\S+|\b[\w-]+\.(com|net|org|io|co|us|ca|uk|au)(\/\S*)?\b/gi, "[website]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone]");
  for (const n of names) {
    out = out.replace(new RegExp(`(?<![A-Za-z0-9])${escape(n)}(?![A-Za-z0-9])`, "gi"), "[client]");
  }
  return out.replace(/\s+/g, " ").trim();
}

// ── Picking similar estimates ────────────────────────────────────────────

const STOP = new Set(
  "the and for with from that this will our your their have has are was were page pages site website web new add per each into all any can not one two its other more than also".split(
    " ",
  ),
);
const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w))
      .map((w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w)),
  );

const quoteText = (q: HistoryQuote) =>
  q.line_items.map((li) => `${li.title} ${li.module ?? ""}`).join(" ");

/**
 * The past estimates closest to the new brief: shared words between its
 * requirements and each estimate's lines, rarer words counting more. Ties and
 * no-overlap fall back to the most recent, so Esther always sees how the
 * agency quotes lately.
 */
export function pickSimilar(quotes: HistoryQuote[], briefText: string, k = MAX_EXAMPLES): HistoryQuote[] {
  return rankByWords(quotes, quoteText, (q) => q.updated_at, briefText, k);
}

/** The k items sharing the most (rarity-weighted) words with the brief; ties → newest. */
export function rankByWords<T>(
  items: T[],
  text: (item: T) => string,
  date: (item: T) => string,
  briefText: string,
  k: number,
): T[] {
  const brief = words(briefText);
  const docs = items.map((q) => ({ q, w: words(text(q)) }));
  const df = new Map<string, number>();
  for (const d of docs) for (const w of d.w) df.set(w, (df.get(w) ?? 0) + 1);
  const scored = docs.map(({ q, w }) => {
    let score = 0;
    for (const t of brief) if (w.has(t)) score += Math.log(1 + docs.length / (df.get(t) ?? 1));
    return { q, score };
  });
  return scored
    .sort((a, b) => b.score - a.score || date(b.q).localeCompare(date(a.q)))
    .slice(0, k)
    .map((s) => s.q);
}

// ── Estimated vs actual ──────────────────────────────────────────────────

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Finished tasks → per catalog task, the typical actual ÷ estimate; plus custom examples. */
export function actualsFrom(
  quotes: HistoryQuote[],
  tasks: HistoryTask[],
): { catalog: Record<number, CatalogActual>; custom: { title: string; estimated: number; actual: number }[] } {
  const lineOf = new Map<string, { line: ProposalLineItem; names: string[] }>();
  for (const q of quotes) {
    const names = clientNames(q);
    for (const li of q.line_items) lineOf.set(li.id, { line: li, names });
  }
  const byCatalog = new Map<number, { ratios: number[]; est: number[]; act: number[] }>();
  const custom: { title: string; estimated: number; actual: number }[] = [];
  for (const t of tasks) {
    const hit = lineOf.get(t.source_line_item_id);
    const est = Number(t.estimated_hours);
    const act = Number(t.logged_hours);
    if (!hit || !(est > 0) || !(act > 0)) continue;
    const { line, names } = hit;
    if (line.catalog_id != null) {
      const e = byCatalog.get(line.catalog_id) ?? { ratios: [], est: [], act: [] };
      e.ratios.push(act / est);
      e.est.push(est);
      e.act.push(act);
      byCatalog.set(line.catalog_id, e);
    } else if (custom.length < MAX_CUSTOM_ACTUALS) {
      custom.push({ title: anonymize(line.title, names), estimated: round1(est), actual: round1(act) });
    }
  }
  const catalog: Record<number, CatalogActual> = {};
  for (const [id, e] of byCatalog) {
    catalog[id] = {
      samples: e.ratios.length,
      ratio: Math.round(median(e.ratios) * 100) / 100,
      estimated: round1(median(e.est)),
      actual: round1(median(e.act)),
    };
  }
  return { catalog, custom };
}

/**
 * How far a draft may move a catalog task's hours: only with finished work
 * behind it, only toward what that work showed, and never past 0.5×–3× the
 * catalog. Returns the base hours to use (the catalog's when not allowed).
 */
export function allowedAdjustment(
  catalogHours: number,
  proposed: number | null,
  actual: CatalogActual | undefined,
): number {
  if (proposed == null || !actual || !Number.isFinite(proposed)) return catalogHours;
  // Between the catalog's hours and what history showed — never beyond either.
  const shown = catalogHours * actual.ratio;
  const lo = Math.max(catalogHours * 0.5, Math.min(catalogHours, shown));
  const hi = Math.min(catalogHours * 3, Math.max(catalogHours, shown));
  return Math.round(Math.min(hi, Math.max(lo, proposed)) * 2) / 2;
}

// ── The prompt section ───────────────────────────────────────────────────

export function historyFor(
  quotes: HistoryQuote[],
  tasks: HistoryTask[],
  briefText: string,
  catalogName: (id: number) => string | null,
): EstherHistory {
  const examples = pickSimilar(quotes, briefText);
  const { catalog, custom } = actualsFrom(quotes, tasks);
  if (!examples.length && !Object.keys(catalog).length && !custom.length) {
    return { used: [], actuals: {}, prompt: "" };
  }

  const parts: string[] = [];
  if (examples.length) {
    const blocks = examples.map((q, i) => {
      const names = clientNames(q);
      const lines = q.line_items
        .filter((li) => li.title.trim())
        .slice(0, MAX_LINES_PER_EXAMPLE)
        .map((li) => {
          const what = li.catalog_id != null ? `catalog ${li.catalog_id}` : "custom";
          return `  - ${anonymize(li.title, names)} (${what}) · ${li.base_hours} h × ${li.quantity} · ${li.tier}${li.responsible ? ` · ${li.responsible}` : ""}`;
        });
      const total = q.line_items.reduce((s, li) => s + (Number(li.hours) || 0), 0);
      // Numbered, never titled: a title is usually the client's name.
      return `Past estimate ${i + 1} — ${lines.length} lines, ${Math.round(total)} h\n${lines.join("\n")}`;
    });
    parts.push(
      `How this agency has quoted similar work (approved estimates, client names removed). Use them for consistency — the same kinds of tasks, quantities and tiers for the same kinds of requests — but only for work the new client actually asks for:\n\n${blocks.join("\n\n")}`,
    );
  }

  const cat = Object.entries(catalog).sort((a, b) => b[1].samples - a[1].samples);
  if (cat.length || custom.length) {
    const rows = [
      ...cat.map(
        ([id, a]) =>
          `- catalog ${id} "${catalogName(Number(id)) ?? "task"}": estimated ${a.estimated} h → took ${a.actual} h (typically ×${a.ratio}, ${a.samples} finished task${a.samples === 1 ? "" : "s"})`,
      ),
      ...custom.map((c) => `- custom "${c.title}": estimated ${c.estimated} h → took ${c.actual} h`),
    ];
    parts.push(
      `How long work really took on finished tasks (logged time vs the estimate):\n${rows.join("\n")}\n\nWhen a catalog task you use appears here, set adjusted_hours to the per-unit hours that history supports (catalog hours × the typical ratio; trust it more with more finished tasks) and say so in the note. Size similar custom work from these results too.`,
    );
  }

  return { used: examples.map((q) => q.id), actuals: catalog, prompt: parts.join("\n\n") };
}
