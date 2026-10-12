/**
 * Keeping an estimate and the project it became in step, both ways.
 *
 * The pair is identified by `tasks.source_line_item_id` ↔
 * `proposals.line_items[].id` (migrations 0032/0033). Before that column the
 * only link was the task's TITLE, which made every interesting edit break:
 * renaming a line item produced a second task, deleting one orphaned its task
 * forever, changing its hours did nothing at all, and nothing could travel back
 * from the project because a task could not say which line item it was.
 *
 * A task with a NULL `source_line_item_id` was made by hand. Nothing here ever
 * touches one — not to rename it, not to delete it.
 */
import {
  computeLineHours,
  effectiveTier,
  lineEffectiveHours,
  roundHours,
  tierMultiplier,
} from "@/lib/constants/proposal-estimator";
import type { ProposalLineItem } from "@/types/proposal.types";
import type { Task } from "@/types/task.types";

/* ────────────────────────────────────────────────────────────────────────── */
/*  Estimate → Project                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

/** One task that has to change for the project to match the estimate. */
export type TaskPatch = {
  taskId: string;
  title?: string;
  estimated_hours?: number;
};

export type EstimateToProject = {
  /** Line items with no task yet. */
  create: ProposalLineItem[];
  /** Tasks whose linked line item has changed under them. */
  update: TaskPatch[];
  /** Tasks whose line item is gone from the estimate, and which are safe to drop. */
  remove: Task[];
  /**
   * Tasks whose line item is gone but which somebody has already logged time
   * against. NOT deleted — `time_entries.task_id` is `on delete cascade`
   * (migration 0017), so removing one of these would silently destroy the record
   * that the work happened, and per-person hours come from exactly that table.
   * Dropping a line from a quote is a scoping decision; erasing worked hours is
   * not, so these are reported for a human to deal with.
   */
  orphaned: Task[];
};

/**
 * What the project needs so it matches the estimate.
 *
 * Replaces the old additive-only rule (`newSeeds` = line items whose TITLE was
 * not already a task title), which is why a rename duplicated and a delete
 * never cleaned up.
 */
export function diffEstimateToProject(
  lineItems: ProposalLineItem[],
  projectTasks: Task[],
  requirementsUnclear: boolean,
): EstimateToProject {
  const seeds = lineItems.filter((li) => li.title.trim());
  const byLineId = new Map<string, Task>();
  for (const t of projectTasks) {
    // Only ever consider tasks this app seeded. A hand-made task is somebody's
    // own work and is not the estimate's to rewrite or delete.
    if (t.source_line_item_id) byLineId.set(t.source_line_item_id, t);
  }

  const create: ProposalLineItem[] = [];
  const update: TaskPatch[] = [];
  const seen = new Set<string>();

  for (const li of seeds) {
    seen.add(li.id);
    const task = byLineId.get(li.id);
    if (!task) {
      create.push(li);
      continue;
    }
    const patch: TaskPatch = { taskId: task.id };
    let changed = false;
    if (task.title !== li.title) {
      patch.title = li.title;
      changed = true;
    }
    // `lineEffectiveHours` recomputes from base/tier/quantity rather than
    // reading the row's cached `hours`, so a stale snapshot can't propagate.
    const hours = roundHours(lineEffectiveHours(li, requirementsUnclear));
    if (roundHours(task.estimated_hours ?? 0) !== hours) {
      patch.estimated_hours = hours;
      changed = true;
    }
    if (changed) update.push(patch);
  }

  const gone = [...byLineId.entries()]
    .filter(([lineId]) => !seen.has(lineId))
    .map(([, task]) => task);
  const worked = (t: Task) => (t.logged_hours ?? 0) > 0;

  return {
    create,
    update,
    remove: gone.filter((t) => !worked(t)),
    orphaned: gone.filter(worked),
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Project → Estimate                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Apply a task's new title/hours back onto its line item.
 *
 * Returns a NEW line-item array, or `null` when nothing changed — the caller
 * skips the write, so a no-op edit does not bump `updated_at` and reshuffle a
 * list sorted by it.
 *
 * Hours are pushed back through `base_hours` rather than written to `hours`
 * directly: `hours` is derived (`base × tier × quantity`), so setting it alone
 * would leave the row internally inconsistent and the next estimate-side
 * recompute would silently undo the change.
 */
export function applyTaskToLineItems(
  lineItems: ProposalLineItem[],
  lineItemId: string,
  patch: { title?: string; estimated_hours?: number },
  requirementsUnclear: boolean,
): ProposalLineItem[] | null {
  const i = lineItems.findIndex((li) => li.id === lineItemId);
  if (i === -1) return null;

  const li = lineItems[i];
  const next: ProposalLineItem = { ...li };
  let changed = false;

  if (patch.title !== undefined && patch.title !== li.title) {
    next.title = patch.title;
    changed = true;
  }

  if (patch.estimated_hours !== undefined) {
    const wanted = roundHours(patch.estimated_hours);
    if (roundHours(lineEffectiveHours(li, requirementsUnclear)) !== wanted) {
      // Invert the same formula the estimate prices with, "requirements
      // unclear" included — otherwise a quote in that mode would come back
      // 1.5x the hours the task was given.
      const qty = li.quantity > 0 ? li.quantity : 1;
      const divisor = tierMultiplier(effectiveTier(li.tier, requirementsUnclear)) * qty;
      next.base_hours = roundHours(divisor > 0 ? wanted / divisor : wanted);
      // `hours` is the row's own snapshot (base x its OWN tier x quantity) —
      // the unclear bump is applied on read, not stored.
      next.hours = computeLineHours(next.base_hours, next.tier, next.quantity);
      changed = true;
    }
  }

  if (!changed) return null;
  const out = [...lineItems];
  out[i] = next;
  return out;
}

/**
 * An approved or billed estimate is the price the client agreed to, so task
 * edits on its project no longer flow back into it (the project → estimate
 * mirror stops). The project is the plan from then on; the quote stays what
 * was signed. Billed = a PO exists, by either identifier. Estimate → project
 * (Sync schedule) is unaffected — it is a deliberate, previewed action.
 */
export function quoteIsFrozen(quote: {
  status?: string | null;
  pbs?: { po_no?: string | null; po_id?: string | number | null } | null;
}): boolean {
  return quote.status === "approved" || !!quote.pbs?.po_no || !!quote.pbs?.po_id;
}

/** Drop the line item a deleted task came from. `null` when there was none. */
export function removeLineItem(
  lineItems: ProposalLineItem[],
  lineItemId: string,
): ProposalLineItem[] | null {
  const out = lineItems.filter((li) => li.id !== lineItemId);
  return out.length === lineItems.length ? null : out;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Cross-store bridge                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * A task change that may need mirroring onto an estimate.
 *
 * `proposal-estimator-store` imports `tasks-store`, so the tasks store cannot
 * import it back without a cycle. It registers a handler here instead, and the
 * tasks store calls this without knowing who — or whether anyone — is
 * listening.
 */
export type TaskMirrorEvent =
  | { kind: "update"; task: Task; patch: { title?: string; estimated_hours?: number } }
  | { kind: "delete"; task: Task };

/** Returns how to undo the write, or null when it made none. */
type Handler = (event: TaskMirrorEvent) => (() => void) | null;

let handler: Handler | null = null;
let suppressed = false;

/** Called once by the estimator store. */
export function registerTaskMirror(fn: Handler): void {
  handler = fn;
}

/**
 * Called by the tasks store after a task changes. No-ops if nothing registered.
 *
 * Returns a **revert** function, because the task write it mirrors is
 * optimistic: `updateTask` and `deleteTask` both restore their snapshot when
 * the server refuses, and without this the estimate would keep a change the
 * project had already rolled back — a line item silently dropped from a client
 * quote by a failed request. The caller holds it and calls it on rollback (and
 * on the demo path's Undo).
 */
export function mirrorTaskChange(event: TaskMirrorEvent): (() => void) | null {
  if (suppressed) return null;
  // A task with no line item never came from an estimate — nothing to mirror.
  if (!event.task.source_line_item_id) return null;
  return handler?.(event) ?? null;
}

/**
 * Run the estimate→project half without the project→estimate half echoing
 * back. Sync-only by design: the flag is cleared before any `await` could
 * interleave another caller's work, and everything inside is a synchronous
 * store call whose network write happens after (and is not mirrored).
 */
export function withMirrorSuppressed<T>(fn: () => T): T {
  suppressed = true;
  try {
    return fn();
  } finally {
    suppressed = false;
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  PBS drift                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

/** The project's real schedule: earliest sprint start → latest sprint end. */
export function projectDateRange(
  sprints: { start_date: string; end_date: string }[],
): { start: string; end: string } | null {
  let start: string | null = null;
  let end: string | null = null;
  for (const s of sprints) {
    // ISO dates sort lexically, so no parsing (and no timezone) is involved.
    if (s.start_date && (!start || s.start_date < start)) start = s.start_date;
    if (s.end_date && (!end || s.end_date > end)) end = s.end_date;
  }
  return start && end ? { start, end } : null;
}

/**
 * How far the PO's billed dates have drifted from the project's real schedule.
 * `null` when they agree, or when either side has no dates.
 *
 * Reported rather than corrected: PBS has no update endpoint for a PO (only
 * register/token/refresh/fetch/fetch-all-po/fetch-po/create-po exist), and the
 * dates live in a `po_parameter` record `fetch-po` does not even return. So the
 * only thing this app can do is say so, and someone fixes it in PBS by hand.
 */
export function poScheduleDrift(
  pbs: { start_date?: string | null; end_date?: string | null } | null | undefined,
  project: { start: string; end: string } | null,
): { billed: { start: string; end: string }; actual: { start: string; end: string } } | null {
  if (!pbs?.start_date || !pbs.end_date || !project) return null;
  if (pbs.start_date === project.start && pbs.end_date === project.end) return null;
  return {
    billed: { start: pbs.start_date, end: pbs.end_date },
    actual: project,
  };
}

/**
 * Tell whoever is listening that a project's schedule moved, so the PO billed
 * against it can be checked.
 *
 * Same registry shape as the task mirror, and for the same reason: `sprints-store`
 * cannot import `proposal-estimator-store` (the graph runs the other way).
 */
type ScheduleHandler = (projectId: string) => void;

let scheduleHandler: ScheduleHandler | null = null;

export function registerScheduleWatcher(fn: ScheduleHandler): void {
  scheduleHandler = fn;
}

/** Called by the sprints store after a sprint's dates change, or one is added/removed. */
export function notifyProjectScheduleChanged(projectId: string): void {
  if (suppressed) return;
  scheduleHandler?.(projectId);
}
