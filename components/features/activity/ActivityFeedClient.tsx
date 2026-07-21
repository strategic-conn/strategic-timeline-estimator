"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Search, X } from "lucide-react";

import { ActivityFeedList } from "@/components/features/activity/ActivityFeedList";
import { WorkspacePageHeader } from "@/components/layouts/workspace-page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_CATEGORY_META,
  categorizeActivity,
  type ActivityCategory,
} from "@/lib/activity/categorize";
import {
  activityItemMatchesProject,
  resolveActorId,
} from "@/lib/utils/activity-feed";
import { useActivityStore } from "@/store/activity-store";
import { useProjectsStore } from "@/store/projects-store";
import { useTeamMembers } from "@/store/team-store";

export type ActivityFeedClientProps = {
  /** When set, only events for this project are listed. */
  projectId?: string;
};

const ALL = "all";

export function ActivityFeedClient({ projectId }: ActivityFeedClientProps) {
  const items = useActivityStore((s) => s.items);
  const projects = useProjectsStore((s) => s.projects);
  const members = useTeamMembers();

  const projectName = projectId
    ? projects.find((p) => p.id === projectId)?.name ?? null
    : null;

  // Scope to the project first (per-project page), else the whole workspace.
  const scoped = React.useMemo(() => {
    if (!projectId) return items;
    return items.filter((n) => activityItemMatchesProject(n, projectId));
  }, [items, projectId]);

  // ── Filters (workspace view only) ─────────────────────────────────────────
  const [fProject, setFProject] = React.useState<string>(ALL);
  const [fCategory, setFCategory] = React.useState<string>(ALL);
  const [fUser, setFUser] = React.useState<string>(ALL);
  const [query, setQuery] = React.useState("");

  const projectMap = React.useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  );
  const memberMap = React.useMemo(
    () => new Map(members.map((m) => [m.id, m.name])),
    [members],
  );

  // Only offer options that actually appear in the feed.
  const projectOptions = React.useMemo(() => {
    const ids = new Set<string>();
    for (const n of scoped) if (n.project_id) ids.add(n.project_id);
    return [...ids]
      .map((id) => ({ id, name: projectMap.get(id) ?? "Unknown project" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [scoped, projectMap]);

  const categoryOptions = React.useMemo(() => {
    const present = new Set<ActivityCategory>();
    for (const n of scoped) present.add(categorizeActivity(n.text));
    return ACTIVITY_CATEGORIES.filter((c) => present.has(c));
  }, [scoped]);

  const userOptions = React.useMemo(() => {
    const ids = new Set<string>();
    for (const n of scoped) {
      const id = resolveActorId(n, members);
      if (id) ids.add(id);
    }
    return [...ids]
      .map((id) => ({ id, name: memberMap.get(id) ?? "Unknown" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [scoped, members, memberMap]);

  const filtered = React.useMemo(() => {
    if (projectId) return scoped; // per-project page has no filter bar
    const q = query.trim().toLowerCase();
    return scoped.filter((n) => {
      if (fProject !== ALL && !activityItemMatchesProject(n, fProject))
        return false;
      if (fCategory !== ALL && categorizeActivity(n.text) !== fCategory)
        return false;
      if (fUser !== ALL && resolveActorId(n, members) !== fUser) return false;
      if (q && !n.text.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [projectId, scoped, fProject, fCategory, fUser, query, members]);

  const hasActiveFilters =
    fProject !== ALL || fCategory !== ALL || fUser !== ALL || query.trim() !== "";
  const clearFilters = () => {
    setFProject(ALL);
    setFCategory(ALL);
    setFUser(ALL);
    setQuery("");
  };

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
    : hasActiveFilters
      ? "No activity matches these filters."
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
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border bg-card/50 p-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search activity…"
              className="pl-8"
              aria-label="Search activity"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Select value={fProject} onValueChange={setFProject}>
              <SelectTrigger size="sm" className="w-full sm:w-42">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All projects</SelectItem>
                {projectOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={fCategory} onValueChange={setFCategory}>
              <SelectTrigger size="sm" className="w-full sm:w-38">
                <SelectValue placeholder="Activity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All activity</SelectItem>
                {categoryOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={`size-1.5 rounded-full ${ACTIVITY_CATEGORY_META[c].dot}`}
                        aria-hidden
                      />
                      {ACTIVITY_CATEGORY_META[c].label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={fUser} onValueChange={setFUser}>
              <SelectTrigger size="sm" className="w-full sm:w-38">
                <SelectValue placeholder="Person" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Everyone</SelectItem>
                {userOptions.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center justify-between gap-3 sm:ml-auto">
              {hasActiveFilters ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-muted-foreground"
                  onClick={clearFilters}
                >
                  <X className="size-3.5" aria-hidden />
                  Clear
                </Button>
              ) : (
                <span aria-hidden />
              )}
              <span className="text-xs tabular-nums text-muted-foreground">
                {filtered.length} of {scoped.length}
              </span>
            </div>
          </div>
        </div>
      )}

      <ActivityFeedList items={filtered} emptyMessage={emptyMessage} />
    </div>
  );
}
