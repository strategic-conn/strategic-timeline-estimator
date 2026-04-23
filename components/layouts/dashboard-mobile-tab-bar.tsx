"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  getDashboardMobileTabItems,
  isDashboardNavActive,
} from "@/components/layouts/dashboard-nav-config";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";

export function DashboardMobileTabBar() {
  const pathname = usePathname();
  const { canExportProposals } = usePermissions();
  const tabItems = getDashboardMobileTabItems(canExportProposals);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-8px_32px_-12px_rgba(0,0,0,0.1)] backdrop-blur-xl print:hidden md:hidden dark:bg-background/85 dark:shadow-[0_-8px_32px_-12px_rgba(0,0,0,0.5)]"
      aria-label="Primary"
    >
      <ul
        className={cn(
          "mx-auto grid max-w-xl gap-0 px-0.5",
          tabItems.length >= 5 ? "grid-cols-5" : "grid-cols-4"
        )}
      >
        {tabItems.map((item) => {
          const active = isDashboardNavActive(pathname, item.href);
          return (
            <li key={item.href} className="flex min-w-0 justify-center">
              <Link
                href={item.href}
                className={cn(
                  "flex min-h-11 min-w-0 max-w-full flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[0.6rem] font-medium leading-none transition-colors sm:px-2",
                  active
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
                aria-current={active ? "page" : undefined}
              >
                <item.icon
                  className={cn(
                    "size-[1.15rem] shrink-0 sm:size-5",
                    active && "text-primary"
                  )}
                  aria-hidden
                />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
