"use client";

import { useMemo } from "react";

import { useAuthStore } from "@/store/auth-store";
import { usePermissions } from "@/hooks/usePermissions";
import type { Task } from "@/types/task.types";

export interface TimeTrackingAccess {
  /** Current user is in `task.assignee_ids`. */
  isAssignee: boolean;
  /** Play / pause / stop — assignees only (requires edit permission). */
  canUseSessionTimer: boolean;
  /**
   * Edit saved logged hours manually (and receive Stop from timer).
   * Assignees, or manager/admin corrections.
   */
  canEditLoggedHours: boolean;
}

/**
 * Rules: session timer only for assignees; saved hours editable by assignees
 * or manager/admin for corrections. Viewers never edit.
 */
export function useTimeTrackingAccess(task: Task | null): TimeTrackingAccess | null {
  const authId = useAuthStore((s) => s.user.authId);
  const demoId = useAuthStore((s) => s.user.id);
  const role = useAuthStore((s) => s.user.role);
  const { canEditTask } = usePermissions();
  const userId = authId ?? String(demoId);

  return useMemo(() => {
    if (!task) return null;
    const isAssignee = task.assignee_ids.includes(userId);
    const isManagerOrAdmin = role === "admin" || role === "manager";
    return {
      isAssignee,
      canUseSessionTimer: Boolean(canEditTask && isAssignee),
      canEditLoggedHours: Boolean(
        canEditTask && (isAssignee || isManagerOrAdmin)
      ),
    };
  }, [task, userId, role, canEditTask]);
}
