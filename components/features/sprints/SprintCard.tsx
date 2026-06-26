"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Link2,
  MoreHorizontal,
  Play,
  CheckCircle2,
  Target,
  Zap,
} from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { sprintTasksHref } from "@/lib/constants/sprints";
import { copyTextToClipboard, sprintShareUrl } from "@/lib/utils/share-links";
import { cn } from "@/lib/utils";
import type { Sprint, SprintStatus } from "@/types/sprint.types";

const STATUS_BADGE: Record<SprintStatus, React.ComponentProps<typeof Badge>["variant"]> = {
  planning: "outline",
  active: "default",
  completed: "secondary",
  cancelled: "destructive",
};

function formatDateRange(start: string, end: string): string {
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function daysLeft(end: string): string {
  const diff = Math.ceil(
    (new Date(end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "Ends today";
  return `${diff}d left`;
}

export interface SprintCardProps {
  sprint: Sprint;
  projectId: string;
  taskCount: number;
  doneCount: number;
  totalEstimatedHours: number;
  totalLoggedHours: number;
  onEdit: (sprint: Sprint) => void;
  onDelete: (sprint: Sprint) => void;
  onSetStatus: (id: string, status: SprintStatus) => void;
}

export function SprintCard({
  sprint,
  projectId,
  taskCount,
  doneCount,
  totalEstimatedHours,
  totalLoggedHours,
  onEdit,
  onDelete,
  onSetStatus,
}: SprintCardProps) {
  const progressPct = taskCount > 0 ? Math.round((doneCount / taskCount) * 100) : 0;
  const isPlanning = sprint.status === "planning";
  const isActive = sprint.status === "active";
  return (
    <TooltipProvider delayDuration={400}>
      <Card className="group relative overflow-hidden">
        <CardHeader className="gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="truncate text-base">{sprint.name}</CardTitle>
              {sprint.goal ? (
                <CardDescription className="mt-1 line-clamp-2">
                  <Target className="mr-1 inline size-3.5 -translate-y-px" aria-hidden />
                  {sprint.goal}
                </CardDescription>
              ) : null}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100"
                  aria-label="Sprint actions"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(sprint)}>
                  Edit sprint
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(sprint)}
                >
                  Delete sprint
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onSetStatus(sprint.id, "planning")}>
                  Set to Planning
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSetStatus(sprint.id, "active")}>
                  Start sprint
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSetStatus(sprint.id, "completed")}>
                  Complete sprint
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSetStatus(sprint.id, "cancelled")}>
                  Cancel sprint
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant={STATUS_BADGE[sprint.status]} className="capitalize">
              {sprint.status}
            </Badge>
            <span className="flex items-center gap-1 text-muted-foreground">
              <CalendarDays className="size-3" aria-hidden />
              {formatDateRange(sprint.start_date, sprint.end_date)}
            </span>
            {isActive ? (
              <span className="text-muted-foreground">{daysLeft(sprint.end_date)}</span>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pt-0">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {doneCount}/{taskCount} tasks done
              </span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  progressPct === 100 ? "bg-green-500" : "bg-primary"
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {(totalEstimatedHours > 0 || totalLoggedHours > 0) && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1">
                    <Zap className="size-3" aria-hidden />
                    {totalEstimatedHours}h est
                  </span>
                </TooltipTrigger>
                <TooltipContent>Total estimated hours</TooltipContent>
              </Tooltip>
              <span>·</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1">
                    {totalLoggedHours}h logged
                  </span>
                </TooltipTrigger>
                <TooltipContent>Total logged hours</TooltipContent>
              </Tooltip>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {(isPlanning || isActive) && (
              <div className="flex gap-2">
                {isPlanning && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1.5"
                    onClick={() => onSetStatus(sprint.id, "active")}
                  >
                    <Play className="size-3.5" aria-hidden />
                    Start sprint
                  </Button>
                )}
                {isActive && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1.5"
                    onClick={() => onSetStatus(sprint.id, "completed")}
                  >
                    <CheckCircle2 className="size-3.5" aria-hidden />
                    Complete
                  </Button>
                )}
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild className="w-full flex-1 gap-1.5">
                <Link href={sprintTasksHref(projectId, sprint.id)}>
                  Open board
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full shrink-0 gap-1.5 sm:w-auto"
                onClick={async () => {
                  const ok = await copyTextToClipboard(
                    sprintShareUrl(projectId, sprint.id)
                  );
                  if (ok) {
                    toast.success("Sprint board link copied", {
                      description: "Opens this sprint’s task board.",
                    });
                  } else {
                    toast.error("Could not copy link");
                  }
                }}
              >
                <Link2 className="size-4" aria-hidden />
                Copy link
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
