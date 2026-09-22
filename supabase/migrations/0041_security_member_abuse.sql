-- ============================================================================
-- 0041 — close member-level abuse paths found by scripts/security-probe.mjs
--
-- Every finding below was reproduced LIVE with a real member JWT calling
-- PostgREST directly — the anon key is public, so the UI's usePermissions()
-- hides buttons but enforces nothing. The probe is the regression test:
--   node scripts/security-probe.mjs      (all lines must read PASS)
--
-- 1. Time off: the approval guard blocked the honest path and allowed the
--    dishonest one.
--      · A member extending an APPROVED leave by changing only its dates kept
--        it approved — 2 days became 12, still "approved", and capacity shrank
--        with nobody asked. (P2)
--      · A member editing their own decided leave the way the client does —
--        sending status 'pending' to re-request — was REFUSED, because 0035
--        raised on any status change by a non-approver. So members could never
--        edit their own approved or rejected leave at all. (P3)
--      · A member could insert a request carrying reviewed_by = a manager and
--        review_note = "Approved by the boss". (P4)
--
-- 2. Profiles: a member could null their own confirmed_at, which drops them
--    out of useJoinedTeamMembers — off the roster, the team calendar and every
--    capacity figure. (P5) email was editable too, so a member could show
--    someone else's address in the directory.
--
-- 3. Links: notifications and activity accepted ANY href. Any signed-in user —
--    a viewer included — could put "https://evil.example/login" into a
--    colleague's bell, or "//evil.example" (protocol-relative) into the
--    workspace-wide feed everyone reads. (P6, P7)
-- ============================================================================

-- ── 1. Time-off approval guard ──────────────────────────────────────────────
create or replace function prevent_self_approval()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  -- coalesce, NOT a bare `in` (see 0035): NULL there meant "no guard".
  approver boolean := coalesce(current_user_role() in ('admin', 'manager'), false);
begin
  if tg_op = 'INSERT' then
    if not approver then
      -- A request never arrives with a verdict attached.
      new.status := 'pending';
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.review_note := null;
    end if;
    return new;
  end if;

  if not approver then
    -- A non-approver may withdraw to 'pending' (re-request), never decide.
    if new.status is distinct from old.status and new.status <> 'pending' then
      raise exception 'Only an admin or manager can approve or reject time off';
    end if;

    -- The verdict belongs to whoever decided it.
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.review_note := old.review_note;

    -- An approval covered specific dates. Moving them is a new request, whether
    -- or not the client remembered to say so.
    if old.status <> 'pending' and (
         new.start_date is distinct from old.start_date
      or new.end_date   is distinct from old.end_date
      or new.kind       is distinct from old.kind
    ) then
      new.status := 'pending';
    end if;
  end if;

  -- Re-requesting clears the old verdict, for anyone.
  if new.status = 'pending' and old.status <> 'pending' then
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;
  return new;
end;
$$;

-- ── 2. Profile self-edit guard ──────────────────────────────────────────────
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
  end if;
  return new;
end;
$$;

-- ── 3. Internal links only ──────────────────────────────────────────────────
-- A path on THIS app: starts with one '/', and contains no backslash — browsers
-- normalise '/\evil.example' to '//evil.example', i.e. another host.
-- Verified before adding: all 789 notification and 264 activity hrefs pass.
alter table notifications drop constraint if exists notifications_href_internal;
alter table notifications add constraint notifications_href_internal check (
  href is null
  or (href like '/%' and href not like '//%' and position(chr(92) in href) = 0)
);

alter table activity drop constraint if exists activity_href_internal;
alter table activity add constraint activity_href_internal check (
  href is null
  or (href like '/%' and href not like '//%' and position(chr(92) in href) = 0)
);
