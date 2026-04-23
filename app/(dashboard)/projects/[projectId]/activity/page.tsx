import type { Metadata } from "next";

import { ActivityFeedClient } from "@/components/features/activity/ActivityFeedClient";

export const metadata: Metadata = {
  title: "Project activity",
  description: "Activity for this project.",
};

type ProjectActivityPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectActivityPage({
  params,
}: ProjectActivityPageProps) {
  const { projectId } = await params;
  return <ActivityFeedClient projectId={projectId} />;
}
