-- 0052 — two-factor sign-in (authenticator app / TOTP, Supabase Auth MFA).
--
-- Once a person has a VERIFIED factor, a session that only proved the password
-- (aal1) must not read or write anything. The app's proxy sends such a session
-- to /mfa, but the anon key is public, so that alone would be a UX gate: a
-- stolen password could call PostgREST directly with the aal1 token. This makes
-- the database the gate, as everywhere else in this app.
--
-- People with NO factor are unaffected (aal1 is all they can have), so turning
-- this on changes nothing until someone enrols. Requiring 2FA for everyone is
-- an app setting (MFA_REQUIRED, proxy -> /mfa enrolment), not this migration.

create or replace function public.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      );
$$;

revoke all on function public.mfa_satisfied() from public;
grant execute on function public.mfa_satisfied() to authenticated;

-- A RESTRICTIVE policy is ANDed with every permissive one, so one policy per
-- table covers every existing rule without touching it. `(select …)` makes
-- Postgres evaluate it once per statement, not per row.
--
-- ⚠️ A table created after this migration needs the same policy — rerun this
-- block (it is idempotent) in the migration that creates it.
do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('drop policy if exists mfa_aal2 on public.%I', t.relname);
    execute format(
      'create policy mfa_aal2 on public.%I as restrictive for all to authenticated '
      'using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()))',
      t.relname
    );
  end loop;
end $$;
