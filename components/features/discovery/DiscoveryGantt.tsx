"use client";

import * as React from "react";
import { addBusinessDays, format, isValid, parseISO } from "date-fns";
import { Flag, Maximize2, ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PHASE_META } from "@/lib/discovery/constants";
import { formatHours } from "@/lib/discovery";
import { cn } from "@/lib/utils";
import type {
  DiscoveryProject,
  DiscoveryResult,
  PhaseId,
} from "@/types/discovery.types";

const LABEL_W = 132;
const ROW_H = 38;
const HEADER_H = 30;
const DEFAULT_PX = 16; // pixels per business day at 100% zoom
const MIN_PX = 5;
const MAX_PX = 48;
const PAD = 10;

function resolveStart(value: string): Date {
  if (value) {
    const parsed = parseISO(value);
    if (isValid(parsed)) return parsed;
  }
  return new Date();
}

export function DiscoveryGantt({
  result,
  project,
}: {
  result: DiscoveryResult;
  project: DiscoveryProject;
}) {
  const { timeline, estimate } = result;
  const start = resolveStart(project.project_start_date);
  const total = Math.max(timeline.totalBusinessDays, 1);

  const [selectedId, setSelectedId] = React.useState<PhaseId | null>(null);
  const toggle = (id: PhaseId) =>
    setSelectedId((prev) => (prev === id ? null : id));
  const selectedPhase = selectedId
    ? estimate.phases.find((p) => p.id === selectedId) ?? null
    : null;
  const selectedTimeline = selectedId
    ? timeline.phases.find((p) => p.id === selectedId) ?? null
    : null;

  // Zoom = pixels per business day. The chart lives in a horizontal scroller,
  // so zooming in widens it (scroll for detail); "Fit" sizes it to the viewport.
  const [pxPerDay, setPxPerDay] = React.useState(DEFAULT_PX);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const clampPx = (n: number) => Math.min(MAX_PX, Math.max(MIN_PX, n));
  const zoomIn = () => setPxPerDay((p) => clampPx(Math.round(p * 1.25)));
  const zoomOut = () => setPxPerDay((p) => clampPx(Math.round(p * 0.8)));
  const fit = () => {
    const w = scrollRef.current?.clientWidth ?? 0;
    if (w > LABEL_W + 24) setPxPerDay(clampPx(Math.floor((w - LABEL_W - 24) / total)));
  };

  const geom = React.useMemo(() => {
    const chartW = total * pxPerDay;
    const svgW = LABEL_W + chartW + 24;
    const svgH = HEADER_H + timeline.phases.length * ROW_H + PAD;
    const x = (offset: number) => LABEL_W + offset * pxPerDay;

    // Week ticks every 5 business days.
    const weeks: { x: number; label: string }[] = [];
    for (let w = 0; w * 5 <= total; w++) {
      weeks.push({ x: x(w * 5), label: `W${w + 1}` });
    }

    // Month dividers where the calendar month changes.
    const months: { x: number; label: string }[] = [];
    let prevKey = "";
    for (let o = 0; o <= total; o++) {
      const d = addBusinessDays(start, o);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (key !== prevKey) {
        months.push({ x: x(o), label: format(d, "MMM yyyy") });
        prevKey = key;
      }
    }

    const milestoneByPhase = new Map(
      timeline.milestones.map((m) => [m.phaseId, m]),
    );

    return { chartW, svgW, svgH, x, weeks, months, milestoneByPhase };
  }, [start, total, timeline, pxPerDay]);

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle>Project timeline</CardTitle>
              <CardDescription>
                {timeline.totalWeeks} weeks · {timeline.totalBusinessDays} business
                days · launches {timeline.launchDate}
              </CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Zoom out"
                title="Zoom out"
                onClick={zoomOut}
                disabled={pxPerDay <= MIN_PX}
              >
                <ZoomOut className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Zoom in"
                title="Zoom in"
                onClick={zoomIn}
                disabled={pxPerDay >= MAX_PX}
              >
                <ZoomIn className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Fit timeline to width"
                title="Fit to width"
                onClick={fit}
              >
                <Maximize2 className="size-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          <div ref={scrollRef} className="overflow-x-auto">
            <svg
              width={geom.svgW}
              height={geom.svgH}
              viewBox={`0 0 ${geom.svgW} ${geom.svgH}`}
              role="img"
              aria-label="Gantt chart of project phases"
              className="min-w-full"
            >
              {/* Month dividers */}
              {geom.months.map((m, i) => (
                <g key={`m-${i}`}>
                  <line
                    x1={m.x}
                    y1={HEADER_H - 8}
                    x2={m.x}
                    y2={geom.svgH - PAD}
                    className="text-border"
                    stroke="currentColor"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={m.x + 4}
                    y={12}
                    className="text-muted-foreground"
                    fill="currentColor"
                    fontSize={10}
                  >
                    {m.label}
                  </text>
                </g>
              ))}

              {/* Week ticks */}
              {geom.weeks.map((w, i) => (
                <text
                  key={`w-${i}`}
                  x={w.x}
                  y={26}
                  className="text-muted-foreground/70"
                  fill="currentColor"
                  fontSize={9}
                >
                  {w.label}
                </text>
              ))}

              {/* Rows */}
              {timeline.phases.map((phase, i) => {
                const meta = PHASE_META[phase.id];
                const rowY = HEADER_H + i * ROW_H;
                const barX = geom.x(phase.startOffset);
                const barW = Math.max(phase.durationDays * pxPerDay, 0);
                const barY = rowY + 7;
                const barH = ROW_H - 20;
                const milestone = geom.milestoneByPhase.get(phase.id);
                const mx = geom.x(phase.endOffset);
                const my = rowY + ROW_H / 2;

                return (
                  <g key={phase.id}>
                    {/* Alternating row background */}
                    <rect
                      x={0}
                      y={rowY}
                      width={geom.svgW}
                      height={ROW_H}
                      className={i % 2 === 1 ? "text-muted" : "text-transparent"}
                      fill="currentColor"
                      fillOpacity={i % 2 === 1 ? 0.25 : 0}
                    />
                    {selectedId === phase.id ? (
                      <rect
                        x={0}
                        y={rowY}
                        width={geom.svgW}
                        height={ROW_H}
                        className="fill-primary"
                        fillOpacity={0.1}
                      />
                    ) : null}
                    {/* Phase label */}
                    <text
                      x={8}
                      y={my + 3}
                      className="text-foreground"
                      fill="currentColor"
                      fontSize={11}
                    >
                      {phase.label.length > 20
                        ? `${phase.label.slice(0, 19)}…`
                        : phase.label}
                    </text>

                    {barW > 0 ? (
                      <>
                        <rect
                          x={barX}
                          y={barY}
                          width={barW}
                          height={barH}
                          rx={4}
                          fill={meta.hex}
                        />
                        {barW > 50 ? (
                          <text
                            x={barX + barW / 2}
                            y={barY + barH / 2 + 3}
                            textAnchor="middle"
                            fill="#fff"
                            fontSize={9}
                            fontWeight={600}
                          >
                            {phase.durationDays}d
                          </text>
                        ) : null}
                        {/* Date label beneath the bar */}
                        <text
                          x={barX}
                          y={barY + barH + 10}
                          fill={meta.hex}
                          fontSize={8}
                        >
                          {phase.startDate}
                        </text>
                      </>
                    ) : null}

                    {/* Milestone diamond at phase end */}
                    {milestone ? (
                      <g transform={`translate(${mx}, ${my}) rotate(45)`}>
                        <rect
                          x={-5}
                          y={-5}
                          width={10}
                          height={10}
                          fill={meta.hex}
                          stroke="#fff"
                          strokeWidth={1.5}
                        />
                      </g>
                    ) : null}

                    {/* Full-row click target (on top) — opens the phase details. */}
                    <rect
                      x={0}
                      y={rowY}
                      width={geom.svgW}
                      height={ROW_H}
                      role="button"
                      tabIndex={0}
                      aria-label={`${phase.label} — show tasks`}
                      className="cursor-pointer fill-transparent outline-none hover:fill-foreground/4"
                      onClick={() => toggle(phase.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggle(phase.id);
                        }
                      }}
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Phase detail — the tasks inside the clicked bar. */}
          {selectedPhase && selectedTimeline ? (
            <div className="mt-3 rounded-xl border border-border bg-muted/20 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: PHASE_META[selectedPhase.id].hex }}
                    aria-hidden
                  />
                  <h4 className="text-sm font-semibold">{selectedPhase.label}</h4>
                </div>
                <span className="tabular-nums text-xs text-muted-foreground">
                  {selectedTimeline.durationDays}d · {selectedTimeline.startDate} →{" "}
                  {selectedTimeline.endDate}
                </span>
              </div>
              {selectedPhase.tasks.length ? (
                <ul className="divide-y divide-border/60">
                  {selectedPhase.tasks.map((tk) => (
                    <li
                      key={tk.id}
                      className="flex items-center justify-between gap-3 py-1.5 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        {tk.name}
                        {tk.note ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            · {tk.note}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatHours(tk.mid)} h
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No task breakdown for this phase.
                </p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              Tip: click a phase to see the tasks inside it.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Milestone summary cards (also the mobile-friendly view) */}
      <div>
        <h3 className="mb-2 text-sm font-semibold">Milestones</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {timeline.milestones.map((m) => {
            const meta = PHASE_META[m.phaseId];
            return (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-3 py-2.5"
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg",
                    meta.soft,
                  )}
                >
                  <Flag className={cn("size-4", meta.text)} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.label}</p>
                  <p className="text-xs text-muted-foreground">{m.date}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
