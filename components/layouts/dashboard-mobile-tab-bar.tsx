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
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.12)] backdrop-blur-md print:hidden md:hidden dark:shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.4)]"
      aria-label="Primary"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4 gap-0 px-1">
        {tabItems.map((item) => {
          const active = isDashboardNavActive(pathname, item.href);
          return (
            <li key={item.href} className="flex min-w-0 justify-center">
              <Link
                href={item.href}
                className={cn(
                  "flex min-h-11 min-w-12 max-w-full flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-[0.625rem] font-medium leading-none transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
                aria-current={active ? "page" : undefined}
              >
                <item.icon
                  className={cn(
                    "size-5 shrink-0",
                    active && "text-primary"
                  )}
                  aria-hidden
                />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
