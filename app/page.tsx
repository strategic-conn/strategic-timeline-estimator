import Link from "next/link";
import { CalendarDays, Clock3, Kanban, LayoutDashboard } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function Home() {
  return (
    <div className="flex flex-1">
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-6 py-14">
        <header className="flex flex-col gap-6">
          <div className="flex items-center gap-2">
            <Badge variant="outline">Demo</Badge>
            <span className="text-xs text-muted-foreground">
              Frontend-first build
            </span>
          </div>

          <div className="flex flex-col gap-4">
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance">
              Plan projects, estimate timelines, and keep delivery on track.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground">
              A project management dashboard for tasks, scheduling, proposals,
              and Gantt timelines. We’re using dummy data while the UI is built.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard">
                <LayoutDashboard className="mr-2 size-4" aria-hidden="true" />
                Open dashboard
              </Link>
            </Button>
          </div>
        </header>

        <Separator />

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Kanban className="size-4 text-muted-foreground" aria-hidden="true" />
                Tasks + boards
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              Track work across projects with clear statuses and fast updates.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
                Scheduling
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              Plan team availability, PTO, and realistic delivery dates.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock3 className="size-4 text-muted-foreground" aria-hidden="true" />
                Timeline estimates
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              Surface risk early with “due soon”, blockers, and milestones.
            </CardContent>
          </Card>
        </section>

        <footer className="pt-2 text-xs text-muted-foreground">
          Tip: use the Theme menu on the dashboard to switch light/dark.
        </footer>
      </main>
    </div>
  );
}
