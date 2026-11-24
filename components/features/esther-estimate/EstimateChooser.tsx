"use client";

import * as React from "react";
import { ArrowRight, PencilRuler } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { EstherFace } from "@/components/features/esther-estimate/EstherFace";

/**
 * New estimate → "How do you want to start?": Esther or by hand. Asks the
 * server whether Esther is set up (an API key exists) each time it opens, so a
 * workspace without one sees why instead of a failure two steps later.
 */
export function EstimateChooser({
  open,
  onOpenChange,
  onEsther,
  onManual,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEsther: () => void;
  onManual: () => void;
}) {
  const [ready, setReady] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    fetch("/api/esther", { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : { ready: false }))
      .then((d: { ready?: boolean }) => setReady(Boolean(d.ready)))
      .catch(() => {
        if (!ctl.signal.aborted) setReady(false);
      });
    return () => ctl.abort();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl" data-testid="estimate-chooser">
        <DialogHeader>
          <DialogTitle>New estimate</DialogTitle>
          <DialogDescription>How do you want to start?</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={ready === false}
            onClick={onEsther}
            className={cn(
              "group relative flex flex-col items-start gap-3 overflow-hidden rounded-xl border p-4 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "border-primary/40 bg-gradient-to-br from-primary/10 to-chart-2/10 hover:border-primary",
              "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-primary/40",
            )}
          >
            <EstherFace className="size-11 shadow-md shadow-primary/25" />
            <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              Let Esther estimate
              <span className="rounded-full bg-primary/15 px-1.5 text-[0.7rem] font-medium text-primary dark:text-indigo-300">AI</span>
            </span>
            <span className="text-xs text-muted-foreground">
              {ready === false
                ? "Not set up yet. An admin needs to add the Anthropic API key."
                : "Drop the client's document. Esther reads it, asks what's missing and drafts the estimate for your team to check."}
            </span>
            {ready !== false ? (
              <span className="mt-auto flex items-center gap-1 text-xs font-medium text-primary dark:text-indigo-300">
                Start with a document
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={onManual}
            className={cn(
              "group flex flex-col items-start gap-3 rounded-xl border border-border p-4 text-left transition-colors hover:bg-muted/50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <span className="flex size-11 items-center justify-center rounded-lg bg-muted text-muted-foreground" aria-hidden>
              <PencilRuler className="size-6" />
            </span>
            <span className="text-sm font-semibold">Build it myself</span>
            <span className="text-xs text-muted-foreground">
              Answer the guided questionnaire, or pick tasks from the catalog.
            </span>
            <span className="mt-auto flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
              Start a manual estimate
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
