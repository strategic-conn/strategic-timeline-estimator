-- ============================================================================
-- 0022_proposal_discovery.sql
-- Merge Discovery into the Estimator: a proposal can now CARRY its scoping.
-- `discovery` holds the guided-questionnaire answers (the 64-field
-- DiscoveryProject). Risk / timeline / Min-Mid-Max are derived from it on the
-- fly (lib/discovery engine) — not stored. Null = a catalog/manual quote with
-- no guided scope. Additive and backward-compatible.
-- ============================================================================

alter table proposals add column if not exists discovery jsonb;
