"use client";

import * as React from "react";

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useActivityStore } from "@/store/activity-store";
import { useAuthStore } from "@/store/auth-store";
import { useAvailabilityStore } from "@/store/availability-store";
import { useNotificationsStore } from "@/store/notifications-store";
import { useProjectsStore } from "@/store/projects-store";
import { useProposalEstimatorStore } from "@/store/proposal-estimator-store";
import { useSprintsStore } from "@/store/sprints-store";
import { useTasksDataStore } from "@/store/tasks-store";
import { useTeamStore } from "@/store/team-store";
import { useWeeklyCapacityStore } from "@/store/weekly-capacity-store";
import type { Database } from "@/types/database.types";

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];
type ActivityRow = Database["public"]["Tables"]["activity"]["Row"];
type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type SprintRow = Database["public"]["Tables"]["sprints"]["Row"];
type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type CommentRow = Database["public"]["Tables"]["task_comments"]["Row"];
type AssigneeKey = { task_id: string; profile_id: string };
type AssigneeRow = AssigneeKey & {
  status: import("@/types/task.types").AssignmentStatus;
  assigned_by: string | null;
  responded_at: string | null;
  note: string | null;
};
type ReactionKey = { comment_id: string; profile_id: string; emoji: string };

/**
 * Hydrates the Supabase-backed workspace stores once the user is authenticated,
 * and opens the realtime channel for notifications. Renders nothing. No-ops in
 * demo mode — a single place that loads/streams live data.
 */
export function WorkspaceSync() {
  const authId = useAuthStore((s) => s.user.authId);
  const hydrateProjects = useProjectsStore((s) => s.hydrateFromSupabase);
  const hydrateSprints = useSprintsStore((s) => s.hydrateFromSupabase);
  const hydrateTasks = useTasksDataStore((s) => s.hydrateFromSupabase);
  const hydrateTeam = useTeamStore((s) => s.hydrateFromSupabase);
  const hydrateNotifications = useNotificationsStore(
    (s) => s.hydrateFromSupabase,
  );
  const applyInsert = useNotificationsStore((s) => s.applyRealtimeInsert);
  const applyUpdate = useNotificationsStore((s) => s.applyRealtimeUpdate);
  const applyDelete = useNotificationsStore((s) => s.applyRealtimeDelete);
  const hydrateActivity = useActivityStore((s) => s.hydrateFromSupabase);
  const applyActivityInsert = useActivityStore((s) => s.applyRealtimeInsert);
  const hydrateAvailability = useAvailabilityStore((s) => s.hydrateFromSupabase);
  const hydrateCapacity = useWeeklyCapacityStore((s) => s.hydrateFromSupabase);
  const hydrateProposals = useProposalEstimatorStore(
    (s) => s.hydrateFromSupabase,
  );

  React.useEffect(() => {
    if (!isSupabaseConfigured || !authId) return;
    void hydrateProjects();
    void hydrateSprints();
    void hydrateTasks();
    void hydrateTeam();
    void hydrateNotifications();
    void hydrateActivity();
    void hydrateAvailability();
    void hydrateCapacity();
    void hydrateProposals();
  }, [
    authId,
    hydrateProjects,
    hydrateSprints,
    hydrateTasks,
    hydrateTeam,
    hydrateNotifications,
    hydrateActivity,
    hydrateAvailability,
    hydrateCapacity,
    hydrateProposals,
  ]);

  // Live notifications: stream this user's rows (RLS already scopes to them).
  React.useEffect(() => {
    if (!isSupabaseConfigured || !authId) return;
    const supabase = createClient();
    const filter = `recipient_id=eq.${authId}`;
    const channel = supabase
      .channel(`notifications:${authId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter },
        (payload) => applyInsert(payload.new as NotificationRow),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter },
        (payload) => applyUpdate(payload.new as NotificationRow),
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "notifications", filter },
        (payload) => applyDelete((payload.old as { id: string }).id),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [authId, applyInsert, applyUpdate, applyDelete]);

  // Workspace activity log: stream every new entry (RLS allows all authenticated
  // users to read activity, so the whole team's feed updates live).
  React.useEffect(() => {
    if (!isSupabaseConfigured || !authId) return;
    const supabase = createClient();
    const channel = supabase
      .channel("activity:workspace")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity" },
        (payload) => applyActivityInsert(payload.new as ActivityRow),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [authId, applyActivityInsert]);

  // Board realtime: projects / sprints / tasks (+ assignees) and comments
  // (+ reactions) stream to everyone. Handlers read stores via getState() so the
  // subscription only depends on authId (no re-subscribe churn). All appliers
  // are idempotent, so our own echoed writes are harmless.
  React.useEffect(() => {
    if (!isSupabaseConfigured || !authId) return;
    const supabase = createClient();
    const channel = supabase
      .channel("workspace:board")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        (p) => {
          const store = useProjectsStore.getState();
          if (p.eventType === "DELETE")
            store.applyRealtimeDelete((p.old as { id: string }).id);
          else store.applyRealtimeUpsert(p.new as ProjectRow);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sprints" },
        (p) => {
          const store = useSprintsStore.getState();
          if (p.eventType === "DELETE")
            store.applyRealtimeDelete((p.old as { id: string }).id);
          else store.applyRealtimeUpsert(p.new as SprintRow);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        (p) => {
          const store = useTasksDataStore.getState();
          if (p.eventType === "DELETE")
            store.applyRealtimeTaskDelete((p.old as { id: string }).id);
          else store.applyRealtimeTaskUpsert(p.new as TaskRow);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_assignees" },
        (p) => {
          const store = useTasksDataStore.getState();
          if (p.eventType === "DELETE") {
            const r = p.old as AssigneeKey;
            store.applyRealtimeAssignmentDelete(r.task_id, r.profile_id);
          } else {
            const r = p.new as AssigneeRow;
            store.applyRealtimeAssignmentUpsert(r.task_id, {
              profile_id: r.profile_id,
              status: r.status,
              assigned_by: r.assigned_by,
              responded_at: r.responded_at,
              note: r.note,
            });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_comments" },
        (p) => {
          const store = useTasksDataStore.getState();
          if (p.eventType === "INSERT")
            store.applyRealtimeCommentInsert(p.new as CommentRow);
          else if (p.eventType === "UPDATE")
            store.applyRealtimeCommentUpdate(p.new as CommentRow);
          else store.applyRealtimeCommentDelete((p.old as { id: string }).id);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comment_reactions" },
        (p) => {
          const store = useTasksDataStore.getState();
          if (p.eventType === "INSERT") {
            const r = p.new as ReactionKey;
            store.applyRealtimeReaction(r.comment_id, r.profile_id, r.emoji, true);
          } else if (p.eventType === "DELETE") {
            const r = p.old as ReactionKey;
            store.applyRealtimeReaction(
              r.comment_id,
              r.profile_id,
              r.emoji,
              false,
            );
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [authId]);

  return null;
}
