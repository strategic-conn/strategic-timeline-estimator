"use client";

import * as React from "react";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useProposalEstimatorStore } from "@/store/proposal-estimator-store";
import type { ClientQuote } from "@/types/proposal.types";

/** Per-tab throttle, same reasoning as the Zoho stage refresh. */
const checkedAt = new Map<string, number>();
const TTL_MS = 5 * 60 * 1000;

/** Mirrors the `.slice(0, 25)` in `app/api/pbs/pos/route.ts`. */
const ROUTE_MAX_IDS = 25;

/**
 * Refresh the PBS state of POs these estimates are already linked to.
 *
 * The PBS→app direction. A purchase order keeps moving after this app creates
 * it — five status codes appear in live history — and there is no webhook, so
 * without this the app shows whatever was true at creation, forever.
 *
 * Safe to apply automatically **because it is keyed on the stored `po_id`**, not
 * on a name. That distinction is the whole design: linking an *unlinked*
 * estimate stays a human decision (a title is not an identifier), while
 * refreshing an *already linked* PO is an exact read with nothing to get wrong.
 *
 * Quiet by design: a billing read failing in the background is not worth a
 * toast on a page opened to do something else, and the stored status still
 * shows.
 */
export function usePbsPoRefresh(quotes: ClientQuote[]) {
  const updateProposal = useProposalEstimatorStore((s) => s.updateProposal);

  // Only estimates with a PO recorded. Keyed as a string so the effect doesn't
  // re-run every render, and so render itself stays pure.
  const key = quotes
    .filter((q) => q.pbs?.po_id)
    .map((q) => q.id)
    .join(",");

  React.useEffect(() => {
    if (!isSupabaseConfigured || !key) return;
    const now = Date.now();
    // Capped to what the route will answer for: every id asked about is marked
    // checked below, so anything past the server's limit would be marked
    // without being read and would never refresh. The rest stays due.
    const due = key
      .split(",")
      .filter((id) => now - (checkedAt.get(id) ?? 0) > TTL_MS)
      .slice(0, ROUTE_MAX_IDS);
    if (!due.length) return;

    const ctl = new AbortController();
    void (async () => {
      try {
        const res = await fetch(
          `/api/pbs/pos?proposalIds=${encodeURIComponent(due.join(","))}`,
          { signal: ctl.signal },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          live?: Record<
            string,
            { po_no?: string | null; status?: string | null; missing?: boolean } | null
          >;
          checkedAt?: string;
        };
        // Mark everything asked about — that is the throttle. Entries the server
        // omitted are reads that failed, and retrying them on the next render
        // would hammer a system that is already unhappy.
        for (const id of due) checkedAt.set(id, Date.now());
        const syncedAt = data.checkedAt ?? new Date().toISOString();

        const quotesNow = useProposalEstimatorStore.getState().proposals;
        for (const [proposalId, po] of Object.entries(data.live ?? {})) {
          if (!po) continue;
          const quote = quotesNow.find((q) => q.id === proposalId);
          if (!quote?.pbs) continue;
          const status = po.missing ? null : (po.status ?? null);
          const missing = Boolean(po.missing);
          // Persist only on an actual change: writing every check would bump
          // `updated_at` and reshuffle a list sorted by it, just for looking.
          if (quote.pbs.status === status && Boolean(quote.pbs.missing) === missing) {
            continue;
          }
          updateProposal(proposalId, {
            pbs: { ...quote.pbs, status, missing, status_synced_at: syncedAt },
          });
        }
      } catch {
        // Aborted, offline, or PBS down — the stored status still shows.
      }
    })();
    return () => ctl.abort();
  }, [key, updateProposal]);
}
