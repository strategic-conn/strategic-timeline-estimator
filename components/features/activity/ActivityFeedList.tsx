"use client";

import * as React from "react";
import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  ACTIVITY_CATEGORY_META,
  categorizeActivity,
} from "@/lib/activity/categorize";
import {
  activityDisplayBody,
  deriveProjectIdFromHref,
  formatActivityTimestamp,
  groupActivityByDay,
  resolveActorId,
} from "@/lib/utils/activity-feed";
import { cn } from "@/lib/utils";
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
              const category = categorizeActivity(n.text);
              const meta = ACTIVITY_CATEGORY_META[category];
              const Icon = meta.icon;

              const actorId = resolveActorId(n, members);
              const actor = actorId
                ? members.find((m) => m.id === actorId)
                : undefined;
              const actorName = actor?.name ?? null;

              const projectId = n.project_id ?? deriveProjectIdFromHref(n.href);
              const projectName = projectId
                ? projectMap.get(projectId) ?? null
                : null;
              const body = activityDisplayBody(n.text, actorName, projectName);

              const row = (
                <div className="flex gap-3 px-4 py-3">
                  {actor ? (
                    <Avatar size="sm" className="mt-0.5 shrink-0">
                      {actor.avatar_url ? (
                        <AvatarImage src={actor.avatar_url} alt="" />
                      ) : null}
                      <AvatarFallback
                        style={{ backgroundColor: actor.avatarColor }}
                        className="text-xs font-medium text-white"
                      >
                        {actor.initials}
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Icon className={cn("size-4", meta.text)} aria-hidden />
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug text-foreground">
                      {actorName ? (
                        <span className="font-medium">{actorName}</span>
                      ) : null}
                      {actorName ? " " : ""}
                      {body}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span
                        className={cn("inline-flex items-center gap-1", meta.text)}
                      >
                        <span
                          className={cn("size-1.5 rounded-full", meta.dot)}
                          aria-hidden
                        />
                        {meta.label}
                      </span>
                      {projectName ? (
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 font-normal"
                        >
                          {projectName}
                        </Badge>
                      ) : null}
                      <span className="tabular-nums">
                        {formatActivityTimestamp(n.at)}
                      </span>
                    </div>
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
