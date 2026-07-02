-- ============================================================================
-- 0008_realtime_board.sql — add board tables to the realtime publication
-- Lets projects / sprints / tasks (+ assignees) and comments (+ reactions)
-- stream live to every authenticated client. Realtime still respects RLS, so
-- subscribers only receive rows they're allowed to read. Idempotent.
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
    'comment_reactions'
  ];
begin
  foreach t in array tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
