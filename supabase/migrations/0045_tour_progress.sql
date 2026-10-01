-- 0045_tour_progress.sql — onboarding tours: which tours a person has seen.
--
-- One row per (person, tour). `version` is the tour's content version when it
-- was seen, so bumping a tour in lib/tours/tours.ts re-offers it.
--
-- Deliberately NOT a column on `profiles`: profiles is published to realtime
-- (0037), so every "I finished a tour" would broadcast to every open client and
-- run through team-store's echo handling. Nobody else needs to know.
-- Not published to realtime either, for the same reason.
--
-- The getting-started checklist stores only its dismissal here
-- (tour_id = 'checklist'); its items are derived from real data, never stored.

create table if not exists public.tour_progress (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  tour_id    text not null check (tour_id ~ '^[a-z0-9-]{1,64}$'),
  version    integer not null default 1 check (version between 1 and 1000),
  status     text not null check (status in ('completed', 'dismissed')),
  updated_at timestamptz not null default now(),
  primary key (profile_id, tour_id)
);

alter table public.tour_progress enable row level security;

-- Self only, for every operation. A member must not read or write anyone
-- else's progress (scripts/security-probe.mjs P17).
drop policy if exists "own tour progress" on public.tour_progress;
create policy "own tour progress" on public.tour_progress
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Stamp the time server-side so the client never sends it.
create or replace function public.touch_tour_progress()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_tour_progress on public.tour_progress;
create trigger touch_tour_progress
  before insert or update on public.tour_progress
  for each row execute function public.touch_tour_progress();
