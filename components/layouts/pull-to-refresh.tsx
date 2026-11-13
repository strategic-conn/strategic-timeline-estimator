"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";

import { refreshWorkspace } from "@/components/layouts/workspace-sync";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";

const TRIGGER = 64; // px of (damped) pull that refreshes on release
const MAX = 96;

/**
 * Pull down at the top of the page to re-read the workspace. The browser's own
 * pull-to-refresh can't fire here: the page scrolls inside `main`, not the
 * document. Touch only; ignored when the touch starts in a scrolled inner list,
 * a draggable card, or moves sideways (Gantt, stage board).
 */
export function PullToRefresh({ targetId }: { targetId: string }) {
  const [pull, setPull] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const busyRef = React.useRef(false);

  React.useEffect(() => {
    const main = document.getElementById(targetId);
    if (!main) return;
    let startX = 0;
    let startY = 0;
    let active = false; // this gesture may become a pull
    let dist = 0;

    const scrolledAbove = (el: Element | null) => {
      for (; el && el !== main.parentElement; el = el.parentElement) {
        if (el.scrollTop > 0) return true;
      }
      return false;
    };

    const onStart = (e: TouchEvent) => {
      const t = e.target as Element;
      active =
        !busyRef.current &&
        e.touches.length === 1 &&
        !scrolledAbove(t) &&
        !t.closest("[aria-roledescription], input, textarea, select, [data-no-pan]");
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dist = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!active) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (dist === 0 && (dy <= 0 || Math.abs(dx) > dy)) {
        active = false; // scrolling up or sideways — not a pull
        return;
      }
      dist = Math.min(MAX, dy * 0.5);
      if (e.cancelable) e.preventDefault(); // stop the rubber-band bounce
      setPull(dist);
    };

    const onEnd = () => {
      if (!active) return;
      active = false;
      if (dist < TRIGGER) {
        setPull(0);
        return;
      }
      busyRef.current = true;
      setBusy(true);
      setPull(TRIGGER);
      const authId = useAuthStore.getState().user.authId;
      const minSpin = new Promise((r) => setTimeout(r, 600));
      void Promise.all([authId ? refreshWorkspace(authId) : null, minSpin]).finally(() => {
        busyRef.current = false;
        setBusy(false);
        setPull(0);
      });
    };

    main.addEventListener("touchstart", onStart, { passive: true });
    main.addEventListener("touchmove", onMove, { passive: false });
    main.addEventListener("touchend", onEnd);
    main.addEventListener("touchcancel", onEnd);
    return () => {
      main.removeEventListener("touchstart", onStart);
      main.removeEventListener("touchmove", onMove);
      main.removeEventListener("touchend", onEnd);
      main.removeEventListener("touchcancel", onEnd);
    };
  }, [targetId]);

  if (!pull && !busy) return null;
  return (
    // Zero-height row under the header; the spinner hangs from it as you pull.
    <div
      className="pointer-events-none relative z-20 h-0 print:hidden"
      role="status"
      aria-label={busy ? "Refreshing" : "Pull to refresh"}
    >
      <span
        className="absolute left-1/2 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-background shadow-md"
        style={{ top: pull - 36 }}
      >
        <RefreshCw
          className={cn("size-4 text-primary", busy && "animate-spin")}
          style={busy ? undefined : { transform: `rotate(${pull * 4}deg)`, opacity: pull / TRIGGER }}
          aria-hidden
        />
      </span>
    </div>
  );
}
