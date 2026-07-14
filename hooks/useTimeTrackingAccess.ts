"use client";

import { useMemo } from "react";

import { useAuthStore } from "@/store/auth-store";
import { usePermissions } from "@/hooks/usePermissions";
import type { Task } from "@/types/task.types";

export interface TimeTrackingAccess {
  /** Current user has an **accepted** assignment on this task. */
  isAssignee: boolean;
  /** Play / pause / stop — accepted assignees only. */
  canUseSessionTimer: boolean;
  /**
   * Edit saved logged hours (and receive Stop from timer). Accepted assignees
   * log their own; admins may correct. Coordinators/managers cannot log.
   */
  canEditLoggedHours: boolean;
}

/**
 * Rules (Workflow Phase C): only **accepted** assignees log hours; admins may
 * correct. Managers/coordinators and pending assignees cannot. Viewers never edit.
 */
export function useTimeTrackingAccess(task: Task | null): TimeTrackingAccess | null {
  const authId = useAuthStore((s) => s.user.authId);
  const demoId = useAuthStore((s) => s.user.id);
  const role = useAuthStore((s) => s.user.role);
  const { canEditTask } = usePermissions();
  const userId = authId ?? String(demoId);

  return useMemo(() => {
    if (!task) return null;
    const isAssignee = task.assignees.some(
      (a) => a.profile_id === userId && a.status === "accepted"
    );
    const isAdmin = role === "admin";
    return {
      isAssignee,
      canUseSessionTimer: Boolean(canEditTask && isAssignee),
      canEditLoggedHours: Boolean(canEditTask && (isAssignee || isAdmin)),
    };
  }, [task, userId, role, canEditTask]);
}
