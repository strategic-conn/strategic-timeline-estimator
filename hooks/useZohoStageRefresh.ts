"use client";

import * as React from "react";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useProposalEstimatorStore } from "@/store/proposal-estimator-store";
import type { ClientQuote } from "@/types/proposal.types";

/** How long a checked stage is trusted before it's worth re-reading. */
const STAGE_TTL_MS = 5 * 60 * 1000;

/**
 * When each deal was last checked, for this tab only.
 *
 * Deliberately NOT `zoho.stage_synced_at`: that is only written when the stage
 * actually CHANGED (persisting every check would bump `updated_at` and reshuffle
 * a list sorted by it), so an unchanged deal would look permanently stale and be
 * re-fetched on every visit. Module scope survives client-side navigation, so
 * hopping list → estimate → list costs nothing; a real page load starts fresh,
 * which is exactly when a re-check is wanted.
 */
const checkedAt = new Map<string, number>();

/**
 * Refresh the stored Zoho stage for the quotes on screen.
 *
 * The stage is a snapshot: it's written when this app imports or pushes a deal,
 * so a move made by sales inside Zoho would otherwise never reach the badge.
 * Re-reading it when someone opens the list or an estimate keeps it honest —
 * cheaper, and far less machinery, than webhooks (a new consent scope plus a
 * channel-renewal cron).
 *
 * Deliberately quiet: a CRM read failing in the background is not worth a toast
 * on top of a page the user opened to do something else.
 */
export function useZohoStageRefresh(quotes: ClientQuote[]): void {
  const updateProposal = useProposalEstimatorStore((s) => s.updateProposal);

  // Every linked quote, as a stable string. Keying the effect on the ids rather
  // than the array keeps it from re-running on every render, and leaves render
  // itself pure — which staleness can't be, since it reads the clock.
  const key = quotes
    .filter((q) => q.zoho?.deal_id)
    .map((q) => `${q.id}:${q.zoho!.deal_id}`)
    .join(",");

  React.useEffect(() => {
    if (!isSupabaseConfigured || !key) return;

    const pairs = key.split(",").map((s) => {
      const [proposalId, dealId] = s.split(":");
      return { proposalId, dealId };
    });
    // The route spends one Zoho call per deal (no by-ids read on our scopes),
    // so re-reading all 25 every time someone opens the list would burn API
    // credit to re-learn what it already knows.
    const now = Date.now();
    const due = pairs.filter(
      ({ dealId }) => now - (checkedAt.get(dealId) ?? 0) > STAGE_TTL_MS,
    );
    if (!due.length) return;

    const ctl = new AbortController();
    void (async () => {
      try {
        const ids = [...new Set(due.map((p) => p.dealId))].join(",");
        const res = await fetch(
          `/api/zoho/deals/stages?ids=${encodeURIComponent(ids)}`,
          { signal: ctl.signal },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          stages?: Record<string, string | null>;
          checkedAt?: string;
        };
        const stages = data.stages ?? {};
        const syncedAt = data.checkedAt ?? new Date().toISOString();
        // Mark every id we asked about, including ones whose stage was
        // unchanged — that is the whole point of the throttle.
        for (const { dealId } of due) checkedAt.set(dealId, Date.now());

        const quotesNow = useProposalEstimatorStore.getState().proposals;
        for (const { proposalId, dealId } of due) {
          const live = stages[dealId];
          if (!live) continue;
          const quote = quotesNow.find((q) => q.id === proposalId);
          // Persist only on an actual change: writing every check would bump
          // `updated_at` and reshuffle a list sorted by it, just for looking.
          if (!quote?.zoho || quote.zoho.stage === live) continue;
          updateProposal(proposalId, {
            zoho: { ...quote.zoho, stage: live, stage_synced_at: syncedAt },
          });
        }
      } catch {
        // Aborted, offline, or Zoho is down — the stored stage still shows.
      }
    })();

    return () => ctl.abort();
  }, [key, updateProposal]);
}
