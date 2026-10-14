"use client";

import * as React from "react";
import { format } from "date-fns";
import { Gauge } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";

import { AppHelp } from "@/components/common/app-help";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useTeamCalendar } from "@/hooks/useTeamCalendar";
import { burndown, projectVelocity, VELOCITY_WINDOW } from "@/lib/sprints/velocity";
import { tourAnchor } from "@/lib/tours/ids";
import { parseYmdLocal } from "@/lib/utils/availability-dates";
import { useSprintsStore } from "@/store/sprints-store";
import { useTasksDataStore } from "@/store/tasks-store";

// --chart-1 is the palette's lightest shade: "planned" is the backdrop and
// "finished" the figure that matters, so finished gets the strong one.
const velocityConfig = {
  committed: { label: "Planned", color: "var(--chart-1)" },
  completed: { label: "Finished in the sprint", color: "var(--chart-3)" },
} satisfies ChartConfig;

const burndownConfig = {
  ideal: { label: "Ideal", color: "var(--muted-foreground)" },
  remaining: { label: "Hours left", color: "var(--chart-3)" },
} satisfies ChartConfig;

const fmtDay = (ymd: string, pattern = "MMM d") => format(parseYmdLocal(ymd), pattern);
const short = (s: string) => (s.length > 14 ? `${s.slice(0, 13)}…` : s);

/**
 * Velocity, the forecast built on it, and the burndown of one sprint — all from
 * `lib/sprints/velocity.ts`, the same definition Reports uses. Estimated hours,
 * not story points: it is the unit this app already plans in.
 */
export function ProjectVelocitySection({ projectId }: { projectId: string }) {
  const sprints = useSprintsStore((s) => s.sprints);
  const tasks = useTasksDataStore((s) => s.tasks);
  const tasksLoaded = useTasksDataStore((s) => s.loaded);
  const cal = useTeamCalendar();

  // The clock, read once (Date.now() in render is impure; the React Compiler
  // rejects it). A page left open overnight is the only thing this misses.
  const [now] = React.useState(() => Date.now());

  const v = React.useMemo(
    () => projectVelocity(projectId, sprints, tasks, now, cal),
    [projectId, sprints, tasks, now, cal],
  );

  // Burndown: sprints that have started. Default to the one running today,
  // else the most recent to start.
  const started = React.useMemo(
    () => v.rows.filter((r) => r.sprint.start_date <= format(now, "yyyy-MM-dd")),
    [v.rows, now],
  );
  const running = started.find((r) => !r.ended) ?? started[started.length - 1];
  const [pick, setPick] = React.useState<string | null>(null);
  const chosen = started.find((r) => r.sprint.id === pick) ?? running ?? null;
  const points = React.useMemo(
    () => (chosen ? burndown(chosen.sprint, tasks, now) : []),
    [chosen, tasks, now],
  );

  const unestimated = v.basis.reduce((n, r) => n + r.unestimatedDone, 0);
  const bars = v.rows.map((r) => ({
    name: short(r.sprint.name),
    committed: r.committed,
    completed: r.completed,
  }));

  return (
    <Card {...tourAnchor("project.velocity")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="size-4 shrink-0 text-primary" aria-hidden />
          Velocity
        </CardTitle>
        <CardDescription>
          How much estimated work each sprint finished, and what that pace says
          about the rest.
        </CardDescription>
        <CardAction>
          <AppHelp section="project.velocity" />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {!tasksLoaded ? (
          <div className="grid gap-3 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-3 lg:grid-cols-3">
              <Stat
                label="Velocity"
                value={v.average != null ? `${v.average} h / sprint` : "—"}
                hint={
                  v.average == null
                    ? "Shows once a sprint has ended."
                    : `Average of the last ${v.basis.length} ended sprint${v.basis.length === 1 ? "" : "s"}${
                        v.basis.length < VELOCITY_WINDOW ? " — an early read" : ""
                      }.`
                }
              />
              <Stat
                label="Work left"
                value={`${v.remaining} h`}
                hint="Open tasks, backlog included."
              />
              <Stat
                label="Forecast"
                value={
                  v.forecast
                    ? `≈ ${v.forecast.sprints} more sprint${v.forecast.sprints === 1 ? "" : "s"}`
                    : v.remaining === 0
                      ? "Nothing left"
                      : "—"
                }
                hint={
                  v.forecast
                    ? `Finishing around ${fmtDay(v.forecast.finish, "MMM d, yyyy")} at this pace.`
                    : v.remaining === 0
                      ? "Every task is done."
                      : "Needs a velocity first."
                }
              />
            </div>

            {unestimated > 0 ? (
              <p className="text-xs text-muted-foreground">
                {`${unestimated} finished task${unestimated === 1 ? " has" : "s have"} no estimate, so ${
                  unestimated === 1 ? "it counts" : "they count"
                } as 0 h — velocity reads low until they get one.`}
              </p>
            ) : null}

            {bars.length ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Planned vs finished, per sprint</p>
                <ChartContainer config={velocityConfig} className="h-56 w-full">
                  <BarChart accessibilityLayer data={bars}>
                    <CartesianGrid vertical={false} />
                    {/* No interval={0}: on a phone seven names cannot fit, and
                        forcing them all drew them on top of each other. Recharts
                        skips the ones that would collide; the tooltip names
                        every bar. */}
                    <XAxis dataKey="name" tickLine={false} axisLine={false} minTickGap={8} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} unit="h" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="committed" fill="var(--color-committed)" radius={3} />
                    <Bar dataKey="completed" fill="var(--color-completed)" radius={3} />
                  </BarChart>
                </ChartContainer>
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Burndown</p>
                {started.length > 1 && chosen ? (
                  <Select value={chosen.sprint.id} onValueChange={setPick}>
                    <SelectTrigger className="h-8 w-full sm:w-56" aria-label="Sprint to show">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {started.map((r) => (
                        <SelectItem key={r.sprint.id} value={r.sprint.id}>
                          {r.sprint.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </div>
              {chosen && points.length ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    {`${chosen.sprint.name}: estimated hours not yet finished at the end of each working day, against a straight line to zero by ${fmtDay(chosen.sprint.end_date)}.`}
                  </p>
                  <ChartContainer config={burndownConfig} className="h-56 w-full">
                    <LineChart accessibilityLayer data={points.map((p) => ({ ...p, label: fmtDay(p.day) }))}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={16} fontSize={11} />
                      <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} unit="h" />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Line dataKey="ideal" stroke="var(--color-ideal)" strokeDasharray="4 4" dot={false} />
                      <Line dataKey="remaining" stroke="var(--color-remaining)" strokeWidth={2} dot={false} connectNulls={false} />
                    </LineChart>
                  </ChartContainer>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  The burndown appears once a sprint has started.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
