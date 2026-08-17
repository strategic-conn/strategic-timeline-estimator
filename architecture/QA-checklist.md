# QA Checklist — click-through verification

> **Fresh full pass re-run 2026-08-17** (not just spot-checks on new work): `tsc --noEmit` clean ·
> `next build` clean · migrations `0001–0029` applied on the remote, no schema drift · assignment
> engine self-check **48/48** · ESLint **18 errors / 22 warnings — all pre-existing** (see bottom) ·
> Zoho routes still correctly gated post-reconnect · `zoho_connection` RLS canary clean · no secrets
> in the client bundle. **Everything below is what only a human can confirm.** Tick as you go; log
> failures at the bottom.

---

## 🔴 Must-test — could block real flows (RLS / server guards, `0027`)

- [ ] Create a task, post a comment, add a reaction — all succeed.
- [ ] Assign a task → dev **accepts** → **pass** it to another dev.
- [ ] Edit your own profile (name/avatar) saves.
- [ ] A non-admin **cannot** self-change role / page access / activation state.
- [ ] Deactivate a member, then delete them (delete only works once deactivated).
- [ ] Cannot deactivate or delete the **last active admin**.
- [ ] Invite someone → they accept and set a password; re-send a stuck invite; **Forgot password**.

## 🟠 Estimator → project → schedule

- [ ] **Guided:** new estimate → Shopify → questionnaire does NOT re-ask platform / e-commerce / hosting → **Generate line items** → Timeline shows.
- [ ] **Catalog:** browse catalog dialog → add items → tentative Timeline appears → Review exports PDF + Excel.
- [ ] **Preview step:** "Start project" shows **Review schedule** first — sprints, each task's assignee and dates, an amber warning for unassigned work. **Nothing is created yet** (cancel → confirm the project doesn't exist).
- [ ] **Back** returns to the options step; changing strategy and re-previewing shows a *different* plan.
- [ ] **Confirm & create** saves **exactly** what the preview showed — spot-check 2 assignees + sprint dates against the preview.
- [ ] **Sync schedule** (existing project) shows the same preview, listing only what's **missing**; "already up to date" short-circuits with a toast and no dialog.
- [ ] **Start project → Manual:** creates project + phase sprints + tasks, **unassigned**.
- [ ] **Start project → Best-fit:** each dev/QA task gets an assignee; go-live/hosting work lands on the InMotion-skilled dev; QA lands on a QA-skilled dev.
- [ ] **Start project → Fastest:** work spreads across *more* devs than Best-fit; finish date is the same or earlier.
- [ ] Nobody is assigned a task whose skill they lack (spot-check 3 tasks against Team → skills).
- [ ] Design/discovery tasks are **unassigned but still dated** (expected — no dev has design skills).
- [ ] Tasks appear **immediately** after conversion — no refresh needed (this was the "empty project" bug).
- [ ] Project page shows the **Timeline** section (project-scoped Gantt); editing a sprint's dates moves its bar.
- [ ] Assignments arrive as **pending** → the dev sees accept/reject/pass.

## 🔌 Zoho CRM

### Connection

- [ ] `/api/zoho/status` (as admin) → `configured: true, connected: true`.
- [ ] **Test** button → toasts "Strategic Connection".
- [ ] **Tomorrow**, hit Test again → still works (proves the ~1h access-token refresh — the most common silent OAuth failure).
- [ ] Signed in as a **member**, open `/api/zoho/accounts?q=openarc` → **403** (CRM data is admin/manager only).
- [ ] **Disconnect → Connect** round-trip still works after the Phase-3 scope widen.

### Client lookup — Accounts → Contacts

Available in **two** places — test both: the **New estimate** dialog's Client field, and the
**editor → Setup tab**'s Client field. Expected values are pulled live from the CRM, so they're exact:

- [ ] **New estimate → Find in Zoho** → pick a company → name fills in and a "**Linked to Zoho**" line appears under the field.
- [ ] Typing over a picked client **clears** the "Linked to Zoho" line (a hand-typed name must never keep a stale CRM link).
- [ ] `openarc` → **OpenArc LLC**; click it → **2 contacts: Mike Carpenter (General Manager, Consulting Services), Joel Reed (CEO)**.
- [ ] `myrtle` → **19 companies** (Myrtle Beach Regional Economic Development Corporation, Monarch Roofing…).
- [ ] **Person-name fallback:** `kresimir` or `glorioso` → no company matches by name, so it returns **FinOps Partners** badged **"via Kresimir (Kreso) Marusic" / "via Russell Glorioso"**.
- [ ] **Prior deals:** `openarc` → OpenArc LLC shows a "**1 prior deal — Classic Plus Calling Campaign (Proposal Sent)**" line; companies with none show **no** deal line at all (not "0 deals").
- [ ] Search feels responsive (~1.4s — company search + one batched deal lookup, which must stay **one call** regardless of result count).
- [ ] Back arrow returns to the company list; **"Use the company only"** works (no contact chosen).
- [ ] Picking a contact fills the Client field + toast naming the contact.
- [ ] **Reload the page — the client must still be there.** (Persisting `proposals.zoho` needs `quoteUpdatePayload()` *and* `updateProposal`'s `Pick<>` to whitelist the column; a miss fails silently.)
- [ ] Dialog does not change height between empty / loading / results / no-match.

### Deal → Estimate import ("Import from Zoho")

- [ ] **Proposal Requested** shows exactly **2** deals: *Web Build* (Trade International 2020, LLC, closes Jul 7 2027) and *John Doe Accounting*.
- [ ] Other stage chips: Discovery **25+**, Negotiation **21** (incl. *Website Edits FlagrantFoul23*, **$3,250**), Verbal Yes **9**.
- [ ] Free-text search finds a deal by name/company.
- [ ] Pick one → new quote opens pre-filled (title + client) with an **"Imported from Zoho CRM"** panel showing deal, stage, contact, rep, target close.
- [ ] **View in Zoho** opens the right CRM record — *this URL is constructed by us, not returned by Zoho, so it's the piece most worth confirming.*
- [ ] Deals with `Amount: 0` show **no** figure (correct — most real deals have 0, and we now know `Amount` is a Zoho formula field, not a plain one — see the tech-debt note at the bottom).

> **Phase 3 (write-back) has no UI yet** — nothing to click-test here until it's built. What's already
> confirmed by direct API testing (not the app): Stage moves work, PDF attachment works, `Amount` and
> `Quote_number` are **not** writable on this org (Zoho-computed fields), and duplicate attachment
> uploads are **not** deduped by Zoho — our own idempotency guard has to do that. See
> `docs/zoho-workflow-automation-plan.md` §Phase 3.

## 📱 Tablet pass @ 768px + 1024px (iPad portrait / landscape)

- [ ] **768px (iPad portrait):** sidebar is a **narrow icon rail** — no text labels, no group headings, no wordmark; hovering/long-pressing an icon shows its name.
- [ ] Active page is still visibly highlighted on the rail.
- [ ] Bottom tab bar is **gone** at 768px (rail replaces it) and **back** below 768px.
- [ ] User avatar sits at the bottom of the rail and opens Settings; sign-out still reachable.
- [ ] **1024px (landscape):** full sidebar with labels returns — nothing stuck in rail mode.
- [ ] Timeline/Gantt: bars have usable width at 768px (name pane must not dominate).
- [ ] Workload stat cards: 2-up at 768px, 3–4 across only at 1024px+.
- [ ] Calendar month grid readable at 768px **and** 1024px — the day-detail panel must sit *below* the month (not beside it) until ~1280px, or day cells get squeezed to ~58px.
- [ ] No page scrolls sideways at 768px or 1024px.
- [ ] Spot-check the rest at 768px — Dashboard, Projects, Project overview, Board, Team, Settings, Activity, Reports, Estimator list + editor. All audited as safe; these are confirmation only.

## 🟢 Mobile pass @ 375px

- [ ] Estimator: Line items (collapsible), Questionnaire, Catalog dialog, Review (no sideways scroll), Timeline (zoom + clickable bars).
- [ ] **Zoho client-lookup dialog**: ~85% of screen height, no iOS zoom on focus, long emails truncate, full-width Cancel reachable.
- [ ] **Workload**: team rows are stacked cards, no horizontal scroll.
- [ ] **Kanban**: columns snap one at a time; each card shows grip + ⋯ menu **without hovering**; drag by the grip works by touch.
- [ ] Team, Settings tabs, Activity filters, Calendar, bottom-nav **More** drawer.

## ♿ Accessibility

- [ ] **Skip to content:** press <kbd>Tab</kbd> on a dashboard page → link appears → jumps past the nav.
- [ ] **Reduce motion:** enable the OS setting → dialogs/toasts/task-pulse stop animating.
- [ ] Run **Lighthouse / axe DevTools** on Dashboard, a sprint board, and the Estimator.
- [ ] **Colour contrast (WCAG AA 1.4.3)** — `muted-foreground` text + badges in **both** themes. *The one AA item impossible to verify from code.*
- [ ] Keyboard-only pass over the Kanban board and one dialog (open, operate, `Esc`, focus returns).

> CLAUDE.md still lists Phase 4 (Performance + WCAG) as pending overall — the two items above are
> partial coverage (skip-link, reduced-motion), not a full pass.

---

## Known pre-existing tech debt (found by an earlier QA pass, NOT introduced by recent work)

`npm run lint` → **18 errors / 22 warnings** (was 19; `notifications-store.ts` `prefer-const` fixed).
`next build` passes regardless, so none are release-blocking:

| Where | Count | Issue |
|---|---|---|
| `components/features/tasks/TaskCommentSection.tsx` | ~15 | React Compiler: *"Cannot access refs during render"* (the @mention autocomplete reads refs while rendering) |
| `app/(dashboard)/dashboard/page.tsx:173` | 1 | *"Cannot call impure function during render"* |
| `components/features/proposals/ProposalEditorClient.tsx` | 1 | React Compiler can't preserve the `analyzeDiscovery` memo — deps are `[quote?.discovery]` but it infers `quote` |
| misc | warnings | unused vars, one `<img>` (use `next/image`), one `useEffect` missing dep |

**Recommendation:** worth a dedicated cleanup pass — especially the ref-during-render ones, which
React Compiler flags because they *can* misbehave. Not urgent; just don't let the count grow.

## Notes / issues found while running this checklist

- …
