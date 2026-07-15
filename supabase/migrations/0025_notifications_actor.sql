-- ============================================================================
-- 0025_notifications_actor.sql
-- Give notifications an actor (who triggered it) so the bell can show that
-- person's avatar + name, matching the activity feed. Nullable: existing rows
-- and system notices have no actor and fall back to the category icon. Set-null
-- on delete keeps the offboarding "Former member" behaviour consistent.
-- ============================================================================

alter table notifications
  add column if not exists actor_id uuid references profiles(id) on delete set null;
