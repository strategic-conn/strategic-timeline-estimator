"use client";

import { cn } from "@/lib/utils";
import { parseRateKey, rateKey, RESPONSIBLE_ROLES } from "@/lib/pricing/hourly-rates";
import { useTeamStore } from "@/store/team-store";

/** "IT|Level 2" keys → "IT L2 · QA Tester L1", or "" for none. */
export function formatWorkKeys(keys: string[] | undefined): string {
  return (keys ?? [])
    .map(parseRateKey)
    .filter((k) => k != null)
    .map((k) => `${k.responsible} L${k.level}`)
    .join(" · ");
}

const LEVELS = [0, 1, 2] as const;

/**
 * Which disciplines a person does, and at what level — the workbook's lookup
 * keys (pricing plan Phase 4). One level per discipline: Level 2 already covers
 * Level 1 work, so holding both would say nothing more.
 *
 * Admin-only to change (0043's guard refuses anyone else); everyone else sees
 * the keys read-only.
 */
export function WorkKeysEditor({
  profileId,
  editable,
}: {
  profileId: string;
  editable: boolean;
}) {
  const keys = useTeamStore(
    (s) => s.members.find((m) => m.id === profileId)?.work_keys,
  );
  const setWorkKeys = useTeamStore((s) => s.setWorkKeys);
  const parsed = (keys ?? []).map(parseRateKey);
  const levelOf = (role: string) =>
    parsed.find((k) => k?.responsible === role)?.level ?? 0;

  const choose = (role: string, level: 0 | 1 | 2) => {
    // Keep keys for roles this screen doesn't list (a role renamed in the rates
    // table) rather than silently deleting them.
    const next = (keys ?? []).filter((k) => parseRateKey(k)?.responsible !== role);
    if (level) next.push(rateKey(role, level));
    setWorkKeys(profileId, next);
  };

  if (!editable) {
    const text = formatWorkKeys(keys);
    return (
      <p className="text-sm text-muted-foreground">
        {text || "No work keys set."}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-lg border">
      {RESPONSIBLE_ROLES.map((role) => {
        const current = levelOf(role);
        return (
          <li
            key={role}
            className="flex items-center justify-between gap-3 px-3 py-1.5"
          >
            <span className="min-w-0 truncate text-sm">{role}</span>
            <div
              role="radiogroup"
              aria-label={`${role} level`}
              className="flex shrink-0 overflow-hidden rounded-md border"
            >
              {LEVELS.map((lv) => (
                <button
                  key={lv}
                  type="button"
                  role="radio"
                  aria-checked={current === lv}
                  onClick={() => choose(role, lv)}
                  className={cn(
                    "px-2.5 py-1 text-xs transition-colors",
                    lv > 0 && "border-l",
                    current === lv
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  {lv === 0 ? "None" : `L${lv}`}
                </button>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
