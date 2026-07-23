"use client";

import * as React from "react";
import Link from "next/link";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  FolderOpen,
  Layers,
  TrendingUp,
  Users,
} from "lucide-react";

import { WorkspacePageHeader } from "@/components/layouts/workspace-page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProjectsStore } from "@/store/projects-store";
import { useSprintsStore } from "@/store/sprints-store";
import { useTasksDataStore } from "@/store/tasks-store";
import { useTeamMembers } from "@/store/team-store";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/types/task.types";

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: "bg-slate-400",
  in_progress: "bg-blue-500",
  in_review: "bg-purple-500",
  done: "bg-green-500",
  blocked: "bg-red-500",
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
  blocked: "Blocked",
};

export function ReportsClient() {
  const projects = useProjectsStore((s) => s.projects);
  const sprints = useSprintsStore((s) => s.sprints);
  const tasks = useTasksDataStore((s) => s.tasks);
  const members = useTeamMembers();

  const statusBreakdown = React.useMemo(() => {
    const counts: Record<TaskStatus, number> = {
      todo: 0,
      in_progress: 0,
      in_review: 0,
      done: 0,
      blocked: 0,
    };
    for (const t of tasks) counts[t.status] += 1;
    return counts;
  }, [tasks]);

  const totalTasks = tasks.length;

  const projectStats = React.useMemo(() => {
    return projects.map((p) => {
      const pTasks = tasks.filter((t) => t.project_id === p.id);
      const done = pTasks.filter((t) => t.status === "done").length;
      const estH = pTasks.reduce((sum, t) => sum + (t.estimated_hours ?? 0), 0);
      const logH = pTasks.reduce((sum, t) => sum + (t.logged_hours ?? 0), 0);
      const sprintCount = sprints.filter((s) => s.project_id === p.id).length;
      return {
        ...p,
        taskCount: pTasks.length,
        doneCount: done,
        progressPct: pTasks.length > 0 ? Math.round((done / pTasks.length) * 100) : 0,
        estH: Math.round(estH),
        logH: Math.round(logH),
        sprintCount,
      };
    });
  }, [projects, tasks, sprints]);

  const memberStats = React.useMemo(() => {
    return members.map((m) => {
      const assigned = tasks.filter((t) => t.assignee_ids.includes(m.id));
      const done = assigned.filter((t) => t.status === "done").length;
      const logH = assigned.reduce((sum, t) => sum + (t.logged_hours ?? 0), 0);
      return {
        ...m,
        assigned: assigned.length,
        done,
        logH: Math.round(logH * 10) / 10,
      };
    }).sort((a, b) => b.assigned - a.assigned);
  }, [tasks, members]);

  const totalEstimated = Math.round(
    tasks.reduce((s, t) => s + (t.estimated_hours ?? 0), 0)
  );
  const totalLogged = Math.round(
    tasks.reduce((s, t) => s + (t.logged_hours ?? 0), 0)
  );

  const onTimeRate = React.useMemo(() => {
    const completed = tasks.filter((t) => t.status === "done" && t.due_date);
    if (completed.length === 0) return null;
    const onTime = completed.filter((t) => {
      const done = new Date(t.updated_at);
      const due = new Date(t.due_date!);
      return done <= due;
    }).length;
    return Math.round((onTime / completed.length) * 100);
  }, [tasks]);

  const overdue = React.useMemo(() => {
    const now = new Date();
    return tasks.filter((t) => {
      if (t.status === "done") return false;
      if (!t.due_date) return false;
      return new Date(t.due_date) < now;
    }).length;
  }, [tasks]);

  const kpis = [
    {
      label: "Total tasks",
      value: totalTasks,
      icon: Layers,
    },
    {
      label: "Completed",
      value: statusBreakdown.done,
      icon: CheckCircle2,
    },
    {
      label: "Overdue",
      value: overdue,
      icon: Clock,
      warn: overdue > 0,
    },
    {
      label: "On-time rate",
      value: onTimeRate != null ? `${onTimeRate}%` : "—",
      icon: TrendingUp,
    },
  ];

  const maxStatusCount = Math.max(...Object.values(statusBreakdown), 1);

  return (
    <div className="flex flex-col gap-6">
      <WorkspacePageHeader
        eyebrow="Insights"
        title="Reports"
        description="Workspace-wide stats computed from live project data — ready to share when exports land."
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} size="sm">
            <CardHeader className="gap-1">
              <CardDescription className="flex items-center justify-between">
                <span>{kpi.label}</span>
                <kpi.icon className="size-4 text-muted-foreground" aria-hidden />
              </CardDescription>
              <CardTitle
                className={cn(
                  "text-2xl font-semibold tracking-tight",
                  kpi.warn && "text-red-600 dark:text-red-400"
                )}
              >
                {kpi.value}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="size-4" aria-hidden />
              Task status breakdown
            </CardTitle>
            <CardDescription>
              Distribution of all {totalTasks} tasks across statuses.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {(Object.keys(statusBreakdown) as TaskStatus[]).map((status) => {
              const count = statusBreakdown[status];
              const pct = totalTasks > 0 ? (count / totalTasks) * 100 : 0;
              return (
                <div key={status} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "size-2.5 rounded-full",
                          STATUS_COLORS[status]
                        )}
                      />
                      {STATUS_LABELS[status]}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {count} ({Math.round(pct)}%)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full transition-all", STATUS_COLORS[status])}
                      style={{ width: `${(count / maxStatusCount) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-4" aria-hidden />
              Time tracking
            </CardTitle>
            <CardDescription>
              Estimated vs. logged hours across all tasks.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 rounded-lg border border-border p-4 text-center">
                <p className="text-2xl font-semibold tabular-nums">
                  {totalEstimated}h
                </p>
                <p className="text-xs text-muted-foreground">Estimated</p>
              </div>
              <div className="space-y-1 rounded-lg border border-border p-4 text-center">
                <p className="text-2xl font-semibold tabular-nums">
                  {totalLogged}h
                </p>
                <p className="text-xs text-muted-foreground">Logged</p>
              </div>
            </div>
            {totalEstimated > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Burn rate</span>
                  <span>
                    {Math.round((totalLogged / totalEstimated) * 100)}%
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      totalLogged / totalEstimated > 1
                        ? "bg-red-500"
                        : "bg-primary"
                    )}
                    style={{
                      width: `${Math.min((totalLogged / totalEstimated) * 100, 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="size-4" aria-hidden />
              Projects
            </CardTitle>
            <CardDescription>
              Progress and effort per project.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Sprints</TableHead>
                  <TableHead className="text-center">Tasks</TableHead>
                  <TableHead className="text-center">Progress</TableHead>
                  <TableHead className="text-right">Est / Logged</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projectStats.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="capitalize">
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {p.sprintCount}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {p.doneCount}/{p.taskCount}
                    </TableCell>
                    <TableCell>
                      <div className="mx-auto flex w-20 items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              p.progressPct === 100
                                ? "bg-green-500"
                                : "bg-primary"
                            )}
                            style={{ width: `${p.progressPct}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {p.progressPct}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {p.estH}h / {p.logH}h
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4" aria-hidden />
              Team workload
            </CardTitle>
            <CardDescription className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <span>Tasks assigned and hours logged per team member.</span>
              <Link
                href="/workload"
                className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Resource allocation →
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-center">Role</TableHead>
                  <TableHead className="text-center">Assigned</TableHead>
                  <TableHead className="text-center">Done</TableHead>
                  <TableHead className="text-right">Hours logged</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {memberStats.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="capitalize">
                        {m.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {m.assigned}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {m.done}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {m.logH}h
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
