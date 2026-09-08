"use client";

import * as React from "react";
import { toast } from "sonner";

import { notifyUsers, pushWorkspaceActivity } from "@/lib/activity/workspace-push";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { looksWon } from "@/lib/zoho/push-state";
import { useProposalEstimatorStore } from "@/store/proposal-estimator-store";
import { useTeamStore } from "@/store/team-store";
import type { ClientQuote } from "@/types/proposal.types";

/** How long a checked stage is trusted before it's worth re-reading. */
const STAGE_TTL_MS = 5 * 60 * 1000;

/** Mirrors `MAX_IDS` in `app/api/zoho/deals/stages/route.ts`. */
const ROUTE_MAX_IDS = 25;

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

type Pair = { proposalId: string; dealId: string };

/**
 * Refresh the stored Zoho stage AND amount for the quotes on screen.
 *
 * Both are snapshots: they're written when this app imports or pushes a deal, so
 * a change made by sales inside Zoho — a stage move, or a repriced Packages row
 * — would otherwise never reach the badge.
 * Re-reading it when someone opens the list or an estimate keeps it honest —
 * cheaper, and far less machinery, than webhooks (a new consent scope plus a
 * channel-renewal cron).
 *
 * The automatic pass is deliberately quiet: a CRM read failing in the background
 * is not worth a toast on a page opened to do something else. `refresh()` is the
 * opposite — someone asked, so it ignores the throttle and always reports.
 */
export function useZohoStageRefresh(quotes: ClientQuote[]) {
  const updateProposal = useProposalEstimatorStore((s) => s.updateProposal);
  const setProposalStatus = useProposalEstimatorStore((s) => s.setProposalStatus);
  const [refreshing, setRefreshing] = React.useState(false);

  // Every linked quote, as a stable string. Keying the effect on the ids rather
  // than the array keeps it from re-running on every render, and leaves render
  // itself pure — which staleness can't be, since it reads the clock.
  const key = quotes
    .filter((q) => q.zoho?.deal_id)
    .map((q) => `${q.id}:${q.zoho!.deal_id}`)
    .join(",");

  /** Returns how many stored stages actually changed, or null if nothing ran. */
  const run = React.useCallback(
    async (force: boolean, signal?: AbortSignal): Promise<number | null> => {
      if (!isSupabaseConfigured || !key) return null;
      const pairs: Pair[] = key.split(",").map((s) => {
        const [proposalId, dealId] = s.split(":");
        return { proposalId, dealId };
      });
      // The route spends one Zoho call per deal (no by-ids read on our scopes),
      // so the automatic pass skips anything checked recently. A manual refresh
      // is an explicit ask and ignores that.
      const now = Date.now();
      const dueAll = force
        ? pairs
        : pairs.filter(
            ({ dealId }) => now - (checkedAt.get(dealId) ?? 0) > STAGE_TTL_MS,
          );
      // The route answers for at most MAX_IDS deals and silently drops the
      // rest — but every id asked about gets marked checked below, so anything
      // past the cap would be marked without ever being read and would then
      // never refresh at all. Ask only for what will come back; the remainder
      // is still due on the next pass.
      const due = dueAll.slice(0, ROUTE_MAX_IDS);
      if (!due.length) return 0;

      const ids = [...new Set(due.map((p) => p.dealId))].join(",");
      const res = await fetch(
        `/api/zoho/deals/stages?ids=${encodeURIComponent(ids)}`,
        { signal },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Couldn't reach Zoho (${res.status}).`);
      }
      const data = (await res.json()) as {
        stages?: Record<string, string | null>;
        amounts?: Record<string, number | null>;
        checkedAt?: string;
      };
      const stages = data.stages ?? {};
      const amounts = data.amounts ?? {};
      const syncedAt = data.checkedAt ?? new Date().toISOString();
      // Mark every id we asked about, including ones whose stage was unchanged
      // — that is the whole point of the throttle.
      for (const { dealId } of due) checkedAt.set(dealId, Date.now());

      const quotesNow = useProposalEstimatorStore.getState().proposals;
      let changed = 0;
      for (const { proposalId, dealId } of due) {
        const live = stages[dealId];
        const liveAmount = amounts[dealId];
        const quote = quotesNow.find((q) => q.id === proposalId);
        if (!quote?.zoho) continue;

        // Persist only on an actual change: writing every check would bump
        // `updated_at` and reshuffle a list sorted by it, just for looking.
        const stageChanged = Boolean(live) && quote.zoho.stage !== live;
        // The other half of the Zoho→app direction. Zoho derives `Amount` from
        // the Packages subform, so this is how an edit made *in the CRM* — a
        // repriced row, a package added by sales — reaches the app at all.
        // Stored, not applied: it never rewrites the estimate's line items,
        // which are this app's own source of truth. The two are shown side by
        // side so a divergence is visible instead of silently resolved.
        const amountChanged =
          typeof liveAmount === "number" && quote.zoho.amount !== liveAmount;
        if (!stageChanged && !amountChanged) continue;

        updateProposal(proposalId, {
          zoho: {
            ...quote.zoho,
            ...(stageChanged ? { stage: live, stage_synced_at: syncedAt } : {}),
            ...(amountChanged ? { amount: liveAmount } : {}),
          },
        });
        changed += 1;
        if (!stageChanged || !live) continue;

        // A deal reaching the won stage is the trigger for billing, and this
        // poll is the only way the app hears about it — sales moves the deal in
        // Zoho, and there is no webhook. Announce it once, on the transition,
        // so the "Create PO" button that just appeared is not a surprise.
        if (looksWon(live) && !looksWon(quote.zoho.stage)) {
          const href = `/proposals/${proposalId}`;
          const label = quote.title || quote.zoho.deal_name || "this estimate";

          // Winning the deal IS the approval, so stop making someone remember to
          // say so twice: promoting the status here is what puts "Start project"
          // beside "Create PO". Only from draft/sent — a REJECTED estimate stays
          // rejected, because that was a deliberate call about this quote and a
          // won deal on the same account shouldn't silently reverse it.
          if (quote.status === "draft" || quote.status === "sent") {
            setProposalStatus(proposalId, "approved");
          }
          // Past-tense verb phrase: the store prefixes the actor and lower-cases
          // the first word, so a summary starting with a proper noun renders as
          // "Daniel zoho deal won". "Synced" is also the honest verb — sales
          // moved the deal, this session is what noticed.
          pushWorkspaceActivity(
            `synced "${label}" from Zoho — the deal is won, ready to bill and start`,
            href,
          );
          // Everyone who can act on it — admins and managers, the tier the
          // Estimator is gated to anyway. `includeSelf` because nobody here
          // DID anything: sales moved the deal in Zoho and this session merely
          // noticed. Excluding the observer would leave a lone admin with no
          // notification at all.
          notifyUsers(
            useTeamStore
              .getState()
              .members.filter((m) => m.role === "admin" || m.role === "manager")
              .map((m) => m.id),
            `"${label}" is at ${live} in Zoho — ready to raise the PO and start the project`,
            href,
            null,
            { includeSelf: true },
          );
        }
      }
      return changed;
    },
    [key, updateProposal, setProposalStatus],
  );

  React.useEffect(() => {
    const ctl = new AbortController();
    void run(false, ctl.signal).catch(() => {
      // Aborted, offline, or Zoho is down — the stored stage still shows.
    });
    return () => ctl.abort();
  }, [run]);

  /** Manual re-check: ignores the throttle and always says what happened. */
  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const changed = await run(true);
      if (changed === null) return;
      toast.success(
        changed
          ? `${changed} deal${changed === 1 ? "" : "s"} updated from Zoho`
          : "Deals are up to date with Zoho",
      );
    } catch (e) {
      toast.error("Couldn't refresh from Zoho", {
        description: e instanceof Error ? e.message : "Unexpected error.",
      });
    } finally {
      setRefreshing(false);
    }
  }, [run]);

  return { refreshing, refresh, linkedCount: key ? key.split(",").length : 0 };
}
