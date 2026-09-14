"use client";

import { ArrowLeftRight, Check, ChevronDown, Loader2 } from "lucide-react";
import * as React from "react";

import { ZohoStageBadge } from "@/components/features/proposals/ZohoStageBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { moveDealStage, useZohoStages } from "@/lib/zoho/stage-catalog";

/**
 * Move a linked deal through the Zoho pipeline without leaving the app.
 *
 * The stage list comes from the org's own picklist rather than a list hardcoded
 * here — the push route validates against exactly the same source, so the menu
 * can't offer something the server then rejects. Order and probability are
 * Zoho's; a pipeline that gains a stage gains it here too.
 *
 * No confirmation step: a stage is reversible in Zoho, unlike the PO this can
 * unlock. The irreversible half has its own dialog.
 *
 * The picklist and the move itself live in `lib/zoho/stage-catalog.ts`, shared
 * with the stage board — one settle rule, one cache.
 */
export function ZohoStageSelect({
  dealId,
  proposalId,
  stage,
  syncedAt,
  onChanged,
  compact = false,
}: {
  dealId: string;
  proposalId: string;
  stage: string;
  syncedAt?: string | null;
  onChanged: (stage: string) => void | Promise<void>;
  /**
   * Render just an icon instead of the stage badge.
   *
   * For the pipeline board, where the COLUMN already states the stage and a
   * badge on every card would repeat it N times. The control still has to be
   * there — dragging is pointer-only, so this is the touch and keyboard path.
   */
  compact?: boolean;
}) {
  const { stages, loading, error, load } = useZohoStages();
  const [busy, setBusy] = React.useState<string | null>(null);

  const move = async (next: string) => {
    if (next === stage || busy) return;
    setBusy(next);
    try {
      // Returns where the deal ACTUALLY landed — a skipped push leaves it put.
      const settled = await moveDealStage(dealId, { proposalId, stage: next });
      if (settled) await onChanged(settled);
    } finally {
      setBusy(null);
    }
  };

  return (
    <DropdownMenu onOpenChange={(open) => open && load()}>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex items-center rounded transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50",
          compact
            ? "size-5 justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
            : "gap-0.5",
        )}
        aria-label={`Deal stage: ${stage}. Change it in Zoho.`}
        title={compact ? `Stage: ${stage} — move it in Zoho` : undefined}
        disabled={Boolean(busy)}
      >
        {compact ? null : (
          <ZohoStageBadge stage={stage} syncedAt={syncedAt} className="h-5 py-0" />
        )}
        {busy ? (
          <Loader2 className="size-3 animate-spin text-muted-foreground" aria-hidden />
        ) : compact ? (
          <ArrowLeftRight className="size-3" aria-hidden />
        ) : (
          <ChevronDown className="size-3 text-muted-foreground" aria-hidden />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-60 overflow-y-auto">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Move this deal in Zoho
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {loading ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">Loading stages…</p>
        ) : error ? (
          <p className="px-2 py-1.5 text-xs text-destructive">{error}</p>
        ) : stages.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            No stages returned.
          </p>
        ) : (
          stages.map((s) => (
            <DropdownMenuItem
              key={s.value}
              className="gap-2 text-xs"
              onSelect={() => void move(s.value)}
            >
              <Check
                className={cn(
                  "size-3 shrink-0",
                  s.value === stage ? "opacity-100" : "opacity-0",
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{s.value}</span>
              {s.probability !== null ? (
                <span className="shrink-0 text-[0.7rem] text-muted-foreground">
                  {s.probability}%
                </span>
              ) : null}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
