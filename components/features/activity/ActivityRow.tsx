"use client";

import * as React from "react";

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
  resolveActorId,
  type ActivityLike,
} from "@/lib/utils/activity-feed";
import { cn } from "@/lib/utils";
import type { TeamMember } from "@/types/task.types";

/** Shared item shape for the activity feed + the notification bell. */
export type ActivityRowItem = ActivityLike & { actor_id?: string | null };

/**
 * One activity/notification line: actor avatar (or category icon), actor name +
 * body, a colored category chip, project badge, and timestamp. Presentational —
 * the caller resolves `members`/`projectMap` once and passes them in, so a long
 * list doesn't open a store subscription per row.
 */
export function ActivityRow({
  item,
  members,
  projectMap,
  showActorName = true,
}: {
  item: ActivityRowItem;
  members: TeamMember[];
  projectMap: Map<string, string>;
  /**
   * Prepend the actor's name to the line. The activity feed's text is written
   * "Name did X" so this reads well; notifications are second-person ("assigned
   * to you"), so the bell passes `false` and lets the avatar convey who acted.
   */
  showActorName?: boolean;
}) {
  const category = categorizeActivity(item.text);
  const meta = ACTIVITY_CATEGORY_META[category];
  const Icon = meta.icon;

  const actorId = resolveActorId(item, members);
  const actor = actorId ? members.find((m) => m.id === actorId) : undefined;
  const actorName = actor?.name ?? null;
  const leadName = showActorName ? actorName : null;

  const projectId = item.project_id ?? deriveProjectIdFromHref(item.href);
  const projectName = projectId ? projectMap.get(projectId) ?? null : null;
  const body = activityDisplayBody(item.text, leadName, projectName);

  return (
    <div className="flex gap-3">
      {actor ? (
        <Avatar size="sm" className="mt-0.5 shrink-0">
          {actor.avatar_url ? <AvatarImage src={actor.avatar_url} alt="" /> : null}
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
          {leadName ? <span className="font-medium">{leadName}</span> : null}
          {leadName ? " " : ""}
          {body}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className={cn("inline-flex items-center gap-1", meta.text)}>
            <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden />
            {meta.label}
          </span>
          {projectName ? (
            <Badge variant="secondary" className="h-4 px-1.5 font-normal">
              {projectName}
            </Badge>
          ) : null}
          <span className="tabular-nums">{formatActivityTimestamp(item.at)}</span>
        </div>
      </div>
    </div>
  );
}
