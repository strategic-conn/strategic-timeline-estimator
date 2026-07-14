-- ============================================================================
-- 0015_proposal_status.sql — proposal approval lifecycle (Workflow revamp Phase A)
-- Adds a status so a proposal can move draft → sent → approved/rejected. When
-- approved, a coordinator converts it into a project (sets proposals.project_id).
-- Additive: existing rows default to 'draft', so nothing changes for them.
-- RLS unchanged (proposals stay admin/manager `for all`); convert reuses the
-- existing `create projects` policy.
-- ============================================================================

alter table proposals
  add column if not exists status text not null default 'draft'
    check (status in ('draft', 'sent', 'approved', 'rejected'));
