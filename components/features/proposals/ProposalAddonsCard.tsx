"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
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
};

export function ProposalAddonsCard({
  addons,
  onChange,
}: ProposalAddonsCardProps) {
  return (
    <Card>
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
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pb-4">
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
