"use client";

import * as React from "react";
import { Ban, Check, ChevronRight, CircleHelp, Package, Pencil, Plus, RotateCcw, X } from "lucide-react";

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
import { PHASE_META, RISK_LEVEL_META } from "@/lib/discovery/constants";
import { formatHours } from "@/lib/discovery";
import { cn } from "@/lib/utils";
import {
  ASSUMPTION_GROUPS,
  groupAssumptions,
  groupOf,
  toStored,
  withoutMarker,
  type AssumptionGroup,
} from "@/lib/estimator/assumption-groups";
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
          {/* Phones scroll the table sideways rather than squeeze phase names
              to "Disc…" beside five number columns. */}
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
          <div
            className={cn(
              "grid min-w-[25rem] items-center gap-x-3 gap-y-1 text-sm sm:min-w-0 sm:gap-x-4",
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

const GROUP_STYLE: Record<AssumptionGroup, { icon: React.ReactNode; dot: string }> = {
  included: {
    icon: <Check className="size-3.5" aria-hidden />,
    dot: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  client: {
    icon: <Package className="size-3.5" aria-hidden />,
    dot: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
  confirm: {
    icon: <CircleHelp className="size-3.5" aria-hidden />,
    dot: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  },
  excluded: {
    icon: <Ban className="size-3.5" aria-hidden />,
    dot: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  },
};

/**
 * Assumptions grouped the way a reader scans them — Included, The client
 * provides, Still to confirm, Not included — each a short single-column list
 * (it was one two-column list that read in a zig-zag). Display only: the
 * stored list and the PDF keep the coordinator's order (`groupAssumptions`).
 */
function AssumptionList({ items }: { items: string[] }) {
  const groups = groupAssumptions(items);
  return (
    <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2" data-testid="assumption-groups">
      {groups.map((g) => (
        <section key={g.id} aria-labelledby={`assumptions-${g.id}`} data-group={g.id}>
          <h4 id={`assumptions-${g.id}`} className="mb-2 flex items-center gap-2 text-sm font-medium">
            <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full", GROUP_STYLE[g.id].dot)}>
              {GROUP_STYLE[g.id].icon}
            </span>
            {g.label}
            <span className="text-xs font-normal tabular-nums text-muted-foreground">{g.items.length}</span>
          </h4>
          <ul className="flex flex-col gap-1.5 border-l border-border/70 pl-4 ml-3">
            {g.items.map((a, i) => (
              <li key={`${i}-${a}`} className="text-sm leading-relaxed text-muted-foreground">
                {a}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

type EditRow = {
  key: string;
  group: AssumptionGroup;
  text: string;
  /** The stored line it came from, kept as-is if the row isn't touched. */
  original?: string;
};

let rowSeq = 0;
const newRow = (group: AssumptionGroup, text = "", original?: string): EditRow => ({
  key: `a${++rowSeq}`,
  group,
  text,
  original,
});

/** Rows → the stored list, in group order; a moved or new line keeps its group. */
function rowsToList(rows: EditRow[]): string[] {
  return ASSUMPTION_GROUPS.flatMap((g) =>
    rows
      .filter((r) => r.group === g.id && r.text.trim())
      .map((r) =>
        r.original && withoutMarker(r.original) === r.text.trim() && groupOf(r.original) === r.group
          ? r.original
          : toStored(r.group, r.text),
      ),
  );
}

const autosize = (el: HTMLTextAreaElement) => {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
};

/**
 * Editing, in the same four groups the card shows: one row per assumption
 * (grows with its text), × to remove, "Add" per group. Enter starts a new
 * line below, Backspace on an empty line removes it, and pasting a list
 * splits it into rows. Saved in group order; a line keeps the group it was
 * put in (`toStored`), and an untouched line is saved exactly as it was.
 */
function AssumptionEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: string[];
  onSave: (list: string[]) => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = React.useState<EditRow[]>(() => {
    const r = initial
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => newRow(groupOf(t), withoutMarker(t), t));
    return r.length ? r : [newRow("included")];
  });
  const refs = React.useRef(new Map<string, HTMLTextAreaElement>());
  // Open on the first row (focusing it also scrolls the editor into view),
  // then follow whichever row was added, or the neighbour of a removed one.
  const [focusKey, setFocusKey] = React.useState<string | null>(
    () => ASSUMPTION_GROUPS.map((g) => rows.find((r) => r.group === g.id)).find(Boolean)?.key ?? null,
  );
  React.useEffect(() => {
    const el = focusKey ? refs.current.get(focusKey) : null;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [focusKey]);

  const update = (key: string, text: string) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, text } : r)));

  /** New rows after `key`, or at the end of the group when `key` is null. */
  const insert = (key: string | null, group: AssumptionGroup, texts: string[] = [""]) => {
    const added = texts.map((t) => newRow(group, t));
    setRows((rs) => {
      let at = key ? rs.findIndex((r) => r.key === key) + 1 : 0;
      if (!key) {
        const last = rs.map((r) => r.group).lastIndexOf(group);
        at = last < 0 ? rs.length : last + 1;
      }
      return [...rs.slice(0, at), ...added, ...rs.slice(at)];
    });
    setFocusKey(added[added.length - 1].key);
  };

  const remove = (key: string) => {
    const i = rows.findIndex((r) => r.key === key);
    const group = rows[i]?.group;
    const before = rows.slice(0, i).reverse().find((r) => r.group === group);
    const after = rows.slice(i + 1).find((r) => r.group === group);
    setFocusKey((before ?? after)?.key ?? null);
    setRows((rs) => rs.filter((r) => r.key !== key));
  };

  const count = rows.filter((r) => r.text.trim()).length;

  return (
    <div className="flex flex-col gap-4" data-testid="assumption-editor">
      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
        {ASSUMPTION_GROUPS.map((g) => (
          <section key={g.id} aria-labelledby={`edit-assumptions-${g.id}`} data-group={g.id}>
            <h4 id={`edit-assumptions-${g.id}`} className="mb-2 flex items-center gap-2 text-sm font-medium">
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full", GROUP_STYLE[g.id].dot)}>
                {GROUP_STYLE[g.id].icon}
              </span>
              {g.label}
            </h4>
            <div className="ml-3 flex flex-col gap-1 border-l border-border/70 pl-3">
              {rows
                .filter((r) => r.group === g.id)
                .map((r) => (
                  <div key={r.key} className="group/row flex items-start gap-1">
                    <textarea
                      ref={(el) => {
                        if (el) {
                          refs.current.set(r.key, el);
                          autosize(el);
                        } else refs.current.delete(r.key);
                      }}
                      rows={1}
                      value={r.text}
                      aria-label={`${g.label}: assumption`}
                      placeholder="Type an assumption…"
                      onChange={(e) => {
                        update(r.key, e.target.value.replace(/\r?\n/g, " "));
                        autosize(e.target);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          insert(r.key, g.id);
                        } else if (e.key === "Backspace" && !r.text && rows.length > 1) {
                          e.preventDefault();
                          remove(r.key);
                        }
                      }}
                      onPaste={(e) => {
                        const lines = e.clipboardData
                          .getData("text")
                          .split(/\r?\n/)
                          .map((l) => l.trim())
                          .filter(Boolean);
                        if (lines.length < 2) return;
                        e.preventDefault();
                        update(r.key, `${r.text} ${lines[0]}`.trim());
                        insert(r.key, g.id, lines.slice(1));
                      }}
                      className="min-h-9 w-full resize-none overflow-hidden rounded-md border border-border/50 bg-muted/20 px-2 py-1.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground hover:border-border focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 dark:hover:bg-input/20"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0 text-muted-foreground pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:group-focus-within/row:opacity-100"
                      aria-label="Remove this assumption"
                      onClick={() => remove(r.key)}
                    >
                      <X className="size-4" aria-hidden />
                    </Button>
                  </div>
                ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-fit gap-1.5 px-2 text-muted-foreground"
                onClick={() => insert(null, g.id)}
              >
                <Plus className="size-3.5" aria-hidden />
                Add
              </Button>
            </div>
          </section>
        ))}
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-3 sm:flex-row sm:items-center">
        <p className="text-xs text-muted-foreground sm:mr-auto">
          {`${count} assumption${count === 1 ? "" : "s"} · Enter adds a line · paste a list to add several`}
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={() => onSave(rowsToList(rows))}>
            Save assumptions
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * The scope assumptions, editable. Starts from the list generated from the
 * answers; once edited, the coordinator's list is what the quote prints, and
 * later answer changes no longer rewrite it (Reset brings the generated one
 * back). Shown and edited in the four groups (`AssumptionList`,
 * `AssumptionEditor`).
 */
export function ScopeAssumptionsCard({
  assumptions,
  edited,
  onChange,
  description,
  canReset = true,
  startEditing = false,
}: {
  assumptions: string[];
  edited: boolean;
  onChange: (assumptions: string[] | null) => void;
  /** Overrides the guided wording (a line-items quote has no answers to generate from). */
  description?: string;
  /** False when there is no generated list to go back to. */
  canReset?: boolean;
  /** Mount already editing (focusing the first row scrolls it into view).
   *  Re-key the card to open it again, e.g. from Before you send. */
  startEditing?: boolean;
}) {
  const [editing, setEditing] = React.useState(startEditing);

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
        {!editing ? (
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
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-3.5" aria-hidden />
              Edit
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="pb-4">
        {editing ? (
          <AssumptionEditor
            initial={assumptions}
            onCancel={() => setEditing(false)}
            onSave={(list) => {
              onChange(list);
              setEditing(false);
            }}
          />
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
