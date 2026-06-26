/** Orchestrator + shared formatters for the Discovery estimator. */
import { computeEstimate } from "@/lib/discovery/engine";
import { computeRisk } from "@/lib/discovery/risk";
import { computeTimeline } from "@/lib/discovery/timeline";
import type { DiscoveryProject, DiscoveryResult } from "@/types/discovery.types";

export { computeEstimate } from "@/lib/discovery/engine";
export { computeTimeline } from "@/lib/discovery/timeline";
export { computeRisk } from "@/lib/discovery/risk";

/** Run the full pipeline: estimate → timeline → risk. */
export function analyzeDiscovery(p: DiscoveryProject): DiscoveryResult {
  const estimate = computeEstimate(p);
  const timeline = computeTimeline(p, estimate);
  const risk = computeRisk(p, timeline);
  return { estimate, timeline, risk };
}

export function formatHours(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function rangeLabel(min: number, max: number): string {
  return min === max ? `${formatHours(min)}` : `${formatHours(min)}–${formatHours(max)}`;
}
