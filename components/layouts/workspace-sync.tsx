"use client";

import * as React from "react";

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useActivityStore } from "@/store/activity-store";
import { useAuthStore } from "@/store/auth-store";
import { useAvailabilityStore } from "@/store/availability-store";
import { useMemberSkillsStore } from "@/store/member-skills-store";
import { useNotificationsStore } from "@/store/notifications-store";
import { useProjectsStore } from "@/store/projects-store";
import { useProposalEstimatorStore } from "@/store/proposal-estimator-store";
import { useSprintsStore } from "@/store/sprints-store";
import { useTasksDataStore } from "@/store/tasks-store";
import { useTeamStore } from "@/store/team-store";
import { useTourStore } from "@/store/tour-store";
import { useHolidaySettingsStore } from "@/store/holiday-settings-store";
import { useWeeklyCapacityStore } from "@/store/weekly-capacity-store";
import { useHourlyRatesStore } from "@/store/hourly-rates-store";
import type { Database } from "@/types/database.types";
import type { RealtimeChannel } from "@supabase/supabase-js";

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];
type ActivityRow = Database["public"]["Tables"]["activity"]["Row"];
type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type SprintRow = Database["public"]["Tables"]["sprints"]["Row"];
type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type CommentRow = Database["public"]["Tables"]["task_comments"]["Row"];
type AvailabilityRow =
  Database["public"]["Tables"]["availability_entries"]["Row"];
type CapacityRow = Database["public"]["Tables"]["weekly_capacity"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type AssigneeKey = { task_id: string; profile_id: string };
type AssigneeRow = AssigneeKey & {
  status: import("@/types/task.types").AssignmentStatus;
  assigned_by: string | null;
  responded_at: string | null;
  note: string | null;
};
type ReactionKey = { comment_id: string; profile_id: string; emoji: string };

/**
 * Create realtime channels only once the socket carries the user's JWT.
 *
 * ⚠️ `postgres_changes` bindings are RLS-checked SERVER-SIDE AT JOIN TIME, and
 * the check uses the token the SOCKET carries — not the one REST calls use. Join
 * before the session has resolved and the bindings are registered as `anon`,
 * match nothing, and stay dead for the life of the channel. Handing the socket a
 * token afterwards does NOT re-evaluate them.
 *
 * It fails completely silently, which is why it survived so long: the channel
 * reports `SUBSCRIBED`, the socket's token reads `authenticated` a moment later,
 * Broadcast works (no RLS on it), and the replication slots stay active and
 * caught up. Nothing anywhere looks wrong — the handlers simply never fire.
 * Measured: a channel created after page load receives INSERT and UPDATE on the
 * very same socket where `workspace:board` receives nothing.
 *
 * With `@supabase/ssr` the session comes from cookies, so it resolves a tick
 * after mount — which made this a RACE. That is the whole explanation for
 * "realtime worked this morning and not this afternoon".
 *
 * ⚠️ `setAuth()` is called with NO ARGUMENT on purpose. Passing an explicit
 * token marks it manually-set, which permanently disables supabase-js's own
 * refresh callback (`RealtimeClient._performAuth`) — the socket would then keep
 * a token that expires in an hour and every channel would go quiet mid-session.
 * With no argument it resolves the current session and keeps refreshing itself
 * on each heartbeat, so there is nothing here to maintain.
 *
 * Returns a teardown for the effect. `build` is skipped entirely if the effect
 * is cleaned up before the token arrives, so a fast unmount cannot leak a
 * channel that nothing holds a reference to.
 */
function liveChannels(
  supabase: ReturnType<typeof createClient>,
  build: () => RealtimeChannel[],
): () => void {
  let channels: RealtimeChannel[] = [];
  let cancelled = false;

  void (async () => {
    try {
      await supabase.realtime.setAuth();
    } catch {
      /* Subscribe anyway — a broken channel beats no channel, and the
         heartbeat's own refresh gets another chance at the token. */
    }
    if (cancelled) return;
    channels = build();
  })();

  return () => {
    cancelled = true;
    for (const channel of channels) void supabase.removeChannel(channel);
  };
}

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
  const hydrateAvailability = useAvailabilityStore(
    (s) => s.hydrateFromSupabase,
  );
  const hydrateCapacity = useWeeklyCapacityStore((s) => s.hydrateFromSupabase);
  const hydrateRates = useHourlyRatesStore((s) => s.hydrateFromSupabase);
  const hydrateProposals = useProposalEstimatorStore(
    (s) => s.hydrateFromSupabase,
  );
  const hydrateSkills = useMemberSkillsStore((s) => s.hydrateFromSupabase);
  const hydrateTours = useTourStore((s) => s.hydrateFromSupabase);
  const hydrateHolidays = useHolidaySettingsStore((s) => s.hydrateFromSupabase);

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
    void hydrateRates();
    void hydrateProposals();
    void hydrateSkills();
    void hydrateTours(authId);
    void hydrateHolidays();
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
    hydrateRates,
    hydrateProposals,
    hydrateSkills,
    hydrateTours,
    hydrateHolidays,
  ]);

  // Live notifications: stream this user's rows (RLS already scopes to them).
  React.useEffect(() => {
    if (!isSupabaseConfigured || !authId) return;
    const supabase = createClient();
    const filter = `recipient_id=eq.${authId}`;
    return liveChannels(supabase, () => [
      supabase
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
        .subscribe(),
    ]);
  }, [authId, applyInsert, applyUpdate, applyDelete]);

  // Workspace activity log: stream every new entry (RLS allows all authenticated
  // users to read activity, so the whole team's feed updates live).
  React.useEffect(() => {
    if (!isSupabaseConfigured || !authId) return;
    const supabase = createClient();
    return liveChannels(supabase, () => [
      supabase
        .channel("activity:workspace")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "activity" },
          (payload) => applyActivityInsert(payload.new as ActivityRow),
        )
        .subscribe(),
    ]);
  }, [authId, applyActivityInsert]);

  // Board realtime: projects / sprints / tasks (+ assignees) and comments
  // (+ reactions) stream to everyone. Handlers read stores via getState() so the
  // subscription only depends on authId (no re-subscribe churn). All appliers
  // are idempotent, so our own echoed writes are harmless.
  React.useEffect(() => {
    if (!isSupabaseConfigured || !authId) return;
    const supabase = createClient();
    // Subscribes only after the socket is authed — see `liveChannels`.
    return liveChannels(supabase, () => [
      supabase
        .channel("workspace:board")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "projects" },
          (p) => {
            const store = useProjectsStore.getState();
            if (p.eventType === "DELETE") {
              const id = (p.old as { id: string }).id;
              store.applyRealtimeDelete(id);
              // Mirror the FK cascade: Postgres has already nulled
              // `proposals.project_id`, and proposals have no channel of their own.
              useProposalEstimatorStore.getState().applyProjectDeleted(id);
            } else store.applyRealtimeUpsert(p.new as ProjectRow);
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
              store.applyRealtimeReaction(
                r.comment_id,
                r.profile_id,
                r.emoji,
                true,
              );
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
        .subscribe(),

      /**
       * The SCHEDULING tables (0037), on their own channel.
       *
       * Separate from `workspace:board` deliberately: the board is what the Gantt
       * draws, this is what shapes it. Keeping them apart means a subscription
       * problem on one does not silently take the other down with it, and the
       * reason each table is here stays legible.
       *
       * Everything below feeds a number a second person can be looking at right
       * now — a timeline, a capacity bar, a calendar grid. They were all
       * hydrate-once until now: correct on load, then quietly stale.
       */
      supabase
        .channel("workspace:scheduling")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "availability_entries" },
          (p) => {
            const store = useAvailabilityStore.getState();
            if (p.eventType === "DELETE")
              store.applyRealtimeDelete((p.old as { id: string }).id);
            else store.applyRealtimeUpsert(p.new as AvailabilityRow);
          },
        )
        .on(
          "postgres_changes",
          // Hourly rates (0042) — live so a rate an admin changes reaches a
          // manager's open estimator before new lines snapshot it. RLS delivers
          // nothing to members and viewers, which is correct for them.
          { event: "*", schema: "public", table: "hourly_rates" },
          (p) => {
            const store = useHourlyRatesStore.getState();
            if (p.eventType === "DELETE") {
              const o = p.old as { responsible: string; level: 1 | 2 };
              store.applyRealtimeDelete(o.responsible, o.level);
            } else {
              store.applyRealtimeUpsert(
                p.new as Database["public"]["Tables"]["hourly_rates"]["Row"],
              );
            }
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "weekly_capacity" },
          (p) => {
            const store = useWeeklyCapacityStore.getState();
            if (p.eventType === "DELETE")
              store.applyRealtimeDelete(
                (p.old as { profile_id: string }).profile_id,
              );
            else {
              const r = p.new as CapacityRow;
              store.applyRealtimeUpsert(r.profile_id, Number(r.hours_per_week));
            }
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "profiles" },
          (p) => {
            const store = useTeamStore.getState();
            if (p.eventType === "DELETE")
              store.applyRealtimeDelete((p.old as { id: string }).id);
            else store.applyRealtimeUpsert(p.new as ProfileRow);
          },
        )
        .subscribe(),
    ]);
  }, [authId]);

  return null;
}
