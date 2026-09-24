/**
 * Build lib/proposal-catalog/catalog.json from the pricing workbook.
 *
 *   node scripts/build-catalog.mjs [path/to/workbook.xlsx]
 *
 * Default source: project-csv/Project_Pricing_Workbook_v3.xlsx. Repeatable —
 * the previous catalog was a one-off conversion with no script behind it, so
 * the spreadsheet and the app had silently drifted apart.
 *
 * What it does beyond copying cells:
 *  · Normalises en/em dashes to "-" in module and task names. The workbook
 *    uses "Configurator – 3D" where the catalog always said "Configurator - 3D";
 *    without this every module would split into two spellings on existing
 *    quotes, the PDF grouping and docs/module-grouping-worksheet.csv.
 *  · Gives DUPLICATE ids within a platform a fresh id (max + 1…). React-NextJS
 *    reused 121-123 for three different pairs of tasks, so ticking one in the
 *    catalog browser also ticked the other and added both.
 *  · REFUSES to build when a task names a role, level or category the workbook
 *    does not define — a typo there would otherwise price or group silently
 *    wrong later.
 *
 * After rebuilding, run scripts/remap-catalog-categories.mjs so existing quote
 * lines follow any category re-classification.
 */
import { readFileSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";

const SRC = process.argv[2] ?? "project-csv/Project_Pricing_Workbook_v3.xlsx";
const OUT = "lib/proposal-catalog/catalog.json";

const TABS = {
  wordpress: "WordPress",
  squarespace: "Squarespace",
  shopify: "Shopify",
  wix: "WIX",
  php: "PHP-HTML-CSS",
  react_next: "React-NextJS",
};

const wb = XLSX.read(readFileSync(SRC));
const rowsOf = (sheet) =>
  XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: null, raw: true });
const dash = (s) => (s == null ? s : String(s).replace(/[–—]/g, "-").trim());
const text = (s) => (s == null || String(s).trim() === "" ? null : String(s).trim());

const errors = [];
const warnings = [];

// ── Categories ────────────────────────────────────────────────────────────
const categories = rowsOf("Categories")
  .filter((r) => Number.isInteger(r[0]))
  .map((r) => ({ id: r[0], name: dash(r[1]), description: text(r[2]) ?? "" }));
const categoryIds = new Set(categories.map((c) => c.id));

// ── Roles (Rates tab) — the only valid Responsible + Level pairs ──────────
const roles = new Set();
for (const r of rowsOf("Rates")) {
  if (typeof r[0] === "string" && /^Level [12]$/.test(String(r[1] ?? ""))) {
    roles.add(`${r[0].trim()}|${String(r[1]).trim()}`);
  }
}

// ── Platform tabs ─────────────────────────────────────────────────────────
// Columns: id | Dependencies | Module | Name | category_id | Category(formula)
//          | Description | Responsible | Level | Rate(formula) | Base Hours
//          | Estimated Cost(formula) | Things to Consider
const platforms = {};
const summary = [];
for (const [key, sheet] of Object.entries(TABS)) {
  const rows = rowsOf(sheet).filter((r) => Number.isInteger(r[0]));
  const maxId = Math.max(...rows.map((r) => r[0]));
  let nextId = maxId + 1;
  const seen = new Set();
  const items = [];

  for (const r of rows) {
    let id = r[0];
    if (seen.has(id)) {
      warnings.push(`${sheet}: duplicate id ${id} ("${dash(r[3])}") renumbered to ${nextId}`);
      id = nextId++;
    }
    seen.add(id);

    const responsible = text(r[7]);
    const levelText = text(r[8]);
    const level = levelText === "Level 1" ? 1 : levelText === "Level 2" ? 2 : null;
    const where = `${sheet} id ${r[0]} ("${dash(r[3])}")`;

    if (!responsible || !level || !roles.has(`${responsible}|${levelText}`)) {
      errors.push(`${where}: unknown Responsible/Level "${responsible}" / "${levelText}"`);
    }
    if (r[4] != null && !categoryIds.has(r[4])) {
      errors.push(`${where}: unknown category_id ${r[4]}`);
    }
    const base = Number(r[10]);
    if (!Number.isFinite(base) || base < 0) errors.push(`${where}: bad Base Hours "${r[10]}"`);

    items.push({
      id,
      module: dash(r[2]),
      name: dash(r[3]),
      category_id: r[4] ?? null,
      base_hours: base,
      description: text(r[6]) ?? "",
      dependencies_note: text(r[1]),
      responsible,
      level,
      things_to_consider: text(r[12]),
    });
  }
  platforms[key] = items;
  summary.push(
    `${sheet.padEnd(13)} ${String(items.length).padStart(3)} tasks  ` +
      `${items.reduce((s, i) => s + i.base_hours, 0).toFixed(1).padStart(7)} h`,
  );
}

for (const w of warnings) console.warn(`warn  ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`ERROR ${e}`);
  console.error(`\n${errors.length} error(s) — catalog NOT written.`);
  process.exit(1);
}

writeFileSync(OUT, JSON.stringify({ categories, platforms }, null, 2) + "\n");
console.log(summary.join("\n"));
console.log(`\n${categories.length} categories · wrote ${OUT}`);
console.log("Next: node scripts/remap-catalog-categories.mjs  (re-points existing quote lines)");
