"use client";

import * as React from "react";
import { toast } from "sonner";

import { requestStagePush } from "@/lib/zoho/push-state";

/**
 * The org's Deal `Stage` picklist, and the one way to move a deal along it.
 *
 * Extracted from `ZohoStageSelect` when the stage BOARD arrived: two surfaces
 * that move deals must not each carry their own copy of the settle rule below.
 * Getting that rule wrong is not cosmetic — it already shipped once as "the
 * badge shows a stage the deal never reached", because the store's
 * write-through then persisted the lie over the server's correct value.
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

/**
 * The picklist, loaded on demand.
 *
 * @param eager Load on mount instead of waiting for `load()`. The dropdown
 *   defers until it opens; the board needs its columns immediately.
 */
export function useZohoStages(eager = false) {
  const [stages, setStages] = React.useState<ZohoStage[]>(cache ?? []);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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
        // Cleared so a later attempt refetches rather than awaiting a settled
        // rejected promise forever.
        inFlight = null;
        setError(e instanceof Error ? e.message : "Couldn't read the Zoho stages.");
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    if (eager) load();
  }, [eager, load]);

  return { stages, loading, error, load };
}

/**
 * Move one deal to `stage` in Zoho and report where it ACTUALLY ended up.
 *
 * Returns the settled stage, or `null` when nothing should be recorded (the
 * request failed, or the route couldn't read the deal). Callers persist the
 * return value — never the stage they asked for.
 *
 * ⚠️ That distinction is the whole point. A push can be **skipped**: the route
 * holds the stage back and reports `currentStage` instead. Writing the
 * requested stage there makes the badge lie, and the store's optimistic
 * write-through persists that lie over the value the server just recorded.
 */
export async function moveDealStage(
  dealId: string,
  input: { proposalId: string; stage: string; quiet?: boolean },
): Promise<string | null> {
  const res = await requestStagePush(dealId, {
    proposalId: input.proposalId,
    stage: input.stage,
    // A person picked this exact stage — by menu or by dragging the card — so
    // the forward-only rule that guards side-effect pushes does not apply.
    // Moving a deal back down the pipeline is a legitimate thing to ask for.
    explicit: true,
  });

  if (res.error) {
    toast.error("Zoho didn't accept the stage change", { description: res.error });
    return null;
  }
  if (!input.quiet) {
    if (res.moved) toast.success(`Deal moved to ${input.stage}`);
    else if (res.stageAlreadySet) toast.info(`Deal was already at ${input.stage}`);
    else if (res.skipped && res.currentStage) {
      toast.info(`Deal left at ${res.currentStage}`);
    }
  } else if (res.skipped && res.currentStage) {
    // Never silent: the card is about to snap back, and without this it would
    // look like the drag simply failed to register.
    toast.info(`Deal left at ${res.currentStage}`);
  }
  for (const w of res.warnings ?? []) toast.warning(w);

  return res.moved || res.stageAlreadySet ? input.stage : (res.currentStage ?? null);
}
