import type { ProposalZohoLink } from "@/types/proposal.types";

/**
 * The only CRM stages this app is allowed to set, and what triggers each.
 *
 * Deliberately excludes Closed Won / Closed Lost: those are revenue decisions
 * that belong to sales. "Approved" here means the team agreed to start work,
 * which is not the same as a client signing.
 */
export const PUSHABLE_STAGES = {
  /** A quote has been sent to the client (pushes the proposal PDF too). */
  proposalSent: "Proposal Sent",
  /** Delivery finished — the last step of the workflow diagram. */
  projectCompleted: "Project Completed",
} as const;

export type PushableStage =
  (typeof PUSHABLE_STAGES)[keyof typeof PUSHABLE_STAGES];

export function isPushableStage(v: string): v is PushableStage {
  return Object.values(PUSHABLE_STAGES).includes(v as PushableStage);
}

/**
 * Which stages have already been pushed, as `stage -> ISO timestamp`.
 *
 * Folds in the pre-`pushes` fields so quotes pushed before the multi-stage
 * rework aren't offered a duplicate push (which would re-attach their PDF).
 */
export function zohoPushes(
  zoho: ProposalZohoLink | null | undefined,
): Record<string, string> {
  if (!zoho) return {};
  if (zoho.pushes && typeof zoho.pushes === "object") return zoho.pushes;
  if (zoho.pushed_at) {
    // Legacy rows only ever recorded the proposal push.
    return { [zoho.pushed_stage || PUSHABLE_STAGES.proposalSent]: zoho.pushed_at };
  }
  return {};
}

/** Has this exact stage already been pushed for this quote? */
export function hasPushed(
  zoho: ProposalZohoLink | null | undefined,
  stage: PushableStage,
): boolean {
  return Boolean(zohoPushes(zoho)[stage]);
}
