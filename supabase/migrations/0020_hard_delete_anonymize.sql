-- ============================================================================
-- 0020_hard_delete_anonymize.sql — allow hard-deleting a user (rare, erasure)
-- The 5 columns that referenced profiles with NO ACTION blocked deletion. Switch
-- them to `on delete set null` so deleting a profile ANONYMIZES their authored/
-- owned rows to NULL (shown as "Former member") instead of blocking — true
-- erasure, no tombstone account needed. Cascade tables (assignments, reactions,
-- time_entries, notifications, activity, availability, capacity) already drop.
-- ============================================================================

alter table projects alter column owner_id drop not null;
alter table projects drop constraint projects_owner_id_fkey;
alter table projects add constraint projects_owner_id_fkey
  foreign key (owner_id) references profiles(id) on delete set null;

alter table tasks alter column reporter_id drop not null;
alter table tasks drop constraint tasks_reporter_id_fkey;
alter table tasks add constraint tasks_reporter_id_fkey
  foreign key (reporter_id) references profiles(id) on delete set null;

alter table task_comments alter column author_id drop not null;
alter table task_comments drop constraint task_comments_author_id_fkey;
alter table task_comments add constraint task_comments_author_id_fkey
  foreign key (author_id) references profiles(id) on delete set null;

alter table proposals alter column owner_id drop not null;
alter table proposals drop constraint proposals_owner_id_fkey;
alter table proposals add constraint proposals_owner_id_fkey
  foreign key (owner_id) references profiles(id) on delete set null;

alter table discovery_projects alter column owner_id drop not null;
alter table discovery_projects drop constraint discovery_projects_owner_id_fkey;
alter table discovery_projects add constraint discovery_projects_owner_id_fkey
  foreign key (owner_id) references profiles(id) on delete set null;
