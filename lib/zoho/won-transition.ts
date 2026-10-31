"use client";

import { notifyUsers, pushWorkspaceActivity } from "@/lib/activity/workspace-push";
import { looksWon } from "@/lib/zoho/push-state";
import { useProposalEstimatorStore } from "@/store/proposal-estimator-store";
import { useTeamStore } from "@/store/team-store";
import type { ClientQuote } from "@/types/proposal.types";

/**
 * What happens when a deal becomes won — wherever the move came from.
 *
 * ⚠️ This lived inline in `useZohoStageRefresh`, so only the **poll** ran it.
 * Moving a deal to Closed Won from inside the app — the status changer, and
 * then the whole point of the stage board — wrote the stage and nothing else,
 * leaving the estimate `draft` with no **Start project**. Found live on an
 * estimate that already had a PO raised against it.
 *
 * Split in two on purpose. The **promotion** has to travel in the same store
 * write as the stage (see `applyDealStage` — two writes race and the wider one
 * reverts the narrower), while the **announcement** is a separate side effect
 * with no ordering constraint.
 */

/**
 * Does this stage change win the deal, on a quote that can still be approved?
 *
 * Only the TRANSITION counts: re-reading a deal that was already won must not
 * re-promote a quote somebody has since rejected, nor re-announce it on every
 * page open.
 */
export function shouldPromoteOnWin(quote: ClientQuote, nextStage: string): boolean {
  if (!isWinTransition(quote, nextStage)) return false;
  // A REJECTED estimate stays rejected — that was a deliberate call about this
  // quote, and a won deal shouldn't silently reverse it.
  return quote.status === "draft" || quote.status === "sent";
}

function isWinTransition(quote: ClientQuote, nextStage: string): boolean {
  return looksWon(nextStage) && !looksWon(quote.zoho?.stage);
}

/**
 * Log the win and tell the people who can act on it.
 *
 * @param observed `true` when a background read noticed sales' change, `false`
 *   when someone in this app did it. It changes only the wording and whether
 *   the actor hears about their own action.
 */
export function announceWin(
  quote: ClientQuote,
  nextStage: string,
  { observed }: { observed: boolean },
): void {
  if (!isWinTransition(quote, nextStage)) return;

  const href = `/proposals/${quote.id}`;
  const label = quote.title || quote.zoho?.deal_name || "this estimate";

  // Past-tense verb phrase: the store prefixes the actor and lower-cases the
  // first word, so a summary starting with a proper noun renders as
  // "Daniel zoho deal won".
  pushWorkspaceActivity(
    observed
      ? `synced "${label}" from Zoho — the deal is won, ready to bill and start`
      : `moved "${label}" to ${nextStage} in Zoho — ready to bill and start`,
    href,
  );

  // Admins and managers — the tier the Estimator is gated to anyway.
  // `includeSelf` only when this session merely NOTICED: sales moved the deal
  // and nobody here did anything, so excluding the observer would leave a lone
  // admin with no notification at all. When a person in this app made the move,
  // the usual "don't notify the actor" rule applies.
  notifyUsers(
    useTeamStore
      .getState()
      .members.filter((m) => m.role === "admin" || m.role === "manager")
      .map((m) => m.id),
    observed
      ? `"${label}" is at ${nextStage} in Zoho — ready to raise the PO and start the project`
      : `"${label}" was moved to ${nextStage} — ready to raise the PO and start the project`,
    href,
    null,
    { includeSelf: observed, email: true },
  );
}

/**
 * Record a stage a human just moved a deal to, and apply the win if it is one.
 *
 * The call both in-app surfaces make — the Estimator's stage board and the
 * editor's Setup panel — so the two cannot drift apart again. `stage` must be
 * the stage the deal SETTLED at: `moveDealStage` resolves that, because a push
 * can be held back and reports where the deal really is.
 */
export function recordStageChange(quote: ClientQuote, stage: string): void {
  if (!quote.zoho) return;
  // One write, carrying the stage and the promotion together.
  useProposalEstimatorStore.getState().applyDealStage(quote.id, {
    stage,
    approve: shouldPromoteOnWin(quote, stage),
  });
  announceWin(quote, stage, { observed: false });
}
