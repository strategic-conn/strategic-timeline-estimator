"use client";

import type { AllowedButtons, Driver, DriveStep } from "driver.js";

import { findTourTarget, type TourTarget } from "@/lib/tours/ids";
import {
  resolveCopy,
  TOURS,
  tourAllowed,
  type TourContext,
  type TourDef,
  type TourStep,
} from "@/lib/tours/tours";

export type TourEnd = {
  status: "completed" | "dismissed";
  /** Index of the last step shown (0-based), and its target, for "Resume". */
  lastIndex: number;
  lastTarget?: TourTarget;
};

export type RunOutcome = "started" | "empty" | "blocked";

let current: { driver: Driver; finish: () => void } | null = null;

export function isTourRunning(): boolean {
  return current?.driver.isActive() ?? false;
}

/** End whatever tour is on screen (route change, a new tour starting). */
export function stopTour(): void {
  const c = current;
  current = null;
  if (!c) return;
  if (c.driver.isActive()) c.driver.destroy();
  c.finish();
}

/** Below md the popover is a bottom/top sheet — same breakpoint as the tab bar. */
export function isMobileViewport(): boolean {
  return typeof window !== "undefined" && window.innerWidth < 768;
}

/**
 * The tour for the page on screen, or null.
 *
 * Several tours can share a route (the Estimator's tabs, Mine/Team views).
 * The one whose `scope` anchor is visible wins; an unscoped tour is the
 * fallback. Reads the DOM, so call it when you need the answer, not in render.
 */
export function pageTourFor(pathname: string, ctx: TourContext): TourDef | null {
  const matches = TOURS.filter((t) => t.match(pathname) && tourAllowed(t, ctx));
  if (!matches.length) return null;
  const scoped = matches.find((t) => t.scope && findTourTarget(t.scope));
  if (scoped) return scoped;
  return matches.find((t) => !t.scope) ?? null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function waitFor(cond: () => boolean, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (cond()) return resolve(true);
      if (Date.now() - started >= timeoutMs) return resolve(false);
      setTimeout(tick, 100);
    };
    tick();
  });
}

/** Radix dialogs, sheets and alert dialogs mark themselves open this way. */
function modalOpen(): boolean {
  return Boolean(
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
    ),
  );
}

/**
 * Keys the tour itself needs. Everything else is swallowed while a tour is
 * open: the task board opens its create dialog on "n", and a tour must never
 * be the thing that starts a write (plan §3.1).
 */
const TOUR_KEYS = new Set(["Tab", "Escape", "ArrowLeft", "ArrowRight", "Enter", " "]);
function swallowPageShortcuts(e: KeyboardEvent) {
  if (TOUR_KEYS.has(e.key)) return;
  e.stopImmediatePropagation();
}

/**
 * Run a tour. Waits up to a few seconds for the page to render its anchors
 * (stores hydrate async), drops steps this person can't act on or can't see,
 * then hands the rest to driver.js.
 *
 * - "empty": nothing on the page to point at (yet).
 * - "blocked": a dialog is open. A tour on top of a Radix modal would be
 *   unclickable (the modal makes everything outside it inert).
 */
export async function runTour(
  def: TourDef,
  ctx: TourContext,
  opts: { startAt?: TourTarget; onEnd: (end: TourEnd) => void },
): Promise<RunOutcome> {
  stopTour();

  const candidates = def.steps.filter((s) => !s.when || s.when(ctx));
  const targets = candidates.flatMap((s) => (s.target ? [s.target] : []));
  await waitFor(
    () =>
      def.scope
        ? Boolean(findTourTarget(def.scope))
        : targets.length === 0 || targets.some((t) => Boolean(findTourTarget(t))),
    6000,
  );
  // One more beat: cards that render just after the first anchor (a list
  // below a header) should be counted, not skipped.
  await new Promise((r) => setTimeout(r, 200));

  if (modalOpen()) return "blocked";

  const steps: { step: TourStep; el?: HTMLElement }[] = [];
  for (const step of candidates) {
    if (!step.target) {
      steps.push({ step });
      continue;
    }
    const el = findTourTarget(step.target);
    if (el) steps.push({ step, el });
  }
  if (targets.length > 0 && !steps.some((s) => s.el)) return "empty";
  if (!steps.length) return "empty";

  const { driver } = await import("driver.js");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const returnFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const total = steps.length;
  let lastIndex = 0;

  const startIndex = opts.startAt
    ? Math.max(0, steps.findIndex((s) => s.step.target === opts.startAt))
    : 0;

  const driveSteps: DriveStep[] = steps.map(({ step, el }, i) => ({
    element: el,
    popover: {
      title: escapeHtml(resolveCopy(step.title, ctx)),
      description: escapeHtml(resolveCopy(step.body, ctx)),
      // driver.js renders an enabled-looking Back on the first step.
      ...(i === 0 ? { showButtons: ["next", "close"] as AllowedButtons[] } : {}),
    },
  }));

  window.addEventListener("keydown", swallowPageShortcuts, true);

  const d = driver({
    steps: driveSteps,
    showProgress: total > 1,
    progressText: "{{current}} of {{total}}",
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    allowClose: true,
    overlayClickBehavior: "close",
    // Read-only: the highlighted control can be seen, not pressed.
    disableActiveInteraction: true,
    animate: !reduced,
    smoothScroll: !reduced,
    stagePadding: 6,
    stageRadius: 12,
    overlayColor: "#000",
    overlayOpacity: 0.55,
    popoverClass: "app-tour",
    onPopoverRender: (popover, { driver: drv }) => {
      // NOT onHighlighted / getActiveElement(): driver.js sets its active
      // element a few animation frames after the popover renders, so a quick
      // click reads the previous step (or nothing). The index is set first.
      lastIndex = drv.getActiveIndex() ?? lastIndex;
      popover.closeButton.setAttribute("aria-label", "End tour");
      popover.wrapper.setAttribute("aria-modal", "true");
      const w = popover.wrapper.classList;
      w.remove("app-tour--sheet", "app-tour--top");
      const el = steps[lastIndex]?.el;
      // Says which kind of step this is without waiting on driver.js's
      // highlight class, which lags a step behind (e2e reads it).
      popover.wrapper.dataset.anchored = el ? "true" : "false";
      // A centred step (no element) stays centred: it covers driver.js's
      // placeholder cut-out, which docking would leave showing as a dot.
      if (isMobileViewport() && el) {
        // A floating popover at 375px covers the very thing it describes, so
        // it docks to whichever edge is further from the highlighted element.
        w.add("app-tour--sheet");
        const rect = el.getBoundingClientRect();
        if (rect.top + rect.height / 2 > window.innerHeight / 2) {
          w.add("app-tour--top");
        }
      }
      // Keyboard and screen-reader users land on Next — the action they
      // want — rather than on ×, which driver.js focuses first.
      setTimeout(() => {
        if (popover.wrapper.isConnected) popover.nextButton.focus({ preventScroll: true });
      }, 0);
    },
    // Every way out (Done, ×, Esc, overlay click) comes through here.
    // ⚠️ Not onDestroyed: driver.js skips that hook when its active element
    // isn't set yet — i.e. when Done is clicked within a few frames of the
    // step appearing — and the tour would end without being recorded, leaving
    // the Help button disabled. Seen in e2e on fast clicks.
    onDestroyStarted: () => {
      d.destroy();
      finish();
    },
  });

  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    window.removeEventListener("keydown", swallowPageShortcuts, true);
    if (current?.driver === d) current = null;
    // Back to whatever started it (a checklist button), else the Help
    // button — a menu item that started it no longer exists.
    const back =
      returnFocus?.isConnected && returnFocus !== document.body
        ? returnFocus
        : findTourTarget("help");
    // After driver.js restores its own focus target, and after React has
    // re-enabled the Help button (it is disabled while a tour runs).
    setTimeout(() => back?.focus(), 60);
    opts.onEnd({
      // Seeing the last step counts as finished, however it was closed.
      status: lastIndex >= total - 1 ? "completed" : "dismissed",
      lastIndex,
      lastTarget: steps[lastIndex]?.step.target,
    });
  };

  current = { driver: d, finish };
  d.drive(startIndex);
  return "started";
}
