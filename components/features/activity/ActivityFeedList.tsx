"use client";

import Link from "next/link";

import type { ActivityItem } from "@/store/activity-store";
import {
  formatActivityTimestamp,
  groupActivityByDay,
} from "@/lib/utils/activity-feed";

type ActivityFeedListProps = {
  items: ActivityItem[];
  emptyMessage: string;
};

export function ActivityFeedList({ items, emptyMessage }: ActivityFeedListProps) {
  const groups = groupActivityByDay(items);

  if (groups.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`activity-day-${group.key}`}>
          <h2
            id={`activity-day-${group.key}`}
            className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {group.label}
          </h2>
          <ul className="divide-y divide-border rounded-lg border bg-card">
            {group.items.map((n) => {
              const row = (
                <div className="flex gap-3 px-4 py-3 text-sm transition-colors">
                  <span
                    className="mt-1.5 size-2 shrink-0 rounded-full bg-muted-foreground/40"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="leading-snug text-foreground">{n.text}</p>
                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {formatActivityTimestamp(n.at)}
                    </p>
                  </div>
                </div>
              );

              return (
                <li key={n.id}>
                  {n.href ? (
                    <Link
                      href={n.href}
                      className="block outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {row}
                    </Link>
                  ) : (
                    row
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
