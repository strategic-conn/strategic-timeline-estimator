-- ============================================================================
-- 0035 — fix 0034's approval guard: it never fired.
--
--   declare approver boolean := current_user_role() in ('admin', 'manager');
--
-- `current_user_role()` is `select role from profiles where id = auth.uid()`,
-- so it returns NULL whenever there is no matching profile row — the
-- service-role key being the obvious case, since `auth.uid()` is NULL there.
-- And `NULL in ('admin','manager')` is NULL, not false. `if not approver`
-- is then `not NULL` = NULL, which is not true, so the branch was skipped and
-- BOTH guards silently passed.
--
-- Verified live against the deployed 0034: a service-role insert claiming
-- `status = 'approved'` was stored as approved (it should have been forced to
-- pending), and a follow-up PATCH to 'approved' returned 200 instead of raising.
--
-- `coalesce(..., false)` makes the unknown case a non-approver, so this now
-- fails CLOSED: an unrecognised caller can request time off but cannot grant
-- it. That deliberately includes the service-role key — no server route touches
-- availability today, and a future one that genuinely needs to decide should
-- say so explicitly rather than inherit approval rights by accident.
-- ============================================================================

create or replace function prevent_self_approval()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  -- coalesce, NOT a bare `in`: see the header. NULL here meant "no guard".
  approver boolean := coalesce(current_user_role() in ('admin', 'manager'), false);
begin
  if tg_op = 'INSERT' then
    -- A non-approver's request always starts pending, whatever was submitted.
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
