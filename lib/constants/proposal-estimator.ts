import type {
  AddonRates,
  ClientQuote,
  ProposalAddons,
  ProposalLineItem,
  ProposalPmBasis,
  ProposalTier,
} from "@/types/proposal.types";
import { formatRate } from "@/lib/pricing/hourly-rates";

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
export const PM_BASIS_PCT: Record<
  Exclude<ProposalPmBasis, "custom">,
  number
> = {
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
export function pmPctForBasis(
  basis: ProposalPmBasis,
  currentPct: number,
): number {
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
 * The rate every estimate was priced at before per-role rates (pricing plan,
 * Phase 3). A line or add-on with no stored rate was priced at this — so reading
 * it back this way keeps every existing quote's price identical to the dollar.
 *
 * ⚠️ NOT the current rate of anything. Current rates live in `hourly_rates`
 * (Settings → Hourly rates); a new line snapshots its role's rate from there.
 * This constant only answers "what did an old line cost".
 */
export const LEGACY_HOURLY_RATE = 100;

/**
 * Schedule risk buffer a NEW estimate or project starts with (0044 sets the
 * same column default). Dates only — never hours or price. Existing rows keep
 * whatever they have: changing theirs would move dates people agreed to.
 */
export const DEFAULT_RISK_BUFFER_PCT = 10;

/** Whole-dollar money for hours at a rate. */
export function amountAt(hours: number, rate: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  // Round the money, not the hours: fractions of a cent must never reach a
  // client-facing document, and rounding each line means the lines on a PDF
  // always add up to exactly its total.
  return Math.round(hours * rate);
}

/** The rate a line was priced at — its snapshot, or the legacy rate. */
export function lineRate(line: Pick<ProposalLineItem, "rate">): number {
  const r = line.rate;
  return typeof r === "number" && Number.isFinite(r) && r >= 0
    ? r
    : LEGACY_HOURLY_RATE;
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

/**
 * Share the estimate's PRICE across the products it sells — the money twin of
 * `splitHours`, with the same even split and the same "drift on the first
 * share" rule, so the parts always sum to exactly `total`.
 *
 * ⚠️ Split money, never "hours share x a rate": with rates that vary by line
 * there is no single rate to multiply by, and the product rows are what Zoho
 * recomputes the deal's Amount from.
 */
export function splitAmount(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const each = Math.round(total / parts);
  const out = new Array<number>(parts).fill(each);
  out[0] = each + (total - each * parts);
  return out;
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

/** Rates the add-on hours were priced at — the quote's snapshot, or legacy. */
export function addonRates(addons: ProposalAddons): AddonRates {
  const r = addons.rates;
  const ok = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) && n >= 0
      ? n
      : LEGACY_HOURLY_RATE;
  return {
    responsive: ok(r?.responsive),
    design: ok(r?.design),
    qa: ok(r?.qa),
    pm: ok(r?.pm),
  };
}

/** Money for one line: its effective hours at the rate it was priced at. */
export function lineAmount(
  line: ProposalLineItem,
  requirementsUnclear: boolean,
): number {
  return amountAt(
    lineEffectiveHours(line, requirementsUnclear),
    lineRate(line),
  );
}

export interface QuotePricing {
  /** The hours roll-up, unchanged — pricing never alters hours. */
  totals: QuoteTotals;
  devAmount: number;
  responsiveAmount: number;
  designAmount: number;
  qaAmount: number;
  pmAmount: number;
  /** Sum of the parts above — every component is whole dollars, so exact. */
  grandAmount: number;
  /** grandAmount / grandHours; null when there are no hours. */
  averageRate: number | null;
  /** The single rate every priced hour used, or null when rates vary. */
  uniformRate: number | null;
}

/**
 * THE price of a quote. Every surface that shows money — editor header, totals
 * panel, list cards, stage board, PDF, Excel, the Zoho send dialog — reads
 * this, so they cannot disagree about the same estimate.
 *
 * Lines are priced at their own snapshot rate; add-on hours at the quote's
 * add-on rate snapshots (plan decision 3). A quote saved before Phase 3 has no
 * snapshots anywhere and prices at LEGACY_HOURLY_RATE throughout — identical to
 * the old `hours x $100` to the dollar (asserted in e2e/line-pricing.spec.ts).
 */
export function quotePricing(quote: ClientQuote): QuotePricing {
  const totals = quoteTotals(quote);
  const unclear = quote.requirements_unclear;
  const r = addonRates(quote.addons);

  const devAmount = quote.line_items.reduce(
    (sum, li) => sum + lineAmount(li, unclear),
    0,
  );
  const responsiveAmount = amountAt(totals.responsiveHours, r.responsive);
  const designAmount = amountAt(totals.designHours, r.design);
  const qaAmount = amountAt(totals.qaHours, r.qa);
  const pmAmount = amountAt(totals.pmHours, r.pm);
  const grandAmount =
    devAmount + responsiveAmount + designAmount + qaAmount + pmAmount;

  const used = new Set<number>();
  for (const li of quote.line_items) {
    if (lineEffectiveHours(li, unclear) > 0) used.add(lineRate(li));
  }
  if (totals.responsiveHours > 0) used.add(r.responsive);
  if (totals.designHours > 0) used.add(r.design);
  if (totals.qaHours > 0) used.add(r.qa);
  if (totals.pmHours > 0) used.add(r.pm);

  return {
    totals,
    devAmount,
    responsiveAmount,
    designAmount,
    qaAmount,
    pmAmount,
    grandAmount,
    averageRate: totals.grandHours > 0 ? grandAmount / totals.grandHours : null,
    uniformRate: used.size === 1 ? [...used][0] : null,
  };
}

/**
 * How a quote's rate reads beside its hours: "at $100/h" when every priced hour
 * used one rate, "avg $104.25/h" when rates vary. Replaces the old fixed
 * "@ $100/h", which stopped being true the moment lines carried their own rates.
 */
export function rateSummary(p: QuotePricing): string {
  if (p.uniformRate != null) return `at ${formatRate(p.uniformRate)}/h`;
  if (p.averageRate != null) {
    return `avg ${formatRate(Math.round(p.averageRate * 100) / 100)}/h`;
  }
  return "";
}
