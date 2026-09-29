# Prompt audit — instruction files (2026-09-30)

## Assumptions

- **Scope:** the project's instruction files: `CLAUDE.md` (1,784 lines, loaded every Claude Code session), `.cursorrules` (642 lines, loaded by Cursor on every request) and `AGENTS.md` (5 lines).
  - **Skipped:** the auto-memory notes under `~/.claude/projects/…` (user-level and outside the project, so not named by the request), the `AGENTS.md` files inside `node_modules/`, and `docs/*.md` / `e2e/README.md` (reference docs, which are read on demand rather than loaded as instructions).
  - **Not present:** no `.claude/` directory, skills, commands or subagents.
- **Target model:** Claude Opus 5.5, as named in the request.
  - The app itself never calls the Claude API: there is no Anthropic or other LLM SDK, and no non-Anthropic provider markers.
  - So **Group 3 (tool descriptions)** and **Group 4 (request config)** are *not applicable*.
- **Provenance:** `.cursorrules` was last committed 2026-06-26 and its header says 2026-06-22. `CLAUDE.md` was last committed 2026-09-24 and has uncommitted edits since. So on every point where the two disagree, CLAUDE.md is the newer text.
- **Applied 2026-09-30:** every high/medium finding (both patches in full), then flags F1–F5 by the user's decision:
  - **F1:** state rules rewritten to the synced-store bridge.
  - **F2:** headers now match `next.config.ts`.
  - **F3:** exports rule kept, with the client-side proposal-export carve-out.
  - **F4:** pagination rule narrowed to unbounded lists (feeds, logs).
  - **F5:** marked as planned.

  F6 (UI standards kept as targets), F7–F10 unchanged. The proposed changes were in `CLAUDE.md.patch` / `cursorrules.patch`, with full proposed versions in `CLAUDE.proposed.md` / `cursorrules.proposed`. The text the CLAUDE.md edit deletes from the footer is kept in `CLAUDE.footer-removed.txt`.

## Summary

1. **`.cursorrules` is a second, three-month-old copy of the architecture, and it now contradicts CLAUDE.md and the code in about 20 places.**
   - It says TanStack Query owns server state, while the app uses the Zustand synced-store bridge.
   - It says every table is "Demo", every phase is "Not started", `middleware.ts` exists (it is now `proxy.ts`), stores are named `auth.store.ts`, and tests use Vitest + MSW (the project uses Playwright).
   - It says the Gantt becomes a list view on mobile (CLAUDE.md rule 5 says the opposite), and "In Review" is yellow (it is purple).
   - Current models follow instructions literally, so Cursor will generate code against an architecture that no longer exists.
   - **Fix:** keep every still-valid standard, correct the stale facts, and point the fast-changing facts (status, tree, table map, stores) at CLAUDE.md so the two files cannot drift again. This takes the file from 3,508 to 2,662 words.
2. **CLAUDE.md has seven statements the repository contradicts**, including two where the file contradicts itself:
   - it says `proposals` needs "two whitelists" in two places, and "three places, not two" in a third;
   - it says the calendar walk "DELEGATES to `addBusinessDays`", while the holiday section, and the code, say it no longer does;
   - it says Packages rows "are not written yet" in two places, while `deal-estimate-sync.ts` writes them;
   - it says `server.ts` is "not yet imported", but three API guards import it;
   - the section heading says Zoho is "read-only", but the section documents writes;
   - it has a stale cross-reference;
   - its example prompts ask for an "Axios interceptor" and an "API layer" that don't exist.
3. **CLAUDE.md uses the ⚠️ marker 74 times.** When nearly every paragraph is flagged critical, the marker stops meaning anything, and on current models it pushes toward over-cautious, rigid behaviour. The bold rule text carries the emphasis on its own.

**Counts:**

| Group | Findings |
|---|---|
| Group 1 (dated prompt text) | 2 |
| Group 2 (brittle configuration files) | 27 |
| Group 3 (tool descriptions) | not applicable |
| Group 4 (request config) | not applicable |
| Flag-only (no edit proposed) | 10 |

**Token effect:**

| File | Words before | Words after | Change |
|---|---|---|---|
| CLAUDE.md | 19,736 | 19,472 | −1.3% |
| .cursorrules | 3,508 | 2,662 | −24% |

The main win is **accuracy** (no contradictory instructions), not size. CLAUDE.md's size is listed as a separate flag (F7), because shrinking it is a decision about what loads every session.

---

## Findings (highest confidence first)

### High confidence: contradicted by the repository

| # | Location | Evidence | Pattern | Why obsolete | Action |
|---|---|---|---|---|---|
| R1 | `.cursorrules:68-77` | Phase table: all four phases "Not started" | G2 conflict | CLAUDE.md Current Status: phases 1–3 **Wired**, phase 4 partly done | rewrite → pointer to CLAUDE.md |
| R2 | `.cursorrules:98-102` | "Backend SDK (installed, not yet wired)", "FullCalendar/**Recharts**/Vitest are not installed" | G2 volatile specifics | Supabase is wired; `package.json` has `recharts ^3.8.0`; TanStack is installed but not wired | rewrite |
| R3 | `.cursorrules:105-206` | Project tree with `middleware.ts`, `components/common/DataTable/…`, `auth.store.ts`, `ui.store.ts`, `query-keys.ts` | G2 volatile specifics / duplicate | None of these exist (`proxy.ts` replaced middleware; stores are `*-store.ts`); CLAUDE.md keeps the current tree | remove → pointer |
| R4 | `.cursorrules:217-218` | "Entity types live in src/types/models.ts", "src/types/api.types.ts" | G2 volatile specifics | There is no `src/` and no such files; types are `types/*.types.ts` plus the generated `database.types.ts` | rewrite |
| R5 | `.cursorrules:253,256,343,351` | "surface in TanStack onError", "root middleware" | G2 volatile specifics | TanStack isn't wired; errors roll back and toast with `parseSupabaseError`; the root file is `proxy.ts` | rewrite |
| R6 | `.cursorrules:262-275` | Tables → hooks table, every row "Demo" | G2 conflict | Every row is Wired (CLAUDE.md Data Access Map) | remove → pointer |
| R7 | `.cursorrules:277-285` | TanStack Query rules (query-key factory, staleTime guide) | G2 conflict | TanStack isn't wired, `query-keys.ts` doesn't exist, and CLAUDE.md's Key Architectural Decisions chooses the synced-store bridge instead | remove |
| R8 | `.cursorrules:295-316` | Store docs: `auth.store.ts`, `ui.store.ts`, `notification.store.ts`, "(demo — will become TanStack)" | G2 volatile specifics | Those stores don't exist; the real 14 are in `store/` and CLAUDE.md's State Management Map | rewrite → pointer |
| R9 | `.cursorrules:324` | "Zod schemas: src/lib/validations/…" | G2 volatile specifics | The path is `lib/validations/` | rewrite |
| R10 | `.cursorrules:407-413` | "In Review: bg-yellow-100…" | G2 conflict | `lib/constants/task-status.ts` defines In Review as purple and is the single definition (CLAUDE.md rule 8) | rewrite → pointer |
| R11 | `.cursorrules:463,470,485` | "fixed left sidebar 240px", "sm:grid-cols-2", "Gantt: list view on mobile" | G2 conflict | CLAUDE.md rule 5: three layout tiers (rail at md–lg, `lg:w-56`), gate grids on `lg:`, and the Gantt keeps its chart in a scroller | rewrite |
| R12 | `.cursorrules:491` | "Gantt, FullCalendar…" | G2 volatile specifics | FullCalendar isn't installed | rewrite |
| R13 | `.cursorrules:528-536` | "Vitest + React Testing Library", "MSW", colocated `*.test.tsx` | G2 volatile specifics | None installed; tests are Playwright in `e2e/`, against live data with the `[E2E]` rules | rewrite |
| R14 | `.cursorrules:551,553` | Stores "camelCase + .store.ts"; "QUERY_KEYS.TASKS" | G2 volatile specifics | Stores are `tasks-store.ts`; there are no query keys | rewrite |
| R15 | `.cursorrules:595-642` | Phase checklists (comments, notifications, dnd, estimator, PDF export, Gantt all unchecked) | G2 volatile specifics / history | That work shipped; status lives in CLAUDE.md | rewrite: keep only the open Phase 4 list |
| R16 | `.cursorrules:13-46` | Maintenance steps: "Endpoint Map", "shared Postman collection", "API table" | G2 volatile specifics | There is no REST API (CLAUDE.md: "no `lib/api/` folder and no axios") | rewrite |
| C1 | `CLAUDE.md:125-157` | `common/ # coming-soon…`; layouts named `sidebar-nav`, `page-header`; hooks, lib and store lists | G2 volatile specifics | `coming-soon` doesn't exist; the layouts are `dashboard-*` / `workspace-page-header`; the lists miss `dashboard/`, `skills/`, `team/`, `assignment/`, `pricing/`, `zoho/`, `pbs/`, 7 hooks and 4 stores | rewrite |
| C2 | `CLAUDE.md:204` | "`server.ts` … (seam; not yet imported)" | G2 volatile specifics | Imported by `require-admin.ts`, `lib/zoho/guard.ts`, `lib/pbs/guard.ts` | rewrite |
| C3 | `CLAUDE.md:391`, `:685` | "Writing real rows to Zoho is still blocked…"; "**Not written onto the Deal** yet" | G2 conflict (inside the file) | `lib/zoho/deal-estimate-sync.ts` writes the Packages subform, and the same file's "Estimate → Deal content" row says so | rewrite |
| C4 | `CLAUDE.md:653` | "## Zoho CRM Integration (read-only)" | G2 conflict (inside the file) | The section documents create-deal, push and stage-board writes | rewrite |
| C5 | `CLAUDE.md:786`, `:909` vs `:939` | "two whitelists" (twice) vs "**three** places, not two" | G2 conflict (inside the file) | `rowToQuote` is the third place; the file says so, then contradicts it twice | rewrite both to "three places" |
| C6 | `CLAUDE.md:1425-1428` | "With no calendar it DELEGATES to `addBusinessDays`" | G2 conflict (inside the file + code) | `lib/discovery/team-calendar.ts:127` walks days itself, and the holiday section says it "no longer short-circuits" | rewrite |
| C7 | `CLAUDE.md:1486` | "(see "Work keys" under Tasks ↔ Workload)" | G2 volatile specifics | Work keys is its own `##` section | rewrite |
| C9 | `CLAUDE.md:1750-1762` | "How To Use This File With Claude": "Following the API layer pattern…", "Write the Axios interceptor…" | G2 conflict + G1c padding | No API layer and no axios; example prompts for humans add nothing for the model | remove |

### Medium confidence

| # | Location | Evidence | Pattern | Why obsolete | Action |
|---|---|---|---|---|---|
| C12 | `CLAUDE.md` (74 lines) | `⚠️` before most rule blocks | G1a pressure language | When most blocks are marked critical, the markers carry no information and push current models toward rigid, over-cautious behaviour; the bold rule text already carries the emphasis | rewrite: drop the glyph, keep the text |
| R17 | `.cursorrules:225` | "Max 200 lines per component — split if longer" | G1d unenforced instruction | Visibly violated (`ProposalEditorClient.tsx` is 2,350 lines) and nothing enforces it | rewrite: "Split a component when a part of it has its own job and can stand alone" |
| R18 | `.cursorrules:227` | "Never call API functions in event handlers — go through hooks" | G2 volatile specifics | There are no API functions; the real rule is "no Supabase calls in components, go through store actions" | rewrite |
| C8 | `CLAUDE.md:278` (Data Access Map) | Missing `proposals.pbs`, `pbs_connection`, `member_skills` | G2 volatile specifics (incomplete) | All three exist and are documented elsewhere in the file but not in the map | add rows |
| C10 | `CLAUDE.md:1764-1784` | Dated changelog footer ending "Last updated: 2026-07-14" | G2 history narratives / time-sensitive | The date is wrong (the file was updated through 2026-09-24), and every entry is already stated in the body (checked: live project Gantt, Create PO, status changer, `stageAlreadySet`, the merge, invites, offboarding, assignment lifecycle) | rewrite to "Maintainer · Last updated: 2026-09-30"; the removed text is saved in `CLAUDE.footer-removed.txt` |
| C11 | `CLAUDE.md:812`, `:1173`, `:977` | "— this file used to claim it was", "Live it read 4 where Reports read 18", "Found live on an estimate that already had a PO…" | G2 history narratives | The rule and its reason stay; only the incident story goes | rewrite (three hunks) |

### Flag only (no edit proposed)

| # | Location | Evidence | Why flagged, not fixed |
|---|---|---|---|
| F1 | `.cursorrules:291-293`, `:580` | "TanStack Query owns ALL server state… Never duplicate server data in Zustand", "Never use useEffect to sync server state — that is React Query" | These prohibitions contradict the architecture CLAUDE.md deliberately chose (the stores hold server data via the bridge). A conflict involving a prohibition is yours to decide. **Recommendation: delete both**; left untouched in the proposed file. |
| F2 | `.cursorrules:364-369` | "X-Frame-Options: SAMEORIGIN", "next.config.js" | `next.config.ts:40` sends `DENY` plus `frame-ancestors 'none'`. This is a security rule, so it's flagged rather than rewritten. **Recommendation: update to DENY and next.config.ts.** |
| F3 | `.cursorrules:374` | "Exports: stream from server, never assemble client-side fully" | The proposal PDF and Excel are assembled client-side by design (CLAUDE.md → Output). This is a data-handling prohibition: keep it and say it doesn't apply to proposal exports, or drop it. |
| F4 | `.cursorrules:520`, `:592` | "Paginate ALL lists — never fetch unlimited records" | The stores hydrate whole tables. The rule is violated, but it may be a goal you want to keep. |
| F5 | `.cursorrules:345`, `:362` | Session-expiry modal at 5 minutes; login button disabled after 5 failures | No such features found. Security UX: build them or drop the lines. |
| F6 | `.cursorrules:419`, `:435` | 200ms skeleton delay; "Showing 1–20 of 143 results" | Not visibly implemented. UI standards you may still want. |
| F7 | `CLAUDE.md` (whole file) | ~19.7k words (≈26–27k tokens) loaded every session | The largest token lever, but a structural choice: move the deep reference sections (Zoho feature table, PBS, Realtime, Security, Dashboard, Calendar) into `docs/` with a one-line pointer each, so they're read only when relevant. This changes what every session sees, and your "update CLAUDE.md in the same turn" habit. Say if you want a proposal. |
| F8 | `CLAUDE.md` (≈30 more passages) | Incident narratives beyond C11 (the "368–568 hrs" QA story, "Two wrong theories", "Probe pitfalls", "Fixed while building this", "reproduced ~1 run in 3") | Most carry the reason that stops a regression, which is context the model can't get elsewhere. Condensing them is safe only one passage at a time with review, so they're left out of this diff. |
| F9 | `AGENTS.md:1-5` | "This is NOT the Next.js you know…" | Clean. Next.js generates this block and it is load-bearing context. No change. |
| F10 | `~/.claude/projects/…/memory/*.md` | Auto-memory notes | Outside the project and not named by the request. Say if you want them audited too. |

---

## How to take the changes

- **Everything:** `git apply docs/prompt-audit/CLAUDE.md.patch` and `git apply --ignore-whitespace docs/prompt-audit/cursorrules.patch`. Or review `CLAUDE.proposed.md` / `cursorrules.proposed` side by side and copy them over.
- **Selectively:** each finding ID maps to one block in `audit_claude.py` (CLAUDE.md) or one section of `cursorrules.proposed`. Reject any you disagree with.
- **After applying:** the flag items F1–F6 are still in `.cursorrules` exactly as today, waiting on your decision.
