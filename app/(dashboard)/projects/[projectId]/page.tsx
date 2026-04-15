import type { Metadata } from "next";

import { ProjectOverviewPage } from "@/components/features/sprints/ProjectOverviewPage";

export const metadata: Metadata = {
  title: "Project Overview",
  description: "Manage sprints and view the project backlog.",
};

export default async function ProjectRoutePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ProjectOverviewPage projectId={projectId} />;
}
