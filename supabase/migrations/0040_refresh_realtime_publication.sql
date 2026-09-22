-- ============================================================================
-- 0040 — force Realtime to re-read the publication.
--
-- Diagnosed by elimination, live:
--   · a BROADCAST round-trip succeeds        → the Realtime service is healthy,
--                                              the websocket is fine, and there
--                                              is no quota problem
--   · postgres_changes reports SUBSCRIBED    → the handshake completes
--   · no INSERT/UPDATE/DELETE is delivered   → the DB -> Realtime path is stuck
--
-- INSERTs *were* arriving earlier in the same session, and the only thing that
-- happened in between was DDL churn on the publication and replica identity
-- (0037/0038/0039). Realtime caches which tables it is watching, so a table
-- list that changed underneath it can leave it subscribed to a stale set.
--
-- Dropping each table and re-adding it is exactly what the dashboard's
-- Database -> Replication toggle does, and it is the documented way to make
-- Realtime pick the list up again — without the downtime a project restart
-- costs.
--
-- Safe to re-run, and safe to fail: the worst case is that a table is briefly
-- absent from the publication, which is where it effectively already is.
-- ============================================================================

do $$
declare
  t text;
  tables text[] := array[
    'projects',
    'sprints',
    'tasks',
    'task_assignees',
    'task_comments',
    'comment_reactions',
    'availability_entries',
    'weekly_capacity',
    'profiles',
    'notifications',
    'activity'
  ];
begin
  foreach t in array tables loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end $$;
