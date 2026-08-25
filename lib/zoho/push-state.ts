import type { ProposalZohoLink } from "@/types/proposal.types";

/**
 * The only CRM stages this app is allowed to set, and what triggers each.
 *
 * Deliberately excludes Closed Won / Closed Lost: those are revenue decisions
 * that belong to sales. "Approved" here means the team agreed to start work,
 * which is not the same as a client signing.
 */
export const PUSHABLE_STAGES = {
  /** Scoping has started — set when a deal is imported into an estimate. */
  discovery: "Discovery",
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
 * For stages this app sets as a SIDE EFFECT of another action (importing a deal
 * into an estimate moves it to Discovery), the only stages it may advance FROM.
 *
 * A deal further along — Negotiation, Verbal Yes, a proposal already sent — must
 * never be dragged backwards by an import: that would rewrite sales' pipeline.
 * A stage we don't recognise is left alone for the same reason. Stages set by an
 * explicit button aren't listed here; a human clicking "Push to Zoho" IS the
 * authorisation.
 *
 * ponytail: static predecessor list. If the pipeline gains stages before
 * Discovery, read the org's own Stage picklist order (settings.READ) instead.
 */
export const AUTO_ADVANCE_FROM: Partial<
  Record<PushableStage, readonly string[]>
> = {
  [PUSHABLE_STAGES.discovery]: ["Proposal Requested"],
};

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

export type StagePushResult = {
  /** The deal's stage was actually changed. */
  moved: boolean;
  /** Left untouched on purpose (further along already, or an unknown stage). */
  skipped?: boolean;
  /** The deal's stage in Zoho as of this request. */
  currentStage?: string | null;
  alreadyPushed?: boolean;
  warnings?: string[];
  error?: string;
};

/**
 * POST a stage move (optionally with a file) to the push route. Shared by every
 * caller so the request shape and error handling live in one place; the route
 * re-checks the whitelist, the advance guard, and idempotency server-side
 * regardless of what the client sends.
 */
export async function requestStagePush(
  dealId: string,
  input: {
    proposalId: string;
    stage: PushableStage;
    file?: Blob;
    filename?: string;
  },
): Promise<StagePushResult> {
  const form = new FormData();
  form.append("proposalId", input.proposalId);
  form.append("stage", input.stage);
  if (input.file) {
    form.append("file", input.file, input.filename ?? "proposal.pdf");
  }
  const send = async () => {
    const res = await fetch(
      `/api/zoho/deals/${encodeURIComponent(dealId)}/push`,
      { method: "POST", body: form },
    );
    return { res, data: await res.json().catch(() => null) };
  };
  try {
    let { res, data } = await send();
    // The quote row can still be in flight: createProposal returns its id
    // optimistically and INSERTs in the background, so a push fired right after
    // an import can beat it and 404. Retrying once is safe — the route reads the
    // row BEFORE it touches Zoho, so a 404 means nothing was sent to the CRM.
    if (res.status === 404) {
      await new Promise((r) => setTimeout(r, 900));
      ({ res, data } = await send());
    }
    if (!res.ok) {
      return {
        moved: false,
        error: data?.error ?? `Request failed (${res.status}).`,
      };
    }
    return {
      moved: Boolean(data?.stageUpdated),
      skipped: Boolean(data?.skipped),
      currentStage: data?.currentStage ?? null,
      alreadyPushed: Boolean(data?.alreadyPushed),
      warnings: (data?.warnings ?? []) as string[],
    };
  } catch (e) {
    return {
      moved: false,
      error: e instanceof Error ? e.message : "Unexpected error.",
    };
  }
}
