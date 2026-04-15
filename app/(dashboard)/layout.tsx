import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DashboardHeader } from "@/components/layouts/dashboard-header";
import { DashboardMobileTabBar } from "@/components/layouts/dashboard-mobile-tab-bar";
import { DashboardSidebarNav } from "@/components/layouts/dashboard-sidebar-nav";
import { SidebarUserCard } from "@/components/layouts/sidebar-user-card";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 border-r bg-card/30 p-4 print:hidden md:flex md:flex-col">
        <div className="flex items-center justify-between gap-3">
          <Link href="/dashboard" className="min-w-0">
            <div className="truncate text-sm font-semibold leading-6">
              Timeline Estimator
            </div>
            <div className="truncate text-xs text-muted-foreground">
              Project management
            </div>
          </Link>
          <Badge variant="outline">Demo</Badge>
        </div>

        <Separator className="my-4" />

        <DashboardSidebarNav />

        <div className="mt-auto pt-4">
          <Separator className="mb-4" />
          <SidebarUserCard />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardHeader />

        <main className="flex-1 px-4 py-6 pb-[calc(4.25rem+env(safe-area-inset-bottom))] print:pb-6 md:pb-6">
          <div className="w-full max-w-none">{children}</div>
        </main>

        <DashboardMobileTabBar />
      </div>
    </div>
  );
}
