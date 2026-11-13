"use client";

import * as React from "react";
import Link from "next/link";
import { addDays, differenceInCalendarDays, format, isValid, parseISO } from "date-fns";
import { enUS } from "date-fns/locale";
import { CalendarRange, FolderKanban, Info } from "lucide-react";

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
import { isUsHoliday } from "@/lib/calendar/us-holidays";
import { buildGanttLayout, getGanttWeekTicks, layoutBars } from "@/lib/utils/gantt-layout";
import { cn } from "@/lib/utils";
import { useProjectsStore } from "@/store/projects-store";
import { useSprintsStore } from "@/store/sprints-store";
import { useTasksDataStore } from "@/store/tasks-store";
import type { TaskStatus } from "@/types/task.types";
import { tourAnchor } from "@/lib/tours/ids";
import { ListSkeleton } from "@/components/common/list-skeleton";
import { AppHelp } from "@/components/common/app-help";

const ROW_PX = 52;
const HEADER_ROW_PX = 44;

/** Narrower task column on phones so the timeline stays usable; wider at sm+ breakpoints. */
// The chart is the point, so the name pane stays lean until there's real width:
// on tablet (md) the content area is ~664px, where a 208px pane left too little
// room for the bars — hold at 176px until lg.
const TASK_PANE_CLASSES =
  "w-[41%] max-w-[11.25rem] min-w-[9rem] shrink-0 sm:min-w-0 sm:max-w-none sm:w-44 lg:w-56 xl:w-64";

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

/** One task of an estimate's people plan (`SchedulePreview`), drawn like a project task. */
export type PlannedGanttRow = {
  id: string;
  title: string;
  /** Phase label — the sprint it will land in. */
  phase: string;
  assignee: string | null;
  /** YYYY-MM-DD. */
  start: string;
  end: string;
  /** Estimated hours, and the risk-buffer hours planned on top of them. */
  hours: number;
  bufferHours: number;
  /** A phase with no tasks of its own (e.g. Launch & Handoff), drawn as one bar. */
  isPhase?: boolean;
  /**
   * A client checkpoint — sign-off, approval, acceptance testing. The client's
   * time, not the team's: no hours, no person. `blocks` = what waits for it.
   */
  client?: { detail: string; blocks: string | null };
  /** Delivery order of its phase (Discovery first, Launch last) — rows sort by it. */
  order?: number;
};

/** What a bar's hover card says: a heading, then label/value lines. */
type BarTip = { heading: string; lines: [label: string, value: string][] };

const DAY_FMT = "EEE, MMM d, yyyy";

/** Start, end and length lines shared by both chart modes. */
function dateLines(start: Date, end: Date): [string, string][] {
  // Working days: weekends and federal holidays (the ones not marked worked)
  // are skipped, as the planner skips them. A person's own leave is not known here.
  let work = 0;
  const span = differenceInCalendarDays(end, start) + 1;
  for (let i = 0; i < span && i < 400; i++) {
    const d = addDays(start, i);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6 && !isUsHoliday(format(d, "yyyy-MM-dd"))) work += 1;
  }
  return [
    ["Starts", formatEnUS(start, DAY_FMT)],
    ["Ends", formatEnUS(end, DAY_FMT)],
    ["Length", `${work} working ${work === 1 ? "day" : "days"}`],
  ];
}

/** Amber stripes: the risk buffer, distinct from every status colour. */
const BUFFER_BG =
  "bg-[repeating-linear-gradient(135deg,var(--color-amber-500)_0_4px,var(--color-amber-300)_4px_8px)]";
const PLANNED_BG = BAR_BG.todo;
/** Teal: the client's time (sign-off, approval, testing) — not the team's. */
const CLIENT_BG = "bg-teal-600/90 dark:bg-teal-500/85";

function formatEnUS(d: Date, pattern: string) {
  return isValid(d) ? format(d, pattern, { locale: enUS }) : "—";
}

export function GanttClient({
  lockedProjectId,
  plan,
}: {
  /** When set, the chart is locked to this project and the page header/filter is hidden (for embedding on a project page). */
  lockedProjectId?: string;
  /**
   * Draw an estimate's PLANNED tasks instead of a project's real ones (Estimator
   * → Review → Timeline). Same chart, so an estimate and the project it becomes
   * read alike; the risk buffer's share of each bar is striped amber.
   */
  plan?: PlannedGanttRow[];
} = {}) {
  const tasks = useTasksDataStore((s) => s.tasks);
  const sprints = useSprintsStore((s) => s.sprints);
  const projects = useProjectsStore((s) => s.projects);
  const tasksLoaded = useTasksDataStore((s) => s.loaded);
  const sprintsLoaded = useSprintsStore((s) => s.loaded);
  const thirdLoaded = useProjectsStore((s) => s.loaded);
  const dataLoaded = tasksLoaded && sprintsLoaded && thirdLoaded;

  const [projectId, setProjectId] = React.useState<ProjectFilter>(
    lockedProjectId ?? "all"
  );

  const projectNameMap = React.useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  );
  const scopeLabel =
    projectId === "all"
      ? "All projects"
      : projectNameMap.get(projectId) ?? "Project";

  const model = React.useMemo(() => {
    if (!plan) {
      const m = buildGanttLayout(tasks, sprints, projectNameMap, projectId);
      return {
        ...m,
        rows: m.rows.map((r) => ({
          key: r.task.id,
          title: r.task.title,
          subtitle: `${r.projectName}${r.sprintName ? ` · ${r.sprintName}` : " · Backlog"}`,
          badge: r.task.status.replace("_", " "),
          href: r.href as string | null,
          barClass: BAR_BG[r.task.status],
          faded: r.task.status === "done",
          bufferPct: 0,
          tip: {
            heading: r.task.title,
            lines: [
              ["Status", r.task.status.replace("_", " ")],
              ["Where", `${r.projectName}${r.sprintName ? ` · ${r.sprintName}` : " · Backlog"}`],
              ...dateLines(r.start, r.end),
            ],
          } as BarTip,
          hint: "Click to open the task",
          leftPct: r.leftPct,
          widthPct: r.widthPct,
        })),
      };
    }
    const m = layoutBars(
      plan
        .map((r) => ({ r, start: parseISO(r.start), end: parseISO(r.end) }))
        .sort(
          (a, b) =>
            (a.r.order ?? 0) - (b.r.order ?? 0) ||
            a.start.getTime() - b.start.getTime() ||
            a.r.title.localeCompare(b.r.title),
        ),
    );
    return {
      ...m,
      rows: m.rows.map(({ r, start, end, leftPct, widthPct }) => {
        const total = r.hours + r.bufferHours;
        return {
          key: r.id,
          title: r.title,
          // Dates beside the phase, so they can be read without hovering —
          // and on a phone, where there is no hover.
          subtitle: `${r.phase} · ${formatEnUS(start, "MMM d")} – ${formatEnUS(end, "MMM d")}`,
          badge: r.client ? "Client" : r.isPhase ? "Phase" : r.assignee ?? "Unassigned",
          href: null as string | null,
          barClass: r.client ? CLIENT_BG : PLANNED_BG,
          faded: !r.assignee && !r.isPhase && !r.client,
          bufferPct: total > 0 ? (r.bufferHours / total) * 100 : 0,
          tip: r.client
            ? ({
                heading: r.title,
                lines: [
                  ["Who", "The client"],
                  ["What", r.client.detail],
                  ["Holds up", r.client.blocks ?? "Nothing"],
                  ["Sprint", r.phase],
                  ...dateLines(start, end),
                ],
              } as BarTip)
            : {
            heading: r.title,
            lines: [
              ["Who", r.isPhase ? "The team (no tasks of its own)" : r.assignee ?? "Unassigned — pick someone manually"],
              [r.isPhase ? "Phase" : "Sprint", r.isPhase ? r.title : r.phase],
              ...dateLines(start, end),
              ...(r.isPhase
                ? []
                : ([
                    [
                      "Hours",
                      r.bufferHours
                        ? `${r.hours} h + ${r.bufferHours} h risk buffer = ${Math.round((r.hours + r.bufferHours) * 10) / 10} h`
                        : `${r.hours} h`,
                    ],
                  ] as [string, string][])),
            ],
          } as BarTip,
          hint: null as string | null,
          leftPct,
          widthPct,
        };
      }),
    };
  }, [plan, tasks, sprints, projectNameMap, projectId]);

  const { rows, rangeStart, rangeEnd, firstDay, lastDay, totalDays, todayLinePct, timelineWidthPx } =
    model;
  const hasBuffer = rows.some((r) => r.bufferPct > 0);

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
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-col gap-6">
        {!lockedProjectId && !plan && (
        <WorkspacePageHeader
          eyebrow="Planning"
          help={<AppHelp section="page.gantt" />}
          title="Timeline"
          // Deliberately short. The bar rules used to be spelled out here AND in
          // the "How to read this" tooltip below; on a 375px screen that
          // duplicate cost 114px and pushed the chart itself under the tab bar.
          description="When each task is scheduled. Click a bar to open it on its board."
          actions={
            <div
              className="flex w-full flex-col gap-1.5 sm:w-64"
              {...tourAnchor("gantt.project-picker")}
            >
              <span className="text-xs font-medium text-muted-foreground">
                View a project&apos;s timeline
              </span>
              <Select
                value={projectId}
                onValueChange={(v) => setProjectId(v as ProjectFilter)}
              >
                <SelectTrigger className="w-full gap-2 border-border/60 bg-background/80">
                  <FolderKanban
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
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
              <span className="text-[0.7rem] text-muted-foreground">
                Pick a project to see only its schedule.
              </span>
            </div>
          }
        />
        )}

        <Card
          className="rounded-2xl border-border/60 bg-card/80 shadow-sm backdrop-blur-sm dark:bg-card/70"
          {...(lockedProjectId || plan ? {} : tourAnchor("gantt.chart"))}
        >
          <CardHeader className="space-y-3 border-b border-border/50 pb-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
                  <CalendarRange
                    className="size-4 shrink-0 text-primary"
                    aria-hidden
                  />
                  {plan ? "Planned schedule" : "Schedule overview"}
                </CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-xs font-medium text-foreground/90">
                    {/* What the work spans — never the padded drawing range,
                        which read as a schedule 10 days longer than the plan. */}
                    {firstDay && lastDay ? (
                      <>
                        {formatEnUS(firstDay, "MMM d, yyyy")}
                        <span className="text-muted-foreground">→</span>
                        {formatEnUS(lastDay, "MMM d, yyyy")}
                      </>
                    ) : (
                      "No dates yet"
                    )}
                  </span>
                  <span className="text-xs">
                    <span className="font-medium text-foreground/90">
                      {plan ? "Who does what, and when" : scopeLabel}
                    </span>
                    {` · ${rows.length} ${rows.length === 1 ? (plan ? "row" : "task") : plan ? "rows" : "tasks"} · Weeks start Sunday`}
                  </span>
                </CardDescription>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    {...tourAnchor("gantt.how-to-read")}
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
                  {plan ? (
                    <div className="flex w-full flex-col gap-2 opacity-95">
                      <p className="w-full text-pretty">
                        Each task runs from the day its person starts it to the day
                        they finish, from the plan picked on the Adjust tab.
                      </p>
                      <p className="w-full text-pretty">
                        <span className="font-semibold opacity-100">Teal:</span>{" "}
                        the client&apos;s turn: sign-offs, approvals and testing.
                        The work after each one waits for it, sprint reviews
                        included.
                      </p>
                      <p className="w-full text-pretty">
                        <span className="font-semibold opacity-100">Amber stripes:</span>{" "}
                        the risk buffer, extra hours planned onto Development
                        tasks, so their bars end later.
                      </p>
                    </div>
                  ) : (
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
                  )}
                </TooltipContent>
              </Tooltip>
            </div>
            <div
              className="flex flex-wrap gap-x-1.5 gap-y-2 border-t border-border/40 pt-3 md:gap-2"
              role="list"
              aria-label={plan ? "Bar colors" : "Task status colors"}
              {...tourAnchor("gantt.legend")}
            >
              {(plan
                ? [
                    { key: "planned", label: "Planned work", cls: PLANNED_BG },
                    { key: "unassigned", label: "Unassigned", cls: `${PLANNED_BG} opacity-45` },
                    ...(rows.some((r) => r.barClass === CLIENT_BG)
                      ? [{ key: "client", label: "Client checkpoint", cls: CLIENT_BG }]
                      : []),
                    ...(hasBuffer ? [{ key: "buffer", label: "Risk buffer", cls: BUFFER_BG }] : []),
                  ]
                : STATUS_LEGEND.map(({ status, label }) => ({ key: status, label, cls: BAR_BG[status] }))
              ).map(({ key, label, cls }) => (
                <span
                  key={key}
                  role="listitem"
                  className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/30 px-1.5 py-0.5 text-[0.62rem] text-muted-foreground sm:gap-1.5 sm:px-2 sm:text-[0.7rem]"
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/10",
                      cls
                    )}
                    aria-hidden
                  />
                  {label}
                </span>
              ))}
            </div>
          </CardHeader>

          <CardContent className="px-0 pb-0 pt-0">
            {!plan && !dataLoaded ? (
              <ListSkeleton rows={6} className="p-4" />
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
                <CalendarRange className="size-10 text-muted-foreground/50" />
                <p className="text-sm font-medium text-foreground">
                  No tasks in this view
                </p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  {plan
                    ? "Add line items to see who would do them, and when."
                    : "Try another project above, or add tasks in a sprint or backlog — they will show up here automatically."}
                </p>
              </div>
            ) : (
              <div className={cn("relative flex max-h-[min(72vh,840px)] flex-col overflow-hidden bg-linear-to-b from-background/40 to-muted/15 dark:from-background/20 dark:to-muted/10")}>
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
                          key={r.key}
                          className="box-border flex gap-1.5 border-b border-border/35 px-2 sm:gap-2 sm:px-3"
                          style={{ height: ROW_PX }}
                        >
                          <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center py-0.5">
                            <p
                              className="line-clamp-2 text-[0.6875rem] font-medium leading-tight text-foreground sm:text-xs sm:leading-snug lg:line-clamp-none lg:truncate"
                              title={r.title}
                            >
                              {r.title}
                            </p>
                            <p className="line-clamp-1 text-[0.6rem] leading-tight text-muted-foreground sm:text-[0.65rem] lg:truncate">
                              {r.subtitle}
                            </p>
                          </div>
                          <Badge
                            variant="secondary"
                            title={r.badge}
                            className={cn(
                              "self-center shrink-0 border border-border/50 px-1 py-0 text-[0.55rem] font-normal sm:px-1.5 sm:text-[0.65rem]",
                              !plan && "capitalize",
                              "max-[480px]:max-w-19 max-[480px]:truncate",
                              r.faded && "opacity-80"
                            )}
                          >
                            {r.badge}
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
                            const barCls = cn(
                              "group/bar absolute top-1/2 z-1 flex h-6 max-w-full min-w-[8px] -translate-y-1/2 items-center justify-start overflow-hidden rounded-md px-1.5 shadow-sm ring-1 ring-black/10 transition-[opacity,box-shadow] hover:z-2 hover:opacity-100 hover:ring-primary/30 dark:ring-white/10",
                              r.barClass,
                              r.faded && (plan ? "opacity-45" : "opacity-75")
                            );
                            const style = { left: `${r.leftPct}%`, width: `${r.widthPct}%` };
                            const inner = (
                              <>
                                {r.bufferPct > 0 ? (
                                  <span
                                    className={cn("pointer-events-none absolute inset-y-0 right-0", BUFFER_BG)}
                                    style={{ width: `${r.bufferPct}%` }}
                                    data-testid="gantt-buffer"
                                    aria-hidden
                                  />
                                ) : null}
                                {showLabel ? (
                                  <span className="relative min-w-0 truncate text-[0.65rem] font-medium leading-none text-white drop-shadow-sm dark:text-white">
                                    {r.title}
                                  </span>
                                ) : null}
                              </>
                            );
                            return (
                              <div
                                key={r.key}
                                className="absolute left-0 right-0 box-border border-b border-border/30 px-1.5"
                                style={{ top: i * ROW_PX, height: ROW_PX }}
                              >
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    {r.href ? (
                                      <Link
                                        href={r.href}
                                        className={barCls}
                                        style={style}
                                        aria-label={`${r.tip.heading}: ${r.tip.lines.map(([k, v]) => `${k} ${v}`).join(", ")}`}
                                      >
                                        {inner}
                                      </Link>
                                    ) : (
                                      <div
                                        className={barCls}
                                        style={style}
                                        tabIndex={0}
                                        aria-label={`${r.tip.heading}: ${r.tip.lines.map(([k, v]) => `${k} ${v}`).join(", ")}`}
                                      >
                                        {inner}
                                      </div>
                                    )}
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="top"
                                    sideOffset={6}
                                    className="max-w-xs flex-col items-start gap-1.5 px-3 py-2.5 text-left text-xs leading-snug shadow-md **:text-background"
                                    data-testid="gantt-bar-tip"
                                  >
                                    <p className="w-full font-semibold">{r.tip.heading}</p>
                                    <dl className="grid w-full grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                                      {r.tip.lines.map(([k, v]) => (
                                        <React.Fragment key={k}>
                                          <dt className="opacity-70">{k}</dt>
                                          <dd>{v}</dd>
                                        </React.Fragment>
                                      ))}
                                    </dl>
                                    {r.hint ? <p className="w-full opacity-70">{r.hint}</p> : null}
                                  </TooltipContent>
                                </Tooltip>
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
              {/* No mobile variant: the same advice already sits directly above
                  the chart, where it is read before you try to scroll. */}
            </CardFooter>
          ) : null}
        </Card>
      </div>
    </TooltipProvider>
  );
}
