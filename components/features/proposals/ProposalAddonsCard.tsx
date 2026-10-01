"use client";

import { TriangleAlert } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PM_BASIS_OPTIONS,
  pmPctForBasis,
} from "@/lib/constants/proposal-estimator";
import { cn } from "@/lib/utils";
import type { ProposalAddons, ProposalPmBasis } from "@/types/proposal.types";
import { tourAnchor } from "@/lib/tours/ids";
import { EstimatorHelp } from "@/components/features/proposals/estimator-help";

type Row = {
  key: keyof ProposalAddons & `${string}_enabled`;
  pctKey: keyof ProposalAddons & `${string}_pct`;
  label: string;
  hint: string;
};

/** Order matters — these compound on top of each other (Responsive → Design → QA). */
const ROWS: Row[] = [
  {
    key: "responsive_enabled",
    pctKey: "responsive_pct",
    label: "Responsive",
    hint: "% of dev hours",
  },
  {
    key: "design_enabled",
    pctKey: "design_pct",
    label: "Design",
    hint: "% of dev + responsive",
  },
  {
    key: "qa_enabled",
    pctKey: "qa_pct",
    label: "QA",
    hint: "% of dev + responsive + design",
  },
];

type ProposalAddonsCardProps = {
  addons: ProposalAddons;
  onChange: (partial: Partial<ProposalAddons>) => void;
  /**
   * True when the estimate was scoped with the guided questionnaire, which
   * itemises Design, QA and PM as their own phases. These add-ons then describe
   * the same work a second time.
   */
  itemisedByScope?: boolean;
};

/** Add-ons whose hours a guided estimate already covers in its phases. */
const DOUBLE_COUNTED = [
  "responsive_enabled",
  "design_enabled",
  "qa_enabled",
  "pm_enabled",
] as const;

export function ProposalAddonsCard({
  addons,
  onChange,
  itemisedByScope = false,
}: ProposalAddonsCardProps) {
  // On a guided estimate these are off by default and should stay off; the
  // section previously looked identical either way, so "why is this all
  // switched off?" was a fair question with no answer on screen.
  const doubleCounting =
    itemisedByScope && DOUBLE_COUNTED.some((k) => addons[k]);

  return (
    <Card {...tourAnchor("estimate.addons")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Roll-up add-ons
          <Badge variant="secondary" className="text-[0.65rem]">
            from spreadsheet logic
          </Badge>
        </CardTitle>
        <CardDescription>
          Toggle and tune percentages. Applied in order: Responsive → Design →
          QA → PM.
        </CardDescription>
        <CardAction>
          <EstimatorHelp section="addons" />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pb-4">
        {itemisedByScope ? (
          doubleCounting ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <TriangleAlert className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">
                {/* Explicit space: JSX drops the one after </strong> when the
                    text that follows wraps onto the next line. */}
                <strong>Counted twice.</strong>{" "}
                Scope &amp; risk already itemises
                Design, QA and PM as phases, so these add-ons are charging for
                the same hours again.
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 shrink-0 text-xs"
                onClick={() =>
                  onChange({
                    responsive_enabled: false,
                    design_enabled: false,
                    qa_enabled: false,
                    pm_enabled: false,
                  })
                }
              >
                Turn them off
              </Button>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
              <strong className="text-foreground">Off on purpose.</strong>{" "}
              This estimate was scoped with the questionnaire, and its phases already
              include Design, QA and PM as real hours. Turning these on would
              count that work a second time — only do it for work the phases
              don&apos;t cover.
            </p>
          )
        ) : null}
        {ROWS.map((row) => {
          const enabled = addons[row.key];
          const pct = addons[row.pctKey];
          const inputId = `addon-${row.key}`;
          return (
            <div
              key={row.key}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-background/60 px-3 py-2"
            >
              <Checkbox
                id={inputId}
                checked={enabled}
                onCheckedChange={(v) =>
                  onChange({ [row.key]: v === true } as Partial<ProposalAddons>)
                }
              />
              <Label htmlFor={inputId} className="flex-1 cursor-pointer">
                <span className="block text-sm font-medium leading-tight">
                  {row.label}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {row.hint}
                </span>
              </Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={200}
                  step={1}
                  value={Number.isFinite(pct) ? pct : 0}
                  onChange={(e) => {
                    const next = Number.parseFloat(e.target.value);
                    onChange({
                      [row.pctKey]: Number.isFinite(next) ? next : 0,
                    } as Partial<ProposalAddons>);
                  }}
                  className="h-8 w-16 text-right tabular-nums"
                  aria-label={`${row.label} percentage`}
                  disabled={!enabled}
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            </div>
          );
        })}

        {/* PM is special: preset basis (Simple 10% / Complex 15%) or custom. */}
        <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-background/60 px-3 py-2.5">
          <div className="flex items-center gap-3">
            <Checkbox
              id="addon-pm_enabled"
              checked={addons.pm_enabled}
              onCheckedChange={(v) => onChange({ pm_enabled: v === true })}
            />
            <Label
              htmlFor="addon-pm_enabled"
              className="flex-1 cursor-pointer"
            >
              <span className="block text-sm font-medium leading-tight">
                PM
              </span>
              <span className="block text-xs text-muted-foreground">
                % of everything above
              </span>
            </Label>
            <span className="text-sm font-medium tabular-nums text-muted-foreground">
              {addons.pm_pct}%
            </span>
          </div>

          <div
            className={cn(
              "flex flex-wrap items-center gap-2 pl-7",
              !addons.pm_enabled && "pointer-events-none opacity-50",
            )}
          >
            <div
              role="group"
              aria-label="PM basis"
              className="inline-flex rounded-lg border border-border/70 bg-muted/40 p-0.5"
            >
              {PM_BASIS_OPTIONS.map((opt) => {
                const active = addons.pm_basis === opt.value;
                return (
                  <Button
                    key={opt.value}
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-pressed={active}
                    disabled={!addons.pm_enabled}
                    onClick={() => {
                      const basis = opt.value as ProposalPmBasis;
                      onChange({
                        pm_basis: basis,
                        pm_pct: pmPctForBasis(basis, addons.pm_pct),
                      });
                    }}
                    className={cn(
                      "h-7 rounded-md px-2.5 text-xs",
                      active
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground",
                    )}
                    title={opt.hint}
                  >
                    {opt.label}
                  </Button>
                );
              })}
            </div>
            {addons.pm_basis === "custom" ? (
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={200}
                  step={1}
                  value={Number.isFinite(addons.pm_pct) ? addons.pm_pct : 0}
                  onChange={(e) => {
                    const next = Number.parseFloat(e.target.value);
                    onChange({ pm_pct: Number.isFinite(next) ? next : 0 });
                  }}
                  className="h-8 w-16 text-right tabular-nums"
                  aria-label="PM percentage"
                  disabled={!addons.pm_enabled}
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                {PM_BASIS_OPTIONS.find((o) => o.value === addons.pm_basis)?.hint}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
