"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Scale } from "lucide-react";
import { Bar, BarChart, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";

import { TaskBadgePopover } from "@/components/features/workload/TaskBadgePopover";
import { WorkloadBar } from "@/components/features/workload/WorkloadBar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useWeekLoggedHours } from "@/hooks/useWeekLoggedHours";
import {
  OPEN_TASK_STATUSES,
  TASK_STATUS_META,
} from "@/lib/constants/task-status";
import { isOverdue } from "@/lib/utils/relative-dates";
import {
  assignedWork,
  capacityFor,
  isOpen,
  statusBreakdown,
  utilization,
} from "@/lib/workload/assigned-work";
import { useAvailabilityStore } from "@/store/availability-store";
import { useJoinedTeamMembers, useTeamStore } from "@/store/team-store";
import { useTasksDataStore } from "@/store/tasks-store";
import {
  getEffectiveWeeklyHours,
  useWeeklyCapacityStore,
} from "@/store/weekly-capacity-store";

/**
 * The admin/manager dashboard: who is carrying what, at a glance.
 *
 * WARNING: every number here comes from `lib/workload/assigned-work.ts` —
 * `assignedWork` / `capacityFor` / `utilization` / `statusBreakdown`, the same
 * four calls the Workload page makes. This page deliberately derives NOTHING of
 * its own. A dashboard that computed "open tasks" its own way is precisely how
 * Reports and Workload came to disagree on screen about the same person in the
 * same week, and a dashboard is the one page people quote at each other.
 *
 * Colours come from `TASK_STATUS_META`, so a bar segment here is the same hue as
 * the dot on the board, the calendar and the workload bar.
 */
const chartConfig = Object.fromEntries(
  OPEN_TASK_STATUSES.map((s) => [
    s,
    { label: TASK_STATUS_META[s].label, color: TASK_STATUS_META[s].hex },
  ]),
) satisfies ChartConfig;

export function DashboardTeam() {
  const members = useJoinedTeamMembers();
  const teamLoaded = useTeamStore((s) => s.loaded);
  const teamError = useTeamStore((s) => s.error);
  const tasks = useTasksDataStore((s) => s.tasks);
  // Rule 2: a KPI must not state a number it does not have yet. The stores
  // hydrate async, and every figure below reads a real-looking 0 until they
  // arrive — for a moment the page asserted "0 overdue" as fact.
  const tasksLoaded = useTasksDataStore((s) => s.loaded);
  const availabilityEntries = useAvailabilityStore((s) => s.entries);
  const capacityOverrides = useWeeklyCapacityStore((s) => s.overrides);
  const weekLogged = useWeekLoggedHours();

  // The clock, read once after mount and never during render: reading it while
  // rendering is impure, and this renders on the server too, where "today" can
  // already be tomorrow for the browser.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const rows = React.useMemo(
    () =>
      members
        .map((m) => {
          const cap = capacityFor(
            getEffectiveWeeklyHours(capacityOverrides, m.id),
            availabilityEntries,
            m.id,
            now,
          );
          const work = assignedWork(tasks, m.id, { now });
          const util = utilization(work.allocatedHours, cap.effective);
          const slices = statusBreakdown(work.allocated);
          const byStatus = Object.fromEntries(
            OPEN_TASK_STATUSES.map((s) => [
              s,
              slices.find((x) => x.status === s)?.count ?? 0,
            ]),
          ) as Record<string, number>;
          const name = m.name?.trim() || "Unnamed";
          return {
            id: m.id,
            name,
            role: m.role,
            work,
            cap,
            util,
            slices,
            ...byStatus,
            loggedWeek: Math.round((weekLogged?.[m.id] ?? 0) * 10) / 10,
          };
        })
        // Busiest first: the people a manager has to act on belong at the top,
        // not whoever happens to be alphabetically first.
        .sort((a, b) => b.work.allocatedHours - a.work.allocatedHours),
    [members, tasks, availabilityEntries, capacityOverrides, weekLogged, now],
  );

  /**
   * Axis labels: first name, disambiguated only when it has to be.
   *
   * ⚠️ Two people called Daniel produced two identical bars, so the one row a
   * manager needed to act on was unidentifiable. Bare first names stay for
   * everyone whose first name is unique — "Daniel R." for all six people would
   * be noise — and a collision adds the surname initial, falling back to the
   * full name when that still collides.
   */
  const chartRows = React.useMemo(() => {
    const firstCount = new Map<string, number>();
    for (const r of rows) {
      const f = r.name.split(/\s+/)[0];
      firstCount.set(f, (firstCount.get(f) ?? 0) + 1);
    }
    const used = new Set<string>();
    return rows.map((r) => {
      const parts = r.name.split(/\s+/);
      const first = parts[0];
      let label = first;
      if ((firstCount.get(first) ?? 0) > 1) {
        label = parts[1] ? `${first} ${parts[1][0]}.` : first;
        if (used.has(label)) label = r.name;
      }
      used.add(label);
      return { ...r, short: label };
    });
  }, [rows]);

  /**
   * Workspace-level figures: EVERY open task, counted ONCE.
   *
   * The per-person rows credit a shared task to each assignee, which is right
   * for "how loaded is this individual". These answer "how much work is there",
   * where a 6h task with two assignees is 6h, not 12h.
   *
   * ⚠️ Derived from all open tasks, NOT from the union of per-person
   * allocations. The union version had two faults: summing each person's
   * overdue count counted a shared overdue task once per assignee, and it left
   * out UNASSIGNED work entirely — the overdue task nobody owns is the one a
   * manager most needs to see. Both made this page's "Overdue" disagree with
   * Reports', which counts `status !== "done" && isOverdue` over every task. Now
   * it is the same definition, so the two pages cannot drift.
   */
  const openAll = React.useMemo(() => tasks.filter(isOpen), [tasks]);
  const workspaceMix = React.useMemo(() => statusBreakdown(openAll), [openAll]);

  const totals = React.useMemo(() => {
    const openHours = workspaceMix.reduce((n, s) => n + s.hours, 0);
    return {
      openTasks: openAll.length,
      openHours: Math.round(openHours * 10) / 10,
      unassigned: openAll.filter((t) => t.assignee_ids.length === 0).length,
      overdue: openAll.filter((t) => isOverdue(t.due_date, now)).length,
      // Per ASSIGNMENT on purpose: each pending row is a different person's
      // unanswered offer, so two people yet to reply to one task is two.
      pending: rows.reduce((n, r) => n + r.work.pending.length, 0),
      overCap: rows.filter((r) => r.util.over).length,
      loggedWeek:
        Math.round(rows.reduce((n, r) => n + r.loggedWeek, 0) * 10) / 10,
    };
  }, [rows, openAll, workspaceMix, now]);

  /**
   * Three states, in the order that keeps each one honest.
   *
   * ⚠️ The empty state must come LAST and be gated on `loaded`. The roster
   * hydrates async, so `members` is `[]` for the first moments of every visit —
   * rendering "No team members yet. Invite people…" there tells an admin with a
   * full team that their team is missing, which is worse than showing nothing.
   */
  if (teamError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Couldn&apos;t load the team</CardTitle>
          <CardDescription>{teamError}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!teamLoaded) {
    return (
      <div className="flex flex-col gap-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </section>
        <section className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </section>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (!members.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No team members yet</CardTitle>
          <CardDescription>
            Invite people from the Team page and their workload appears here.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const kpis = [
    {
      label: "Open tasks",
      value: totals.openTasks,
      hint: totals.unassigned
        ? `${totals.openHours}h estimated · ${totals.unassigned} unassigned`
        : `${totals.openHours}h estimated`,
    },
    { label: "Overdue", value: totals.overdue, hint: "open tasks past due" },
    {
      label: "Awaiting response",
      value: totals.pending,
      hint: "assignments not yet accepted",
    },
    {
      label: "Logged this week",
      value: `${totals.loggedWeek}h`,
      hint: "from time entries",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} size="sm">
            <CardHeader className="gap-1">
              <CardDescription>{k.label}</CardDescription>
              <CardTitle className="text-2xl font-semibold tracking-tight">
                {tasksLoaded ? k.value : "—"}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{k.hint}</p>
            </CardHeader>
          </Card>
        ))}
      </section>

      {totals.overCap > 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <AlertTriangle
            className="size-4 shrink-0 text-amber-600"
            aria-hidden="true"
          />
          <span>
            {totals.overCap} {totals.overCap === 1 ? "person is" : "people are"}{" "}
            over capacity this week.{" "}
            <Link href="/workload" className="underline underline-offset-2">
              Open Workload
            </Link>
          </span>
        </div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Open tasks per person</CardTitle>
            <CardDescription>
              Segments are task status, in the same colours as the board.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Height grows with the roster so the bars stay readable instead
                of squeezing twenty people into a fixed box. */}
            <ChartContainer
              config={chartConfig}
              className="w-full"
              style={{ height: Math.max(180, chartRows.length * 44) }}
            >
              <BarChart accessibilityLayer data={chartRows} layout="vertical">
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="short"
                  width={88}
                  tickLine={false}
                  axisLine={false}
                  // An 88px axis clips long handles from the LEFT ("paragas.shopify"
                  // for "danielparagas.shopify"), hiding the start of the name.
                  // Truncate at the end instead; the tooltip keeps the full label.
                  tickFormatter={(v: string) =>
                    v.length > 12 ? `${v.slice(0, 11)}…` : v
                  }
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                {OPEN_TASK_STATUSES.map((s) => (
                  <Bar
                    key={s}
                    dataKey={s}
                    name={TASK_STATUS_META[s].label}
                    stackId="a"
                    fill={TASK_STATUS_META[s].hex}
                  />
                ))}
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Workspace status mix</CardTitle>
            <CardDescription>
              Every open task, counted once — assigned or not.
            </CardDescription>
          </CardHeader>
          {/* The card stretches to the bar chart beside it, so the donut grows
              into that height (flex-1) instead of sitting at 180px above a hole;
              the legend stays pinned under it. Radii are percentages so the ring
              keeps its proportions at any size. */}
          <CardContent className="flex flex-1 flex-col">
            {workspaceMix.length ? (
              <>
                <ChartContainer
                  config={chartConfig}
                  className="mx-auto aspect-auto min-h-[180px] w-full flex-1"
                >
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Pie
                      data={workspaceMix}
                      dataKey="count"
                      nameKey="status"
                      innerRadius="58%"
                      outerRadius="85%"
                    >
                      {workspaceMix.map((s) => (
                        <Cell
                          key={s.status}
                          fill={TASK_STATUS_META[s.status].hex}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <ul className="mt-3 space-y-1 text-sm">
                  {workspaceMix.map((s) => (
                    <li key={s.status} className="flex items-center gap-2">
                      <span
                        className={`size-2.5 rounded-full ${TASK_STATUS_META[s.status].dot}`}
                        aria-hidden="true"
                      />
                      <span className="flex-1">
                        {TASK_STATUS_META[s.status].label}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {s.count} · {s.hours}h
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No open tasks in the workspace.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Breakdown by person</CardTitle>
          <CardDescription>
            Open is accepted + pending — the figure a sprint is planned against.
            The counts open the task list behind them.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Person</th>
                <th className="py-2 pr-3 font-medium">Open</th>
                <th className="py-2 pr-3 font-medium">Overdue</th>
                <th className="py-2 pr-3 font-medium">Pending</th>
                <th className="py-2 pr-3 font-medium">Logged wk</th>
                {/* The widest column on purpose: the bar is the one cell that carries a
                    picture, and with a fixed 7rem bar the right third of the
                    card sat empty while the breakdown stacked one status per line. */}
                <th className="w-[38%] py-2 font-medium">Utilisation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-border/40 last:border-0"
                >
                  <td className="py-2.5 pr-3">
                    <span className="font-medium">{r.name}</span>
                    <Badge variant="outline" className="ml-2 capitalize">
                      {r.role}
                    </Badge>
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums">
                    {r.work.allocated.length}
                    <span className="text-muted-foreground">
                      {" "}
                      · {r.work.allocatedHours}h
                    </span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <TaskBadgePopover
                      tasks={r.work.overdueTasks}
                      label="overdue"
                      tone="destructive"
                      now={now}
                      emptyHint="Past their due date and still open."
                    />
                  </td>
                  <td className="py-2.5 pr-3">
                    <TaskBadgePopover
                      tasks={r.work.pending}
                      label="pending"
                      tone="amber"
                      now={now}
                      emptyHint={`Waiting on ${r.name} to accept, decline or pass.`}
                    />
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums">{r.loggedWeek}h</td>
                  <td className="py-2.5">
                    <div className="flex items-start gap-3">
                      <WorkloadBar
                        slices={r.slices}
                        totalHours={r.work.allocatedHours}
                        barPct={r.util.barPct}
                        over={r.util.over}
                        className="min-w-32 flex-1"
                      />
                      {/* Fixed width so every row's figure lines up in one column. */}
                      <span className="-mt-1 flex w-28 shrink-0 items-center justify-end gap-1.5 tabular-nums text-xs text-muted-foreground">
                        {`${r.util.pct}% of ${r.cap.effective}h`}
                        {r.util.over ? (
                          <Scale
                            className="size-3.5 text-amber-600"
                            aria-hidden="true"
                          />
                        ) : (
                          <span className="size-3.5" aria-hidden />
                        )}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
