"use client";

import { differenceInCalendarDays, parseISO } from "date-fns";
import { CalendarClock, Lock } from "lucide-react";
import * as React from "react";

import { SchedulePreviewPanel } from "@/components/features/proposals/SchedulePreviewPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatLaunchDay, useQuoteSchedule } from "@/hooks/useQuoteSchedule";
import { quoteIsFrozen } from "@/lib/sync/estimate-project-sync";
import { cn } from "@/lib/utils";
import {
  reviewDaysOf,
  strategyOf,
  useProposalEstimatorStore,
} from "@/store/proposal-estimator-store";
import type { ClientQuote, ScheduleStrategy } from "@/types/proposal.types";

export const STRATEGY_OPTIONS: [ScheduleStrategy, string, string][] = [
  ["efficient", "Best-fit", "Each task goes to the qualified person with the most skill stars, even if they're busier — the launch date waits for them."],
  ["quick", "Fastest", "Each task goes to whichever qualified person can finish it first, so work spreads out and the project launches sooner."],
  // Manual ("none") is parked — see strategyOf.
];

// Never throws: a date this card can't read is shown as-is, not a crashed page.
const day = formatLaunchDay;

/**
 * How the timeline is planned — Best-fit / Fastest / Manual — chosen on the
 * estimate, before the deal closes, because it moves the launch date the client
 * agrees to. Dates only: the price is each line's hours × its own rate.
 *
 * Editable on the Adjust tab until the estimate is approved; read-only on the
 * Review tab's Timeline view. The forecast is exactly what Start project would build today
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
  const strategy = strategyOf(quote);
  const frozen = quoteIsFrozen(quote);
  const [open, setOpen] = React.useState(false);

  const { preview, finish, quoted } = useQuoteSchedule(quote);
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
          Plans the timeline in sprints with real people and the
          client&apos;s sign-offs, before the deal closes. Moves dates only —
          the price stays the same.
        </CardDescription>
        {help ? <CardAction>{help}</CardAction> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {editable ? (
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Timeline plan">
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
        {editable ? (
          // Keyed on the saved value so an outside change resets the draft.
          <ReviewDaysField key={reviewDaysOf(quote)} quote={quote} disabled={frozen} />
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

/**
 * How long the client takes at each checkpoint (scope sign-off, design
 * approval, acceptance testing). Saved on the estimate's plan; until then it
 * reads the questionnaire's "client review turnaround", else 3 working days.
 */
function ReviewDaysField({ quote, disabled }: { quote: ClientQuote; disabled: boolean }) {
  const updateProposal = useProposalEstimatorStore((s) => s.updateProposal);
  const current = reviewDaysOf(quote);
  const [draft, setDraft] = React.useState(String(current));
  const save = () => {
    const n = Math.round(Number(draft));
    if (!Number.isFinite(n) || n < 0 || n > 30) {
      setDraft(String(current));
      return;
    }
    if (n !== current) {
      updateProposal(quote.id, {
        schedule_plan: { ...(quote.schedule_plan ?? { strategy: strategyOf(quote) }), review_days: n },
      });
    }
  };
  return (
    <label className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span>Client review time</span>
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        max={30}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="h-8 w-16"
        aria-describedby="review-days-hint"
        data-testid="review-days"
      />
      <span className="text-muted-foreground">working days</span>
      <span id="review-days-hint" className="w-full text-xs text-muted-foreground">
        How long the client takes to sign off scope, approve design and test the
        finished site. Each of those waits this long on the timeline.
      </span>
    </label>
  );
}
