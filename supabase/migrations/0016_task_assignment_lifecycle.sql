-- ============================================================================
-- 0016_task_assignment_lifecycle.sql — Workflow revamp Phase B
-- Each task assignment gets a lifecycle: a coordinator assigns (pending), the
-- developer accepts (accepted) or rejects/passes (row removed, coordinator
-- notified). Additive: existing rows default to 'accepted' so current
-- assignments behave exactly as before.
--
-- RLS: split the old blanket `write task assignees` into insert/update/delete so
-- a developer can respond to (update/delete) THEIR OWN assignment, while
-- coordinators (admin/manager) manage anyone's. task_assignees is already in the
-- realtime publication (0008); UPDATE (status) events now stream too.
-- ============================================================================

alter table task_assignees
  add column if not exists status text not null default 'accepted'
    check (status in ('pending', 'accepted', 'rejected', 'passed')),
  add column if not exists assigned_by uuid references profiles(id),
  add column if not exists responded_at timestamptz,
  add column if not exists note text;

drop policy if exists "write task assignees" on task_assignees;

-- Any non-viewer can create an assignment (coordinator assigns; a dev "passes"
-- by inserting a pending row for the teammate they hand it to).
create policy "insert task assignees" on task_assignees
  for insert
  with check (current_user_role() in ('admin', 'manager', 'member'));

-- A developer updates their own assignment (accept); coordinators update anyone's.
create policy "update task assignees" on task_assignees
  for update
  using (profile_id = auth.uid() or current_user_role() in ('admin', 'manager'))
  with check (profile_id = auth.uid() or current_user_role() in ('admin', 'manager'));

-- A developer removes their own assignment (reject/pass); coordinators remove anyone's.
create policy "delete task assignees" on task_assignees
  for delete
  using (profile_id = auth.uid() or current_user_role() in ('admin', 'manager'));
