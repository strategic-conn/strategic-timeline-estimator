/** Orchestrator + shared formatters for the Discovery estimator. */
import { computeEstimate } from "@/lib/discovery/engine";
import { computeRisk } from "@/lib/discovery/risk";
import { computeTimeline } from "@/lib/discovery/timeline";
import { withSkippedSections } from "@/lib/discovery/questions";
import type { TeamCalendar } from "@/lib/discovery/team-calendar";
import type { DiscoveryProject, DiscoveryResult } from "@/types/discovery.types";

export { computeEstimate } from "@/lib/discovery/engine";
export { computeTimeline } from "@/lib/discovery/timeline";
export { computeRisk } from "@/lib/discovery/risk";

/** Run the full pipeline: estimate → timeline → risk. */
export function analyzeDiscovery(
  p: DiscoveryProject,
  cal?: TeamCalendar | null,
  riskBufferPct = 0,
): DiscoveryResult {
  const estimate = computeEstimate(p);
  // A skipped Timeline section (7) means no start date / review turnaround.
  const timeline = computeTimeline(withSkippedSections(p), estimate, cal, riskBufferPct);
  const risk = computeRisk(p, timeline);
  return { estimate, timeline, risk };
}

export function formatHours(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function rangeLabel(min: number, max: number): string {
  return min === max ? `${formatHours(min)}` : `${formatHours(min)}–${formatHours(max)}`;
}
