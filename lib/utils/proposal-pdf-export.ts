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

type DocWithAutoTable = {
  lastAutoTable?: { finalY: number };
};

/**
 * Builds a downloadable .pdf in the browser (no print dialog).
 * Uses the same fields as the on-screen quote preview.
 */
export async function downloadProposalPdf(
  quote: ClientQuote,
  projectName: string | null | undefined
): Promise<void> {
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
  meta.push(`Date: ${format(new Date(quote.updated_at), "MMMM d, yyyy")}`);

  for (const line of meta) {
    doc.text(line, margin, y);
    y += 5;
  }

  y += 4;

  const body = quote.line_items.map((li, i) => [
    String(i + 1),
    li.title.trim() || "—",
    complexityLabel(li.complexity),
    String(li.hours),
  ]);

  const totalHours = quote.line_items.reduce((s, li) => s + li.hours, 0);

  autoTable(doc, {
    startY: y,
    head: [["#", "Description", "Complexity", "Hours"]],
    body,
    foot: [["", "", "Total estimated hours", String(totalHours)]],
    theme: "striped",
    headStyles: {
      fillColor: [51, 65, 85],
      textColor: 255,
      fontStyle: "bold",
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: "bold",
    },
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: "auto" },
      2: { cellWidth: 32 },
      3: { cellWidth: 22, halign: "right" },
    },
    margin: { left: margin, right: margin },
  });

  y = (doc as DocWithAutoTable).lastAutoTable?.finalY ?? y;
  y += 10;

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

  const fname = `${safeFilenamePart(quote.title)}-${format(new Date(quote.updated_at), "yyyy-MM-dd")}.pdf`;
  doc.save(fname);
}
