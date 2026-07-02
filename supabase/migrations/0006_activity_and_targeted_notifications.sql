-- 0006_activity_and_targeted_notifications.sql
-- Split the two concepts that previously shared the notifications table:
--   • activity      = workspace-wide log (everyone sees everything)
--   • notifications = personal, targeted alerts (recipient only)
-- and allow notifying OTHER users (so teammates get pinged about their work).

-- ── workspace activity log ───────────────────────────────────────────────
create table if not exists activity (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid not null references profiles(id) on delete cascade,
  text        text not null,
  href        text,
  project_id  uuid references projects(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists activity_created_idx on activity (created_at desc);

alter table activity enable row level security;

drop policy if exists "read activity" on activity;
create policy "read activity" on activity
  for select using (auth.role() = 'authenticated');

drop policy if exists "insert activity" on activity;
create policy "insert activity" on activity
  for insert with check (actor_id = auth.uid());

-- ── notifications: allow creating them for any teammate ───────────────────
-- (Targeting means the actor inserts rows for OTHER recipients, not just self.)
drop policy if exists "insert own notifications" on notifications;
drop policy if exists "insert notifications" on notifications;
create policy "insert notifications" on notifications
  for insert with check (auth.role() = 'authenticated');

-- ── realtime for the activity log (notifications already streamed) ─────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'activity'
  ) then
    alter publication supabase_realtime add table activity;
  end if;
end $$;
