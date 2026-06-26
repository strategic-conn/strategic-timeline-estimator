import type { LucideIcon } from "lucide-react";
import {
  Activity,
  CalendarDays,
  Compass,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Milestone,
  Scale,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";

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
  // Plan & people
  { href: "/calendar", label: "Calendar", icon: CalendarDays, group: "plan" },
  { href: "/gantt", label: "Timeline", icon: Milestone, group: "plan" },
  { href: "/workload", label: "Workload", icon: Scale, group: "plan" },
  { href: "/team", label: "Team", icon: Users, group: "plan" },
  // Commercial
  {
    href: "/discovery",
    label: "Discovery",
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
  {
    href: "/proposals",
    label: "Proposals",
    icon: FileText,
    group: "commercial",
    requireCanExportProposals: true,
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
 * Bottom bar destinations (mobile). Always includes Timeline so it matches the
 * sidebar; when the user can export proposals, Proposals is included (5 tabs).
 */
export function getDashboardMobileTabItems(
  canExportProposals: boolean
): DashboardNavItem[] {
  const allowed = filterDashboardNavItems(DASHBOARD_NAV_ITEMS, canExportProposals);
  const byHref = new Map(allowed.map((item) => [item.href, item]));

  const hrefSequence: string[] = [
    "/dashboard",
    "/projects",
    ...(canExportProposals ? ["/proposals"] : []),
    "/calendar",
    "/gantt",
  ];

  return hrefSequence
    .map((href) => byHref.get(href))
    .filter((item): item is DashboardNavItem => item != null);
}

export function isDashboardNavActive(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href !== "/" && pathname.startsWith(`${href}/`)) return true;
  return false;
}
