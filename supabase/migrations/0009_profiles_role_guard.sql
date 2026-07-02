-- ============================================================================
-- 0009_profiles_role_guard.sql — prevent privilege escalation via profiles
-- The "users update own profile" policy (0002) lets a user update their own
-- profiles row, but RLS can't restrict WHICH columns. Without this guard a
-- member/viewer could `update profiles set role='admin' where id = auth.uid()`
-- and escalate themselves. This trigger allows a role change only when the
-- ACTING user is an admin (matches "Manage team: admin only").
-- ============================================================================

create or replace function prevent_role_self_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role
     and current_user_role() <> 'admin' then
    raise exception 'Only admins can change a profile role';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role on profiles;
create trigger profiles_guard_role
  before update on profiles
  for each row execute function prevent_role_self_change();
