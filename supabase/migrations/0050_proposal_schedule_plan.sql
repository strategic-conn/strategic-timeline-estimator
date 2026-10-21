-- 0050 — how an estimate's timeline is planned, chosen BEFORE the deal closes.
--
-- Best-fit / Fastest / Manual used to be picked inside Start project, after the
-- client had already agreed to a timeline. It now lives on the estimate
-- (Adjust tab), and the launch date that choice produced is snapshotted when the
-- estimate is approved, so Start project can say "quoted Dec 10 → now Dec 17"
-- when the team's load has moved since.
--
--   { strategy: 'efficient' | 'quick' | 'none',
--     quoted_finish: 'YYYY-MM-DD' | null,   -- set on approval, cleared on un-approval
--     quoted_at: timestamptz | null }
--
-- NULL = never chosen = Best-fit, the old dialog's default. Dates only: the
-- price is hours x each line's own snapshotted rate, whoever does the work.

alter table public.proposals
  add column if not exists schedule_plan jsonb;

alter table public.proposals
  drop constraint if exists proposals_schedule_plan_strategy;
alter table public.proposals
  add constraint proposals_schedule_plan_strategy check (
    schedule_plan is null
    or schedule_plan->>'strategy' in ('efficient', 'quick', 'none')
  );
