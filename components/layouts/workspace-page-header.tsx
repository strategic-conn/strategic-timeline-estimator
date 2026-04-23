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
  className?: string;
};

export function WorkspacePageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
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

      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
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
        {actions ? (
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center lg:pt-0.5">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
