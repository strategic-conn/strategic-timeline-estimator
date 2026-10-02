"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Scale } from "lucide-react";

import { MineTeamToggle } from "@/components/common/mine-team-toggle";
import { MemberWeeklyHoursInput } from "@/components/features/workload/MemberWeeklyHoursInput";
import {
  TaskBadgePopover,
  taskHref,
} from "@/components/features/workload/TaskBadgePopover";
import { WorkloadBar } from "@/components/features/workload/WorkloadBar";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkloadMine } from "@/components/features/workload/WorkloadMine";
import { WorkspacePageHeader } from "@/components/layouts/workspace-page-header";
import {
  Card,
  CardAction,
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
import { DEFAULT_WEEKLY_CAPACITY_HOURS } from "@/lib/constants/workload";
import {
  assignedWork,
  capacityFor,
  statusBreakdown,
  utilization,
} from "@/lib/workload/assigned-work";
import { useAuthStore } from "@/store/auth-store";
import { useJoinedTeamMembers, useTeamStore } from "@/store/team-store";
import { useProjectsStore } from "@/store/projects-store";
import { useTasksDataStore } from "@/store/tasks-store";
import {
  getEffectiveWeeklyHours,
  useWeeklyCapacityStore,
} from "@/store/weekly-capacity-store";
import { cn } from "@/lib/utils";
import { useAvailabilityStore } from "@/store/availability-store";
import type { Task } from "@/types/task.types";
import { useWeekLoggedHours } from "@/hooks/useWeekLoggedHours";
import { tourAnchor } from "@/lib/tours/ids";
import { AppHelp } from "@/components/common/app-help";

type ProjectFilter = "all" | string;

/**
 * Every task allocated to this person: accepted AND still-pending.
 *
 * Shared with "Mine" via `assignedWork` — this used to read `assignee_ids`
 * directly, which is the same set, but the two pages then computed their
 * headline numbers from different definitions and disagreed on screen.
 */
function openAssignedTasks(
  tasks: Task[],
  memberId: string,
  projectId: ProjectFilter,
  now: Date | number,
) {
  return assignedWork(tasks, memberId, { projectId, now }).allocated;
}

export function WorkloadClient() {
  const tasks = useTasksDataStore((s) => s.tasks);
  const projects = useProjectsStore((s) => s.projects);
  const capacityOverrides = useWeeklyCapacityStore((s) => s.overrides);
  /**
   * People who actually joined — not every profile row.
   *
   * `useTeamMembers()` includes invitees who never accepted, so the team table
   * listed two accounts that cannot hold work at all, each carrying the default
   * weekly capacity. Deactivated members are deliberately kept: if someone left
   * with open tasks still assigned, this is the page that has to show it.
   */
  const members = useJoinedTeamMembers();
  const teamLoaded = useTeamStore((s) => s.loaded);
  const availabilityEntries = useAvailabilityStore((s) => s.entries);
  const role = useAuthStore((s) => s.user.role);
  const canSeeTeam = role === "admin" || role === "manager";

  const [projectId, setProjectId] = React.useState<ProjectFilter>("all");
  const [view, setView] = React.useState<"mine" | "team">(
    canSeeTeam ? "team" : "mine",
  );
  const toggle = (
    <MineTeamToggle view={view} onChange={setView} canSeeTeam={canSeeTeam} />
  );

  const projectNameMap = React.useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  );

  // Hours logged this week per person — shared with the dashboard.
  const weekLogged = useWeekLoggedHours();

  /**
   * "Now", read after mount rather than during render — the same rule the
   * dashboard follows. Reading the clock while rendering makes the component
   * impure, and this renders on the server too, where "today" can already be
   * tomorrow for the browser.
   */
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const rows = React.useMemo(() => {
    return members
      .map((m) => {
        // Time off comes off this week's capacity: planning against contracted
        // hours for someone on leave is how work gets assigned to an empty desk.
        const cap = capacityFor(
          getEffectiveWeeklyHours(capacityOverrides, m.id),
          availabilityEntries,
          m.id,
          now,
        );
        const contractedCap = cap.contracted;
        const awayDays = cap.awayDays;
        const holidayDays = cap.holidayDays;
        const weeklyCap = cap.effective;
        const work = assignedWork(tasks, m.id, { projectId, now });
        const open = work.allocated;
        const pendingTasks = work.pending;
        const overdueTasks = work.overdueTasks;
        const pending = pendingTasks.length;
        const pendingEst = work.pendingHours;
        const loggedWeek = Math.round((weekLogged?.[m.id] ?? 0) * 10) / 10;
        const openEst = work.allocatedHours;
        const overdue = work.overdue;

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

        const util = utilization(openEst, weeklyCap);
        const slices = statusBreakdown(open);
        // Working time left in the week after what has already been logged.
        // NOT "spare capacity" - that is what utilisation answers, and with an
        // unbounded backlog the two can point opposite ways.
        const availableWeek = Math.max(
          0,
          Math.round((weeklyCap - loggedWeek) * 10) / 10,
        );

        return {
          slices,
          availableWeek,
          pendingTasks,
          overdueTasks,
          member: m,
          weeklyCap,
          contractedCap,
          awayDays,
          holidayDays,
          openTasks: open,
          openCount: open.length,
          pending,
          pendingEst,
          loggedWeek,
          openEst,
          overdue,
          breakdown,
          utilPct: util.pct,
          barVisual: util.barPct,
          overCap: util.over,
        };
      })
      .sort((a, b) => b.openEst - a.openEst);
  }, [
    members,
    tasks,
    projectId,
    projectNameMap,
    capacityOverrides,
    weekLogged,
    now,
    availabilityEntries,
  ]);

  const peopleWithOpen = rows.filter((r) => r.openCount > 0).length;

  /**
   * Each open task's estimate counted ONCE, not once per assignee.
   *
   * Summing the per-person column double-counts shared work: a 6h task with two
   * assignees made the workspace look like it had 12h of work outstanding. The
   * per-person rows are still per-person — that column answers "how loaded is
   * this individual", where counting the whole task for each of them is right.
   * This tile answers "how much work is there", which is a different question.
   */
  const totalOpenEst = React.useMemo(() => {
    const seen = new Set<string>();
    let sum = 0;
    for (const m of members) {
      for (const t of openAssignedTasks(tasks, m.id, projectId, now)) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        sum += t.estimated_hours ?? 0;
      }
    }
    return sum;
  }, [members, tasks, projectId, now]);
  const overCapacityCount = rows.filter((r) => r.overCap).length;

  if (view === "mine") return <WorkloadMine toggle={toggle} />;

  return (
    <div className="flex flex-col gap-6">
      <WorkspacePageHeader
        eyebrow="Capacity"
        title="Resource allocation"
        help={<AppHelp section="page.workload-team" />}
        description={`Open work by assignee — utilization uses each person’s weekly capacity (default ${DEFAULT_WEEKLY_CAPACITY_HOURS}h). Edit hours below to save per person.`}
        actions={
          <div className="flex w-full flex-col items-end gap-2 max-sm:items-start sm:flex-row sm:items-end sm:justify-end">
            {toggle}
            <div className="flex w-full min-w-0 flex-col gap-1.5 sm:max-w-xs md:w-56 md:max-w-none">
              <span className="text-xs font-medium text-muted-foreground">
                Project
              </span>
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
      <section
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        {...tourAnchor("workload.team")}
      >
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
                overCapacityCount > 0 && "text-amber-700 dark:text-amber-400",
              )}
            >
              {overCapacityCount}
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      <Card {...tourAnchor("workload.people")}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="size-4 text-muted-foreground" aria-hidden />
            Load by person
          </CardTitle>
          <CardDescription>
            Non-done tasks only — a task leaves this page when someone moves it
            to <span className="font-medium">Done</span>. The bar is coloured by
            task status, so a full bar says whether the work is unstarted, in
            flight or blocked. Utilization = allocated estimated hours (accepted{" "}
            <span className="font-medium">and</span> still-pending) ÷ that
            person’s weekly hours after time off and holidays.
          </CardDescription>
          <CardAction>
            <AppHelp section="workload.people" />
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-6 pt-0">
          {/* Rule 2: loading and empty are different answers. The roster
              hydrates async, so an unqualified "no one here" would libel a full
              team for the first moments of every visit. */}
          {!teamLoaded ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28 rounded-lg" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No team members to show yet.
            </p>
          ) : null}

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
                      <TaskBadgePopover
                        tasks={r.pendingTasks}
                        label="pending"
                        tone="amber"
                        now={now}
                        emptyHint={`Waiting on ${r.member.name} to accept, decline or pass.`}
                      />
                    </div>
                  </div>
                  <span className="shrink-0">
                    <TaskBadgePopover
                      tasks={r.overdueTasks}
                      label="overdue"
                      tone="destructive"
                      now={now}
                      emptyHint="Past their due date and still open."
                    />
                  </span>
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                  <span>
                    <span className="text-muted-foreground">Open </span>
                    <span className="font-medium tabular-nums">
                      {r.openCount}
                    </span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">Est. </span>
                    <span className="font-medium tabular-nums">
                      {r.openEst}h
                    </span>
                    {/* Allocation includes work that has been offered and not
                        yet answered. Leaving that unsaid is what made this
                        number disagree with the person's own page. */}
                    {r.pendingEst > 0 ? (
                      <span className="text-muted-foreground tabular-nums">
                        {" "}
                        (incl. {r.pendingEst}h pending)
                      </span>
                    ) : null}
                  </span>
                  <span title="Hours recorded against tasks since Monday.">
                    <span className="text-muted-foreground">
                      Logged this wk{" "}
                    </span>
                    <span
                      className={cn(
                        "font-medium tabular-nums",
                        r.loggedWeek > 0
                          ? "text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {r.loggedWeek}h
                    </span>
                  </span>
                  <span title="Working hours left in this week after time already logged, and after time off and holidays. It is not spare capacity - see the utilisation figure below.">
                    <span className="text-muted-foreground">Available </span>
                    <span className="font-medium tabular-nums">
                      {r.availableWeek}h
                    </span>
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <WorkloadBar
                    slices={r.slices}
                    totalHours={r.openEst}
                    barPct={r.barVisual}
                    over={r.overCap}
                  />
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {r.utilPct}% of {r.weeklyCap}h{" "}
                    {r.awayDays > 0 || r.holidayDays > 0 ? (
                      /* Say why the number dropped, and which part is which. A
                         capacity that quietly shrank reads as a bug; and leave
                         is a choice somebody made while a holiday is not. */
                      <span className="ml-1 text-rose-600 dark:text-rose-400">
                        ({r.contractedCap}h
                        {r.awayDays > 0
                          ? ` − ${r.awayDays} ${r.awayDays === 1 ? "day" : "days"} off`
                          : ""}
                        {r.holidayDays > 0
                          ? ` − ${r.holidayDays} ${r.holidayDays === 1 ? "holiday" : "holidays"}`
                          : ""}
                        )
                      </span>
                    ) : null}
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

          {/* The capacity editor sits last: the page is read for who is
              loaded, and hours are adjusted far less often than they are read. */}
          <div
            className="relative rounded-xl border border-border/60 bg-muted/15 p-4 sm:pr-12"
            {...tourAnchor("workload.capacity")}
          >
            <AppHelp section="workload.capacity" corner className="right-3 top-3" />
            <p className="text-sm font-medium max-sm:pr-8">Weekly capacity by person</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Whole hours, {DEFAULT_WEEKLY_CAPACITY_HOURS}h default. Press Enter
              or click away to save (1–168).
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
                        m.id,
                      )}
                      label={m.name}
                    />
                    <span className="text-xs text-muted-foreground">h/wk</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
