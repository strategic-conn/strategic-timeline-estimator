"use client";

import * as React from "react";
import { Scale } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatAmount,
  quotePricing,
} from "@/lib/constants/proposal-estimator";
import { formatRate } from "@/lib/pricing/hourly-rates";
import {
  rateBreakdown,
  repriceToCurrentRates,
  type RateBreakdown,
} from "@/lib/pricing/line-pricing";
import { useHourlyRatesStore } from "@/store/hourly-rates-store";
import { useProposalEstimatorStore } from "@/store/proposal-estimator-store";
import type { ClientQuote } from "@/types/proposal.types";
import { tourAnchor } from "@/lib/tours/ids";
import { EstimatorHelp } from "@/components/features/proposals/estimator-help";

/**
 * Adjust tab → which rates this estimate is priced at, and the deliberate way
 * to move it to today's.
 *
 * Every line snapshots the rate it was priced at (pricing plan decision 1), so
 * an admin editing a rate never reprices a quote that was already sent. This
 * card is the other half: it says when today's rates would change the price,
 * and re-prices only on an explicit, previewed confirm.
 *
 * ⚠️ The confirm writes the SAME `preview` object the dialog rendered — never a
 * recompute at click time — like Start project, Sync schedule and Create PO.
 */
export function QuoteRatesCard({ quote }: { quote: ClientQuote }) {
  const rates = useHourlyRatesStore((s) => s.rates);
  const ratesLoaded = useHourlyRatesStore((s) => s.loaded);
  const applyCurrentRates = useProposalEstimatorStore(
    (s) => s.applyCurrentRates,
  );
  const [open, setOpen] = React.useState(false);

  const current = React.useMemo(() => quotePricing(quote), [quote]);
  const breakdown = React.useMemo(() => rateBreakdown(quote), [quote]);
  const preview = React.useMemo(
    () => repriceToCurrentRates(quote, rates),
    [quote, rates],
  );
  const repriced = React.useMemo(
    () =>
      quotePricing({
        ...quote,
        line_items: preview.line_items,
        addons: { ...quote.addons, rates: preview.addonRates },
      }),
    [quote, preview],
  );

  // Until the table has loaded, "today's rates" would be the workbook seed, not
  // the admin's numbers — so say nothing rather than claim a false difference.
  const moves = ratesLoaded && repriced.grandAmount !== current.grandAmount;
  const delta = repriced.grandAmount - current.grandAmount;

  if (!quote.line_items.length) return null;

  return (
    <Card className="relative" {...tourAnchor("estimate.rates")}>
      <EstimatorHelp section="rates" corner />
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:pr-12">
        <div className="flex items-start gap-3 max-sm:pr-8">
          <Scale
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <div className="text-sm">
            <p className="font-medium">Hourly rates</p>
            <p className="text-muted-foreground">
              Hours by role and skill level, at the rate each line was added at.
            </p>
            {moves ? (
              <p className="mt-1 text-amber-700 dark:text-amber-400">
                {`At today's rates this estimate would be ${formatAmount(repriced.grandAmount)} (${delta > 0 ? "+" : "−"}${formatAmount(Math.abs(delta))}).`}
              </p>
            ) : ratesLoaded ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Matches today&apos;s rates.
              </p>
            ) : null}
            <RateBreakdownTable breakdown={breakdown} />
          </div>
        </div>
        {moves ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setOpen(true)}
          >
            Update to current rates
          </Button>
        ) : null}
      </CardContent>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update to current rates?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  {`${formatAmount(current.grandAmount)} → `}
                  <span className="font-semibold text-foreground">
                    {formatAmount(repriced.grandAmount)}
                  </span>
                  {` · ${preview.changedLines} line${preview.changedLines === 1 ? "" : "s"} re-priced, plus add-on rates.`}
                </p>
                <p>
                  Hours don&apos;t change — only the rate each hour is priced
                  at.
                </p>
                {quote.zoho?.deal_id ? (
                  <p>
                    The Zoho deal keeps its current amount until you Send to
                    Zoho again; the CRM amount badge will show the difference.
                  </p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => applyCurrentRates(quote.id, preview)}
            >
              Update prices
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

/**
 * The quote's price, broken down by who does the work: role + level, its
 * rate, hours and amount, then the risk buffer and the total. Replaces the old
 * "avg $X/h", which mixed every rate into one number nobody had chosen.
 * Wide enough for four columns from ~320px; scrolls inside the card below that.
 */
function RateBreakdownTable({ breakdown }: { breakdown: RateBreakdown }) {
  const { rows, buffer } = breakdown;
  if (!rows.length) return null;
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full min-w-[19rem] text-xs tabular-nums">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="px-2.5 py-1.5 text-left font-medium">Role · level</th>
            <th className="px-2 py-1.5 text-right font-medium">Rate</th>
            <th className="px-2 py-1.5 text-right font-medium">Hours</th>
            <th className="px-2.5 py-1.5 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.label}|${r.rate}`} className="border-t border-border/50">
              <td className="px-2.5 py-1.5">{r.label}</td>
              <td className="px-2 py-1.5 text-right">{`${formatRate(r.rate)}/h`}</td>
              <td className="px-2 py-1.5 text-right">{`${r.hours} h`}</td>
              <td className="px-2.5 py-1.5 text-right">{formatAmount(r.amount)}</td>
            </tr>
          ))}
          {buffer ? (
            <tr className="border-t border-border/50 text-muted-foreground">
              <td className="px-2.5 py-1.5">{`Schedule risk buffer (${buffer.pct}%)`}</td>
              <td className="px-2 py-1.5 text-right">{`+${buffer.pct}%`}</td>
              <td className="px-2 py-1.5 text-right">{`${buffer.hours} h`}</td>
              <td className="px-2.5 py-1.5 text-right">{formatAmount(buffer.amount)}</td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr className="border-t border-border/60 bg-muted/20 font-medium text-foreground">
            <td className="px-2.5 py-1.5">Total</td>
            <td />
            <td className="px-2 py-1.5 text-right">{`${breakdown.totalHours} h`}</td>
            <td className="px-2.5 py-1.5 text-right">{formatAmount(breakdown.totalAmount)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
