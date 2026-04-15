"use client";

import * as React from "react";
import { Pause, Play, Square } from "lucide-react";

import { HelpTip } from "@/components/common/help-tip";
import { Button } from "@/components/ui/button";
import { useTaskTimerStore } from "@/hooks/useTasks";
import { formatWorkHours, roundWorkHours } from "@/lib/utils/work-hours";

function formatHMS(totalSeconds: number): string {
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor((totalSeconds / 60) % 60);
  const h = Math.floor(totalSeconds / 3600);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function elapsedSeconds(
  slice: { accumulatedMs: number; runningSince: number | null } | undefined
): number {
  if (!slice) return 0;
  let ms = slice.accumulatedMs;
  if (slice.runningSince != null) ms += Date.now() - slice.runningSince;
  return Math.floor(ms / 1000);
}

export interface TaskTimeTrackerProps {
  taskId: string;
  onCommitSession: (hoursAdded: number) => void;
  /** Saved total on the task — used to preview merged total after Stop. */
  savedLoggedHours?: number;
  /** When true, no outer card (parent provides the container). */
  embedded?: boolean;
  /**
   * When false, session timer controls are hidden (assignees-only in the app).
   * Stop still must not run without this; parent should not pass onCommit when disabled.
   */
  timerEnabled?: boolean;
}

export function TaskTimeTracker({
  taskId,
  onCommitSession,
  savedLoggedHours = 0,
  embedded = false,
  timerEnabled = true,
}: TaskTimeTrackerProps) {
  const slice = useTaskTimerStore((s) => s.timers[taskId]);
  const [, setTick] = React.useState(0);

  React.useEffect(() => {
    if (slice?.runningSince == null) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [slice?.runningSince]);

  const sec = elapsedSeconds(slice);
  const isRunning = slice?.runningSince != null;
  const hasSession = sec > 0;
  const sessionAsHours = sec / 3600;
  const previewTotal = roundWorkHours(savedLoggedHours + sessionAsHours);
  const showSessionPreview = timerEnabled && hasSession;

  React.useEffect(() => {
    if (!timerEnabled) {
      useTaskTimerStore.getState().clearTimer(taskId);
    }
  }, [timerEnabled, taskId]);

  const play = () => useTaskTimerStore.getState().play(taskId);
  const pause = () => useTaskTimerStore.getState().pause(taskId);
  const stop = () => {
    if (!timerEnabled) return;
    const hours = useTaskTimerStore.getState().consumeElapsedHours(taskId);
    if (hours > 0) onCommitSession(hours);
  };

  const inner = (
    <>
      <div className="mb-2 flex items-center gap-0.5">
        <span className="text-xs font-medium text-muted-foreground">
          This session
        </span>
        <HelpTip label="How the session timer works">
          <p>
            The clock shows <span className="font-mono">hours:minutes:seconds</span>.
            Time is not saved until you press <strong>Stop</strong>.
          </p>
          <p>
            <strong>Stop</strong> converts the session to hours and merges it into
            your saved total above.
          </p>
        </HelpTip>
      </div>
      <div className="mb-2 font-mono text-2xl font-semibold tabular-nums tracking-tight">
        {formatHMS(timerEnabled ? sec : 0)}
      </div>
      {timerEnabled ? (
        <div className="mb-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={play}
            disabled={isRunning}
            aria-label="Start or resume timer"
          >
            <Play className="size-3.5" aria-hidden />
            Play
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={pause}
            disabled={!isRunning}
            aria-label="Pause timer"
          >
            <Pause className="size-3.5" aria-hidden />
            Pause
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="gap-1"
            onClick={stop}
            disabled={!hasSession}
            aria-label="Stop timer and add time to logged hours"
          >
            <Square className="size-3.5" aria-hidden />
            Stop
          </Button>
        </div>
      ) : (
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
          Session timer is only available when you are assigned to this task.
        </p>
      )}
      {embedded ? (
        showSessionPreview ? (
          <div
            className="rounded-md border border-border/80 bg-background/50 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start justify-between gap-2">
              <p>
                Unsaved{" "}
                <span className="font-mono font-medium text-foreground">
                  {formatHMS(sec)}
                </span>{" "}
                ({formatWorkHours(sessionAsHours)} h) → after Stop:{" "}
                <span className="font-medium text-foreground">
                  ~{formatWorkHours(previewTotal)} h
                </span>
              </p>
              <HelpTip label="Session preview">
                <p>
                  Estimated saved total after <strong>Stop</strong>, including time
                  already in the field above plus this session.
                </p>
              </HelpTip>
            </div>
          </div>
        ) : null
      ) : (
        <div
          className="rounded-md border border-border/80 bg-background/50 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start justify-between gap-2">
            <p>
              Saved total:{" "}
              <span className="font-medium text-foreground">
                {formatWorkHours(savedLoggedHours)} h
              </span>
            </p>
            <HelpTip label="About this summary">
              <p>
                Shows the same saved total as the field on the left. When a session is
                running, you also see the merged total after <strong>Stop</strong>.
              </p>
            </HelpTip>
          </div>
          {showSessionPreview ? (
            <p className="mt-1.5">
              Unsaved{" "}
              <span className="font-mono font-medium text-foreground">
                {formatHMS(sec)}
              </span>{" "}
              ({formatWorkHours(sessionAsHours)} h) → after Stop:{" "}
              <span className="font-medium text-foreground">
                ~{formatWorkHours(previewTotal)} h
              </span>
            </p>
          ) : null}
        </div>
      )}
    </>
  );

  if (embedded) {
    return <>{inner}</>;
  }

  return (
    <div className="rounded-lg border border-border bg-muted/15 p-3">{inner}</div>
  );
}
