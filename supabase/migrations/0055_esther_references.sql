-- 0055_esther_references.sql — past estimates uploaded for Esther to learn from.
--
-- The team's old estimates (Word, Excel, CSV, PDF) from before this app. Each
-- upload is read ONCE by Claude (/api/esther/references) into plain lines —
-- task, hours, role — with client names, emails, web addresses and phone
-- numbers removed. The original file is not kept. "Let Esther estimate" then
-- shows the most similar ones to Claude with each draft, next to the approved
-- estimates already in the app (lib/esther/estimate/references.ts).
--
-- Admins add and delete (Settings → Workspace). Managers read too: Esther
-- drafts with the signed-in person's own session, and managers estimate.

create table if not exists esther_references (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 200),
  file_name    text not null default '' check (char_length(file_name) <= 300),
  platform     text,            -- one of the Esther platforms, or null = not stated
  summary      text not null default '' check (char_length(summary) <= 2000),
  lines        jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  total_hours  numeric not null default 0,
  created_by   uuid references profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);

create index if not exists esther_references_created_by_idx on esther_references (created_by);

alter table esther_references enable row level security;

drop policy if exists "esther references read" on esther_references;
create policy "esther references read" on esther_references
  for select using (current_user_role() in ('admin', 'manager'));

drop policy if exists "esther references admin insert" on esther_references;
create policy "esther references admin insert" on esther_references
  for insert with check (current_user_role() = 'admin');

drop policy if exists "esther references admin delete" on esther_references;
create policy "esther references admin delete" on esther_references
  for delete using (current_user_role() = 'admin');

-- Two-factor gate (0052): every RLS table carries it.
drop policy if exists mfa_aal2 on esther_references;
create policy mfa_aal2 on esther_references as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

-- Who uploaded it can't be forged.
create or replace function stamp_esther_reference()
returns trigger language plpgsql set search_path = public as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists esther_references_stamp on esther_references;
create trigger esther_references_stamp
  before insert on esther_references
  for each row execute function stamp_esther_reference();
