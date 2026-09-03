"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";

import { WorkspacePageHeader } from "@/components/layouts/workspace-page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { backlogHref, sprintTasksHref } from "@/lib/constants/sprints";
import {
  DEFAULT_WEEKLY_CAPACITY_HOURS,
  startOfWeekIso,
} from "@/lib/constants/workload";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useAuthStore } from "@/store/auth-store";
import { useProjectsStore } from "@/store/projects-store";
import { useTasksDataStore } from "@/store/tasks-store";
import {
  getEffectiveWeeklyHours,
  useWeeklyCapacityStore,
} from "@/store/weekly-capacity-store";
import { cn } from "@/lib/utils";
import { isOverdue } from "@/lib/utils/relative-dates";
import type { Task } from "@/types/task.types";

function taskHref(t: Task) {
  return t.sprint_id
    ? sprintTasksHref(t.project_id, t.sprint_id, t.id)
    : backlogHref(t.project_id, t.id);
}

export function WorkloadMine({ toggle }: { toggle?: React.ReactNode }) {
  const me = useAuthStore((s) => s.user.authId ?? String(s.user.id));
  const tasks = useTasksDataStore((s) => s.tasks);
  const projects = useProjectsStore((s) => s.projects);
  const capacityOverrides = useWeeklyCapacityStore((s) => s.overrides);
  const projectName = React.useCallback(
    (id: string) => projects.find((p) => p.id === id)?.name ?? id,
    [projects]
  );

  const [hoursThisWeek, setHoursThisWeek] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("time_entries")
        .select("hours")
        .eq("profile_id", me)
        .gte("logged_at", startOfWeekIso());
      if (active) {
        setHoursThisWeek(
          Math.round((data ?? []).reduce((s, r) => s + Number(r.hours), 0) * 10) /
            10
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [me]);

  const accepted = React.useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.status !== "done" &&
          t.assignees.some(
            (a) => a.profile_id === me && a.status === "accepted"
          )
      ),
    [tasks, me]
  );
  const pendingCount = React.useMemo(
    () =>
      tasks.filter((t) =>
        t.assignees.some((a) => a.profile_id === me && a.status === "pending")
      ).length,
    [tasks, me]
  );

  const weeklyCap = getEffectiveWeeklyHours(capacityOverrides, me);
  const openEst =
    Math.round(accepted.reduce((s, t) => s + (t.estimated_hours ?? 0), 0) * 10) /
    10;
  const now = new Date();
  const overdue = accepted.filter(
    (t) => isOverdue(t.due_date, now)
  ).length;
  const utilPct = weeklyCap > 0 ? Math.round((openEst / weeklyCap) * 100) : 0;
  const overCap = openEst > weeklyCap;

  const byProject = React.useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of accepted) {
      if (!map.has(t.project_id)) map.set(t.project_id, []);
      map.get(t.project_id)!.push(t);
    }
    return [...map.entries()];
  }, [accepted]);

  return (
    <div className="flex flex-col gap-6">
      <WorkspacePageHeader
        eyebrow="Capacity"
        title="My workload"
        description={`Your accepted work vs your weekly capacity (${DEFAULT_WEEKLY_CAPACITY_HOURS}h default).`}
        actions={toggle}
      />

      {pendingCount > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-500/15 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <span className="font-medium">{pendingCount}</span> task
            {pendingCount === 1 ? "" : "s"} awaiting your response — open{" "}
            {pendingCount === 1 ? "it" : "them"} to accept, decline, or pass.
          </p>
        </div>
      ) : null}

      {/* 2-up on phones/tablet; 4 across only once there's real width. */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card size="sm">
          <CardHeader className="gap-1">
            <CardDescription>Open tasks</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {accepted.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader className="gap-1">
            <CardDescription>Open estimate</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {openEst}h
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader className="gap-1">
            <CardDescription className="flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden />
              Logged this week
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {hoursThisWeek == null ? "—" : `${hoursThisWeek}h`}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader className="gap-1">
            <CardDescription>Utilization</CardDescription>
            <CardTitle
              className={cn(
                "text-2xl font-semibold tabular-nums",
                overCap && "text-amber-700 dark:text-amber-400"
              )}
            >
              {utilPct}%
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your accepted work</CardTitle>
          <CardDescription>
            {openEst}h estimated across {accepted.length} task
            {accepted.length === 1 ? "" : "s"} · {utilPct}% of {weeklyCap}h/week
            {overdue > 0 ? ` · ${overdue} overdue` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-0">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                overCap ? "bg-amber-500" : "bg-primary"
              )}
              style={{ width: `${Math.min(utilPct, 100)}%` }}
            />
          </div>

          {accepted.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No accepted tasks. Accept an assignment to see it here.
            </p>
          ) : (
            byProject.map(([pid, list]) => (
              <div key={pid} className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {projectName(pid)}
                </p>
                <ul className="divide-y divide-border rounded-lg border">
                  {list.map((t) => {
                    const overdueRow = isOverdue(t.due_date, now);
                    return (
                      <li key={t.id}>
                        <Link
                          href={taskHref(t)}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/40"
                        >
                          <span className="min-w-0 truncate">{t.title}</span>
                          <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground tabular-nums">
                            {overdueRow ? (
                              <Badge variant="destructive" className="text-[0.65rem]">
                                overdue
                              </Badge>
                            ) : null}
                            est {t.estimated_hours ?? 0}h
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
