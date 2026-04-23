"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Check, ListFilter } from "lucide-react";

import { ActivityFeedList } from "@/components/features/activity/ActivityFeedList";
import { WorkspacePageHeader } from "@/components/layouts/workspace-page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useProjectsStore } from "@/store/projects-store";
import { useNotificationsStore } from "@/store/notifications-store";
import { activityItemMatchesProject } from "@/lib/utils/activity-feed";

export type ActivityFeedClientProps = {
  /** When set, only events for this project are listed. */
  projectId?: string;
};

export function ActivityFeedClient({ projectId }: ActivityFeedClientProps) {
  const items = useNotificationsStore((s) => s.items);
  const markRead = useNotificationsStore((s) => s.markRead);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const projects = useProjectsStore((s) => s.projects);

  const [unreadOnly, setUnreadOnly] = React.useState(false);

  const projectName = projectId
    ? projects.find((p) => p.id === projectId)?.name ?? null
    : null;

  const filtered = React.useMemo(() => {
    let list = items;
    if (projectId) {
      list = list.filter((n) => activityItemMatchesProject(n, projectId));
    }
    if (unreadOnly) {
      list = list.filter((n) => !n.read);
    }
    return list;
  }, [items, projectId, unreadOnly]);

  const unreadInView = filtered.filter((n) => !n.read).length;

  const title = projectId
    ? projectName
      ? `Activity — ${projectName}`
      : "Project activity"
    : "Activity";

  const description = projectId
    ? "Updates and notifications for this project only."
    : "Everything that happened across your workspace, newest first.";

  const emptyMessage = projectId
    ? "No activity recorded for this project yet. Sprint changes and linked notifications will appear here."
    : "No activity yet. Notifications from your work will show up here.";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      {projectId ? (
        <Button variant="ghost" size="sm" className="w-fit gap-2 px-0" asChild>
          <Link href={`/projects/${projectId}`}>
            <ArrowLeft className="size-4" aria-hidden />
            Back to project
          </Link>
        </Button>
      ) : null}

      <WorkspacePageHeader
        eyebrow={projectId ? "Project" : "Workspace"}
        title={title}
        description={description}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <ListFilter className="size-4 text-muted-foreground" aria-hidden />
          <div className="flex items-center gap-2">
            <Checkbox
              id="activity-unread-only"
              checked={unreadOnly}
              onCheckedChange={(v) => setUnreadOnly(v === true)}
            />
            <Label htmlFor="activity-unread-only" className="text-sm font-normal">
              Unread only
            </Label>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unreadInView > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                for (const n of filtered) {
                  if (!n.read) markRead(n.id);
                }
              }}
            >
              <Check className="size-3.5" aria-hidden />
              Mark view as read
            </Button>
          ) : null}
          {projectId ? (
            <Button variant="outline" size="sm" asChild>
              <Link href="/activity">All workspace activity</Link>
            </Button>
          ) : null}
        </div>
      </div>

      <ActivityFeedList
        items={filtered}
        onMarkRead={markRead}
        emptyMessage={emptyMessage}
      />

      {items.some((n) => !n.read) && !projectId ? (
        <p className="text-center text-xs text-muted-foreground">
          <button
            type="button"
            className="underline underline-offset-4 hover:text-foreground"
            onClick={() => markAllRead()}
          >
            Mark all notifications read
          </button>{" "}
          (entire workspace)
        </p>
      ) : null}
    </div>
  );
}
