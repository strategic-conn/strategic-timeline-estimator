import type { Project } from "@/types/project.types";

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export const DUMMY_PROJECTS: Project[] = [
  {
    id: "proj-1",
    name: "Timeline Estimator",
    description:
      "Core SaaS dashboard: tasks, estimates, schedule, reporting, and team access.",
    status: "active",
    owner_id: "1",
    created_at: daysFromNow(-30),
    updated_at: daysFromNow(-1),
  },
  {
    id: "proj-2",
    name: "Client Portal",
    description:
      "External-facing portal for clients to review milestones, approve proposals, and track delivery.",
    status: "active",
    owner_id: "2",
    created_at: daysFromNow(-50),
    updated_at: daysFromNow(-3),
  },
  {
    id: "proj-3",
    name: "Internal Tools",
    description:
      "Ops and developer experience improvements: CI, linting, release notes, and admin workflows.",
    status: "completed",
    owner_id: "1",
    created_at: daysFromNow(-120),
    updated_at: daysFromNow(-20),
  },
  {
    id: "proj-4",
    name: "Website Redesign",
    description:
      "Marketing site redesign with new typography, color system, and conversion-focused landing pages.",
    status: "archived",
    owner_id: "3",
    created_at: daysFromNow(-200),
    updated_at: daysFromNow(-90),
  },
];

