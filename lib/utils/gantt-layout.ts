import {
  addDays,
  addWeeks,
  differenceInCalendarDays,
  isValid,
  max as dfMax,
  min as dfMin,
  parseISO,
  startOfDay,
  startOfWeek,
} from "date-fns";

import { backlogHref, sprintTasksHref } from "@/lib/constants/sprints";
import type { Sprint } from "@/types/sprint.types";
import type { Task } from "@/types/task.types";

/** Calendar day from API/store strings: ISO datetimes (sprints, tasks) or plain YYYY-MM-DD. */
function parseStoredCalendarDay(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  if (s.includes("T") || s.endsWith("Z")) {
    const d = startOfDay(parseISO(s));
    return isValid(d) ? d : null;
  }
  const d = startOfDay(new Date(`${s}T12:00:00`));
  return isValid(d) ? d : null;
}

function parseStoredCalendarDayOrToday(raw: string): Date {
  return parseStoredCalendarDay(raw) ?? startOfDay(new Date());
}

function hrefForTask(task: Task, sprintById: Map<string, Sprint>): string {
  const sprint = task.sprint_id ? sprintById.get(task.sprint_id) : undefined;
  if (sprint) {
    return sprintTasksHref(task.project_id, sprint.id, task.id);
  }
  return backlogHref(task.project_id, task.id);
}

/** Calendar bar: sprint window, or backlog from created → due (or short default span). */
export function computeTaskBarRange(
  task: Task,
  sprintById: Map<string, Sprint>
): { start: Date; end: Date } {
  const sprint = task.sprint_id ? sprintById.get(task.sprint_id) ?? null : null;
  if (sprint) {
    const start = parseStoredCalendarDayOrToday(sprint.start_date);
    let end = task.due_date
      ? parseStoredCalendarDayOrToday(task.due_date)
      : parseStoredCalendarDayOrToday(sprint.end_date);
    const sprintEnd = parseStoredCalendarDayOrToday(sprint.end_date);
    if (end > sprintEnd) end = sprintEnd;
    if (start > end) {
      return { start, end: start };
    }
    return { start, end };
  }

  const created = parseStoredCalendarDay(task.created_at);
  const start = created ?? startOfDay(new Date());
  let end = task.due_date
    ? parseStoredCalendarDayOrToday(task.due_date)
    : addDays(start, 2);
  if (end < start) end = start;
  return { start, end };
}

export type GanttLayoutRow = {
  task: Task;
  projectName: string;
  sprintName: string | null;
  start: Date;
  end: Date;
  href: string;
  leftPct: number;
  widthPct: number;
};

export type GanttLayoutModel = {
  rows: GanttLayoutRow[];
  rangeStart: Date;
  rangeEnd: Date;
  totalDays: number;
  todayLinePct: number | null;
  timelineWidthPx: number;
};

/** Week-start markers (Sunday) for grid lines and timeline headers; `leftPct` is 0–100 in range. */
export type GanttWeekTick = { weekStart: Date; leftPct: number };

export function getGanttWeekTicks(
  rangeStart: Date,
  rangeEnd: Date,
  totalDays: number
): GanttWeekTick[] {
  if (totalDays <= 0 || !isValid(rangeStart) || !isValid(rangeEnd)) return [];
  const out: GanttWeekTick[] = [];
  let d = startOfWeek(rangeStart, { weekStartsOn: 0 });
  const end = rangeEnd;
  while (d <= end) {
    const leftPct = (differenceInCalendarDays(d, rangeStart) / totalDays) * 100;
    if (leftPct <= 100 + 1e-6) {
      out.push({ weekStart: d, leftPct });
    }
    d = addWeeks(d, 1);
  }
  return out;
}

const MIN_PIXELS_PER_DAY = 12;
const TIMELINE_MIN_WIDTH_PX = 760;

/** Range, width and today line for any set of dated bars; each row gains left/width %. */
export function layoutBars<T extends { start: Date; end: Date }>(
  items: T[],
): Omit<GanttLayoutModel, "rows"> & { rows: (T & { leftPct: number; widthPct: number })[] } {
  const today = startOfDay(new Date());
  // Empty: today -14 → +28 once padded, as before.
  let minD = items[0]?.start ?? addDays(today, -10);
  let maxD = items[0]?.end ?? addDays(today, 18);
  for (const r of items) {
    minD = dfMin([minD, r.start]);
    maxD = dfMax([maxD, r.end]);
  }
  const rangeStart = addDays(minD, -4);
  const rangeEnd = addDays(maxD, 10);
  const totalDays = Math.max(1, differenceInCalendarDays(rangeEnd, rangeStart) + 1);
  const timelineWidthPx = Math.max(TIMELINE_MIN_WIDTH_PX, totalDays * MIN_PIXELS_PER_DAY);
  const todayLinePct =
    today >= rangeStart && today <= rangeEnd
      ? (differenceInCalendarDays(today, rangeStart) / totalDays) * 100
      : null;
  const rows = items.map((r) => ({
    ...r,
    leftPct: (differenceInCalendarDays(r.start, rangeStart) / totalDays) * 100,
    widthPct: Math.max(((differenceInCalendarDays(r.end, r.start) + 1) / totalDays) * 100, 0.45),
  }));
  return { rows, rangeStart, rangeEnd, totalDays, todayLinePct, timelineWidthPx };
}

export function buildGanttLayout(
  tasks: Task[],
  sprints: Sprint[],
  projectNameById: Map<string, string>,
  projectFilter: "all" | string
): GanttLayoutModel {
  const sprintById = new Map(sprints.map((s) => [s.id, s]));
  const filtered =
    projectFilter === "all"
      ? tasks
      : tasks.filter((t) => t.project_id === projectFilter);

  const withRange = filtered.map((task) => {
    const { start, end } = computeTaskBarRange(task, sprintById);
    const sprint = task.sprint_id ? sprintById.get(task.sprint_id) ?? null : null;
    return {
      task,
      start,
      end,
      sprintName: sprint?.name ?? null,
      href: hrefForTask(task, sprintById),
      projectName: projectNameById.get(task.project_id) ?? task.project_id,
    };
  });

  const { rows, ...rest } = layoutBars(withRange);

  rows.sort((a, b) => {
    const p = a.projectName.localeCompare(b.projectName);
    if (p !== 0) return p;
    const d = a.start.getTime() - b.start.getTime();
    if (d !== 0) return d;
    return a.task.title.localeCompare(b.task.title);
  });

  return { rows, ...rest };
}
