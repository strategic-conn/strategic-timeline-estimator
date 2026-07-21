"use client";

import * as React from "react";
import { Star } from "lucide-react";

import { MAX_CONFIDENCE } from "@/types/skill.types";
import { cn } from "@/lib/utils";

type StarRatingProps = {
  value: number;
  /** Omit for a read-only display. */
  onChange?: (value: number) => void;
  /** Accessible label prefix, e.g. the skill name. */
  label?: string;
  className?: string;
};

/** 1–5 star rating. Read-only when `onChange` is omitted. */
export function StarRating({ value, onChange, label, className }: StarRatingProps) {
  const [hover, setHover] = React.useState<number | null>(null);
  const readOnly = !onChange;
  const shown = hover ?? value;

  return (
    <div
      className={cn("inline-flex items-center gap-0.5", className)}
      role={readOnly ? "img" : "radiogroup"}
      aria-label={
        readOnly ? `${label ? `${label}: ` : ""}${value} of ${MAX_CONFIDENCE}` : label
      }
      onMouseLeave={() => setHover(null)}
    >
      {Array.from({ length: MAX_CONFIDENCE }, (_, i) => {
        const n = i + 1;
        const filled = n <= shown;
        const star = (
          <Star
            className={cn(
              "size-4 transition-colors",
              filled
                ? "fill-amber-400 text-amber-400"
                : "fill-transparent text-muted-foreground/40",
            )}
            aria-hidden
          />
        );
        if (readOnly) return <span key={n}>{star}</span>;
        return (
          <button
            key={n}
            type="button"
            className="rounded-sm p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${label ? `${label}: ` : ""}${n} of ${MAX_CONFIDENCE}`}
            aria-pressed={n === value}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(null)}
            onClick={() => onChange(n)}
          >
            {star}
          </button>
        );
      })}
    </div>
  );
}
