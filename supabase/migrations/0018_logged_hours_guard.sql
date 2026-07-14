-- ============================================================================
-- 0018_logged_hours_guard.sql — Workflow revamp fix: lock the hours loophole
-- RLS on `tasks` allows admin/manager/member to update rows, so `logged_hours`
-- (the cached total) was directly writable via a raw API call even by a
-- coordinator. Enforce the rule the UI already applies: only an ACCEPTED
-- assignee (or an admin correcting) may change logged_hours. Same trigger
-- pattern as 0009's role guard. Only fires when logged_hours actually changes,
-- so normal task edits (status/position/title/…) are unaffected.
-- ============================================================================

create or replace function prevent_unauthorized_hours()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.logged_hours is distinct from old.logged_hours
     and current_user_role() <> 'admin'
     and not exists (
       select 1 from task_assignees ta
       where ta.task_id = new.id
         and ta.profile_id = auth.uid()
         and ta.status = 'accepted'
     ) then
    raise exception 'Only accepted assignees can log hours on this task';
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_guard_hours on tasks;
create trigger tasks_guard_hours
  before update on tasks
  for each row execute function prevent_unauthorized_hours();
