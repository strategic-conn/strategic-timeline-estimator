"use client";

import Link from "next/link";
import * as React from "react";
import { ArrowRight, Layers, Link2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePermissions } from "@/hooks/usePermissions";
import { TEAM_MEMBERS } from "@/lib/dummy/tasks.data";
import { copyTextToClipboard, projectShareUrl } from "@/lib/utils/share-links";
import { cn } from "@/lib/utils";
import { useSprintsStore } from "@/store/sprints-store";
import type { Project, ProjectStatus } from "@/types/project.types";

const STATUS_BADGE: Record<ProjectStatus, React.ComponentProps<typeof Badge>["variant"]> =
  {
    active: "default",
    completed: "secondary",
    archived: "outline",
  };

export interface ProjectCardProps {
  project: Project;
  onSetStatus: (id: string, status: ProjectStatus) => void;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
}

function ownerName(ownerId: string | null) {
  if (!ownerId) return "Former member";
  // Demo owners are stringified TEAM_MEMBERS ids; live owners are profile UUIDs.
  const demo = TEAM_MEMBERS.find((m) => String(m.id) === ownerId);
  return demo?.name ?? "You";
}

export function ProjectCard({
  project,
  onSetStatus,
  onEdit,
  onDelete,
}: ProjectCardProps) {
  const { canEditProject, canDeleteProject } = usePermissions();
  const sprintCount = useSprintsStore(
    (s) => s.sprints.filter((sp) => sp.project_id === project.id).length
  );
  const activeSprint = useSprintsStore(
    (s) => s.sprints.find((sp) => sp.project_id === project.id && sp.status === "active")
  );
  const canManage = canEditProject || canDeleteProject;

  return (
    <Card className="group relative overflow-hidden">
      <CardHeader className="gap-2">
        {/* min-w-0 on THIS row, not just the text: CardHeader is a grid, and a
            grid item defaults to `min-width: auto` — it refuses to shrink below
            its content however much the title truncates. Without it a long
            project name pushed the actions menu off a 375px screen entirely,
            so Edit/Delete/Status were unreachable on a phone. */}
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">
              {project.name}
            </CardTitle>
            <CardDescription className="mt-1 line-clamp-2">
              {project.description ?? "No description."}
            </CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-muted-foreground opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100"
                aria-label="Project actions"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canEditProject ? (
                <DropdownMenuItem onClick={() => onEdit(project)}>
                  Edit project
                </DropdownMenuItem>
              ) : null}
              {canDeleteProject ? (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(project)}
                >
                  Delete project
                </DropdownMenuItem>
              ) : null}
              {canEditProject ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onSetStatus(project.id, "active")}>
                    Mark active
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onSetStatus(project.id, "completed")}
                  >
                    Mark completed
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onSetStatus(project.id, "archived")}
                  >
                    Archive
                  </DropdownMenuItem>
                </>
              ) : null}
              {canManage ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem
                onClick={async () => {
                  const ok = await copyTextToClipboard(
                    projectShareUrl(project.id)
                  );
                  if (ok) {
                    toast.success("Project link copied", {
                      description: "Opens sprints and backlog for this project.",
                    });
                  } else {
                    toast.error("Could not copy link");
                  }
                }}
              >
                <Link2 className="size-4" />
                Copy project link
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/projects/${project.id}`}>Open sprints</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={STATUS_BADGE[project.status]} className={cn("capitalize")}>
            {project.status.replace("_", " ")}
          </Badge>
          {sprintCount > 0 ? (
            <Badge variant="outline" className="gap-1 font-normal">
              <Layers className="size-3" aria-hidden />
              {sprintCount} sprint{sprintCount !== 1 ? "s" : ""}
            </Badge>
          ) : null}
          <span className="text-xs text-muted-foreground">
            Owner: {ownerName(project.owner_id)}
          </span>
        </div>
      </CardHeader>

      <CardContent className="border-t border-border/50 pt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-0.5 text-xs text-muted-foreground">
            <div>Updated {new Date(project.updated_at).toLocaleDateString()}</div>
            {activeSprint ? (
              <div className="line-clamp-2 font-medium text-foreground">
                Active: {activeSprint.name}
              </div>
            ) : null}
          </div>
          <Button asChild size="sm" className="w-full shrink-0 gap-1.5 sm:w-auto">
            <Link href={`/projects/${project.id}`}>
              View sprints <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

