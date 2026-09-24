"use client";

import { format } from "date-fns";

import {
  effectiveTier,
  formatAmount,
  lineEffectiveHours,
  quotePricing,
  tierLabel,
} from "@/lib/constants/proposal-estimator";
import { primaryGoalLabel } from "@/lib/discovery/constants";
import { categoryName, platformLabel } from "@/lib/proposal-catalog";
import { cn } from "@/lib/utils";
import type { ClientQuote } from "@/types/proposal.types";

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
  const pricing = quotePricing(quote);
  const totals = pricing.totals;
  const dateStr = format(new Date(quote.updated_at), "MMMM d, yyyy");
  const goal = primaryGoalLabel(
    quote.discovery?.primary_goal ?? "",
    quote.discovery?.primary_goal_other,
  );
  const idIndex = new Map(quote.line_items.map((li, i) => [li.id, i + 1]));

  return (
    <div
      className={cn(
        "rounded-2xl border bg-white p-4 text-slate-900 shadow-sm sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none",
        className,
      )}
    >
      <header className="border-b border-slate-200 pb-6 print:pb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Client quote (preview)
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {quote.title}
        </h1>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
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
            <dt className="text-slate-500">Platform</dt>
            <dd className="font-medium">{platformLabel(quote.platform)}</dd>
          </div>
          {goal ? (
            <div>
              <dt className="text-slate-500">Primary goal</dt>
              <dd className="font-medium">{goal}</dd>
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
        <div className="mt-3 overflow-x-auto print:overflow-visible">
          <table className="w-full min-w-136 border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-600">
              <th className="py-2 pr-3 font-medium">#</th>
              <th className="py-2 pr-3 font-medium">Description</th>
              <th className="py-2 pr-3 font-medium">Module</th>
              <th className="py-2 pr-3 font-medium">Category</th>
              <th className="py-2 pr-3 font-medium">Tier</th>
              <th className="py-2 pr-3 text-right font-medium">Qty</th>
              <th className="py-2 text-right font-medium">Hours</th>
            </tr>
          </thead>
          <tbody>
            {quote.line_items.map((li, i) => (
              <tr key={li.id} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-3 text-slate-500">{i + 1}</td>
                <td className="py-2 pr-3">
                  <div className="font-medium text-slate-900">
                    {li.title.trim() || "(untitled)"}
                  </div>
                  {li.depends_on.length ? (
                    <div className="mt-1 text-[0.7rem] uppercase tracking-wide text-slate-500">
                      Depends on{" "}
                      {li.depends_on
                        .map((d) => `#${idIndex.get(d) ?? "?"}`)
                        .join(", ")}
                    </div>
                  ) : null}
                </td>
                <td className="py-2 pr-3 text-slate-600">{li.module || "—"}</td>
                <td className="py-2 pr-3 text-slate-600">
                  {categoryName(li.category_id) ?? "—"}
                </td>
                <td className="py-2 pr-3 text-slate-600">
                  {tierLabel(effectiveTier(li.tier, quote.requirements_unclear))}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-slate-600">
                  {li.quantity}
                </td>
                <td className="py-2 text-right tabular-nums font-medium">
                  {lineEffectiveHours(li, quote.requirements_unclear)}
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Roll-up
        </h2>
        <dl className="mt-3 divide-y divide-slate-200">
          <Row label="Dev hours" value={totals.devHours} />
          {quote.addons.responsive_enabled ? (
            <Row
              label={`Responsive (${quote.addons.responsive_pct}%)`}
              value={totals.responsiveHours}
            />
          ) : null}
          {quote.addons.design_enabled ? (
            <Row
              label={`Design (${quote.addons.design_pct}%)`}
              value={totals.designHours}
            />
          ) : null}
          {quote.addons.qa_enabled ? (
            <Row
              label={`QA (${quote.addons.qa_pct}%)`}
              value={totals.qaHours}
            />
          ) : null}
          {quote.addons.pm_enabled ? (
            <Row
              label={`PM (${quote.addons.pm_pct}%)`}
              value={totals.pmHours}
            />
          ) : null}
          <Row
            label="Total estimated hours"
            value={totals.grandHours}
            strong
          />
          <div className="col-span-2 mt-2 flex items-baseline justify-between gap-4 border-t border-slate-300 pt-2">
            {/* No rate here: this previews the CLIENT document, which shows
                prices only (pricing plan default). Lines can carry different
                rates, so a single "at $X/h" would be false anyway. */}
            <dt className="font-semibold text-slate-800">Price</dt>
            <dd className="text-lg font-semibold tabular-nums text-slate-900">
              {formatAmount(pricing.grandAmount)}
            </dd>
          </div>
        </dl>
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
        <span className="font-medium text-slate-600">
          Export → Download PDF
        </span>{" "}
        saves a file directly. Use{" "}
        <span className="font-medium text-slate-600">Print…</span> only if you
        need the system print dialog, or{" "}
        <span className="font-medium text-slate-600">Excel</span> for a
        spreadsheet.
      </footer>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-2 text-sm",
        strong && "pt-3 text-base font-semibold text-slate-900",
      )}
    >
      <dt className={cn("text-slate-600", strong && "text-slate-900")}>
        {label}
      </dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
