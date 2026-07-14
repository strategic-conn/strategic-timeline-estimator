-- ============================================================================
-- 0024_page_access_discovery_to_proposals.sql
-- Discovery merged into the Estimator (/proposals). Heal saved per-user page
-- access so anyone previously granted "/discovery" keeps reach to the merged
-- tool: rewrite "/discovery" -> "/proposals" and de-dupe. Without this, a
-- Discovery-only grant would silently lose Estimator access.
-- Data-only (no schema change) — safe to run once.
-- ============================================================================

update profiles
set page_access = (
  select array_agg(distinct case when h = '/discovery' then '/proposals' else h end)
  from unnest(page_access) as h
)
where page_access is not null and '/discovery' = any(page_access);

-- Pending invites carry the same allowlist shape.
update allowed_emails
set page_access = (
  select array_agg(distinct case when h = '/discovery' then '/proposals' else h end)
  from unnest(page_access) as h
)
where page_access is not null and '/discovery' = any(page_access);
