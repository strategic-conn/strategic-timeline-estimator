"use client";

import * as React from "react";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  type LucideIcon,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  PHASE_META,
  PHASE_STATUS_META,
  PHASE_STATUS_ORDER,
} from "@/lib/discovery/constants";
import { formatHours, rangeLabel } from "@/lib/discovery";
import { useDiscoveryStore, emptyTracker } from "@/store/discovery-store";
import { cn } from "@/lib/utils";
import type {
  DiscoveryResult,
  PhaseStatus,
} from "@/types/discovery.types";

const STATUS_ICON: Record<PhaseStatus, LucideIcon> = {
  not_started: Circle,
  in_progress: Clock,
  in_review: AlertCircle,
  complete: CheckCircle2,
  blocked: Ban,
};

export function DiscoveryTracker({
  projectId,
  result,
}: {
  projectId: string;
  result: DiscoveryResult;
}) {
  const { estimate, timeline } = result;
  const tracker = useDiscoveryStore((s) => s.tracker[projectId]) ?? emptyTracker();
  const toggleTask = useDiscoveryStore((s) => s.toggleTask);
  const setPhaseStatus = useDiscoveryStore((s) => s.setPhaseStatus);
  const setHoursLogged = useDiscoveryStore((s) => s.setHoursLogged);
  const setPhaseNotes = useDiscoveryStore((s) => s.setPhaseNotes);

  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const allTasks = estimate.phases.flatMap((p) => p.tasks);
  const doneTasks = allTasks.filter((t) => tracker.checkedTasks[t.id]).length;
  const phasesComplete = estimate.phases.filter(
    (p) => tracker.phaseStatus[p.id] === "complete",
  ).length;
  const totalLogged = estimate.phases.reduce(
    (s, p) => s + (tracker.hoursLogged[p.id] ?? 0),
    0,
  );
  const overallPct = allTasks.length
    ? Math.round((doneTasks / allTasks.length) * 100)
    : 0;
  const activePhase =
    estimate.phases.find((p) => tracker.phaseStatus[p.id] === "in_progress") ??
    estimate.phases.find(
      (p) => (tracker.phaseStatus[p.id] ?? "not_started") !== "complete",
    );

  return (
    <div className="flex flex-col gap-5">
      {/* Overview */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-4 py-4 sm:grid-cols-4">
          <Stat label="Tasks done" value={`${doneTasks} / ${allTasks.length}`} />
          <Stat label="Phases complete" value={`${phasesComplete} / ${estimate.phases.length}`} />
          <Stat label="Hours logged" value={formatHours(totalLogged)} />
          <Stat label="Hours estimated" value={formatHours(estimate.total.mid)} />
          <div className="col-span-2 sm:col-span-4">
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Overall progress</span>
              <span className="tabular-nums">{overallPct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${overallPct}%` }}
              />
            </div>
            {activePhase ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
                  <span className="relative inline-flex size-2 rounded-full bg-primary" />
                </span>
                Active phase: {activePhase.label}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Phase cards */}
      <div className="flex flex-col gap-3">
        {estimate.phases.map((phase, i) => {
          const meta = PHASE_META[phase.id];
          const status = tracker.phaseStatus[phase.id] ?? "not_started";
          const logged = tracker.hoursLogged[phase.id] ?? 0;
          const done = phase.tasks.filter((t) => tracker.checkedTasks[t.id]).length;
          const pct = phase.tasks.length
            ? Math.round((done / phase.tasks.length) * 100)
            : 0;
          const variance = logged - phase.mid;
          const isOpen = expanded.has(phase.id);

          return (
            <Card key={phase.id} className="overflow-hidden">
              <CardContent className="flex flex-col gap-3 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={cn("size-2.5 shrink-0 rounded-full", meta.bar)} />
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(phase.id)) next.delete(phase.id);
                        else next.add(phase.id);
                        return next;
                      })
                    }
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform",
                        isOpen && "rotate-180",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {i + 1}. {phase.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {done}/{phase.tasks.length} tasks · {pct}%
                      </span>
                    </span>
                  </button>

                  <PhaseStatusSelect
                    status={status}
                    onChange={(s) => setPhaseStatus(projectId, phase.id, s)}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="h-1.5 min-w-32 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", meta.bar)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label
                      htmlFor={`logged-${phase.id}`}
                      className="text-xs text-muted-foreground"
                    >
                      Logged
                    </Label>
                    <Input
                      id={`logged-${phase.id}`}
                      type="number"
                      min={0}
                      value={logged === 0 ? "" : String(logged)}
                      placeholder="0"
                      onChange={(e) =>
                        setHoursLogged(
                          projectId,
                          phase.id,
                          e.target.value === "" ? 0 : Number(e.target.value),
                        )
                      }
                      className="h-8 w-20 text-right tabular-nums"
                    />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      / {formatHours(phase.mid)} est
                    </span>
                    {logged > 0 ? (
                      <span
                        className={cn(
                          "text-xs font-medium tabular-nums",
                          variance > 0
                            ? "text-orange-600 dark:text-orange-400"
                            : "text-green-600 dark:text-green-400",
                        )}
                      >
                        {variance > 0 ? `+${formatHours(variance)} over` : `${formatHours(Math.abs(variance))} under`}
                      </span>
                    ) : null}
                  </div>
                </div>

                {isOpen ? (
                  <div className="flex flex-col gap-3 border-t border-border/60 pt-3">
                    <ul className="flex flex-col gap-1">
                      {phase.tasks.map((task) => {
                        const checked = !!tracker.checkedTasks[task.id];
                        return (
                          <li
                            key={task.id}
                            className={cn(
                              "flex items-start gap-2.5 rounded-lg px-2 py-1.5",
                              checked && "bg-green-500/10",
                            )}
                          >
                            <Checkbox
                              id={`task-${task.id}`}
                              checked={checked}
                              onCheckedChange={() => toggleTask(projectId, task.id)}
                              className="mt-0.5"
                            />
                            <Label
                              htmlFor={`task-${task.id}`}
                              className="min-w-0 flex-1 cursor-pointer font-normal"
                            >
                              <span
                                className={cn(
                                  "block text-sm",
                                  checked && "text-muted-foreground line-through",
                                )}
                              >
                                {task.name}
                              </span>
                              {task.note ? (
                                <span className="block text-xs text-muted-foreground">
                                  {task.note}
                                </span>
                              ) : null}
                            </Label>
                            <span className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                              <span className="block">{rangeLabel(task.min, task.max)} h</span>
                              <span className="block font-medium text-foreground">
                                mid {formatHours(task.mid)}
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>

                    <div>
                      <Label
                        htmlFor={`notes-${phase.id}`}
                        className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground"
                      >
                        Phase notes
                      </Label>
                      <Textarea
                        id={`notes-${phase.id}`}
                        rows={2}
                        value={tracker.phaseNotes[phase.id] ?? ""}
                        placeholder="Blockers, decisions, client feedback…"
                        onChange={(e) =>
                          setPhaseNotes(projectId, phase.id, e.target.value)
                        }
                      />
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Milestone check-ins */}
      <div>
        <h3 className="mb-2 text-sm font-semibold">Milestone check-ins</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {timeline.milestones.map((m) => {
            const achieved = tracker.phaseStatus[m.phaseId] === "complete";
            return (
              <div
                key={m.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3 py-2.5",
                  achieved
                    ? "border-green-500/40 bg-green-500/10"
                    : "border-border/60 bg-card/40",
                )}
              >
                <CheckCircle2
                  className={cn(
                    "size-5 shrink-0",
                    achieved ? "text-green-600 dark:text-green-400" : "text-muted-foreground/40",
                  )}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p
                    className={cn(
                      "truncate text-sm font-medium",
                      achieved && "text-muted-foreground line-through",
                    )}
                  >
                    {m.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {m.date} · {achieved ? "Achieved" : "Pending"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function PhaseStatusSelect({
  status,
  onChange,
}: {
  status: PhaseStatus;
  onChange: (s: PhaseStatus) => void;
}) {
  const meta = PHASE_STATUS_META[status];
  const Icon = STATUS_ICON[status];
  return (
    <Select value={status} onValueChange={(v) => onChange(v as PhaseStatus)}>
      <SelectTrigger size="sm" className={cn("h-8 w-[10.5rem] border-0", meta.badge)}>
        <span className="flex items-center gap-1.5">
          <Icon className="size-3.5" aria-hidden />
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        {PHASE_STATUS_ORDER.map((s) => {
          const SIcon = STATUS_ICON[s];
          return (
            <SelectItem key={s} value={s}>
              <span className="flex items-center gap-1.5">
                <SIcon className="size-3.5" aria-hidden />
                {PHASE_STATUS_META[s].label}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
