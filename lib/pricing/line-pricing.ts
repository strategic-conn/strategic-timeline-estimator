import { LEGACY_HOURLY_RATE } from "@/lib/constants/proposal-estimator";
import { PHASE_META } from "@/lib/discovery/constants";
import {
  DEFAULT_HOURLY_RATES,
  rateFor,
  type HourlyRate,
  type RateLevel,
} from "@/lib/pricing/hourly-rates";
import {
  catalogForPlatform,
  type ProposalPlatform,
} from "@/lib/proposal-catalog";
import type { PhaseId } from "@/types/discovery.types";
import type {
  AddonRates,
  ClientQuote,
  ProposalLineItem,
} from "@/types/proposal.types";

/**
 * Who does a line, and what that costs — the half of pricing that needs the
 * catalog and the rates table (the money itself is in
 * lib/constants/proposal-estimator.ts: `lineAmount`, `quotePricing`).
 *
 * Pricing plan Phase 3 (docs/pricing-levels-plan.md). Every line is created
 * through `withPricing`, so there is ONE rule for which role a line gets and
 * which rate it is priced at.
 */

export type RoleKey = { responsible: string; level: RateLevel };

/** A freehand row has no source to take a role from; the coordinator can change it. */
export const FREEHAND_ROLE: RoleKey = { responsible: "IT", level: 1 };

/**
 * Guided lines are one per delivery phase, so the phase decides the role.
 * Level 1 throughout: the questionnaire estimates effort per phase and says
 * nothing about seniority. Exhaustive over PhaseId, so a new phase cannot ship
 * without someone deciding who does it.
 */
export const PHASE_ROLE: Record<PhaseId, RoleKey> = {
  discovery: { responsible: "Project Manager", level: 1 },
  content: { responsible: "Creative", level: 1 },
  design: { responsible: "Creative", level: 1 },
  development: { responsible: "IT", level: 1 },
  qa: { responsible: "QA Tester", level: 1 },
  seo: { responsible: "IT", level: 1 },
  launch: { responsible: "IT", level: 1 },
};

/** Plan decision 3: each add-on's hours cost its role's Level 1 rate. */
export const ADDON_ROLE: Record<keyof AddonRates, RoleKey> = {
  responsive: { responsible: "IT", level: 1 },
  design: { responsible: "Creative", level: 1 },
  qa: { responsible: "QA Tester", level: 1 },
  pm: { responsible: "Project Manager", level: 1 },
};

const PHASE_BY_LABEL = new Map(
  (Object.keys(PHASE_META) as PhaseId[]).map((id) => [
    PHASE_META[id].label,
    id,
  ]),
);

/** The role a line carries when nothing has set one: catalog row → guided phase → freehand. */
export function defaultRoleFor(
  line: Pick<ProposalLineItem, "catalog_id" | "module">,
  platform: ProposalPlatform,
): RoleKey {
  if (line.catalog_id != null) {
    const row = catalogForPlatform(platform).find(
      (r) => r.id === line.catalog_id,
    );
    if (row) return { responsible: row.responsible, level: row.level };
  }
  const phase = line.module ? PHASE_BY_LABEL.get(line.module) : undefined;
  if (phase) return PHASE_ROLE[phase];
  return FREEHAND_ROLE;
}

/** The role a line already carries, or null. */
export function roleOf(
  line: Pick<ProposalLineItem, "responsible" | "level">,
): RoleKey | null {
  return line.responsible && (line.level === 1 || line.level === 2)
    ? { responsible: line.responsible, level: line.level }
    : null;
}

/**
 * Today's rate for a role. The live table first; the workbook seed only if the
 * table has no such row (it is hydrated at app start, so that is an edge);
 * the legacy rate as a last resort so a price is never NaN.
 */
export function currentRate(rates: HourlyRate[], role: RoleKey): number {
  return (
    rateFor(rates, role.responsible, role.level) ??
    rateFor(DEFAULT_HOURLY_RATES, role.responsible, role.level) ??
    LEGACY_HOURLY_RATE
  );
}

/**
 * A NEW line's pricing: give it a role if it has none and snapshot today's rate
 * if it has none. An existing snapshot is never replaced here — that is the
 * whole point of a snapshot (plan decision 1).
 */
export function withPricing<T extends Partial<ProposalLineItem>>(
  line: T,
  platform: ProposalPlatform,
  rates: HourlyRate[],
): T & Pick<ProposalLineItem, "responsible" | "level" | "rate"> {
  const role =
    roleOf({ responsible: line.responsible, level: line.level }) ??
    defaultRoleFor(
      { catalog_id: line.catalog_id ?? null, module: line.module ?? null },
      platform,
    );
  return {
    ...line,
    responsible: role.responsible,
    level: role.level,
    rate:
      typeof line.rate === "number" && Number.isFinite(line.rate)
        ? line.rate
        : currentRate(rates, role),
  };
}

/** Today's add-on rates, for a new quote or "Update to current rates". */
export function currentAddonRates(rates: HourlyRate[]): AddonRates {
  return {
    responsive: currentRate(rates, ADDON_ROLE.responsive),
    design: currentRate(rates, ADDON_ROLE.design),
    qa: currentRate(rates, ADDON_ROLE.qa),
    pm: currentRate(rates, ADDON_ROLE.pm),
  };
}

/**
 * What "Update to current rates" would write: every line re-snapshotted at its
 * role's current rate (a line with no role gets its default role first), plus
 * current add-on rates. Pure — the dialog renders this object and the store
 * writes this same object, never a recompute (the preview → confirm rule).
 */
export function repriceToCurrentRates(
  quote: ClientQuote,
  rates: HourlyRate[],
): {
  line_items: ProposalLineItem[];
  addonRates: AddonRates;
  changedLines: number;
} {
  let changedLines = 0;
  const line_items = quote.line_items.map((li) => {
    const role = roleOf(li) ?? defaultRoleFor(li, quote.platform);
    const rate = currentRate(rates, role);
    const same =
      li.rate === rate &&
      li.responsible === role.responsible &&
      li.level === role.level;
    if (same) return li;
    changedLines += 1;
    return { ...li, responsible: role.responsible, level: role.level, rate };
  });
  return { line_items, addonRates: currentAddonRates(rates), changedLines };
}
