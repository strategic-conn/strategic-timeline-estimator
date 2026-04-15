"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { Menu } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DASHBOARD_NAV_ITEMS,
  filterDashboardNavItems,
  isDashboardNavActive,
} from "@/components/layouts/dashboard-nav-config";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";

export function DashboardMobileMenu() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const user = useAuthStore((s) => s.user);
  const { canExportProposals } = usePermissions();
  const navItems = filterDashboardNavItems(
    DASHBOARD_NAV_ITEMS,
    canExportProposals
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="md:hidden min-h-11 min-w-11 shrink-0"
          aria-label="Open menu"
        >
          <Menu className="size-5" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="flex w-[min(100vw-1rem,20rem)] max-w-[20rem] flex-col gap-0 border-r bg-card/95 p-0 sm:max-w-sm"
      >
        <SheetHeader className="border-b border-border text-left">
          <SheetTitle className="pr-10">Timeline Estimator</SheetTitle>
          <SheetDescription>Project management</SheetDescription>
          <Badge variant="outline" className="mt-2 w-fit">
            Demo
          </Badge>
        </SheetHeader>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-4" aria-label="Main">
          {navItems.map((item) => {
            const active = isDashboardNavActive(pathname, item.href);
            return (
              <Button
                key={item.href}
                variant="ghost"
                className={cn(
                  "h-11 min-h-11 justify-start gap-3 px-3",
                  active &&
                    "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/90 hover:text-sidebar-accent-foreground"
                )}
                asChild
              >
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <item.icon
                    className={cn(
                      "size-5 shrink-0",
                      active
                        ? "text-sidebar-accent-foreground"
                        : "text-muted-foreground"
                    )}
                    aria-hidden
                  />
                  {item.label}
                </Link>
              </Button>
            );
          })}
        </nav>

        <div className="border-t border-border p-4">
          <Separator className="mb-4" />
          <Link
            href="/settings"
            className={cn(
              "-mx-1 flex items-center gap-3 rounded-md p-1 transition-colors",
              "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              (pathname === "/settings" || pathname.startsWith("/settings/")) &&
                "bg-muted/50"
            )}
            aria-label={`Profile and settings — ${user.name}`}
            onClick={() => setOpen(false)}
          >
            <Avatar size="sm">
              {user.avatar_url ? (
                <AvatarImage src={user.avatar_url} alt="" />
              ) : null}
              <AvatarFallback>{user.initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 text-left">
              <div className="truncate text-xs font-medium leading-5">
                {user.name}
              </div>
              <div className="truncate text-xs capitalize text-muted-foreground">
                {user.role}
              </div>
            </div>
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
