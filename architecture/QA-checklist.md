# QA Checklist — click-through verification

> **What's already machine-verified** (no browser needed): `tsc --noEmit` clean ·
> `next build` clean · migrations `0001–0028` applied on the remote · generated
> types match the live DB · assignment engine self-check **48 asserts pass**
> (`lib/assignment/plan.check.ts`) · Zoho token round-trip + live CRM reads
> probed directly · `zoho_connection` RLS canary-tested (anon cannot read or
> write) · ESLint: **no issues in any file added this session**.
>
> **What only a human can do** is everything below. Tick as you confirm; note
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

## 🟠 Estimator → project → schedule (the newest, least-tested path)

- [ ] **Guided:** new estimate → Shopify → questionnaire does NOT re-ask platform / e-commerce / hosting → **Generate line items** → Timeline shows.
- [ ] **Catalog:** browse catalog dialog → add items → tentative Timeline appears → Review exports PDF + Excel.
- [ ] **Start project → Manual:** creates project + phase sprints + tasks, **unassigned**.
- [ ] **Start project → Best-fit:** each dev/QA task gets an assignee; go-live/hosting work lands on the InMotion-skilled dev; QA lands on a QA-skilled dev.
- [ ] **Start project → Fastest:** work is spread across *more* devs than Best-fit; finish date is the same or earlier.
- [ ] Nobody is assigned a task whose skill they lack (spot-check 3 tasks against Team → skills).
- [ ] Design/discovery tasks are **unassigned but still dated** (expected — no dev has design skills).
- [ ] Tasks appear **immediately** after conversion (this was the "empty project" bug) — no refresh needed.
- [ ] Project page shows the **Timeline** section (project-scoped Gantt).
- [ ] Edit a sprint's dates → the Gantt bar moves.
- [ ] **Sync schedule from estimate** → "already up to date" on a second run (idempotent).
- [ ] Assignments arrive as **pending** → the dev sees accept/reject/pass.

## 🔌 Zoho CRM

- [ ] `/api/zoho/status` (as admin) → `configured: true, connected: true`.
- [ ] **Test** button → toasts "Strategic Connection".
- [ ] **Tomorrow**, hit Test again → still works (proves the ~1h access-token refresh; the most common silent OAuth failure).
### Client lookup — Accounts → Contacts (Estimator → Setup → "Find in Zoho")

Expected values below were pulled live from the CRM, so they're exact:

- [ ] `openarc` → **OpenArc LLC**; click it → **2 contacts: Mike Carpenter (General Manager, Consulting Services), Joel Reed (CEO)**.
- [ ] `myrtle` → **19 companies** (Myrtle Beach Regional Economic Development Corporation, Monarch Roofing…).
- [ ] **Person-name fallback:** `kresimir` or `glorioso` → no company matches by name, so it returns **FinOps Partners** badged **"via Kresimir (Kreso) Marusic" / "via Russell Glorioso"**.
- [ ] Back arrow returns to the company list; **"Use the company only"** works (no contact chosen).
- [ ] Picking a contact fills the Client field + toast naming the contact.
- [ ] **Reload the page — the client must still be there.** (Persisting `proposals.zoho` needs `quoteUpdatePayload()` *and* `updateProposal`'s `Pick<>` to whitelist the column; a miss fails silently.)
- [ ] **Dialog does not change height** between empty / loading / results / no-match.

### Deal → Estimate import (Estimator → "Import from Zoho")

- [ ] **Proposal Requested** shows exactly **2** deals: *Web Build* (Trade International 2020, LLC, closes Jul 7 2027) and *John Doe Accounting*.
- [ ] Other stage chips: Discovery **25+**, Negotiation **21** (incl. *Website Edits FlagrantFoul23*, **$3,250**), Verbal Yes **9**.
- [ ] Free-text search finds a deal by name/company.
- [ ] Pick one → new quote opens pre-filled (title + client) with an **"Imported from Zoho CRM"** panel showing deal, stage, contact, rep, target close.
- [ ] **View in Zoho** opens the right CRM record — *this URL is constructed by us, not returned by Zoho, so it's the piece most worth confirming.*
- [ ] Deals with `Amount: 0` show **no** figure (correct — most real deals have 0).

### Access + connection

- [ ] Signed in as a **member**, open `/api/zoho/accounts?q=openarc` → **403** (CRM data is admin/manager only).
- [ ] **Disconnect → Connect** round-trip works.

## 🟢 Mobile pass @ 375px

- [ ] Estimator: Line items (collapsible), Questionnaire, Catalog dialog, Review (no sideways scroll), Timeline (zoom + clickable bars).
- [ ] **Zoho lead dialog**: ~85% of screen height, no iOS zoom on focus, long emails truncate, full-width Cancel reachable.
- [ ] **Workload**: team rows are stacked cards, no horizontal scroll.
- [ ] **Kanban**: columns snap one at a time; each card shows grip + ⋯ menu **without hovering**; drag by the grip works by touch.
- [ ] Team, Settings tabs, Activity filters, Calendar, bottom-nav **More** drawer.

## ♿ Accessibility

- [ ] **Skip to content:** press <kbd>Tab</kbd> on a dashboard page → link appears → jumps past the nav.
- [ ] **Reduce motion:** enable the OS setting → dialogs/toasts/task-pulse stop animating.
- [ ] Run **Lighthouse / axe DevTools** on Dashboard, a sprint board, and the Estimator.
- [ ] **Colour contrast (WCAG AA 1.4.3)** — `muted-foreground` text + badges in **both** themes. *The one AA item impossible to verify from code.*
- [ ] Keyboard-only pass over the Kanban board and one dialog (open, operate, `Esc`, focus returns).

---

## Known pre-existing tech debt (found by this QA pass, NOT introduced by recent work)

`npm run lint` → **19 errors / 22 warnings**, all pre-dating the timeline/assignment/Zoho
work. `next build` passes regardless, so none are release-blocking:

| Where | Count | Issue |
|---|---|---|
| `components/features/tasks/TaskCommentSection.tsx` | ~15 | React Compiler: *"Cannot access refs during render"* (the @mention autocomplete reads refs while rendering) |
| `app/(dashboard)/dashboard/page.tsx:173` | 1 | *"Cannot call impure function during render"* |
| `components/features/proposals/ProposalEditorClient.tsx:265` | 1 | React Compiler can't preserve the `analyzeDiscovery` memo — deps are `[quote?.discovery]` but it infers `quote` |
| misc | warnings | unused vars, one `<img>` (use `next/image`), one `useEffect` missing dep |

Fixed during this pass: `store/notifications-store.ts:160` `prefer-const`.

**Recommendation:** these are correctness smells worth a dedicated cleanup —
especially the ref-during-render ones, which React Compiler is warning about
because they *can* misbehave. Not urgent, but don't let the count grow.

## Notes / issues found

- …
