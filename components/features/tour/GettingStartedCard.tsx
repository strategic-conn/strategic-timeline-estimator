"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { CheckCircle2, Circle, CircleDashed, PartyPopper, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccessibleHrefs } from "@/hooks/useNavAccess";
import { usePermissions } from "@/hooks/usePermissions";
import { sprintTasksHref, backlogHref } from "@/lib/constants/sprints";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  checklistItems,
  checklistProgress,
  type ChecklistItem,
} from "@/lib/tours/checklist";
import { tourAnchor } from "@/lib/tours/ids";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import { useProjectsStore } from "@/store/projects-store";
import { useProposalEstimatorStore } from "@/store/proposal-estimator-store";
import { useTasksDataStore } from "@/store/tasks-store";
import { useTeamStore } from "@/store/team-store";
import { useTourStore } from "@/store/tour-store";
import { useWeeklyCapacityStore } from "@/store/weekly-capacity-store";
import {
  useIsNewUser,
  useTourProgress,
  useTourUserId,
} from "@/components/features/tour/use-tours";

/** Has this person logged any time, ever? One row is enough to know. */
function useLoggedAny(userId: string, acceptedLogged: boolean): boolean | null {
  const tasks = useTasksDataStore((s) => s.tasks);
  const [live, setLive] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    if (!isSupabaseConfigured) return;
    let on = true;
    void (async () => {
      const { count, error } = await createClient()
        .from("time_entries")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", userId);
      if (on) setLive(error ? null : (count ?? 0) > 0);
    })();
    return () => {
      on = false;
    };
    // `tasks` re-runs it after a log: logging writes the task's cached total.
  }, [userId, tasks]);
  // Demo has no time_entries table; a task's own logged hours stand in.
  return isSupabaseConfigured ? live : acceptedLogged;
}

/** Admin only: is Zoho connected? Metadata only, never tokens. */
function useZohoConnected(enabled: boolean): boolean | null {
  const [connected, setConnected] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    if (!enabled) return;
    let on = true;
    fetch("/api/zoho/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { connected?: boolean } | null) => {
        if (on) setConnected(j ? Boolean(j.connected) : false);
      })
      .catch(() => on && setConnected(false));
    return () => {
      on = false;
    };
  }, [enabled]);
  return connected;
}

/**
 * Getting started (docs/onboarding-tour-plan.md §5a). Lives at the top of the
 * Dashboard's sidebar column. Each item ticks itself from real data; "Show me"
 * opens the page and starts its tour at the step that points at the control.
 */
export function GettingStartedCard({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const userId = useTourUserId();
  const user = useAuthStore((s) => s.user);
  const perms = usePermissions();
  const accessible = useAccessibleHrefs();
  const progress = useTourProgress();
  const isNew = useIsNewUser();
  const record = useTourStore((s) => s.record);
  const setPending = useTourStore((s) => s.setPending);
  const checklistOpen = useTourStore((s) => s.checklistOpen);
  const closeChecklist = useTourStore((s) => s.closeChecklist);
  const openChecklist = useTourStore((s) => s.openChecklist);

  const tasks = useTasksDataStore((s) => s.tasks);
  const tasksLoaded = useTasksDataStore((s) => s.loaded);
  const projects = useProjectsStore((s) => s.projects);
  const projectsLoaded = useProjectsStore((s) => s.loaded);
  const proposals = useProposalEstimatorStore((s) => s.proposals);
  const proposalsLoaded = useProposalEstimatorStore((s) => s.loaded);
  const members = useTeamStore((s) => s.members);
  const teamLoaded = useTeamStore((s) => s.loaded);
  const capacity = useWeeklyCapacityStore((s) => s.overrides);
  const capacityLoaded = useWeeklyCapacityStore((s) => s.loaded);

  const mine = React.useMemo(() => {
    let accepted = 0;
    let pending = 0;
    let acceptedLogged = false;
    let firstAcceptedHref: string | null = null;
    for (const t of tasks) {
      const a = (t.assignees ?? []).find((x) => x.profile_id === userId);
      if (!a) continue;
      if (a.status === "pending") pending++;
      if (a.status !== "accepted") continue;
      accepted++;
      if ((t.logged_hours ?? 0) > 0) acceptedLogged = true;
      if (!firstAcceptedHref && t.status !== "done") {
        firstAcceptedHref = t.sprint_id
          ? sprintTasksHref(t.project_id, t.sprint_id)
          : backlogHref(t.project_id);
      }
    }
    return { accepted, pending, acceptedLogged, firstAcceptedHref };
  }, [tasks, userId]);

  const loggedAny = useLoggedAny(userId, mine.acceptedLogged);
  const zohoAvailable = isSupabaseConfigured && user.role === "admin";
  const zohoConnected = useZohoConnected(zohoAvailable);

  const entry = progress?.checklist;
  const visible = checklistOpen || (isNew === true && progress != null && !entry);

  const items = React.useMemo(
    () =>
      checklistItems({
        role: user.role,
        canCreateProject: perms.canCreateProject,
        canExportProposals: perms.canExportProposals,
        canManageTeam: perms.canManageTeam,
        accessible,
        progress,
        hasAvatar: Boolean(user.avatar_url),
        hasWeeklyHours: capacityLoaded ? userId in capacity : null,
        assignments: tasksLoaded ? { accepted: mine.accepted, pending: mine.pending } : null,
        loggedAny,
        firstAcceptedTaskHref: mine.firstAcceptedHref,
        ownsProject: projectsLoaded
          ? projects.some((p) => p.owner_id != null && String(p.owner_id) === userId)
          : null,
        ownsEstimate: proposalsLoaded ? proposals.some((q) => q.owner_id === userId) : null,
        teamSize: teamLoaded ? members.length : null,
        zohoConnected,
        zohoAvailable,
      }),
    [
      user.role,
      user.avatar_url,
      perms,
      accessible,
      progress,
      capacityLoaded,
      capacity,
      userId,
      tasksLoaded,
      mine,
      loggedAny,
      projectsLoaded,
      projects,
      proposalsLoaded,
      proposals,
      teamLoaded,
      members.length,
      zohoConnected,
      zohoAvailable,
    ],
  );
  const { done, total, ready, complete } = checklistProgress(items);

  // At 100% the card says so, then stays away on later visits. Recording it
  // would hide the card on the spot, so it is held open for this session.
  React.useEffect(() => {
    if (!visible || !complete || entry) return;
    openChecklist();
    record(userId, "checklist", 1, "completed");
  }, [visible, complete, entry, openChecklist, record, userId]);

  if (!visible || !items.length) return null;

  const showMe = (item: ChecklistItem) => {
    setPending({ tourId: item.action.tourId, target: item.action.target });
    const href = item.action.href;
    if (href && href.split("?")[0] !== pathname) router.push(href);
    else if (href && href.includes("?")) router.push(href);
  };

  const dismiss = () => {
    record(userId, "checklist", 1, "dismissed");
    closeChecklist();
  };

  return (
    <Card className={className} {...tourAnchor("dashboard.checklist")}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base">Getting started</CardTitle>
            <CardDescription>
              {!ready
                ? "Checking what you've done…"
                : complete
                  ? "You're all set."
                  : `${done} of ${total} done. Each one ticks itself once you've done it.`}
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="-mr-1 -mt-1 shrink-0 text-muted-foreground"
            aria-label="Hide the Getting started checklist"
            onClick={dismiss}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
        {ready && total > 0 ? (
          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Getting started progress"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"
              style={{ width: `${Math.round((done / total) * 100)}%` }}
            />
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="pt-0">
        {!ready ? (
          <div className="space-y-2" aria-hidden>
            {items.map((i) => (
              <Skeleton key={i.id} className="h-9 rounded-md" />
            ))}
          </div>
        ) : complete ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <PartyPopper className="size-4 shrink-0 text-primary" aria-hidden />
            Every step is done. Page tours are still under the ? button.
          </p>
        ) : (
          <ul className="space-y-1">
            {items.map((item) => (
              <li
                key={item.id}
                className={cn(
                  "flex min-h-10 items-center gap-2.5 rounded-md px-1 py-1",
                  item.state === "na" && "opacity-60",
                )}
              >
                {item.state === "done" ? (
                  <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden />
                ) : item.state === "na" ? (
                  <CircleDashed className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-sm",
                      item.state === "done" && "text-muted-foreground line-through",
                    )}
                  >
                    {item.label}
                    <span className="sr-only">
                      {item.state === "done"
                        ? " (done)"
                        : item.state === "na"
                          ? " (not available yet)"
                          : " (to do)"}
                    </span>
                  </span>
                  {item.state === "na" && item.naHint ? (
                    <span className="block text-xs text-muted-foreground">{item.naHint}</span>
                  ) : null}
                </span>
                {item.state === "todo" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 px-2.5"
                    onClick={() => showMe(item)}
                    aria-label={`Show me how: ${item.label}`}
                  >
                    Show me
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
