-- ============================================================================
-- 0038_realtime_replica_identity.sql — make UPDATE and DELETE actually arrive
--
-- ⚠️ Realtime has been INSERT-ONLY this whole time. Verified live against the
-- deployed app: a task created elsewhere appeared on another session's Gantt
-- within a second, while renaming that same task, or rescheduling its sprint,
-- reached nobody until they reloaded.
--
-- The cause is replica identity. With the Postgres default, an UPDATE writes
-- only the changed columns plus the primary key to the WAL. Supabase Realtime
-- has to re-check RLS before forwarding a change — it needs to know whether
-- THIS subscriber is allowed to see THIS row — and it cannot do that against a
-- partial tuple, so the event is dropped. Silently: no error anywhere, the
-- channel stays subscribed and healthy, and INSERTs (which always carry the
-- whole row) keep working. That is exactly why it went unnoticed.
--
-- `REPLICA IDENTITY FULL` puts the complete old row in the WAL, which is what
-- the RLS check needs.
--
-- Cost, honestly: every UPDATE and DELETE on these tables now writes the whole
-- previous row to the WAL rather than just its key. That is a real write
-- amplification, and it would matter on a high-churn table with wide rows. It
-- does not here — these are a few thousand narrow rows in a team tool, and the
-- alternative is a collaborative app where nobody sees anybody else's edits.
--
-- `activity` is deliberately absent: it is append-only, so its INSERTs already
-- arrive and it would pay the cost for nothing.
-- ============================================================================

do $$
declare
  t text;
  tables text[] := array[
    -- board (0008) — what the Gantt and the task boards draw
    'projects',
    'sprints',
    'tasks',
    'task_assignees',
    'task_comments',
    'comment_reactions',
    -- scheduling (0037) — what shapes the timeline
    'availability_entries',
    'weekly_capacity',
    'profiles',
    -- a notification is marked read via UPDATE, so the bell needs it too
    'notifications'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;
