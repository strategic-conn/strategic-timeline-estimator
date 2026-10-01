"use client";

import * as React from "react";
import { CircleHelp } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * "What is this section?" — the ? in a section's top-right corner.
 *
 * A click popover, not a hover tooltip (that is `HelpTip`, for one-line hints):
 * it has to open on a phone, and section help runs to a few paragraphs.
 * Height is capped to the room Radix measures on the side it opens, so a
 * trigger near the top of the screen never pushes the title off it, and it
 * keeps 16px clear of every edge at 375px.
 *
 * Put it in `<CardAction>` when the card has a header; otherwise use
 * `corner` and give the card `relative` plus right padding on its content.
 */
export function SectionHelp({
  label,
  title,
  children,
  corner = false,
  className,
}: {
  /** Names the section for screen readers: "About {label}". */
  label: string;
  title: string;
  children: React.ReactNode;
  /** Pin to the top-right of a `relative` parent with no header. */
  corner?: boolean;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={cn(
            "size-7 shrink-0 rounded-full text-muted-foreground hover:text-foreground",
            // Same spot CardAction lands in (card py-4 + header px-4), so corner
            // and header buttons line up down a column of cards.
            corner && "absolute right-4 top-4 z-10",
            className,
          )}
          aria-label={`About ${label}`}
        >
          <CircleHelp className="size-4" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        collisionPadding={16}
        className="max-h-[min(28rem,var(--radix-popover-content-available-height))] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto text-sm"
      >
        <p className="font-medium">{title}</p>
        <div className="mt-1 space-y-2 text-xs leading-relaxed text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
          {children}
        </div>
      </PopoverContent>
    </Popover>
  );
}
