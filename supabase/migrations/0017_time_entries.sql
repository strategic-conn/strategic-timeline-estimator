-- ============================================================================
-- 0017_time_entries.sql — Workflow revamp Phase C
-- Per-session hour attribution: who logged what, when. tasks.logged_hours stays
-- a cached running total; this is the audit + backbone for the personal/team
-- workload views (Phase D/E). RLS enforces "only an ACCEPTED assignee logs" — so
-- coordinators/managers can't put hours (the client's core rule), server-side.
-- ============================================================================

create table time_entries (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks(id) on delete cascade,
  profile_id  uuid not null references profiles(id) on delete cascade,
  hours       numeric not null check (hours > 0),
  note        text,
  logged_at   timestamptz not null default now()
);

create index time_entries_task_idx on time_entries (task_id);
create index time_entries_profile_idx on time_entries (profile_id, logged_at);

alter table time_entries enable row level security;

create policy "read time entries" on time_entries
  for select using (auth.role() = 'authenticated');

-- You may only log YOUR OWN hours, and only on a task you've accepted.
create policy "log own hours" on time_entries
  for insert with check (
    profile_id = auth.uid()
    and exists (
      select 1 from task_assignees ta
      where ta.task_id = time_entries.task_id
        and ta.profile_id = auth.uid()
        and ta.status = 'accepted'
    )
  );

-- Correct/remove your own entry; admins may fix anyone's.
create policy "update time entries" on time_entries
  for update using (profile_id = auth.uid() or current_user_role() = 'admin');
create policy "delete time entries" on time_entries
  for delete using (profile_id = auth.uid() or current_user_role() = 'admin');
