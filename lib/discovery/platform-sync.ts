/**
 * Keeps the guided questionnaire aligned to the estimate. The quote (Setup tab)
 * is the single source of truth: anything Setup already knows is *derived* onto
 * the answers and hidden from the questionnaire, never asked a second time.
 *
 *   • quote.title / client_name → questionnaire name / client_name
 *   • quote.platform            → the PLATFORM_IMPLIES row below
 *
 * PLATFORM_IMPLIES drives both halves — every key it sets is forced onto the
 * answers here and hidden by questions.ts (via `isImplied`), so a new
 * implication is one line in one place.
 */
import { HOSTING_OPTIONS, type Option } from "@/lib/discovery/constants";
import type { DiscoveryProject } from "@/types/discovery.types";

/**
 * Answers the platform already gives us. These WIN over stored answers: the
 * matching question is hidden, so a stale value could never be corrected by
 * hand (e.g. goal set to Lead Gen on WordPress, then switched to Shopify).
 */
export const PLATFORM_IMPLIES: Record<string, Partial<DiscoveryProject>> = {
  // Shopify is e-commerce by definition, and hosts the store itself.
  shopify: {
    has_ecommerce: true,
    primary_goal: "ecommerce",
    hosting_environment: "shopify",
  },
  // Hosted SaaS builders: hosting is the platform.
  wix: { hosting_environment: "other" },
  squarespace: { hosting_environment: "other" },
};

/** True when the platform already answers this question — derive it, don't ask. */
export function isImplied(id: keyof DiscoveryProject, platform: string): boolean {
  return id in (PLATFORM_IMPLIES[platform] ?? {});
}

// Hosting options that fit any self-hosted stack.
const UNIVERSAL_HOSTING = ["azure", "cloudflare", "client_host", "other"];

/**
 * Hosting options compatible with the selected platform. Drops platform-specific
 * hosts that don't apply (e.g. Shopify hosting on a WordPress site, WP Engine on
 * a non-WordPress site). Hosted platforms hide the field entirely, so this only
 * matters for WordPress / PHP / React / Custom.
 */
export function hostingOptionsFor(platform: string): Option[] {
  const universal = HOSTING_OPTIONS.filter((o) =>
    UNIVERSAL_HOSTING.includes(o.value),
  );
  if (platform === "wordpress") {
    const wpEngine = HOSTING_OPTIONS.filter((o) => o.value === "wp_engine");
    return [...wpEngine, ...universal];
  }
  return universal;
}

/** The parts of a quote the questionnaire mirrors instead of asking for. */
export type QuoteScopeSource = {
  title: string;
  client_name?: string | null;
  platform: string;
};

/**
 * Mirror the estimate onto its questionnaire. Idempotent — safe to call on
 * create and after every Setup edit (the store calls it on `updateProposal`).
 */
export function syncDiscoveryToQuote(
  d: DiscoveryProject,
  quote: QuoteScopeSource,
): DiscoveryProject {
  return {
    ...d,
    name: quote.title,
    client_name: quote.client_name ?? "",
    platform: quote.platform,
    ...PLATFORM_IMPLIES[quote.platform],
  };
}
