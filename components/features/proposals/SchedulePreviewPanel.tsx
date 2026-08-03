"use client";

import { CalendarRange, TriangleAlert, UserCheck, UserX } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SchedulePreview } from "@/store/proposal-estimator-store";

function fmt(d: string | null | undefined): string {
  if (!d) return "—";
  const parsed = new Date(`${d}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? d
    : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Read-only render of what "Start project" / "Sync schedule" will create —
 * shown BEFORE anything is written, so the plan can be approved rather than
 * corrected afterwards. Purely presentational; the caller owns the confirm.
 */
export function SchedulePreviewPanel({ preview }: { preview: SchedulePreview }) {
  const { sprints, tasks, assignedCount, unassignedCount, finishDate } = preview;

  // Group tasks under their phase/sprint so the shape matches what gets created.
  const byPhase = React.useMemo(() => {
    const map = new Map<string, typeof tasks>();
    for (const t of tasks) {
      const list = map.get(t.phase) ?? [];
      list.push(t);
      map.set(t.phase, list);
    }
    return map;
  }, [tasks]);

  if (!tasks.length && !sprints.length) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        Nothing new to schedule — this project already matches the estimate.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Headline numbers */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
        <span className="flex items-center gap-1.5">
          <CalendarRange className="size-3.5 shrink-0 text-primary" aria-hidden />
          <span className="font-medium">
            {sprints.length} sprint{sprints.length === 1 ? "" : "s"}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <UserCheck
            className="size-3.5 shrink-0 text-green-600 dark:text-green-400"
            aria-hidden
          />
          <span className="font-medium">{assignedCount}</span> assigned
        </span>
        {unassignedCount > 0 ? (
          <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
            <UserX className="size-3.5 shrink-0" aria-hidden />
            <span className="font-medium">{unassignedCount}</span> unassigned
          </span>
        ) : null}
        {finishDate ? (
          <span className="text-muted-foreground">
            Finishes <span className="font-medium text-foreground">{fmt(finishDate)}</span>
          </span>
        ) : null}
      </div>

      {unassignedCount > 0 ? (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {unassignedCount} task{unassignedCount === 1 ? "" : "s"} couldn&apos;t
            be matched to anyone (usually design/planning work, or no one has the
            skill). They&apos;ll be created unassigned for you to staff.
          </span>
        </p>
      ) : null}

      {/* Sprint + task breakdown */}
      <ul className="space-y-2">
        {sprints.map((s) => {
          const phaseTasks = byPhase.get(s.label) ?? [];
          return (
            <li
              key={s.label}
              className="overflow-hidden rounded-lg border border-border/60"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-border/50 bg-muted/30 px-3 py-2">
                <span className="text-sm font-medium">{s.label}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {fmt(s.start)} – {fmt(s.end)}
                </span>
              </div>
              {phaseTasks.length ? (
                <ul className="divide-y divide-border/40">
                  {phaseTasks.map((t) => (
                    <li
                      key={t.lineId}
                      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2 text-xs"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {t.title}
                        <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">
                          {t.hours}h
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {t.startDate ? (
                          <span className="tabular-nums text-muted-foreground">
                            {fmt(t.startDate)}–{fmt(t.endDate)}
                          </span>
                        ) : null}
                        <Badge
                          variant={t.assigneeName ? "secondary" : "outline"}
                          className={cn(
                            "text-[0.65rem] font-normal",
                            !t.assigneeName &&
                              "border-amber-500/40 text-amber-700 dark:text-amber-400",
                          )}
                          title={t.reason || undefined}
                        >
                          {t.assigneeName ?? "unassigned"}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  No itemised tasks — time is reserved for this phase.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
