-- ============================================================================
-- 0027_security_phase1.sql — Phase 1 security remediation (from the audit)
--
-- Closes forgery / self-escalation holes. The browser holds the anon key and
-- writes to Postgres directly, so RLS + triggers are the real wall — these
-- tighten what a crafted client can send. All additive; no schema/column
-- changes; verified against the legitimate write paths (create task/comment,
-- pass-to-peer assign, convert-to-project, invite-accept, admin deactivate) so
-- none of them break. Keeps RLS in lockstep with usePermissions().
-- ============================================================================

-- ── C1: notifications — you can't forge who the notification is "from" ──────
-- Before (0006): any authenticated user could insert a notification for any
-- recipient with a client-supplied `actor_id` → impersonate anyone's avatar/name
-- (and arbitrary text/href = in-app phishing). Pin the actor to the caller.
-- Cross-user targeting still works: `recipient_id` is intentionally unconstrained
-- (that's how "notify a teammate" works); only the *sender identity* is locked.
drop policy if exists "insert notifications" on notifications;
create policy "insert notifications" on notifications
  for insert with check (actor_id = auth.uid());

-- ── L1: tasks & comments — the author is always the caller ──────────────────
-- Stop a client setting `reporter_id` / `author_id` to another person on insert
-- (attribution spoofing). Every legitimate path already sets these to the
-- current user, so this only rejects forged values.
drop policy if exists "create tasks" on tasks;
create policy "create tasks" on tasks
  for insert with check (
    current_user_role() in ('admin', 'manager', 'member')
    and reporter_id = auth.uid()
  );

drop policy if exists "add comments" on task_comments;
create policy "add comments" on task_comments
  for insert with check (
    current_user_role() in ('admin', 'manager', 'member')
    and author_id = auth.uid()
  );

-- ── C2 (residual): task assignees — can't forge who assigned it ─────────────
-- UPDATE/DELETE are already self-scoped (0016). Only tighten INSERT so the
-- assigner-of-record is the caller (no spoofing `assigned_by`). Members still
-- need INSERT for "pass to a teammate", so the role set is unchanged.
drop policy if exists "insert task assignees" on task_assignees;
create policy "insert task assignees" on task_assignees
  for insert with check (
    current_user_role() in ('admin', 'manager', 'member')
    and assigned_by = auth.uid()
  );

-- ── H1: profile self-update — guard privileged columns ──────────────────────
-- 0009 blocked a user self-changing `role`. Extend the same guard to
-- `page_access` (would self-grant page access) and `deactivated_at` (would
-- un-flag their own deactivation). NOT `confirmed_at`: 0021's invite-accept
-- trigger sets it from a non-admin context, and it grants no access anyway.
--
-- `current_user_role() is not null and <> 'admin'` fires only for a real
-- signed-in non-admin. It intentionally skips NULL-role contexts (migrations run
-- as postgres, service-role, SECURITY DEFINER triggers) so system writes to
-- these columns (e.g. the admin API's deactivate) are never blocked. A signed-in
-- user can't make current_user_role() NULL (their profile row always has a role),
-- so the guard can't be bypassed that way.
create or replace function prevent_role_self_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
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
  end if;
  return new;
end;
$$;
-- The `profiles_guard_role` trigger (0009) already calls this function; redefining
-- the body is enough. Re-assert it defensively in case 0009 wasn't applied.
drop trigger if exists profiles_guard_role on profiles;
create trigger profiles_guard_role
  before update on profiles
  for each row execute function prevent_role_self_change();

-- NOTE for future migrations: a bulk UPDATE of page_access / deactivated_at run
-- as postgres passes (NULL role → guard skipped). If ever run under a real
-- non-admin session, disable this trigger for that statement.
