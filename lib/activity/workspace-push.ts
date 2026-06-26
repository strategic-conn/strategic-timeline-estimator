import { useNotificationsStore } from "@/store/notifications-store";

/** One row in the bell + /activity feed. Call from domain stores after commits. */
export function pushWorkspaceActivity(
  summary: string,
  href?: string,
  projectId?: string | null,
): void {
  useNotificationsStore.getState().push(summary, href, projectId ?? undefined);
}
