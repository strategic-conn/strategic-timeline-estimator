-- ============================================================================
-- 0037_realtime_scheduling.sql — the tables the TIMELINE now depends on
--
-- `0008` published the board (projects / sprints / tasks / assignees), which is
-- what the Gantt draws, so `/gantt` has been live all along. What changed is
-- everything built since:
--
--   availability_entries  →  approved PTO shifts the tentative timeline
--                            (`buildTeamCalendar`), weekly capacity on BOTH
--                            workload views, and the calendar's own grid.
--   weekly_capacity       →  a manager editing someone's hours moves every
--                            utilisation bar in the workspace.
--   profiles              →  the roster is the DENOMINATOR of the availability
--                            factor, so somebody joining or being deactivated
--                            changes everyone else's share of each absence.
--
-- All three were hydrate-once: correct on load, then silently stale. Two
-- managers on the same screen would disagree until one of them reloaded, which
-- is exactly the class of gap the rest of this app works hard to avoid.
--
-- ⚠️ No new exposure. Realtime respects RLS, and all three are already
-- readable by the people who will now be notified:
--   · profiles / weekly_capacity — `select using (auth.role() = 'authenticated')`
--   · availability_entries       — narrowed by 0034 to self-or-approver, so a
--                                  Member still only ever receives their own rows
--
-- ⚠️ DELETE events are the exception to that, and always have been: Postgres
-- sends only the primary key, so there is nothing for RLS to filter on. A
-- client can therefore learn that *some* row id disappeared. That is why the
-- store handlers below delete by id and simply no-op when the id is not one
-- they were holding — never treat a DELETE payload as proof of readability.
--
-- Idempotent, same shape as 0008.
-- ============================================================================

do $$
declare
  t text;
  tables text[] := array[
    'availability_entries',
    'weekly_capacity',
    'profiles'
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
