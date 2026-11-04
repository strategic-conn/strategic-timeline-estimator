"use client";

import { format, parseISO } from "date-fns";
import * as React from "react";

import { quoteIsFrozen } from "@/lib/sync/estimate-project-sync";
import {
  previewFinish,
  strategyOf,
  useProposalEstimatorStore,
} from "@/store/proposal-estimator-store";
import { useTasksDataStore } from "@/store/tasks-store";
import { useTeamStore } from "@/store/team-store";
import type { ClientQuote } from "@/types/proposal.types";

export const formatLaunchDay = (iso: string) => {
  const d = parseISO(iso);
  return Number.isNaN(d.getTime()) ? iso : format(d, "MMM d, yyyy");
};

/**
 * An estimate's people plan and its ONE launch date: what Start project would
 * build (`previewConversion`), or the date frozen when it was approved. Every
 * surface that names a launch date reads it here, so they cannot disagree. The
 * phase chart's own end date is a different figure (one person at a time, plus
 * DNS time) and is never shown as the launch.
 */
export function useQuoteSchedule(quote: ClientQuote | null | undefined) {
  const previewConversion = useProposalEstimatorStore((s) => s.previewConversion);
  // The plan reads the roster and everyone's open work; re-forecast when they load.
  const members = useTeamStore((s) => s.members);
  const tasks = useTasksDataStore((s) => s.tasks);
  const strategy = quote ? strategyOf(quote) : null;

  const preview = React.useMemo(
    () =>
      quote
        ? previewConversion(quote.id, {
            seedTasks: true,
            strategy: strategy === "none" || !strategy ? undefined : strategy,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- what the forecast reads
    [quote?.id, quote?.line_items, quote?.discovery, quote?.addons, quote?.risk_buffer_pct, quote?.requirements_unclear, strategy, members, tasks, previewConversion],
  );

  const finish = preview ? previewFinish(preview) : null;
  const quoted = quote?.schedule_plan?.quoted_finish ?? null;
  const launch = quote && quoteIsFrozen(quote) && quoted ? quoted : finish;
  return { preview, finish, quoted, launch: launch ? formatLaunchDay(launch) : null };
}
