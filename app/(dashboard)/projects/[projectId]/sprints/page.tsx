import { redirect } from "next/navigation";

/**
 * Breadcrumb links to `/projects/[projectId]/sprints` when viewing a sprint board.
 * There is no standalone sprints list at this path — the overview lives at `/projects/[projectId]`.
 */
export default async function ProjectSprintsIndexRoute({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}`);
}
