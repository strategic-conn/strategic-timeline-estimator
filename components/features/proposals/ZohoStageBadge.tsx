"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * The Zoho deal stage on an imported estimate.
 *
 * Colour tracks how far along the pipeline the deal is; an unrecognised stage
 * (sales can add stages without telling us) still renders, just neutrally —
 * showing the CRM's own words is more useful than hiding them.
 */
const STAGE_CLASS: Record<string, string> = {
  "Proposal Requested":
    "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
  Discovery:
    "border-transparent bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300",
  "Proposal Sent":
    "border-transparent bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300",
  Negotiation:
    "border-transparent bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-300",
  "Verbal Yes":
    "border-transparent bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300",
  "Project Completed":
    "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
  "Closed Won":
    "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
  "Closed Lost":
    "border-transparent bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300",
};

const NEUTRAL =
  "border-transparent bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";

export function ZohoStageBadge({
  stage,
  syncedAt,
  className,
}: {
  stage: string | null | undefined;
  /** When the stage was last confirmed against Zoho; falls back to import time. */
  syncedAt?: string | null;
  className?: string;
}) {
  const label = stage?.trim();
  if (!label) return null;
  // Sales can move a deal in Zoho without telling us, so the badge says when we
  // last checked rather than implying it is live.
  const asOf = syncedAt ? new Date(syncedAt) : null;
  return (
    <Badge
      className={cn("gap-1 font-normal", STAGE_CLASS[label] ?? NEUTRAL, className)}
      title={
        asOf && !Number.isNaN(asOf.getTime())
          ? `Zoho deal stage, as of ${asOf.toLocaleString()}`
          : "Zoho deal stage"
      }
    >
      <span className="text-[0.65rem] font-semibold uppercase tracking-wide opacity-60">
        Zoho
      </span>
      {label}
    </Badge>
  );
}
