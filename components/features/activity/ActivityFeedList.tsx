"use client";

import * as React from "react";
import Link from "next/link";

import { ActivityRow } from "@/components/features/activity/ActivityRow";
import { groupActivityByDay } from "@/lib/utils/activity-feed";
import type { ActivityItem } from "@/store/activity-store";
import { useProjectsStore } from "@/store/projects-store";
import { useTeamMembers } from "@/store/team-store";

type ActivityFeedListProps = {
  items: ActivityItem[];
  emptyMessage: string;
};

export function ActivityFeedList({ items, emptyMessage }: ActivityFeedListProps) {
  const members = useTeamMembers();
  const projects = useProjectsStore((s) => s.projects);
  const projectMap = React.useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  );

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
                <div className="px-4 py-3">
                  <ActivityRow item={n} members={members} projectMap={projectMap} />
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
