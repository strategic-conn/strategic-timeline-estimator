import { useProjectsStore } from "@/store/projects-store";

/**
 * Resolve a project's display name from the projects store (live or demo).
 * Returns "" when unknown (e.g. the project was just deleted).
 *
 * Lives here (not in workspace-push) to avoid an import cycle: projects-store
 * already imports workspace-push, so workspace-push must not import it back.
 */
export function projectLabel(projectId?: string | null): string {
  if (!projectId) return "";
  return (
    useProjectsStore.getState().projects.find((p) => p.id === projectId)?.name ??
    ""
  );
}

/** Append a scannable " · Project Name" scope to a notification summary. */
export function withProjectScope(
  text: string,
  projectId?: string | null,
): string {
  const name = projectLabel(projectId);
  return name ? `${text} · ${name}` : text;
}
