/**
 * One active estimate per Zoho deal.
 *
 * Without this, two estimates can hold the same `deal_id` — and the damage is
 * quiet. The push guard is keyed on the *quote* (`proposals.zoho.pushes`), so
 * the second estimate's push looks like a first: the stage moves again, a
 * **second proposal PDF** is attached (Zoho does not dedupe attachments), and
 * the Packages write is skipped because rows already exist. The deal ends up
 * showing one estimate's pricing next to another estimate's PDF, with no DELETE
 * scope to clean up the stray file.
 *
 * "Active" rather than "ever": a rejected estimate followed by a fresh one for
 * the same deal is legitimate history, and forbidding it would push people into
 * editing a rejected quote instead.
 *
 * Pure on purpose — the same rule backs the UI guard and both server checks, so
 * they cannot drift.
 */
export type DealHolder = {
  id: string;
  title?: string | null;
  status?: string | null;
  zoho?: { deal_id?: string | null; pushes?: Record<string, string> | null } | null;
  pbs?: { po_no?: string | null; po_id?: number | string | null } | null;
};

/** A rejected quote no longer owns its deal; anything else does. */
export function isActiveQuote(q: DealHolder): boolean {
  return q.status !== "rejected";
}

/**
 * The active quote already holding this deal, if any.
 *
 * @param exceptQuoteId the quote being linked — it can't conflict with itself.
 */
export function findActiveDealHolder<T extends DealHolder>(
  quotes: T[],
  dealId: string,
  exceptQuoteId?: string,
): T | null {
  if (!dealId) return null;
  return (
    quotes.find(
      (q) =>
        q.id !== exceptQuoteId &&
        q.zoho?.deal_id === dealId &&
        isActiveQuote(q),
    ) ?? null
  );
}

/**
 * A sibling quote on the same deal that already pushed this stage.
 *
 * This is the check that actually prevents the duplicate PDF: it holds even if
 * a link slipped past the UI guard, because it asks about the DEAL rather than
 * about one quote's own record.
 */
export function findSiblingPushedStage<T extends DealHolder>(
  siblings: T[],
  stage: string,
): T | null {
  return siblings.find((q) => Boolean(q.zoho?.pushes?.[stage])) ?? null;
}

/** A sibling quote on the same deal that already has a PO. */
export function findSiblingWithPo<T extends DealHolder>(siblings: T[]): T | null {
  return siblings.find((q) => Boolean(q.pbs?.po_no || q.pbs?.po_id)) ?? null;
}

/** Wording shared by the UI and the API so the reason reads the same either way. */
export function dealTakenMessage(holder: DealHolder): string {
  return `That Zoho deal is already on the estimate “${
    holder.title?.trim() || "another estimate"
  }”. One deal, one estimate — reject that one first, or edit it instead.`;
}
