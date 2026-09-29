"""Build the PROPOSED CLAUDE.md on a copy. Never writes the real file."""
import io, difflib, sys

ROOT = r"C:\Users\admin\Desktop\POLITICAL_CONNECTION\timeline-estimator-project-management-tool"
OUT = ROOT + r"\docs\prompt-audit"
orig = io.open(ROOT + r"\CLAUDE.md", encoding="utf-8").read()
s = orig
applied = []

def rep(fid, old, new):
    global s
    n = s.count(old)
    assert n == 1, (fid, n, old[:80])
    s = s.replace(old, new, 1)
    applied.append(fid)

# ── C1 stale structure tree (Group 2, volatile specifics) ──────────────────
rep("C1", "├── common/             # coming-soon, shared bits\n",
          "├── common/             # help-tip, mine-team-toggle, password-input\n")
rep("C1", "│   ├── projects/       # ProjectsPage, ProjectCard, Create/Edit/Delete modals\n",
          "│   ├── auth/           # invite-hash-catcher\n"
          "│   ├── dashboard/      # DashboardTeam (the Team view)\n"
          "│   ├── projects/       # ProjectsPage, ProjectCard, Create/Edit/Delete modals\n")
rep("C1", "│   └── settings/       # ProfileForm, TimeOffSettingsSection, AdminTeamTimeOffSection\n"
          "└── layouts/            # dashboard-header, sidebar-nav, mobile-menu, mobile-tab-bar, nav-config, page-header, app-providers, app-atmosphere\n"
          "hooks/                  # usePermissions, useProjects, useSprints, useTasks, useTimeTrackingAccess\n",
          "│   ├── settings/       # ProfileForm, TimeOffSettingsSection, AdminTeamTimeOffSection, HourlyRatesCard, TimeOffApprovalDialog\n"
          "│   ├── skills/         # MemberSkillsEditor, StarRating\n"
          "│   ├── team/           # MemberAccessDialog, PageAccessChecklist, WorkKeysEditor\n"
          "│   └── esther/         # parked chat client (see \"Esther is built but parked\")\n"
          "└── layouts/            # dashboard-header / -sidebar-nav / -mobile-menu / -mobile-tab-bar / -nav-config, workspace-page-header,\n"
          "                        #   workspace-sync (hydrate + realtime), auth-provider, page-access-guard, sidebar-user-card, app-providers, app-atmosphere\n"
          "hooks/                  # usePermissions, useAuth, useProjects, useSprints, useTasks, useTimeTrackingAccess, useNavAccess,\n"
          "                        #   useTeamCalendar, useWeekLoggedHours, useZohoStageRefresh, usePbsClients, usePbsPoRefresh\n")
rep("C1", "├── undo/               # offer-undo-toast (one-shot Undo)\n"
          "└── supabase/           # client.ts (browser), server.ts (RSC seam), middleware.ts + config.ts + parse-error.ts — wired\n",
          "├── undo/               # offer-undo-toast (one-shot Undo)\n"
          "├── assignment/         # plan.ts (assignment planner: work keys, then skills) + roster.ts\n"
          "├── pricing/            # hourly-rates.ts (rate rules) + line-pricing.ts (who does a line, what it costs)\n"
          "├── zoho/               # OAuth tokens, write-allowlist, deal stages/products/packages, won-transition\n"
          "├── pbs/                # tokens (mintOnce), endpoint allowlist, clients/directory, PO status\n"
          "├── esther/             # parked brief engine\n"
          "└── supabase/           # client.ts (browser), server.ts (API route guards), admin.ts (service role, server-only),\n"
          "                        #   require-admin.ts, middleware.ts + config.ts + parse-error.ts — wired\n")
rep("C1", "                        #   projects, sprints, tasks, auth, team, availability, activity,\n"
          "                        #   notifications, weekly-capacity, proposal-estimator\n",
          "                        #   projects, sprints, tasks, auth, team, availability, activity,\n"
          "                        #   notifications, weekly-capacity, proposal-estimator, hourly-rates,\n"
          "                        #   member-skills, esther, nav-drawer\n")

# ── C2 server.ts "not yet imported" (Group 2, contradicted: 3 guards import it) ─
rep("C2", "- `server.ts` — server client for Server Components / Route Handlers / Server Actions (seam; not yet imported).",
          "- `server.ts` — server client for Server Components / Route Handlers / Server Actions; used by the API route guards (`lib/supabase/require-admin.ts`, `lib/zoho/guard.ts`, `lib/pbs/guard.ts`).")

# ── C3 Packages rows "still blocked" (Group 2, contradicted by deal-estimate-sync.ts) ─
rep("C3", " Writing real rows to Zoho is still blocked on the Packages subform's API names (`/api/zoho/health` → `dealSubforms`); until then the priced breakdown goes in the deal's `Description`.",
          " These rows are written onto the Deal's Packages subform by `lib/zoho/deal-estimate-sync.ts` (see \"Estimate → Deal content\" under Zoho).")
rep("C3", " **Not written onto the Deal** yet: the \"Packages\" subform's API name is unknown, so for now the picked names ride along in the new deal's `Description` |",
          " Picked products become the Deal's Packages rows (see \"Estimate → Deal content\") |")

# ── C4 "read-only" heading (Group 2, contradicted: the section documents writes) ─
rep("C4", "## Zoho CRM Integration (read-only)", "## Zoho CRM Integration")

# ── C5 two-vs-three whitelists (Group 2, conflict inside the file) ──────────
rep("C5", "> ⚠️ **Adding any column to `proposals` means updating two whitelists** — `quoteUpdatePayload()`\n"
          "> and the `Pick<ClientQuote, …>` param type of `updateProposal`. Miss either and the edit updates\n"
          "> the store but **silently never persists**.",
          "> ⚠️ **Adding any column to `proposals` means updating three places** — `quoteUpdatePayload()`,\n"
          "> the `Pick<ClientQuote, …>` param type of `updateProposal`, and `rowToQuote`. Miss either of the\n"
          "> first two and the edit updates the store but **silently never persists**; miss `rowToQuote` and it\n"
          "> persists but never comes back on hydrate.")
rep("C5", " once. **Adding a column to `proposals` means updating two whitelists** —\n"
          "> `quoteUpdatePayload()` and the `Pick<ClientQuote, …>` on `updateProposal`.",
          " once. **Adding a column to `proposals` means updating three places** —\n"
          "> `quoteUpdatePayload()`, the `Pick<ClientQuote, …>` on `updateProposal`, and `rowToQuote`.")

# ── C6 addWorkingDays "delegates" (Group 2, contradicted by team-calendar.ts + later section) ─
rep("C6", " - ⚠️ **With no calendar it DELEGATES to `addBusinessDays`**, rather than\n"
          "   reimplementing it. Identical, not merely equivalent — a workspace that\n"
          "   records no time off gets byte-identical dates, and `e2e/team-calendar.spec.ts`\n"
          "   asserts that across 60 offsets and four start days including weekends.",
          " - ⚠️ **With no calendar the dates match `addBusinessDays` over any\n"
          "   holiday-free window** — a workspace that records no time off gets\n"
          "   byte-identical dates there (`e2e/team-calendar.spec.ts`). It walks the days\n"
          "   itself rather than delegating, because holidays still apply (next section).")

# ── C7 stale cross-reference (Group 2, the section is its own heading) ──────
rep("C7", "(see \"Work keys\" under Tasks ↔ Workload)", "(see the \"Work keys\" section)")

# ── C8 Data Access Map missing rows (Group 2, volatile specifics — add) ─────
rep("C8", "| `proposals.zoho` (CRM link jsonb)     | select / insert / update   | `proposal-estimator-store` (deal/account/contact link) | Wired |\n",
          "| `proposals.zoho` (CRM link jsonb)     | select / insert / update   | `proposal-estimator-store` (deal/account/contact link) | Wired |\n"
          "| `proposals.pbs` (PO link jsonb)       | select / update            | `proposal-estimator-store` (Create PO, PO status refresh) | Wired |\n"
          "| `pbs_connection` (PBS token cache)    | service-role only (RLS: **no policies**) | `lib/pbs/tokens.ts` via `/api/pbs/*` | Wired |\n"
          "| `member_skills` (skill + 1–5 stars)   | select / upsert / delete   | `member-skills-store` (Team → star button) | Wired |\n")

# ── C9 human-facing example prompts, two of them stale (Group 1c padding + Group 2) ─
rep("C9", "## How To Use This File With Claude\n\n"
          "When working inside this project with Claude, you can say things like:\n\n"
          "- **\"Using the patterns in CLAUDE.md, help me build the task creation form\"**\n"
          "- **\"Following the API layer pattern, write the useProjects hook\"**\n"
          "- **\"Create the EmptyState component for the tasks board\"**\n"
          "- **\"Scaffold the /projects/[projectId]/tasks page with loading, error, and empty states\"**\n"
          "- **\"Write the Axios interceptor setup from scratch following this project's auth flow\"**\n"
          "- **\"Add the Kanban board drag-and-drop using @dnd-kit as described in the stack\"**\n\n"
          "Claude will use this file as full project context so every response fits the architecture,\n"
          "naming conventions, and patterns already established here.\n\n", "")

# ── C10 changelog footer: stale date + entries the body already states (Group 2 history/time-sensitive) ─
start = s.index("> **2026-09-17 — estimate ↔ project sync made two-way.**")
end = s.index("> Update this file whenever the project scope, stack, or patterns change.")
footer_old = s[start:end]
s = s[:start] + "> Maintainer: Frontend Dev · Last updated: 2026-09-30\n" + s[end:]
applied.append("C10")

# ── C11 history narratives → current rule + reason (Group 2 history narratives) ─
rep("C11", "> ⚠️ **Minting is NOT safe to race** — this file used to claim it was. PBS keeps",
           "> ⚠️ **Minting is NOT safe to race.** PBS keeps")
rep("C11", "   out **unassigned** work entirely, the overdue task nobody owns being the one\n"
           "   a manager most needs to see. Live it read 4 where Reports read 18. Now both\n"
           "   use `status !== \"done\" && isOverdue`, and `dashboard-views.spec.ts` asserts\n"
           "   the two pages print the same number.",
           "   out **unassigned** work entirely, the overdue task nobody owns being the one\n"
           "   a manager most needs to see. Both pages use `status !== \"done\" && isOverdue`,\n"
           "   and `dashboard-views.spec.ts` asserts they print the same number.")
rep("C11", "   > with no **Start project**. Found live on an estimate that already had a PO\n"
           "   > raised against it. The rule now lives in **`lib/zoho/won-transition.ts`**:",
           "   > with no **Start project**. The rule lives in **`lib/zoho/won-transition.ts`**:")

# ── C12 pressure markers: 74 × ⚠️ (Group 1a) — applied last, whole file ─────
n_warn = s.count("⚠️ ")
s = s.replace("⚠️ ", "")
applied.append(f"C12 ({n_warn} markers)")

io.open(OUT + r"\CLAUDE.proposed.md", "w", encoding="utf-8").write(s)
diff = difflib.unified_diff(orig.splitlines(True), s.splitlines(True),
                            "a/CLAUDE.md", "b/CLAUDE.md", n=2)
io.open(OUT + r"\CLAUDE.md.patch", "w", encoding="utf-8").writelines(diff)
io.open(OUT + r"\CLAUDE.footer-removed.txt", "w", encoding="utf-8").write(footer_old)
print("applied:", ", ".join(dict.fromkeys(applied)))
print("lines", orig.count("\n"), "->", s.count("\n"), "| words", len(orig.split()), "->", len(s.split()))
