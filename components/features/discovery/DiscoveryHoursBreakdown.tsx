"use client";

import * as React from "react";
import { ChevronRight, Pencil, RotateCcw } from "lucide-react";

import { DiscoveryRiskBadge } from "@/components/features/discovery/DiscoveryRiskBadge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PHASE_META, RISK_LEVEL_META } from "@/lib/discovery/constants";
import { formatHours } from "@/lib/discovery";
import { cn } from "@/lib/utils";
import type { DiscoveryResult, PhaseId } from "@/types/discovery.types";

export function DiscoveryHoursBreakdown({
  result,
  onAssumptionsChange,
  assumptionsEdited = false,
  lineHours,
  onAddPhases,
}: {
  result: DiscoveryResult;
  /**
   * Adds the questionnaire's tasks for phases the line items leave empty —
   * time the schedule reserves but the price didn't include.
   */
  onAddPhases?: (phases: PhaseId[]) => void;
  /**
   * The quote's actual line-item hours per phase. Shown as a "Your lines"
   * column next to the questionnaire's estimate — a typed-in estimate rarely
   * matches it, and the two used to sit on different tabs with nothing
   * linking them.
   */
  lineHours?: {
    byPhase: Partial<Record<PhaseId, number>>;
    /** Each line item and the phase it lands in — listed under that phase. */
    lines: { id: string; phase: PhaseId; title: string; hours: number }[];
    total: number;
  } | null;
  /**
   * Makes the assumptions editable. Receives the edited list, or `null` to go
   * back to the list generated from the answers.
   */
  onAssumptionsChange?: (assumptions: string[] | null) => void;
  /** The list on screen is the coordinator's edit, not the generated one. */
  assumptionsEdited?: boolean;
}) {
  const { estimate, risk } = result;
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const totalMid = estimate.total.mid || 1;
  // Phases the questionnaire puts work in but no line item covers: they stay on
  // the schedule (Discovery, Launch…) yet nobody is paying for them.
  const uncovered = lineHours
    ? estimate.phases
        .map((ph) => ({
          phase: ph,
          hours: ph.tasks.reduce((sum, t) => sum + (t.mid > 0 ? t.mid : 0), 0),
        }))
        .filter((x) => x.hours > 0 && !(lineHours.byPhase[x.phase.id] ?? 0))
    : [];
  const uncoveredHours = uncovered.reduce((sum, x) => sum + x.hours, 0);

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
          {lineHours ? (
            <CardDescription>
              {(() => {
                const diff = Math.round((lineHours.total - estimate.total.mid) * 10) / 10;
                const gap =
                  diff === 0
                    ? "the same as"
                    : `${formatHours(Math.abs(diff))} h ${diff > 0 ? "over" : "under"}`;
                return `Your line items total ${formatHours(lineHours.total)} h — ${gap} the questionnaire's mid (${formatHours(estimate.total.mid)} h). The quote is priced from your line items.`;
              })()}
            </CardDescription>
          ) : null}
          {uncovered.length && onAddPhases ? (
            <div
              role="status"
              className="mt-2 flex flex-wrap items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200"
            >
              <p className="min-w-0 flex-1">
                <strong>Not priced:</strong>{" "}
                {`${uncovered.map((x) => x.phase.label).join(" and ")} ${uncovered.length === 1 ? "is" : "are"} on the schedule, but none of your line items cover ${uncovered.length === 1 ? "it" : "them"} (${formatHours(uncoveredHours)} h at the questionnaire's mid).`}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 shrink-0 bg-background"
                onClick={() => onAddPhases(uncovered.map((x) => x.phase.id))}
              >
                {`Add ${uncovered.length === 1 ? "it" : `these ${uncovered.length}`} as line items`}
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="pb-4">
          <div
            className={cn(
              "grid items-center gap-x-3 gap-y-1 text-sm sm:gap-x-4",
              lineHours
                ? "grid-cols-[1fr_auto_auto_auto_auto] sm:grid-cols-[1fr_8rem_auto_auto_auto_auto]"
                : "grid-cols-[1fr_auto_auto_auto] sm:grid-cols-[1fr_8rem_auto_auto_auto]",
            )}
          >
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
            {lineHours ? (
              <div className="w-14 text-right text-xs font-medium uppercase tracking-wide text-foreground">
                Your lines
              </div>
            ) : null}

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
                    {lineHours ? (
                      <span className="w-14 text-right font-semibold tabular-nums">
                        {formatHours(lineHours.byPhase[phase.id] ?? 0)}
                      </span>
                    ) : null}
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
                            {lineHours ? <span /> : null}
                          </div>
                        );
                      })
                    : null}
                  {/* The quote's own lines in this phase — what is actually
                      priced, next to what the questionnaire expected. */}
                  {isOpen && lineHours
                    ? lineHours.lines
                        .filter((l) => l.phase === phase.id)
                        .map((l) => (
                          <div
                            key={l.id}
                            className="col-span-full grid grid-cols-subgrid items-center gap-x-3 border-l-2 bg-primary/[0.03] py-1.5 pl-4 sm:gap-x-4"
                            style={{ borderColor: meta.hex }}
                          >
                            <span className="flex min-w-0 items-center gap-2 pl-4">
                              <span className="truncate text-sm">{l.title}</span>
                              <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide text-primary">
                                Your line
                              </span>
                            </span>
                            <span className="hidden sm:block" />
                            <span />
                            <span />
                            <span />
                            <span className="w-14 text-right text-xs font-medium tabular-nums">
                              {formatHours(l.hours)}
                            </span>
                          </div>
                        ))
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
              {lineHours ? (
                <span className="w-14 text-right text-base font-bold tabular-nums">
                  {formatHours(lineHours.total)}
                </span>
              ) : null}
            </div>

            {estimate.retainer ? (
              <div className="col-span-full grid grid-cols-subgrid items-center gap-x-3 pt-2 text-sm text-muted-foreground sm:gap-x-4">
                <span>Post-launch retainer (excluded from total)</span>
                <span className="hidden sm:block" />
                <span className={cn("text-right tabular-nums", lineHours ? "col-span-4" : "col-span-3")}>
                  {estimate.retainer.hoursPerMonth} hrs / month
                </span>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {onAssumptionsChange ? (
        <ScopeAssumptionsCard
          assumptions={estimate.assumptions}
          edited={assumptionsEdited}
          onChange={onAssumptionsChange}
        />
      ) : estimate.assumptions.length ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Scope assumptions</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <AssumptionList items={estimate.assumptions} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function AssumptionList({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {items.map((a, i) => (
        <li
          key={`${i}-${a}`}
          className="flex items-start gap-2 text-sm text-muted-foreground"
        >
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
          {a}
        </li>
      ))}
    </ul>
  );
}

/**
 * The scope assumptions, editable. Starts from the list generated from the
 * answers; once edited, the coordinator's list is what the quote prints, and
 * later answer changes no longer rewrite it (Reset brings the generated one
 * back). Edited as one line per assumption — the simplest thing that can't
 * lose a line to a fiddly per-row control on a phone.
 */
export function ScopeAssumptionsCard({
  assumptions,
  edited,
  onChange,
  description,
  canReset = true,
}: {
  assumptions: string[];
  edited: boolean;
  onChange: (assumptions: string[] | null) => void;
  /** Overrides the guided wording (a line-items quote has no answers to generate from). */
  description?: string;
  /** False when there is no generated list to go back to. */
  canReset?: boolean;
}) {
  const [draft, setDraft] = React.useState<string | null>(null);

  const save = () => {
    if (draft === null) return;
    const lines = draft
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    onChange(lines);
    setDraft(null);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Scope assumptions</CardTitle>
        <CardDescription>
          {description ??
            (edited
              ? "Edited. Printed on the quote as shown; changing answers no longer updates this list."
              : "Generated from the answers. Printed on the quote.")}
        </CardDescription>
        {draft === null ? (
          <CardAction className="flex gap-1.5">
            {edited && canReset ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange(null)}
              >
                <RotateCcw className="size-3.5" aria-hidden />
                Reset to defaults
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDraft(assumptions.join("\n"))}
            >
              <Pencil className="size-3.5" aria-hidden />
              Edit
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="pb-4">
        {draft !== null ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="scope-assumptions" className="text-xs text-muted-foreground">
              One assumption per line
            </Label>
            <Textarea
              id="scope-assumptions"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.max(4, draft.split("\n").length + 1)}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDraft(null)}
              >
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={save}>
                Save assumptions
              </Button>
            </div>
          </div>
        ) : assumptions.length ? (
          <AssumptionList items={assumptions} />
        ) : (
          <p className="text-sm text-muted-foreground">
            No assumptions. The quote won&apos;t show this section.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
