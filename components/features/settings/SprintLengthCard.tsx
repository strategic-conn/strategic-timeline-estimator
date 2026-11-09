"use client";

import { AppHelp } from "@/components/common/app-help";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import {
  SPRINT_WEEK_OPTIONS,
  useWorkspaceSettingsStore,
} from "@/store/workspace-settings-store";

const weeks = (n: number) => `${n} week${n === 1 ? "" : "s"}`;

/**
 * Settings → Workspace → Sprint length. How long each build sprint is when an
 * estimate is planned and when Start project lays out a project. Admin edits;
 * managers read, like the holidays and hourly rates.
 */
export function SprintLengthCard() {
  const { canEditHourlyRates: isAdmin } = usePermissions();
  const sprintWeeks = useWorkspaceSettingsStore((s) => s.sprintWeeks);
  const loaded = useWorkspaceSettingsStore((s) => s.loaded);
  const error = useWorkspaceSettingsStore((s) => s.error);
  const setSprintWeeks = useWorkspaceSettingsStore((s) => s.setSprintWeeks);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sprint length</CardTitle>
        <CardDescription>
          How long each build sprint lasts when an estimate is planned and when
          Start project sets up a project. Projects already started keep their
          sprints.
        </CardDescription>
        <CardAction>
          <AppHelp section="settings.sprints" />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!loaded ? (
          <Skeleton className="h-9 w-64 rounded-md" />
        ) : (
          <>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {`Couldn't load the sprint length, so plans use ${weeks(sprintWeeks)}: ${error}`}
              </p>
            ) : null}
            {isAdmin ? (
              <div
                role="group"
                aria-label="Sprint length"
                className="inline-flex w-fit flex-wrap rounded-lg border border-border/70 bg-muted/40 p-0.5"
              >
                {SPRINT_WEEK_OPTIONS.map((n) => {
                  const active = sprintWeeks === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={active}
                      onClick={() => void setSprintWeeks(n)}
                      className={cn(
                        "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                        active
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {weeks(n)}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm">
                <span className="font-medium">{weeks(sprintWeeks)}</span>
                <span className="text-muted-foreground"> · only admins can change it</span>
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {`${weeks(sprintWeeks)} = ${sprintWeeks * 5} working days. Weekends, holidays and leave are skipped, so a sprint over Thanksgiving ends a day later.`}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
