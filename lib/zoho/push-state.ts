import type { ProposalZohoLink } from "@/types/proposal.types";

/**
 * The CRM stages this app sets ITSELF, and what triggers each.
 *
 * Not a whitelist any more: the in-app status changer offers every stage in the
 * org pipeline, validated against the live picklist server-side
 * (`lib/zoho/stages.ts`). These are the three the app moves on its own, named
 * here so the code that triggers them reads clearly.
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
export const AUTO_ADVANCE_FROM: Record<string, readonly string[] | undefined> = {
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

/**
 * Stages that mean the deal is won — the client-side hint that reveals "Create
 * PO". A HINT, not the guard: the PO route re-reads the deal live and checks it
 * against Zoho's own forecast bucket (`lib/zoho/stages.ts`, server-only, so it
 * can't be imported here). Project Completed counts because it is also in the
 * won bucket, and a deal that skipped straight to it could otherwise never be
 * billed.
 */
export const WON_STAGES: readonly string[] = ["Closed Won", "Project Completed"];

/** One entry of the org's Stage picklist. */
export type ZohoStageInfo = {
  value: string;
  /** Position in the pipeline as Zoho orders it; -1 when unknown. */
  order: number;
  /** Zoho's own bucket — "Closed Won" / "Closed Lost" / "Open". */
  forecast: string | null;
  probability: number | null;
};

/**
 * THE won rule, in one place. Zoho's own forecast bucket decides it; the names
 * above are the fallback for when the picklist can't be read.
 *
 * Pure, and deliberately client-safe: the server gate (`lib/zoho/stages.ts`,
 * which re-reads the deal live before creating a PO) and the button that reveals
 * "Create PO" must never disagree about what "won" means. Checked in
 * `e2e/won-stage.spec.ts`.
 */
export function stageIsWon(
  stage: string | null | undefined,
  stages: ZohoStageInfo[],
): boolean {
  if (!stage) return false;
  const match = stages.find((s) => s.value === stage);
  if (match?.forecast) return /won/i.test(match.forecast);
  // Unknown stage, or one with no forecast: fall back to the names this org
  // uses. Never a substring test — "Closed Lost" must not pass.
  return WON_STAGES.includes(stage);
}

/**
 * Client-side hint that reveals "Create PO", with no picklist to hand. A HINT,
 * not the guard: the PO route re-reads the deal live and runs `stageIsWon`
 * against the real picklist before writing anything.
 */
export function looksWon(stage: string | null | undefined): boolean {
  return stageIsWon(stage, []);
}

/**
 * May this estimate raise a PBS purchase order — deal won, nothing billed yet?
 *
 * One definition for both the header button and the list card. They had a copy
 * each, and the copies had already drifted: one tested `po_no` while the dialog
 * tested `po_no ?? po_id`, so a PO that came back with an id but no number would
 * show a button that opens straight onto "already billed".
 *
 * A hint, like `looksWon` — `POST /api/pbs/pos` re-reads the deal live and
 * re-checks everything before writing.
 */
export function canRaisePo(quote: {
  zoho?: { stage?: string | null; deal_id?: string | null } | null;
  pbs?: { po_no?: string | null; po_id?: string | number | null } | null;
}): boolean {
  // A deal is required: the route refuses an estimate with none (no win to
  // gate on). A stale `stage` without a `deal_id` must not show the button.
  return (
    !!quote.zoho?.deal_id &&
    looksWon(quote.zoho?.stage) &&
    !quote.pbs?.po_no &&
    !quote.pbs?.po_id
  );
}

/** Is this estimate already billed (a PO number or id recorded)? */
export function hasPo(quote: {
  pbs?: { po_no?: string | null; po_id?: string | number | null } | null;
}): boolean {
  return !!(quote.pbs?.po_no || quote.pbs?.po_id);
}

/**
 * Every project is billed (decided 2026-10-21), so Start project needs a PO:
 * one already raised, or a won deal that can raise one inside the flow.
 * Demo mode has no PBS, so it is never blocked there.
 */
export function canStartProject(
  quote: Parameters<typeof canRaisePo>[0],
  liveBilling: boolean,
): boolean {
  return !liveBilling || hasPo(quote) || canRaisePo(quote);
}

/** Files this app has already attached to the deal, filename → ISO timestamp. */
export function zohoAttachments(
  zoho: ProposalZohoLink | null | undefined,
): Record<string, string> {
  return zoho?.attachments && typeof zoho.attachments === "object"
    ? zoho.attachments
    : {};
}

/**
 * Whether this file still needs attaching.
 *
 * Keyed on the filename rather than the stage, because the PDF now goes up at
 * whichever stage the deal is opened at — so "did we already push Proposal
 * Sent?" is no longer the right question. `proposalPdfFilename` embeds the
 * estimate's date, so an estimate edited later produces a new filename and its
 * updated PDF is attached; re-sending an unchanged one is skipped.
 */
export function shouldAttach(
  zoho: ProposalZohoLink | null | undefined,
  filename: string,
): boolean {
  return Boolean(filename) && !zohoAttachments(zoho)[filename];
}

export type StagePushResult = {
  /** The deal's stage was actually changed. */
  moved: boolean;
  /** Left untouched on purpose (further along already, or an unknown stage). */
  skipped?: boolean;
  /** The deal's stage in Zoho as of this request. */
  currentStage?: string | null;
  /** The deal was already at that stage, so nothing was written. */
  stageAlreadySet?: boolean;
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
    stage: string;
    file?: Blob;
    filename?: string;
    /**
     * A human picked this exact stage (the status changer), so the pipeline
     * ordering guard is skipped — moving a deal BACK is a legitimate thing to
     * ask for. Side-effect pushes (import, send) leave this off and may only
     * move a deal forwards.
     */
    explicit?: boolean;
  },
): Promise<StagePushResult> {
  const form = new FormData();
  form.append("proposalId", input.proposalId);
  form.append("stage", input.stage);
  if (input.explicit) form.append("explicit", "1");
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
      stageAlreadySet: Boolean(data?.stageAlreadySet),
      warnings: (data?.warnings ?? []) as string[],
    };
  } catch (e) {
    return {
      moved: false,
      error: e instanceof Error ? e.message : "Unexpected error.",
    };
  }
}
