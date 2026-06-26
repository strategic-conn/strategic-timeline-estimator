"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";

import { DiscoveryRiskBadge } from "@/components/features/discovery/DiscoveryRiskBadge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PHASE_META, RISK_LEVEL_META } from "@/lib/discovery/constants";
import { formatHours } from "@/lib/discovery";
import { cn } from "@/lib/utils";
import type { DiscoveryResult } from "@/types/discovery.types";

export function DiscoveryHoursBreakdown({
  result,
}: {
  result: DiscoveryResult;
}) {
  const { estimate, risk } = result;
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const totalMid = estimate.total.mid || 1;

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-5">
      {/* Risk banner */}
      <Card className={cn("border", RISK_LEVEL_META[risk.level].badge)}>
        <CardContent className="flex flex-col gap-2 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <DiscoveryRiskBadge level={risk.level} score={risk.score} />
            <span className="text-xs text-muted-foreground">
              {risk.unansweredCount} required field
              {risk.unansweredCount === 1 ? "" : "s"} unanswered
            </span>
          </div>
          <p className="text-sm">{risk.recommendedAction}</p>
          {risk.flags.length ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {risk.flags.map((f) => (
                <span
                  key={f.label}
                  className="rounded-full bg-background/70 px-2 py-0.5 text-[0.7rem] text-muted-foreground"
                >
                  {f.label} +{f.points}
                </span>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Hours table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Hours breakdown</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[1fr_8rem_auto_auto_auto] sm:gap-x-4">
            {/* Header */}
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Phase
            </div>
            <div className="hidden text-right text-xs font-medium uppercase tracking-wide text-muted-foreground sm:block">
              Share
            </div>
            <div className="w-12 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Min
            </div>
            <div className="w-12 text-right text-xs font-medium uppercase tracking-wide text-primary">
              Mid
            </div>
            <div className="w-12 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Max
            </div>

            {estimate.phases.map((phase) => {
              const isOpen = expanded.has(phase.id);
              const share = Math.round((phase.mid / totalMid) * 100);
              const meta = PHASE_META[phase.id];
              return (
                <React.Fragment key={phase.id}>
                  <button
                    type="button"
                    onClick={() => toggle(phase.id)}
                    className="col-span-full grid grid-cols-subgrid items-center gap-x-3 rounded-lg py-2 text-left hover:bg-muted/40 sm:gap-x-4"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <ChevronRight
                        className={cn(
                          "size-4 shrink-0 text-muted-foreground transition-transform",
                          isOpen && "rotate-90",
                        )}
                        aria-hidden
                      />
                      <span className={cn("size-2.5 shrink-0 rounded-full", meta.bar)} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{phase.label}</span>
                        <span className="hidden truncate text-xs text-muted-foreground sm:block">
                          {phase.description}
                        </span>
                      </span>
                    </span>
                    <span className="hidden items-center sm:flex">
                      <span className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <span
                          className={cn("block h-full rounded-full", meta.bar)}
                          style={{ width: `${share}%` }}
                        />
                      </span>
                    </span>
                    <span className="w-12 text-right tabular-nums text-muted-foreground">
                      {formatHours(phase.min)}
                    </span>
                    <span className="w-12 text-right font-semibold tabular-nums text-primary">
                      {formatHours(phase.mid)}
                    </span>
                    <span className="w-12 text-right tabular-nums text-muted-foreground">
                      {formatHours(phase.max)}
                    </span>
                  </button>

                  {isOpen
                    ? phase.tasks.map((task) => {
                        const taskShare = phase.mid
                          ? Math.round((task.mid / phase.mid) * 100)
                          : 0;
                        return (
                          <div
                            key={task.id}
                            className="col-span-full grid grid-cols-subgrid items-center gap-x-3 border-l-2 py-1.5 pl-4 sm:gap-x-4"
                            style={{ borderColor: meta.hex }}
                          >
                            <span className="min-w-0 pl-4">
                              <span className="block truncate text-sm">{task.name}</span>
                              {task.note ? (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {task.note}
                                </span>
                              ) : null}
                            </span>
                            <span className="hidden items-center sm:flex">
                              <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted/70">
                                <span
                                  className="block h-full rounded-full bg-muted-foreground/40"
                                  style={{ width: `${Math.max(taskShare, 2)}%` }}
                                />
                              </span>
                            </span>
                            <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                              {formatHours(task.min)}
                            </span>
                            <span className="w-12 text-right text-xs font-medium tabular-nums">
                              {formatHours(task.mid)}
                            </span>
                            <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                              {formatHours(task.max)}
                            </span>
                          </div>
                        );
                      })
                    : null}
                </React.Fragment>
              );
            })}

            {/* Totals */}
            <div className="col-span-full mt-1 grid grid-cols-subgrid items-center gap-x-3 border-t-2 pt-3 sm:gap-x-4">
              <span className="font-semibold">
                Project total
                <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-primary">
                  quote the mid
                </span>
              </span>
              <span className="hidden sm:block" />
              <span className="w-12 text-right font-semibold tabular-nums text-muted-foreground">
                {formatHours(estimate.total.min)}
              </span>
              <span className="w-12 text-right text-base font-bold tabular-nums text-primary">
                {formatHours(estimate.total.mid)}
              </span>
              <span className="w-12 text-right font-semibold tabular-nums text-muted-foreground">
                {formatHours(estimate.total.max)}
              </span>
            </div>

            {estimate.retainer ? (
              <div className="col-span-full grid grid-cols-subgrid items-center gap-x-3 pt-2 text-sm text-muted-foreground sm:gap-x-4">
                <span>Post-launch retainer (excluded from total)</span>
                <span className="hidden sm:block" />
                <span className="col-span-3 text-right tabular-nums">
                  {estimate.retainer.hoursPerMonth} hrs / month
                </span>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Assumptions */}
      {estimate.assumptions.length ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Scope assumptions</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <ul className="grid gap-2 sm:grid-cols-2">
              {estimate.assumptions.map((a) => (
                <li
                  key={a}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                  {a}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
