"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";

import {
  TaskBadgePopover,
  taskHref,
} from "@/components/features/workload/TaskBadgePopover";
import { useWeekLoggedHours } from "@/hooks/useWeekLoggedHours";
import { WorkloadBar } from "@/components/features/workload/WorkloadBar";
import { WorkspacePageHeader } from "@/components/layouts/workspace-page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DEFAULT_WEEKLY_CAPACITY_HOURS } from "@/lib/constants/workload";
import {
  assignedWork,
  capacityFor,
  statusBreakdown,
  utilization,
} from "@/lib/workload/assigned-work";
import { useAuthStore } from "@/store/auth-store";
import { useAvailabilityStore } from "@/store/availability-store";
import { useProjectsStore } from "@/store/projects-store";
import { useTasksDataStore } from "@/store/tasks-store";
import {
  getEffectiveWeeklyHours,
  useWeeklyCapacityStore,
} from "@/store/weekly-capacity-store";
import { cn } from "@/lib/utils";
import { isOverdue } from "@/lib/utils/relative-dates";
import type { Task } from "@/types/task.types";
import { tourAnchor } from "@/lib/tours/ids";
import { AppHelp } from "@/components/common/app-help";

export function WorkloadMine({ toggle }: { toggle?: React.ReactNode }) {
  const me = useAuthStore((s) => s.user.authId ?? String(s.user.id));
  const tasks = useTasksDataStore((s) => s.tasks);
  const projects = useProjectsStore((s) => s.projects);
  const capacityOverrides = useWeeklyCapacityStore((s) => s.overrides);
  const availabilityEntries = useAvailabilityStore((s) => s.entries);
  const projectName = React.useCallback(
    (id: string) => projects.find((p) => p.id === id)?.name ?? id,
    [projects],
  );

  /**
   * Same read as the Team view and the dashboard — `useWeekLoggedHours`.
   *
   * ⚠️ This used to be a private copy of that query, and it ran *alongside* the
   * shared one: `WorkloadClient` calls the hook before it returns this
   * component, so the Mine view fired two requests for one number. Two copies
   * of "hours logged this week" is also two chances for the two pages to
   * disagree about the same person in the same week.
   */
  const weekLogged = useWeekLoggedHours();
  const hoursThisWeek =
    weekLogged == null ? null : Math.round((weekLogged[me] ?? 0) * 10) / 10;

  /**
   * "Now", read after mount rather than during render — the same rule the Team
   * view and the dashboard follow. Reading the clock while rendering makes the
   * component impure, and this renders on the server too, where "today" can
   * already be tomorrow for the browser.
   */
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const work = React.useMemo(
    () => assignedWork(tasks, me, { now }),
    [tasks, me, now],
  );
  const pendingCount = work.pending.length;

  // Time off comes off capacity here too. It only did on the Team view, so
  // someone on three days' leave saw 40h here and 16h on their manager's page.
  const cap = capacityFor(
    getEffectiveWeeklyHours(capacityOverrides, me),
    availabilityEntries,
    me,
    now,
  );
  const weeklyCap = cap.effective;
  const openEst = work.allocatedHours;
  const overdue = work.overdue;
  const {
    pct: utilPct,
    barPct,
    over: overCap,
  } = utilization(openEst, weeklyCap);
  const slices = React.useMemo(
    () => statusBreakdown(work.allocated),
    [work.allocated],
  );
  /**
   * Working time left in the week after what has already been logged.
   *
   * The card beside it, "Logged this week", is time RECORDED - the two read as a
   * pair. Deliberately not "spare capacity": with an unbounded backlog you can
   * have hours left in the week and still be over-allocated, and the utilisation
   * figure is the one that answers that.
   */
  const availableWeek =
    hoursThisWeek == null
      ? null
      : Math.max(0, Math.round((weeklyCap - hoursThisWeek) * 10) / 10);

  /**
   * Grouped over ALLOCATED work, not just accepted — the cards above count
   * pending too, and a list that showed fewer tasks than the number beside it
   * is how someone concludes the page is broken.
   */
  const pendingIds = React.useMemo(
    () => new Set(work.pending.map((t) => t.id)),
    [work.pending],
  );
  const byProject = React.useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of work.allocated) {
      if (!map.has(t.project_id)) map.set(t.project_id, []);
      map.get(t.project_id)!.push(t);
    }
    return [...map.entries()];
  }, [work.allocated]);

  return (
    <div className="flex flex-col gap-6">
      <WorkspacePageHeader
        eyebrow="Capacity"
        title="My workload"
        help={<AppHelp section="page.workload-mine" />}
        description={`Work allocated to you vs your weekly capacity (${DEFAULT_WEEKLY_CAPACITY_HOURS}h default, less any time off). A task leaves this page when it is moved to Done.`}
        actions={toggle}
      />

      {pendingCount > 0 ? (
        <div
          {...tourAnchor("workload.pending")}
          className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-500/15 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <span className="font-medium">{pendingCount}</span> task
            {pendingCount === 1 ? "" : "s"} awaiting your response — accept,
            decline, or pass.
          </p>
          <span className="ml-auto shrink-0 self-center">
            <TaskBadgePopover
              tasks={work.pending}
              label="pending"
              tone="amber"
              now={now}
              emptyHint="Waiting on you to accept, decline or pass."
            />
          </span>
        </div>
      ) : null}

      {/* 2-up on phones/tablet; 4 across only once there's real width. */}
      <section
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        {...tourAnchor("workload.mine")}
      >
        <Card size="sm">
          <CardHeader className="gap-1">
            <CardDescription>Open tasks</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {work.allocated.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader className="gap-1">
            <CardDescription>Open estimate</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {openEst}h
            </CardTitle>
            {work.pendingHours > 0 ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                incl. {work.pendingHours}h pending
              </p>
            ) : null}
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
            {availableWeek != null ? (
              <p
                className="text-xs text-muted-foreground tabular-nums"
                title="Working hours left in this week after time already logged, and after time off and holidays."
              >
                {availableWeek}h available
              </p>
            ) : null}
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader className="gap-1">
            <CardDescription>Utilization</CardDescription>
            <CardTitle
              className={cn(
                "text-2xl font-semibold tabular-nums",
                overCap && "text-amber-700 dark:text-amber-400",
              )}
            >
              {utilPct}%
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      <Card {...tourAnchor("workload.mine-work")}>
        <CardHeader>
          <CardTitle className="text-base">Your open work</CardTitle>
          <CardDescription>
            {openEst}h estimated across {work.allocated.length} task
            {work.allocated.length === 1 ? "" : "s"} · {utilPct}% of {weeklyCap}
            h/week
            {cap.awayDays > 0 || cap.holidayDays > 0 ? (
              /* Say why the number dropped, and which part is which. A capacity
                 that quietly shrank reads as a bug; and your leave is yours
                 while a holiday is everyone's. */
              <span className="text-rose-600 dark:text-rose-400">
                {" "}
                ({cap.contracted}h
                {cap.awayDays > 0
                  ? ` − ${cap.awayDays} ${cap.awayDays === 1 ? "day" : "days"} off`
                  : ""}
                {cap.holidayDays > 0
                  ? ` − ${cap.holidayDays} ${cap.holidayDays === 1 ? "holiday" : "holidays"}`
                  : ""}
                )
              </span>
            ) : null}
          </CardDescription>
          {overdue > 0 ? (
            <div className="pt-1">
              <TaskBadgePopover
                tasks={work.overdueTasks}
                label="overdue"
                tone="destructive"
                now={now}
                emptyHint="Past their due date and still open."
              />
            </div>
          ) : null}
          <CardAction>
            <AppHelp section="workload.mine-work" />
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-5 pt-0">
          <WorkloadBar
            slices={slices}
            totalHours={openEst}
            barPct={barPct}
            over={overCap}
          />

          {work.allocated.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing open. Work appears here when it is assigned to you, and
              leaves when you move it to Done.
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
                            {pendingIds.has(t.id) ? (
                              <Badge
                                variant="outline"
                                className="border-amber-500/40 text-[0.65rem] text-amber-700 dark:text-amber-400"
                              >
                                pending
                              </Badge>
                            ) : null}
                            {overdueRow ? (
                              <Badge
                                variant="destructive"
                                className="text-[0.65rem]"
                              >
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
