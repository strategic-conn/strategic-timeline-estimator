"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/usePermissions";
import {
  formatRate,
  rateFor,
  rateKey,
  sortRates,
  validateRateDraft,
  type RateDraft,
} from "@/lib/pricing/hourly-rates";
import { cn } from "@/lib/utils";
import { useHourlyRatesStore } from "@/store/hourly-rates-store";
import { useTeamStore } from "@/store/team-store";
import { tourAnchor } from "@/lib/tours/ids";

/**
 * Settings → Workspace → Hourly rates.
 *
 * Admin edits, manager reads (they quote from these), everyone else never
 * mounts this — the page gates on `canViewHourlyRates`, and RLS returns no rows
 * to them anyway. One Save for the whole table, so the "Level 2 must not be
 * below Level 1" check can see both levels of a role at once.
 */
export function HourlyRatesCard() {
  const { canEditHourlyRates } = usePermissions();
  const rates = useHourlyRatesStore((s) => s.rates);
  const loaded = useHourlyRatesStore((s) => s.loaded);
  const error = useHourlyRatesStore((s) => s.error);
  const saveRates = useHourlyRatesStore((s) => s.saveRates);
  const members = useTeamStore((s) => s.members);

  const sorted = React.useMemo(() => sortRates(rates), [rates]);
  const roles = React.useMemo(
    () => [...new Set(sorted.map((r) => r.responsible))],
    [sorted],
  );

  const baseline = React.useMemo(() => {
    const d: RateDraft = {};
    for (const r of sorted) d[rateKey(r.responsible, r.level)] = String(r.rate);
    return d;
  }, [sorted]);

  const [draft, setDraft] = React.useState<RateDraft>(baseline);
  const [saving, setSaving] = React.useState(false);
  const dirty = Object.keys(baseline).some((k) => draft[k] !== baseline[k]);

  // Take in rates that change elsewhere (another admin, realtime) — but never
  // under someone mid-edit: overwriting typed values would lose their work.
  const [seen, setSeen] = React.useState(baseline);
  if (seen !== baseline) {
    setSeen(baseline);
    if (!dirty) setDraft(baseline);
  }

  const { errors, parsed } = React.useMemo(
    () => validateRateDraft(roles, draft),
    [roles, draft],
  );

  const lastChange = React.useMemo(() => {
    const stamped = sorted.filter((r) => r.updated_at && r.updated_by);
    if (!stamped.length) return null;
    const latest = stamped.reduce((a, b) =>
      (a.updated_at ?? "") > (b.updated_at ?? "") ? a : b,
    );
    const who =
      members.find((m) => m.id === latest.updated_by)?.name?.trim() ||
      "An admin";
    return `${who} · ${format(parseISO(latest.updated_at!), "MMM d, yyyy 'at' h:mm a")}`;
  }, [sorted, members]);

  const onSave = async () => {
    if (!parsed) return;
    const changes = sorted
      .filter((r) => parsed[rateKey(r.responsible, r.level)] !== r.rate)
      .map((r) => ({
        responsible: r.responsible,
        level: r.level,
        rate: parsed[rateKey(r.responsible, r.level)],
      }));
    setSaving(true);
    const ok = await saveRates(changes);
    setSaving(false);
    if (ok) toast.success("Hourly rates saved");
  };

  return (
    <Card {...tourAnchor("settings.rates")}>
      <CardHeader>
        <CardTitle>Hourly rates</CardTitle>
        <CardDescription>
          What each role costs per hour. Level 1 is standard build and config
          work; Level 2 is senior, custom-coded or higher-risk work and should
          not be priced below Level 1.
        </CardDescription>
        <p className="text-xs text-muted-foreground">
          New estimate lines are priced at these rates. Each line keeps the rate
          it was added at, so changing a rate here never reprices an existing
          quote — an estimate can be moved to today&apos;s rates from its Adjust
          tab, with a preview first.
        </p>
      </CardHeader>

      <CardContent>
        {error ? (
          <p className="text-sm text-destructive">
            Couldn&apos;t load hourly rates: {error}
          </p>
        ) : !loaded ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !roles.length ? (
          <p className="text-sm text-muted-foreground">
            No hourly rates are configured.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Role</th>
                  <th className="py-2 pr-3 font-medium">Level 1</th>
                  <th className="py-2 font-medium">Level 2</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role} className="border-b last:border-0 align-top">
                    <td className="py-2.5 pr-3 font-medium">{role}</td>
                    {([1, 2] as const).map((level) => {
                      const key = rateKey(role, level);
                      const err = errors[key];
                      return (
                        <td
                          key={level}
                          className={cn("py-2", level === 1 && "pr-3")}
                        >
                          {canEditHourlyRates ? (
                            <>
                              <div className="relative w-24 sm:w-28">
                                <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-muted-foreground">
                                  $
                                </span>
                                <Input
                                  inputMode="decimal"
                                  aria-label={`${role} Level ${level} hourly rate`}
                                  aria-invalid={err ? true : undefined}
                                  value={draft[key] ?? ""}
                                  onChange={(e) =>
                                    setDraft((d) => ({
                                      ...d,
                                      [key]: e.target.value,
                                    }))
                                  }
                                  className="pl-6 tabular-nums"
                                  disabled={saving}
                                />
                              </div>
                              {err ? (
                                <p className="mt-1 max-w-[9rem] text-xs text-destructive">
                                  {err}
                                </p>
                              ) : null}
                            </>
                          ) : (
                            <span className="tabular-nums">
                              {(() => {
                                const r = rateFor(sorted, role, level);
                                return r === null ? "—" : `${formatRate(r)}/h`;
                              })()}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {loaded && !error && roles.length ? (
        <CardFooter className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {lastChange
              ? `Last changed by ${lastChange}`
              : "Seeded from the pricing workbook."}
            {canEditHourlyRates ? null : " Only admins can change rates."}
          </p>
          {canEditHourlyRates ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!dirty || saving}
                onClick={() => setDraft(baseline)}
              >
                Reset
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!dirty || !parsed || saving}
                onClick={onSave}
              >
                {saving ? "Saving…" : "Save rates"}
              </Button>
            </div>
          ) : null}
        </CardFooter>
      ) : null}
    </Card>
  );
}
