"use client";

import * as React from "react";
import {
  ArrowRight,
  CalendarRange,
  Compass,
  ListChecks,
  Loader2,
  Sigma,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { tierLabel } from "@/lib/constants/proposal-estimator";
import { categoryName } from "@/lib/proposal-catalog";
import { cn } from "@/lib/utils";
import type { EstherAnalysis } from "@/types/esther.types";

const PHASE_BAR_COLORS = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
];

type EstherAnalysisCardProps = {
  analysis: EstherAnalysis;
  creating?: boolean;
  onCreateProposal: () => void;
  /** Optional hand-off to refine the estimate in the Discovery wizard. */
  onStartDiscovery?: () => void;
};

export function EstherAnalysisCard({
  analysis,
  creating,
  onCreateProposal,
  onStartDiscovery,
}: EstherAnalysisCardProps) {
  const { totals, timeline } = analysis;

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/60">
      {/* Header band */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 bg-muted/40 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
            Proposal draft
          </p>
          <h3 className="truncate text-sm font-semibold">
            {analysis.suggestedTitle}
          </h3>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {analysis.clientName ? (
            <Badge variant="outline">{analysis.clientName}</Badge>
          ) : null}
          <Badge variant="secondary" className="capitalize">
            {analysis.platform.replace("_", " ")}
          </Badge>
        </div>
      </div>

      <div className="flex flex-col gap-5 p-4">
        {/* Headline numbers */}
        <dl className="grid grid-cols-3 gap-2">
          <Stat label="Total hours" value={`${totals.grandHours}`} icon={<Sigma className="size-3.5" />} />
          <Stat label="Timeline" value={`~${analysis.totalWeeks} wk`} icon={<CalendarRange className="size-3.5" />} />
          <Stat label="Line items" value={`${analysis.lineItems.length}`} icon={<ListChecks className="size-3.5" />} />
        </dl>

        {/* Scope table */}
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Scope
          </h4>
          <ul className="divide-y divide-border/50 rounded-xl border border-border/60">
            {analysis.lineItems.map((li) => (
              <li
                key={`${li.catalog_id ?? li.title}`}
                className="flex items-center gap-3 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{li.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[li.module, categoryName(li.category_id)]
                      .filter(Boolean)
                      .join(" · ") || "Freehand"}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[0.7rem]">
                  {tierLabel(li.tier)}
                </Badge>
                {li.quantity > 1 ? (
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    ×{li.quantity}
                  </span>
                ) : null}
                <span className="w-12 shrink-0 text-right text-sm font-medium tabular-nums">
                  {li.hours}h
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Roll-up */}
        <section className="rounded-xl bg-muted/40 px-3 py-2.5 text-sm">
          <RollupRow label="Dev" value={totals.devHours} />
          <RollupRow label="Responsive" value={totals.responsiveHours} />
          <RollupRow label="Design" value={totals.designHours} />
          <RollupRow label="QA" value={totals.qaHours} />
          <RollupRow label="PM" value={totals.pmHours} />
          <Separator className="my-1.5" />
          <RollupRow label="Total estimated hours" value={totals.grandHours} strong />
        </section>

        {/* Timeline */}
        {timeline.length ? (
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Phased timeline
            </h4>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full">
              {timeline.map((phase, i) => (
                <div
                  key={phase.name}
                  className={cn(PHASE_BAR_COLORS[i % PHASE_BAR_COLORS.length])}
                  style={{ width: `${Math.max(phase.share * 100, 4)}%` }}
                  title={`${phase.name}: weeks ${phase.startWeek}–${phase.endWeek}`}
                />
              ))}
            </div>
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {timeline.map((phase, i) => (
                <li key={phase.name} className="flex items-center gap-2 text-xs">
                  <span
                    className={cn(
                      "size-2.5 shrink-0 rounded-full",
                      PHASE_BAR_COLORS[i % PHASE_BAR_COLORS.length],
                    )}
                    aria-hidden
                  />
                  <span className="flex-1 truncate">{phase.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {phase.startWeek === phase.endWeek
                      ? `wk ${phase.startWeek}`
                      : `wk ${phase.startWeek}–${phase.endWeek}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Assumptions */}
        <section>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Assumptions
          </h4>
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            {analysis.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>

        <div className="flex flex-col gap-2 sm:flex-row">
          {onStartDiscovery ? (
            <Button
              type="button"
              variant="outline"
              className="gap-2 sm:flex-1"
              onClick={onStartDiscovery}
            >
              <Compass className="size-4" aria-hidden />
              Refine in Discovery
            </Button>
          ) : null}
          <Button
            type="button"
            className="gap-2 sm:flex-1"
            onClick={onCreateProposal}
            disabled={creating}
          >
            {creating ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <ArrowRight className="size-4" aria-hidden />
            )}
            Create proposal
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2">
      <div className="flex items-center gap-1 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function RollupRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-0.5",
        strong && "font-semibold",
      )}
    >
      <span className={cn("text-muted-foreground", strong && "text-foreground")}>
        {label}
      </span>
      <span className="tabular-nums">{value}h</span>
    </div>
  );
}
