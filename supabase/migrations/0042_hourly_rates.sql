-- ============================================================================
-- 0042 — hourly rates by Responsible + Level (pricing plan, Phase 1)
--
-- Replaces the single HOURLY_RATE constant as the SOURCE of rates. Nothing
-- prices from this table yet: the Estimator switches over in Phase 3, when each
-- line item snapshots the rate it was priced at (docs/pricing-levels-plan.md).
--
-- Seeded from project-csv/Project_Pricing_Workbook_v3.xlsx → Rates. Project
-- Coordinator is $0 on purpose (non-billable) and is configurable like the rest.
--
-- Rules:
--  · admin + manager READ (managers build quotes); only admin WRITES.
--  · Members and viewers see nothing — rates are commercial data.
--  · updated_by / updated_at are stamped by trigger, never taken from the
--    client, so "last changed by" cannot be forged.
--  · "Level 2 must not be below Level 1" is enforced by the settings screen on
--    save, not here: a row trigger would reject the half-way state of raising
--    both levels of a role one row at a time.
-- ============================================================================

create table if not exists hourly_rates (
  responsible text not null check (length(btrim(responsible)) > 0),
  level       smallint not null check (level in (1, 2)),
  rate        numeric(10, 2) not null check (rate >= 0 and rate <= 10000),
  updated_by  uuid references profiles(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (responsible, level)
);

alter table hourly_rates enable row level security;

drop policy if exists "read hourly rates" on hourly_rates;
create policy "read hourly rates" on hourly_rates
  for select using (
    coalesce(current_user_role() = any (array['admin', 'manager']::user_role[]), false)
  );

drop policy if exists "admin writes hourly rates" on hourly_rates;
create policy "admin writes hourly rates" on hourly_rates
  for all
  using (coalesce(current_user_role() = 'admin'::user_role, false))
  with check (coalesce(current_user_role() = 'admin'::user_role, false));

create or replace function stamp_hourly_rate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  -- NULL for the seed below and for service-role writes; the writer otherwise.
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists hourly_rates_stamp on hourly_rates;
create trigger hourly_rates_stamp
  before insert or update on hourly_rates
  for each row execute function stamp_hourly_rate();

insert into hourly_rates (responsible, level, rate) values
  ('IT',                  1, 100),
  ('IT',                  2, 120),
  ('Creative',            1, 100),
  ('Creative',            2, 130),
  ('Project Manager',     1,  80),
  ('Project Manager',     2, 100),
  ('QA Tester',           1,  80),
  ('QA Tester',           2, 120),
  ('Project Coordinator', 1,   0),
  ('Project Coordinator', 2,   0)
on conflict (responsible, level) do nothing;

-- Live, so a rate an admin changes reaches a manager's open estimator before
-- Phase 3 snapshots it onto new lines. PK is (responsible, level), exactly what
-- the DELETE applier reads from payload.old (REPLICA IDENTITY DEFAULT).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'hourly_rates'
  ) then
    alter publication supabase_realtime add table public.hourly_rates;
  end if;
end $$;
