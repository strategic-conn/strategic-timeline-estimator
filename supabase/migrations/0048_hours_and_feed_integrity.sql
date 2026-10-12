-- 0048_hours_and_feed_integrity.sql — the three "High" items from the
-- 2026-10-09 audit. Each is pinned by a probe in scripts/security-probe.mjs
-- (P22–P25).

-- ── 1. A task's logged total is DERIVED from time entries ───────────────────
-- `tasks.logged_hours` was written by the browser as an absolute number, so an
-- accepted assignee could set it to anything (and the drawer let assignees,
-- managers and admins type over it). It is now maintained here, from the
-- entries, and nobody writes it directly — the client only inserts entries.
-- Live data had no entries and no logged hours when this shipped, so there was
-- nothing to reconcile.
create or replace function sync_task_logged_hours()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Lets prevent_unauthorized_hours tell this trigger from a client write.
  perform set_config('app.hours_sync', 'on', true);
  if tg_op in ('UPDATE', 'DELETE') and old.task_id is not null then
    update tasks set logged_hours = greatest(coalesce(logged_hours, 0) - old.hours, 0)
    where id = old.task_id;
  end if;
  -- A NULL task_id on UPDATE is the FK detaching an entry from a deleted task
  -- (section 3): that task is going, so there is nothing to add to.
  if tg_op in ('INSERT', 'UPDATE') and new.task_id is not null then
    update tasks set logged_hours = coalesce(logged_hours, 0) + new.hours
    where id = new.task_id;
  end if;
  perform set_config('app.hours_sync', '', true);
  return null;
end;
$$;

drop trigger if exists time_entries_sync_logged_hours on time_entries;
create trigger time_entries_sync_logged_hours
  after insert or update or delete on time_entries
  for each row execute function sync_task_logged_hours();

-- Replaces 0018's guard: no signed-in user writes logged_hours directly any
-- more, admins included — an admin corrects time by fixing the ENTRY (UPDATE /
-- DELETE on time_entries is admin-only since 0046), and the total follows.
-- Service-role / migrations (no JWT) are still trusted.
create or replace function prevent_unauthorized_hours()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.logged_hours is distinct from old.logged_hours
     and auth.uid() is not null
     and coalesce(current_setting('app.hours_sync', true), '') <> 'on' then
    raise exception 'Logged hours come from time entries — log time instead of editing the total';
  end if;
  return new;
end;
$$;

-- ── 2. Deleting a task keeps the time logged on it ──────────────────────────
-- time_entries.task_id was ON DELETE CASCADE (0017), so deleting a task — or a
-- project, which cascades to its tasks — erased the record that the work
-- happened, and per-person hours on Workload, the dashboard and Reports fell
-- with it. The entry now survives, detached (task_id NULL), still counting for
-- the person who logged it.
alter table time_entries alter column task_id drop not null;
-- Drop whatever FK points task_id at tasks, by what it IS rather than by its
-- assumed name: a miss here would leave the old CASCADE in place beside the new
-- constraint, silently.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.conrelid = 'public.time_entries'::regclass
      and con.contype = 'f'
      and con.confrelid = 'public.tasks'::regclass
      and att.attname = 'task_id'
  loop
    execute format('alter table time_entries drop constraint %I', c.conname);
  end loop;
end $$;
alter table time_entries
  add constraint time_entries_task_id_fkey
  foreign key (task_id) references tasks(id) on delete set null;

-- ── 3. Notifications and activity: no forged times, flags or essays ─────────
-- actor_id is already pinned to the caller (0006 / 0027) and both the bell and
-- the feed render the sender from it, so a message is always attributable. What
-- the client could still forge: the timestamp (back- or future-dating an entry
-- in someone's bell or the workspace feed), a notification arriving already
-- "read" (never seen), arbitrarily long text, and — once deactivated — keep
-- sending for the life of a token.
create or replace function stamp_feed_row()
returns trigger language plpgsql set search_path = public as $$
begin
  new.created_at := now();
  if tg_table_name = 'notifications' then
    new.read := false;
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_stamp on notifications;
create trigger notifications_stamp
  before insert on notifications
  for each row execute function stamp_feed_row();

drop trigger if exists activity_stamp on activity;
create trigger activity_stamp
  before insert on activity
  for each row execute function stamp_feed_row();

-- Longest live text when this shipped: 116 (notifications) / 120 (activity).
alter table notifications drop constraint if exists notifications_text_len;
alter table notifications
  add constraint notifications_text_len check (char_length(btrim(text)) between 1 and 500);
alter table activity drop constraint if exists activity_text_len;
alter table activity
  add constraint activity_text_len check (char_length(btrim(text)) between 1 and 500);

-- Active people only: current_user_role() is NULL once deactivated (0046).
drop policy if exists "insert notifications" on notifications;
create policy "insert notifications" on notifications
  for insert with check (actor_id = auth.uid() and current_user_role() is not null);

drop policy if exists "insert activity" on activity;
create policy "insert activity" on activity
  for insert with check (actor_id = auth.uid() and current_user_role() is not null);
