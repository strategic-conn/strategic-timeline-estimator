"use client";

import * as React from "react";

import { TASK_STATUS_DOT } from "@/lib/constants/task-status";
import { cn } from "@/lib/utils";
import type { StatusSlice } from "@/lib/workload/assigned-work";
import { TASK_STATUSES } from "@/types/task.types";

const LABEL = new Map(TASK_STATUSES.map((s) => [s.value, s.label]));

/**
 * How loaded someone is, and what the load is made of.
 *
 * A single-colour bar could only say "full". Full of work nobody has started,
 * full of work in flight, and full of work that is **blocked** are three
 * different problems with three different answers, and a manager looking at
 * 328% needs to know which one they have.
 *
 * Shared by the "Mine" and "Team" views. They have drifted apart twice before
 * (see `assigned-work.ts`), so the bar is one component rather than two.
 */
export function WorkloadBar({
  slices,
  totalHours,
  /** 0–100, already capped by `utilization`. */
  barPct,
  over,
  className,
}: {
  slices: StatusSlice[];
  totalHours: number;
  barPct: number;
  over?: boolean;
  className?: string;
}) {
  const hasSlices = slices.length > 0 && totalHours > 0;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div
        className={cn(
          "h-2 w-full overflow-hidden rounded-full bg-muted",
          // Over capacity still reads at a glance, without stealing the segment
          // colours to say it — the ring is about the LIMIT, the fill is about
          // the work.
          over && "ring-1 ring-amber-500/70",
        )}
        role="img"
        aria-label={
          hasSlices
            ? `${totalHours} hours: ${slices
                .map((s) => `${s.hours}h ${LABEL.get(s.status) ?? s.status}`)
                .join(", ")}`
            : "No open work"
        }
      >
        {hasSlices ? (
          <div className="flex h-full" style={{ width: `${barPct}%` }}>
            {slices.map((s) => (
              <div
                key={s.status}
                className={cn("h-full", TASK_STATUS_DOT[s.status])}
                // Percent of the FILL, not of the track: the fill is already
                // scaled to `barPct`, so the segments divide what is drawn.
                style={{ width: `${(s.hours / totalHours) * 100}%` }}
                title={`${LABEL.get(s.status) ?? s.status}: ${s.hours}h across ${s.count} task${s.count === 1 ? "" : "s"}`}
              />
            ))}
          </div>
        ) : null}
      </div>

      {hasSlices ? (
        // Wraps rather than scrolling — four statuses at 375px need two lines.
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.65rem] text-muted-foreground">
          {slices.map((s) => (
            <li key={s.status} className="flex items-center gap-1">
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  TASK_STATUS_DOT[s.status],
                )}
                aria-hidden
              />
              <span>{LABEL.get(s.status) ?? s.status}</span>
              <span className="tabular-nums">{s.hours}h</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
