import { format } from "date-fns";

import {
  effectiveTier,
  lineEffectiveHours,
  quoteTotals,
  tierLabel,
} from "@/lib/constants/proposal-estimator";
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

  const totals = quoteTotals(quote);

  const idIndex = new Map(quote.line_items.map((li, i) => [li.id, i + 1]));

  const rows: (string | number)[][] = [
    ["Quote title", quote.title],
    ["Client", quote.client_name ?? ""],
    ["Project", projectName ?? ""],
    ["Platform", platformLabel(quote.platform)],
    ["Last updated", format(new Date(quote.updated_at), "yyyy-MM-dd")],
    [],
    ["#", "Module", "Description", "Category", "Tier", "Base h", "Qty", "Hours", "Depends on"],
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
      li.depends_on
        .map((d) => `#${idIndex.get(d) ?? "?"}`)
        .join(", "),
    ]);
  });

  rows.push([]);
  rows.push(["", "", "", "", "", "", "Dev hours", totals.devHours]);
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
    ]);
  rows.push(["", "", "", "", "", "", "Total hours", totals.grandHours]);

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
