import { format } from "date-fns";

import { COMPLEXITY_OPTIONS } from "@/lib/constants/proposal-estimator";
import type { ClientQuote } from "@/types/proposal.types";

function complexityLabel(value: string): string {
  return COMPLEXITY_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

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
  projectName: string | null | undefined
): Promise<void> {
  const XLSX = await import("xlsx");

  const rows: (string | number)[][] = [
    ["Quote title", quote.title],
    ["Client", quote.client_name ?? ""],
    ["Project", projectName ?? ""],
    ["Last updated", format(new Date(quote.updated_at), "yyyy-MM-dd")],
    [],
    ["#", "Description", "Complexity", "Hours"],
  ];

  quote.line_items.forEach((li, i) => {
    rows.push([
      i + 1,
      li.title,
      complexityLabel(li.complexity),
      li.hours,
    ]);
  });

  const totalHours = quote.line_items.reduce((s, li) => s + li.hours, 0);
  rows.push([]);
  rows.push(["", "", "Total hours", totalHours]);

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
