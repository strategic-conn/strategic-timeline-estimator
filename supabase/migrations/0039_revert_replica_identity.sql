-- ============================================================================
-- 0039 — revert 0038. `REPLICA IDENTITY FULL` made realtime WORSE, not better.
--
-- 0038's reasoning was sound and its result was not. Measured live against the
-- deployed app, three runs:
--
--   before 0038   INSERT arrives   ·  UPDATE does not
--   after  0038   INSERT does NOT arrive either
--
-- So the change did not restore UPDATE delivery; it stopped the events that
-- were working. Whatever is dropping UPDATEs is not the partial old tuple, and
-- FULL replica identity only added write amplification on ten tables for no
-- gain at all.
--
-- Back to the Postgres default. The real cause of the missing UPDATEs is still
-- open and is tracked in CLAUDE.md — it is NOT fixed by this migration, and
-- pretending otherwise would be worse than the bug.
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
    'notifications'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I replica identity default', t);
  end loop;
end $$;
