/**
 * Build the assignment engine's dev roster from workspace data. Pure — the
 * caller passes plain snapshots from the stores (team, member_skills,
 * weekly_capacity, availability), so this stays testable and store-agnostic.
 */
import { countsAgainstCapacity } from "@/lib/constants/workload";
import type { PlanDev } from "./plan";

export interface RosterMember {
  id: string;
  name: string;
  /** Offboarded members are excluded. */
  deactivated?: boolean;
}

export interface RosterInput {
  members: RosterMember[];
  /** profile_id → their skills (skill name + 1–5 confidence). */
  skillsByProfile: Record<string, { skill: string; confidence: number }[]>;
  /** profile_id → weekly hours override. */
  weeklyHours: Record<string, number>;
  defaultWeeklyHours: number;
  /** profile_id → ISO days off. */
  ptoByProfile: Record<string, string[]>;
}

/**
 * One PlanDev per active member WITH at least one skill (a person with no
 * skills can't be skill-matched, so they're not part of auto-assignment).
 * Hours/day = weekly ÷ 5 working days.
 */
export function buildRoster(input: RosterInput): PlanDev[] {
  return input.members
    .filter((m) => !m.deactivated)
    .map((m) => {
      const skills: Record<string, number> = {};
      for (const s of input.skillsByProfile[m.id] ?? []) {
        skills[s.skill] = s.confidence;
      }
      const weekly = input.weeklyHours[m.id] ?? input.defaultWeeklyHours;
      return {
        id: m.id,
        name: m.name,
        skills,
        hoursPerDay: Math.max(1, Math.round((weekly / 5) * 10) / 10),
        ptoDays: input.ptoByProfile[m.id] ?? [],
      } satisfies PlanDev;
    })
    .filter((d) => Object.keys(d.skills).length > 0);
}

/**
 * Expand PTO / unavailable entries into a profile_id → ISO-days-off map.
 * "partial" days are treated as working (reduced-hours modelling is out of scope
 * for v1). Guards against reversed/oversized ranges (caps at 366 days).
 */
export function ptoDaysByProfile(
  entries: {
    user_id: string;
    start_date: string;
    end_date: string;
    kind: string;
    status?: string;
  }[],
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const e of entries) {
    if (e.kind !== "pto" && e.kind !== "unavailable") continue;
    // Planning around leave nobody has granted would move real work for a
    // request that may yet be refused (migration 0034).
    if (!countsAgainstCapacity(e)) continue;
    const days = (map[e.user_id] ??= []);
    let d = new Date(`${e.start_date}T00:00:00.000Z`);
    const end = new Date(`${e.end_date}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime()) || Number.isNaN(end.getTime())) continue;
    let guard = 0;
    while (d.getTime() <= end.getTime() && guard < 366) {
      days.push(d.toISOString().slice(0, 10));
      d = new Date(d.getTime() + 86_400_000);
      guard += 1;
    }
  }
  return map;
}
