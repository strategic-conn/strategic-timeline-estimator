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

/**
 * Send a targeted notification (the bell) to specific people. Use alongside
 * pushWorkspaceActivity when an action concerns particular teammates (assignees,
 * reporter, @-mentions).
 *
 * The store drops the actor by default. `includeSelf` keeps them, for events the
 * app noticed rather than the user performing. `email` also emails a copy —
 * keep it for the important events (assignments, mentions, time off, won deals).
 */
export function notifyUsers(
  recipientIds: string[],
  text: string,
  href?: string,
  projectId?: string | null,
  opts?: { includeSelf?: boolean; email?: boolean },
): void {
  useNotificationsStore
    .getState()
    .notify(recipientIds, text, href, projectId ?? undefined, opts);
}
