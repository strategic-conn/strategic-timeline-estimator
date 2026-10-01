"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { CircleHelp, ListChecks, Play, RotateCcw, Sparkles, StepForward } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { tourAnchor } from "@/lib/tours/ids";
import { pageTourFor } from "@/lib/tours/run";
import { tourById, type TourDef } from "@/lib/tours/tours";
import { cn } from "@/lib/utils";
import { useTourStore } from "@/store/tour-store";
import {
  seenTour,
  useStartTour,
  useTourContext,
  useTourProgress,
  useTourUserId,
} from "@/components/features/tour/use-tours";

/**
 * The header's "?" button: tour this page, resume, welcome tour, checklist,
 * reset. Same icon as `HelpTip`, so "?" means help everywhere in the app.
 *
 * A dot means this page has a tour you haven't taken. It is recomputed after
 * each navigation (the page tour depends on which anchors rendered), and again
 * whenever the menu opens.
 */
export function HelpMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const userId = useTourUserId();
  const progress = useTourProgress();
  const getCtx = useTourContext();
  const startTour = useStartTour();
  const resume = useTourStore((s) => s.resume[userId]);
  const resetAll = useTourStore((s) => s.resetAll);
  const forget = useTourStore((s) => s.forget);
  const openChecklist = useTourStore((s) => s.openChecklist);
  const active = useTourStore((s) => s.active);

  const [pageTour, setPageTour] = React.useState<TourDef | null>(null);

  const refresh = React.useCallback(() => {
    setPageTour(pageTourFor(pathname, getCtx()));
  }, [pathname, getCtx]);

  // Anchors appear after the stores hydrate, so look again a moment later.
  React.useEffect(() => {
    const first = setTimeout(refresh, 300);
    const second = setTimeout(refresh, 2000);
    return () => {
      clearTimeout(first);
      clearTimeout(second);
    };
  }, [refresh]);

  const unseen = Boolean(pageTour && progress && !seenTour(progress, pageTour));
  const resumeDef = resume ? tourById(resume.tourId) : undefined;
  const resumable =
    resumeDef && (resumeDef.id === "welcome" || resumeDef.match(pathname)) ? resumeDef : null;

  // Start after the menu has closed and handed focus back, or Radix's focus
  // return lands on the trigger underneath the tour's overlay.
  const later = (fn: () => void) => () => setTimeout(fn, 50);

  return (
    <DropdownMenu onOpenChange={(open) => open && refresh()}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative min-h-9 min-w-9 shrink-0"
          aria-label={unseen ? "Help and tours — this page has a tour" : "Help and tours"}
          disabled={Boolean(active)}
          {...tourAnchor("help")}
        >
          <CircleHelp className="size-[1.15rem]" aria-hidden />
          {unseen ? (
            <span
              className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-background motion-safe:animate-pulse"
              aria-hidden
            />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Help &amp; tours
        </DropdownMenuLabel>
        <DropdownMenuItem
          disabled={!pageTour}
          onSelect={later(() => pageTour && void startTour(pageTour))}
          className="items-start"
        >
          <Play className="mt-0.5 size-4" aria-hidden />
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">
              {pageTour ? `Tour: ${pageTour.title}` : "Tour this page"}
            </span>
            <span className="text-xs text-muted-foreground">
              {pageTour
                ? unseen
                  ? "New — about a minute"
                  : "Take it again"
                : "This page has no tour"}
            </span>
          </span>
        </DropdownMenuItem>
        {resumable ? (
          <DropdownMenuItem
            onSelect={later(() => void startTour(resumable, resume?.target))}
          >
            <StepForward className="size-4" aria-hidden />
            Resume: {resumable.title}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onSelect={later(() => {
            const welcome = tourById("welcome");
            if (welcome) void startTour(welcome);
          })}
        >
          <Sparkles className="size-4" aria-hidden />
          Welcome tour
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            forget(userId, "checklist");
            openChecklist();
            if (pathname !== "/dashboard") router.push("/dashboard");
          }}
        >
          <ListChecks className="size-4" aria-hidden />
          Getting started checklist
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            resetAll(userId);
            toast.success("Tours reset", {
              description: "Every page's tour is offered again.",
            });
          }}
          className={cn("text-muted-foreground")}
        >
          <RotateCcw className="size-4" aria-hidden />
          Reset all tours
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
