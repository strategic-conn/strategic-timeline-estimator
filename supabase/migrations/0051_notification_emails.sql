-- 0051 — email for important notifications (task assignments, mentions,
-- time off, won deals).
--
-- The bell row is still the notification; an email is a copy of it, sent by
-- POST /api/notifications/email with the service key. `emailed_at` is the
-- claim that makes it once-only: the route sets it with a compare-and-set
-- (`emailed_at is null`) before sending, so a double call sends one email.

alter table notifications add column if not exists emailed_at timestamptz;

-- A client can't pre-stamp a row (that would only suppress an email, but the
-- column belongs to the server either way).
create or replace function stamp_feed_row()
returns trigger language plpgsql set search_path = public as $$
begin
  new.created_at := now();
  if tg_table_name = 'notifications' then
    new.read := false;
    new.emailed_at := null;
  end if;
  return new;
end;
$$;

-- Per-person opt-out, edited by the person themselves (Settings -> Profile).
-- Not in prevent_role_self_change on purpose: it is their own inbox.
alter table profiles
  add column if not exists email_notifications boolean not null default true;
