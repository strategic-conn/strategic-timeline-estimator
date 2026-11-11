"use client";

import { differenceInCalendarDays, parseISO } from "date-fns";
import {
  CalendarClock,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  Lock,
  TriangleAlert,
  Users,
} from "lucide-react";
import * as React from "react";

import { InfoTip } from "@/components/common/info-tip";
import { SchedulePreviewPanel } from "@/components/features/proposals/SchedulePreviewPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatLaunchDay, useQuoteSchedule } from "@/hooks/useQuoteSchedule";
import { scheduleInputsOf } from "@/lib/discovery/schedule-inputs";
import { quoteIsFrozen } from "@/lib/sync/estimate-project-sync";
import { cn } from "@/lib/utils";
import {
  strategyOf,
  useProposalEstimatorStore,
} from "@/store/proposal-estimator-store";
import type { ClientQuote, ScheduleStrategy } from "@/types/proposal.types";

/** [value, label, what it does — one line, shown inside the option]. */
export const STRATEGY_OPTIONS: [ScheduleStrategy, string, string][] = [
  ["efficient", "Best-fit", "Most-skilled person per task, even if busier — may launch later"],
  ["quick", "Fastest", "Whoever can finish first — work spreads out, launches sooner"],
  // Manual ("none") is parked — see strategyOf.
];

// Never throws: a date this card can't read is shown as-is, not a crashed page.
const day = formatLaunchDay;

/**
 * The Adjust tab's planning, as two cards that read top to bottom as
 * inputs → choice → result (split 2026-11-12):
 *
 *  - `ScheduleCard` — the client's calendar: start date, hard deadline, review
 *    time, blackout periods (moved here from questionnaire §7).
 *  - `SchedulePlanCard` ("Timeline") — who gets each task (Best-fit / Fastest),
 *    then the launch panel that choice produces.
 *
 * Dates only: the price is each line's hours × its own rate. Editable until the
 * estimate is approved; read-only on Review → Timeline. The forecast is exactly
 * what Start project would build today (`previewConversion`).
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
  const strategyLabel = STRATEGY_OPTIONS.find(([v]) => v === strategy)![1];
  const frozen = quoteIsFrozen(quote);
  const [open, setOpen] = React.useState(false);

  const { preview, finish, quoted } = useQuoteSchedule(quote);
  const slipDays = quoted && finish ? differenceInCalendarDays(parseISO(finish), parseISO(quoted)) : 0;
  const slip = Number.isNaN(slipDays) ? 0 : slipDays;

  const showQuoted = frozen && Boolean(quoted);
  const headline = showQuoted ? quoted : finish;
  const total = preview && strategy !== "none" ? preview.tasks.length : 0;
  const staffed = preview?.assignedCount ?? 0;
  const unstaffed = total - staffed;

  // The client's hard deadline against the date we'd actually promise.
  const inputs = scheduleInputsOf(quote);
  const promised = showQuoted ? quoted : finish;
  const deadlineGap =
    inputs.hardDeadline && promised
      ? differenceInCalendarDays(parseISO(promised), parseISO(inputs.hardDeadline))
      : null;
  const hasDeadline = deadlineGap !== null && !Number.isNaN(deadlineGap);

  return (
    <Card>
      <CardHeader className="gap-1.5">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
          Timeline
        </CardTitle>
        <CardDescription>
          {`Who does each task, and when it launches. Moves dates only — never the price.`}
        </CardDescription>
        {help ? <CardAction>{help}</CardAction> : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* ── 1. The choice ── */}
        {editable ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">Who gets each task</span>
              {frozen ? (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock className="size-3.5" aria-hidden />
                  Locked with the price once approved
                </span>
              ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Timeline plan">
              {STRATEGY_OPTIONS.map(([val, label, hint]) => {
                const on = strategy === val;
                return (
                  <button
                    key={val}
                    type="button"
                    aria-pressed={on}
                    disabled={frozen}
                    onClick={() =>
                      updateProposal(quote.id, {
                        schedule_plan: { ...(quote.schedule_plan ?? {}), strategy: val },
                      })
                    }
                    className={cn(
                      "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      "disabled:cursor-not-allowed disabled:opacity-60",
                      on
                        ? "border-primary bg-primary/10 ring-1 ring-primary"
                        : "border-border hover:bg-muted/50",
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-4 items-center justify-center rounded-full border",
                          on ? "border-primary" : "border-muted-foreground/50",
                        )}
                      >
                        {on ? <span className="size-2 rounded-full bg-primary" /> : null}
                      </span>
                      {label}
                    </span>
                    <span className="pl-6 text-xs text-muted-foreground">{hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {`Planned with ${strategyLabel} (set on the Adjust tab).`}
            {` Starts ${inputs.startDate ? day(inputs.startDate) : "today"}`}
            {inputs.hardDeadline ? ` · client deadline ${day(inputs.hardDeadline)}` : ""}
            {` · client reviews take ${inputs.reviewDays} working day${inputs.reviewDays === 1 ? "" : "s"} each`}
            {inputs.blackout ? " · blackout periods allowed for" : ""}
            {"."}
          </p>
        )}

        {/* ── 2. The result: when it launches, and whether that holds ── */}
        <section
          aria-label="Launch forecast"
          className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5"
        >
          {headline ? (
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div className="min-w-0" data-testid="plan-finish">
                <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  {showQuoted ? "Quoted launch" : "Launches"}
                  {showQuoted ? (
                    <Badge variant="outline" className="gap-1 font-normal">
                      <Lock className="size-3" aria-hidden />
                      Locked at approval
                    </Badge>
                  ) : null}
                </p>
                <p className="text-base font-semibold tabular-nums">{day(headline!)}</p>
              </div>

              {total ? (
                <div className="text-right max-sm:text-left">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground sm:justify-end">
                    <Users className="size-3.5" aria-hidden />
                    Staffed
                  </p>
                  <p
                    className={cn(
                      "text-sm tabular-nums",
                      unstaffed > 0 && "text-amber-700 dark:text-amber-400",
                    )}
                  >
                    <span className="font-semibold">{`${staffed} of ${total}`}</span>
                    {` tasks`}
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="plan-finish">
              Add line items to see a launch date.
            </p>
          )}

          {/* Approved: does today's team still make the date the client agreed to? */}
          {showQuoted && finish ? (
            slip > 0 ? (
              <Status tone="warn">
                {`With today's team it would launch ${day(finish)} — ${slip} day${slip === 1 ? "" : "s"} later than quoted.`}
              </Status>
            ) : (
              <Status tone="ok">{`Today's team still launches by ${day(finish)}.`}</Status>
            )
          ) : null}

          {/* The client's hard deadline, when there is one. */}
          {hasDeadline ? (
            deadlineGap! > 0 ? (
              <Status tone="warn" testId="deadline-status">
                {`${deadlineGap} day${deadlineGap === 1 ? "" : "s"} past the client's hard deadline (${day(inputs.hardDeadline)}).`}
              </Status>
            ) : (
              <Status tone="ok" testId="deadline-status">
                {`Meets the client's hard deadline (${day(inputs.hardDeadline)}).`}
              </Status>
            )
          ) : null}

          {unstaffed > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {`${unstaffed} task${unstaffed === 1 ? "" : "s"} couldn't be matched to anyone — staff ${unstaffed === 1 ? "it" : "them"} after Start project.`}
            </p>
          ) : null}

          {total ? (
            <div className="mt-2 border-t border-border/60 pt-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-2 gap-1.5"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
              >
                <ChevronDown
                  className={cn("size-4 transition-transform", open && "rotate-180")}
                  aria-hidden
                />
                {open ? "Hide who does what" : "See who does what"}
              </Button>
              {open && preview ? (
                <div className="mt-2">
                  <SchedulePreviewPanel preview={preview} />
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </CardContent>
    </Card>
  );
}

/** One status line in the launch panel: amber boxed for a problem, green for OK. */
function Status({
  tone,
  testId,
  children,
}: {
  tone: "warn" | "ok";
  testId?: string;
  children: React.ReactNode;
}) {
  return tone === "warn" ? (
    <p
      className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300"
      data-testid={testId}
    >
      <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  ) : (
    <p
      className="mt-2 flex items-start gap-2 text-xs text-emerald-700 dark:text-emerald-400"
      data-testid={testId}
    >
      <CheckCircle2 className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

const FIELD_LABEL = "flex items-center gap-1 text-xs font-medium";
const FIELD_HINT = "text-xs text-muted-foreground";

/**
 * The client's calendar (moved here from questionnaire section 7, 2026-11-12):
 * start date, hard deadline, client review time and blackout periods — for
 * every estimate, guided or not. Saved on `schedule_plan`; read through
 * `scheduleInputsOf`, which falls back to the questionnaire's old answers.
 * One row of four on a wide screen; the longer explanations sit in (i) tips.
 */
export function ScheduleCard({ quote, help }: { quote: ClientQuote; help?: React.ReactNode }) {
  const inputs = scheduleInputsOf(quote);
  const frozen = quoteIsFrozen(quote);
  return (
    <Card>
      <CardHeader className="gap-1.5">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarRange className="size-4 text-muted-foreground" aria-hidden />
          Schedule
        </CardTitle>
        <CardDescription>
          {frozen
            ? "The client's calendar this estimate was planned around. Locked with the price once approved."
            : "The client's calendar: when work can start and what it has to fit around."}
        </CardDescription>
        {help ? <CardAction>{help}</CardAction> : null}
      </CardHeader>
      <CardContent>
        {/* Keyed on the saved values so an outside change resets the drafts. */}
        <ScheduleFields
          key={`${inputs.reviewDays}|${inputs.blackoutNotes}`}
          quote={quote}
          disabled={frozen}
        />
      </CardContent>
    </Card>
  );
}

function ScheduleFields({ quote, disabled }: { quote: ClientQuote; disabled: boolean }) {
  const updateProposal = useProposalEstimatorStore((s) => s.updateProposal);
  const inputs = scheduleInputsOf(quote);
  const [reviewDraft, setReviewDraft] = React.useState(String(inputs.reviewDays));
  const [notesDraft, setNotesDraft] = React.useState(inputs.blackoutNotes);

  const save = (patch: Partial<NonNullable<ClientQuote["schedule_plan"]>>) =>
    updateProposal(quote.id, {
      schedule_plan: { ...(quote.schedule_plan ?? { strategy: strategyOf(quote) }), ...patch },
    });

  const saveReview = () => {
    const n = Math.round(Number(reviewDraft));
    if (!Number.isFinite(n) || n < 0 || n > 30) {
      setReviewDraft(String(inputs.reviewDays));
      return;
    }
    if (n !== inputs.reviewDays) save({ review_days: n });
  };

  const deadlineBeforeStart = Boolean(
    inputs.hardDeadline && inputs.startDate && inputs.hardDeadline < inputs.startDate,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>
            <label htmlFor="plan-start">Start date</label>
            <InfoTip label="Start date">
              When work can begin — usually once the contract is signed and the
              deposit is in. Every date on the timeline counts from here.
            </InfoTip>
          </span>
          <Input
            id="plan-start"
            type="date"
            value={inputs.startDate}
            disabled={disabled}
            onChange={(e) => save({ start_date: e.target.value })}
            className="h-8 w-full"
            aria-describedby="plan-start-hint"
            data-testid="plan-start"
          />
          <p id="plan-start-hint" className={FIELD_HINT}>
            Empty = today
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>
            <label htmlFor="plan-deadline">Hard deadline</label>
            <InfoTip label="Hard deadline">
              Only if the site must be live by a fixed date, such as a product
              launch or event. The launch date is checked against it.
            </InfoTip>
          </span>
          <Input
            id="plan-deadline"
            type="date"
            value={inputs.hardDeadline}
            disabled={disabled}
            onChange={(e) => save({ hard_deadline: e.target.value })}
            className="h-8 w-full"
            aria-describedby="plan-deadline-hint"
            aria-invalid={deadlineBeforeStart || undefined}
            data-testid="plan-deadline"
          />
          <p
            id="plan-deadline-hint"
            className={cn(FIELD_HINT, deadlineBeforeStart && "text-destructive")}
          >
            {deadlineBeforeStart ? "Before the start date" : "Optional"}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>
            <label htmlFor="review-days">Client review time</label>
            <InfoTip label="Client review time">
              How many working days the client takes at each sign-off — scope,
              design approval and testing the finished site. Each one waits
              this long on the timeline.
            </InfoTip>
          </span>
          <div className="flex items-center gap-2">
            <Input
              id="review-days"
              type="number"
              inputMode="numeric"
              min={0}
              max={30}
              value={reviewDraft}
              disabled={disabled}
              onChange={(e) => setReviewDraft(e.target.value)}
              onBlur={saveReview}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className="h-8 w-16"
              aria-describedby="review-days-hint"
              data-testid="review-days"
            />
            <span className="text-xs text-muted-foreground">working days</span>
          </div>
          <p id="review-days-hint" className={FIELD_HINT}>
            Per sign-off
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>
            <span>Blackout periods</span>
            <InfoTip label="Blackout periods">
              {"Times the client can't review or launch, such as a holiday shutdown or peak season. Adds 10 working days before launch."}
            </InfoTip>
          </span>
          <label className="flex h-8 cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              id="plan-blackout"
              checked={inputs.blackout}
              disabled={disabled}
              onCheckedChange={(v) => save({ blackout: v === true })}
              aria-describedby="plan-blackout-hint"
            />
            The client has some
          </label>
          <p id="plan-blackout-hint" className={FIELD_HINT}>
            +10 working days
          </p>
        </div>
      </div>

      {inputs.blackout ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="plan-blackout-notes" className={FIELD_LABEL}>
            Blackout periods — when, and why
          </label>
          <Textarea
            id="plan-blackout-notes"
            value={notesDraft}
            disabled={disabled}
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={() => {
              if (notesDraft !== inputs.blackoutNotes) save({ blackout_notes: notesDraft });
            }}
            placeholder="e.g. Dec 15 – Jan 5, holiday shutdown"
            rows={2}
            className="min-h-0"
          />
        </div>
      ) : null}
    </div>
  );
}
