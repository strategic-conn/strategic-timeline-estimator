import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  FolderKanban,
  LayoutDashboard,
} from "lucide-react";

import { AppAtmosphere } from "@/components/layouts/app-atmosphere";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Timeline Estimator",
  description:
    "Plan sprints, track tasks, balance workload, and ship proposals — one workspace for honest timelines.",
};

const PREVIEW_COLUMNS = [
  {
    label: "To do",
    tint: "bg-slate-400/35 dark:bg-slate-500/40",
    items: ["Scope API", "Design review"],
  },
  {
    label: "Doing",
    tint: "bg-chart-2/35",
    items: ["Sprint board", "QA fixes"],
  },
  {
    label: "Done",
    tint: "bg-emerald-500/30 dark:bg-emerald-400/25",
    items: ["v1.2 release"],
  },
] as const;

const PILLARS = [
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    text: "Due work and health at a glance.",
  },
  {
    icon: FolderKanban,
    title: "Boards & backlog",
    text: "Kanban, filters, and sprint flow.",
  },
  {
    icon: CalendarDays,
    title: "Calendar",
    text: "Deadlines and milestones together.",
  },
] as const;

export default function Home() {
  return (
    <div
      className={cn(
        "relative flex min-h-svh flex-col overflow-hidden",
        "bg-background text-foreground"
      )}
    >
      <AppAtmosphere variant="marketing" />

      <header className="relative z-10 flex shrink-0 items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link
          href="/"
          className="group flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary transition-colors group-hover:bg-primary/20">
            <LayoutDashboard className="size-4" aria-hidden />
          </span>
          <span className="hidden sm:inline">Timeline Estimator</span>
          <span className="sm:hidden">TE</span>
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <Button size="sm" className="hidden sm:inline-flex" asChild>
            <Link href="/login">
              Sign in
              <ArrowRight className="ml-1 size-3.5 opacity-80" aria-hidden />
            </Link>
          </Button>
          <ModeToggle />
        </div>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col justify-center px-5 pb-10 pt-2 sm:px-8 lg:flex-row lg:items-center lg:gap-12 lg:px-12 lg:pb-12 xl:gap-20">
        <div className="mx-auto flex w-full max-w-xl flex-col justify-center lg:mx-0 lg:max-w-lg lg:shrink-0">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-normal text-muted-foreground">
              Project workspace
            </Badge>
            <Badge variant="outline" className="font-mono text-[0.65rem] uppercase">
              Demo
            </Badge>
          </div>

          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Deadlines you can{" "}
            <span className="bg-gradient-to-r from-primary to-chart-2 bg-clip-text text-transparent">
              defend
            </span>
            .
          </h1>

          <p className="mt-4 max-w-md text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            Sprints, workload, calendar, and proposals — structured so estimates
            match reality.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Button size="lg" className="w-full sm:w-auto" asChild>
              <Link href="/login">
                Sign in to dashboard
                <ArrowRight className="ml-2 size-4" aria-hidden />
              </Link>
            </Button>
          </div>

          <ul className="mt-8 hidden gap-3 md:grid md:grid-cols-3 md:gap-4">
            {PILLARS.map(({ icon: Icon, title, text }) => (
              <li
                key={title}
                className="flex gap-3 rounded-xl border border-border/60 bg-card/40 px-3 py-3 backdrop-blur-sm sm:flex-col sm:px-3.5 sm:py-3.5"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight">{title}</p>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                    {text}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="mx-auto mt-8 w-full max-w-md sm:mt-10 lg:mx-0 lg:mt-0 lg:max-w-[26rem] xl:max-w-md">
          <div
            className={cn(
              "relative rounded-2xl border border-border/80 bg-card/85 p-5 shadow-2xl shadow-primary/[0.07]",
              "backdrop-blur-md ring-1 ring-black/[0.04] dark:ring-white/[0.08]"
            )}
          >
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-border/60 pb-4">
              <div className="flex gap-1.5" aria-hidden>
                <span className="size-2.5 rounded-full bg-red-400/90" />
                <span className="size-2.5 rounded-full bg-amber-400/90" />
                <span className="size-2.5 rounded-full bg-emerald-400/90" />
              </div>
              <span className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
                Board preview
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {PREVIEW_COLUMNS.map((col) => (
                <div
                  key={col.label}
                  className="flex min-h-[7.5rem] flex-col gap-1.5 rounded-xl bg-muted/30 p-1.5 sm:min-h-[10rem] sm:gap-2 sm:p-2"
                >
                  <p className="px-1 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                    {col.label}
                  </p>
                  {col.items.map((item) => (
                    <div
                      key={item}
                      className={cn(
                        "rounded-lg border border-border/50 bg-background/80 px-2 py-2 text-[0.7rem] font-medium leading-tight shadow-sm",
                        "line-clamp-2"
                      )}
                    >
                      <span className={cn("mr-1.5 inline-block size-1.5 rounded-full align-middle", col.tint)} />
                      {item}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-primary/25 bg-primary/[0.06] px-3 py-2.5 text-xs text-muted-foreground">
              <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden />
              <span>
                After sign in you land on your dashboard — same layout as the rest
                of the app.
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
