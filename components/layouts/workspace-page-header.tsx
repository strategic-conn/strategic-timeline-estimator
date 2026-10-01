import * as React from "react";

import { cn } from "@/lib/utils";

export type WorkspacePageHeaderProps = {
  eyebrow?: string;
  title: React.ReactNode;
  description?: string;
  /** Extra row under description (badges, links, secondary controls). */
  meta?: React.ReactNode;
  /** Primary actions (right side on desktop). */
  actions?: React.ReactNode;
  /**
   * The page's "?" (`<AppHelp section="page.…" />`), pinned top-right. The
   * content row keeps clear of it, so it never sits on an action button.
   */
  help?: React.ReactNode;
  className?: string;
};

export function WorkspacePageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
  help,
  className,
}: WorkspacePageHeaderProps) {
  return (
    <header
      className={cn(
        "relative mb-6 overflow-hidden rounded-2xl border border-border/60 bg-card/35 px-4 py-4 shadow-sm backdrop-blur-md sm:px-5 sm:py-5 dark:bg-card/25",
        className
      )}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-primary/14 blur-3xl dark:bg-primary/10"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-10 -left-8 h-28 w-28 rounded-full bg-chart-2/12 blur-2xl dark:bg-chart-2/8"
        aria-hidden
      />

      {help ? (
        <div className="absolute right-2.5 top-2.5 z-10 sm:right-3 sm:top-3">{help}</div>
      ) : null}
      <div
        className={cn(
          "relative flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between xl:gap-8",
          help && "pr-8 sm:pr-9",
        )}
      >
        <div className="w-full min-w-0 space-y-1 xl:flex-1 xl:min-w-0">
          {eyebrow ? (
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {description ? (
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
          {meta ? <div className="pt-2">{meta}</div> : null}
        </div>
        {/* The actions cap keeps a long row from crowding the title. Raised at
            2xl only: a five-control header (the Estimator's) needs ~611px and
            clipped against 576 even inside a 1600px shell, while at that width
            the title still keeps 800px+. Narrower breakpoints are unchanged —
            actions there are expected to wrap. */}
        {actions ? (
          <div className="flex w-full min-w-0 flex-col gap-2 pt-0.5 xl:w-auto xl:max-w-md xl:shrink-0 2xl:max-w-2xl *:min-w-0">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
