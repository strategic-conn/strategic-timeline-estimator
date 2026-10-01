"use client";

import * as React from "react";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { tourAnchor, type TourTarget } from "@/lib/tours/ids";

/** Round numbers a coordinator actually reaches for. 0 is "no contingency". */
const PRESETS = [0, 10, 15, 20, 30] as const;

export const MAX_RISK_BUFFER_PCT = 100;

/** Clamp + round to what the column accepts (0–100 integer, migration 0036). */
export function clampRiskBuffer(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_RISK_BUFFER_PCT, Math.round(value)));
}

/**
 * Schedule contingency — the percentage a coordinator adds for what they cannot
 * itemise.
 *
 * Shared by the Estimator (Adjust tab) and a live project, so the two cannot
 * describe the same number differently.
 *
 * ⚠️ The copy carries real weight here. Next to this control sits
 * "Requirements not pinned down yet", which DOES reprice the quote — so this one
 * has to say plainly that it moves dates and not money, or a coordinator will
 * reasonably assume a risk percentage is padding the bill.
 */
export function RiskBufferCard({
  value,
  onChange,
  disabled,
  /** e.g. "45 business days" → "54 business days". Rendered when supplied. */
  baseDays,
  bufferedDays,
  /** Extra line under the presets — used by the project page for its finish date. */
  footer,
  title = "Schedule risk buffer",
  description = "Contingency for the things you cannot itemise — a slow client, an undocumented API, a scope surprise.",
  tourId,
  help,
}: {
  value: number;
  onChange: (pct: number) => void;
  disabled?: boolean;
  baseDays?: number;
  bufferedDays?: number;
  footer?: React.ReactNode;
  title?: string;
  description?: string;
  /** Onboarding-tour anchor; the card appears on two pages under two ids. */
  tourId?: TourTarget;
  /** A section-help "?" for the top-right corner. */
  help?: React.ReactNode;
}) {
  const pct = clampRiskBuffer(value);
  // Local text state so the field can be empty mid-typing without snapping to 0
  // under the cursor. Committed on blur / Enter.
  const [draft, setDraft] = React.useState(String(pct));
  React.useEffect(() => setDraft(String(pct)), [pct]);

  const commit = () => {
    const next = clampRiskBuffer(Number(draft));
    setDraft(String(next));
    if (next !== pct) onChange(next);
  };

  return (
    <Card
      className={cn(pct > 0 && "border-primary/30 bg-primary/[0.03]")}
      {...(tourId ? tourAnchor(tourId) : {})}
    >
      <CardHeader className="gap-1.5">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="size-4 text-muted-foreground" aria-hidden />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
        {help ? <CardAction>{help}</CardAction> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Wraps rather than scrolling: six controls need ~360px and a 375px
            phone gives ~343px inside the card padding. */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="risk-buffer" className="text-xs">
              Buffer
            </Label>
            <div className="flex items-center gap-1.5">
              <Input
                id="risk-buffer"
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_RISK_BUFFER_PCT}
                value={draft}
                disabled={disabled}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                className="w-20 tabular-nums"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <Button
                key={p}
                type="button"
                size="sm"
                variant={p === pct ? "default" : "outline"}
                disabled={disabled}
                onClick={() => onChange(p)}
                className="tabular-nums"
              >
                {p === 0 ? "None" : `${p}%`}
              </Button>
            ))}
          </div>
        </div>

        {baseDays !== undefined && bufferedDays !== undefined ? (
          <p className="text-sm tabular-nums">
            <span className="text-muted-foreground">Timeline </span>
            <span className="font-medium">{baseDays}</span>
            <span className="text-muted-foreground"> business days</span>
            {pct > 0 ? (
              <>
                <span className="text-muted-foreground"> + {pct}% = </span>
                <span className="font-medium text-primary">{bufferedDays}</span>
                <span className="text-muted-foreground"> business days</span>
              </>
            ) : null}
          </p>
        ) : null}

        {footer}

        <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Moves <span className="font-medium text-foreground">dates only</span>.
          Hours and the quoted price are unchanged — to price for risk instead,
          use <span className="font-medium text-foreground">Requirements not
          pinned down yet</span>.
        </p>
      </CardContent>
    </Card>
  );
}
