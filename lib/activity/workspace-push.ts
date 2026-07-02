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
 * Send a targeted notification (the bell) to specific people. The actor is
 * always excluded by the store. Use alongside pushWorkspaceActivity when an
 * action concerns particular teammates (assignees, reporter, @-mentions).
 */
export function notifyUsers(
  recipientIds: string[],
  text: string,
  href?: string,
  projectId?: string | null,
): void {
  useNotificationsStore
    .getState()
    .notify(recipientIds, text, href, projectId ?? undefined);
}
