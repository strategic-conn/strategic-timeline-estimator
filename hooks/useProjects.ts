"use client";

import { useProjectsStore } from "@/store/projects-store";

export function useProjects() {
  return useProjectsStore();
}
