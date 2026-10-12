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
   * Log time (Add time, and Stop on the timer). Accepted assignees only — the
   * database's insert policy says the same. Nobody edits the total: it is
   * derived from time entries (0048); an admin corrects an ENTRY instead.
   */
  canLogTime: boolean;
}

/**
 * Rules (Workflow Phase C): only **accepted** assignees log hours. Managers,
 * admins who aren't on the task, pending assignees and viewers cannot.
 */
export function useTimeTrackingAccess(task: Task | null): TimeTrackingAccess | null {
  const authId = useAuthStore((s) => s.user.authId);
  const demoId = useAuthStore((s) => s.user.id);
  const { canEditTask } = usePermissions();
  const userId = authId ?? String(demoId);

  return useMemo(() => {
    if (!task) return null;
    const isAssignee = task.assignees.some(
      (a) => a.profile_id === userId && a.status === "accepted"
    );
    return {
      isAssignee,
      canUseSessionTimer: Boolean(canEditTask && isAssignee),
      canLogTime: Boolean(canEditTask && isAssignee),
    };
  }, [task, userId, canEditTask]);
}
