"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  gateableNavItems,
  isDashboardNavActive,
} from "@/components/layouts/dashboard-nav-config";
import { useAccessibleHrefs } from "@/hooks/useNavAccess";
import { useUserResolved } from "@/store/auth-store";

/**
 * Redirects a user away from a section their per-user page access doesn't
 * include. This is a UI/navigation guard — data is still protected by
 * role-based RLS regardless. Renders nothing.
 */
export function PageAccessGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const accessible = useAccessibleHrefs();
  // Until the profile loads the role is a placeholder: don't act on it.
  const resolved = useUserResolved();

  React.useEffect(() => {
    if (!resolved) return;
    // Match the current path to a gate-able destination (e.g. /projects/123 → /projects).
    const item = gateableNavItems().find((i) =>
      isDashboardNavActive(pathname, i.href),
    );
    if (item && !accessible.has(item.href)) {
      router.replace("/dashboard");
    }
  }, [pathname, accessible, router, resolved]);

  return null;
}
