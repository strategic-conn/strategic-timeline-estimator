-- 0032 — link a seeded task back to the estimate line item it came from.
--
-- Two-way sync between an estimate and its project needs a STABLE identity for
-- the pair. Until now the only link was the task's TITLE, matched as a string
-- (`pendingScheduleWork`), which made every interesting edit break:
--
--   rename a line item  → a second task appeared, the old one stayed
--   delete a line item  → its task lived on forever
--   change its hours    → nothing happened; the title was unchanged, so the
--                         line item did not look "new"
--
-- and nothing at all could travel back from the project to the estimate,
-- because given a task there was no way to say which line item it was.
--
-- A plain uuid column, not a foreign key: line items live inside the
-- `proposals.line_items` JSONB document, so there is no table to reference.
-- Their ids are generated client-side and are stable for the life of the row.
alter table tasks
  add column if not exists source_line_item_id uuid;

comment on column tasks.source_line_item_id is
  'The proposals.line_items[].id this task was seeded from. NULL for tasks a '
  'person created by hand — those are never touched by an estimate sync.';

-- Sync walks a project's tasks looking for the ones that came from the
-- estimate; without this it is a full scan of every task in the workspace.
create index if not exists tasks_source_line_item_idx
  on tasks (source_line_item_id)
  where source_line_item_id is not null;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Projects created before this migration have seeded tasks with no link. The
-- only evidence of the pairing is the title, which is exactly the fragile match
-- being replaced — but for rows that have not diverged yet it is still correct,
-- and it is strictly better than leaving them unlinked (an unlinked task reads
-- as hand-made and is left alone by the sync forever).
--
-- Deliberately conservative: only when the title matches EXACTLY ONE line item
-- on the linked estimate, and only for tasks that have exactly one candidate.
-- An ambiguous match is left null rather than guessed — a wrong link would let
-- a sync rewrite the wrong task.
with candidate as (
  select
    t.id                                as task_id,
    (li.value ->> 'id')::uuid           as line_item_id,
    count(*) over (partition by t.id)   as matches
  from tasks t
  join proposals p
    on p.project_id = t.project_id
  cross join lateral jsonb_array_elements(p.line_items) as li(value)
  where t.source_line_item_id is null
    and li.value ->> 'title' = t.title
    -- Client-generated ids are not all uuids in older rows; skip those.
    and li.value ->> 'id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
)
update tasks t
set source_line_item_id = c.line_item_id
from candidate c
where c.task_id = t.id
  and c.matches = 1;
