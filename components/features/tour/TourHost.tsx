"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isTourRunning, pageTourFor, stopTour } from "@/lib/tours/run";
import { tourById } from "@/lib/tours/tours";
import { useAuthStore } from "@/store/auth-store";
import { useTourStore } from "@/store/tour-store";
import {
  seenTour,
  useIsNewUser,
  useStartTour,
  useTourContext,
  useTourProgress,
  useTourUserId,
} from "@/components/features/tour/use-tours";

/**
 * Everything tours do without being asked. Mounted once in the dashboard
 * layout; renders only the welcome dialog.
 *
 *  - New users: the welcome dialog once, on the dashboard (the page sign-in
 *    lands on). Then a one-line nudge the first time they reach each page
 *    with a tour they haven't taken. Never an auto-started tour.
 *  - Existing users (joined before TOURS_LAUNCHED_AT): one hint that tours
 *    exist, nothing else.
 *  - "Show me" from the checklist: once the target page is on screen, start
 *    that tour at the right step.
 *  - Leaving a page ends its tour — the anchors it points at are gone.
 */
export function TourHost() {
  const pathname = usePathname();
  const userId = useTourUserId();
  const firstName = useAuthStore((s) => s.user.name.trim().split(/\s+/)[0] || "there");
  const progress = useTourProgress();
  const isNew = useIsNewUser();
  const getCtx = useTourContext();
  const startTour = useStartTour();
  const record = useTourStore((s) => s.record);
  const markNudged = useTourStore((s) => s.markNudged);
  const nudged = useTourStore((s) => s.nudged[userId]);
  const pending = useTourStore((s) => s.pending);
  const setPending = useTourStore((s) => s.setPending);
  const welcomeDeferred = useTourStore((s) => s.welcomeDeferred);
  const deferWelcome = useTourStore((s) => s.deferWelcome);
  const active = useTourStore((s) => s.active);

  const welcomeSeen = Boolean(progress?.welcome);
  const showWelcome =
    isNew === true &&
    progress != null &&
    !welcomeSeen &&
    !welcomeDeferred &&
    pathname === "/dashboard" &&
    !active &&
    !pending;

  // Leaving a page ends its tour. The first render is not a navigation.
  const lastPath = React.useRef(pathname);
  React.useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    if (isTourRunning()) stopTour();
  }, [pathname]);

  // "Show me": the checklist navigated here and asked for a tour.
  React.useEffect(() => {
    if (!pending) return;
    const def = tourById(pending.tourId);
    if (!def) {
      setPending(null);
      return;
    }
    if (def.id !== "welcome" && !def.match(pathname)) return; // still navigating
    setPending(null);
    void startTour(def, pending.target);
  }, [pending, pathname, setPending, startTour]);

  // Existing users: say once that tours exist, then never again.
  React.useEffect(() => {
    if (isNew !== false || progress == null || progress["intro-hint"]) return;
    record(userId, "intro-hint", 1, "dismissed");
    toast("New: page tours", {
      description: "Open the ? button at the top of any page for a short tour of it.",
      duration: 8000,
    });
  }, [isNew, progress, record, userId]);

  // New users: one nudge per page tour, after the welcome has been answered.
  React.useEffect(() => {
    if (isNew !== true || progress == null || !welcomeSeen || active || pending) return;
    const timer = setTimeout(() => {
      if (isTourRunning()) return;
      const def = pageTourFor(pathname, getCtx());
      if (!def || seenTour(progress, def) || nudged?.includes(def.id)) return;
      // The dashboard is where the welcome dialog already greeted them, and
      // its checklist is the next step — a second offer there is noise.
      if (def.id === "dashboard" || def.id === "dashboard-team") return;
      markNudged(userId, def.id);
      toast(`New here? Take the 1-minute tour of ${def.title}`, {
        description: "You can always find it under the ? button.",
        duration: 10000,
        action: { label: "Start tour", onClick: () => void startTour(def) },
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [
    isNew,
    progress,
    welcomeSeen,
    active,
    pending,
    pathname,
    getCtx,
    nudged,
    markNudged,
    userId,
    startTour,
  ]);

  const startWelcome = () => {
    deferWelcome(); // closes the dialog; the tour records the real outcome
    const def = tourById("welcome");
    // Let the dialog finish closing — Radix makes the page inert while open.
    if (def) setTimeout(() => void startTour(def), 250);
  };

  return (
    <Dialog
      open={showWelcome}
      onOpenChange={(open) => {
        if (!open) deferWelcome();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-primary/12 text-primary">
            <Sparkles className="size-5" aria-hidden />
          </div>
          <DialogTitle>Welcome, {firstName}</DialogTitle>
          <DialogDescription>
            This is where projects are scoped, scheduled and tracked. A
            one-minute tour shows you around, and every page has its own short
            tour under the ? button at the top.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => {
              record(userId, "welcome", tourById("welcome")?.version ?? 1, "dismissed");
              deferWelcome();
            }}
          >
            Don&apos;t show again
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={deferWelcome}>
              Later
            </Button>
            <Button type="button" onClick={startWelcome}>
              Start the tour
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
