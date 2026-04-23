import type { Metadata } from "next";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";

import { AppAtmosphere } from "@/components/layouts/app-atmosphere";
import { DashboardHeader } from "@/components/layouts/dashboard-header";
import { DashboardMobileTabBar } from "@/components/layouts/dashboard-mobile-tab-bar";
import { DashboardSidebarNav } from "@/components/layouts/dashboard-sidebar-nav";
import { SidebarUserCard } from "@/components/layouts/sidebar-user-card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative flex min-h-screen w-full overflow-hidden bg-background text-foreground">
      <AppAtmosphere variant="app" />

      <aside className="relative z-10 hidden w-64 shrink-0 border-r border-border/60 bg-sidebar/90 p-4 shadow-[4px_0_24px_-18px_rgba(0,0,0,0.12)] backdrop-blur-xl print:hidden dark:shadow-[4px_0_24px_-18px_rgba(0,0,0,0.45)] md:flex md:flex-col">
        <div className="flex items-start justify-between gap-2">
          <Link
            href="/dashboard"
            className="group flex min-w-0 flex-1 items-start gap-2.5 rounded-lg outline-none transition-colors hover:bg-sidebar-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary transition-colors group-hover:bg-primary/18">
              <LayoutDashboard className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 py-0.5">
              <span className="block truncate text-sm font-semibold leading-tight">
                Timeline Estimator
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                Project workspace
              </span>
            </span>
          </Link>
          <Badge variant="outline" className="shrink-0 font-mono text-[0.65rem]">
            Demo
          </Badge>
        </div>

        <Separator className="my-4 bg-border/60" />

        <DashboardSidebarNav />

        <div className="mt-auto pt-4">
          <Separator className="mb-4 bg-border/60" />
          <SidebarUserCard />
        </div>
      </aside>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <DashboardHeader />

        <main className="flex-1 px-4 py-6 pb-[calc(4.25rem+env(safe-area-inset-bottom))] print:pb-6 sm:px-5 md:px-6 md:pb-6">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>

        <DashboardMobileTabBar />
      </div>
    </div>
  );
}
