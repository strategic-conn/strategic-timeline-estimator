"use client";

import * as React from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Circle,
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
import { useProjectsStore } from "@/store/projects-store";
import { useSprintsStore } from "@/store/sprints-store";
import { useTasksDataStore } from "@/store/tasks-store";
import { cn } from "@/lib/utils";
import { sprintTasksHref, backlogHref } from "@/lib/constants/sprints";
import Link from "next/link";
import type { TaskStatus } from "@/types/task.types";

const STATUS_DOT: Record<TaskStatus, string> = {
  todo: "bg-slate-400",
  in_progress: "bg-blue-500",
  in_review: "bg-purple-500",
  done: "bg-green-500",
  blocked: "bg-red-500",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseYmd(iso: string): string {
  const d = new Date(iso);
  return ymd(d);
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

export function CalendarClient() {
  const tasks = useTasksDataStore((s) => s.tasks);
  const sprints = useSprintsStore((s) => s.sprints);
  const projects = useProjectsStore((s) => s.projects);

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
      const key = parseYmd(t.due_date);
      const href = t.sprint_id
        ? sprintTasksHref(t.project_id, t.sprint_id)
        : backlogHref(t.project_id);
      push(key, {
        id: t.id,
        title: t.title,
        type: "task",
        status: t.status,
        href,
      });
    }

    for (const s of sprints) {
      const projName = projectNameMap.get(s.project_id) ?? "Project";
      const startKey = parseYmd(s.start_date);
      push(startKey, {
        id: `${s.id}-start`,
        title: `${s.name} starts (${projName})`,
        type: "sprint-start",
        href: sprintTasksHref(s.project_id, s.id),
      });
      const endKey = parseYmd(s.end_date);
      push(endKey, {
        id: `${s.id}-end`,
        title: `${s.name} ends (${projName})`,
        type: "sprint-end",
        href: sprintTasksHref(s.project_id, s.id),
      });
    }

    return map;
  }, [tasks, sprints, projectNameMap]);

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Task due dates and sprint milestones across all projects.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={goPrev} aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-40 text-center text-sm font-medium">
            {monthLabel}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={goNext} aria-label="Next month">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
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
          <Card>
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
                {selectedEvents.length
                  ? `${selectedEvents.length} event${selectedEvents.length > 1 ? "s" : ""}`
                  : selectedDate
                    ? "No events"
                    : "Click a day on the calendar"}
              </CardDescription>
            </CardHeader>
            <CardContent className="max-h-[60vh] space-y-2 overflow-y-auto pt-0">
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

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Legend</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 pt-0 text-xs">
              {Object.entries(STATUS_DOT).map(([status, color]) => (
                <div key={status} className="flex items-center gap-2">
                  <span className={cn("size-2 rounded-full", color)} />
                  <span className="capitalize text-muted-foreground">
                    {status.replace("_", " ")}
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-sm bg-amber-500" />
                <span className="text-muted-foreground">Sprint milestone</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
