"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Scale } from "lucide-react";

import { MemberWeeklyHoursInput } from "@/components/features/workload/MemberWeeklyHoursInput";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { backlogHref, sprintTasksHref } from "@/lib/constants/sprints";
import { DEFAULT_WEEKLY_CAPACITY_HOURS } from "@/lib/constants/workload";
import { TEAM_MEMBERS } from "@/lib/dummy/tasks.data";
import { useProjectsStore } from "@/store/projects-store";
import { useTasksDataStore } from "@/store/tasks-store";
import {
  getEffectiveWeeklyHours,
  useWeeklyCapacityStore,
} from "@/store/weekly-capacity-store";
import { cn } from "@/lib/utils";
import type { Task } from "@/types/task.types";

type ProjectFilter = "all" | string;

function openAssignedTasks(tasks: Task[], memberId: number, projectId: ProjectFilter) {
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

  const [projectId, setProjectId] = React.useState<ProjectFilter>("all");

  const projectNameMap = React.useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  );

  const rows = React.useMemo(() => {
    return TEAM_MEMBERS.map((m) => {
      const weeklyCap = getEffectiveWeeklyHours(capacityOverrides, m.id);
      const open = openAssignedTasks(tasks, m.id, projectId);
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
        openEst: Math.round(openEst * 10) / 10,
        openLogged: Math.round(openLogged * 10) / 10,
        overdue,
        breakdown,
        utilPct,
        barVisual,
        overCap: openEst > weeklyCap,
      };
    }).sort((a, b) => b.openEst - a.openEst);
  }, [tasks, projectId, projectNameMap, capacityOverrides]);

  const peopleWithOpen = rows.filter((r) => r.openCount > 0).length;
  const totalOpenEst = rows.reduce((s, r) => s + r.openEst, 0);
  const overCapacityCount = rows.filter((r) => r.overCap).length;

  return (
    <div className="flex flex-col gap-6">
      <WorkspacePageHeader
        eyebrow="Capacity"
        title="Resource allocation"
        description={`Open work by assignee — utilization uses each person’s weekly capacity (default ${DEFAULT_WEEKLY_CAPACITY_HOURS}h). Edit hours below; values persist in this browser until schedules sync from the API.`}
        actions={
          <div className="flex w-full flex-col gap-1.5 sm:w-56">
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

      <section className="grid gap-3 sm:grid-cols-3">
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
              {TEAM_MEMBERS.map((m) => (
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

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-40">Person</TableHead>
                  <TableHead className="text-center tabular-nums">Open tasks</TableHead>
                  <TableHead className="text-right tabular-nums">Est. h</TableHead>
                  <TableHead className="text-right tabular-nums">Logged</TableHead>
                  <TableHead className="min-w-32">Utilization</TableHead>
                  <TableHead className="text-center">Due risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.member.id}>
                    <TableCell>
                      <div className="font-medium">{r.member.name}</div>
                      <div className="mt-0.5 text-xs capitalize text-muted-foreground">
                        {r.member.role}
                      </div>
                      {r.breakdown ? (
                        <p className="mt-2 max-w-md text-xs text-muted-foreground">
                          {r.breakdown}
                        </p>
                      ) : null}
                      {r.openTasks.length > 0 ? (
                        <ul className="mt-2 space-y-1 border-t border-border/60 pt-2">
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
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {r.openCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {r.openEst}h
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.openLogged}h
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-28 flex-col gap-1">
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
                    </TableCell>
                    <TableCell className="text-center">
                      {r.overdue > 0 ? (
                        <Badge variant="destructive" className="tabular-nums">
                          {r.overdue} overdue
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
