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

type DocWithAutoTable = {
  lastAutoTable?: { finalY: number };
};

/** The filename used for both the download and the Zoho attachment. */
export function proposalPdfFilename(quote: ClientQuote): string {
  return `${safeFilenamePart(quote.title)}-${format(new Date(quote.updated_at), "yyyy-MM-dd")}.pdf`;
}

/**
 * Builds the quote PDF and hands back the jsPDF doc, so callers can either
 * download it or take the bytes (e.g. to attach to a Zoho Deal). Kept private —
 * `downloadProposalPdf` / `buildProposalPdfBlob` are the two entry points.
 */
async function buildProposalPdfDoc(
  quote: ClientQuote,
  projectName: string | null | undefined,
) {
  const [{ default: jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableMod.default;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text("CLIENT QUOTE", margin, y);

  y += 6;
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  const titleLines = doc.splitTextToSize(quote.title, pageW - margin * 2);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 6 + 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);

  const meta: string[] = [];
  if (quote.client_name?.trim()) {
    meta.push(`Client: ${quote.client_name}`);
  }
  if (projectName?.trim()) {
    meta.push(`Project: ${projectName}`);
  }
  meta.push(`Platform: ${platformLabel(quote.platform)}`);
  meta.push(`Date: ${format(new Date(quote.updated_at), "MMMM d, yyyy")}`);

  for (const line of meta) {
    doc.text(line, margin, y);
    y += 5;
  }

  y += 4;

  const totals = quoteTotals(quote);
  const idIndex = new Map(quote.line_items.map((li, i) => [li.id, i + 1]));

  const body = quote.line_items.map((li, i) => [
    String(i + 1),
    li.title.trim() || "(untitled)",
    li.module ?? "",
    categoryName(li.category_id) ?? "",
    tierLabel(effectiveTier(li.tier, quote.requirements_unclear)),
    String(li.quantity),
    String(lineEffectiveHours(li, quote.requirements_unclear)),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["#", "Description", "Module", "Category", "Tier", "Qty", "Hours"]],
    body,
    theme: "striped",
    headStyles: {
      fillColor: [51, 65, 85],
      textColor: 255,
      fontStyle: "bold",
    },
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 9 },
      1: { cellWidth: "auto" },
      2: { cellWidth: 30 },
      3: { cellWidth: 24 },
      4: { cellWidth: 18 },
      5: { cellWidth: 10, halign: "right" },
      6: { cellWidth: 16, halign: "right" },
    },
    margin: { left: margin, right: margin },
  });

  y = (doc as DocWithAutoTable).lastAutoTable?.finalY ?? y;
  y += 8;

  const summaryRows: string[][] = [["Dev hours", String(totals.devHours)]];
  if (quote.addons.responsive_enabled)
    summaryRows.push([
      `Responsive (${quote.addons.responsive_pct}%)`,
      String(totals.responsiveHours),
    ]);
  if (quote.addons.design_enabled)
    summaryRows.push([
      `Design (${quote.addons.design_pct}%)`,
      String(totals.designHours),
    ]);
  if (quote.addons.qa_enabled)
    summaryRows.push([
      `QA (${quote.addons.qa_pct}%)`,
      String(totals.qaHours),
    ]);
  if (quote.addons.pm_enabled)
    summaryRows.push([
      `PM (${quote.addons.pm_pct}%)`,
      String(totals.pmHours),
    ]);
  summaryRows.push(["Total estimated hours", String(totals.grandHours)]);

  autoTable(doc, {
    startY: y,
    head: [["Roll-up", "Hours"]],
    body: summaryRows,
    theme: "plain",
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 30, halign: "right", fontStyle: "bold" },
    },
    margin: { left: margin, right: margin },
  });

  y = (doc as DocWithAutoTable).lastAutoTable?.finalY ?? y;
  y += 8;

  // Dependencies appendix (only if anything has deps)
  const withDeps = quote.line_items.filter((li) => li.depends_on.length);
  if (withDeps.length) {
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text("Dependencies", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    for (const li of withDeps) {
      const refs = li.depends_on
        .map((d) => `#${idIndex.get(d) ?? "?"}`)
        .join(", ");
      const idx = idIndex.get(li.id);
      const line = `#${idx} ${li.title.trim() || "(untitled)"} -> ${refs}`;
      const wrapped = doc.splitTextToSize(line, pageW - margin * 2);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 4.5;
    }
    y += 4;
  }

  if (quote.notes?.trim()) {
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text("Notes", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    const noteLines = doc.splitTextToSize(quote.notes, pageW - margin * 2);
    doc.text(noteLines, margin, y);
  }

  return doc;
}

/**
 * Builds a downloadable .pdf in the browser (no print dialog).
 * Uses the same fields as the on-screen quote preview.
 */
export async function downloadProposalPdf(
  quote: ClientQuote,
  projectName: string | null | undefined,
): Promise<void> {
  const doc = await buildProposalPdfDoc(quote, projectName);
  doc.save(proposalPdfFilename(quote));
}

/**
 * Same PDF, returned as bytes instead of downloaded — used to attach the
 * proposal to its Zoho Deal. jsPDF only runs in the browser, so the file is
 * built client-side and POSTed to the server route, which forwards it to Zoho.
 */
export async function buildProposalPdfBlob(
  quote: ClientQuote,
  projectName: string | null | undefined,
): Promise<Blob> {
  const doc = await buildProposalPdfDoc(quote, projectName);
  return doc.output("blob");
}
