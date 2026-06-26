-- ============================================================================
-- 0002_rls.sql — Row-Level Security policies
-- Encodes the permission matrix from CLAUDE.md ("User Roles & Permissions").
-- The UI (usePermissions) mirrors these for UX; the database is the real wall.
-- ============================================================================

-- Current user's role (security definer so it can read profiles under RLS).
create or replace function current_user_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Enable RLS everywhere.
alter table profiles             enable row level security;
alter table projects             enable row level security;
alter table sprints              enable row level security;
alter table tasks                enable row level security;
alter table task_assignees       enable row level security;
alter table task_comments        enable row level security;
alter table comment_reactions    enable row level security;
alter table availability_entries enable row level security;
alter table weekly_capacity      enable row level security;
alter table notifications        enable row level security;
alter table proposals            enable row level security;

-- ── profiles ─────────────────────────────────────────────────────────────
create policy "profiles readable by authenticated" on profiles
  for select using (auth.role() = 'authenticated');
create policy "users update own profile" on profiles
  for update using (id = auth.uid());
create policy "admin manages profiles" on profiles
  for all using (current_user_role() = 'admin')
  with check (current_user_role() = 'admin');

-- ── projects (create/edit: admin+manager · delete: admin) ────────────────
create policy "read projects" on projects
  for select using (auth.role() = 'authenticated');
create policy "create projects" on projects
  for insert with check (current_user_role() in ('admin', 'manager'));
create policy "update projects" on projects
  for update using (current_user_role() in ('admin', 'manager'));
create policy "delete projects" on projects
  for delete using (current_user_role() = 'admin');

-- ── sprints (follow project write perms) ─────────────────────────────────
create policy "read sprints" on sprints
  for select using (auth.role() = 'authenticated');
create policy "write sprints" on sprints
  for all using (current_user_role() in ('admin', 'manager'))
  with check (current_user_role() in ('admin', 'manager'));

-- ── tasks (create/edit: admin+manager+member · delete: admin+manager) ────
create policy "read tasks" on tasks
  for select using (auth.role() = 'authenticated');
create policy "create tasks" on tasks
  for insert with check (current_user_role() in ('admin', 'manager', 'member'));
create policy "update tasks" on tasks
  for update using (current_user_role() in ('admin', 'manager', 'member'));
create policy "delete tasks" on tasks
  for delete using (current_user_role() in ('admin', 'manager'));

create policy "read task assignees" on task_assignees
  for select using (auth.role() = 'authenticated');
create policy "write task assignees" on task_assignees
  for all using (current_user_role() in ('admin', 'manager', 'member'))
  with check (current_user_role() in ('admin', 'manager', 'member'));

-- ── comments (any non-viewer can add; author/admin/manager can remove) ───
create policy "read comments" on task_comments
  for select using (auth.role() = 'authenticated');
create policy "add comments" on task_comments
  for insert with check (current_user_role() in ('admin', 'manager', 'member'));
create policy "edit own comments" on task_comments
  for update using (author_id = auth.uid());
create policy "delete comments" on task_comments
  for delete using (author_id = auth.uid() or current_user_role() in ('admin', 'manager'));

create policy "read reactions" on comment_reactions
  for select using (auth.role() = 'authenticated');
create policy "toggle own reactions" on comment_reactions
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ── availability (edit others: admin+manager · self: anyone) ─────────────
create policy "read availability" on availability_entries
  for select using (auth.role() = 'authenticated');
create policy "write availability" on availability_entries
  for all using (user_id = auth.uid() or current_user_role() in ('admin', 'manager'))
  with check (user_id = auth.uid() or current_user_role() in ('admin', 'manager'));

create policy "read capacity" on weekly_capacity
  for select using (auth.role() = 'authenticated');
create policy "write capacity" on weekly_capacity
  for all using (profile_id = auth.uid() or current_user_role() in ('admin', 'manager'))
  with check (profile_id = auth.uid() or current_user_role() in ('admin', 'manager'));

-- ── notifications (each user sees/clears only their own) ──────────────────
create policy "own notifications" on notifications
  for select using (recipient_id = auth.uid());
create policy "update own notifications" on notifications
  for update using (recipient_id = auth.uid());

-- ── proposals (same gate as "Export proposals": admin + manager) ─────────
create policy "proposals admin/manager" on proposals
  for all using (current_user_role() in ('admin', 'manager'))
  with check (current_user_role() in ('admin', 'manager'));
