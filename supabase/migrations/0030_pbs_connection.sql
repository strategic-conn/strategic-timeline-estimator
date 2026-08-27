-- PBS (billing) API token cache — workspace-wide, single row.
--
-- Access tokens must NEVER reach the browser, so RLS is enabled with NO
-- policies: anon/authenticated are blocked entirely; only the service-role key
-- (used by the server-side /api/pbs/* routes) can touch it. Same treatment as
-- `zoho_connection` (0028).
--
-- Unlike Zoho this really is only a CACHE, not a source of truth. PBS mints
-- access tokens unconditionally from the app credentials, and minting does not
-- revoke existing tokens (verified against the live API on 2026-08-26), so we
-- never call /refresh and never store a refresh token. Losing this row costs
-- one extra round trip, not a broken connection — which is also why two
-- instances minting at the same time is harmless.

create table if not exists public.pbs_connection (
  id boolean primary key default true,
  access_token text not null,
  expires_at timestamptz not null,
  -- Which app the token belongs to, so a credential change invalidates the
  -- cache instead of silently reusing a token for the wrong application.
  app_id text not null,
  updated_at timestamptz not null default now(),
  constraint pbs_connection_singleton check (id)
);

alter table public.pbs_connection enable row level security;
-- Intentionally no policies (server-only via service role).

comment on table public.pbs_connection is
  'PBS API access-token cache. Single row (id=true). Server-only via service role; RLS has no policies by design. No refresh token: tokens are re-minted from app credentials.';
