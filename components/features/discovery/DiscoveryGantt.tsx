"use client";

import * as React from "react";
import { addBusinessDays, format, isValid, parseISO } from "date-fns";
import { Flag } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PHASE_META } from "@/lib/discovery/constants";
import { cn } from "@/lib/utils";
import type { DiscoveryProject, DiscoveryResult } from "@/types/discovery.types";

const LABEL_W = 132;
const ROW_H = 38;
const HEADER_H = 30;
const PX_PER_DAY = 16;
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
  const { timeline } = result;
  const start = resolveStart(project.project_start_date);
  const total = Math.max(timeline.totalBusinessDays, 1);

  const geom = React.useMemo(() => {
    const chartW = total * PX_PER_DAY;
    const svgW = LABEL_W + chartW + 24;
    const svgH = HEADER_H + timeline.phases.length * ROW_H + PAD;
    const x = (offset: number) => LABEL_W + offset * PX_PER_DAY;

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
  }, [start, total, timeline]);

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Project timeline</CardTitle>
          <CardDescription>
            {timeline.totalWeeks} weeks · {timeline.totalBusinessDays} business
            days · launches {timeline.launchDate}
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="overflow-x-auto">
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
                const barW = Math.max(phase.durationDays * PX_PER_DAY, 0);
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
                  </g>
                );
              })}
            </svg>
          </div>
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
