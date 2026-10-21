"use client";

import * as React from "react";

/**
 * Click-and-drag to pan a horizontal scroller sideways with the mouse — the way
 * a board feels in Trello or Zoho, instead of hunting for a thin scrollbar.
 *
 * Mouse only: touch and touchpads already swipe the strip natively, and taking
 * over touch would fight that. A press on anything interactive — a drag handle,
 * link, button, field, or anything marked `data-no-pan` — is left alone, so
 * dnd-kit's card drags (started from their handles) and every click still work.
 * A press that moves less than a few pixels is a click; one that moves further
 * is a pan, and the click that ends it is swallowed so letting go over a card
 * doesn't also open it.
 */
const INTERACTIVE =
  "a, button, input, textarea, select, label, [role='button'], [role='menuitem'], [contenteditable='true'], [data-no-pan]";
const THRESHOLD = 5;

// A callback ref, not useRef + useEffect: a board that renders a skeleton
// first mounts its strip later, and a mount-time effect would miss it.
export function useDragScroll<T extends HTMLElement>(): React.RefCallback<T> {
  return React.useCallback((el: T | null) => {
    if (!el) return;

    let startX = 0;
    let startLeft = 0;
    let pointerId: number | null = null;
    let panning = false;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      if ((e.target as Element | null)?.closest(INTERACTIVE)) return;
      if (el.scrollWidth <= el.clientWidth) return; // nothing to pan
      pointerId = e.pointerId;
      startX = e.clientX;
      startLeft = el.scrollLeft;
      panning = false;
    };
    const onMove = (e: PointerEvent) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      if (!panning) {
        if (Math.abs(dx) < THRESHOLD) return;
        panning = true;
        el.setPointerCapture(pointerId);
        el.style.cursor = "grabbing";
        el.style.userSelect = "none";
        // Snap points would yank the strip back to a column mid-drag.
        el.style.scrollSnapType = "none";
      }
      el.scrollLeft = startLeft - dx;
      e.preventDefault();
    };
    const end = (e: PointerEvent) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
      pointerId = null;
      el.style.cursor = "";
      el.style.userSelect = "";
      el.style.scrollSnapType = "";
      if (panning) {
        // The click that follows a pan is not a click.
        const swallow = (ev: MouseEvent) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        el.addEventListener("click", swallow, { capture: true, once: true });
        window.setTimeout(() => el.removeEventListener("click", swallow, { capture: true }), 0);
      }
      panning = false;
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
    };
  }, []);
}
