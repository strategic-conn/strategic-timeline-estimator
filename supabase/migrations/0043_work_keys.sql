-- ============================================================================
-- 0043 — employee work keys (pricing plan, Phase 4)
--
-- A work key is the workbook's lookup key, "IT|Level 2": which discipline a
-- person does and at what level. The assignment planner matches a task's role
-- against these FIRST and uses platform skill stars only to break ties
-- (plan decision 2). A person may hold several ("IT|Level 2", "QA Tester|Level 1").
--
-- Rules:
--  · ADMIN-SET ONLY. A key decides who gets work and at what seniority, so a
--    member giving themselves "IT|Level 2" is a self-promotion. Enforced by
--    prevent_role_self_change below, not by the UI.
--  · Format checked here; the role NAME is checked by the app against the
--    hourly_rates roles, so adding a role still needs no migration (0042).
-- ============================================================================

create or replace function valid_work_keys(keys text[])
returns boolean language sql immutable as $$
  select cardinality(keys) <= 10
     and coalesce(bool_and(k ~ '^[^|]{1,60}\|Level [12]$'), true)
  from unnest(keys) as k
$$;

alter table profiles
  add column if not exists work_keys text[] not null default '{}';

alter table profiles drop constraint if exists profiles_work_keys_valid;
alter table profiles add constraint profiles_work_keys_valid
  check (valid_work_keys(work_keys));

-- Same function as 0041, plus work_keys. Keep every earlier guard.
create or replace function prevent_role_self_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- NULL role = service role or an auth-schema trigger (e.g. the confirmation
  -- trigger from 0021 that sets confirmed_at). Those are trusted writers.
  if current_user_role() is not null and current_user_role() <> 'admin' then
    if new.role is distinct from old.role then
      raise exception 'Only admins can change a profile role';
    end if;
    if new.page_access is distinct from old.page_access then
      raise exception 'Only admins can change page access';
    end if;
    if new.deactivated_at is distinct from old.deactivated_at then
      raise exception 'Only admins can change activation state';
    end if;
    if new.confirmed_at is distinct from old.confirmed_at then
      raise exception 'Only admins can change confirmation state';
    end if;
    if new.email is distinct from old.email then
      raise exception 'Only admins can change a profile email';
    end if;
    if new.work_keys is distinct from old.work_keys then
      raise exception 'Only admins can change work keys';
    end if;
  end if;
  return new;
end;
$$;
