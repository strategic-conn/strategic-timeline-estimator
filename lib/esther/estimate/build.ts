import { computeLineHours } from "@/lib/constants/proposal-estimator";
import { missingRoleLine } from "@/lib/estimator/send-checks";
import { catalogForPlatform, type ProposalPlatform } from "@/lib/proposal-catalog";
import type {
  ProposalContext,
  ProposalLineItem,
  ProposalSchedulePlan,
} from "@/types/proposal.types";

import { allowedAdjustment, type CatalogActual } from "./history";
import type {
  ConfirmedAnswers,
  DraftResult,
  EstherDraftMeta,
  ScanResult,
} from "./types";

/**
 * Esther's draft → the estimate's line items, context and schedule. Pure, so
 * `e2e/esther-estimate.spec.ts` pins every rule without calling Claude.
 *
 * Nothing Claude returns is trusted beyond its shape:
 *  - a catalog line takes its name, module, hours and role FROM THE CATALOG
 *    (Esther picks the row, the workbook sizes it); an id this platform doesn't
 *    have becomes a custom line instead of a silent wrong match;
 *  - a custom line's hours are clamped and it starts UNCONFIRMED, so it carries
 *    the "Hours to confirm with a developer" tag like any typed line;
 *  - PM and QA come from `missingRoleLine` — the same sizing as Before you
 *    send's "Add PM line" / "Add QA line" — not from the model.
 */

/** A line as the store's `createEstimateFromEsther` takes it (it adds id + rate). */
export type EstherLine = Omit<ProposalLineItem, "id" | "rate">;

const MAX_LINES = 150;
const clampInt = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Math.round(Number.isFinite(n) ? n : lo)));
/** Half-hour steps, 0.5–400 h per unit. */
const clampHours = (n: number) =>
  Math.min(400, Math.max(0.5, Math.round((Number.isFinite(n) ? n : 1) * 2) / 2));
const tidy = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

export function linesFromDraft(
  draft: DraftResult,
  platform: ProposalPlatform,
  /** Finished-task history per catalog id: the only thing that may resize a catalog line. */
  actuals: Record<number, CatalogActual> = {},
): EstherLine[] {
  const catalog = catalogForPlatform(platform);
  const lines: EstherLine[] = [];
  for (const d of draft.lines.slice(0, MAX_LINES)) {
    const row = d.catalog_id != null ? catalog.find((c) => c.id === d.catalog_id) : undefined;
    const quantity = clampInt(d.quantity, 1, 999);
    const note = tidy(d.note, 500) || null;
    if (row) {
      const base_hours = allowedAdjustment(row.base_hours, d.adjusted_hours, actuals[row.id]);
      lines.push({
        title: row.name,
        module: row.module,
        category_id: row.category_id,
        catalog_id: row.id,
        base_hours,
        tier: d.tier,
        quantity,
        hours: computeLineHours(base_hours, d.tier, quantity),
        depends_on: [],
        responsible: row.responsible,
        level: row.level,
        esther_note: note,
      });
      continue;
    }
    const title = tidy(d.title, 200);
    if (!title) continue;
    const base_hours = clampHours(d.base_hours);
    // Esther sizes a custom line herself, so its hours already include the
    // complexity — a tier on top would count it twice (8 h "advanced" → 12 h).
    lines.push({
      title,
      module: null,
      category_id: null,
      catalog_id: null,
      base_hours,
      tier: "basic",
      quantity,
      hours: computeLineHours(base_hours, "basic", quantity),
      depends_on: [],
      responsible: d.responsible,
      level: d.level,
      hours_confirmed: false,
      esther_note: note,
    });
  }

  // PM and QA time, sized like the add-ons they replace (10 % / 20 % of the
  // build). Esther's own lines of that role count towards it: one 3 h
  // "accuracy testing" line used to cancel the whole QA share.
  const asItems = lines as ProposalLineItem[];
  const topUps: [ProposalLineItem["responsible"], string][] = [
    ["Project Manager", "Meetings, planning and client updates: 10% of the build hours."],
    ["QA Tester", "Testing before launch: 20% of the build hours, split into a test task after each build task."],
  ];
  for (const [role, note] of topUps) {
    const add = missingRoleLine(asItems, role as "Project Manager" | "QA Tester");
    const have = asItems.filter((li) => li.responsible === role).reduce((s, li) => s + li.hours, 0);
    const base_hours = Math.round(((add.base_hours ?? 1) - have) * 2) / 2;
    if (base_hours < 1) continue;
    lines.push({
      title: add.title ?? "",
      module: null,
      category_id: null,
      catalog_id: null,
      base_hours,
      tier: "basic",
      quantity: 1,
      hours: computeLineHours(base_hours, "basic", 1),
      depends_on: [],
      responsible: add.responsible,
      level: add.level,
      hours_confirmed: true,
      esther_note: note,
    });
  }
  return lines;
}

/** Requirement ids no draft line points at — the reviewer's "not priced" list. */
export function uncoveredRequirements(scan: ScanResult, draft: DraftResult): string[] {
  const covered = new Set(draft.lines.flatMap((l) => l.requirement_ids));
  return scan.requirements.filter((r) => !covered.has(r.id)).map((r) => r.id);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The confirmed answers → Setup's project context (plus Esther's notes and assumptions). */
export function contextFromAnswers(
  a: ConfirmedAnswers,
  draft: DraftResult,
  meta: EstherDraftMeta,
): ProposalContext {
  return {
    primary_goal: a.primary_goal ?? undefined,
    is_redesign: a.is_redesign,
    current_url: a.is_redesign ? a.current_url.trim() || undefined : undefined,
    regulated_industry: a.regulated_industry,
    regulated_type: a.regulated_industry ? (a.regulated_type ?? undefined) : undefined,
    assumptions: draft.assumptions.map((s) => tidy(s, 300)).filter(Boolean).slice(0, 25),
    esther: meta,
  };
}

/** The confirmed answers → the Adjust tab's schedule fields (Best-fit planning). */
export function schedulePlanFromAnswers(a: ConfirmedAnswers): ProposalSchedulePlan {
  return {
    strategy: "efficient",
    start_date: DATE.test(a.start_date) ? a.start_date : null,
    hard_deadline: DATE.test(a.hard_deadline) ? a.hard_deadline : null,
    review_days: clampInt(a.review_days, 1, 30),
    blackout: a.blackout,
    blackout_notes: a.blackout ? tidy(a.blackout_notes, 1000) || null : null,
  };
}
