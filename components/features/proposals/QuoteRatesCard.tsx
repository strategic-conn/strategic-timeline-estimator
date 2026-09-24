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
  rateSummary,
} from "@/lib/constants/proposal-estimator";
import { repriceToCurrentRates } from "@/lib/pricing/line-pricing";
import { useHourlyRatesStore } from "@/store/hourly-rates-store";
import { useProposalEstimatorStore } from "@/store/proposal-estimator-store";
import type { ClientQuote } from "@/types/proposal.types";

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
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Scale
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <div className="text-sm">
            <p className="font-medium">Hourly rates</p>
            <p className="text-muted-foreground">
              {`Priced at ${formatAmount(current.grandAmount)} ${rateSummary(current)}`.trim()}
              {". Each line keeps the rate it was added at."}
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
