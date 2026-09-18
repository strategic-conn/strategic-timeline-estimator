/**
 * Tentative timeline for a catalog / manual estimate (no guided scope).
 *
 * Reuses the SAME hours→days engine + Gantt as the guided path, so the launch
 * date is COMPUTED from the work, never hand-picked. Maps the quote's roll-up
 * structure into phases: dev line items (+ responsive) → Development, the design
 * add-on → Design, the QA add-on → QA. Sequenced by `computeTimeline`.
 */

import { analyzeDiscovery } from "@/lib/discovery";
import {
  PHASE_META,
  createEmptyDiscoveryProject,
} from "@/lib/discovery/constants";
import { computeTimeline, resolveProjectStart } from "@/lib/discovery/timeline";
import { addWorkingDays, type TeamCalendar } from "@/lib/discovery/team-calendar";
import { formatYmdLocal } from "@/lib/utils/availability-dates";
import { quoteTotals } from "@/lib/constants/proposal-estimator";
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
 * The delivery phase a line item belongs to — the shared spine that lets Guided
 * and Catalog estimates produce the same phase-organised project tasks. Guided
 * lines carry a phase label as `module`; catalog features are Development work.
 */
export function phaseLabelForLineItem(li: ProposalLineItem): string {
  if (li.module && li.module in PHASE_LABEL_TO_ID) return li.module;
  return PHASE_META.development.label;
}

/** The delivery-phase id for a line item (for the assignment engine). */
export function phaseIdForLineItem(li: ProposalLineItem): PhaseId {
  if (li.module && li.module in PHASE_LABEL_TO_ID) return PHASE_LABEL_TO_ID[li.module];
  return "development";
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

  // Only non-empty phases become bars; sequencing (Design → Dev → QA) and the
  // launch date come from computeTimeline. Responsive folds into dev work.
  // Each phase carries its "tasks" so the timeline bars are clickable-into:
  // the Development bar lists the actual line items; Design/QA are roll-ups.
  const a = quote.addons;
  const phases: EstimatePhase[] = [];

  if (t.designHours > 0) {
    phases.push(
      phase("design", t.designHours, [
        mkTask(
          "design:rollup",
          "design",
          "Design & UX",
          t.designHours,
          `${a.design_pct}% of dev hours`,
        ),
      ]),
    );
  }

  const devTasks: EstimateTask[] = quote.line_items
    .filter((li) => li.title.trim() && li.hours > 0)
    .map((li) =>
      mkTask(li.id, "development", li.title, li.hours, li.module ?? undefined),
    );
  if (t.responsiveHours > 0) {
    devTasks.push(
      mkTask(
        "development:responsive",
        "development",
        "Responsive / mobile",
        t.responsiveHours,
        `${a.responsive_pct}% of dev hours`,
      ),
    );
  }
  const devTotal = t.devHours + t.responsiveHours;
  if (devTotal > 0) phases.push(phase("development", devTotal, devTasks));

  if (t.qaHours > 0) {
    phases.push(
      phase("qa", t.qaHours, [
        mkTask("qa:rollup", "qa", "QA & Testing", t.qaHours, `${a.qa_pct}% of dev hours`),
      ]),
    );
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
