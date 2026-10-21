/**
 * Timeline engine — converts phase hours to business days and sequences phases per
 * the SC Estimator spec §3.2 (with content concurrency and SEO overlap).
 */
import { format, isValid, parseISO } from "date-fns";

import { BUSINESS_HOURS_PER_DAY, MILESTONES, PHASE_META } from "@/lib/discovery/constants";
import { addWorkingDays, type TeamCalendar } from "@/lib/discovery/team-calendar";
import type {
  DiscoveryProject,
  DiscoveryTimeline,
  Estimate,
  Milestone,
  PhaseId,
  TimelinePhase,
} from "@/types/discovery.types";

const DNS_BUFFER_DAYS = 2;
const BLACKOUT_BUFFER_DAYS = 10;

function durationDays(hours: number): number {
  if (hours <= 0) return 0;
  return Math.max(1, Math.ceil(hours / BUSINESS_HOURS_PER_DAY));
}

/**
 * The project's start date, or today when it hasn't been answered.
 *
 * Exported because the PBS purchase order needs the SAME start the Gantt draws
 * from — a PO filed against a different date than the timeline everyone is
 * looking at is a discrepancy nobody would think to check.
 */
export function resolveProjectStart(value: string | null | undefined): Date {
  return resolveStart(value ?? "");
}

function resolveStart(value: string): Date {
  if (value) {
    const parsed = parseISO(value);
    if (isValid(parsed)) return parsed;
  }
  return new Date();
}

/**
 * @param cal Booked time off and US holidays, folded in so the dates account
 *   for who is actually around. Optional and additive: without it the offsets
 *   convert to dates exactly as they always did. Leave changes WHEN the work
 *   lands, not how much there is.
 * @param riskBufferPct Schedule contingency, 0–100. Stretches every offset by
 *   the same factor, so the whole plan slides out proportionally rather than a
 *   gap opening at the end. ⚠️ It does NOT touch `estimate` — the hours, and
 *   therefore the price, are identical. Inflating a client quote for risk is
 *   `requirements_unclear`'s job and is a deliberate, separate decision.
 */
export function computeTimeline(
  p: DiscoveryProject,
  estimate: Estimate,
  cal?: TeamCalendar | null,
  riskBufferPct = 0,
): DiscoveryTimeline {
  const start = resolveStart(p.project_start_date);
  const buffer = Math.max(0, p.client_review_turnaround ?? 0);

  const hoursById = Object.fromEntries(
    estimate.phases.map((ph) => [ph.id, ph.mid]),
  ) as Record<PhaseId, number>;

  const dur = (id: PhaseId) => durationDays(hoursById[id] ?? 0);

  // Offsets are business-day counts from the project start.
  const discoveryStart = 0;
  const discoveryEnd = discoveryStart + dur("discovery");

  const contentStart = 0; // concurrent with discovery
  const contentEnd = contentStart + dur("content");

  // No design phase (section switched off) = no design review to wait for.
  const designStart = dur("design") ? discoveryEnd + buffer : discoveryEnd;
  const designEnd = designStart + dur("design");

  const developmentStart = Math.max(designEnd, contentEnd) + buffer;
  const developmentEnd = developmentStart + dur("development");

  const qaStart = developmentEnd; // immediately after dev
  const qaEnd = qaStart + dur("qa") + buffer; // includes one review buffer

  const seoStart = developmentStart + Math.floor(dur("development") * 0.6);
  const seoEnd = seoStart + dur("seo");

  const launchStart = qaEnd;
  let launchEnd = launchStart + dur("launch") + DNS_BUFFER_DAYS;
  if (p.has_blackout_periods) launchEnd += BLACKOUT_BUFFER_DAYS;

  const raw: Record<PhaseId, { start: number; end: number }> = {
    discovery: { start: discoveryStart, end: discoveryEnd },
    content: { start: contentStart, end: contentEnd },
    design: { start: designStart, end: designEnd },
    development: { start: developmentStart, end: developmentEnd },
    qa: { start: qaStart, end: qaEnd },
    seo: { start: seoStart, end: seoEnd },
    launch: { start: launchStart, end: launchEnd },
  };

  // Stretch every offset by the same factor. Scaling the STARTS too is what
  // keeps the plan continuous — buffering only the ends would leave each phase
  // finishing later while the next still began on its original day.
  // Offset 0 scales to 0, so the project still begins when it begins.
  const pct = Math.max(0, Math.min(100, Math.round(riskBufferPct)));
  const scale = 1 + pct / 100;
  const offsets = Object.fromEntries(
    Object.entries(raw).map(([id, o]) => [
      id,
      { start: Math.round(o.start * scale), end: Math.round(o.end * scale) },
    ]),
  ) as Record<PhaseId, { start: number; end: number }>;
  const bufferedLaunchEnd = Math.round(launchEnd * scale);

  const fmt = (offset: number) =>
    format(addWorkingDays(start, offset, cal), "MMM d, yyyy");

  const phases: TimelinePhase[] = estimate.phases.map((ph) => {
    const o = offsets[ph.id];
    return {
      id: ph.id,
      label: PHASE_META[ph.id].label,
      startOffset: o.start,
      endOffset: o.end,
      durationDays: Math.max(0, o.end - o.start),
      startDate: fmt(o.start),
      endDate: fmt(o.end),
    };
  });

  const present = new Set(estimate.phases.map((ph) => ph.id));
  const milestones: Milestone[] = MILESTONES.filter((m) => present.has(m.phaseId)).map((m) => {
    const offset = offsets[m.phaseId].end;
    return { id: m.id, label: m.label, phaseId: m.phaseId, offset, date: fmt(offset) };
  });

  const totalBusinessDays = Math.max(
    ...Object.values(offsets).map((o) => o.end),
    0,
  );
  const baseBusinessDays = Math.max(...Object.values(raw).map((o) => o.end), 0);

  return {
    phases,
    milestones,
    totalBusinessDays,
    baseBusinessDays,
    riskBufferPct: pct,
    totalWeeks: Math.max(1, Math.ceil(totalBusinessDays / 5)),
    launchDate: fmt(bufferedLaunchEnd),
  };
}
