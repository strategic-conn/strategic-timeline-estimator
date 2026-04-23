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
              "justify-start gap-2.5 rounded-lg px-2.5 transition-colors",
              active
                ? "border border-primary/20 bg-primary/10 font-medium text-foreground shadow-sm hover:bg-primary/12 hover:text-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/80 hover:text-foreground"
            )}
            asChild
          >
            <Link href={item.href} aria-current={active ? "page" : undefined}>
              <item.icon
                className={cn(
                  "size-4 shrink-0",
                  active ? "text-primary" : "text-muted-foreground"
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
