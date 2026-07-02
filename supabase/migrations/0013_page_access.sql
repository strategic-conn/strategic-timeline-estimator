-- ============================================================================
-- 0013_page_access.sql — per-user page/section access (Shopify-style)
-- `page_access` is a per-user allowlist of nav hrefs the person can open.
-- NULL = use their role's default set. It's a UI/navigation layer on top of the
-- role — the ROLE (via RLS) is still the data-security wall. Admins are never
-- page-restricted. Only admins may set it (extended guard trigger below).
-- ============================================================================

alter table profiles add column if not exists page_access text[];

-- Extend the existing guard (from 0009): non-admins can change neither their own
-- role NOR their own page_access (both are admin-managed access controls).
create or replace function prevent_role_self_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_user_role() <> 'admin' then
    if new.role is distinct from old.role then
      raise exception 'Only admins can change a profile role';
    end if;
    if new.page_access is distinct from old.page_access then
      raise exception 'Only admins can change page access';
    end if;
  end if;
  return new;
end;
$$;
