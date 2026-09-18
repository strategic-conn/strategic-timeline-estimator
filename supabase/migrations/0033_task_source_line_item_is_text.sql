-- 0033 — correct 0032: a line item id is NOT a uuid.
--
-- `proposals.line_items[].id` is generated client-side by `uid()` in
-- proposal-estimator-store.ts as `${Date.now()}-${base36}` — e.g.
-- "1789571657564-oht6m7g". 0032 typed the column `uuid` and guarded its
-- backfill with a uuid pattern, so it could neither store a real id nor match
-- one: it linked 0 of 71 existing tasks.
--
-- Every value is still NULL (nothing has written to it yet), so the type change
-- is free.
alter table tasks
  alter column source_line_item_id type text
  using source_line_item_id::text;

comment on column tasks.source_line_item_id is
  'The proposals.line_items[].id this task was seeded from — a client-generated '
  'string, not a uuid. NULL for tasks a person created by hand; those are never '
  'touched by an estimate sync.';

-- ── Backfill, take two ──────────────────────────────────────────────────────
-- Same conservative rule as 0032, minus the uuid filter that voided it: link
-- only where the title matches EXACTLY ONE line item on the linked estimate.
-- An ambiguous title stays NULL rather than being guessed — a wrong link would
-- let a later sync rewrite the wrong task.
with candidate as (
  select
    t.id                              as task_id,
    li.value ->> 'id'                 as line_item_id,
    count(*) over (partition by t.id) as matches
  from tasks t
  join proposals p
    on p.project_id = t.project_id
  cross join lateral jsonb_array_elements(p.line_items) as li(value)
  where t.source_line_item_id is null
    and li.value ->> 'title' = t.title
    and coalesce(li.value ->> 'id', '') <> ''
)
update tasks t
set source_line_item_id = c.line_item_id
from candidate c
where c.task_id = t.id
  and c.matches = 1;
