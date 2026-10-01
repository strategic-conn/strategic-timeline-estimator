"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Flame,
  Timer,
} from "lucide-react";

import { Cell, Pie, PieChart } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  MineTeamToggle,
  type ScopeView,
} from "@/components/common/mine-team-toggle";
import { DashboardTeam } from "@/components/features/dashboard/DashboardTeam";
import { GettingStartedCard } from "@/components/features/tour/GettingStartedCard";
import { tourAnchor } from "@/lib/tours/ids";
import { WorkloadBar } from "@/components/features/workload/WorkloadBar";
import { useWeekLoggedHours } from "@/hooks/useWeekLoggedHours";
import {
  TASK_STATUS_LABEL,
  TASK_STATUS_META,
} from "@/lib/constants/task-status";
import {
  assignedWork,
  capacityFor,
  statusBreakdown,
  utilization,
} from "@/lib/workload/assigned-work";
import { useAvailabilityStore } from "@/store/availability-store";
import {
  getEffectiveWeeklyHours,
  useWeeklyCapacityStore,
} from "@/store/weekly-capacity-store";
import { WorkspacePageHeader } from "@/components/layouts/workspace-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
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
import { useActivityStore } from "@/store/activity-store";
import { sprintTasksHref, backlogHref } from "@/lib/constants/sprints";
import { cn } from "@/lib/utils";
import { daysUntil, relativeDay } from "@/lib/utils/relative-dates";
import {
  TASK_PRIORITIES,
  type TaskPriority,
  type TaskStatus,
} from "@/types/task.types";
import { AppHelp } from "@/components/common/app-help";

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

const myChartConfig = {
  todo: { label: TASK_STATUS_LABEL.todo, color: TASK_STATUS_META.todo.hex },
  in_progress: {
    label: TASK_STATUS_LABEL.in_progress,
    color: TASK_STATUS_META.in_progress.hex,
  },
  in_review: {
    label: TASK_STATUS_LABEL.in_review,
    color: TASK_STATUS_META.in_review.hex,
  },
  blocked: {
    label: TASK_STATUS_LABEL.blocked,
    color: TASK_STATUS_META.blocked.hex,
  },
} satisfies ChartConfig;

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const userId = user.authId ?? String(user.id);
  const firstName = user.name.trim().split(/\s+/)[0] || "there";
  const projects = useProjectsStore((s) => s.projects);
  const sprints = useSprintsStore((s) => s.sprints);
  const tasks = useTasksDataStore((s) => s.tasks);
  const activity = useActivityStore((s) => s.items);
  // Rule 2: a KPI must not state a number it does not have yet. The stores
  // hydrate async, and every figure below reads a real-looking 0 until they
  // arrive — for a moment the page asserted "0 overdue" as fact.
  const tasksLoaded = useTasksDataStore((s) => s.loaded);
  const projectsLoaded = useProjectsStore((s) => s.loaded);
  const dataReady = tasksLoaded && projectsLoaded;
  const availabilityEntries = useAvailabilityStore((s) => s.entries);
  const capacityOverrides = useWeeklyCapacityStore((s) => s.overrides);
  const weekLogged = useWeekLoggedHours();

  /**
   * Admin and manager get the team scope, the same rule Workload and the
   * Calendar use — one idea, one gate, so the three pages agree about who can
   * see other people's work.
   */
  const canSeeTeam = user.role === "admin" || user.role === "manager";
  const [view, setView] = useState<ScopeView>("mine");

  /**
   * "Now", read after mount instead of during render.
   *
   * Reading the clock while rendering makes the component impure: React may
   * re-render at any moment and get a different answer, and because this is a
   * client component it renders on the server too — where "today" can already
   * be tomorrow for the browser. Read once into state instead, so every date on
   * this page is measured against the same instant and a re-render can't change
   * the answer underneath it.
   */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // A dashboard left open overnight would otherwise keep calling yesterday
    // "Today". Once a minute is far finer than a date label needs.
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const activeProjects = useMemo(
    () => projects.filter((p) => p.status === "active"),
    [projects],
  );

  const projectNameMap = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  );

  const userDueSoonTasks = useMemo(() => {
    return tasks
      .filter((t) => {
        if (t.status === "done") return false;
        if (!t.assignee_ids.includes(userId)) return false;
        if (!t.due_date) return false;
        // Overdue work counts as due soon — it is the most due thing there is.
        return daysUntil(t.due_date, now) <= 7;
      })
      .sort((a, b) => {
        const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        if (pr !== 0) return pr;
        const da = new Date(a.due_date!).getTime();
        const db = new Date(b.due_date!).getTime();
        if (da !== db) return da - db;
        return STATUS_FOCUS_RANK[a.status] - STATUS_FOCUS_RANK[b.status];
      });
  }, [tasks, userId, now]);

  /**
   * My own load — from `assignedWork` / `capacityFor` / `utilization`, the same
   * calls Workload and the team view make. Nothing here is derived locally, so
   * my dashboard and my manager's cannot disagree about me.
   */
  const mine = useMemo(() => {
    const work = assignedWork(tasks, userId, { now });
    const cap = capacityFor(
      getEffectiveWeeklyHours(capacityOverrides, userId),
      availabilityEntries,
      userId,
      now,
    );
    const logged = Math.round((weekLogged?.[userId] ?? 0) * 10) / 10;
    return {
      work,
      cap,
      logged,
      util: utilization(work.allocatedHours, cap.effective),
      slices: statusBreakdown(work.allocated),
      // Working time left in the week, NOT spare capacity — utilisation is what
      // answers that, and with a backlog the two can point opposite ways.
      available: Math.max(0, Math.round((cap.effective - logged) * 10) / 10),
    };
  }, [tasks, userId, capacityOverrides, availabilityEntries, weekLogged, now]);

  const dueSoonTasks = useMemo(
    () => userDueSoonTasks.slice(0, 8),
    [userDueSoonTasks],
  );

  const tasksDueSoonCount = userDueSoonTasks.length;

  const onTimeRate = useMemo(() => {
    const completed = tasks.filter((t) => t.status === "done" && t.due_date);
    if (completed.length === 0) return "—";
    // CALENDAR days, not instants. `new Date(due_date)` on a DATE column is
    // midnight UTC, so a task finished at 15:00 local on its own due date
    // compared as LATE — and west of Greenwich, work finished the evening
    // before did too. That is the trap CLAUDE.md rule 8 exists for, and this
    // tile was still walking into it. `daysUntil` measures whole calendar days
    // between the completion day and the due day: >= 0 means on time.
    const onTime = completed.filter(
      (t) => daysUntil(t.due_date!, new Date(t.updated_at)) >= 0,
    ).length;
    return `${Math.round((onTime / completed.length) * 100)}%`;
  }, [tasks]);

  const nextMilestone = useMemo(() => {
    const upcoming = sprints
      .filter((s) => s.status === "active" || s.status === "planning")
      .sort(
        (a, b) =>
          new Date(a.end_date).getTime() - new Date(b.end_date).getTime(),
      );
    if (!upcoming.length) return "—";
    const d = new Date(upcoming[0].end_date);
    const diff = daysUntil(upcoming[0].end_date, now);
    // A missed milestone must not read as "Today". A sprint still open with an
    // end date in the past is late, and saying so is the whole point of the
    // tile — `diff <= 0` used to collapse "ended nine days ago" into "Today",
    // which told you the deadline was fine on the day you needed to chase it.
    if (diff < 0) return relativeDay(upcoming[0].end_date, now);
    if (diff === 0) return "Today";
    if (diff <= 7) return d.toLocaleDateString(undefined, { weekday: "short" });
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }, [sprints, now]);

  // The nearest open sprint end is in the past: it is a missed milestone, and
  // "Next milestone · 37 days ago" read as a bug rather than a warning.
  const milestoneLate = useMemo(
    () =>
      sprints.some(
        (s) =>
          (s.status === "active" || s.status === "planning") &&
          daysUntil(s.end_date, now) < 0,
      ),
    [sprints, now],
  );

  const kpis = [
    { label: "Active projects", value: activeProjects.length, icon: Flame },
    { label: "Your tasks due soon", value: tasksDueSoonCount, icon: Timer },
    { label: "On-time delivery", value: onTimeRate, icon: CheckCircle2 },
    {
      label: milestoneLate ? "Milestone overdue" : "Next milestone",
      value: nextMilestone,
      icon: CalendarClock,
      late: milestoneLate,
    },
  ];

  const sprintHrefForTask = (task: (typeof tasks)[0]) => {
    if (task.sprint_id) {
      return sprintTasksHref(task.project_id, task.sprint_id, task.id);
    }
    return backlogHref(task.project_id, task.id);
  };

  const recentActivity = activity.slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <WorkspacePageHeader
        eyebrow="Overview"
        help={<AppHelp section="page.dashboard" />}
        title={
          <>
            Welcome back,{" "}
            <span className="bg-gradient-to-r from-primary to-chart-2 bg-clip-text text-transparent">
              {firstName}
            </span>
          </>
        }
        description={
          view === "team"
            ? "Who is carrying what, where the overdue work sits, and how the week is tracking."
            : "Your deadlines, sprint pulse, and recent workspace motion — prioritized for what you own."
        }
        actions={
          <MineTeamToggle
            view={view}
            onChange={setView}
            canSeeTeam={canSeeTeam}
          />
        }
      />

      {view === "team" ? (
        <DashboardTeam />
      ) : (
        <>
          {/* Two-up even on a phone: four full-width tiles pushed the actual work
          ~290px down the page, and "Active projects / 1" needs nowhere near
          that room. */}
          <section
            className="grid grid-cols-2 gap-3 lg:grid-cols-4"
            {...tourAnchor("dashboard.kpis")}
          >
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
                  <CardTitle
                    className={cn(
                      "text-2xl font-semibold tracking-tight",
                      "late" in kpi && kpi.late && dataReady && "text-destructive",
                    )}
                  >
                    {dataReady ? kpi.value : "—"}
                  </CardTitle>
                </CardHeader>
              </Card>
            ))}
          </section>

          {/* Wide column: due-soon table, then Activity. Narrow column: My open
              work + Quick actions, spanning both rows. Explicit placement keeps
              the two columns a similar height on desktop (the sidebar used to
              hold three cards beside one short table) while the DOM order —
              due soon → my work → quick actions → activity — stays the order a
              phone reads. `grid-rows-[auto_1fr]`: row 1 fits the table exactly and the
              spanning sidebar's extra height goes to row 2 — with auto rows it split
              across both and left a hole under the table. */}
          <section className="grid items-start gap-6 lg:grid-cols-[1.6fr_1fr] lg:grid-rows-[auto_1fr]">
            <Card
              className="lg:col-start-1 lg:row-start-1"
              {...tourAnchor("dashboard.due-soon")}
            >
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle>Your work due soon</CardTitle>
                    <CardDescription>
                      Assigned to you — overdue or due within 7 days, highest
                      priority and nearest due dates first.
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="shrink-0 tabular-nums">
                    {userDueSoonTasks.length === 0
                      ? "0 assigned"
                      : dueSoonTasks.length < userDueSoonTasks.length
                        ? `${dueSoonTasks.length} of ${userDueSoonTasks.length}`
                        : `${userDueSoonTasks.length} assigned`}
                  </Badge>
                  <AppHelp section="dash.due-soon" />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {dueSoonTasks.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
                    <ClipboardList className="size-10" />
                    <p className="text-sm">
                      Nothing assigned to you with a due date in the next 7
                      days.
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
                              <div className="truncate font-medium">
                                {t.title}
                              </div>
                              {/* The project, not the id: a task id is a 36-char
                              UUID in live mode, which no one can act on. The
                              Project column is hidden under sm, so this is
                              where that information has to live on a phone. */}
                              <div className="truncate text-xs text-muted-foreground sm:hidden">
                                {projectNameMap.get(t.project_id) ??
                                  "Unknown project"}
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
                                {relativeDay(t.due_date!, now)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusVariant[t.status]}>
                                {TASK_STATUS_LABEL[t.status]}
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

            <div className="flex flex-col gap-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
              {/* Inside the sidebar column, not a grid item of its own: the grid
                  places its cards explicitly, and a new item would auto-place
                  into a gap (plan §5a.8). */}
              <GettingStartedCard />
              <Card {...tourAnchor("dashboard.my-work")}>
                <CardHeader>
                  <CardTitle className="text-base">My open work</CardTitle>
                  <CardDescription>
                    Accepted plus pending — the figure your sprint is planned
                    against.
                  </CardDescription>
                  <CardAction>
                    <AppHelp section="dash.my-work" />
                  </CardAction>
                </CardHeader>
                <CardContent>
                  {mine.slices.length ? (
                    <>
                      <ChartContainer
                        config={myChartConfig}
                        className="mx-auto h-[150px] w-full"
                      >
                        <PieChart>
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Pie
                            data={mine.slices}
                            dataKey="count"
                            nameKey="status"
                            innerRadius={38}
                          >
                            {mine.slices.map((sl) => (
                              <Cell
                                key={sl.status}
                                fill={TASK_STATUS_META[sl.status].hex}
                              />
                            ))}
                          </Pie>
                        </PieChart>
                      </ChartContainer>
                      <ul className="mt-3 space-y-1 text-sm">
                        {mine.slices.map((sl) => (
                          <li
                            key={sl.status}
                            className="flex items-center gap-2"
                          >
                            <span
                              className={`size-2.5 rounded-full ${TASK_STATUS_META[sl.status].dot}`}
                              aria-hidden="true"
                            />
                            <span className="flex-1">
                              {TASK_STATUS_LABEL[sl.status]}
                            </span>
                            <span className="tabular-nums text-muted-foreground">
                              {sl.count} · {sl.hours}h
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Nothing open assigned to you.
                    </p>
                  )}
                  <Separator className="my-4" />
                  {/* Stacked, not side by side: WorkloadBar draws its own
                      status legend under the bar, so putting the percentage
                      beside all of that squeezed three things onto one line —
                      and this card sits in the narrow sidebar column. */}
                  <div className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">Utilisation</span>
                      <span
                        className={cn(
                          "tabular-nums font-medium",
                          mine.util.over
                            ? "text-amber-600"
                            : "text-muted-foreground",
                        )}
                      >
                        {mine.util.pct}% of {mine.cap.effective}h
                      </span>
                    </div>
                    <WorkloadBar
                      slices={mine.slices}
                      totalHours={mine.work.allocatedHours}
                      barPct={mine.util.barPct}
                      over={mine.util.over}
                    />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Logged this week
                      </dt>
                      <dd className="tabular-nums font-medium">
                        {mine.logged}h
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Available hours
                      </dt>
                      <dd className="tabular-nums font-medium">
                        {mine.available}h
                      </dd>
                    </div>
                  </dl>
                  {mine.cap.awayDays || mine.cap.holidayDays ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {mine.cap.contracted}h contracted
                      {mine.cap.awayDays
                        ? ` − ${mine.cap.awayDays} day${mine.cap.awayDays === 1 ? "" : "s"} off`
                        : ""}
                      {mine.cap.holidayDays
                        ? ` − ${mine.cap.holidayDays} holiday${mine.cap.holidayDays === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
              <Card {...tourAnchor("dashboard.quick-actions")}>
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

            </div>

            <Card
              className="lg:col-start-1 lg:row-start-2"
              {...tourAnchor("dashboard.activity")}
            >
              <CardHeader>
                <CardTitle>Activity</CardTitle>
                <CardDescription>
                  Recent changes across your workspace.
                </CardDescription>
                <CardAction>
                  <AppHelp section="dash.activity" />
                </CardAction>
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
                  <Link href="/activity">View all activity</Link>
                </Button>
                <Button variant="ghost" className="w-full" asChild>
                  <Link href="/reports">View reports</Link>
                </Button>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
