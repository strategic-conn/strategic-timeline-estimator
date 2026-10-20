"use client";

import * as React from "react";
import { format } from "date-fns";

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
import {
  FEDERAL_HOLIDAY_NAMES,
  federalHolidaysForYear,
} from "@/lib/calendar/us-holidays";
import { parseYmdLocal } from "@/lib/utils/availability-dates";
import { cn } from "@/lib/utils";
import { useHolidaySettingsStore } from "@/store/holiday-settings-store";

/**
 * Settings → Workspace → Holidays. Each US federal holiday is a day off unless
 * an admin marks it as a working day. Managers see the list read-only, like
 * the hourly rates. The change reaches capacity, timelines, the planner and the
 * calendar through `lib/calendar/us-holidays`.
 */
export function HolidaysCard() {
  const { canEditHourlyRates: isAdmin } = usePermissions();
  const working = useHolidaySettingsStore((s) => s.working);
  const loaded = useHolidaySettingsStore((s) => s.loaded);
  const error = useHolidaySettingsStore((s) => s.error);
  const setWorking = useHolidaySettingsStore((s) => s.setWorking);

  // The next date each holiday is observed, so "Columbus Day" reads as a day.
  const [today] = React.useState(() => format(new Date(), "yyyy-MM-dd"));
  const nextDate = React.useMemo(() => {
    const year = Number(today.slice(0, 4));
    const upcoming = [...federalHolidaysForYear(year), ...federalHolidaysForYear(year + 1)]
      .filter((h) => h.date >= today);
    const map = new Map<string, string>();
    for (const h of upcoming) if (!map.has(h.name)) map.set(h.name, h.date);
    return map;
  }, [today]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Holidays</CardTitle>
        <CardDescription>
          US federal holidays are days off unless marked as working days. A day
          off comes out of everyone&apos;s capacity and pushes timelines past it.
        </CardDescription>
        <CardAction>
          <AppHelp section="settings.holidays" />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!loaded ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-md" />
            ))}
          </div>
        ) : (
          <>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {`Couldn't load holiday settings, so every holiday counts as a day off: ${error}`}
              </p>
            ) : null}
            <ul className="divide-y rounded-lg border">
              {FEDERAL_HOLIDAY_NAMES.map((name) => {
                const isWorking = working.includes(name);
                const date = nextDate.get(name);
                return (
                  <li key={name} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{name}</p>
                      {date ? (
                        <p className="text-xs text-muted-foreground">
                          {`Next: ${format(parseYmdLocal(date), "EEE, MMM d, yyyy")}`}
                        </p>
                      ) : null}
                    </div>
                    {isAdmin ? (
                      <div
                        role="group"
                        aria-label={`${name}: day off or working day`}
                        className="inline-flex rounded-lg border border-border/70 bg-muted/40 p-0.5"
                      >
                        {[
                          { label: "Day off", value: false },
                          { label: "Working", value: true },
                        ].map((opt) => {
                          const active = isWorking === opt.value;
                          return (
                            <button
                              key={opt.label}
                              type="button"
                              aria-pressed={active}
                              onClick={() => {
                                if (!active) void setWorking(name, opt.value);
                              }}
                              className={cn(
                                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                                active
                                  ? "bg-background text-foreground shadow-sm"
                                  : "text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <span className={cn("text-xs font-medium", isWorking ? "text-foreground" : "text-muted-foreground")}>
                        {isWorking ? "Working day" : "Day off"}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {!isAdmin ? (
              <p className="text-xs text-muted-foreground">Only admins can change holidays.</p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
