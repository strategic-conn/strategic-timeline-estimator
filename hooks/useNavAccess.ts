"use client";

import { useMemo } from "react";

import { resolveAccessibleHrefs } from "@/components/layouts/dashboard-nav-config";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuthStore } from "@/store/auth-store";

/**
 * The set of nav hrefs the current user may open. Combines their role (data
 * tier) with their per-user `page_access` allowlist. Admins get everything.
 */
export function useAccessibleHrefs(): Set<string> {
  const role = useAuthStore((s) => s.user.role);
  const pageAccess = useAuthStore((s) => s.user.page_access);
  const { canExportProposals } = usePermissions();
  return useMemo(
    () => resolveAccessibleHrefs({ role, canExportProposals, pageAccess }),
    [role, canExportProposals, pageAccess],
  );
}
