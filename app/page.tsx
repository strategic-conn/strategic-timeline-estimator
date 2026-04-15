import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";

export default function Home() {
  return (
    <div className="relative flex min-h-full flex-1 flex-col items-center justify-center px-6 py-20">
      <div className="absolute right-4 top-4 md:right-6 md:top-6">
        <ModeToggle />
      </div>

      <div className="mx-auto max-w-md text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Project management
        </p>
        <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-foreground">
          Timeline Estimator
        </h1>
        <p className="mt-3 text-pretty text-sm leading-6 text-muted-foreground">
          Plan work, track tasks, and estimate timelines. Sign in to continue or
          open the dashboard while the app is under development.
        </p>

        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard">Dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
