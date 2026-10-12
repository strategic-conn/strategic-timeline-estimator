"use client";

import * as React from "react";

import { closedProjectIds } from "@/lib/workload/assigned-work";
import { useProjectsStore } from "@/store/projects-store";

export function useProjects() {
  return useProjectsStore();
}

/** Completed + archived project ids — memoised, so it is a stable memo dep. */
export function useClosedProjectIds(): ReadonlySet<string> {
  const projects = useProjectsStore((s) => s.projects);
  return React.useMemo(() => closedProjectIds(projects), [projects]);
}
