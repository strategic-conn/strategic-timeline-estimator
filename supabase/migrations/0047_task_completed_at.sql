-- 0047_task_completed_at.sql — when a task was actually finished.
--
-- On-time delivery (dashboard + Reports) read `updated_at` as the completion
-- time, but any later edit to a done task — a comment-driven rename, a re-tag,
-- a board reorder — moved it, so a task finished on time could turn "late"
-- weeks afterwards. `completed_at` is stamped once, by this trigger, when the
-- status ENTERS done, and cleared when it leaves. The client never sends it:
-- whatever it sends is overwritten, so it cannot be forged either.

alter table tasks add column if not exists completed_at timestamptz;

-- Backfill BEFORE the trigger exists: for tasks already done, updated_at is the
-- best record there is (it is what the on-time figure read until now).
update tasks set completed_at = updated_at
where status = 'done' and completed_at is null;

create or replace function stamp_task_completed_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' then
      new.completed_at := now();
    else
      new.completed_at := old.completed_at;   -- still done: keep the first stamp
    end if;
  else
    new.completed_at := null;                 -- reopened: not finished any more
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_stamp_completed_at on tasks;
create trigger tasks_stamp_completed_at
  before insert or update on tasks
  for each row execute function stamp_task_completed_at();
