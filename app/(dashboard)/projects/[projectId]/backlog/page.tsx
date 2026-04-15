import type { Metadata } from "next";

import { TasksPage } from "@/components/features/tasks/TasksPage";

export const metadata: Metadata = {
  title: "Backlog",
  description: "Tasks not assigned to any sprint.",
};

export default async function BacklogRoute({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <TasksPage projectId={projectId} sprintId={null} />;
}
