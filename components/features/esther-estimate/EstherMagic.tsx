"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { EstherFace } from "@/components/features/esther-estimate/EstherFace";

/**
 * Esther at work: her face (thinking) in an orbiting ring of the app's primary → chart-2 gradient,
 * twinkling sparkles, a progress bar and one line saying what she's doing.
 *
 * Claude doesn't report progress mid-answer, so both are time-based — but
 * honestly: the bar eases toward ~95% around the usual duration and never
 * reaches the end until the answer actually arrives (the screen changes
 * then), and the status line holds on its last step however long it takes.
 * The elapsed clock tells a coordinator the page hasn't frozen.
 */

const STEPS = {
  reading: [
    "Opening the document…",
    "Reading every page…",
    "Picking out what the client wants…",
    "Checking dates, deadlines and the platform…",
    "Noting what's still unclear…",
  ],
  drafting: [
    "Matching each request to your catalog…",
    "Sizing the work that isn't in the catalog…",
    "Pricing it at your team's rates…",
    "Adding project management and testing…",
    "Writing the scope assumptions…",
  ],
} as const;

/** Usual seconds per phase (measured on real briefs, 2026-11-24). */
const EXPECTED = { reading: 40, drafting: 110 } as const;
/** When each step's line appears, as a share of the usual duration. */
const STEP_AT = [0, 0.12, 0.35, 0.6, 0.85];

/** 0 → ~95%, about 80% at the usual duration; never 100 by itself. */
export function progressAt(seconds: number, expected: number): number {
  return 95 * (1 - Math.exp(-seconds / (expected * 0.6)));
}

const SPARKLES = [
  { top: "4%", left: "18%", delay: "0s", size: "size-3" },
  { top: "14%", left: "86%", delay: "0.7s", size: "size-2.5" },
  { top: "78%", left: "8%", delay: "1.3s", size: "size-2" },
  { top: "84%", left: "80%", delay: "0.4s", size: "size-3" },
  { top: "46%", left: "-4%", delay: "1.8s", size: "size-2" },
];

export function EstherMagic({
  phase,
  fileName,
}: {
  phase: keyof typeof STEPS;
  fileName: string;
}) {
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setElapsed((Date.now() - started) / 1000), 500);
    return () => clearInterval(t);
  }, []);
  const seconds = Math.floor(elapsed);
  const expected = EXPECTED[phase];
  const steps = STEPS[phase];
  const current = STEP_AT.filter((s) => elapsed >= s * expected).length - 1;
  const pct = progressAt(elapsed, expected);
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center sm:gap-6 sm:py-6">
      <div className="relative size-24 sm:size-28" aria-hidden>
        {/* Glow */}
        <div className="absolute inset-3 rounded-full bg-gradient-to-br from-primary to-chart-2 opacity-40 blur-xl motion-safe:animate-pulse" />
        {/* Orbiting ring */}
        <div
          className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,var(--color-primary),var(--color-chart-2),transparent_75%)] [mask:radial-gradient(farthest-side,transparent_calc(100%-4px),#000_calc(100%-3px))]"
          style={{ animation: "esther-orbit 2.4s linear infinite" }}
        />
        {/* Esther herself, thinking */}
        <EstherFace mood="think" className="absolute inset-2 shadow-lg shadow-primary/30" />
        {SPARKLES.map((s, i) => (
          <Sparkles
            key={i}
            className={cn("absolute text-chart-2", s.size)}
            style={{
              top: s.top,
              left: s.left,
              animation: `esther-twinkle 2.2s ease-in-out ${s.delay} infinite`,
            }}
          />
        ))}
      </div>

      <div className="flex w-full flex-col gap-1">
        <p
          className="bg-[linear-gradient(90deg,var(--color-foreground)_40%,var(--color-primary)_50%,var(--color-foreground)_60%)] bg-[length:200%_100%] bg-clip-text text-base font-semibold text-transparent sm:text-lg dark:bg-[linear-gradient(90deg,var(--color-foreground)_40%,var(--color-indigo-300)_50%,var(--color-foreground)_60%)]"
          style={{ animation: "esther-shimmer 2.5s linear infinite" }}
        >
          {phase === "reading" ? "Esther is reading the document" : "Esther is drafting your estimate"}
        </p>
        <p className="max-w-full truncate px-2 text-sm text-muted-foreground">{fileName}</p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-2.5 px-1" data-testid="esther-progress">
        <div
          role="progressbar"
          aria-label={phase === "reading" ? "Reading the document" : "Drafting the estimate"}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-primary),var(--color-chart-2),var(--color-primary))] bg-[length:200%_100%] transition-[width] duration-500 ease-linear"
            style={{ width: `${pct}%`, animation: "esther-shimmer 2s linear infinite" }}
          />
        </div>
        {/* One line, replaced as she moves on. Read out to screen readers. */}
        <p className="min-h-10 text-sm text-muted-foreground sm:min-h-5" role="status" aria-live="polite">
          <span key={current} className="inline-block animate-in fade-in-0 slide-in-from-bottom-1 duration-500" data-testid="esther-status">
            {steps[current]}
          </span>
        </p>
      </div>

      <p className="text-xs tabular-nums text-muted-foreground">
        {`${clock} · usually ${phase === "reading" ? "under a minute" : "about a minute or two"}`}
      </p>
    </div>
  );
}
