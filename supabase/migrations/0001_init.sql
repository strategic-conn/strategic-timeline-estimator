-- ============================================================================
-- 0001_init.sql — Timeline Estimator schema (Supabase / Postgres)
-- Mirrors types/*.types.ts and docs/data-mapping.md. People come from auth.users
-- via profiles; demo text ids (proj-1, T-001) become UUIDs. Push with:
--   supabase db push
-- RLS policies live in 0002_rls.sql and must be applied after this.
-- ============================================================================

-- ── people ───────────────────────────────────────────────────────────────
create type user_role as enum ('admin', 'manager', 'member', 'viewer');

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  email       text not null,
  role        user_role not null default 'member',
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user signs up.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── projects → sprints → tasks ───────────────────────────────────────────
create type project_status as enum ('active', 'completed', 'archived');

create table projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  status      project_status not null default 'active',
  owner_id    uuid not null references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create type sprint_status as enum ('planning', 'active', 'completed', 'cancelled');

create table sprints (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  name        text not null,
  goal        text,
  status      sprint_status not null default 'planning',
  start_date  date not null,
  end_date    date not null,
  position    int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create type task_status   as enum ('todo', 'in_progress', 'in_review', 'done', 'blocked');
create type task_priority as enum ('low', 'medium', 'high', 'critical');

create table tasks (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  sprint_id       uuid references sprints(id) on delete set null,  -- null = backlog
  title           text not null,
  description     text,
  status          task_status   not null default 'todo',
  priority        task_priority not null default 'medium',
  reporter_id     uuid not null references profiles(id),
  due_date        date,
  estimated_hours numeric,
  logged_hours    numeric,
  tags            text[] not null default '{}',
  position        int    not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index tasks_project_idx on tasks (project_id);
create index tasks_sprint_idx  on tasks (sprint_id);

create table task_assignees (
  task_id     uuid not null references tasks(id) on delete cascade,
  profile_id  uuid not null references profiles(id) on delete cascade,
  primary key (task_id, profile_id)
);

create table task_comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks(id) on delete cascade,
  author_id   uuid not null references profiles(id),
  body        text not null,
  parent_id   uuid references task_comments(id) on delete cascade,  -- reply thread
  created_at  timestamptz not null default now()
);

create table comment_reactions (
  comment_id  uuid not null references task_comments(id) on delete cascade,
  profile_id  uuid not null references profiles(id) on delete cascade,
  emoji       text not null,
  primary key (comment_id, profile_id, emoji)
);

-- ── scheduling / capacity ────────────────────────────────────────────────
create type availability_kind as enum ('pto', 'unavailable', 'partial');

create table availability_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  kind        availability_kind not null,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table weekly_capacity (
  profile_id     uuid primary key references profiles(id) on delete cascade,
  hours_per_week numeric not null check (hours_per_week between 1 and 168)
);

-- ── notifications / activity feed ────────────────────────────────────────
create table notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles(id) on delete cascade,
  text         text not null,
  href         text,
  project_id   uuid references projects(id) on delete cascade,
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);

create index notifications_recipient_idx on notifications (recipient_id, read);

-- ── proposal estimator (JSONB document for v1) ───────────────────────────
-- line_items + addons + requirements_unclear match types/proposal.types.ts.
create table proposals (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references profiles(id),
  project_id           uuid references projects(id) on delete set null,
  title                text not null,
  client_name          text,
  notes                text,
  platform             text not null,
  line_items           jsonb not null default '[]',
  addons               jsonb not null default '{}',
  requirements_unclear boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
