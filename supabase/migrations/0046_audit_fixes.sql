-- 0046_audit_fixes.sql — loopholes found by the 2026-10-09 audit.
-- Each is pinned by a probe in scripts/security-probe.mjs (P1b, P18–P21).

-- ── 1. Time entries: members could rewrite their own logged hours ─────────────
-- 0017's UPDATE policy only pinned profile_id, so a member could PATCH their own
-- entry to 500 h, back-date it, or move it onto a task they were never on — all
-- of which flows into Workload, the dashboard and Reports. Probe P1 missed it by
-- also changing profile_id in the same request, which failed for that reason
-- alone. The app only ever INSERTS entries; correcting one is an admin's job.
drop policy if exists "update time entries" on time_entries;
create policy "update time entries" on time_entries
  for update
  using (current_user_role() = 'admin')
  with check (current_user_role() = 'admin');

drop policy if exists "delete time entries" on time_entries;
create policy "delete time entries" on time_entries
  for delete
  using (current_user_role() = 'admin');

-- ── 2. Task assignments: consent and history can't be forged ─────────────────
-- Members may assign themselves (accepted at once — by design) and pass a task
-- to a teammate (pending). But the row's status came from the client, so a
-- member could put a COLLEAGUE on a task already "accepted" — loading their
-- workload, and opening the task to time logging, without them ever agreeing —
-- and could edit their own row's task_id to move an acceptance to another task.
create or replace function guard_task_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Trusted: the service role / server code (no JWT) and coordinators.
  if auth.uid() is null
     or coalesce(current_user_role() in ('admin', 'manager'), false) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Anyone else's assignment starts as a request they must answer.
    if new.profile_id is distinct from auth.uid() then
      new.status := 'pending';
      new.responded_at := null;
    end if;
    return new;
  end if;

  -- UPDATE (RLS already limits a member to their OWN row): only the response
  -- may change, and the only response stored is "accepted" — declining and
  -- passing delete the row instead.
  new.task_id := old.task_id;
  new.profile_id := old.profile_id;
  new.assigned_by := old.assigned_by;
  if new.status is distinct from old.status and new.status <> 'accepted' then
    raise exception 'You can only accept an assignment';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_task_assignment on task_assignees;
create trigger guard_task_assignment
  before insert or update on task_assignees
  for each row execute function guard_task_assignment();

-- ── 3. Deactivated people lose their role at once ───────────────────────────
-- Deactivating bans the auth user, which stops refreshes — but an access token
-- already issued stays valid for up to an hour, and current_user_role() ignored
-- deactivated_at, so for that hour they kept full read/write access.
create or replace function current_user_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles
  where id = auth.uid() and deactivated_at is null
$$;

-- …which means a deactivated person now has a NULL role, and the profile guard
-- treated a NULL role as a trusted system writer. Identify the system by "no
-- signed-in user" instead, so a deactivated session is guarded, not trusted.
-- Same checks as 0043; only the first condition changes.
create or replace function prevent_role_self_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(current_user_role()::text, '') <> 'admin' then
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

-- ── 4. Estimate links: database backstops ───────────────────────────────────
-- One estimate per project. Two estimates on one project made "Sync schedule"
-- treat the other estimate's tasks as removed and delete them.
create unique index if not exists proposals_project_id_uq
  on proposals (project_id) where project_id is not null;

-- One estimate per PO. PBS has no delete, so a second estimate claiming the
-- same PO number is always a bug.
create unique index if not exists proposals_po_no_uq
  on proposals ((pbs ->> 'po_no')) where (pbs ->> 'po_no') is not null;

-- One ACTIVE estimate per Zoho deal (rejected ones may be replaced) — the rule
-- lib/zoho/deal-exclusivity.ts enforces in the UI, now also in the database.
create unique index if not exists proposals_active_deal_uq
  on proposals ((zoho ->> 'deal_id'))
  where (zoho ->> 'deal_id') is not null and status <> 'rejected';

-- ── 5. Indexes the audit found missing (FK / RLS filter columns) ────────────
create index if not exists sprints_project_id_idx on sprints (project_id);
create index if not exists task_comments_task_id_idx on task_comments (task_id);
create index if not exists task_assignees_profile_id_idx on task_assignees (profile_id);
create index if not exists availability_entries_user_id_idx on availability_entries (user_id);
create index if not exists notifications_recipient_created_idx
  on notifications (recipient_id, created_at desc);
