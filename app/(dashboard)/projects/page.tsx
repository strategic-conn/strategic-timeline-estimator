import type { Metadata } from "next";

import { ProjectsPage } from "@/components/features/projects/ProjectsPage";

export const metadata: Metadata = {
  title: "Projects",
  description: "Projects and workspaces.",
};

export default function ProjectsRoutePage() {
  return <ProjectsPage />;
}
