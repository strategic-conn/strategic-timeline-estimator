"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarClock, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { RiskBufferCard } from "@/components/features/proposals/RiskBufferCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTeamCalendar } from "@/hooks/useTeamCalendar";
import {
  bufferSprintDates,
  riskAdjustedFinish,
  workingDaysBetween,
} from "@/lib/discovery/team-calendar";
import {
  notifyProjectScheduleChanged,
  projectDateRange,
  withMirrorSuppressed,
} from "@/lib/sync/estimate-project-sync";
import { useProjectsStore } from "@/store/projects-store";
import { useSprintsStore } from "@/store/sprints-store";

function fmt(ymd: string | null): string {
  if (!ymd) return "—";
  const d = new Date(`${ymd}T12:00:00`);
  return Number.isNaN(d.getTime()) ? ymd : format(d, "MMM d, yyyy");
}

/**
 * The project's own schedule contingency.
 *
 * Two different things, deliberately kept apart:
 *
 *  - a **forecast**, always on screen — "planned to finish Nov 3; with a 20%
 *    buffer, Nov 17". Changing the percentage moves nothing, so a manager can
 *    reason about risk without committing to it.
 *  - **applying** it, which rewrites real sprint dates and therefore goes
 *    through a preview and a confirm, like every other schedule change here.
 *
 * Sprint dates are the plan the team follows, and CLAUDE.md is explicit that a
 * sync never overwrites them silently. A risk percentage is no different.
 */
export function ProjectRiskBufferSection({ projectId }: { projectId: string }) {
  const project = useProjectsStore((s) => s.projects.find((p) => p.id === projectId));
  const updateProject = useProjectsStore((s) => s.updateProject);
  const allSprints = useSprintsStore((s) => s.sprints);
  const updateSprint = useSprintsStore((s) => s.updateSprint);
  const teamCalendar = useTeamCalendar();
  const [confirming, setConfirming] = React.useState(false);

  const sprints = React.useMemo(
    () => allSprints.filter((s) => s.project_id === projectId),
    [allSprints, projectId],
  );
  const pct = project?.risk_buffer_pct ?? 0;

  const range = React.useMemo(() => projectDateRange(sprints), [sprints]);
  const adjusted = React.useMemo(
    () => (range ? riskAdjustedFinish(range.start, range.end, pct, teamCalendar) : null),
    [range, pct, teamCalendar],
  );
  const baseDays = React.useMemo(
    () => (range ? workingDaysBetween(range.start, range.end, teamCalendar) : 0),
    [range, teamCalendar],
  );
  const moves = React.useMemo(
    () => bufferSprintDates(sprints, pct, teamCalendar),
    [sprints, pct, teamCalendar],
  );

  if (!project) return null;

  const apply = () => {
    // One schedule change, not N. Each `updateSprint` fires the PBS drift
    // notice, and the project's overall range can shift more than once as the
    // sprints move in sequence — so the dedupe key changed underneath it and a
    // single action produced a stack of warnings. Suppress during the batch,
    // then announce once at the end.
    withMirrorSuppressed(() => {
      for (const m of moves) {
        updateSprint(m.id, { start_date: m.to.start, end_date: m.to.end });
      }
    });
    notifyProjectScheduleChanged(projectId);
    // The buffer is now IN the dates, so leaving it set would compound it on the
    // next apply — a 20% buffer applied twice is 44%, which nobody asked for.
    updateProject(projectId, { risk_buffer_pct: 0 });
    setConfirming(false);
    toast.success("Schedule extended", {
      description: `${moves.length} sprint${moves.length === 1 ? "" : "s"} moved. The buffer is now part of the plan, so it resets to 0%.`,
    });
  };

  return (
    <>
      <RiskBufferCard
        value={pct}
        onChange={(next) => updateProject(projectId, { risk_buffer_pct: next })}
        title="Schedule risk buffer"
        description="A forecast, not a change. Nothing moves until you apply it."
        tourId="project.risk-buffer"
        baseDays={range ? baseDays : undefined}
        bufferedDays={
          range && pct > 0 ? Math.round(baseDays * (1 + pct / 100)) : undefined
        }
        footer={
          range ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                <span>
                  <span className="text-muted-foreground">Planned finish </span>
                  <span className="font-medium tabular-nums">{fmt(range.end)}</span>
                </span>
                {pct > 0 && adjusted && adjusted !== range.end ? (
                  <span className="flex items-center gap-1.5">
                    <CalendarClock className="size-3.5 text-primary" aria-hidden />
                    <span className="text-muted-foreground">With buffer </span>
                    <span className="font-medium tabular-nums text-primary">
                      {fmt(adjusted)}
                    </span>
                  </span>
                ) : null}
              </div>
              {moves.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => setConfirming(true)}
                >
                  Apply to sprint dates…
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
              This project has no sprint dates yet, so there is no schedule to
              extend.
            </p>
          )
        }
      />

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Extend the schedule by {pct}%?</DialogTitle>
            <DialogDescription>
              This rewrites real sprint dates — the plan the team is working to.
              Every sprint slides out proportionally so the order and the gaps
              between them hold.
            </DialogDescription>
          </DialogHeader>

          <ul className="divide-y divide-border/40 overflow-hidden rounded-lg border border-border/60">
            {moves.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2 text-xs"
              >
                <span className="min-w-0 flex-1 font-medium">{m.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {fmt(m.from.start)} – {fmt(m.from.end)} →{" "}
                  <span className="font-medium text-foreground">
                    {fmt(m.to.start)} – {fmt(m.to.end)}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              Task due dates are not moved — only the sprints. The buffer resets
              to 0% afterwards, because it is now part of the dates and applying
              it again would compound it.
            </span>
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={apply}>
              Extend {moves.length} sprint{moves.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
