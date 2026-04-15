"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  DASHBOARD_NAV_ITEMS,
  filterDashboardNavItems,
  isDashboardNavActive,
} from "@/components/layouts/dashboard-nav-config";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";

export function DashboardSidebarNav() {
  const pathname = usePathname();
  const { canExportProposals } = usePermissions();
  const navItems = filterDashboardNavItems(
    DASHBOARD_NAV_ITEMS,
    canExportProposals
  );

  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {navItems.map((item) => {
        const active = isDashboardNavActive(pathname, item.href);
        return (
          <Button
            key={item.href}
            variant="ghost"
            className={cn(
              "justify-start gap-2 px-2",
              active &&
                "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/90 hover:text-sidebar-accent-foreground"
            )}
            asChild
          >
            <Link href={item.href} aria-current={active ? "page" : undefined}>
              <item.icon
                className={cn(
                  "size-4",
                  active
                    ? "text-sidebar-accent-foreground"
                    : "text-muted-foreground"
                )}
                aria-hidden="true"
              />
              {item.label}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}
