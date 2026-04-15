export type SprintStatus = "planning" | "active" | "completed" | "cancelled";

export interface Sprint {
  id: string;
  project_id: string;
  name: string;
  goal?: string;
  status: SprintStatus;
  start_date: string;
  end_date: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export const SPRINT_STATUSES: { value: SprintStatus; label: string; color: string }[] = [
  { value: "planning", label: "Planning", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  { value: "active", label: "Active", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  { value: "completed", label: "Completed", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
];
