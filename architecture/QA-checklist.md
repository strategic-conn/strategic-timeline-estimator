# QA Checklist — click-through verification

> Everything below was verified by `tsc` + `build` + code-tracing, **not** a live
> run. Migrations `0001–0027` are confirmed applied on the remote and the code
> compiles against the live schema. This is the human click-through pass.
> Tick items as you confirm them; note anything that misbehaves.

## 🔴 Must-test — could block real flows (RLS / server guards, `0027` + Phase 2)

- [ ] Create a task, post a comment, add a reaction — all succeed (insert guards force `reporter_id`/`author_id`/`actor_id` = you).
- [ ] Assign a task to a dev → dev **accepts** → **pass** it to another dev — all work (assignment insert pins `assigned_by`).
- [ ] Edit your own profile (name/avatar) saves.
- [ ] A non-admin **cannot** self-change role / page access / activation state.
- [ ] Deactivate a member, then permanently delete them — delete only works once deactivated.
- [ ] Cannot deactivate or delete the **last active admin**.
- [ ] Invite someone → they accept and set a password.
- [ ] Re-send a stuck invite works; **Forgot password** sends a reset link.

## 🟠 Should-test — the big features

- [ ] **Estimator (guided):** new estimate → Shopify → questionnaire does NOT re-ask platform / e-commerce / hosting → **Generate line items** → **Timeline** shows → **Start project** seeds phase-tagged backlog tasks.
- [ ] **Estimator (catalog):** browse catalog (categorized dialog) → add items → tentative **Timeline** appears → **Review** exports PDF + Excel.
- [ ] Switching platform in Setup re-syncs the guided questionnaire.
- [ ] **Skills:** add skills in Settings and on a teammate (Team → ⭐); suggestions appear.
- [ ] **Notification bell:** trigger one (assign a task) → shows the actor's avatar; unread state + mark-read work.

## 🟢 Mobile pass @ 375px

- [ ] Estimator: Line items (collapsible rows), Questionnaire (numbered stepper), Catalog dialog (roomy), Review (no sideways scroll), Timeline (zoom + clickable bars).
- [ ] Team: members + pending invites stack cleanly (no horizontal scroll).
- [ ] Settings: tab strip scrolls, no orphaned tab.
- [ ] Activity: filters stack, feed reads well.
- [ ] Calendar: grid + legend usable.
- [ ] Bottom nav: 4 tabs + **More** opens the full drawer; "More" highlights on secondary pages.
- [ ] Workload: team rows render as stacked cards (no sideways scroll); utilization bar + task links read cleanly.
- [ ] Kanban: columns scroll/snap one-at-a-time; each card shows the **grip + ⋯ menu (Status/Edit/Delete) without hovering**; status change + drag-by-handle work by touch.

## ♿ Accessibility (Phase 4)

Fixed + build-verified:

- [ ] **Skip to content:** on any dashboard page, press <kbd>Tab</kbd> once — a "Skip to content" link appears top-left; activating it jumps focus past the nav to the main region.
- [ ] **Reduce motion:** enable OS "reduce motion" → dialogs/toasts/task-link pulse no longer animate.

Already in place (spot-check): `<html lang>`, `<main>` landmark, per-route page titles, icon-only buttons all have `aria-label`/`sr-only` names, no `<img>` missing `alt`, no click-only `<div>`s.

Still needs a live tool (can't run headless here):

- [ ] Run **Lighthouse / axe DevTools** on 2–3 key pages (Dashboard, a sprint board, Estimator) — target no critical violations.
- [ ] **Color contrast (WCAG 1.4.3 AA):** verify `muted-foreground` text and badges hit 4.5:1 (3:1 for large text) in **both** themes — the one AA area not verifiable from code.
- [ ] Keyboard-only walkthrough of the Kanban board + a dialog (open, operate, `Esc` closes, focus returns).

## Notes / issues found

- …
