-- ============================================================================
-- 0036_risk_buffer.sql — schedule contingency on an estimate and on a project
--
-- A percentage the coordinator adds for what they cannot itemise: the client who
-- takes a week to answer, the integration that turns out to be undocumented.
--
-- ⚠️ It stretches the TIMELINE and nothing else. Hours are untouched, so the
-- price is untouched. That separation is the whole point:
--
--   `requirements_unclear`  →  prices every line as Advanced (1.5x). More
--                              hours, more money. A PRICING decision.
--   `risk_buffer_pct`       →  the same work, expected to take longer. A
--                              SCHEDULING decision.
--
-- Folding risk into hours would quietly inflate what the client is quoted, and
-- there is already a control that does that on purpose.
--
-- Bounded 0–100. A buffer above 100% is not contingency, it is a different
-- estimate, and letting someone type 900 would produce a Gantt measured in
-- years from a two-week job.
-- ============================================================================

alter table proposals
  add column if not exists risk_buffer_pct integer not null default 0
    check (risk_buffer_pct between 0 and 100);

alter table projects
  add column if not exists risk_buffer_pct integer not null default 0
    check (risk_buffer_pct between 0 and 100);

comment on column proposals.risk_buffer_pct is
  'Schedule contingency %, 0-100. Stretches the tentative timeline and the '
  'sprint dates Start project scaffolds. Never changes hours or price - that is '
  'requirements_unclear.';

comment on column projects.risk_buffer_pct is
  'Carried over from the estimate at conversion, then the project''s own. Drives '
  'the risk-adjusted finish date shown beside the planned one; applying it to '
  'the real sprint dates is an explicit, previewed action.';
