import type { Metadata } from "next";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";

import { AppAtmosphere } from "@/components/layouts/app-atmosphere";
import { DashboardHeader } from "@/components/layouts/dashboard-header";
import { DashboardMobileTabBar } from "@/components/layouts/dashboard-mobile-tab-bar";
import { DashboardSidebarNav } from "@/components/layouts/dashboard-sidebar-nav";
import { PageAccessGuard } from "@/components/layouts/page-access-guard";
import { SidebarUserCard } from "@/components/layouts/sidebar-user-card";
import { WorkspaceSync } from "@/components/layouts/workspace-sync";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative flex h-svh min-h-0 w-full overflow-hidden bg-background text-foreground print:h-auto print:min-h-0 print:overflow-visible">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <WorkspaceSync />
      <PageAccessGuard />
      <AppAtmosphere variant="app" />

      <aside className="relative z-10 hidden h-svh min-h-0 w-56 shrink-0 flex-col border-r border-border/60 bg-sidebar/90 p-3 shadow-[4px_0_24px_-18px_rgba(0,0,0,0.12)] backdrop-blur-xl sm:p-4 print:hidden dark:shadow-[4px_0_24px_-18px_rgba(0,0,0,0.45)] md:flex xl:w-64">
        <div className="flex shrink-0 items-start justify-between gap-2">
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
            {isSupabaseConfigured ? "Live" : "Demo"}
          </Badge>
        </div>

        <Separator className="my-4 shrink-0 bg-border/60" />

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-gutter:stable]">
          <DashboardSidebarNav />
        </div>

        <div className="shrink-0 pt-4">
          <Separator className="mb-4 bg-border/60" />
          <SidebarUserCard />
        </div>
      </aside>

      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <DashboardHeader />

        <main
          id="main-content"
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-5 pb-[calc(4.25rem+env(safe-area-inset-bottom))] outline-none print:overflow-visible print:pb-6 sm:px-4 sm:py-6 md:px-5 md:py-6 md:pb-6 lg:px-6"
        >
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>

        <DashboardMobileTabBar />
      </div>
    </div>
  );
}
