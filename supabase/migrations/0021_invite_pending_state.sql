-- ============================================================================
-- 0021_invite_pending_state.sql
-- Fix: pending invitees no longer masquerade as active members.
--
-- Before: inviteUserByEmail inserts auth.users immediately, so handle_new_user
-- fired at INVITE time — it created the profile AND consumed the allowlist row,
-- making an un-accepted invite look like a full member and emptying the pending
-- list. Now the profile carries `confirmed_at` (null = invited, not yet joined),
-- and the allowlist row survives until the invitee actually confirms.
-- ============================================================================

alter table profiles add column if not exists confirmed_at timestamptz;

-- Backfill: everyone who already has a confirmed auth account counts as joined.
update public.profiles p
set confirmed_at = coalesce(u.email_confirmed_at, u.confirmed_at, now())
from auth.users u
where u.id = p.id
  and p.confirmed_at is null
  and coalesce(u.email_confirmed_at, u.confirmed_at) is not null;

-- On signup/invite (INSERT): create the profile, mirroring confirmation state.
-- Only retire the allowlist entry if the account is already confirmed (e.g. an
-- auto-confirmed/OAuth signup); a pending invite keeps its allowlist row.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  invited allowed_emails%rowtype;
begin
  select * into invited
  from public.allowed_emails
  where lower(email) = lower(new.email);

  if not found then
    raise exception 'Email % is not on the invite list', new.email
      using errcode = 'check_violation';
  end if;

  insert into public.profiles (id, name, email, role, page_access, confirmed_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    invited.role,
    invited.page_access,
    new.email_confirmed_at
  );

  if new.email_confirmed_at is not null then
    delete from public.allowed_emails where lower(email) = lower(new.email);
  end if;

  return new;
end;
$$;

-- On confirmation (UPDATE, email_confirmed_at flips null -> set): mark the
-- profile joined and retire the invite.
create or replace function handle_user_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.profiles set confirmed_at = new.email_confirmed_at where id = new.id;
    delete from public.allowed_emails where lower(email) = lower(new.email);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update on auth.users
  for each row execute function handle_user_confirmed();
