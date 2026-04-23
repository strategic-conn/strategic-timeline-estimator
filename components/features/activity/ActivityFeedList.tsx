"use client";

import Link from "next/link";

import type { AppNotification } from "@/store/notifications-store";
import {
  formatActivityTimestamp,
  groupActivityByDay,
} from "@/lib/utils/activity-feed";
import { cn } from "@/lib/utils";

type ActivityFeedListProps = {
  items: AppNotification[];
  onMarkRead: (id: string) => void;
  emptyMessage: string;
};

export function ActivityFeedList({
  items,
  onMarkRead,
  emptyMessage,
}: ActivityFeedListProps) {
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
                <div
                  className={cn(
                    "flex gap-3 px-4 py-3 text-sm transition-colors",
                    n.read ? "bg-transparent" : "bg-primary/[0.04]"
                  )}
                >
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      n.read ? "bg-transparent" : "bg-primary"
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "leading-snug text-foreground",
                        !n.read && "font-medium"
                      )}
                    >
                      {n.text}
                    </p>
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
                      onClick={() => onMarkRead(n.id)}
                    >
                      {row}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="block w-full text-left outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      onClick={() => onMarkRead(n.id)}
                    >
                      {row}
                    </button>
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
