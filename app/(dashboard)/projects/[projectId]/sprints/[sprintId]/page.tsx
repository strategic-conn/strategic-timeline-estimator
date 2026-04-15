import type { Metadata } from "next";

import { TasksPage } from "@/components/features/tasks/TasksPage";

export const metadata: Metadata = {
  title: "Sprint Board",
  description: "Manage tasks within a sprint — board, list, and table views.",
};

export default async function SprintBoardRoute({
  params,
}: {
  params: Promise<{ projectId: string; sprintId: string }>;
}) {
  const { projectId, sprintId } = await params;
  return <TasksPage projectId={projectId} sprintId={sprintId} />;
}
