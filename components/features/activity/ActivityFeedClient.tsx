"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ActivityFeedList } from "@/components/features/activity/ActivityFeedList";
import { WorkspacePageHeader } from "@/components/layouts/workspace-page-header";
import { Button } from "@/components/ui/button";
import { useActivityStore } from "@/store/activity-store";
import { useProjectsStore } from "@/store/projects-store";
import { activityItemMatchesProject } from "@/lib/utils/activity-feed";

export type ActivityFeedClientProps = {
  /** When set, only events for this project are listed. */
  projectId?: string;
};

export function ActivityFeedClient({ projectId }: ActivityFeedClientProps) {
  const items = useActivityStore((s) => s.items);
  const projects = useProjectsStore((s) => s.projects);

  const projectName = projectId
    ? projects.find((p) => p.id === projectId)?.name ?? null
    : null;

  const filtered = React.useMemo(() => {
    if (!projectId) return items;
    return items.filter((n) => activityItemMatchesProject(n, projectId));
  }, [items, projectId]);

  const title = projectId
    ? projectName
      ? `Activity — ${projectName}`
      : "Project activity"
    : "Activity";

  const description = projectId
    ? "Updates for this project only."
    : "Everything that happened across your workspace, newest first.";

  const emptyMessage = projectId
    ? "No activity recorded for this project yet. Sprint changes and linked updates will appear here."
    : "No activity yet. Updates from your team's work will show up here.";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
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

      {projectId ? (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" asChild>
            <Link href="/activity">All workspace activity</Link>
          </Button>
        </div>
      ) : null}

      <ActivityFeedList items={filtered} emptyMessage={emptyMessage} />
    </div>
  );
}
