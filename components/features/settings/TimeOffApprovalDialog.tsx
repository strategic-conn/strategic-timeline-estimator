"use client";

import * as React from "react";
import { format } from "date-fns";
import {
  CalendarRange,
  CheckCircle2,
  ShieldAlert,
  TriangleAlert,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ptoImpact, reschedulePatches } from "@/lib/availability/pto-impact";
import { cn } from "@/lib/utils";
import { useAvailabilityStore } from "@/store/availability-store";
import { useMemberSkillsStore } from "@/store/member-skills-store";
import { useProposalEstimatorStore } from "@/store/proposal-estimator-store";
import { useSprintsStore } from "@/store/sprints-store";
import { useTasksDataStore } from "@/store/tasks-store";
import { useJoinedTeamMembers } from "@/store/team-store";
import type { AvailabilityEntry } from "@/types/availability.types";

function fmt(ymd: string): string {
  return format(new Date(`${ymd}T12:00:00`), "MMM d, yyyy");
}

/**
 * Decide a time-off request, having first seen what it costs.
 *
 * The impact is computed with `ptoImpact` and the reschedule is applied from
 * `reschedulePatches(impact)` — the SAME object that was rendered, never a
 * recompute at write time. That is the rule the rest of this app already
 * follows (Start project, Sync schedule, Create PO): what you approved is what
 * gets saved, even if the roster shifted while you were reading.
 */
export function TimeOffApprovalDialog({
  entry,
  memberName,
  onClose,
}: {
  entry: AvailabilityEntry | null;
  memberName: string;
  onClose: () => void;
}) {
  const tasks = useTasksDataStore((s) => s.tasks);
  const updateTask = useTasksDataStore((s) => s.updateTask);
  const sprints = useSprintsStore((s) => s.sprints);
  const updateSprint = useSprintsStore((s) => s.updateSprint);
  const members = useJoinedTeamMembers();
  const skills = useMemberSkillsStore((s) => s.skills);
  const availability = useAvailabilityStore((s) => s.entries);
  const reviewEntry = useAvailabilityStore((s) => s.reviewEntry);
  const quotes = useProposalEstimatorStore((s) => s.proposals);

  const [note, setNote] = React.useState("");
  React.useEffect(() => {
    if (entry) setNote("");
  }, [entry]);

  const impact = React.useMemo(() => {
    if (!entry) return null;
    /**
     * The platform of the project this absence actually lands on.
     *
     * ⚠️ Without it `ptoImpact` fell back to "wordpress" for everyone, so cover
     * on a Shopify or Next.js project was matched against the wrong skill tier
     * — it would offer a WordPress dev for a React build. One platform per
     * dialog: an absence nearly always lands on a single project, and the first
     * affected task's is a far better guess than a hardcoded default.
     */
    const affectedProject = tasks.find(
      (t) =>
        t.status !== "done" &&
        t.due_date &&
        t.due_date >= entry.start_date &&
        t.due_date <= entry.end_date &&
        t.assignees.some((a) => a.profile_id === entry.user_id),
    )?.project_id;
    const platform = quotes.find((q) => q.project_id === affectedProject)?.platform;

    return ptoImpact({
      entry,
      platform,
      tasks,
      sprints,
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        deactivated_at: m.deactivated_at,
      })),
      skills,
      availability,
    });
  }, [entry, tasks, sprints, members, skills, availability, quotes]);

  if (!entry || !impact) return null;

  const decide = (decision: "approved" | "rejected", reschedule = false) => {
    if (reschedule) {
      const patches = reschedulePatches(impact);
      for (const t of patches.tasks) updateTask(t.id, { due_date: t.due_date });
      for (const s of patches.sprints) updateSprint(s.id, { end_date: s.end_date });
    }
    reviewEntry(entry.id, decision, note);
    toast.success(
      decision === "approved"
        ? reschedule
          ? "Approved, and the plan moved with it"
          : "Time off approved"
        : "Request declined",
      {
        description:
          decision === "approved" && reschedule
            ? `${impact.affected.length} task${impact.affected.length === 1 ? "" : "s"} and ${impact.sprintsAtRisk.length} sprint${impact.sprintsAtRisk.length === 1 ? "" : "s"} rescheduled.`
            : undefined,
      }
    );
    onClose();
  };

  const clean = impact.affected.length === 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review time off — {memberName}</DialogTitle>
          <DialogDescription>
            {fmt(entry.start_date)}
            {entry.end_date !== entry.start_date ? ` – ${fmt(entry.end_date)}` : ""} ·{" "}
            {impact.workdaysLost} working day
            {impact.workdaysLost === 1 ? "" : "s"}
            {entry.note ? ` · “${entry.note}”` : ""}
          </DialogDescription>
        </DialogHeader>

        {clean ? (
          <p className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Nothing scheduled falls in these dates. Approving changes no
              deadlines — it only reduces {memberName}&apos;s capacity for the
              weeks involved.
            </span>
          </p>
        ) : (
          <div className="space-y-3">
            <p
              className={cn(
                "flex items-start gap-2 rounded-lg border p-3 text-sm",
                impact.uncoveredCount > 0
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                  : "border-border/60 bg-muted/30"
              )}
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                This absence lands on{" "}
                <span className="font-medium">{impact.affected.length}</span> task
                {impact.affected.length === 1 ? "" : "s"}
                {impact.uncoveredCount > 0 ? (
                  <>
                    {" "}
                    —{" "}
                    <span className="font-medium">{impact.uncoveredCount}</span> with
                    nobody else on {impact.uncoveredCount === 1 ? "it" : "them"}
                  </>
                ) : (
                  " — all of them have someone else accepted"
                )}
                .
              </span>
            </p>

            <ul className="divide-y divide-border/40 overflow-hidden rounded-lg border border-border/60">
              {impact.affected.map((a) => (
                <li key={a.task.id} className="space-y-1 px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="min-w-0 flex-1 font-medium">{a.task.title}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {a.task.estimated_hours ?? 0}h · due {fmt(a.task.due_date!)} →{" "}
                      <span className="font-medium text-foreground">
                        {fmt(a.suggestedDue)}
                      </span>
                    </span>
                  </div>
                  {/* Who could pick it up. Someone already accepted on the task
                      is real cover; a skill match is only a suggestion, and is
                      labelled as one. */}
                  {a.cover.length ? (
                    <p className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                      <UserCheck className="size-3 shrink-0" aria-hidden />
                      {a.cover.map((c) => (
                        <Badge
                          key={c.id}
                          variant="outline"
                          className="text-[0.65rem] font-normal"
                        >
                          {c.name}
                          {c.alreadyOnTask
                            ? " · already on it"
                            : c.skill
                              ? ` · ${c.skill} ${"★".repeat(c.confidence)}`
                              : ""}
                        </Badge>
                      ))}
                    </p>
                  ) : (
                    <p className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                      <ShieldAlert className="size-3 shrink-0" aria-hidden />
                      No cover — nobody else is on this task or free with the skill
                    </p>
                  )}
                </li>
              ))}
            </ul>

            {impact.sprintsAtRisk.length ? (
              <ul className="divide-y divide-border/40 overflow-hidden rounded-lg border border-border/60">
                {impact.sprintsAtRisk.map((s) => (
                  <li
                    key={s.sprint.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2 text-xs"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-1.5 font-medium">
                      <CalendarRange className="size-3.5 shrink-0 text-primary" aria-hidden />
                      Sprint “{s.sprint.name}”
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      ends {fmt(s.currentEnd)} →{" "}
                      <span className="font-medium text-foreground">
                        {fmt(s.suggestedEnd)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="pto-review-note" className="text-xs">
            Note to {memberName} {clean ? "(optional)" : "(optional, but kind)"}
          </Label>
          <Textarea
            id="pto-review-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Approved — enjoy. / Can we shift this by a week?"
          />
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive sm:mr-auto"
            onClick={() => decide("rejected")}
          >
            Decline
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => decide("approved")}>
              {clean ? "Approve" : "Approve only"}
            </Button>
            {!clean ? (
              <Button type="button" onClick={() => decide("approved", true)}>
                Approve + reschedule
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
