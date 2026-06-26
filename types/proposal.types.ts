/**
 * Client quote / proposal estimator — coordinator line items (not sprint tasks).
 * Persisted locally until wired to Supabase (proposals table — see supabase/migrations/).
 *
 * v2 schema: replaces 4-tier complexity with Basic/Advanced/Custom multipliers,
 * adds platform, catalog references, dependencies, quantity, and global rollup
 * add-ons (PM/responsive/design/QA).
 */

import type { ProposalPlatform } from "@/lib/proposal-catalog";

export type { ProposalPlatform };

export type ProposalTier = "basic" | "advanced" | "custom";

export interface ProposalLineItem {
  id: string;
  /** Short description of work for the client quote */
  title: string;
  /** Optional module label inherited from the catalog (e.g. "Homepage - Standard"). */
  module?: string | null;
  /** Optional category id from the catalog. */
  category_id?: number | null;
  /** Reference back to the catalog row id (per platform). Null = freehand line. */
  catalog_id?: number | null;
  /**
   * Base hours per unit before tier multiplier. Pulled from the catalog when
   * an item is imported, editable manually for freehand lines.
   */
  base_hours: number;
  /** Tier multiplier: basic=1x, advanced=1.5x, custom=2x. */
  tier: ProposalTier;
  /** Quantity (e.g. "per product w/ variations" = multiply by product count). */
  quantity: number;
  /** Computed snapshot: base_hours * tierMultiplier(tier) * quantity. */
  hours: number;
  /** Ids of other line items on the same quote that this depends on. */
  depends_on: string[];
}

/** How the PM percentage is chosen — preset simple/complex or a manual value. */
export type ProposalPmBasis = "simple" | "complex" | "custom";

export interface ProposalAddons {
  pm_enabled: boolean;
  /** Drives `pm_pct`: simple = 10%, complex = 15%, custom = manual entry. */
  pm_basis: ProposalPmBasis;
  pm_pct: number;
  responsive_enabled: boolean;
  responsive_pct: number;
  design_enabled: boolean;
  design_pct: number;
  qa_enabled: boolean;
  qa_pct: number;
}

export interface ClientQuote {
  id: string;
  title: string;
  /** Optional link to an internal project for context */
  project_id?: string | null;
  client_name?: string;
  notes?: string;
  /** Which platform's catalog this quote pulls from. */
  platform: ProposalPlatform;
  line_items: ProposalLineItem[];
  /** Roll-up add-ons applied on top of dev hours (PM, responsive, design, QA). */
  addons: ProposalAddons;
  /**
   * When true, requirements aren't pinned down yet — every line is priced as
   * Advanced (1.5×) for the totals regardless of its own tier (workbook rule).
   */
  requirements_unclear: boolean;
  created_at: string;
  updated_at: string;
}
