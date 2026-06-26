"use client";

import * as React from "react";
import Link from "next/link";
import { format, isValid } from "date-fns";
import { enUS } from "date-fns/locale";
import { CalendarRange, Info } from "lucide-react";

import { WorkspacePageHeader } from "@/components/layouts/workspace-page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { buildGanttLayout, getGanttWeekTicks } from "@/lib/utils/gantt-layout";
import { cn } from "@/lib/utils";
import { useProjectsStore } from "@/store/projects-store";
import { useSprintsStore } from "@/store/sprints-store";
import { useTasksDataStore } from "@/store/tasks-store";
import type { TaskStatus } from "@/types/task.types";

const ROW_PX = 52;
const HEADER_ROW_PX = 44;

/** Narrower task column on phones so the timeline stays usable; wider at sm+ breakpoints. */
const TASK_PANE_CLASSES =
  "w-[41%] max-w-[11.25rem] min-w-[9rem] shrink-0 sm:min-w-0 sm:max-w-none sm:w-44 md:w-52 lg:w-56 xl:w-64";

const BAR_BG: Record<TaskStatus, string> = {
  todo: "bg-slate-500/90 dark:bg-slate-400/85",
  in_progress: "bg-blue-600/92 dark:bg-blue-500/88",
  in_review: "bg-purple-600/92 dark:bg-purple-500/88",
  done: "bg-emerald-600/82 dark:bg-emerald-500/75",
  blocked: "bg-red-600/92 dark:bg-red-500/88",
};

const STATUS_LEGEND: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "To do" },
  { status: "in_progress", label: "In progress" },
  { status: "in_review", label: "In review" },
  { status: "done", label: "Done" },
  { status: "blocked", label: "Blocked" },
];

type ProjectFilter = "all" | string;

function formatEnUS(d: Date, pattern: string) {
  return isValid(d) ? format(d, pattern, { locale: enUS }) : "—";
}

export function GanttClient() {
  const tasks = useTasksDataStore((s) => s.tasks);
  const sprints = useSprintsStore((s) => s.sprints);
  const projects = useProjectsStore((s) => s.projects);

  const [projectId, setProjectId] = React.useState<ProjectFilter>("all");

  const projectNameMap = React.useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  );

  const model = React.useMemo(
    () => buildGanttLayout(tasks, sprints, projectNameMap, projectId),
    [tasks, sprints, projectNameMap, projectId]
  );

  const { rows, rangeStart, rangeEnd, totalDays, todayLinePct, timelineWidthPx } =
    model;

  const weekTicks = React.useMemo(
    () => getGanttWeekTicks(rangeStart, rangeEnd, totalDays),
    [rangeStart, rangeEnd, totalDays]
  );

  /** Top date strip and chart share the same pixel width; scrollLeft must stay in sync. */
  const headerHScrollRef = React.useRef<HTMLDivElement>(null);
  const bodyHScrollRef = React.useRef<HTMLDivElement>(null);
  const hScrollSkip = React.useRef(false);

  const syncHeaderHFromBodyH = React.useCallback(() => {
    if (hScrollSkip.current) return;
    const header = headerHScrollRef.current;
    const body = bodyHScrollRef.current;
    if (!header || !body) return;
    hScrollSkip.current = true;
    header.scrollLeft = body.scrollLeft;
    requestAnimationFrame(() => {
      hScrollSkip.current = false;
    });
  }, []);

  const syncBodyHFromHeaderH = React.useCallback(() => {
    if (hScrollSkip.current) return;
    const header = headerHScrollRef.current;
    const body = bodyHScrollRef.current;
    if (!header || !body) return;
    hScrollSkip.current = true;
    body.scrollLeft = header.scrollLeft;
    requestAnimationFrame(() => {
      hScrollSkip.current = false;
    });
  }, []);

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex flex-col gap-6">
        <WorkspacePageHeader
          eyebrow="Planning"
          title="Timeline"
          description="See when work is scheduled: each bar is the sprint dates for that task (capped by due date), or created→due for backlog items. Bars use status colors. Click a bar to jump to the board with that task focused."
          actions={
            <div className="flex w-full flex-col gap-1.5 sm:w-56">
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
          }
        />

        <Card className="rounded-2xl border-border/60 bg-card/80 shadow-sm backdrop-blur-sm dark:bg-card/70">
          <CardHeader className="space-y-3 border-b border-border/50 pb-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
                  <CalendarRange
                    className="size-4 shrink-0 text-primary"
                    aria-hidden
                  />
                  Schedule overview
                </CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-xs font-medium text-foreground/90">
                    {formatEnUS(rangeStart, "MMM d, yyyy")}
                    <span className="text-muted-foreground">→</span>
                    {formatEnUS(rangeEnd, "MMM d, yyyy")}
                  </span>
                  <span className="text-xs">
                    {rows.length} {rows.length === 1 ? "task" : "tasks"} · Weeks
                    start Sunday
                  </span>
                </CardDescription>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex max-w-fit shrink-0 items-center gap-1 self-start rounded-md border border-border/60 bg-background/60 px-2 py-1 text-[0.7rem] leading-tight font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground lg:gap-1.5 lg:rounded-lg lg:px-2.5 lg:py-1.5 lg:text-xs lg:leading-normal"
                  >
                    <Info className="size-3 shrink-0 lg:size-3.5" aria-hidden />
                    How to read this
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  align="center"
                  sideOffset={6}
                  className="max-w-xs flex-col items-start gap-2 px-3 py-2.5 text-left text-xs leading-snug shadow-md **:text-background"
                >
                  <p className="w-full font-semibold">What the bars mean</p>
                  <div className="flex w-full flex-col gap-2 opacity-95">
                    <p className="w-full text-pretty">
                      <span className="font-semibold opacity-100">In a sprint:</span>{" "}
                      The bar runs from sprint start to sprint end (or your due date
                      if sooner).
                    </p>
                    <p className="w-full text-pretty">
                      <span className="font-semibold opacity-100">Backlog:</span>{" "}
                      From created date to due date (or a short default if there is
                      no due date).
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
            <div
              className="flex flex-wrap gap-x-1.5 gap-y-2 border-t border-border/40 pt-3 md:gap-2"
              role="list"
              aria-label="Task status colors"
            >
              {STATUS_LEGEND.map(({ status, label }) => (
                <span
                  key={status}
                  role="listitem"
                  className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/30 px-1.5 py-0.5 text-[0.62rem] text-muted-foreground sm:gap-1.5 sm:px-2 sm:text-[0.7rem]"
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/10",
                      BAR_BG[status]
                    )}
                    aria-hidden
                  />
                  {label}
                </span>
              ))}
            </div>
          </CardHeader>

          <CardContent className="px-0 pb-0 pt-0">
            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
                <CalendarRange className="size-10 text-muted-foreground/50" />
                <p className="text-sm font-medium text-foreground">
                  No tasks in this view
                </p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Try another project above, or add tasks in a sprint or backlog —
                  they will show up here automatically.
                </p>
              </div>
            ) : (
              <div className="relative flex h-[min(72vh,840px)] min-h-[300px] flex-col overflow-hidden bg-linear-to-b from-background/40 to-muted/15 dark:from-background/20 dark:to-muted/10">
                <p className="border-b border-border/50 bg-muted/20 px-3 py-2 text-[0.7rem] leading-snug text-muted-foreground md:hidden">
                  <span className="font-medium text-foreground/85">Swipe</span> the
                  timeline right for dates · scroll tasks up and down · headers stay in
                  sync.
                </p>
                {/* Row 1: corner + date header (horizontal scroll only) */}
                <div className="flex shrink-0 border-b border-border/60">
                  <div
                    className={cn(
                      "flex items-end border-r border-border/60 bg-muted/25 px-2 pb-2 pt-2 sm:px-3",
                      TASK_PANE_CLASSES
                    )}
                    style={{ height: HEADER_ROW_PX }}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Tasks
                      </p>
                      <p className="hidden text-[0.62rem] leading-tight text-muted-foreground/90 sm:block lg:text-[0.65rem]">
                        One vertical scroll · pan dates below
                      </p>
                      <p className="text-[0.6rem] leading-tight text-muted-foreground/90 sm:hidden">
                        Scroll tasks · swipe dates
                      </p>
                    </div>
                  </div>
                  <div
                    ref={headerHScrollRef}
                    onScroll={syncBodyHFromHeaderH}
                    className="min-w-0 flex-1 touch-pan-x overflow-x-auto overflow-y-hidden overscroll-x-contain bg-muted/20 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]"
                  >
                    <div
                      className="relative"
                      style={{
                        width: timelineWidthPx,
                        height: HEADER_ROW_PX,
                      }}
                    >
                      {weekTicks.map(({ weekStart, leftPct }) =>
                        leftPct >= -1 && leftPct <= 101 ? (
                          <div
                            key={weekStart.getTime()}
                            className="pointer-events-none absolute top-0 bottom-0 border-l border-border/45"
                            style={{ left: `${leftPct}%` }}
                            aria-hidden
                          />
                        ) : null
                      )}
                      {weekTicks.map(({ weekStart, leftPct }) =>
                        leftPct >= 0 && leftPct <= 100 ? (
                          <span
                            key={`lbl-${weekStart.getTime()}`}
                            className="absolute top-1/2 max-w-18 -translate-y-1/2 truncate pl-1 text-[0.65rem] font-medium tabular-nums text-muted-foreground"
                            style={{ left: `${leftPct}%` }}
                          >
                            {formatEnUS(weekStart, "MMM d")}
                          </span>
                        ) : null
                      )}
                      {todayLinePct != null ? (
                        <div
                          className="pointer-events-none absolute inset-y-0 z-10 flex w-0 justify-center"
                          style={{
                            left: `${todayLinePct}%`,
                            transform: "translateX(-50%)",
                          }}
                          aria-hidden
                        >
                          <span className="absolute top-1.5 rounded bg-primary px-1 py-px text-[0.55rem] font-semibold uppercase tracking-wide text-primary-foreground shadow-sm">
                            Today
                          </span>
                          <div className="absolute bottom-0 top-7 w-px bg-primary shadow-[0_0_0_1px_rgba(0,0,0,0.06)]" />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Row 2: task names + chart — single vertical scroll, chart scrolls horizontally */}
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
                  <div className="flex items-stretch">
                    <div
                      className={cn(
                        "flex flex-col border-r border-border/60 bg-muted/25",
                        TASK_PANE_CLASSES
                      )}
                    >
                      {rows.map((r) => (
                        <div
                          key={r.task.id}
                          className="box-border flex gap-1.5 border-b border-border/35 px-2 sm:gap-2 sm:px-3"
                          style={{ height: ROW_PX }}
                        >
                          <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center py-0.5">
                            <p
                              className="line-clamp-2 text-[0.6875rem] font-medium leading-tight text-foreground sm:text-xs sm:leading-snug lg:line-clamp-none lg:truncate"
                              title={r.task.title}
                            >
                              {r.task.title}
                            </p>
                            <p className="line-clamp-1 text-[0.6rem] leading-tight text-muted-foreground sm:text-[0.65rem] lg:truncate">
                              {r.projectName}
                              {r.sprintName ? ` · ${r.sprintName}` : " · Backlog"}
                            </p>
                          </div>
                          <Badge
                            variant="secondary"
                            title={r.task.status.replace("_", " ")}
                            className={cn(
                              "self-center shrink-0 border border-border/50 px-1 py-0 text-[0.55rem] font-normal capitalize sm:px-1.5 sm:text-[0.65rem]",
                              "max-[480px]:max-w-19 max-[480px]:truncate",
                              r.task.status === "done" && "opacity-80"
                            )}
                          >
                            {r.task.status.replace("_", " ")}
                          </Badge>
                        </div>
                      ))}
                    </div>

                    <div className="min-h-0 min-w-0 flex-1 self-stretch">
                      <div
                        ref={bodyHScrollRef}
                        onScroll={syncHeaderHFromBodyH}
                        className="h-full touch-pan-x overflow-x-auto overflow-y-hidden overscroll-x-contain [-webkit-overflow-scrolling:touch]"
                      >
                        <div
                          className="relative"
                          style={{
                            width: timelineWidthPx,
                            height: rows.length * ROW_PX,
                          }}
                        >
                          <div
                            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,transparent_0%,hsl(var(--muted)/0.12)_100%)] dark:bg-[linear-gradient(to_right,transparent_0%,hsl(var(--muted)/0.08)_100%)]"
                            aria-hidden
                          />
                          {weekTicks.map(({ weekStart, leftPct }) =>
                            leftPct >= -1 && leftPct <= 101 ? (
                              <div
                                key={`grid-${weekStart.getTime()}`}
                                className="pointer-events-none absolute top-0 bottom-0 border-l border-border/35"
                                style={{ left: `${leftPct}%` }}
                                aria-hidden
                              />
                            ) : null
                          )}

                          {todayLinePct != null ? (
                            <div
                              className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-primary/90 shadow-[0_0_0_1px_rgba(0,0,0,0.05)]"
                              style={{
                                left: `${todayLinePct}%`,
                                transform: "translateX(-50%)",
                              }}
                              title="Today"
                              aria-hidden
                            />
                          ) : null}

                          {rows.map((r, i) => {
                            const showLabel = r.widthPct >= 7;
                            return (
                              <div
                                key={r.task.id}
                                className="absolute left-0 right-0 box-border border-b border-border/30 px-1.5"
                                style={{ top: i * ROW_PX, height: ROW_PX }}
                              >
                                <Link
                                  href={r.href}
                                  className={cn(
                                    "group/bar absolute top-1/2 z-1 flex h-6 max-w-full min-w-[8px] -translate-y-1/2 items-center justify-start overflow-hidden rounded-md px-1.5 shadow-sm ring-1 ring-black/10 transition-[opacity,box-shadow] hover:z-2 hover:opacity-100 hover:ring-primary/30 dark:ring-white/10",
                                    BAR_BG[r.task.status],
                                    r.task.status === "done" && "opacity-75"
                                  )}
                                  style={{
                                    left: `${r.leftPct}%`,
                                    width: `${r.widthPct}%`,
                                  }}
                                  title={`${r.task.title} — ${formatEnUS(r.start, "MMM d")}–${formatEnUS(r.end, "MMM d")} · Click to open`}
                                >
                                  {showLabel ? (
                                    <span className="min-w-0 truncate text-[0.65rem] font-medium leading-none text-white drop-shadow-sm dark:text-white">
                                      {r.task.title}
                                    </span>
                                  ) : null}
                                </Link>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>

          {rows.length > 0 ? (
            <CardFooter className="border-t border-border/50 bg-muted/25 px-4 py-2.5 text-[0.72rem] text-muted-foreground sm:py-3 sm:text-xs">
              <p className="hidden md:block">
                <span className="font-medium text-foreground/80">Tip:</span> Use
                one scrollbar on the right to move down the list; scroll the chart
                (or the date row) horizontally — they stay in sync. The vertical
                line marks today when it is in range.
              </p>
              <p className="md:hidden">
                <span className="font-medium text-foreground/80">Tip:</span> Vertical
                scroll for tasks; horizontal swipe for timeline (date row tracks with
                it).
              </p>
            </CardFooter>
          ) : null}
        </Card>
      </div>
    </TooltipProvider>
  );
}
