-- 0049_holiday_settings.sql — which federal holidays this company WORKS.
--
-- The eleven US federal holidays are computed in code (lib/calendar/us-holidays.ts)
-- and are days off by default. Firms differ — plenty work Columbus Day and
-- Veterans Day — so an admin can mark one as a working day. A row exists only
-- for a holiday someone has set; no row means "day off", exactly as before this
-- table existed, so an empty table changes nothing.
--
-- Everyone signed in reads it: it shapes every member's capacity, calendar and
-- timeline. Only an admin writes it. Probe P27 pins both.

create table if not exists holiday_settings (
  name        text primary key check (char_length(name) between 1 and 80),
  working     boolean not null default false,
  updated_by  uuid references profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table holiday_settings enable row level security;

drop policy if exists "read holiday settings" on holiday_settings;
create policy "read holiday settings" on holiday_settings
  for select using (auth.role() = 'authenticated');

drop policy if exists "admins write holiday settings" on holiday_settings;
create policy "admins write holiday settings" on holiday_settings
  for all
  using (current_user_role() = 'admin')
  with check (current_user_role() = 'admin');

-- "Changed by" can't be forged: stamped here, whatever the client sends.
create or replace function stamp_holiday_setting()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists holiday_settings_stamp on holiday_settings;
create trigger holiday_settings_stamp
  before insert or update on holiday_settings
  for each row execute function stamp_holiday_setting();
