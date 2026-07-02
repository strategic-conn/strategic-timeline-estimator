-- 0003_comment_mentions.sql
-- Replies (and comments) can @-mention teammates. Store the mentioned profile
-- ids alongside the comment row so mentions survive a reload. Nullable-free:
-- defaults to an empty array.

alter table task_comments
  add column if not exists mentions uuid[] not null default '{}';
