"use client";

import Link from "next/link";
import { FolderX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useProjectsStore } from "@/store/projects-store";

/**
 * "This project is gone" — shown by every route scoped to one project.
 *
 * Reachable by design, not just by a bad URL: deleting a project writes an
 * activity entry whose href is that project's own overview page, so every
 * "Deleted project X" line in the feed leads to one of these routes. Without it
 * they rendered as working pages — the overview offered "New sprint" and the
 * backlog offered "Add task", both of which can only fail, because sprints and
 * tasks carry a foreign key to a row that no longer exists.
 */
export function ProjectNotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/20 px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <FolderX className="size-6" aria-hidden />
      </div>
      <p className="text-sm font-medium">This project no longer exists</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        It may have been deleted, or you may not have access to it. Its sprints
        and tasks went with it.
      </p>
      <Button variant="outline" asChild>
        <Link href="/projects">Back to projects</Link>
      </Button>
    </div>
  );
}

/**
 * Whether a project-scoped page should render {@link ProjectNotFound}.
 *
 * Deliberately requires the store to have LOADED: an empty lookup mid-hydration
 * means "not yet", and flashing "deleted" on every page load would be worse
 * than the bug this fixes. Returns false when there is no project in scope, so
 * the shared components that also serve unscoped views (the global activity
 * feed) are unaffected.
 */
export function useProjectMissing(projectId?: string | null): boolean {
  const loaded = useProjectsStore((s) => s.loaded);
  const exists = useProjectsStore((s) =>
    projectId ? s.projects.some((p) => p.id === projectId) : true,
  );
  return Boolean(projectId) && loaded && !exists;
}
