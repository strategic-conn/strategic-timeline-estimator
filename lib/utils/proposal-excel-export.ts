import { format } from "date-fns";

import {
  effectiveTier,
  lineAmount,
  lineEffectiveHours,
  quotePricing,
  tierLabel,
} from "@/lib/constants/proposal-estimator";
import { primaryGoalLabel } from "@/lib/discovery/constants";
import { categoryName, platformLabel } from "@/lib/proposal-catalog";
import type { ClientQuote } from "@/types/proposal.types";

function safeFilenamePart(s: string): string {
  const t = s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return t.slice(0, 60) || "proposal";
}

/**
 * Builds a .xlsx download in the browser (demo / offline export).
 * Production can switch to `GET /proposals/:id/export` when the API exists.
 */
export async function downloadProposalExcel(
  quote: ClientQuote,
  projectName: string | null | undefined,
): Promise<void> {
  const XLSX = await import("xlsx");

  const pricing = quotePricing(quote);
  const totals = pricing.totals;

  const idIndex = new Map(quote.line_items.map((li, i) => [li.id, i + 1]));

  const rows: (string | number)[][] = [
    ["Quote title", quote.title],
    ["Client", quote.client_name ?? ""],
    ["Project", projectName ?? ""],
    ["Platform", platformLabel(quote.platform)],
    [
      "Primary goal",
      primaryGoalLabel(
        quote.discovery?.primary_goal ?? "",
        quote.discovery?.primary_goal_other,
      ),
    ],
    ["Last updated", format(new Date(quote.updated_at), "yyyy-MM-dd")],
    [],
    ["#", "Module", "Description", "Category", "Tier", "Base h", "Qty", "Hours", "Amount ($)", "Depends on"],
  ];

  quote.line_items.forEach((li, i) => {
    rows.push([
      i + 1,
      li.module ?? "",
      li.title || "(untitled)",
      categoryName(li.category_id) ?? "",
      tierLabel(effectiveTier(li.tier, quote.requirements_unclear)),
      li.base_hours,
      li.quantity,
      lineEffectiveHours(li, quote.requirements_unclear),
      lineAmount(li, quote.requirements_unclear),
      li.depends_on
        .map((d) => `#${idIndex.get(d) ?? "?"}`)
        .join(", "),
    ]);
  });

  rows.push([]);
  rows.push([
    "",
    "",
    "",
    "",
    "",
    "",
    "Dev hours",
    totals.devHours,
    pricing.devAmount,
  ]);
  if (quote.addons.responsive_enabled)
    rows.push([
      "",
      "",
      "",
      "",
      "",
      "",
      `Responsive (${quote.addons.responsive_pct}%)`,
      totals.responsiveHours,
      pricing.responsiveAmount,
    ]);
  if (quote.addons.design_enabled)
    rows.push([
      "",
      "",
      "",
      "",
      "",
      "",
      `Design (${quote.addons.design_pct}%)`,
      totals.designHours,
      pricing.designAmount,
    ]);
  if (quote.addons.qa_enabled)
    rows.push([
      "",
      "",
      "",
      "",
      "",
      "",
      `QA (${quote.addons.qa_pct}%)`,
      totals.qaHours,
      pricing.qaAmount,
    ]);
  if (quote.addons.pm_enabled)
    rows.push([
      "",
      "",
      "",
      "",
      "",
      "",
      `PM (${quote.addons.pm_pct}%)`,
      totals.pmHours,
      pricing.pmAmount,
    ]);
  rows.push([
    "",
    "",
    "",
    "",
    "",
    "",
    "Total",
    totals.grandHours,
    pricing.grandAmount,
  ]);

  if (quote.notes?.trim()) {
    rows.push([]);
    rows.push(["Notes"]);
    rows.push([quote.notes]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Quote");

  const fname = `${safeFilenamePart(quote.title)}-${format(new Date(quote.updated_at), "yyyy-MM-dd")}.xlsx`;
  XLSX.writeFile(wb, fname);
}
