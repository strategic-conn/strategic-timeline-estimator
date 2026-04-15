import { redirect } from "next/navigation";

/**
 * Legacy tasks route — redirect to the project overview (sprint list).
 * Tasks now live inside sprints: /projects/[projectId]/sprints/[sprintId]
 * or the backlog: /projects/[projectId]/backlog
 */
export default async function ProjectTasksRoute({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}`);
}
