"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Intentionally minimal: no PII; keep console clean in production.
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 inline-flex size-10 items-center justify-center rounded-lg bg-destructive/10">
            <AlertTriangle
              className="size-5 text-destructive"
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-7">
              Something went wrong
            </h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Try again. If it keeps happening, go back home and retry your last
              action.
            </p>
            {error?.digest ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Error reference: <span className="font-mono">{error.digest}</span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={reset}>
            <RefreshCcw className="mr-2 size-4" aria-hidden="true" />
            Retry
          </Button>
          <Button asChild>
            <Link href="/">Go home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

