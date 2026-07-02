-- ============================================================================
-- 0014_invite_page_access.sql
--  1) Let an invite carry a custom page_access set, applied to the new profile.
--  2) Auto-remove an invite from the allowlist once it's accepted (registered),
--     so the "Invited members" list only shows pending invites.
-- ============================================================================

alter table allowed_emails add column if not exists page_access text[];

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

  insert into public.profiles (id, name, email, role, page_access)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    invited.role,
    invited.page_access
  );

  -- Invite accepted → drop it from the allowlist (it's now a real member).
  delete from public.allowed_emails where lower(email) = lower(new.email);

  return new;
end;
$$;
