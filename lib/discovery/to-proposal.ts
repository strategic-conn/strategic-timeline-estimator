/** Maps a Discovery estimate into a ClientQuote draft for the Proposals editor. */
import { PHASE_META } from "@/lib/discovery/constants";
import type { ProposalDraftInput } from "@/store/proposal-estimator-store";
import type { DiscoveryProject, DiscoveryResult } from "@/types/discovery.types";
import type { ProposalPlatform } from "@/types/proposal.types";

function mapPlatform(platform: string): ProposalPlatform {
  switch (platform) {
    case "wordpress":
      return "wordpress";
    case "shopify":
      return "shopify";
    default:
      return "custom"; // webflow / custom / other → custom
  }
}

export function proposalDraftFromDiscovery(
  p: DiscoveryProject,
  result: DiscoveryResult,
): ProposalDraftInput {
  const { estimate, risk } = result;

  const line_items = estimate.phases.flatMap((phase) =>
    phase.tasks
      // Skip credits / zero-hour rows — they don't translate to billable lines.
      .filter((task) => task.mid > 0)
      .map((task) => ({
        title: task.name,
        module: PHASE_META[phase.id].label,
        category_id: null,
        catalog_id: null,
        base_hours: task.mid,
        tier: "basic" as const,
        quantity: 1,
      })),
  );

  const notesParts = [
    "Generated from the Discovery Estimator.",
    estimate.assumptions.length
      ? `Assumptions:\n- ${estimate.assumptions.join("\n- ")}`
      : "",
    `Risk: ${risk.level.toUpperCase()} (score ${risk.score}). ${risk.recommendedAction}`,
    estimate.retainer
      ? `Post-launch retainer: ${estimate.retainer.hoursPerMonth} hrs/month (separate line, not in total).`
      : "",
  ].filter(Boolean);

  return {
    title: p.name || "Discovery estimate",
    client_name: p.client_name || undefined,
    platform: mapPlatform(p.platform),
    notes: notesParts.join("\n\n"),
    requirements_unclear: risk.level === "high" || risk.level === "critical",
    // Discovery already itemises design/QA/PM into phases — don't double-count.
    addons: {
      responsive_enabled: false,
      design_enabled: false,
      qa_enabled: false,
      pm_enabled: false,
    },
    line_items,
  };
}
