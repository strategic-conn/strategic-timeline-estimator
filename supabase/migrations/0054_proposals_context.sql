-- 0054_proposals_context.sql — an estimate's project context, set on Setup.
--
-- Primary business goal, "is this a redesign?" (+ current URL) and "regulated
-- industry?" (+ industry type) were questionnaire section 1, so an estimate
-- built straight from line items never asked them. They are now on the Setup
-- tab for EVERY estimate and stored here as one jsonb document:
--   { primary_goal, primary_goal_other, is_redesign, current_url,
--     regulated_industry, regulated_type, regulated_type_other }
--
-- Nullable, no default, no backfill: a NULL (or a missing key) reads the
-- questionnaire's old answer (`contextOf` in lib/discovery/context-inputs.ts),
-- so every existing estimate keeps exactly what it had.
--
-- No new policy: proposals' RLS (admin + manager) and its mfa_aal2 gate are
-- table-level and already cover a new column.

alter table proposals add column if not exists context jsonb;

comment on column proposals.context is
  'Project context set on the Setup tab (goal, redesign, regulated industry). NULL = the questionnaire''s answers.';
