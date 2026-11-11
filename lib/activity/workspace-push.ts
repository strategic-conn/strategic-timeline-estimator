import { useActivityStore } from "@/store/activity-store";
import { useNotificationsStore } from "@/store/notifications-store";

/**
 * Record a workspace event in the activity log (the /activity feed — visible to
 * everyone). Call from domain stores after commits.
 */
export function pushWorkspaceActivity(
  summary: string,
  href?: string,
  projectId?: string | null,
): void {
  useActivityStore.getState().log(summary, href, projectId ?? undefined);
}

type NotifyOpts = {
  includeSelf?: boolean;
  email?: boolean;
  /** Collect into this batch even if called after the batch's scope ended. */
  batch?: NoticeBatch | null;
};

type BatchedNotice = {
  recipientIds: string[];
  text: string;
  href?: string;
  projectId?: string | null;
  email: boolean;
};

/**
 * Notices collected during one bulk change (Sync schedule, a time-off
 * reschedule) and sent as ONE per person — twenty re-houred tasks must not
 * become twenty emails.
 */
export type NoticeBatch = {
  items: BatchedNotice[];
  flushed: boolean;
  /** The summary line for someone with more than one change in the batch. */
  summary: (count: number) => string;
  href?: string;
  projectId?: string | null;
};

let active: NoticeBatch | null = null;

/** The batch a caller is inside, if any — capture it before an `await`. */
export function currentNoticeBatch(): NoticeBatch | null {
  return active;
}

/**
 * Per recipient: their own notices, in order. One notice keeps its own words;
 * several become the batch's summary, emailed if any of them was. Pure.
 */
export function groupBatch(
  items: BatchedNotice[],
): Map<string, { count: number; first: BatchedNotice; email: boolean }> {
  const out = new Map<string, { count: number; first: BatchedNotice; email: boolean }>();
  for (const it of items) {
    for (const r of new Set(it.recipientIds)) {
      const cur = out.get(r);
      if (cur) {
        cur.count += 1;
        cur.email ||= it.email;
      } else out.set(r, { count: 1, first: it, email: it.email });
    }
  }
  return out;
}

function flush(batch: NoticeBatch) {
  if (batch.flushed) return;
  batch.flushed = true;
  for (const [recipient, g] of groupBatch(batch.items)) {
    if (g.count === 1) {
      send([recipient], g.first.text, g.first.href, g.first.projectId, { email: g.email });
    } else {
      send([recipient], batch.summary(g.count), batch.href, batch.projectId, { email: g.email });
    }
  }
}

/**
 * Run `fn` with every notice it sends collected into one batch, then send one
 * per person. The batch stays open for `settleMs` so writes that notify after
 * their `await` (a live delete) still land in it; anything later goes out on
 * its own.
 */
export function batchNotifications(
  opts: Pick<NoticeBatch, "summary" | "href" | "projectId">,
  fn: () => void,
  settleMs = 4000,
): void {
  const batch: NoticeBatch = { items: [], flushed: false, ...opts };
  const prev = active;
  active = batch;
  try {
    fn();
  } finally {
    active = prev;
  }
  setTimeout(() => flush(batch), settleMs);
}

function send(
  recipientIds: string[],
  text: string,
  href?: string,
  projectId?: string | null,
  opts?: { includeSelf?: boolean; email?: boolean },
) {
  useNotificationsStore
    .getState()
    .notify(recipientIds, text, href, projectId ?? undefined, opts);
}

/**
 * Send a targeted notification (the bell) to specific people. Use alongside
 * pushWorkspaceActivity when an action concerns particular teammates (assignees,
 * reporter, @-mentions).
 *
 * The store drops the actor by default. `includeSelf` keeps them, for events the
 * app noticed rather than the user performing. `email` also emails a copy —
 * keep it for the important events: assignments and being taken off a task,
 * changes to a task's due date / hours / sprint, a deleted task you were on,
 * sprint dates moving under your work, mentions, time off, won deals.
 * Inside `batchNotifications` it is collected and sent once per person.
 */
export function notifyUsers(
  recipientIds: string[],
  text: string,
  href?: string,
  projectId?: string | null,
  opts?: NotifyOpts,
): void {
  const batch = opts?.batch ?? active;
  if (batch && !batch.flushed && !opts?.includeSelf) {
    batch.items.push({ recipientIds, text, href, projectId, email: Boolean(opts?.email) });
    return;
  }
  send(recipientIds, text, href, projectId, {
    includeSelf: opts?.includeSelf,
    email: opts?.email,
  });
}
