-- 0005_notifications_write.sql
-- The notifications table only had SELECT + UPDATE policies, so client-side
-- inserts (and clear/delete) were blocked by RLS — notifications appeared
-- optimistically then vanished. Allow each user to create and remove their OWN
-- notifications (recipient_id = auth.uid()).
--
-- NOTE: this is self-targeted only. Cross-user notifications ("X mentioned you")
-- would need a broader insert policy (e.g. any authenticated user) — revisit if
-- that feature lands.

drop policy if exists "insert own notifications" on notifications;
create policy "insert own notifications" on notifications
  for insert with check (recipient_id = auth.uid());

drop policy if exists "delete own notifications" on notifications;
create policy "delete own notifications" on notifications
  for delete using (recipient_id = auth.uid());
