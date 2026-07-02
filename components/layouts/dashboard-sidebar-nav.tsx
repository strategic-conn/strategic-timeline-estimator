"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DASHBOARD_NAV_ITEMS,
  filterNavByAccess,
  groupDashboardNavItems,
  isDashboardNavActive,
} from "@/components/layouts/dashboard-nav-config";
import { useAccessibleHrefs } from "@/hooks/useNavAccess";
import { cn } from "@/lib/utils";

export function DashboardSidebarNav() {
  const pathname = usePathname();
  const accessible = useAccessibleHrefs();
  const navItems = filterNavByAccess(DASHBOARD_NAV_ITEMS, accessible);
  const groups = groupDashboardNavItems(navItems);

  return (
    <nav className="flex flex-col gap-4" aria-label="Main">
      {groups.map((group, idx) => (
        <div
          key={group.group}
          className={cn("flex flex-col gap-1", idx === 0 && "mt-0")}
        >
          <p className="px-2.5 pb-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
            {group.label}
          </p>
          {group.items.map((item) => {
            if (item.comingSoon) {
              return (
                <div
                  key={item.href}
                  className="flex cursor-not-allowed items-center gap-2.5 rounded-xl px-2.5 py-2 opacity-50"
                  title={`${item.label} — coming soon`}
                >
                  <item.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1 text-sm text-muted-foreground">{item.label}</span>
                  <Badge variant="secondary" className="h-4 px-1 text-[0.6rem] leading-none">
                    Soon
                  </Badge>
                </div>
              );
            }

            const active = isDashboardNavActive(pathname, item.href);
            return (
              <Button
                key={item.href}
                variant="ghost"
                className={cn(
                  "justify-start gap-2.5 rounded-xl px-2.5 transition-colors",
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
        </div>
      ))}
    </nav>
  );
}
