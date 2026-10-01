"use client";

import * as React from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Palmtree,
} from "lucide-react";

import { MineTeamToggle } from "@/components/common/mine-team-toggle";
import { WorkspacePageHeader } from "@/components/layouts/workspace-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePermissions } from "@/hooks/usePermissions";
import { usHolidayMap } from "@/lib/calendar/us-holidays";
import { useAuthStore } from "@/store/auth-store";
import { useTeamMembers } from "@/store/team-store";
import {
  calendarDayKey,
  eachYmdInInclusiveRange,
} from "@/lib/utils/availability-dates";
import { useAvailabilityStore } from "@/store/availability-store";
import { useProjectsStore } from "@/store/projects-store";
import { useSprintsStore } from "@/store/sprints-store";
import { useTasksDataStore } from "@/store/tasks-store";
import { cn } from "@/lib/utils";
import type { AvailabilityEntry } from "@/types/availability.types";
import { sprintTasksHref, backlogHref } from "@/lib/constants/sprints";
import Link from "next/link";
import { TASK_STATUS_DOT } from "@/lib/constants/task-status";
import type { TaskStatus } from "@/types/task.types";
import { tourAnchor } from "@/lib/tours/ids";

/** Shared, so a status cannot be purple here and blue on the next page. */
const STATUS_DOT = TASK_STATUS_DOT;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

type CalendarEvent = {
  id: string;
  title: string;
  type: "task" | "sprint-start" | "sprint-end";
  status?: TaskStatus;
  href: string;
};

type DayAway = { entry: AvailabilityEntry; name: string };

/** Whose schedule is on screen. Admin/manager can switch; everyone else can't. */
type Scope = "mine" | "team";

const AWAY_KIND_LABEL: Record<AvailabilityEntry["kind"], string> = {
  pto: "PTO / vacation",
  unavailable: "Away",
  partial: "Partial day",
};

export function CalendarClient() {
  const tasks = useTasksDataStore((s) => s.tasks);
  const sprints = useSprintsStore((s) => s.sprints);
  const projects = useProjectsStore((s) => s.projects);
  const allAvailability = useAvailabilityStore((s) => s.entries);
  const members = useTeamMembers();
  const me = useAuthStore((s) => s.user.authId ?? String(s.user.id));
  const { canApproveTimeOff } = usePermissions();

  /**
   * A Member/Viewer sees their own schedule and nothing else — their tasks,
   * the sprints of projects they are working on, and their own leave.
   *
   * The calendar used to show everyone everything: every person's PTO (with its
   * free-text note), and every task in every project. Migration 0034 narrowed
   * the read policy to match, so for a non-approver `allAvailability` now only
   * ever contains their own rows anyway — this filter is what the screen
   * promises, not what enforces it.
   */
  const [scope, setScope] = React.useState<Scope>(() =>
    canApproveTimeOff ? "team" : "mine"
  );
  const mineOnly = !canApproveTimeOff || scope === "mine";

  const availabilityEntries = React.useMemo(
    () => (mineOnly ? allAvailability.filter((e) => e.user_id === me) : allAvailability),
    [allAvailability, mineOnly, me]
  );

  const memberById = React.useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members]
  );

  const [viewDate, setViewDate] = React.useState(() => new Date());
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);

  const projectNameMap = React.useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  );

  const eventsByDate = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    const push = (key: string, ev: CalendarEvent) => {
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    };

    for (const t of tasks) {
      if (!t.due_date) continue;
      if (mineOnly && !t.assignee_ids.includes(me)) continue;
      const key = calendarDayKey(t.due_date);
      const href = t.sprint_id
        ? sprintTasksHref(t.project_id, t.sprint_id, t.id)
        : backlogHref(t.project_id, t.id);
      push(key, {
        id: t.id,
        title: t.title,
        type: "task",
        status: t.status,
        href,
      });
    }

    // Sprint markers follow the tasks: a sprint on a project you have no work
    // on is somebody else's milestone.
    const myProjects = new Set(
      tasks.filter((t) => t.assignee_ids.includes(me)).map((t) => t.project_id)
    );
    for (const s of sprints) {
      if (mineOnly && !myProjects.has(s.project_id)) continue;
      const projName = projectNameMap.get(s.project_id) ?? "Project";
      const startKey = calendarDayKey(s.start_date);
      push(startKey, {
        id: `${s.id}-start`,
        title: `${s.name} starts (${projName})`,
        type: "sprint-start",
        href: sprintTasksHref(s.project_id, s.id),
      });
      const endKey = calendarDayKey(s.end_date);
      push(endKey, {
        id: `${s.id}-end`,
        title: `${s.name} ends (${projName})`,
        type: "sprint-end",
        href: sprintTasksHref(s.project_id, s.id),
      });
    }

    return map;
  }, [tasks, sprints, projectNameMap, mineOnly, me]);

  const availabilityByDate = React.useMemo(() => {
    const map = new Map<string, DayAway[]>();
    for (const e of availabilityEntries) {
      // A refused request is not an absence — showing it would leave the
      // calendar contradicting the roster and the workload page.
      if (e.status === "rejected") continue;
      const name = memberById.get(e.user_id)?.name ?? `User ${e.user_id}`;
      for (const key of eachYmdInInclusiveRange(e.start_date, e.end_date)) {
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push({ entry: e, name });
      }
    }
    return map;
  }, [availabilityEntries, memberById]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const calendarDays = React.useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = firstDay.getDay();
    const days: { date: Date; key: string; isCurrentMonth: boolean }[] = [];

    for (let i = startOffset - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push({ date: d, key: ymd(d), isCurrentMonth: false });
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      days.push({ date, key: ymd(date), isCurrentMonth: true });
    }
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        const d = new Date(year, month + 1, i);
        days.push({ date: d, key: ymd(d), isCurrentMonth: false });
      }
    }
    return days;
  }, [year, month]);

  /**
   * Observed US holidays across the visible grid — including the leading and
   * trailing days from the neighbouring months, since those cells are on screen
   * and a holiday sitting in one would otherwise be the only unmarked day.
   */
  const holidays = React.useMemo(() => {
    if (!calendarDays.length) return new Map<string, string>();
    return usHolidayMap(
      calendarDays[0].key,
      calendarDays[calendarDays.length - 1].key,
    );
  }, [calendarDays]);

  const todayKey = ymd(new Date());

  const monthLabel = viewDate.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const goPrev = () => setViewDate(new Date(year, month - 1, 1));
  const goNext = () => setViewDate(new Date(year, month + 1, 1));
  const goToday = () => {
    setViewDate(new Date());
    setSelectedDate(todayKey);
  };

  const selectedEvents = selectedDate ? eventsByDate.get(selectedDate) ?? [] : [];
  const selectedAway = selectedDate ? availabilityByDate.get(selectedDate) ?? [] : [];
  const selectedHoliday = selectedDate ? holidays.get(selectedDate) ?? null : null;
  const selectedTotal =
    selectedAway.length + selectedEvents.length + (selectedHoliday ? 1 : 0);

  return (
    <div className="flex flex-col gap-6">
      <WorkspacePageHeader
        eyebrow="Schedule"
        title={mineOnly ? "My calendar" : "Calendar"}
        description={
          mineOnly
            ? "Your task due dates, the sprints you are working in, and your own time off."
            : "Task due dates, sprint milestones, and team PTO / availability in one view."
        }
        actions={
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            {/* Same Mine/Team control as Workload and the Dashboard. */}
            <MineTeamToggle
              view={scope}
              onChange={setScope}
              canSeeTeam={canApproveTimeOff}
            />
            <div className="flex items-center gap-2" {...tourAnchor("calendar.nav")}>
            <Button variant="outline" size="sm" className="border-border/60 bg-background/80" onClick={goToday}>
              Today
            </Button>
            <div className="flex items-center gap-0.5 rounded-xl border border-border/60 bg-card/50 px-1 py-0.5 backdrop-blur-sm">
              <Button variant="ghost" size="icon-sm" onClick={goPrev} aria-label="Previous month">
                <ChevronLeft className="size-4" />
              </Button>
              <span className="min-w-36 text-center text-sm font-medium tabular-nums">
                {monthLabel}
              </span>
              <Button variant="ghost" size="icon-sm" onClick={goNext} aria-label="Next month">
                <ChevronRight className="size-4" />
              </Button>
            </div>
            </div>
          </div>
        }
      />

      {/* Split only at xl: at lg (iPad landscape) a 320px side panel would leave
          ~408px for 7 day-columns (~58px each) — narrower than portrait, where
          the panel stacks and the month gets the full width. */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <Card {...tourAnchor("calendar.month")}>
          <CardContent className="p-2 sm:p-4">
            <div className="grid grid-cols-7">
              {DAY_NAMES.map((d) => (
                <div
                  key={d}
                  className="py-2 text-center text-xs font-medium text-muted-foreground"
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 border-t border-border">
              {calendarDays.map(({ date, key, isCurrentMonth }) => {
                const events = eventsByDate.get(key) ?? [];
                const away = availabilityByDate.get(key) ?? [];
                const holiday = holidays.get(key) ?? null;
                const isToday = key === todayKey;
                const isSelected = key === selectedDate;
                const taskEvents = events.filter((e) => e.type === "task");
                const milestoneEvents = events.filter((e) => e.type !== "task");

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDate(isSelected ? null : key)}
                    className={cn(
                      "relative flex min-h-16 flex-col gap-0.5 border-b border-r border-border p-1.5 text-left transition-colors hover:bg-muted/50 sm:min-h-20 sm:p-2",
                      !isCurrentMonth && "bg-muted/20 text-muted-foreground/50",
                      isSelected && "ring-2 ring-inset ring-primary",
                      /* Only granted leave tints the day. A request that has
                         not been approved must not look like settled fact. */
                      away.some((a) => a.entry.status !== "pending") &&
                        "bg-rose-500/6 dark:bg-rose-500/10",
                      /* A holiday is nobody's leave, so it gets its own neutral
                         tint rather than borrowing the PTO colour. */
                      holiday && "bg-muted/60",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                        isToday && "bg-primary text-primary-foreground font-semibold",
                      )}
                    >
                      {date.getDate()}
                    </span>
                    {holiday ? (
                      <span
                        className="mt-0.5 truncate rounded bg-foreground/10 px-1 text-[0.55rem] font-medium text-muted-foreground"
                        title={`${holiday} — US federal holiday, no work scheduled`}
                      >
                        {holiday}
                      </span>
                    ) : null}
                    {away.length > 0 && (
                      <div
                        className="mt-0.5 flex flex-wrap gap-0.5"
                        title="Time off — dashed outline means it is still awaiting approval"
                      >
                        {away.slice(0, 3).map(({ entry, name }) => (
                          <span
                            key={entry.id + key}
                            className={cn(
                              "max-w-13 truncate rounded px-1 text-[0.55rem] font-medium",
                              entry.status === "pending"
                                ? "border border-dashed border-amber-500/70 text-amber-800 dark:text-amber-200"
                                : "bg-rose-500/20 text-rose-800 dark:text-rose-200",
                            )}
                          >
                            {name.split(" ")[0] ?? name}
                          </span>
                        ))}
                        {away.length > 3 && (
                          <span className="text-[0.55rem] text-rose-700 dark:text-rose-300">
                            +{away.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                    {events.length > 0 && (
                      <div className="mt-auto flex flex-wrap gap-0.5">
                        {taskEvents.slice(0, 3).map((ev) => (
                          <span
                            key={ev.id}
                            className={cn(
                              "size-1.5 rounded-full",
                              ev.status ? STATUS_DOT[ev.status] : "bg-primary"
                            )}
                          />
                        ))}
                        {milestoneEvents.length > 0 && (
                          <span className="size-1.5 rounded-sm bg-amber-500" />
                        )}
                        {events.length > 4 && (
                          <span className="text-[0.55rem] text-muted-foreground">
                            +{events.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card {...tourAnchor("calendar.day")}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                {selectedDate
                  ? new Date(selectedDate + "T12:00:00").toLocaleDateString(
                      undefined,
                      { weekday: "long", month: "long", day: "numeric" }
                    )
                  : "Select a day"}
              </CardTitle>
              <CardDescription className="text-xs">
                {selectedTotal > 0
                  ? `${selectedTotal} item${selectedTotal > 1 ? "s" : ""}`
                  : selectedDate
                    ? "Nothing scheduled"
                    : "Click a day on the calendar"}
              </CardDescription>
            </CardHeader>
            <CardContent className="max-h-[60vh] space-y-2 overflow-y-auto pt-0">
              {selectedHoliday ? (
                <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 p-2.5">
                  <CalendarDays
                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{selectedHoliday}</p>
                    <p className="text-xs text-muted-foreground">
                      US federal holiday — excluded from timelines and weekly
                      capacity
                    </p>
                  </div>
                </div>
              ) : null}
              {selectedAway.map(({ entry, name }) => {
                const awaiting = entry.status === "pending";
                return (
                  <div
                    key={entry.id}
                    className={cn(
                      "flex items-start gap-2 rounded-lg border p-2.5",
                      awaiting
                        ? "border-dashed border-amber-400/70 bg-amber-500/5 dark:border-amber-700/60 dark:bg-amber-500/10"
                        : "border-rose-200/80 bg-rose-500/5 dark:border-rose-900/50 dark:bg-rose-500/10",
                    )}
                  >
                    <Palmtree
                      className={cn(
                        "mt-0.5 size-3.5 shrink-0",
                        awaiting
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-rose-600 dark:text-rose-400",
                      )}
                    />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5 truncate text-sm font-medium">
                        {name}
                        {awaiting ? (
                          <Badge
                            variant="outline"
                            className="border-amber-500/40 text-[0.6rem] font-normal text-amber-700 dark:text-amber-400"
                          >
                            awaiting approval
                          </Badge>
                        ) : null}
                      </p>
                      <p
                        className={cn(
                          "text-xs",
                          awaiting
                            ? "text-amber-800/90 dark:text-amber-200/90"
                            : "text-rose-800/90 dark:text-rose-200/90",
                        )}
                      >
                        {AWAY_KIND_LABEL[entry.kind]}
                        {entry.note ? ` · ${entry.note}` : ""}
                      </p>
                    </div>
                  </div>
                );
              })}
              {selectedEvents.map((ev) => (
                <Link
                  key={ev.id}
                  href={ev.href}
                  className="flex items-start gap-2 rounded-lg border border-border p-2.5 transition-colors hover:bg-muted/50"
                >
                  {ev.type === "task" && ev.status ? (
                    <span
                      className={cn(
                        "mt-1 size-2 shrink-0 rounded-full",
                        STATUS_DOT[ev.status]
                      )}
                    />
                  ) : (
                    <CalendarDays className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{ev.title}</p>
                    <p className="text-xs capitalize text-muted-foreground">
                      {ev.type === "task"
                        ? ev.status?.replace("_", " ")
                        : ev.type.replace("-", " ")}
                    </p>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>

          {/* Legend — grouped + 2-column so it's compact, not a tall list. */}
          <Card {...tourAnchor("calendar.legend")}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Legend</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div>
                <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground/80">
                  Task status
                </p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  {Object.entries(STATUS_DOT).map(([status, color]) => (
                    <div key={status} className="flex items-center gap-2">
                      <span className={cn("size-2 shrink-0 rounded-full", color)} />
                      <span className="capitalize text-muted-foreground">
                        {status.replace("_", " ")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground/80">
                  On the calendar
                </p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-sm bg-amber-500" />
                    <span className="text-muted-foreground">Sprint milestone</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-sm bg-rose-500/70" />
                    <span className="text-muted-foreground">PTO / away</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-sm border border-dashed border-amber-500/80" />
                    <span className="text-muted-foreground">Awaiting approval</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-sm bg-foreground/25" />
                    <span className="text-muted-foreground">US holiday</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
