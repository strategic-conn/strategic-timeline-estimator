/**
 * Keeps the guided questionnaire aligned to the estimate's platform (the single
 * source of truth, `quote.platform`). The questionnaire's own `platform` field
 * just mirrors it, and platform-implied answers are derived instead of re-asked:
 *   • Shopify ⇒ e-commerce (forces has_ecommerce, defaults goal to E-Commerce)
 *   • Hosted platforms (Shopify/Wix/Squarespace) ⇒ hosting is the platform
 * Visibility rules in questions.ts read `p.platform` (now a ProposalPlatform
 * value) via these helpers, so no new machinery is needed.
 */
import { HOSTING_OPTIONS, type Option } from "@/lib/discovery/constants";
import type { DiscoveryProject } from "@/types/discovery.types";

/** Platforms that are inherently e-commerce (e-commerce is implied, not asked). */
export function isEcommercePlatform(platform: string): boolean {
  return platform === "shopify";
}

/** Hosted SaaS platforms where hosting = the platform (don't ask hosting). */
export function isHostedPlatform(platform: string): boolean {
  return platform === "shopify" || platform === "wix" || platform === "squarespace";
}

// Hosting options that fit any self-hosted stack.
const UNIVERSAL_HOSTING = ["azure", "cloudflare", "client_host", "other"];

/**
 * Hosting options compatible with the selected platform. Drops platform-specific
 * hosts that don't apply (e.g. Shopify hosting on a WordPress site, WP Engine on
 * a non-WordPress site). Hosted platforms hide the field entirely (see
 * questions.ts), so this only matters for WordPress / PHP / React / Custom.
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

/**
 * Mirror the estimate platform onto the questionnaire and apply platform-implied
 * answers. Never clobbers an explicit goal; forces only what the platform truly
 * dictates. Idempotent — safe to call on create and on every platform change.
 */
export function applyPlatformToDiscovery(
  d: DiscoveryProject,
  platform: string,
): DiscoveryProject {
  const next: DiscoveryProject = { ...d, platform };
  if (isEcommercePlatform(platform)) {
    next.has_ecommerce = true;
    if (!next.primary_goal) next.primary_goal = "ecommerce";
  }
  if (isHostedPlatform(platform)) {
    // Display-only in the engine; set a sensible value since the field is hidden.
    next.hosting_environment = platform === "shopify" ? "shopify" : "other";
  }
  return next;
}
