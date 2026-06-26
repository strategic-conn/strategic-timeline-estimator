"use client";

import * as React from "react";
import { Check, Plus, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  findMissingDependencies,
  type CatalogItem,
  type ProposalPlatform,
} from "@/lib/proposal-catalog";

type ProposalDependencyAlertProps = {
  platform: ProposalPlatform;
  /** Catalog ids already present on the quote. */
  selectedCatalogIds: Set<number>;
  onAdd: (items: CatalogItem[]) => void;
};

/**
 * Surfaces prerequisite catalog tasks the coordinator likely forgot — e.g.
 * "CRM API Setup" needs a "Form Setup" task. Sourced from the workbook's
 * dependency notes. Renders nothing when the scope is complete.
 */
export function ProposalDependencyAlert({
  platform,
  selectedCatalogIds,
  onAdd,
}: ProposalDependencyAlertProps) {
  const missing = React.useMemo(
    () => findMissingDependencies(platform, selectedCatalogIds),
    [platform, selectedCatalogIds],
  );

  if (missing.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-sm text-emerald-700 dark:text-emerald-400">
        <Check className="size-4 shrink-0" aria-hidden />
        <span>No missing prerequisites — the scope looks complete.</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
      <div className="flex items-start gap-2">
        <TriangleAlert
          className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            {missing.length === 1
              ? "1 prerequisite task may be missing"
              : `${missing.length} prerequisite tasks may be missing`}
          </p>
          <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
            Some selected tasks usually depend on these. Add any that apply.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 gap-1.5 border-amber-500/40 bg-background/60 text-xs"
          onClick={() => onAdd(missing.map((m) => m.item))}
        >
          <Plus className="size-3.5" aria-hidden />
          Add all
        </Button>
      </div>

      <ul className="mt-3 flex flex-col gap-1.5">
        {missing.map(({ item, requiredBy }) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-background/60 px-2.5 py-1.5"
          >
            <span className="text-sm font-medium">{item.name}</span>
            <span className="tabular-nums text-xs text-muted-foreground">
              {item.base_hours} h base
            </span>
            <span className="basis-full text-xs text-muted-foreground sm:basis-auto">
              needed by {requiredBy.join(", ")}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto h-7 gap-1 px-2 text-xs"
              onClick={() => onAdd([item])}
            >
              <Plus className="size-3.5" aria-hidden />
              Add
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
