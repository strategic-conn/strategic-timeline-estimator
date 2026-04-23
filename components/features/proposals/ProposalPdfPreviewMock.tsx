"use client";

import { format } from "date-fns";

import { COMPLEXITY_OPTIONS } from "@/lib/constants/proposal-estimator";
import { cn } from "@/lib/utils";
import type { ClientQuote } from "@/types/proposal.types";

function complexityLabel(value: string): string {
  return (
    COMPLEXITY_OPTIONS.find((o) => o.value === value)?.label ?? value
  );
}

type ProposalPdfPreviewMockProps = {
  quote: ClientQuote;
  projectName?: string | null;
  className?: string;
};

export function ProposalPdfPreviewMock({
  quote,
  projectName,
  className,
}: ProposalPdfPreviewMockProps) {
  const totalHours = quote.line_items.reduce((s, li) => s + li.hours, 0);
  const dateStr = format(new Date(quote.updated_at), "MMMM d, yyyy");

  return (
    <div
      className={cn(
        "rounded-lg border bg-white p-8 text-slate-900 shadow-sm print:border-0 print:shadow-none print:p-0",
        className
      )}
    >
      <header className="border-b border-slate-200 pb-6 print:pb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Client quote (preview)
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {quote.title}
        </h1>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          {quote.client_name ? (
            <div>
              <dt className="text-slate-500">Client</dt>
              <dd className="font-medium">{quote.client_name}</dd>
            </div>
          ) : null}
          {projectName ? (
            <div>
              <dt className="text-slate-500">Project</dt>
              <dd className="font-medium">{projectName}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-slate-500">Date</dt>
            <dd className="font-medium">{dateStr}</dd>
          </div>
        </dl>
      </header>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-slate-800">Line items</h2>
        <table className="mt-3 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-600">
              <th className="py-2 pr-4 font-medium">#</th>
              <th className="py-2 pr-4 font-medium">Description</th>
              <th className="py-2 pr-4 font-medium">Complexity</th>
              <th className="py-2 text-right font-medium">Hours</th>
            </tr>
          </thead>
          <tbody>
            {quote.line_items.map((li, i) => (
              <tr key={li.id} className="border-b border-slate-100">
                <td className="py-2 pr-4 text-slate-500">{i + 1}</td>
                <td className="py-2 pr-4">
                  {li.title.trim() || "—"}
                </td>
                <td className="py-2 pr-4 text-slate-600">
                  {complexityLabel(li.complexity)}
                </td>
                <td className="py-2 text-right tabular-nums font-medium">
                  {li.hours}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td colSpan={3} className="pt-4 text-right text-slate-800">
                Total estimated hours
              </td>
              <td className="pt-4 text-right tabular-nums">
                {totalHours}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      {quote.notes?.trim() ? (
        <section className="mt-8 border-t border-slate-200 pt-6 print:pt-4">
          <h2 className="text-sm font-semibold text-slate-800">Notes</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
            {quote.notes}
          </p>
        </section>
      ) : null}

      <footer className="mt-8 border-t border-slate-100 pt-4 text-xs text-slate-500 print:mt-6 print:hidden">
        <span className="font-medium text-slate-600">Export → Download PDF</span>{" "}
        saves a file directly. Use{" "}
        <span className="font-medium text-slate-600">Print…</span> only if you
        need the system print dialog, or{" "}
        <span className="font-medium text-slate-600">Excel</span> for a
        spreadsheet.
      </footer>
    </div>
  );
}
