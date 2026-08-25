"use client";

import * as React from "react";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useProposalEstimatorStore } from "@/store/proposal-estimator-store";
import type { ClientQuote } from "@/types/proposal.types";

/**
 * Refresh the stored Zoho stage for the quotes on screen.
 *
 * The stage is a snapshot: it's written when this app imports or pushes a deal,
 * so a move made by sales inside Zoho would otherwise never reach the badge.
 * One batched read on mount keeps it honest whenever someone is actually
 * looking — cheaper and far less machinery than webhooks, which would need a new
 * consent scope and a channel-renewal cron.
 *
 * Deliberately quiet: a CRM read failing in the background is not worth a toast
 * on top of a page the user opened to do something else.
 */
export function useZohoStageRefresh(quotes: ClientQuote[]): void {
  const updateProposal = useProposalEstimatorStore((s) => s.updateProposal);

  // Only linked quotes matter, and the effect must not re-run on every render —
  // key it on the deal ids themselves, not the (fresh each render) array.
  const linked = quotes
    .filter((q) => q.zoho?.deal_id)
    .map((q) => `${q.id}:${q.zoho!.deal_id}`);
  const key = linked.join(",");

  React.useEffect(() => {
    if (!isSupabaseConfigured || !key) return;
    const pairs = key.split(",").map((s) => {
      const [proposalId, dealId] = s.split(":");
      return { proposalId, dealId };
    });
    const ctl = new AbortController();

    void (async () => {
      try {
        const ids = [...new Set(pairs.map((p) => p.dealId))].join(",");
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
        const checkedAt = data.checkedAt ?? new Date().toISOString();

        const quotesNow = useProposalEstimatorStore.getState().proposals;
        for (const { proposalId, dealId } of pairs) {
          const live = stages[dealId];
          if (!live) continue;
          const quote = quotesNow.find((q) => q.id === proposalId);
          // Persist only on an actual change: writing every view would bump
          // `updated_at` and reshuffle a list sorted by it, just for looking.
          if (!quote?.zoho || quote.zoho.stage === live) continue;
          updateProposal(proposalId, {
            zoho: { ...quote.zoho, stage: live, stage_synced_at: checkedAt },
          });
        }
      } catch {
        // Aborted, offline, or Zoho is down — the stored stage still shows.
      }
    })();

    return () => ctl.abort();
  }, [key, updateProposal]);
}
