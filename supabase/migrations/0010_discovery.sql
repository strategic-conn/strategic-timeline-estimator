-- ============================================================================
-- 0010_discovery.sql — Discovery Estimator projects
-- Coordinator scoping tool (sibling to proposals). Stored as a JSONB document
-- (`data` = the 64 DiscoveryProject fields, `tracker` = per-phase checklist /
-- status / hours / notes) — same pattern as proposals' line_items/addons.
-- Gated to admin + manager, matching the UI (`canExportProposals`) and proposals.
-- ============================================================================

create table discovery_projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references profiles(id),
  data        jsonb not null default '{}',
  tracker     jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index discovery_projects_owner_idx on discovery_projects (owner_id);

alter table discovery_projects enable row level security;

-- Same gate as proposals ("Export proposals" / estimator = admin + manager).
create policy "discovery admin/manager" on discovery_projects
  for all using (current_user_role() in ('admin', 'manager'))
  with check (current_user_role() in ('admin', 'manager'));
