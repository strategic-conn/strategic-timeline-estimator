-- ============================================================================
-- 0012_invite_only.sql — invite-only registration (email allowlist)
-- Closes open registration: a new signup is rejected unless an admin has
-- pre-added the email to `allowed_emails`. The invited role is applied to the
-- new profile, so admins can invite someone straight in as manager/admin.
-- Enforced in the DB (handle_new_user trigger) — the register page stays as
-- self-service but only works for invited emails. Existing users are unaffected
-- (the trigger only runs on brand-new signups).
-- ============================================================================

create table allowed_emails (
  email       text primary key,
  role        user_role not null default 'member',
  invited_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table allowed_emails enable row level security;

-- Only admins manage the invite list ("Manage team" = admin only).
create policy "admin manages invites" on allowed_emails
  for all using (current_user_role() = 'admin')
  with check (current_user_role() = 'admin');

-- Gate signups on the allowlist and apply the invited role.
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

  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    invited.role
  );
  return new;
end;
$$;
