-- 0053_workspace_settings.sql — workspace-wide planning settings, one row.
--
-- First setting: how long a build sprint is, in weeks (1–4, default 2). The
-- estimate's people plan and Start project lay work out in sprints of this
-- length (lib/assignment/plan.ts → planSprints). An admin sets it in
-- Settings → Workspace → Sprint length; everyone signed in reads it, because
-- it shapes every timeline they see. Probe P28 pins both.
--
-- One row, enforced by the boolean primary key. Missing row = the default, so
-- the app works before this migration runs.

create table if not exists workspace_settings (
  id            boolean primary key default true check (id),
  sprint_weeks  int not null default 2 check (sprint_weeks between 1 and 4),
  updated_by    uuid references profiles(id) on delete set null,
  updated_at    timestamptz not null default now()
);

insert into workspace_settings (id) values (true) on conflict (id) do nothing;

alter table workspace_settings enable row level security;

drop policy if exists "read workspace settings" on workspace_settings;
create policy "read workspace settings" on workspace_settings
  for select using (auth.role() = 'authenticated');

drop policy if exists "admins write workspace settings" on workspace_settings;
create policy "admins write workspace settings" on workspace_settings
  for all
  using (current_user_role() = 'admin')
  with check (current_user_role() = 'admin');

-- Two-factor gate (0052): every RLS table carries it.
drop policy if exists mfa_aal2 on workspace_settings;
create policy mfa_aal2 on workspace_settings as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

-- "Changed by" can't be forged: stamped here, whatever the client sends.
create or replace function stamp_workspace_settings()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists workspace_settings_stamp on workspace_settings;
create trigger workspace_settings_stamp
  before insert or update on workspace_settings
  for each row execute function stamp_workspace_settings();
