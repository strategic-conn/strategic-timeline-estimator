"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Esther's face, animated by swapping stacked frames (public/esther/*.webp,
 * 256px; sources in design/esther/). Each mood plays base → in-between →
 * main and holds; idle blinks, thinking glances back at you now and then.
 * Reduced motion shows the main frame only.
 */

export type EstherMood = "idle" | "ask" | "think" | "success" | "sorry";

type Frame =
  | "base"
  | "blink-1"
  | "blink-2"
  | "ask-1"
  | "ask-2"
  | "think-1"
  | "think-2"
  | "success-1"
  | "success-2"
  | "success-3"
  | "sorry-1"
  | "sorry-2";

/** [frame, ms]. ms 0 = hold there. Steps from `loop` on repeat. */
export const MOODS: Record<EstherMood, { steps: [Frame, number][]; loop?: number }> = {
  idle: { steps: [["base", 3800], ["blink-1", 60], ["blink-2", 110], ["blink-1", 60]], loop: 0 },
  ask: { steps: [["ask-1", 120], ["ask-2", 0]] },
  think: {
    steps: [["think-1", 140], ["think-2", 2600], ["think-1", 140], ["base", 700], ["think-1", 140]],
    loop: 1,
  },
  success: { steps: [["success-1", 110], ["success-2", 140], ["success-3", 0]] },
  sorry: { steps: [["sorry-1", 160], ["sorry-2", 0]] },
};

/** The pose a mood settles on — all reduced motion shows. */
export function restingFrame(mood: EstherMood): Frame {
  const { steps } = MOODS[mood];
  return mood === "idle" ? "base" : mood === "think" ? "think-2" : steps[steps.length - 1][0];
}

const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReduced(on: () => void) {
  const q = window.matchMedia(REDUCED);
  q.addEventListener("change", on);
  return () => q.removeEventListener("change", on);
}

export function EstherFace({ mood = "idle", className }: { mood?: EstherMood; className?: string }) {
  const reduced = React.useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
  const { steps, loop } = MOODS[mood];
  // A new mood starts from its first frame.
  const [pos, setPos] = React.useState({ mood, at: 0 });
  const at = pos.mood === mood ? pos.at : 0;

  React.useEffect(() => {
    if (reduced) return;
    const ms = steps[at][1];
    const next = at + 1 < steps.length ? at + 1 : loop;
    if (!ms || next === undefined) return;
    const t = setTimeout(() => setPos({ mood, at: next }), ms);
    return () => clearTimeout(t);
  }, [mood, at, steps, loop, reduced]);

  const shown = reduced ? restingFrame(mood) : steps[at][0];
  // Every frame of this mood is mounted (so it's loaded before its turn);
  // base sits underneath in case one isn't yet.
  const frames = [...new Set<Frame>(["base", ...steps.map(([f]) => f)])];

  return (
    <span
      className={cn(
        "relative inline-block shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-indigo-100 to-violet-200",
        className,
      )}
      data-testid="esther-face"
      data-mood={mood}
      data-frame={shown}
      aria-hidden
    >
      {frames.map((f) => (
        // eslint-disable-next-line @next/next/no-img-element -- 14 KB stacked frames; next/image adds nothing here
        <img
          key={f}
          src={`/esther/esther-${f}.webp`}
          alt=""
          draggable={false}
          className={cn("absolute inset-0 size-full", f !== "base" && f !== shown && "opacity-0")}
        />
      ))}
    </span>
  );
}
