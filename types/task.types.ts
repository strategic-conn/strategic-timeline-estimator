export type TaskStatus = "todo" | "in_progress" | "in_review" | "done" | "blocked";
export type TaskPriority = "low" | "medium" | "high" | "critical";

export interface Reaction {
  emoji: string;
  userIds: string[];
}

export interface Reply {
  id: string;
  /** null = author was deleted ("Former member"). */
  author_id: string | null;
  body: string;
  created_at: string;
  mentions: string[];
  reactions: Reaction[];
}

export interface Comment {
  id: string;
  /** null = author was deleted ("Former member"). */
  author_id: string | null;
  body: string;
  created_at: string;
  reactions: Reaction[];
  replies: Reply[];
}

/** A task assignment's response state. Rejected/passed rows are removed. */
export type AssignmentStatus = "pending" | "accepted" | "rejected" | "passed";

/** One person's assignment to a task, with its acceptance lifecycle. */
export interface TaskAssignment {
  profile_id: string;
  status: AssignmentStatus;
  /** Who assigned them (the coordinator, or the dev who passed it). */
  assigned_by?: string | null;
  responded_at?: string | null;
  note?: string | null;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  /**
   * Profile ids of everyone currently on the task (pending + accepted).
   * Kept as the simple id list every board/avatar/ filter reads.
   */
  assignee_ids: string[];
  /** Full assignment records (status/assigned_by/note) — the acceptance lifecycle. */
  assignees: TaskAssignment[];
  /** null = reporter was deleted ("Former member"). */
  reporter_id: string | null;
  project_id: string;
  /** null or undefined = backlog (not assigned to any sprint). */
  sprint_id?: string | null;
  due_date?: string;
  estimated_hours?: number;
  logged_hours?: number;
  tags: string[];
  /**
   * The `proposals.line_items[].id` this task was seeded from (migration 0032/0033).
   *
   * The stable pair for estimate ↔ project sync. Before it, the only link was
   * the TITLE, so renaming a line item duplicated its task, deleting one
   * orphaned it, and changing its hours did nothing. `null` means a person
   * created this task by hand — an estimate sync never touches those.
   */
  source_line_item_id?: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  comments: Comment[];
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "admin" | "manager" | "member" | "viewer";
  avatar_url: string;
  initials: string;
  avatarColor: string;
  /** Per-user page allowlist (hrefs). null/undefined = role defaults. */
  page_access?: string[] | null;
  /** Set when offboarded (banned). null/undefined = active. */
  deactivated_at?: string | null;
  /** Set when the invite was accepted. null/undefined = invited, not yet joined. */
  confirmed_at?: string | null;
}

export const TASK_STATUSES: { value: TaskStatus; label: string; color: string }[] = [
  { value: "todo", label: "To Do", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  { value: "in_progress", label: "In Progress", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  { value: "in_review", label: "In Review", color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
  { value: "done", label: "Done", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  { value: "blocked", label: "Blocked", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
];

export const TASK_PRIORITIES: { value: TaskPriority; label: string; color: string; border: string }[] = [
  { value: "low", label: "Low", color: "text-slate-500", border: "border-l-slate-400" },
  { value: "medium", label: "Medium", color: "text-blue-500", border: "border-l-blue-500" },
  { value: "high", label: "High", color: "text-amber-500", border: "border-l-amber-500" },
  { value: "critical", label: "Critical", color: "text-red-500", border: "border-l-red-500" },
];

export const EMOJI_OPTIONS = ["👍", "❤️", "😄", "🎉", "👀", "🚀", "😕", "✅"] as const;

export const CURRENT_USER_ID = "6";
