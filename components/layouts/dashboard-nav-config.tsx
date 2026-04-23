import type { LucideIcon } from "lucide-react";
import {
  Activity,
  CalendarDays,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Scale,
  Settings,
  Users,
} from "lucide-react";

export type DashboardNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** When true, link is omitted unless the user can export proposals. */
  requireCanExportProposals?: boolean;
};

/** Primary sidebar / drawer order. */
export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  {
    href: "/proposals",
    label: "Proposals",
    icon: FileText,
    requireCanExportProposals: true,
  },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/team", label: "Team", icon: Users },
  { href: "/workload", label: "Workload", icon: Scale },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function filterDashboardNavItems(
  items: DashboardNavItem[],
  canExportProposals: boolean
): DashboardNavItem[] {
  return items.filter(
    (item) => !item.requireCanExportProposals || canExportProposals
  );
}

/** Bottom bar: first four visible destinations (matches common PM app patterns). */
export function getDashboardMobileTabItems(
  canExportProposals: boolean
): DashboardNavItem[] {
  return filterDashboardNavItems(DASHBOARD_NAV_ITEMS, canExportProposals).slice(
    0,
    4
  );
}

export function isDashboardNavActive(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href !== "/" && pathname.startsWith(`${href}/`)) return true;
  return false;
}
