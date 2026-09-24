/**
 * Tentative timeline for a catalog / manual estimate (no guided scope).
 *
 * Reuses the SAME hours→days engine + Gantt as the guided path, so the launch
 * date is COMPUTED from the work, never hand-picked. Each line lands in the
 * phase of the role that does it (Creative → Design, QA Tester → QA, …; IT →
 * Development), responsive folds into Development, and the design / QA add-ons
 * join their phases. Sequenced by `computeTimeline`.
 */

import { analyzeDiscovery } from "@/lib/discovery";
import {
  PHASE_META,
  createEmptyDiscoveryProject,
} from "@/lib/discovery/constants";
import { computeTimeline, resolveProjectStart } from "@/lib/discovery/timeline";
import { addWorkingDays, type TeamCalendar } from "@/lib/discovery/team-calendar";
import { formatYmdLocal } from "@/lib/utils/availability-dates";
import {
  lineEffectiveHours,
  quoteTotals,
  roundHours,
} from "@/lib/constants/proposal-estimator";
import type {
  DiscoveryProject,
  DiscoveryResult,
  Estimate,
  EstimatePhase,
  EstimateTask,
  PhaseId,
} from "@/types/discovery.types";
import type { ClientQuote, ProposalLineItem } from "@/types/proposal.types";

// Phase label → id, so a guided line item (whose `module` IS a phase label) can
// be recognised. Everything else (catalog features, freehand) is Development.
const PHASE_LABEL_TO_ID = Object.fromEntries(
  (Object.keys(PHASE_META) as PhaseId[]).map((id) => [PHASE_META[id].label, id]),
) as Record<string, PhaseId>;

/**
 * Catalog / freehand lines are scheduled by WHO does them (pricing plan
 * Phase 5): the role decides the phase. IT — and any role not listed — is
 * Development, which is where every catalog line sat before.
 */
export const ROLE_PHASE: Partial<Record<string, PhaseId>> = {
  Creative: "design",
  "QA Tester": "qa",
  "Project Coordinator": "content",
  "Project Manager": "discovery",
};

/**
 * The delivery phase a line item belongs to — the shared spine that lets Guided
 * and Catalog estimates produce the same phase-organised project tasks. Guided
 * lines carry a phase label as `module` and keep it; every other line goes to
 * its role's phase.
 *
 * ⚠️ `available` is the phases the schedule actually has. A GUIDED estimate's
 * sprints come from its questionnaire, not its lines, so a Creative catalog
 * line on a guided quote with no design phase would have no sprint to land in
 * and fall into the backlog. Passing the scaffold's phases sends it to
 * Development instead — where it always went. Omit it only when the caller is
 * building the phases from these lines (`resultFromQuote`).
 */
export function phaseIdForLineItem(
  li: Pick<ProposalLineItem, "module" | "responsible">,
  available?: ReadonlySet<PhaseId>,
): PhaseId {
  if (li.module && li.module in PHASE_LABEL_TO_ID) return PHASE_LABEL_TO_ID[li.module];
  const byRole = (li.responsible && ROLE_PHASE[li.responsible]) || "development";
  return available && !available.has(byRole) ? "development" : byRole;
}

/** `phaseIdForLineItem` as its label — the sprint name and the task's tag. */
export function phaseLabelForLineItem(
  li: Pick<ProposalLineItem, "module" | "responsible">,
  available?: ReadonlySet<PhaseId>,
): string {
  return PHASE_META[phaseIdForLineItem(li, available)].label;
}

/** Reverse of PHASE_META label → id (e.g. a sprint name back to its phase). */
export function phaseIdFromLabel(label: string): PhaseId | null {
  return PHASE_LABEL_TO_ID[label] ?? null;
}

function mkTask(
  id: string,
  phaseId: PhaseId,
  name: string,
  hours: number,
  note?: string,
): EstimateTask {
  return { id, phaseId, name, min: hours, mid: hours, max: hours, note };
}

function phase(id: PhaseId, hours: number, tasks: EstimateTask[]): EstimatePhase {
  return {
    id,
    label: PHASE_META[id].label,
    description: PHASE_META[id].description,
    min: hours,
    mid: hours,
    max: hours,
    tasks,
  };
}

/** Synthetic project whose only job is to anchor the timeline start at today. */
export function tentativeProject(): DiscoveryProject {
  const now = new Date().toISOString();
  return {
    ...createEmptyDiscoveryProject(),
    id: "tentative",
    created_at: now,
    updated_at: now,
  };
}

/** True when there's enough on the quote to draw a tentative timeline. */
export function quoteHasWork(quote: ClientQuote): boolean {
  return quote.line_items.some((li) => li.title.trim() && li.hours > 0);
}

/**
 * Build a DiscoveryResult (estimate + timeline + neutral risk) from a quote's
 * line items and add-ons, for estimates with no guided questionnaire.
 */
export function resultFromQuote(
  quote: ClientQuote,
  cal?: TeamCalendar | null,
): DiscoveryResult {
  const t = quoteTotals(quote);

  // Each line's hours go to its role's phase; sequencing (Discovery/Content →
  // Design → Dev → QA) and the launch date come from computeTimeline. The
  // add-ons join their own phases and responsive folds into Development.
  // Totals are exactly what they were: the non-dev phases are summed and
  // Development takes the remainder of `t.devHours`, so rounding each phase
  // separately cannot drift the whole by a cent of an hour.
  const a = quote.addons;
  const ORDER: PhaseId[] = ["discovery", "content", "design", "development", "qa"];
  const lineHours: Partial<Record<PhaseId, number>> = {};
  const lineTasks: Partial<Record<PhaseId, EstimateTask[]>> = {};
  for (const li of quote.line_items) {
    const id = phaseIdForLineItem(li);
    lineHours[id] = (lineHours[id] ?? 0) + lineEffectiveHours(li, quote.requirements_unclear);
    if (li.title.trim() && li.hours > 0) {
      (lineTasks[id] ??= []).push(mkTask(li.id, id, li.title, li.hours, li.module ?? undefined));
    }
  }
  const nonDev = ORDER.filter((id) => id !== "development").reduce(
    (sum, id) => sum + roundHours(lineHours[id] ?? 0),
    0,
  );
  // No role phases → `t.devHours` untouched, so an IT-only quote is
  // byte-identical to before (float noise included: durations round UP to days).
  const devLines = nonDev > 0 ? roundHours(t.devHours - nonDev) : t.devHours;

  const addon: Partial<Record<PhaseId, EstimateTask>> = {};
  if (t.designHours > 0)
    addon.design = mkTask("design:rollup", "design", "Design & UX", t.designHours, `${a.design_pct}% of dev hours`);
  if (t.responsiveHours > 0)
    addon.development = mkTask(
      "development:responsive",
      "development",
      "Responsive / mobile",
      t.responsiveHours,
      `${a.responsive_pct}% of dev hours`,
    );
  if (t.qaHours > 0)
    addon.qa = mkTask("qa:rollup", "qa", "QA & Testing", t.qaHours, `${a.qa_pct}% of dev hours`);

  const phases: EstimatePhase[] = [];
  for (const id of ORDER) {
    const hours =
      (id === "development" ? devLines : roundHours(lineHours[id] ?? 0)) +
      (addon[id]?.mid ?? 0);
    if (hours <= 0) continue;
    // Roll-ups first where they come first today (Design, QA); responsive last.
    const tasks =
      id === "development"
        ? [...(lineTasks[id] ?? []), ...(addon[id] ? [addon[id]!] : [])]
        : [...(addon[id] ? [addon[id]!] : []), ...(lineTasks[id] ?? [])];
    phases.push(phase(id, hours, tasks));
  }

  const total = { min: t.grandHours, mid: t.grandHours, max: t.grandHours };
  const estimate: Estimate = {
    phases,
    total,
    retainer: null,
    assumptions: [
      "Tentative — generated from the line items and roll-up add-ons.",
      "Assumes a single work stream; adding people in parallel shortens it.",
    ],
  };

  // The quote carries its own buffer — no extra parameter to thread.
  const timeline = computeTimeline(
    tentativeProject(),
    estimate,
    cal,
    quote.risk_buffer_pct ?? 0,
  );
  const risk: DiscoveryResult["risk"] = {
    score: 0,
    level: "low",
    recommendedAction: "",
    flags: [],
    unansweredCount: 0,
  };
  return { estimate, timeline, risk };
}

/**
 * The estimate's own date range as ISO `YYYY-MM-DD`, for systems that need real
 * dates rather than the display strings the Gantt renders.
 *
 * Built from the same analyzer the timeline uses — guided answers when the quote
 * has them, the tentative line-item timeline otherwise — so the PBS purchase
 * order carries the dates the estimate actually shows. `DiscoveryTimeline`
 * formats its own dates as "MMM d, yyyy" for display, which no API accepts, and
 * re-deriving them anywhere else is how two screens start disagreeing.
 *
 * `null` when there is no work to schedule: no line items means no honest range,
 * and inventing one would put a fabricated date range on a billing record.
 */
export function estimateDateRange(
  quote: ClientQuote,
  cal?: TeamCalendar | null,
): { start: string; end: string } | null {
  const result = quote.discovery
    ? analyzeDiscovery(quote.discovery, cal, quote.risk_buffer_pct ?? 0)
    : quoteHasWork(quote)
      ? resultFromQuote(quote, cal)
      : null;
  if (!result) return null;
  const start = resolveProjectStart(quote.discovery?.project_start_date);
  // `totalBusinessDays` is the span the timeline drew, so the end date lands on
  // the same day as the last phase bar — and it must be converted to a date the
  // SAME way, calendar included, or the PO would be billed against a range the
  // Gantt never showed.
  const end = addWorkingDays(start, result.timeline.totalBusinessDays, cal);
  return { start: formatYmdLocal(start), end: formatYmdLocal(end) };
}
