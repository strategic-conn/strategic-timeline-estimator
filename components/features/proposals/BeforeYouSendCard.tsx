"use client";

import { CheckCircle2, Info, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { quoteIsFrozen } from "@/lib/constants/proposal-estimator";
import { sendChecks, type SendCheck } from "@/lib/estimator/send-checks";
import { cn } from "@/lib/utils";
import type { ClientQuote } from "@/types/proposal.types";

/**
 * Review → "Before you send": what this estimate is missing that the client
 * would notice later — unconfirmed custom hours, and for a line-items-only
 * estimate the things the questionnaire would have covered (PM, QA,
 * assumptions, content/SEO). Prompts, never gates: each has a one-click fix.
 * Hidden once the estimate is approved (its price is agreed).
 */
export function BeforeYouSendCard({
  quote,
  onFix,
}: {
  quote: ClientQuote;
  onFix: (where: SendCheck["fix"]) => void;
}) {
  if (quoteIsFrozen(quote) || !quote.line_items.some((li) => li.title.trim())) return null;
  const checks = sendChecks(quote);

  if (!checks.length) {
    return (
      <p
        className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300"
        data-testid="before-you-send"
      >
        <CheckCircle2 className="size-4 shrink-0" aria-hidden />
        Before you send: nothing flagged.
      </p>
    );
  }

  return (
    <section
      aria-label="Before you send"
      className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5"
      data-testid="before-you-send"
    >
      <h3 className="text-sm font-medium">
        {`Before you send · ${checks.length} thing${checks.length === 1 ? "" : "s"} to check`}
      </h3>
      <ul className="mt-2 flex flex-col divide-y divide-border/60">
        {checks.map((c) => (
          <li key={c.id} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 py-2" data-check={c.id}>
            {c.tone === "warn" ? (
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            ) : (
              <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-medium", c.tone === "warn" && "text-amber-900 dark:text-amber-200")}>
                {c.title}
              </p>
              <p className="text-xs text-muted-foreground">{c.detail}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 bg-background max-sm:ml-7"
              onClick={() => onFix(c.fix)}
            >
              {c.fixLabel}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
