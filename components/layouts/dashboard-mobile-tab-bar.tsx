"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import {
  getDashboardMobileTabItems,
  isDashboardNavActive,
} from "@/components/layouts/dashboard-nav-config";
import { useAccessibleHrefs } from "@/hooks/useNavAccess";
import { useNavDrawerStore } from "@/store/nav-drawer-store";
import { cn } from "@/lib/utils";

const TAB_CLASS =
  "flex min-h-11 w-full min-w-0 max-w-full flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[0.6rem] font-medium leading-none transition-colors sm:px-2";
const ICON_CLASS = "size-[1.15rem] shrink-0 sm:size-5";

export function DashboardMobileTabBar() {
  const pathname = usePathname();
  const accessible = useAccessibleHrefs();
  const tabItems = getDashboardMobileTabItems(accessible);
  const openDrawer = useNavDrawerStore((s) => s.setOpen);

  // "More" carries the current page's highlight when you're on a page that
  // isn't one of the primary tabs (Timeline, Workload, Team, Activity, …).
  const onPrimaryTab = tabItems.some((i) => isDashboardNavActive(pathname, i.href));
  const cols = tabItems.length + 1;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-8px_32px_-12px_rgba(0,0,0,0.1)] backdrop-blur-xl print:hidden md:hidden dark:bg-background/85 dark:shadow-[0_-8px_32px_-12px_rgba(0,0,0,0.5)]"
      aria-label="Primary"
    >
      <ul
        className={cn(
          "mx-auto grid max-w-xl gap-0 px-0.5",
          cols >= 5 ? "grid-cols-5" : "grid-cols-4"
        )}
      >
        {tabItems.map((item) => {
          const active = isDashboardNavActive(pathname, item.href);
          return (
            <li key={item.href} className="flex min-w-0 justify-center">
              <Link
                href={item.href}
                className={cn(
                  TAB_CLASS,
                  active
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
                aria-current={active ? "page" : undefined}
              >
                <item.icon
                  className={cn(ICON_CLASS, active && "text-primary")}
                  aria-hidden
                />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex min-w-0 justify-center">
          <button
            type="button"
            onClick={() => openDrawer(true)}
            aria-label="More — open the full menu"
            className={cn(
              TAB_CLASS,
              !onPrimaryTab
                ? "bg-primary/12 text-primary"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            <Menu
              className={cn(ICON_CLASS, !onPrimaryTab && "text-primary")}
              aria-hidden
            />
            <span className="max-w-full truncate">More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
