import Link from "next/link";
import { SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 inline-flex size-10 items-center justify-center rounded-lg bg-muted">
            <SearchX className="size-5 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-7">Page not found</h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              The page you’re looking for doesn’t exist or was moved.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button asChild>
            <Link href="/">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

