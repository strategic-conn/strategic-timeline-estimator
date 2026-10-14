"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center px-4 py-16"
      role="alert"
    >
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/80 p-6 text-card-foreground shadow-sm backdrop-blur-sm">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
            <AlertTriangle
              className="size-5 text-destructive"
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-7 tracking-tight">
              This page couldn&apos;t load
            </h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Try again. If it keeps happening, open the dashboard or go back
              and repeat your last action.
            </p>
            {error?.digest ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Reference:{" "}
                <span className="font-mono tabular-nums">{error.digest}</span>
              </p>
            ) : null}
            {/* Dev only: what actually broke, so a one-off crash can be reported
                from a screenshot. Production keeps the generic copy — an error
                message can carry internals no user should see. */}
            {process.env.NODE_ENV !== "production" && error?.message ? (
              <details className="mt-3 text-xs text-muted-foreground">
                <summary className="cursor-pointer">Error details (dev only)</summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 font-mono">
                  {error.message}
                  {error.stack ? `\n\n${error.stack.split("\n").slice(1, 6).join("\n")}` : ""}
                </pre>
              </details>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button variant="outline" onClick={reset} className="gap-2">
            <RefreshCcw className="size-4" aria-hidden="true" />
            Retry
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/dashboard">Dashboard</Link>
          </Button>
          <Button asChild>
            <Link href="/projects">Projects</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
