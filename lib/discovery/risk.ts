/**
 * Risk scoring — flag points + ½ unanswered required fields, mapped to the SC
 * Discovery Checklist thresholds (spec §3.3 / §8).
 */
import { RISK_LEVEL_META } from "@/lib/discovery/constants";
import { countUnanswered } from "@/lib/discovery/questions";
import type {
  DiscoveryProject,
  DiscoveryTimeline,
  RiskFlag,
  RiskLevel,
  RiskResult,
} from "@/types/discovery.types";

function levelForScore(score: number): RiskLevel {
  if (score <= 3) return "low";
  if (score <= 8) return "medium";
  if (score <= 15) return "high";
  return "critical";
}

export function computeRisk(
  p: DiscoveryProject,
  timeline: DiscoveryTimeline,
): RiskResult {
  const flags: RiskFlag[] = [];

  if (!p.sc_writes_copy && !p.copy_ready)
    flags.push({ label: "Client copy not ready", points: 3 });
  if (p.has_internal_system_integration)
    flags.push({ label: "Internal system integration", points: 3 });
  if ((p.stakeholder_count ?? 0) > 3)
    flags.push({ label: "Stakeholder count > 3", points: 2 });
  if (p.first_time_client)
    flags.push({ label: "First-time client", points: 2 });
  if (p.multi_language)
    flags.push({ label: "Multi-language site", points: 2 });
  if (p.content_needs_legal_review)
    flags.push({ label: "Content needs legal review", points: 2 });
  if (p.has_calculators)
    flags.push({ label: "Custom calculator / configurator", points: 1 });
  if (p.has_client_login)
    flags.push({ label: "Member portal", points: 1 });
  if ((p.design_revision_rounds ?? 2) > 2)
    flags.push({ label: "Extra revision rounds (above 2)", points: 1 });

  if (p.hard_launch_date) {
    const hard = new Date(p.hard_launch_date).getTime();
    const launch = new Date(timeline.launchDate).getTime();
    if (!Number.isNaN(hard) && !Number.isNaN(launch) && launch > hard)
      flags.push({ label: "Estimated launch exceeds hard deadline", points: 3 });
  }

  const unansweredCount = countUnanswered(p);
  const flagPoints = flags.reduce((s, f) => s + f.points, 0);
  const score = flagPoints + unansweredCount * 0.5;
  const level = levelForScore(score);

  return {
    score,
    level,
    recommendedAction: RISK_LEVEL_META[level].action,
    flags,
    unansweredCount,
  };
}
