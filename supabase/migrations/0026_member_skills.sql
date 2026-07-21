-- ============================================================================
-- 0026_member_skills.sql — per-person skill / tech-stack profile
-- Decoupled from `role` (which is permissions only): ANY member — including an
-- admin who codes — can have a skills profile. One row per (person, skill) with
-- a 1–5 confidence rating. Normalized (not JSONB) so a future assignment engine
-- can query "who knows X at confidence >= N". Capacity (`weekly_capacity`) and
-- availability (`availability_entries`) already exist and are reused, not duplicated.
-- ============================================================================

create table member_skills (
  profile_id  uuid not null references profiles(id) on delete cascade,
  skill       text not null,
  confidence  int  not null default 3 check (confidence between 1 and 5),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (profile_id, skill)
);

create index member_skills_skill_idx on member_skills (lower(skill));

alter table member_skills enable row level security;

-- Read: any signed-in user (so coordinators can see who knows what).
create policy "read skills" on member_skills
  for select using (auth.role() = 'authenticated');

-- Write: your own skills, or admin/manager editing anyone (mirrors weekly_capacity).
create policy "write skills" on member_skills
  for all
  using (profile_id = auth.uid() or current_user_role() in ('admin', 'manager'))
  with check (profile_id = auth.uid() or current_user_role() in ('admin', 'manager'));
