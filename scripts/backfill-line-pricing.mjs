/**
 * ONE-SHOT: make every pre-Phase-3 quote's pricing explicit.
 *
 *   node scripts/backfill-line-pricing.mjs          # dry run
 *   node scripts/backfill-line-pricing.mjs --apply  # writes
 *
 * Before pricing Phase 3 every line was priced at $100/h and carried no role.
 * The app already reads a missing rate as LEGACY_HOURLY_RATE, so prices are
 * identical with or without this — it exists so the DATA says what each line
 * was priced at, and so "Update to current rates" knows each legacy line's role.
 *
 * Per line, only when missing:
 *   rate                 -> 100 (the legacy rate — the price does not move)
 *   responsible + level  -> catalog row (by catalog_id on the quote's platform)
 *                           -> guided phase (by module label) -> IT Level 1
 * Per quote, only when missing: addons.rates -> 100 for every add-on.
 *
 * ⚠️ The phase map below duplicates PHASE_ROLE in lib/pricing/line-pricing.ts
 * because this runs outside the TS build. The first run (2026-09-24) was
 * verified against the real `defaultRoleFor` and `quotePricing`: every assigned
 * role matched, and every live quote's price was identical before and after.
 *
 * Same safety rules as remap-catalog-categories.mjs: each write is conditional
 * on the `updated_at` that was read (a quote saved meanwhile is SKIPPED), and
 * `updated_at` itself is never sent.
 */
import { readFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const LEGACY = 100;
const PHASE_ROLE = {
  "Discovery & Strategy": ["Project Manager", 1],
  "Content & Copy": ["Creative", 1],
  "Design & UX": ["Creative", 1],
  Development: ["IT", 1],
  "QA & Testing": ["QA Tester", 1],
  "SEO Setup": ["IT", 1],
  "Launch & Handoff": ["IT", 1],
};

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const catalog = JSON.parse(readFileSync("lib/proposal-catalog/catalog.json", "utf8"));

function roleFor(li, platform) {
  const row =
    li.catalog_id != null
      ? (catalog.platforms[platform] ?? []).find((r) => r.id === Number(li.catalog_id))
      : null;
  if (row) return [row.responsible, row.level];
  if (li.module && PHASE_ROLE[li.module]) return PHASE_ROLE[li.module];
  return ["IT", 1];
}

const quotes = await (
  await fetch(`${URL_}/rest/v1/proposals?select=id,title,platform,updated_at,line_items,addons`, { headers: H })
).json();

let quotesChanged = 0;
let linesChanged = 0;
let skipped = 0;
for (const q of quotes) {
  let changed = 0;
  const line_items = (q.line_items ?? []).map((li) => {
    const needsRate = !(typeof li.rate === "number" && Number.isFinite(li.rate));
    const needsRole = !(li.responsible && (li.level === 1 || li.level === 2));
    if (!needsRate && !needsRole) return li;
    changed += 1;
    const [responsible, level] = needsRole ? roleFor(li, q.platform) : [li.responsible, li.level];
    return { ...li, responsible, level, rate: needsRate ? LEGACY : li.rate };
  });
  const addons = q.addons ?? {};
  const needsAddonRates = !addons.rates;
  if (!changed && !needsAddonRates) continue;

  quotesChanged += 1;
  linesChanged += changed;
  console.log(`  "${q.title}": ${changed} line(s)${needsAddonRates ? " + add-on rates" : ""}`);
  if (!APPLY) continue;

  const body = {
    line_items,
    addons: needsAddonRates
      ? { ...addons, rates: { responsive: LEGACY, design: LEGACY, qa: LEGACY, pm: LEGACY } }
      : addons,
  };
  const w = await fetch(
    `${URL_}/rest/v1/proposals?id=eq.${q.id}&updated_at=eq.${encodeURIComponent(q.updated_at)}`,
    { method: "PATCH", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(body) },
  );
  const out = await w.json();
  if (!(w.ok && Array.isArray(out) && out.length === 1)) {
    skipped += 1;
    console.warn(`skip  "${q.title}" changed while backfilling — re-run to pick it up`);
  }
}

console.log(
  APPLY
    ? `\n${quotesChanged - skipped} quote(s) backfilled, ${linesChanged} line(s)${skipped ? `, ${skipped} skipped` : ""}.`
    : `\n${quotesChanged} quote(s), ${linesChanged} line(s) would be backfilled. Re-run with --apply to write.`,
);
