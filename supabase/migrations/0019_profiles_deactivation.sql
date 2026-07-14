-- ============================================================================
-- 0019_profiles_deactivation.sql — user offboarding (deactivate/reactivate)
-- Deactivation = ban the auth user (real access revocation, done via the admin
-- API) + this flag so the app treats them as inactive (hidden from pickers,
-- shown in a "Deactivated" section). Reversible. All their history stays
-- attributed. NULL = active.
-- ============================================================================

alter table profiles add column if not exists deactivated_at timestamptz;
