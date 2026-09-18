-- ============================================================================
-- 0034_pto_approval.sql — time off becomes a REQUEST, not a fact
--
-- Until now `availability_entries` had no status: whatever a member saved was
-- immediately real. It came off their weekly capacity, it steered the
-- auto-assignment planner, and it appeared on everyone's calendar — with nobody
-- having agreed to it. There was also no way for a person to see that a request
-- was still outstanding, because there was no such state.
--
-- Three things here:
--   1. a status (pending / approved / rejected) + who reviewed it and when;
--   2. a trigger, because RLS alone cannot stop self-approval — the existing
--      "write availability" policy lets a user write their own row, so a raw
--      API call could set status='approved' on it;
--   3. tighter reads. Everyone authenticated could read everyone's leave,
--      including the free-text note. That is personal data, and with the
--      calendar now scoped per role the UI does not need it either.
-- ============================================================================

create type availability_status as enum ('pending', 'approved', 'rejected');

alter table availability_entries
  add column if not exists status       availability_status not null default 'approved',
  add column if not exists reviewed_by  uuid references profiles(id) on delete set null,
  add column if not exists reviewed_at  timestamptz,
  add column if not exists review_note  text;

-- Existing rows default to 'approved' deliberately: they were already in force
-- before this migration, so anything else would retroactively cancel leave
-- people have already arranged their lives around.

comment on column availability_entries.status is
  'pending until an admin/manager reviews it. Only approved entries reduce '
  'capacity or steer scheduling — see countsAgainstCapacity() in '
  'lib/constants/workload.ts. Admin/manager entries are created approved; they '
  'are the approver, so asking them to approve themselves is theatre.';

-- Pending requests are read on every calendar/settings load, and the approval
-- queue asks for exactly this.
create index if not exists availability_status_idx
  on availability_entries (status)
  where status = 'pending';

-- ── Only an approver may decide ─────────────────────────────────────────────
-- Same trigger pattern as 0018's logged-hours guard: the policy below still has
-- to let a person write their OWN row (that is how a request is made), so the
-- decision itself is guarded here instead.
create or replace function prevent_self_approval()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  approver boolean := current_user_role() in ('admin', 'manager');
begin
  if tg_op = 'INSERT' then
    -- A member's own request always starts pending, whatever was submitted.
    if not approver and new.status <> 'pending' then
      new.status := 'pending';
      new.reviewed_by := null;
      new.reviewed_at := null;
    end if;
    return new;
  end if;

  if new.status is distinct from old.status and not approver then
    raise exception 'Only an admin or manager can approve or reject time off';
  end if;

  -- Re-requesting after a rejection is fine; silently keeping the old verdict
  -- attached to it is not.
  if new.status = 'pending' and old.status <> 'pending' then
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists availability_guard_status on availability_entries;
create trigger availability_guard_status
  before insert or update on availability_entries
  for each row execute function prevent_self_approval();

-- ── Reads: your own, or you are an approver ─────────────────────────────────
-- Everything that needs the whole roster's availability is already admin+manager
-- only: the Workload team view, the assignment planner, and the admin time-off
-- table. A member needs their own rows and nothing else.
drop policy if exists "read availability" on availability_entries;
create policy "read availability" on availability_entries
  for select using (
    user_id = auth.uid() or current_user_role() in ('admin', 'manager')
  );
