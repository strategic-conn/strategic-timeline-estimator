-- 0004_realtime_notifications.sql
-- Enable Postgres change streaming for the notifications table so the bell +
-- activity feed update live (Phase 4). RLS still applies to realtime, so each
-- client only receives its own rows ("own notifications" policy). Idempotent.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table notifications;
  end if;
end $$;
