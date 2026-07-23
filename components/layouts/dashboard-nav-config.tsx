import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  CalendarDays,
  Compass,
  FolderKanban,
  LayoutDashboard,
  Milestone,
  Scale,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";

import type { UserRole } from "@/store/auth-store";

export type DashboardNavGroup = "workspace" | "plan" | "commercial" | "system";

export type DashboardNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  group: DashboardNavGroup;
  /** When true, link is omitted unless the user can export proposals. */
  requireCanExportProposals?: boolean;
  /** When true, item renders as a disabled "Coming soon" pill — not navigable. */
  comingSoon?: boolean;
};

export const DASHBOARD_NAV_GROUP_LABELS: Record<DashboardNavGroup, string> = {
  workspace: "Workspace",
  plan: "Plan & people",
  commercial: "Commercial",
  system: "System",
};

/** Primary sidebar / drawer order, ordered by group then within group. */
export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  // Workspace
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "workspace" },
  { href: "/projects", label: "Projects", icon: FolderKanban, group: "workspace" },
  { href: "/activity", label: "Activity", icon: Activity, group: "workspace" },
  { href: "/reports", label: "Reports", icon: BarChart3, group: "workspace" },
  // Plan & people
  { href: "/calendar", label: "Calendar", icon: CalendarDays, group: "plan" },
  { href: "/gantt", label: "Timeline", icon: Milestone, group: "plan" },
  { href: "/workload", label: "Workload", icon: Scale, group: "plan" },
  { href: "/team", label: "Team", icon: Users, group: "plan" },
  // Commercial
  {
    href: "/proposals",
    label: "Estimator",
    icon: Compass,
    group: "commercial",
    requireCanExportProposals: true,
  },
  {
    href: "/esther",
    label: "Esther",
    icon: Sparkles,
    group: "commercial",
    requireCanExportProposals: true,
    comingSoon: true,
  },
  // System
  { href: "/settings", label: "Settings", icon: Settings, group: "system" },
];

export const DASHBOARD_NAV_GROUP_ORDER: DashboardNavGroup[] = [
  "workspace",
  "plan",
  "commercial",
  "system",
];

export function filterDashboardNavItems(
  items: DashboardNavItem[],
  canExportProposals: boolean
): DashboardNavItem[] {
  return items.filter(
    (item) => !item.requireCanExportProposals || canExportProposals
  );
}

// ── Per-user page access (Shopify-style) ────────────────────────────────────
// `page_access` is an allowlist of hrefs. These pages are always reachable so a
// user can never be locked out of the landing page or their own profile.
export const ALWAYS_ON_HREFS = ["/dashboard", "/settings"] as const;

/** Real, gate-able destinations (excludes "coming soon" pills). */
export function gateableNavItems(): DashboardNavItem[] {
  return DASHBOARD_NAV_ITEMS.filter((i) => !i.comingSoon);
}

/**
 * Full set of hrefs a ROLE can reach by default (before any per-user override).
 * Mirrors the old role gating: commercial pages require canExportProposals.
 */
export function roleReachableHrefs(
  role: UserRole,
  canExportProposals: boolean,
): string[] {
  void role; // reachability is driven by the derived permission, not role name
  return gateableNavItems()
    .filter((i) => !i.requireCanExportProposals || canExportProposals)
    .map((i) => i.href);
}

/**
 * Effective set of hrefs the user may open. Admins get everything reachable;
 * others get their `page_access` allowlist (clamped to what their role can
 * reach) or the role default when unset. Always-on hrefs are forced in.
 */
export function resolveAccessibleHrefs(opts: {
  role: UserRole;
  canExportProposals: boolean;
  pageAccess: string[] | null | undefined;
}): Set<string> {
  const reachable = roleReachableHrefs(opts.role, opts.canExportProposals);
  if (opts.role === "admin") return new Set(reachable);
  const base =
    opts.pageAccess == null
      ? reachable
      : opts.pageAccess.filter((h) => reachable.includes(h));
  const set = new Set(base);
  for (const h of ALWAYS_ON_HREFS) set.add(h);
  return set;
}

/** Keep nav items the user can access; "coming soon" pills always render. */
export function filterNavByAccess(
  items: DashboardNavItem[],
  accessible: Set<string>,
): DashboardNavItem[] {
  return items.filter((i) => i.comingSoon || accessible.has(i.href));
}

export function groupDashboardNavItems(items: DashboardNavItem[]): {
  group: DashboardNavGroup;
  label: string;
  items: DashboardNavItem[];
}[] {
  const map = new Map<DashboardNavGroup, DashboardNavItem[]>();
  for (const it of items) {
    if (!map.has(it.group)) map.set(it.group, []);
    map.get(it.group)!.push(it);
  }
  return DASHBOARD_NAV_GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
    group: g,
    label: DASHBOARD_NAV_GROUP_LABELS[g],
    items: map.get(g)!,
  }));
}

/**
 * Primary bottom-bar destinations (mobile) — up to 4. The bar adds a "More" tab
 * that opens the full nav drawer, so everything else (Timeline, Workload, Team,
 * Activity, Settings…) stays reachable without cramming the bar.
 */
export function getDashboardMobileTabItems(
  accessible: Set<string>
): DashboardNavItem[] {
  const byHref = new Map(
    gateableNavItems()
      .filter((item) => accessible.has(item.href))
      .map((item) => [item.href, item]),
  );

  const hrefSequence: string[] = [
    "/dashboard",
    "/projects",
    ...(accessible.has("/proposals") ? ["/proposals"] : []),
    "/calendar",
  ];

  return hrefSequence
    .map((href) => byHref.get(href))
    .filter((item): item is DashboardNavItem => item != null)
    .slice(0, 4);
}

export function isDashboardNavActive(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href !== "/" && pathname.startsWith(`${href}/`)) return true;
  return false;
}
