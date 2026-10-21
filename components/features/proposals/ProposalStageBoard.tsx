"use client";

import { useDragScroll } from "@/hooks/useDragScroll";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CircleDashed, GripVertical, Link2Off, Receipt } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { ZohoStageSelect } from "@/components/features/proposals/ZohoStageSelect";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatAmount,
  quotePricing,
} from "@/lib/constants/proposal-estimator";
import { isOverdue } from "@/lib/utils/relative-dates";
import { cn } from "@/lib/utils";
import { moveDealStage, useZohoStages } from "@/lib/zoho/stage-catalog";
import type { ClientQuote } from "@/types/proposal.types";

/**
 * The Estimator as a Zoho-shaped pipeline board.
 *
 * Columns are the org's **own** Deal `Stage` picklist, in Zoho's order, with its
 * probabilities — read through `useZohoStages`, the same source the push route
 * validates against, so a column can never be a stage the server would reject.
 * Dragging a card moves the real deal.
 *
 * Only estimates that exist in THIS app appear. It is not a mirror of the CRM:
 * the rest of that pipeline is sales' business, and rendering those deals would
 * imply this app could act on them.
 *
 * Three rules that keep it honest:
 *
 *  - **Nothing is ever hidden.** A quote whose stage is not in the picklist
 *    (renamed in Zoho, or imported before a change) gets its own column at the
 *    end rather than vanishing from the board.
 *  - **Optimism is local only.** The card moves immediately, but the store — and
 *    therefore Postgres — is written with the stage the server says the deal
 *    SETTLED at. A push can be skipped, and persisting the requested stage
 *    instead is how the badge started lying once before.
 *  - **Unlinked estimates cannot be dragged.** With no `deal_id` there is no
 *    deal to move; they sit in their own column, which is not a drop target.
 */
const UNLINKED = "__unlinked__";

type Column = {
  key: string;
  label: string;
  probability: number | null;
  /** Zoho's `forecast_type` bucket — drives the column's accent, as in the CRM. */
  forecast: string | null;
  droppable: boolean;
  quotes: ClientQuote[];
};

function quoteAmount(q: ClientQuote): number {
  return quotePricing(q).grandAmount;
}

/**
 * The column's accent, keyed to Zoho's own forecast bucket rather than to the
 * stage name — which is what the CRM does, and the reason its board reads at a
 * glance: won columns are green, lost are muted red, everything open is one
 * neutral blue. Names change per org; the three buckets do not.
 */
function accentFor(forecast: string | null): { bar: string; tint: string } {
  const f = (forecast ?? "").toLowerCase();
  if (f.includes("won")) {
    return { bar: "bg-emerald-500", tint: "bg-emerald-500/5" };
  }
  if (f.includes("lost")) {
    return { bar: "bg-rose-400/70", tint: "bg-rose-500/5" };
  }
  if (!f) return { bar: "bg-border", tint: "bg-muted/30" };
  return { bar: "bg-sky-500/70", tint: "bg-sky-500/5" };
}

export function ProposalStageBoard({
  quotes,
  projectName,
  onChanged,
}: {
  quotes: ClientQuote[];
  projectName: (projectId: string | null | undefined) => string | null;
  onChanged: (proposalId: string, stage: string) => void | Promise<void>;
}) {
  const { stages, loading, error } = useZohoStages(true);

  /**
   * Stage moves still in flight, `proposalId → target stage`.
   *
   * Board-local on purpose: it makes the drag feel instant without writing a
   * stage to Postgres that the server may refuse. Cleared when the move
   * settles, at which point the store is written with the REAL stage.
   */
  const [pending, setPending] = React.useState<Record<string, string>>({});
  const [activeId, setActiveId] = React.useState<string | null>(null);
  /**
   * One clock reading for the whole board, taken once.
   *
   * `Date.now()` in a render body is an impure call the React Compiler refuses,
   * and per-card readings could straddle midnight and disagree about which
   * closing dates are late.
   */
  const [now] = React.useState(() => Date.now());

  // 8px before a drag starts, so a tap on a card's link or stage menu is still
  // a click. Same constraint as the task board.
  const panRef = useDragScroll<HTMLDivElement>();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const stageOf = React.useCallback(
    (q: ClientQuote) => pending[q.id] ?? q.zoho?.stage ?? null,
    [pending],
  );

  const columns = React.useMemo<Column[]>(() => {
    const byKey = new Map<string, Column>();

    // Unlinked first: these have not entered the pipeline at all.
    byKey.set(UNLINKED, {
      key: UNLINKED,
      label: "Not in Zoho",
      probability: null,
      forecast: null,
      droppable: false,
      quotes: [],
    });
    for (const s of [...stages].sort((a, b) => a.order - b.order)) {
      byKey.set(s.value, {
        key: s.value,
        label: s.value,
        probability: s.probability,
        forecast: s.forecast,
        droppable: true,
        quotes: [],
      });
    }

    for (const q of quotes) {
      const stage = stageOf(q);
      const key = q.zoho?.deal_id && stage ? stage : UNLINKED;
      let col = byKey.get(key);
      if (!col) {
        // A stage this pipeline no longer lists. Given its own column rather
        // than dropped — an invisible estimate is the worst possible outcome.
        col = {
          key,
          label: key,
          probability: null,
          forecast: null,
          droppable: true,
          quotes: [],
        };
        byKey.set(key, col);
      }
      col.quotes.push(q);
    }

    // An empty "Not in Zoho" is noise; every real stage stays, because a column
    // that is not rendered is a stage you cannot drag into.
    return [...byKey.values()].filter(
      (c) => c.key !== UNLINKED || c.quotes.length > 0,
    );
  }, [quotes, stages, stageOf]);

  const activeQuote = activeId
    ? quotes.find((q) => q.id === activeId)
    : undefined;

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const id = String(e.active.id);
    const target = e.over ? String(e.over.id) : null;
    if (!target || target === UNLINKED) return;

    const quote = quotes.find((q) => q.id === id);
    const dealId = quote?.zoho?.deal_id;
    if (!quote || !dealId) return;
    if (stageOf(quote) === target) return;

    setPending((p) => ({ ...p, [id]: target }));
    try {
      const settled = await moveDealStage(dealId, {
        proposalId: quote.id,
        stage: target,
        // The card moving IS the feedback; a success toast per drag is noise.
        // A refused or held-back move still speaks up.
        quiet: true,
      });
      if (settled) await onChanged(quote.id, settled);
    } catch (err) {
      toast.error("Couldn't move the deal", {
        description: err instanceof Error ? err.message : "Unexpected error.",
      });
    } finally {
      // Always cleared: on failure this snaps the card back to the real stage.
      setPending((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
    }
  }

  if (loading && !stages.length) {
    // A skeleton, not a line of text. The picklist comes from a live Zoho
    // settings read on the first hit of the 30-minute cache, which takes long
    // enough that a single centred sentence where a whole board is about to
    // appear reads as "this page is broken".
    return (
      /* `overflow-x-auto`, matching the real board below — NOT
         `overflow-hidden`. Six 288px columns are ~1800px wide, so while the
         picklist loads the last two were clipped with no scrollbar and no
         way to reach them: the skeleton read as a board that simply ends,
         which is the one thing the real board is styled to avoid. */
      <div
        className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]"
        aria-hidden
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex h-[clamp(26rem,calc(100dvh-14rem),52rem)] w-72 shrink-0 flex-col overflow-hidden rounded-lg border bg-muted/15"
          >
            <div className="h-1 shrink-0 bg-border" />
            <div className="space-y-2 border-b bg-muted/30 px-3 py-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
            {i < 2 ? (
              <div className="space-y-2 p-2">
                <Skeleton className="h-20 w-full" />
                {i === 0 ? <Skeleton className="h-20 w-full" /> : null}
              </div>
            ) : null}
          </div>
        ))}
        <span className="sr-only">Loading the Zoho pipeline…</span>
      </div>
    );
  }
  if (error) {
    return (
      <p className="rounded-md border border-dashed border-destructive/40 px-4 py-8 text-center text-sm text-destructive">
        {error} Switch to the list view to keep working.
      </p>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      /* `pointerWithin`, unlike the task board's `closestCorners`.

         Nothing is sortable here — the only droppables are whole columns — and
         `pointerWithin` resolves to the column the cursor is actually inside,
         which is the same column `isOver` highlights. Corner-distance can
         select a droppable the cursor is NOT inside, so highlight and outcome
         could diverge near a boundary; for a gesture that moves a real CRM
         deal, "what you're pointing at" is the semantic worth guaranteeing.
         Outside every column `over` is null and the drop is ignored.

         (`closestCorners` also passes the drag tests. An earlier wrong-column
         result was an off-viewport drop in the test, not the strategy — don't
         switch back on the strength of that.) */
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={(e) => void handleDragEnd(e)}
      onDragCancel={() => setActiveId(null)}
    >
      {/* An eleven-column pipeline cannot wrap into anything readable, so this
          is the "genuinely cannot wrap" case that earns its own scroller — with
          snap points below md so a swipe lands on a column, not between two.

          The scrollbar is deliberately made VISIBLE. Overlay scrollbars fade
          when idle, and the last column is cut mid-card at most widths, so
          without it the board reads as a board that simply ends. */}
      <div
        ref={panRef}
        className={cn(
          // md:cursor-grab — the empty board pans sideways on a mouse drag
          // (useDragScroll); cards still move by their handles.
          "-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 md:cursor-grab md:snap-none",
          "[scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]",
          "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border",
          "[&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:h-2",
          // A FIXED height sized to the screen, not a minimum: the board stays
          // inside the viewport and each column scrolls on its own, like Zoho's.
          // With a min-height the tallest column set the page height, so a busy
          // Closed Won pushed every other column's header off screen. The clamp
          // keeps it a real board on short windows and stops it sprawling on tall ones.
          "h-[clamp(26rem,calc(100dvh-14rem),52rem)]",
        )}
      >
        {columns.map((col) => (
          <StageColumn
            key={col.key}
            col={col}
            pending={pending}
            projectName={projectName}
            onChanged={onChanged}
            now={now}
          />
        ))}
      </div>
      <p className="mt-1 text-[0.7rem] text-muted-foreground">
        {columns.length} stage{columns.length === 1 ? "" : "s"} — scroll
        sideways for the rest of the pipeline. Drag a card, or use its stage
        menu.
      </p>

      <DragOverlay dropAnimation={null}>
        {activeQuote ? (
          <div className="w-64 rounded-lg border bg-card p-2.5 text-xs opacity-95 shadow-lg">
            <p className="truncate font-medium">{activeQuote.title}</p>
            <p className="mt-0.5 text-muted-foreground tabular-nums">
              {formatAmount(quoteAmount(activeQuote))}
            </p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function StageColumn({
  col,
  pending,
  projectName,
  onChanged,
  now,
}: {
  col: Column;
  pending: Record<string, string>;
  projectName: (projectId: string | null | undefined) => string | null;
  onChanged: (proposalId: string, stage: string) => void | Promise<void>;
  now: number;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: col.key,
    disabled: !col.droppable,
  });
  const total = col.quotes.reduce((s, q) => s + quoteAmount(q), 0);
  const accent = accentFor(col.forecast);

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 snap-start flex-col overflow-hidden rounded-lg border bg-muted/15 transition-colors",
        isOver && col.droppable && "border-primary/60 bg-primary/5",
      )}
      aria-label={`${col.label} — ${col.quotes.length} estimate${
        col.quotes.length === 1 ? "" : "s"
      }`}
    >
      {/* Zoho's header: a bucket-coloured rule, then stage · probability, then
          the money and the count. */}
      <div className={cn("h-1 shrink-0", accent.bar)} aria-hidden />
      <header className={cn("shrink-0 border-b px-3 py-2", accent.tint)}>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="min-w-0 truncate text-xs font-semibold">
            {col.label}
          </h3>
          {col.probability !== null ? (
            <span className="shrink-0 text-[0.7rem] text-muted-foreground tabular-nums">
              {col.probability}%
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 flex items-baseline justify-between gap-2">
          <span className="truncate text-[0.95rem] font-semibold tabular-nums">
            {formatAmount(total)}
          </span>
          <span className="shrink-0 text-[0.7rem] text-muted-foreground">
            {col.quotes.length} estimate{col.quotes.length === 1 ? "" : "s"}
          </span>
        </div>
      </header>

      {/* `min-h-0` lets this flex child shrink below its content so it scrolls;
          without it the list grows the column instead. */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2 [scrollbar-gutter:stable]">
        {col.quotes.length === 0 ? (
          <p className="px-1 py-6 text-center text-[0.7rem] text-muted-foreground">
            {col.droppable ? "Drop an estimate here" : "Nothing here"}
          </p>
        ) : (
          col.quotes.map((q) => (
            <StageCard
              key={q.id}
              quote={q}
              projectLabel={projectName(q.project_id)}
              moving={Boolean(pending[q.id])}
              onChanged={onChanged}
              now={now}
            />
          ))
        )}
      </div>
    </section>
  );
}

function StageCard({
  quote,
  projectLabel,
  moving,
  onChanged,
  now,
}: {
  quote: ClientQuote;
  projectLabel: string | null;
  moving: boolean;
  onChanged: (proposalId: string, stage: string) => void | Promise<void>;
  now: number;
}) {
  const dealId = quote.zoho?.deal_id ?? null;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: quote.id,
    // No deal means no stage to move it to.
    disabled: !dealId,
  });

  // The CRM's own words where we have them, ours where we don't. Zoho's card
  // reads deal → account → contact → amount → closing date, and someone who
  // works the pipeline there is scanning for exactly those five.
  const client = quote.zoho?.account ?? quote.client_name ?? null;
  const contact = quote.zoho?.contact ?? null;
  const closing = quote.zoho?.closing_date ?? null;
  // Red is Zoho's own treatment for a closing date that has passed. Uses the
  // shared calendar-day comparison, never `new Date(iso) < now` — a DATE column
  // parsed that way is UTC midnight and reads as overdue a day early.
  const closingLate = closing ? isOverdue(closing, now) : false;

  return (
    <article
      ref={setNodeRef}
      className={cn(
        "group rounded-md border bg-card px-2.5 py-2 shadow-sm transition-opacity",
        isDragging && "opacity-40",
        moving && "animate-pulse",
      )}
    >
      <div className="flex items-start gap-1.5">
        {dealId ? (
          // A handle rather than the whole card: the card carries a link and a
          // menu, and a drag surface wrapped around those swallows their taps.
          <button
            type="button"
            className="-ml-1 mt-px shrink-0 cursor-grab touch-none rounded p-0.5 text-muted-foreground/50 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
            aria-label={`Drag ${quote.title} to another stage`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-3.5" aria-hidden />
          </button>
        ) : (
          <Link2Off
            className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
            aria-label="Not linked to a Zoho deal"
          />
        )}
        <div className="min-w-0 flex-1 space-y-px">
          <Link
            href={`/proposals/${quote.id}`}
            className="block truncate text-xs font-medium underline-offset-2 hover:underline"
          >
            {quote.zoho?.deal_name ?? quote.title}
          </Link>
          {client ? (
            <p className="truncate text-[0.7rem] text-muted-foreground">
              {client}
            </p>
          ) : null}
          {contact ? (
            <p className="truncate text-[0.7rem] text-muted-foreground">
              {contact}
            </p>
          ) : null}
          <p className="pt-0.5 text-xs font-semibold tabular-nums">
            {formatAmount(quoteAmount(quote))}
          </p>
        </div>
      </div>

      {/* Zoho's footer line: the closing date on the left, a small control on
          the right. Ours is the stage menu — the touch and keyboard path to the
          move that dragging gives a mouse. */}
      <div className="mt-1 flex items-end justify-between gap-2 pl-5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
          {closing ? (
            <span
              className={cn(
                "text-[0.7rem] tabular-nums",
                closingLate
                  ? "font-medium text-rose-600 dark:text-rose-400"
                  : "text-muted-foreground",
              )}
              title={
                closingLate
                  ? `Closing date ${closing} has passed`
                  : `Closes ${closing}`
              }
            >
              {closing}
            </span>
          ) : null}
          {quote.pbs?.po_no ? (
            <Badge
              variant="outline"
              className="h-4 gap-1 border-emerald-500/30 bg-emerald-500/10 px-1 text-[0.65rem] font-normal text-emerald-700 tabular-nums dark:text-emerald-400"
              title={`Purchase order ${quote.pbs.po_no} in PBS`}
            >
              <Receipt className="size-2.5" aria-hidden />
              {quote.pbs.po_no}
            </Badge>
          ) : null}
          {projectLabel ? (
            <Badge
              variant="outline"
              className="h-4 max-w-28 truncate px-1 text-[0.65rem] font-normal"
              title={`Project: ${projectLabel}`}
            >
              {projectLabel}
            </Badge>
          ) : null}
        </div>

        {dealId && quote.zoho?.stage ? (
          <ZohoStageSelect
            compact
            dealId={dealId}
            proposalId={quote.id}
            stage={quote.zoho.stage}
            syncedAt={quote.zoho.stage_synced_at ?? quote.zoho.imported_at}
            onChanged={(next) => onChanged(quote.id, next)}
          />
        ) : (
          <span
            className="shrink-0 text-muted-foreground"
            title="Link a Zoho deal to move this through the pipeline"
          >
            <CircleDashed className="size-3" aria-hidden />
            <span className="sr-only">Not linked to a Zoho deal</span>
          </span>
        )}
      </div>
    </article>
  );
}
