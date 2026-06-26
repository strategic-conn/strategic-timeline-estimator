import type { Task, TeamMember } from "@/types/task.types";

export const TEAM_MEMBERS: TeamMember[] = [
  { id: 1, name: "Ana Reyes", email: "ana@company.com", role: "admin", avatar_url: "https://i.pravatar.cc/40?u=1", initials: "AR", avatarColor: "#6366f1" },
  { id: 2, name: "Ben Cruz", email: "ben@company.com", role: "manager", avatar_url: "https://i.pravatar.cc/40?u=2", initials: "BC", avatarColor: "#0ea5e9" },
  { id: 3, name: "Claire Santos", email: "claire@company.com", role: "member", avatar_url: "https://i.pravatar.cc/40?u=3", initials: "CS", avatarColor: "#f59e0b" },
  { id: 4, name: "Diego Lim", email: "diego@company.com", role: "member", avatar_url: "https://i.pravatar.cc/40?u=4", initials: "DL", avatarColor: "#10b981" },
  { id: 5, name: "Eva Torres", email: "eva@company.com", role: "viewer", avatar_url: "https://i.pravatar.cc/40?u=5", initials: "ET", avatarColor: "#ec4899" },
  { id: 6, name: "Felix Gomez", email: "felix@company.com", role: "member", avatar_url: "https://i.pravatar.cc/40?u=6", initials: "FG", avatarColor: "#8b5cf6" },
];

export const ALL_TAGS = ["frontend", "backend", "bug", "design", "devops", "ux", "docs", "refactor", "security", "performance"];

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export const DUMMY_TASKS: Task[] = [
  {
    id: "T-001", title: "Set up auth flow with Supabase", description: "Wire Supabase Auth (@supabase/ssr) for cookie-based sessions. Handle login, logout, and middleware session refresh.", status: "done", priority: "high",
    assignee_ids: [6], reporter_id: 2, project_id: "proj-1", sprint_id: "sprint-1", due_date: daysFromNow(-3), estimated_hours: 8, logged_hours: 9, tags: ["frontend", "security"], position: 0, created_at: daysFromNow(-14), updated_at: daysFromNow(-2),
    comments: [
      { id: "c1", author_id: 2, body: "Make sure the session cookie refreshes in middleware. @Felix Gomez can you double-check?", created_at: daysFromNow(-5), reactions: [{ emoji: "👍", userIds: [6] }], replies: [
        { id: "r1", author_id: 6, body: "Confirmed — getUser() in middleware rotates it. PR is up.", created_at: daysFromNow(-4), mentions: [] },
      ] },
    ],
  },
  {
    id: "T-002", title: "Design system tokens audit", description: "Review all color tokens, spacing, and typography against the Figma spec. Fix inconsistencies.", status: "in_review", priority: "medium",
    assignee_ids: [3], reporter_id: 1, project_id: "proj-1", sprint_id: "sprint-2", due_date: daysFromNow(1), estimated_hours: 5, logged_hours: 4, tags: ["design", "frontend"], position: 0, created_at: daysFromNow(-10), updated_at: daysFromNow(-1),
    comments: [
      { id: "c2", author_id: 1, body: "Let's use the oklch values from globals.css as the single source.", created_at: daysFromNow(-3), reactions: [{ emoji: "✅", userIds: [3, 6] }], replies: [] },
    ],
  },
  {
    id: "T-003", title: "Kanban board drag-and-drop", description: "Implement @dnd-kit based Kanban board with cross-column and in-column reordering. Optimistic updates.", status: "in_progress", priority: "high",
    assignee_ids: [6, 4], reporter_id: 2, project_id: "proj-1", sprint_id: "sprint-2", due_date: daysFromNow(3), estimated_hours: 12, logged_hours: 5, tags: ["frontend", "ux"], position: 0, created_at: daysFromNow(-7), updated_at: daysFromNow(0),
    comments: [], },
  {
    id: "T-004", title: "Fix sidebar collapse on Safari", description: "Sidebar flash-of-content when collapsing on Safari 17. Likely a flexbox rendering issue.", status: "blocked", priority: "critical",
    assignee_ids: [4], reporter_id: 3, project_id: "proj-1", sprint_id: "sprint-2", due_date: daysFromNow(-1), estimated_hours: 3, logged_hours: 1, tags: ["bug", "frontend"], position: 0, created_at: daysFromNow(-5), updated_at: daysFromNow(-1),
    comments: [
      { id: "c3", author_id: 4, body: "Waiting on BrowserStack access to repro. @Ben Cruz can you approve?", created_at: daysFromNow(-2), reactions: [{ emoji: "👀", userIds: [2] }], replies: [
        { id: "r2", author_id: 2, body: "Done — check your email for the invite.", created_at: daysFromNow(-1), mentions: [4] },
      ] },
    ],
  },
  {
    id: "T-005", title: "Supabase error handler utility", description: "Create parseSupabaseError() that maps Postgres/RLS errors to React Hook Form field errors.", status: "todo", priority: "medium",
    assignee_ids: [6], reporter_id: 2, project_id: "proj-1", sprint_id: "sprint-2", due_date: daysFromNow(5), estimated_hours: 4, logged_hours: 0, tags: ["frontend", "backend"], position: 0, created_at: daysFromNow(-3), updated_at: daysFromNow(-3),
    comments: [], },
  {
    id: "T-006", title: "Empty state illustrations", description: "Design and export SVG empty-state illustrations for projects, tasks, calendar, and reports pages.", status: "todo", priority: "low",
    assignee_ids: [3], reporter_id: 1, project_id: "proj-1", sprint_id: null, due_date: daysFromNow(10), estimated_hours: 6, logged_hours: 0, tags: ["design"], position: 1, created_at: daysFromNow(-6), updated_at: daysFromNow(-6),
    comments: [], },
  {
    id: "T-007", title: "Implement project CRUD hooks", description: "useProjects, useProject, useCreateProject, useUpdateProject, useDeleteProject — Supabase queries via TanStack Query.", status: "in_progress", priority: "high",
    assignee_ids: [6], reporter_id: 2, project_id: "proj-1", sprint_id: "sprint-2", due_date: daysFromNow(2), estimated_hours: 6, logged_hours: 3, tags: ["frontend"], position: 1, created_at: daysFromNow(-4), updated_at: daysFromNow(0),
    comments: [
      { id: "c4", author_id: 6, body: "Draft PR ready — needs optimistic delete review.", created_at: daysFromNow(0), reactions: [], replies: [] },
    ],
  },
  {
    id: "T-008", title: "Mobile nav bottom tab bar", description: "Fixed bottom nav bar for mobile with 4 primary tabs: Dashboard, Projects, Tasks, Calendar.", status: "done", priority: "medium",
    assignee_ids: [4], reporter_id: 2, project_id: "proj-1", sprint_id: "sprint-1", due_date: daysFromNow(-5), estimated_hours: 4, logged_hours: 4, tags: ["frontend", "ux"], position: 1, created_at: daysFromNow(-12), updated_at: daysFromNow(-5),
    comments: [], },
  {
    id: "T-009", title: "Role-based UI gating", description: "Implement usePermissions hook and hide action buttons for viewer role. Test all CRUD surfaces.", status: "todo", priority: "high",
    assignee_ids: [], reporter_id: 1, project_id: "proj-1", sprint_id: "sprint-3", due_date: daysFromNow(4), estimated_hours: 5, logged_hours: 0, tags: ["frontend", "security"], position: 2, created_at: daysFromNow(-2), updated_at: daysFromNow(-2),
    comments: [], },
  {
    id: "T-010", title: "Date picker component for forms", description: "Wrap shadcn Calendar + Popover into a reusable DatePicker form component with RHF integration.", status: "in_review", priority: "medium",
    assignee_ids: [3], reporter_id: 6, project_id: "proj-1", sprint_id: "sprint-2", due_date: daysFromNow(0), estimated_hours: 3, logged_hours: 3, tags: ["frontend", "ux"], position: 1, created_at: daysFromNow(-8), updated_at: daysFromNow(0),
    comments: [
      { id: "c5", author_id: 3, body: "Added keyboard nav support. Ready for review.", created_at: daysFromNow(0), reactions: [{ emoji: "🎉", userIds: [6] }], replies: [] },
    ],
  },
  {
    id: "T-011", title: "PDF export for proposals", description: "Use jsPDF + jspdf-autotable to export proposals. Match the Figma design spec.", status: "todo", priority: "low",
    assignee_ids: [], reporter_id: 2, project_id: "proj-1", sprint_id: null, due_date: daysFromNow(20), estimated_hours: 10, logged_hours: 0, tags: ["frontend", "docs"], position: 3, created_at: daysFromNow(-1), updated_at: daysFromNow(-1),
    comments: [], },
  {
    id: "T-012", title: "Notification bell dropdown", description: "Create in-app notification panel. Bell icon with unread count badge, dropdown with notification list.", status: "in_progress", priority: "medium",
    assignee_ids: [4], reporter_id: 2, project_id: "proj-1", sprint_id: "sprint-2", due_date: daysFromNow(6), estimated_hours: 8, logged_hours: 2, tags: ["frontend", "ux"], position: 2, created_at: daysFromNow(-3), updated_at: daysFromNow(0),
    comments: [], },
  {
    id: "T-013", title: "Fix pagination offset bug", description: "Table pagination sends wrong offset after deleting a row on the last page. Off-by-one error.", status: "blocked", priority: "high",
    assignee_ids: [6], reporter_id: 3, project_id: "proj-1", sprint_id: "sprint-2", due_date: daysFromNow(-2), estimated_hours: 2, logged_hours: 1, tags: ["bug", "frontend"], position: 1, created_at: daysFromNow(-4), updated_at: daysFromNow(-1),
    comments: [
      { id: "c6", author_id: 6, body: "Reproduced. Blocked on the backend returning wrong total after delete.", created_at: daysFromNow(-1), reactions: [], replies: [
        { id: "r3", author_id: 3, body: "I'll ping the backend team. @Ana Reyes FYI.", created_at: daysFromNow(-1), mentions: [1] },
      ] },
    ],
  },
  {
    id: "T-014", title: "Workspace settings page", description: "Settings page with workspace name, default timezone, notification prefs, and danger zone (delete workspace).", status: "todo", priority: "medium",
    assignee_ids: [4], reporter_id: 1, project_id: "proj-1", sprint_id: "sprint-3", due_date: daysFromNow(8), estimated_hours: 6, logged_hours: 0, tags: ["frontend"], position: 4, created_at: daysFromNow(-2), updated_at: daysFromNow(-2),
    comments: [], },
  {
    id: "T-015", title: "Gantt chart POC", description: "Proof-of-concept Gantt chart with react-gantt-task. Show task bars, dependencies, and zoom controls.", status: "todo", priority: "low",
    assignee_ids: [], reporter_id: 2, project_id: "proj-1", sprint_id: null, due_date: daysFromNow(15), estimated_hours: 14, logged_hours: 0, tags: ["frontend", "ux"], position: 5, created_at: daysFromNow(-1), updated_at: daysFromNow(-1),
    comments: [], },
  {
    id: "T-016", title: "Write Zod schemas for all forms", description: "auth.schema, project.schema, task.schema, proposal.schema — with proper error messages.", status: "in_progress", priority: "medium",
    assignee_ids: [6], reporter_id: 2, project_id: "proj-1", sprint_id: "sprint-2", due_date: daysFromNow(4), estimated_hours: 4, logged_hours: 2, tags: ["frontend"], position: 3, created_at: daysFromNow(-5), updated_at: daysFromNow(0),
    comments: [], },
  {
    id: "T-017", title: "Accessibility audit — keyboard nav", description: "Ensure all interactive elements are keyboard-navigable. Fix missing focus rings, aria labels, and tab order.", status: "todo", priority: "medium",
    assignee_ids: [], reporter_id: 1, project_id: "proj-1", sprint_id: null, due_date: daysFromNow(12), estimated_hours: 8, logged_hours: 0, tags: ["frontend", "ux"], position: 6, created_at: daysFromNow(-1), updated_at: daysFromNow(-1),
    comments: [], },
  {
    id: "T-018", title: "ConfirmDialog shared component", description: "Build a reusable ConfirmDialog (shadcn AlertDialog wrapper) that names exactly what will be destroyed.", status: "done", priority: "medium",
    assignee_ids: [3], reporter_id: 6, project_id: "proj-1", sprint_id: "sprint-1", due_date: daysFromNow(-7), estimated_hours: 2, logged_hours: 2, tags: ["frontend"], position: 2, created_at: daysFromNow(-15), updated_at: daysFromNow(-7),
    comments: [
      { id: "c7", author_id: 6, body: "Looks great, merged!", created_at: daysFromNow(-7), reactions: [{ emoji: "❤️", userIds: [3] }], replies: [] },
    ],
  },
  {
    id: "T-019", title: "DataTable with server-side sort", description: "Build a generic DataTable component on top of shadcn Table. Support server-side sorting, pagination, and row selection.", status: "in_review", priority: "high",
    assignee_ids: [6, 2], reporter_id: 2, project_id: "proj-1", sprint_id: "sprint-2", due_date: daysFromNow(1), estimated_hours: 10, logged_hours: 8, tags: ["frontend", "refactor"], position: 2, created_at: daysFromNow(-9), updated_at: daysFromNow(0),
    comments: [
      { id: "c8", author_id: 2, body: "Can we make column visibility togglable?", created_at: daysFromNow(0), reactions: [], replies: [
        { id: "r4", author_id: 6, body: "Added in the latest commit. Toggle button in the toolbar.", created_at: daysFromNow(0), mentions: [] },
      ] },
    ],
  },
  {
    id: "T-020", title: "Migrate to strict CSP headers", description: "Configure Content-Security-Policy in next.config.js. Remove inline styles where possible. Test with report-only first.", status: "todo", priority: "high",
    assignee_ids: [], reporter_id: 1, project_id: "proj-1", sprint_id: null, due_date: daysFromNow(7), estimated_hours: 6, logged_hours: 0, tags: ["security", "devops"], position: 7, created_at: daysFromNow(-1), updated_at: daysFromNow(-1),
    comments: [], },
];
