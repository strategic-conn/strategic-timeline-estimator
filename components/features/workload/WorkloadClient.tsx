"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Scale } from "lucide-react";

import { MemberWeeklyHoursInput } from "@/components/features/workload/MemberWeeklyHoursInput";
import { WorkloadMine } from "@/components/features/workload/WorkloadMine";
import { WorkspacePageHeader } from "@/components/layouts/workspace-page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { backlogHref, sprintTasksHref } from "@/lib/constants/sprints";
import {
  DEFAULT_WEEKLY_CAPACITY_HOURS,
  startOfWeekIso,
} from "@/lib/constants/workload";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useAuthStore } from "@/store/auth-store";
import { useTeamMembers } from "@/store/team-store";
import { useProjectsStore } from "@/store/projects-store";
import { useTasksDataStore } from "@/store/tasks-store";
import {
  getEffectiveWeeklyHours,
  useWeeklyCapacityStore,
} from "@/store/weekly-capacity-store";
import { cn } from "@/lib/utils";
import type { Task } from "@/types/task.types";

type ProjectFilter = "all" | string;

function openAssignedTasks(tasks: Task[], memberId: string, projectId: ProjectFilter) {
  return tasks.filter((t) => {
    if (t.status === "done") return false;
    if (!t.assignee_ids.includes(memberId)) return false;
    if (projectId !== "all" && t.project_id !== projectId) return false;
    return true;
  });
}

function taskHref(t: Task) {
  if (t.sprint_id) {
    return sprintTasksHref(t.project_id, t.sprint_id, t.id);
  }
  return backlogHref(t.project_id, t.id);
}

export function WorkloadClient() {
  const tasks = useTasksDataStore((s) => s.tasks);
  const projects = useProjectsStore((s) => s.projects);
  const capacityOverrides = useWeeklyCapacityStore((s) => s.overrides);
  const members = useTeamMembers();
  const role = useAuthStore((s) => s.user.role);
  const canSeeTeam = role === "admin" || role === "manager";

  const [projectId, setProjectId] = React.useState<ProjectFilter>("all");
  const [view, setView] = React.useState<"mine" | "team">(
    canSeeTeam ? "team" : "mine"
  );
  const toggle = canSeeTeam ? (
    <div className="inline-flex rounded-lg border border-border/60 bg-card/50 p-0.5 text-sm">
      {(["mine", "team"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => setView(v)}
          className={cn(
            "rounded-md px-3 py-1 capitalize transition-colors",
            view === v
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {v === "mine" ? "Mine" : "Team"}
        </button>
      ))}
    </div>
  ) : null;

  const projectNameMap = React.useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  );

  // Actual hours logged this week per person (from time_entries; live only).
  const [weekLogged, setWeekLogged] = React.useState<Record<string, number>>({});
  React.useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("time_entries")
        .select("profile_id, hours")
        .gte("logged_at", startOfWeekIso());
      if (!active) return;
      const map: Record<string, number> = {};
      for (const r of data ?? [])
        map[r.profile_id] = (map[r.profile_id] ?? 0) + Number(r.hours);
      setWeekLogged(map);
    })();
    return () => {
      active = false;
    };
  }, [tasks]);

  const rows = React.useMemo(() => {
    return members.map((m) => {
      const weeklyCap = getEffectiveWeeklyHours(capacityOverrides, m.id);
      const open = openAssignedTasks(tasks, m.id, projectId);
      const pending = tasks.filter(
        (t) =>
          (projectId === "all" || t.project_id === projectId) &&
          t.assignees.some(
            (a) => a.profile_id === m.id && a.status === "pending"
          )
      ).length;
      const loggedWeek = Math.round((weekLogged[m.id] ?? 0) * 10) / 10;
      const openEst = open.reduce((s, t) => s + (t.estimated_hours ?? 0), 0);
      const openLogged = open.reduce((s, t) => s + (t.logged_hours ?? 0), 0);
      const now = new Date();
      const overdue = open.filter(
        (t) => t.due_date && new Date(t.due_date) < now
      ).length;

      const byProject = new Map<string, number>();
      for (const t of open) {
        const h = t.estimated_hours ?? 0;
        byProject.set(t.project_id, (byProject.get(t.project_id) ?? 0) + h);
      }
      const breakdown = [...byProject.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([pid, h]) => {
          const label = projectNameMap.get(pid) ?? pid;
          const rounded = Math.round(h * 10) / 10;
          return `${label}: ${rounded}h`;
        })
        .join(" · ");

      const utilPct =
        weeklyCap > 0 ? Math.round((openEst / weeklyCap) * 100) : 0;
      const barVisual = Math.min(utilPct, 100);

      return {
        member: m,
        weeklyCap,
        openTasks: open,
        openCount: open.length,
        pending,
        loggedWeek,
        openEst: Math.round(openEst * 10) / 10,
        openLogged: Math.round(openLogged * 10) / 10,
        overdue,
        breakdown,
        utilPct,
        barVisual,
        overCap: openEst > weeklyCap,
      };
    }).sort((a, b) => b.openEst - a.openEst);
  }, [members, tasks, projectId, projectNameMap, capacityOverrides, weekLogged]);

  const peopleWithOpen = rows.filter((r) => r.openCount > 0).length;
  const totalOpenEst = rows.reduce((s, r) => s + r.openEst, 0);
  const overCapacityCount = rows.filter((r) => r.overCap).length;

  if (view === "mine") return <WorkloadMine toggle={toggle} />;

  return (
    <div className="flex flex-col gap-6">
      <WorkspacePageHeader
        eyebrow="Capacity"
        title="Resource allocation"
        description={`Open work by assignee — utilization uses each person’s weekly capacity (default ${DEFAULT_WEEKLY_CAPACITY_HOURS}h). Edit hours below to save per person.`}
        actions={
          <div className="flex w-full flex-col items-end gap-2 sm:flex-row sm:items-end sm:justify-end">
            {toggle}
            <div className="flex w-full min-w-0 flex-col gap-1.5 sm:max-w-xs md:w-56 md:max-w-none">
            <span className="text-xs font-medium text-muted-foreground">Project</span>
            <Select
              value={projectId}
              onValueChange={(v) => setProjectId(v as ProjectFilter)}
            >
              <SelectTrigger className="w-full border-border/60 bg-background/80">
                <SelectValue placeholder="All projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            </div>
          </div>
        }
      />

      {overCapacityCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-500/15 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <span className="font-medium">{overCapacityCount}</span>{" "}
            {overCapacityCount === 1 ? "person has" : "people have"} open
            estimates above their set weekly capacity. Re-balance assignments or
            split work across sprints.
          </p>
        </div>
      )}

      {/* 3-across only once there's room — on the tablet rail it'd be ~200px/card. */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card size="sm">
          <CardHeader className="gap-1">
            <CardDescription>People with open work</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {peopleWithOpen}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader className="gap-1">
            <CardDescription>Total open estimates</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {Math.round(totalOpenEst * 10) / 10}h
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader className="gap-1">
            <CardDescription>Over weekly capacity</CardDescription>
            <CardTitle
              className={cn(
                "text-2xl font-semibold tabular-nums",
                overCapacityCount > 0 && "text-amber-700 dark:text-amber-400"
              )}
            >
              {overCapacityCount}
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="size-4 text-muted-foreground" aria-hidden />
            Load by person
          </CardTitle>
          <CardDescription>
            Non-done tasks only. Utilization = open estimated hours ÷ that
            person’s weekly hours (see table below). Links open the sprint or
            backlog board for that task.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-0">
          <div className="rounded-xl border border-border/60 bg-muted/15 p-4">
            <p className="text-sm font-medium">Weekly capacity by person</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Whole hours, {DEFAULT_WEEKLY_CAPACITY_HOURS}h default. Press Enter or
              click away to save (1–168).
            </p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-card/50 px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm font-medium">
                    {m.name}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <MemberWeeklyHoursInput
                      memberId={m.id}
                      committedHours={getEffectiveWeeklyHours(
                        capacityOverrides,
                        m.id
                      )}
                      label={m.name}
                    />
                    <span className="text-xs text-muted-foreground">h/wk</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <ul className="grid gap-3 xl:grid-cols-2">
            {rows.map((r) => (
              <li
                key={r.member.id}
                className="flex flex-col gap-3 rounded-lg border bg-card/40 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.member.name}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs capitalize text-muted-foreground">
                      {r.member.role}
                      {r.pending > 0 ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[0.6rem] font-medium normal-case text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                          {r.pending} pending
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {r.overdue > 0 ? (
                    <Badge variant="destructive" className="shrink-0 tabular-nums">
                      {r.overdue} overdue
                    </Badge>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                  <span>
                    <span className="text-muted-foreground">Open </span>
                    <span className="font-medium tabular-nums">{r.openCount}</span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">Est. </span>
                    <span className="font-medium tabular-nums">{r.openEst}h</span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">This wk </span>
                    <span
                      className={cn(
                        "font-medium tabular-nums",
                        r.loggedWeek > 0
                          ? "text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {r.loggedWeek}h
                    </span>
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        r.overCap ? "bg-amber-500" : "bg-primary"
                      )}
                      style={{ width: `${r.barVisual}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {r.utilPct}% of {r.weeklyCap}h
                  </span>
                </div>

                {r.breakdown ? (
                  <p className="text-xs text-muted-foreground">{r.breakdown}</p>
                ) : null}

                {r.openTasks.length > 0 ? (
                  <ul className="space-y-1 border-t border-border/60 pt-2">
                    {r.openTasks.slice(0, 4).map((t) => (
                      <li key={t.id}>
                        <Link
                          href={taskHref(t)}
                          className="text-xs text-primary underline-offset-2 hover:underline"
                        >
                          {t.title}
                        </Link>
                        <span className="text-muted-foreground">
                          {" "}
                          · est {t.estimated_hours ?? 0}h
                        </span>
                      </li>
                    ))}
                    {r.openTasks.length > 4 ? (
                      <li className="text-xs text-muted-foreground">
                        +{r.openTasks.length - 4} more
                      </li>
                    ) : null}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
