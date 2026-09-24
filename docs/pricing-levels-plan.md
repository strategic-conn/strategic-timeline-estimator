# Pricing by role + level — integration plan

Source: `project-csv/Project_Pricing_Workbook_v3.xlsx` (Rates, Categories, six
platform tabs, Summary). Replaces the single `HOURLY_RATE = $100` with a rate per
**Responsible + Level**, adds an employee **lookup key** for assignment, and ships
catalog v3.

## Decisions (confirmed 2026-09-24)

| # | Question | Decision |
|---|---|---|
| 1 | Admin changes a rate — existing estimates? | **Keep their old price.** Each line stores the rate it was priced at. Explicit "Update to current rates" action previews old → new before applying. |
| 2 | Skill stars vs lookup key | **Key first, stars as tiebreak.** Filter by discipline + level (Level 2 may cover Level 1), then rank by platform stars, then capacity; skip approved leave. |
| 3 | Rate for add-on hours | **Each add-on uses its role's rate at Level 1:** PM → Project Manager, Design → Creative, QA → QA Tester, Responsive → IT. |
| 4 | Tier vs level | **Keep both.** Level sets the RATE; tier (Basic 1× / Advanced 1.5× / Custom 2×) keeps multiplying HOURS. The workbook's planned Easy/Medium/Hard folds into tier, not a third system. |

Defaults unless changed: Level 2 may take Level 1 work; a person may hold several
keys; the client PDF shows line prices only (no role, level or rate); freehand
lines default to IT Level 1; "Requirements not pinned down" still affects hours only.

## Status

- **Phase 1 — done (2026-09-24).** `hourly_rates` (0042) seeded; admin editor
  in Settings → Workspace; realtime; probes P10–P13 pass.
- **Phase 2 — done (2026-09-24).** `scripts/build-catalog.mjs` +
  `scripts/remap-catalog-categories.mjs`; catalog v3 shipped (597 tasks, 23
  categories, role/level/things-to-consider); browser filters; 17 live lines
  remapped; Esther's hardcoded category id replaced. Found: categories were
  re-classified (not just renumbered); two WordPress base hours changed despite
  the workbook's note; React duplicate ids fixed (135–137).
- **Phase 3 — done (2026-09-24).** Lines carry `responsible`/`level`/`rate`
  (snapshot); `addons.rates`; `lineAmount`/`quotePricing`/`splitAmount` replace
  `HOURLY_RATE`/`amountForHours`/`priceForHours` (removed, so tsc found every
  caller). `LEGACY_HOURLY_RATE` fallback + one-shot backfill (6 quotes, 208
  lines, prices verified unchanged). `QuoteRatesCard` (Adjust) + line Role
  picker + catalog rates. Guided phases → roles: Discovery → Project Manager,
  Content/Design → Creative, QA → QA Tester, others → IT (all Level 1).
  Client PDF/preview/Excel print prices, not rates.
- **Phase 4 — done (2026-09-24).** `profiles.work_keys` (0043, admin-only via
  `prevent_role_self_change`, format CHECK; probes P14–P16). Team dialog editor.
  Planner + PTO cover: keys govern per discipline (Level 2 covers Level 1,
  stars break ties); no-key disciplines unchanged. **Deviation:** no
  `tasks.responsible/level` — a seeded task reads its role from its line via
  `source_line_item_id`. Found: a stale-echo race that dropped keys on quick
  clicks (fixed in `team-store`).
- **Phase 5 — done (2026-09-24).** Catalog/freehand lines scheduled by role
  (`ROLE_PHASE`: Creative → Design, QA Tester → QA, Project Coordinator →
  Content, Project Manager → Discovery, IT → Development); guided lines
  unchanged. `resultFromQuote` splits hours by the same rule (IT-only quotes
  byte-identical). A per-operation phase set keeps role phases a schedule lacks
  in Development, so nothing reaches the backlog; existing tasks are never
  moved. The module worksheet (`docs/module-grouping-worksheet.csv`) is NOT
  applied — role replaced it; splitting IT work further (Deployment → Launch,
  SEO → SEO Setup) would still need its decisions.
- Rates confirmed **real** (the workbook's "placeholder" note was stale).
  Project Coordinator **$0 is intentional** (non-billable) and configurable.

## Findings

Workbook: its Rates tab calls the rates placeholders (stale — confirmed real);
Coordinator $0 (intentional); the Project Manager rate is used
by no task (only by the PM add-on, per decision 3); React-NextJS has 3 duplicate
task ids and 8 rows copied from WordPress; categories 10, 11, 16, 17, 21, 23 have
no tasks; only WordPress uses Dependencies; categories were renumbered (19 → 23).

App: `amountForHours(hours)` is the single hours→money seam and takes hours only,
so all nine consumers move to line-aware pricing (editor header, totals panel,
list cards, stage board, PDF, Excel, Zoho send dialog, `deal-estimate-sync`
Packages rows — which must split MONEY, not hours × one rate). Skill stars are
platform skills, a different axis from the lookup key. Live data at planning
time: 6 quotes (all Zoho-linked, one Closed Won at $70,800), 208 line items (191
with no role), 17 catalog lines whose `category_id` uses the old numbering, 1
converted project with 46 seeded tasks, 43 skill rows across 7 of 11 people.

## Phases (each ships alone and leaves the app working)

**0 — Decisions + data.** Real rates; Coordinator answer.

**1 — Rates as data.** `hourly_rates` table (`responsible`, `level`, `rate`,
`updated_by`, `updated_at`; PK responsible+level). RLS: admin+manager read, admin
write. Settings → Hourly rates admin card, validating Level 2 ≥ Level 1 and
rate ≥ 0. `rates-store` hydrated by `WorkspaceSync`; demo seed. Security probe:
a member cannot read or write rates. No visible pricing change yet.

**2 — Catalog v3.** Repeatable `scripts/build-catalog.mjs` (xlsx → catalog.json),
replacing the one-off conversion. `CatalogItem` gains `responsible`, `level`,
`things_to_consider`, dependencies; new categories list; duplicate ids fixed at
source. Catalog browser shows role, level and notes, with category /
responsible / level filters — **not rates** until Phase 3, while the quote
still prices at $100/h. The 17 live catalog lines are remapped **through their
own `catalog_id`** (`scripts/remap-catalog-categories.mjs`), not by category
name: v3 re-classified tasks between categories. Esther (parked) must keep
compiling.

**3 — Price per line.** `ProposalLineItem` gains `responsible`, `level`, `rate`
(snapshot). All money goes through line-aware helpers; add-ons priced per
decision 3; header shows hours + average rate instead of "@ $100/h". Backfill
every existing line at $100 so no live quote changes price on deploy. "Update to
current rates" with old → new preview. Guided lines get a role from their phase.
New `proposals` fields need all three whitelists (`rowToQuote`,
`quoteUpdatePayload`, `updateProposal`'s `Pick`). Consistency test: editor = PDF
= Excel = Zoho row sum.

**4 — People + assignment.** Employee lookup keys (admin-set only; add to
`prevent_role_self_change`'s guard, or members could promote themselves). Team
page editor. `tasks.responsible` / `tasks.level` (nullable; hand-made tasks have
none), seeded from line items on convert and sync. Planner and PTO cover match
per decision 2.

**5 — Optional.** Schedule catalog quotes by role (Creative → Design sprint,
QA → QA sprint), ending "catalog quotes schedule as one Development sprint";
ties into `docs/module-grouping-worksheet.csv`.

**6 — Regression.** Full suite, security probe, docs (CLAUDE.md, architecture
map, QA checklist).

## Not affected

Workload, capacity, Dashboard, Timeline/Gantt, PBS (a PO carries no figures),
holidays — all work in hours, not dollars.
