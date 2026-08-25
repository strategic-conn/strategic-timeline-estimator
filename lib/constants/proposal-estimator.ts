import type {
  ClientQuote,
  ProposalAddons,
  ProposalLineItem,
  ProposalPmBasis,
  ProposalTier,
} from "@/types/proposal.types";

/** Tier multipliers applied to `base_hours` for each line item. */
export const TIER_MULTIPLIERS: Record<ProposalTier, number> = {
  basic: 1,
  advanced: 1.5,
  custom: 2,
};

export const TIER_OPTIONS: {
  value: ProposalTier;
  label: string;
  hint: string;
}[] = [
  { value: "basic", label: "Basic", hint: "1x base hours" },
  { value: "advanced", label: "Advanced", hint: "1.5x base hours" },
  { value: "custom", label: "Custom", hint: "2x base hours" },
];

export function tierMultiplier(tier: ProposalTier): number {
  return TIER_MULTIPLIERS[tier];
}

export function tierLabel(tier: ProposalTier): string {
  return TIER_OPTIONS.find((t) => t.value === tier)?.label ?? tier;
}

/**
 * PM basis presets from the workbook: simple projects bill PM at 10% of total
 * hours, complex projects at 15%. "custom" lets the coordinator type any value.
 */
export const PM_BASIS_PCT: Record<Exclude<ProposalPmBasis, "custom">, number> = {
  simple: 10,
  complex: 15,
};

export const PM_BASIS_OPTIONS: {
  value: ProposalPmBasis;
  label: string;
  hint: string;
}[] = [
  { value: "simple", label: "Simple", hint: "10% of total" },
  { value: "complex", label: "Complex", hint: "15% of total" },
  { value: "custom", label: "Custom", hint: "set manually" },
];

/** PM percentage implied by a basis (custom keeps whatever the user typed). */
export function pmPctForBasis(basis: ProposalPmBasis, currentPct: number): number {
  if (basis === "custom") return currentPct;
  return PM_BASIS_PCT[basis];
}

/** Defaults pulled from the workbook's "more logic" tab. */
export const DEFAULT_ADDONS: ProposalAddons = {
  pm_enabled: true,
  pm_basis: "simple",
  pm_pct: 10,
  responsive_enabled: true,
  responsive_pct: 25,
  design_enabled: true,
  design_pct: 35,
  qa_enabled: true,
  qa_pct: 20,
};

/**
 * Billing rate, in dollars per hour. The estimator computes effort, and effort
 * is what gets sold — so every price in the app, its exports, and anything
 * pushed to the CRM is hours x this number.
 *
 * ponytail: one constant, on purpose. A per-client rate would need a column on
 * `proposals` (plus BOTH update whitelists — see CLAUDE.md), a field in the
 * editor, and a rule for which rate an existing quote keeps when the default
 * moves. Nobody has asked for a second rate yet. Change it here and every
 * quote, export and push follows.
 */
export const HOURLY_RATE = 100;

/** Dollar amount for a number of hours, at the current rate. */
export function amountForHours(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  // Hours carry two decimals (roundHours), so round the money rather than
  // letting fractions of a cent reach a client-facing document.
  return Math.round(hours * HOURLY_RATE);
}

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Formatted for display and documents, e.g. "$12,400". */
export function formatAmount(amount: number): string {
  return MONEY.format(Number.isFinite(amount) ? amount : 0);
}

/** Shorthand: hours straight to a formatted price. */
export function priceForHours(hours: number): string {
  return formatAmount(amountForHours(hours));
}

/**
 * Share the estimate's hours across the products it sells.
 *
 * Derived, never typed: the estimator already computed the hours, so asking a
 * coordinator to re-enter them per product is duplicate data entry that can only
 * disagree with itself. The split is even, with any rounding drift put on the
 * first share so the parts always sum to exactly `total`.
 *
 * ponytail: even split. Weighting by each product's catalogue `unit_price` would
 * be defensible when every product has one, but half of this org's catalogue
 * doesn't — and a weighted number is no less of a guess, just a harder one to
 * explain on a quote.
 */
export function splitHours(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const each = roundHours(total / parts);
  const out = new Array<number>(parts).fill(each);
  out[0] = roundHours(each + (total - each * parts));
  return out;
}

export function roundHours(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Compute hours for a single line: base * tier multiplier * quantity. */
export function computeLineHours(
  baseHours: number,
  tier: ProposalTier,
  quantity: number,
): number {
  const q = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  return roundHours(baseHours * tierMultiplier(tier) * q);
}

export interface QuoteTotals {
  devHours: number;
  responsiveHours: number;
  designHours: number;
  qaHours: number;
  pmHours: number;
  grandHours: number;
}

/**
 * Apply roll-up add-ons per the workbook's "more logic":
 *   responsive  = dev * responsive_pct
 *   design      = (dev + responsive) * design_pct
 *   qa          = (dev + responsive + design) * qa_pct
 *   pm          = (dev + responsive + design + qa) * pm_pct
 */
export function computeQuoteTotals(
  devHours: number,
  addons: ProposalAddons,
): QuoteTotals {
  const dev = roundHours(devHours);
  const responsive = addons.responsive_enabled
    ? roundHours(dev * (addons.responsive_pct / 100))
    : 0;
  const afterResp = dev + responsive;
  const design = addons.design_enabled
    ? roundHours(afterResp * (addons.design_pct / 100))
    : 0;
  const afterDesign = afterResp + design;
  const qa = addons.qa_enabled
    ? roundHours(afterDesign * (addons.qa_pct / 100))
    : 0;
  const beforePm = afterDesign + qa;
  const pm = addons.pm_enabled
    ? roundHours(beforePm * (addons.pm_pct / 100))
    : 0;
  return {
    devHours: dev,
    responsiveHours: responsive,
    designHours: design,
    qaHours: qa,
    pmHours: pm,
    grandHours: roundHours(beforePm + pm),
  };
}

/**
 * The tier a line is actually priced at. When the quote's requirements are
 * unclear, everything is treated as Advanced (1.5×) regardless of its own tier.
 */
export function effectiveTier(
  tier: ProposalTier,
  requirementsUnclear: boolean,
): ProposalTier {
  return requirementsUnclear ? "advanced" : tier;
}

/** Hours for one line, honouring the quote-level "requirements unclear" override. */
export function lineEffectiveHours(
  line: ProposalLineItem,
  requirementsUnclear: boolean,
): number {
  return computeLineHours(
    line.base_hours,
    effectiveTier(line.tier, requirementsUnclear),
    line.quantity,
  );
}

/** Sum of effective dev hours across every line on the quote. */
export function quoteDevHours(quote: ClientQuote): number {
  return roundHours(
    quote.line_items.reduce(
      (sum, li) => sum + lineEffectiveHours(li, quote.requirements_unclear),
      0,
    ),
  );
}

/** Full roll-up for a quote — the single source of truth for editor/preview/exports. */
export function quoteTotals(quote: ClientQuote): QuoteTotals {
  return computeQuoteTotals(quoteDevHours(quote), quote.addons);
}
