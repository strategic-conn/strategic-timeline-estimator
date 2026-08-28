"use client";

import { Check, ChevronDown, Loader2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

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
import { requestStagePush } from "@/lib/zoho/push-state";

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
 */
export type ZohoStage = {
  value: string;
  order: number;
  forecast: string | null;
  probability: number | null;
};

// Module-scoped, like the PBS directory: the picklist is org configuration that
// changes about never, and every estimate would otherwise re-read it.
let cache: ZohoStage[] | null = null;
let inFlight: Promise<ZohoStage[]> | null = null;

async function fetchStages(): Promise<ZohoStage[]> {
  const res = await fetch("/api/zoho/deal-stages");
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Couldn't read the Zoho stages.");
  return (data?.stages ?? []) as ZohoStage[];
}

export function ZohoStageSelect({
  dealId,
  proposalId,
  stage,
  syncedAt,
  onChanged,
}: {
  dealId: string;
  proposalId: string;
  stage: string;
  syncedAt?: string | null;
  onChanged: (stage: string) => void | Promise<void>;
}) {
  const [stages, setStages] = React.useState<ZohoStage[]>(cache ?? []);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    if (cache) {
      setStages(cache);
      return;
    }
    setLoading(true);
    setError(null);
    inFlight ??= fetchStages();
    void inFlight
      .then((s) => {
        cache = s;
        setStages(s);
      })
      .catch((e: unknown) => {
        inFlight = null;
        setError(e instanceof Error ? e.message : "Couldn't read the Zoho stages.");
      })
      .finally(() => setLoading(false));
  }, []);

  const move = async (next: string) => {
    if (next === stage || busy) return;
    setBusy(next);
    try {
      const res = await requestStagePush(dealId, { proposalId, stage: next });
      if (res.error) {
        toast.error("Zoho didn't accept the stage change", {
          description: res.error,
        });
        return;
      }
      if (res.moved) {
        toast.success(`Deal moved to ${next}`);
      } else if (res.stageAlreadySet) {
        toast.info(`Deal was already at ${next}`);
      } else if (res.skipped && res.currentStage) {
        toast.info(`Deal left at ${res.currentStage}`);
      }
      for (const w of res.warnings ?? []) toast.warning(w);
      // We know what it moved to, so write that rather than paying another
      // round-trip to read back a value we just set.
      await onChanged(next);
    } finally {
      setBusy(null);
    }
  };

  return (
    <DropdownMenu onOpenChange={(open) => open && load()}>
      <DropdownMenuTrigger
        className="inline-flex items-center gap-0.5 rounded transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
        aria-label={`Deal stage: ${stage}. Change it in Zoho.`}
        disabled={Boolean(busy)}
      >
        <ZohoStageBadge stage={stage} syncedAt={syncedAt} className="h-5 py-0" />
        {busy ? (
          <Loader2 className="size-3 animate-spin text-muted-foreground" aria-hidden />
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
