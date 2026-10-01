-- ============================================================================
-- 0044 — new estimates and projects start with a 10% schedule risk buffer
--
-- Matches DEFAULT_RISK_BUFFER_PCT (lib/constants/proposal-estimator.ts), so a
-- row inserted by any path — the app, a script, the SQL editor — starts at the
-- same buffer the app gives it. Only the column DEFAULT changes: existing rows
-- keep their buffer, because changing it would move dates people agreed to.
-- The buffer moves dates only, never hours or price (see 0036).
-- ============================================================================

alter table proposals alter column risk_buffer_pct set default 10;
alter table projects  alter column risk_buffer_pct set default 10;
