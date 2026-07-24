-- Zoho CRM OAuth connection — workspace-wide, single row.
-- The refresh/access tokens must NEVER reach the browser, so RLS is enabled
-- with NO policies: anon/authenticated are blocked entirely; only the
-- service-role key (used by the server-side /api/zoho/* routes) can touch it.

create table if not exists public.zoho_connection (
  id boolean primary key default true,
  refresh_token text not null,
  access_token text,
  api_domain text not null default 'https://www.zohoapis.com',
  accounts_server text not null default 'https://accounts.zoho.com',
  expires_at timestamptz,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zoho_connection_singleton check (id)
);

alter table public.zoho_connection enable row level security;
-- Intentionally no policies (server-only via service role).

comment on table public.zoho_connection is
  'Workspace-wide Zoho CRM OAuth tokens. Single row (id=true). Server-only via service role; RLS has no policies by design.';
