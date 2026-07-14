-- ============================================================================
-- 0023_migrate_discovery_to_proposals.sql
-- Discovery merged into the Estimator (see 0022). Carry every existing
-- discovery_projects row into a proposal that holds its scope, then drop the
-- now-unused table.
--
-- Each migrated estimate starts with EMPTY line items — open it, go to the
-- "Scope & risk" tab, and click "Generate line items" to (re)build them from the
-- answers. Add-ons are disabled to match the Discovery→Proposal bridge (Discovery
-- itemises design/QA/PM into phases, so they'd otherwise double-count).
-- ============================================================================

insert into proposals (
  id, owner_id, title, client_name, project_id, notes,
  platform, status, line_items, addons, requirements_unclear,
  discovery, created_at, updated_at
)
select
  gen_random_uuid(),
  d.owner_id,
  coalesce(nullif(d.data->>'name', ''), 'Discovery estimate'),
  nullif(d.data->>'client_name', ''),
  null,
  'Migrated from Discovery — open Scope & risk and click “Generate line items”.',
  case d.data->>'platform'
    when 'wordpress' then 'wordpress'
    when 'shopify'   then 'shopify'
    else 'custom'
  end,
  'draft',
  '[]'::jsonb,
  '{"pm_enabled":false,"pm_basis":"simple","pm_pct":10,"responsive_enabled":false,"responsive_pct":25,"design_enabled":false,"design_pct":35,"qa_enabled":false,"qa_pct":20}'::jsonb,
  false,
  -- `data` holds the 64 answers; re-attach the id/timestamps the type expects.
  d.data || jsonb_build_object(
    'id', d.id,
    'created_at', d.created_at,
    'updated_at', d.updated_at
  ),
  d.created_at,
  d.updated_at
from discovery_projects d;

-- Table (with its index + RLS policy, and any realtime membership) is retired.
drop table discovery_projects;
