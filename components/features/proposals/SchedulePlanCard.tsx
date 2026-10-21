"use client";

import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { CalendarClock, Lock } from "lucide-react";
import * as React from "react";

import { SchedulePreviewPanel } from "@/components/features/proposals/SchedulePreviewPanel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { quoteIsFrozen } from "@/lib/sync/estimate-project-sync";
import { cn } from "@/lib/utils";
import {
  previewFinish,
  strategyOf,
  useProposalEstimatorStore,
} from "@/store/proposal-estimator-store";
import { useTasksDataStore } from "@/store/tasks-store";
import { useTeamStore } from "@/store/team-store";
import type { ClientQuote, ScheduleStrategy } from "@/types/proposal.types";

export const STRATEGY_OPTIONS: [ScheduleStrategy, string, string][] = [
  ["efficient", "Best-fit", "Each task goes to the best-skilled qualified person; dates follow how busy they already are."],
  ["quick", "Fastest", "Work is spread across every qualified person to finish soonest."],
  ["none", "Manual", "Nobody is assigned — the team-level timeline, and you staff it after Start project."],
];

// Never throws: a date this card can't read is shown as-is, not a crashed page.
const day = (iso: string) => {
  const d = parseISO(iso);
  return Number.isNaN(d.getTime()) ? iso : format(d, "MMM d, yyyy");
};

/**
 * How the timeline is planned — Best-fit / Fastest / Manual — chosen on the
 * estimate, before the deal closes, because it moves the launch date the client
 * agrees to. Dates only: the price is each line's hours × its own rate.
 *
 * Editable on the Adjust tab until the estimate is approved; read-only on the
 * Timeline tab. The forecast is exactly what Start project would build today
 * (`previewConversion`), so the two can't disagree.
 */
export function SchedulePlanCard({
  quote,
  editable,
  help,
}: {
  quote: ClientQuote;
  editable: boolean;
  help?: React.ReactNode;
}) {
  const updateProposal = useProposalEstimatorStore((s) => s.updateProposal);
  const previewConversion = useProposalEstimatorStore((s) => s.previewConversion);
  // The plan reads the roster and everyone's open work; re-forecast when they load.
  const members = useTeamStore((s) => s.members);
  const tasks = useTasksDataStore((s) => s.tasks);
  const strategy = strategyOf(quote);
  const frozen = quoteIsFrozen(quote);
  const [open, setOpen] = React.useState(false);

  const preview = React.useMemo(
    () =>
      previewConversion(quote.id, {
        seedTasks: true,
        strategy: strategy === "none" ? undefined : strategy,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- what the forecast reads
    [quote.id, quote.line_items, quote.discovery, quote.addons, quote.risk_buffer_pct, quote.requirements_unclear, strategy, members, tasks, previewConversion],
  );
  const finish = preview ? previewFinish(preview) : null;
  const quoted = quote.schedule_plan?.quoted_finish ?? null;
  const slipDays = quoted && finish ? differenceInCalendarDays(parseISO(finish), parseISO(quoted)) : 0;
  const slip = Number.isNaN(slipDays) ? 0 : slipDays;

  return (
    <Card>
      <CardHeader className="gap-1.5">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
          Who does the work
        </CardTitle>
        <CardDescription>
          Plans the timeline with real people, before the deal closes. Moves
          dates only — the price stays the same.
        </CardDescription>
        {help ? <CardAction>{help}</CardAction> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {editable ? (
          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Timeline plan">
            {STRATEGY_OPTIONS.map(([val, label]) => (
              <Button
                key={val}
                type="button"
                size="sm"
                variant={strategy === val ? "default" : "outline"}
                aria-pressed={strategy === val}
                disabled={frozen}
                className="h-9"
                onClick={() =>
                  updateProposal(quote.id, {
                    schedule_plan: { ...(quote.schedule_plan ?? {}), strategy: val },
                  })
                }
              >
                {label}
              </Button>
            ))}
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {editable
            ? STRATEGY_OPTIONS.find(([v]) => v === strategy)![2]
            : `Planned with ${STRATEGY_OPTIONS.find(([v]) => v === strategy)![1]} (set on the Adjust tab).`}
        </p>

        {frozen && quoted ? (
          <p className="flex items-start gap-1.5 text-sm">
            <Lock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span>{`Quoted launch: ${day(quoted)}. Locked with the price once approved.`}</span>
          </p>
        ) : frozen && editable ? (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Locked with the price once approved.
          </p>
        ) : null}

        {finish ? (
          <p
            className={cn(
              "text-sm",
              slip > 0 && "text-amber-700 dark:text-amber-400",
            )}
            data-testid="plan-finish"
          >
            {frozen && quoted
              ? slip > 0
                ? `With today's team it would launch ${day(finish)} — ${slip} day${slip === 1 ? "" : "s"} later than quoted.`
                : `Today's team still launches by ${day(finish)}.`
              : `Launches ${day(finish)}`}
            {preview && strategy !== "none" && preview.tasks.length
              ? ` · ${preview.assignedCount} of ${preview.tasks.length} tasks have someone`
              : ""}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Add line items to see a launch date.
          </p>
        )}

        {preview && strategy !== "none" && preview.tasks.length ? (
          <div>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? "Hide who does what" : "See who does what"}
            </Button>
            {open ? (
              <div className="mt-2">
                <SchedulePreviewPanel preview={preview} />
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
