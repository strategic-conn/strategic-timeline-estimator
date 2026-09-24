/**
 * Re-point existing quote lines at their catalog row's CURRENT category.
 *
 *   node scripts/remap-catalog-categories.mjs          # dry run: prints the plan
 *   node scripts/remap-catalog-categories.mjs --apply  # writes it
 *
 * Run after scripts/build-catalog.mjs. Catalog v3 did not just renumber the
 * categories — it RE-CLASSIFIED tasks (every old "Design" task is now
 * "Frontend"; old "Integration" split five ways), so an old→new id table by
 * name would be wrong. Each line is remapped through its own `catalog_id` on
 * its quote's platform instead. Without this, a line saved with old id 1
 * (Frontend) would print as "Accessibility" on the PDF and Excel export.
 *
 * Touches ONLY `category_id` on lines that have a `catalog_id`. Freehand and
 * guided lines, hours, prices and titles are left exactly as they were.
 *
 * ⚠️ `proposals` is one JSONB document, so writing `line_items` replaces the
 * whole array. Each write is conditional on the row's `updated_at` being what
 * was read: a quote someone saved in the meantime is SKIPPED and reported, not
 * overwritten. Re-run to pick it up. `updated_at` itself is not sent, so the
 * Estimator list does not reshuffle and no PDF looks "edited".
 */
import { readFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

const catalog = JSON.parse(readFileSync("lib/proposal-catalog/catalog.json", "utf8"));
const catName = new Map(catalog.categories.map((c) => [c.id, c.name]));

const res = await fetch(
  `${URL_}/rest/v1/proposals?select=id,title,platform,updated_at,line_items`,
  { headers: H },
);
const quotes = await res.json();

let planned = 0;
let written = 0;
let skipped = 0;
for (const q of quotes) {
  const rows = catalog.platforms[q.platform];
  if (!rows || !Array.isArray(q.line_items)) continue;
  const byId = new Map(rows.map((r) => [r.id, r]));

  let changed = 0;
  const next = q.line_items.map((li) => {
    if (li.catalog_id == null) return li;
    const row = byId.get(Number(li.catalog_id));
    if (!row) {
      console.warn(`warn  "${q.title}": catalog_id ${li.catalog_id} not in the ${q.platform} catalog — left alone`);
      return li;
    }
    if (row.category_id === li.category_id) return li;
    changed += 1;
    console.log(
      `  "${q.title}" · ${li.title}: ${li.category_id ?? "none"} -> ${row.category_id} (${catName.get(row.category_id) ?? "?"})`,
    );
    return { ...li, category_id: row.category_id };
  });
  if (!changed) continue;
  planned += changed;
  if (!APPLY) continue;

  const w = await fetch(
    `${URL_}/rest/v1/proposals?id=eq.${q.id}&updated_at=eq.${encodeURIComponent(q.updated_at)}`,
    {
      method: "PATCH",
      headers: { ...H, Prefer: "return=representation" },
      body: JSON.stringify({ line_items: next }),
    },
  );
  const out = await w.json();
  if (w.ok && Array.isArray(out) && out.length === 1) written += changed;
  else {
    skipped += 1;
    console.warn(`skip  "${q.title}" changed while remapping — re-run to pick it up`);
  }
}

console.log(
  APPLY
    ? `\n${written} line(s) remapped${skipped ? `, ${skipped} quote(s) skipped` : ""}.`
    : `\n${planned} line(s) would change. Re-run with --apply to write.`,
);
