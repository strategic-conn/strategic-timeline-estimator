"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useMemo } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DashboardMobileMenu } from "@/components/layouts/dashboard-mobile-menu";
import { ModeToggle } from "@/components/mode-toggle";
import { NotificationBell } from "@/components/features/notifications/NotificationBell";
import { usePermissions } from "@/hooks/usePermissions";
import { sprintTasksHref } from "@/lib/constants/sprints";
import { useProjectsStore } from "@/store/projects-store";
import { useProposalEstimatorStore } from "@/store/proposal-estimator-store";
import { useSprintsStore } from "@/store/sprints-store";
import { ChevronDown, Plus } from "lucide-react";

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  projects: "Projects",
  tasks: "Tasks",
  sprints: "Sprints",
  backlog: "Backlog",
  calendar: "Calendar",
  gantt: "Timeline",
  team: "Team & access",
  settings: "Settings",
  reports: "Reports",
  proposals: "Proposals",
  activity: "Activity",
  workload: "Workload",
};

const ROUTE_DESCRIPTIONS: Record<string, string> = {
  "/dashboard": "Today's overview and next steps",
  "/team": "Invites, permissions, and workspace access",
  "/projects": "Projects and workspaces",
  "/calendar": "Schedule and availability",
  "/gantt": "Read-only task timeline across projects",
  "/settings": "Workspace and account settings",
  "/reports": "Exports and stakeholder summaries",
  "/proposals": "Client quotes and hour estimates",
  "/activity": "Workspace updates and notifications",
  "/workload": "Open estimates vs each person’s weekly hours",
};

function labelForSegment(segment: string) {
  const mapped = SEGMENT_LABELS[segment];
  if (mapped) return mapped;
  if (/^[0-9a-f-]{8,}$/i.test(segment) || /^\d+$/.test(segment)) {
    return `Item ${segment.slice(0, 8)}${segment.length > 8 ? "…" : ""}`;
  }
  return segment
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

type Crumb = { href: string; label: string };

function applyEntityNamesToCrumbs(
  crumbs: Crumb[],
  projects: { id: string; name: string }[],
  sprints: { id: string; name: string }[],
  proposals: { id: string; title: string }[]
): Crumb[] {
  return crumbs.map((c) => {
    const pm = /^\/projects\/([^/]+)$/.exec(c.href);
    if (pm) {
      const p = projects.find((x) => x.id === pm[1]);
      return p ? { ...c, label: p.name } : c;
    }
    const sm = /^\/projects\/[^/]+\/sprints\/([^/]+)$/.exec(c.href);
    if (sm) {
      const s = sprints.find((x) => x.id === sm[1]);
      return s ? { ...c, label: s.name } : c;
    }
    const qm = /^\/proposals\/([^/]+)$/.exec(c.href);
    if (qm) {
      const q = proposals.find((x) => x.id === qm[1]);
      return q ? { ...c, label: q.title } : c;
    }
    return c;
  });
}

function buildBreadcrumbs(pathname: string): Crumb[] {
  if (pathname === "/dashboard") {
    return [{ href: "/dashboard", label: "Dashboard" }];
  }

  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [{ href: "/dashboard", label: "Dashboard" }];

  let acc = "";
  for (const seg of segments) {
    acc += `/${seg}`;
    crumbs.push({ href: acc, label: labelForSegment(seg) });
  }

  return crumbs;
}

function descriptionForPath(pathname: string) {
  if (ROUTE_DESCRIPTIONS[pathname]) return ROUTE_DESCRIPTIONS[pathname];
  if (/^\/projects\/[^/]+\/?$/.test(pathname)) {
    return "Sprints and backlog for this project";
  }
  if (/^\/projects\/[^/]+\/sprints\/[^/]+\/?$/.test(pathname)) {
    return "Sprint board — tasks, progress, and tracking";
  }
  if (/^\/projects\/[^/]+\/backlog\/?$/.test(pathname)) {
    return "Tasks not yet assigned to a sprint";
  }
  if (/^\/projects\/[^/]+\/tasks\/?$/.test(pathname)) {
    return "Tasks for this project";
  }
  if (/^\/proposals\/[^/]+\/?$/.test(pathname)) {
    return "Edit line items, complexity tiers, and print preview";
  }
  if (/^\/projects\/[^/]+\/activity\/?$/.test(pathname)) {
    return "Updates and notifications for this project";
  }
  const segments = pathname.split("/").filter(Boolean);
  const base = segments.length ? `/${segments[0]}` : pathname;
  return ROUTE_DESCRIPTIONS[base] ?? "Navigate your workspace";
}

const STATUS_ORDER: Record<string, number> = {
  active: 0,
  completed: 1,
  archived: 2,
};

function sortProjectsForMenu<T extends { status: string; name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const diff = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });
}

export function DashboardHeader() {
  const pathname = usePathname();
  const projects = useProjectsStore((s) => s.projects);
  const sprints = useSprintsStore((s) => s.sprints);
  const proposalQuotes = useProposalEstimatorStore((s) => s.proposals);

  const projectsForMenu = useMemo(() => sortProjectsForMenu(projects), [projects]);

  const crumbs = useMemo(
    () =>
      applyEntityNamesToCrumbs(
        buildBreadcrumbs(pathname),
        projects,
        sprints,
        proposalQuotes
      ),
    [pathname, projects, sprints, proposalQuotes]
  );
  const description = descriptionForPath(pathname);

  const { canCreateProject, canCreateTask } = usePermissions();

  const onProjects = pathname === "/projects" || pathname.startsWith("/projects/");
  const onSprintBoard = /^\/projects\/[^/]+\/sprints\/[^/]+\/?$/.test(pathname);
  const onBacklog = /^\/projects\/[^/]+\/backlog\/?$/.test(pathname);
  const hideAddTask = onSprintBoard || onBacklog || !canCreateTask;

  const projectActiveSprintMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of sprints) {
      if (s.status === "active" && !map[s.project_id]) {
        map[s.project_id] = s.id;
      }
    }
    return map;
  }, [sprints]);

  return (
    <header className="z-30 shrink-0 border-b border-border/60 bg-background/75 px-3 py-3 shadow-sm shadow-black/[0.03] backdrop-blur-xl sm:px-4 md:px-5 lg:px-6 print:hidden supports-backdrop-filter:bg-background/65 dark:shadow-black/30">
      <div className="flex w-full flex-row items-center justify-between gap-2 sm:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <DashboardMobileMenu />
          <div className="min-w-0 flex-1">
            <Breadcrumb className="min-w-0">
              <BreadcrumbList className="flex-nowrap gap-1 overflow-hidden sm:gap-1.5">
                {crumbs.map((crumb, index) => {
                  const isLast = index === crumbs.length - 1;
                  return (
                    <Fragment key={crumb.href}>
                      {index > 0 ? <BreadcrumbSeparator /> : null}
                      <BreadcrumbItem className="min-w-0 shrink">
                        {isLast ? (
                          <BreadcrumbPage className="block max-w-[42vw] truncate font-semibold sm:max-w-[min(24rem,50vw)] md:max-w-none">
                            {crumb.label}
                          </BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink asChild className="line-clamp-1">
                            <Link href={crumb.href}>{crumb.label}</Link>
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                    </Fragment>
                  );
                })}
              </BreadcrumbList>
            </Breadcrumb>
            <p className="mt-1 hidden text-xs text-muted-foreground md:block">
              {description}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <NotificationBell />
          <ModeToggle />
          {!onProjects && canCreateProject ? (
            <Button
              variant="outline"
              size="sm"
              className="min-h-9 shrink-0 px-2 sm:px-3"
              asChild
            >
              <Link href="/projects">
                <span className="hidden sm:inline">New project</span>
                <span className="sm:hidden">New</span>
              </Link>
            </Button>
          ) : null}

          {!hideAddTask ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  className="min-h-9 shrink-0 gap-1 px-2 sm:px-3"
                  aria-label="Add task to a project"
                >
                  <span className="hidden sm:inline">Add task</span>
                  <span className="sm:hidden">Add</span>
                  <ChevronDown className="size-3.5 opacity-70" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 max-h-[min(320px,50vh)] overflow-y-auto">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Choose a project — navigates to its active sprint
                </DropdownMenuLabel>
                {projectsForMenu.map((p) => {
                  const activeSprint = projectActiveSprintMap[p.id];
                  const href = activeSprint
                    ? sprintTasksHref(p.id, activeSprint)
                    : `/projects/${p.id}`;
                  return (
                    <DropdownMenuItem key={p.id} asChild>
                      <Link
                        href={href}
                        className="flex w-full cursor-pointer items-center justify-between gap-2"
                      >
                        <span className="truncate font-medium">{p.name}</span>
                        <span className="shrink-0 text-xs capitalize text-muted-foreground">
                          {p.status}
                        </span>
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link
                    href="/projects"
                    className="flex w-full cursor-pointer items-center gap-2"
                  >
                    <Plus className="size-4" aria-hidden />
                    Create project
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </header>
  );
}
