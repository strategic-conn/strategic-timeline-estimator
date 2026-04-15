"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Flame,
  Timer,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useAuthStore } from "@/store/auth-store";
import { useProjectsStore } from "@/store/projects-store";
import { useSprintsStore } from "@/store/sprints-store";
import { useTasksDataStore } from "@/store/tasks-store";
import { useNotificationsStore } from "@/store/notifications-store";
import { sprintTasksHref, backlogHref } from "@/lib/constants/sprints";
import { cn } from "@/lib/utils";
import {
  TASK_PRIORITIES,
  type TaskPriority,
  type TaskStatus,
} from "@/types/task.types";

const statusVariant: Record<
  TaskStatus,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  todo: "outline",
  in_progress: "secondary",
  in_review: "secondary",
  done: "default",
  blocked: "destructive",
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
  blocked: "Blocked",
};

const PRIORITY_RANK: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Lower = address sooner (blocked / active work surfaces first). */
const STATUS_FOCUS_RANK: Record<TaskStatus, number> = {
  blocked: 0,
  in_progress: 1,
  in_review: 2,
  todo: 3,
  done: 4,
};

const priorityMeta = (p: TaskPriority) =>
  TASK_PRIORITIES.find((x) => x.value === p) ?? TASK_PRIORITIES[1];

function calendarYmd(d: Date): number {
  return d.getFullYear() * 10_000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function relativeDay(iso: string): string {
  const d = new Date(iso);
  const todayYmd = calendarYmd(new Date());
  const dueYmd = calendarYmd(d);
  const diff = dueYmd - todayYmd;
  if (diff < -1) return `${Math.abs(diff)} days ago`;
  if (diff === -1) return "Yesterday";
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return "Just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function DashboardPage() {
  const userId = useAuthStore((s) => s.user.id);
  const projects = useProjectsStore((s) => s.projects);
  const sprints = useSprintsStore((s) => s.sprints);
  const tasks = useTasksDataStore((s) => s.tasks);
  const notifications = useNotificationsStore((s) => s.items);

  const activeProjects = useMemo(
    () => projects.filter((p) => p.status === "active"),
    [projects]
  );

  const projectNameMap = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  );

  const userDueSoonTasks = useMemo(() => {
    const todayYmd = calendarYmd(new Date());
    return tasks
      .filter((t) => {
        if (t.status === "done") return false;
        if (!t.assignee_ids.includes(userId)) return false;
        if (!t.due_date) return false;
        const dueYmd = calendarYmd(new Date(t.due_date));
        return dueYmd - todayYmd <= 7;
      })
      .sort((a, b) => {
        const pr =
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        if (pr !== 0) return pr;
        const da = new Date(a.due_date!).getTime();
        const db = new Date(b.due_date!).getTime();
        if (da !== db) return da - db;
        return STATUS_FOCUS_RANK[a.status] - STATUS_FOCUS_RANK[b.status];
      });
  }, [tasks, userId]);

  const dueSoonTasks = useMemo(() => userDueSoonTasks.slice(0, 8), [userDueSoonTasks]);

  const tasksDueSoonCount = userDueSoonTasks.length;

  const onTimeRate = useMemo(() => {
    const completed = tasks.filter((t) => t.status === "done" && t.due_date);
    if (completed.length === 0) return "—";
    const onTime = completed.filter((t) => {
      const done = new Date(t.updated_at);
      const due = new Date(t.due_date!);
      return done <= due;
    }).length;
    return `${Math.round((onTime / completed.length) * 100)}%`;
  }, [tasks]);

  const nextMilestone = useMemo(() => {
    const upcoming = sprints
      .filter((s) => s.status === "active" || s.status === "planning")
      .sort((a, b) => new Date(a.end_date).getTime() - new Date(b.end_date).getTime());
    if (!upcoming.length) return "—";
    const d = new Date(upcoming[0].end_date);
    const diff = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diff <= 0) return "Today";
    if (diff <= 7) return d.toLocaleDateString(undefined, { weekday: "short" });
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }, [sprints]);

  const kpis = [
    { label: "Active projects", value: activeProjects.length, icon: Flame },
    { label: "Your tasks due soon", value: tasksDueSoonCount, icon: Timer },
    { label: "On-time delivery", value: onTimeRate, icon: CheckCircle2 },
    { label: "Next milestone", value: nextMilestone, icon: CalendarClock },
  ];

  const sprintHrefForTask = (task: (typeof tasks)[0]) => {
    if (task.sprint_id) return sprintTasksHref(task.project_id, task.sprint_id);
    return backlogHref(task.project_id);
  };

  const recentActivity = notifications.slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} size="sm">
            <CardHeader className="gap-1">
              <CardDescription className="flex items-center justify-between">
                <span>{kpi.label}</span>
                <kpi.icon
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
              </CardDescription>
              <CardTitle className="text-2xl font-semibold tracking-tight">
                {kpi.value}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle>Your work due soon</CardTitle>
                <CardDescription>
                  Assigned to you, within 7 days — highest priority and nearest
                  due dates first.
                </CardDescription>
              </div>
              <Badge variant="outline" className="shrink-0 tabular-nums">
                {userDueSoonTasks.length === 0
                  ? "0 assigned"
                  : dueSoonTasks.length < userDueSoonTasks.length
                    ? `${dueSoonTasks.length} of ${userDueSoonTasks.length}`
                    : `${userDueSoonTasks.length} assigned`}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {dueSoonTasks.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
                <ClipboardList className="size-10" />
                <p className="text-sm">
                  Nothing assigned to you with a due date in the next 7 days.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Project
                    </TableHead>
                    <TableHead className="w-22 lg:w-28">Priority</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dueSoonTasks.map((t) => {
                    const pri = priorityMeta(t.priority);
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="max-w-[280px]">
                          <div className="truncate font-medium">{t.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {t.id}
                          </div>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">
                          {projectNameMap.get(t.project_id) ?? t.project_id}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn("font-medium", pri.color)}
                          >
                            {pri.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {relativeDay(t.due_date!)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant[t.status]}>
                            {STATUS_LABEL[t.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link
                              href={sprintHrefForTask(t)}
                              aria-label={`Open ${t.title}`}
                            >
                              View
                              <ArrowRight
                                className="ml-1 size-4"
                                aria-hidden="true"
                              />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
              <CardDescription>Common next steps.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 pt-0">
              <Button asChild>
                <Link href="/projects">Create project</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/projects">Browse projects</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/calendar">Schedule work</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/team">Invite teammate</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
              <CardDescription>
                Recent changes across your workspace.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {recentActivity.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No recent activity.
                </p>
              ) : (
                <ul className="space-y-3">
                  {recentActivity.map((a) => (
                    <li key={a.id} className="flex items-start gap-3">
                      <div className="mt-1 shrink-0 rounded-md bg-muted px-2 py-0.5 text-[0.625rem] text-muted-foreground">
                        {timeAgo(a.at)}
                      </div>
                      <div className="text-sm leading-6">{a.text}</div>
                    </li>
                  ))}
                </ul>
              )}
              <Separator className="my-4" />
              <Button variant="ghost" className="w-full" asChild>
                <Link href="/reports">View reports</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
