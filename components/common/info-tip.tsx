"use client";

import * as React from "react";
import { Info } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * The (i) beside a form label: opens on HOVER with a mouse and on TAP / CLICK
 * everywhere, so it works on a phone too (a plain tooltip never opens on
 * touch — the reason `SectionHelp` is a click popover).
 *
 * A click "pins" it open: moving the mouse away then leaves it up until you
 * click again, press Escape or click elsewhere. Hover-opened, it closes when
 * the pointer leaves both the button and the panel.
 */
export function InfoTip({
  label,
  children,
  className,
}: {
  /** Names what it explains, for screen readers: "About {label}". */
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  // A ref, not state: a quick second tap can arrive before the re-render that
  // would refresh a state value in this closure, and then it re-opened instead
  // of closing (seen ~1 run in 3 on a phone).
  const pinned = React.useRef(false);
  const closeTimer = React.useRef<number | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  // A short delay lets the pointer travel from the button onto the panel.
  const closeSoon = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  };
  React.useEffect(() => cancelClose, []);

  // After a tap, browsers fire a synthetic "mouse" pointerenter at the same
  // spot. Taken as a hover, it re-opened the panel the tap had just closed
  // (it landed on the panel while it faded out; ~1 tap in 10 on a phone).
  const lastTouch = React.useRef(0);
  const isRealMouse = (e: React.PointerEvent) =>
    e.pointerType === "mouse" && Date.now() - lastTouch.current > 800;
  const onTouch = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") lastTouch.current = Date.now();
  };

  const onEnter = (e: React.PointerEvent) => {
    if (!isRealMouse(e)) return; // touch opens on tap instead
    cancelClose();
    setOpen(true);
  };
  // Over the panel the mouse only KEEPS it open — it never re-opens it.
  const onEnterPanel = (e: React.PointerEvent) => {
    if (isRealMouse(e)) cancelClose();
  };
  const onLeave = (e: React.PointerEvent) => {
    if (!isRealMouse(e) || pinned.current) return;
    closeSoon();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Radix asks to close on Escape / outside click; it never asks to open
        // here, because the trigger's own click is handled below.
        if (!next) {
          setOpen(false);
          pinned.current = false;
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`About ${label}`}
          aria-expanded={open}
          onPointerDown={onTouch}
          onPointerEnter={onEnter}
          onPointerLeave={onLeave}
          onClick={(e) => {
            e.preventDefault();
            cancelClose();
            pinned.current = !pinned.current;
            setOpen(pinned.current);
          }}
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60",
            open && "text-foreground",
            className,
          )}
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        collisionPadding={16}
        onPointerDown={onTouch}
        onPointerEnter={onEnterPanel}
        onPointerLeave={onLeave}
        // Hover must not steal focus from the field being filled in.
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-[min(20rem,calc(100vw-2rem))] px-3 py-2.5 text-xs leading-relaxed"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
