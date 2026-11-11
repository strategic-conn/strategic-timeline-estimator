import { scopeAssumptions } from "@/lib/discovery/engine";
import { PLATFORM_IMPLIES } from "@/lib/discovery/platform-sync";
import { withScheduleInputs } from "@/lib/discovery/schedule-inputs";
import type { DiscoveryProject } from "@/types/discovery.types";
import type { ClientQuote, ProposalContext } from "@/types/proposal.types";

/**
 * An estimate's project context: primary business goal, "is this a redesign?"
 * (+ current URL) and "regulated industry?" (+ industry type).
 *
 * These were questionnaire section 1, so an estimate built straight from line
 * items never asked them. Since 2026-11-12 they are on the Setup tab for every
 * estimate, stored in `proposals.context` (migration 0054). A field never set
 * there falls back to the questionnaire's old answer, so existing estimates
 * keep what they had; a goal the platform implies (Shopify ⇒ e-commerce) wins
 * over both, exactly as `syncDiscoveryToQuote` makes it win in the answers.
 */
export const CONTEXT_FIELDS = [
  "primary_goal",
  "primary_goal_other",
  "is_redesign",
  "current_url",
  "regulated_industry",
  "regulated_type",
  "regulated_type_other",
] as const satisfies readonly (keyof ProposalContext & keyof DiscoveryProject)[];

type Q = Pick<ClientQuote, "context" | "discovery" | "platform">;

/** The seven answers (not `assumptions`, which a guided quote keeps elsewhere). */
export type ContextAnswers = Required<Omit<ProposalContext, "assumptions">>;

export function contextOf(quote: Q): ContextAnswers {
  const c = quote.context ?? {};
  const d = quote.discovery ?? null;
  const implied = PLATFORM_IMPLIES[quote.platform]?.primary_goal;
  return {
    primary_goal: implied ?? c.primary_goal ?? d?.primary_goal ?? "",
    primary_goal_other: c.primary_goal_other ?? d?.primary_goal_other ?? "",
    is_redesign: c.is_redesign ?? d?.is_redesign ?? false,
    current_url: c.current_url ?? d?.current_url ?? "",
    regulated_industry: c.regulated_industry ?? d?.regulated_industry ?? false,
    regulated_type: c.regulated_type ?? d?.regulated_type ?? "",
    regulated_type_other: c.regulated_type_other ?? d?.regulated_type_other ?? "",
  };
}

/** `p` with the estimate's Setup context written into the fields the engine reads. */
export function withContext(p: DiscoveryProject, quote: Q): DiscoveryProject {
  return { ...p, ...contextOf(quote) };
}

/**
 * The scope assumptions a quote prints (PDF, Excel, client preview): a guided
 * quote's are generated from its answers (or its edited list); a
 * line-items-only quote's are the ones typed on Review (`context.assumptions`).
 */
export function quoteAssumptions(
  quote: Q & Pick<ClientQuote, "schedule_plan">,
): string[] {
  return quote.discovery
    ? scopeAssumptions(withQuoteAnswers(quote.discovery, quote))
    : (quote.context?.assumptions ?? []);
}

/**
 * `p` with everything the estimate itself answers — Setup's context and the
 * Adjust tab's schedule — written in. The ONE way a quote's own answers reach
 * the engine (timeline, hours, risk), guided or not.
 */
export function withQuoteAnswers(
  p: DiscoveryProject,
  quote: Q & Pick<ClientQuote, "schedule_plan">,
): DiscoveryProject {
  return withContext(withScheduleInputs(p, quote), quote);
}
