import { quoteIsFrozen } from "@/lib/constants/proposal-estimator";
import { PHASE_META } from "@/lib/discovery/constants";
import type { ClientQuote, ProposalLineItem } from "@/types/proposal.types";

/**
 * What to check before an estimate goes to the client — chiefly for an
 * estimate built straight from line items, which never got the questionnaire's
 * risk score, phase hours or assumptions (decided 2026-11-12, with the
 * New-estimate "how do you want to scope it?" choice).
 *
 * Pure, so the Review card, the Send to Zoho dialog and the tests all read the
 * same rules. Nothing here blocks: these are prompts, not gates.
 */

const GUIDED_PHASE_LABELS = new Set(Object.values(PHASE_META).map((m) => m.label));

/**
 * A line somebody typed: not picked from the catalog (`catalog_id`) and not
 * generated from the questionnaire (a guided line's `module` is a phase label).
 * Its hours are a guess until a developer confirms them.
 */
export function isCustomLine(li: Pick<ProposalLineItem, "catalog_id" | "module">): boolean {
  return li.catalog_id == null && !(li.module && GUIDED_PHASE_LABELS.has(li.module));
}

/** A titled custom line with hours that nobody has confirmed yet. */
export function needsDevConfirm(
  li: Pick<ProposalLineItem, "catalog_id" | "module" | "title" | "hours" | "hours_confirmed">,
): boolean {
  return isCustomLine(li) && Boolean(li.title.trim()) && li.hours > 0 && li.hours_confirmed !== true;
}

export type SendCheck = {
  id: "dev-hours" | "no-pm" | "no-qa" | "no-assumptions" | "no-content-seo";
  /** warn = probably wrong if sent as is; info = worth a look, often fine. */
  tone: "warn" | "info";
  title: string;
  detail: string;
  /** Where the fix is: an editor tab. */
  fix: "lines" | "adjust" | "review";
  fixLabel: string;
};

const has = (lines: ProposalLineItem[], test: (li: ProposalLineItem) => boolean) =>
  lines.some((li) => li.title.trim() && test(li));

/**
 * The checks that apply right now. Empty once the estimate is approved or
 * billed (its price is agreed — `quoteIsFrozen`), and empty when nothing is
 * flagged.
 */
export function sendChecks(
  quote: Pick<ClientQuote, "line_items" | "addons" | "discovery" | "context" | "status" | "pbs">,
): SendCheck[] {
  if (quoteIsFrozen(quote)) return [];
  const out: SendCheck[] = [];
  const lines = quote.line_items;

  const unconfirmed = lines.filter(needsDevConfirm);
  if (unconfirmed.length) {
    const names = unconfirmed.slice(0, 3).map((li) => `"${li.title.trim()}"`).join(", ");
    out.push({
      id: "dev-hours",
      tone: "warn",
      title: `${unconfirmed.length} custom line${unconfirmed.length === 1 ? "" : "s"} not confirmed by a developer`,
      detail: `${names}${unconfirmed.length > 3 ? ` and ${unconfirmed.length - 3} more` : ""}. Not in the catalog, so the hours are a guess until a developer confirms them.`,
      fix: "lines",
      fixLabel: "Review lines",
    });
  }

  // The rest is what the questionnaire would have covered. A guided estimate
  // has phase hours and generated assumptions, so these don't apply to it.
  if (quote.discovery) return out;

  if (!quote.addons?.pm_enabled && !has(lines, (li) => li.responsible === "Project Manager")) {
    out.push({
      id: "no-pm",
      tone: "warn",
      title: "No project management time is priced",
      detail: "No PM add-on and no Project Manager lines. Meetings, planning and client updates would be free.",
      fix: "adjust",
      fixLabel: "Turn on the PM add-on",
    });
  }
  if (!quote.addons?.qa_enabled && !has(lines, (li) => li.responsible === "QA Tester")) {
    out.push({
      id: "no-qa",
      tone: "warn",
      title: "No QA / testing time is priced",
      detail: "No QA add-on and no QA Tester lines.",
      fix: "adjust",
      fixLabel: "Turn on the QA add-on",
    });
  }
  if (!quote.context?.assumptions?.length) {
    out.push({
      id: "no-assumptions",
      tone: "warn",
      title: "No scope assumptions on the quote",
      detail: "Assumptions (\"client supplies all copy\", \"two rounds of revisions\") are what stop scope creep later.",
      fix: "review",
      fixLabel: "Add assumptions",
    });
  }
  const contentOrSeo = has(
    lines,
    (li) =>
      li.responsible === "Project Coordinator" ||
      /\b(seo|content|copy)/i.test(`${li.title} ${li.module ?? ""}`),
  );
  if (!contentOrSeo) {
    out.push({
      id: "no-content-seo",
      tone: "info",
      title: "No content or SEO work priced",
      detail: "Fine if the client handles it — then say so in the assumptions.",
      fix: "lines",
      fixLabel: "Browse the catalog",
    });
  }
  return out;
}
