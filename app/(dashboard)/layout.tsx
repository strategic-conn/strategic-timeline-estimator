import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarDays,
  LayoutDashboard,
  ListChecks,
  Settings,
  Users,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Dashboard",
};

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: ListChecks },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/team", label: "Team", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 border-r bg-card/30 p-4 md:flex md:flex-col">
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

        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <Button
              key={item.href}
              variant="ghost"
              className="justify-start gap-2 px-2"
              asChild
            >
              <Link href={item.href}>
                <item.icon className="size-4 text-muted-foreground" aria-hidden="true" />
                {item.label}
              </Link>
            </Button>
          ))}
        </nav>

        <div className="mt-auto pt-4">
          <Separator className="mb-4" />
          <div className="flex items-center gap-3">
            <Avatar size="sm">
              <AvatarFallback>AD</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate text-xs font-medium leading-5">
                Alex Demo
              </div>
              <div className="truncate text-xs text-muted-foreground">
                manager
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b bg-background/80 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/60">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">Dashboard</div>
              <div className="truncate text-xs text-muted-foreground">
                Today’s overview and next steps
              </div>
            </div>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button variant="outline" size="sm" asChild>
                <Link href="/projects">New project</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/tasks">Add task</Link>
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

