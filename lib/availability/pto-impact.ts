/**
 * What an absence would do to work that is already scheduled.
 *
 * Pure — the caller passes store snapshots, so the approval dialog, the
 * confirm step and the tests all reason about the same object. Nothing here
 * writes; `reschedulePatches()` returns what WOULD change and a human confirms
 * it, the same preview→confirm shape as Start project, Sync schedule and
 * Create PO.
 */
import { addBusinessDays, differenceInCalendarDays, format, parseISO } from "date-fns";

import { skillTiers } from "@/lib/assignment/plan";
import { isUsHoliday } from "@/lib/calendar/us-holidays";
import { addWorkingDays } from "@/lib/discovery/team-calendar";
import { phaseIdFromLabel } from "@/lib/discovery/from-line-items";
import type { ProposalPlatform } from "@/lib/proposal-catalog";
import { eachYmdInInclusiveRange } from "@/lib/utils/availability-dates";
import { countsAgainstCapacity } from "@/lib/constants/workload";
import type { AvailabilityEntry } from "@/types/availability.types";
import type { Sprint } from "@/types/sprint.types";
import type { Task } from "@/types/task.types";

export interface CoverCandidate {
  id: string;
  name: string;
  /** 1–5 from `member_skills`, or 0 when they are simply free rather than skilled. */
  confidence: number;
  /** The skill that matched, when one did. */
  skill: string | null;
  /** Already on this task and accepted — the strongest kind of cover. */
  alreadyOnTask: boolean;
}

export interface AffectedTask {
  task: Task;
  /** Someone else is already an accepted assignee, so the work is not stranded. */
  hasCover: boolean;
  /** Best few alternatives, strongest first. Empty = nobody obvious. */
  cover: CoverCandidate[];
  /** Business days this task's due date would move by. */
  slipDays: number;
  /** What the due date would become. */
  suggestedDue: string;
}

export interface SprintAtRisk {
  sprint: Sprint;
  currentEnd: string;
  /** Latest suggested due date among this sprint's affected tasks. */
  suggestedEnd: string;
}

export interface PtoImpact {
  /** Mon–Fri days inside the absence — the real cost of it. */
  workdaysLost: number;
  affected: AffectedTask[];
  sprintsAtRisk: SprintAtRisk[];
  /** Affected tasks with nobody else accepted on them. */
  uncoveredCount: number;
}

export interface ImpactInput {
  entry: Pick<AvailabilityEntry, "user_id" | "start_date" | "end_date" | "kind">;
  tasks: Task[];
  sprints: Sprint[];
  members: { id: string; name: string; deactivated_at?: string | null }[];
  /** profile id → their skills. Used to suggest cover, never to assign it. */
  skills: Record<string, { skill: string; confidence: number }[]>;
  /** Everyone's entries, so a suggested stand-in is not themselves away. */
  availability: AvailabilityEntry[];
  /** Drives the skill matcher's platform fallback. */
  platform?: ProposalPlatform;
}

const isWeekday = (ymd: string): boolean => {
  const d = parseISO(ymd).getDay();
  return d !== 0 && d !== 6;
};

/**
 * Mon–Fri days in the absence, minus any US holiday.
 *
 * A week off over Thanksgiving costs four working days, not five — the office
 * was shut on the Thursday regardless, so charging the person for it would
 * overstate what their leave actually costs the plan.
 */
export function workdaysInRange(start: string, end: string): number {
  return eachYmdInInclusiveRange(start, end).filter(
    (d) => isWeekday(d) && !isUsHoliday(d),
  ).length;
}

/**
 * Tasks this absence actually threatens.
 *
 * A task is at risk when its owner is away and its due date falls inside the
 * absence. Deliberately narrow: counting everything they will ever own would
 * make every request look catastrophic, and the point of this screen is to let
 * an approver say yes quickly when it is fine.
 */
export function ptoImpact(input: ImpactInput): PtoImpact {
  const { entry, tasks, sprints, members, skills, availability, platform } = input;
  const workdaysLost = workdaysInRange(entry.start_date, entry.end_date);
  const absenceDays = new Set(
    eachYmdInInclusiveRange(entry.start_date, entry.end_date),
  );

  // Who else is away over the same window — they cannot be the cover.
  const alsoAway = new Set<string>();
  for (const a of availability) {
    if (a.user_id === entry.user_id) continue;
    if (!countsAgainstCapacity(a)) continue;
    if (a.start_date > entry.end_date || a.end_date < entry.start_date) continue;
    alsoAway.add(a.user_id);
  }

  const affected: AffectedTask[] = [];
  for (const t of tasks) {
    if (t.status === "done" || !t.due_date) continue;
    const mine = t.assignees.find((a) => a.profile_id === entry.user_id);
    if (!mine || (mine.status !== "accepted" && mine.status !== "pending")) continue;
    if (!absenceDays.has(t.due_date)) continue;

    const others = t.assignees.filter(
      (a) => a.profile_id !== entry.user_id && a.status === "accepted",
    );
    const hasCover = others.length > 0;
    const slipDays = slipFor(t.due_date, entry.end_date);

    affected.push({
      task: t,
      hasCover,
      cover: coverFor(t, {
        others,
        members,
        skills,
        alsoAway,
        excludeId: entry.user_id,
        platform,
      }),
      slipDays,
      // ⚠️ `addWorkingDays`, not `addBusinessDays`: the latter only avoids
      // weekends, so a task pushed past an absence could be handed a due date on
      // Christmas Day — a deadline nobody can meet, created by the very feature
      // meant to keep the plan honest.
      suggestedDue: format(
        addWorkingDays(parseISO(t.due_date), slipDays),
        "yyyy-MM-dd",
      ),
    });
  }

  // A sprint is at risk when one of its own tasks would now finish after it ends.
  const sprintsAtRisk: SprintAtRisk[] = [];
  for (const s of sprints) {
    const mine = affected.filter((a) => a.task.sprint_id === s.id);
    if (!mine.length) continue;
    let latest = s.end_date;
    for (const a of mine) if (a.suggestedDue > latest) latest = a.suggestedDue;
    if (latest > s.end_date) {
      sprintsAtRisk.push({ sprint: s, currentEnd: s.end_date, suggestedEnd: latest });
    }
  }

  return {
    workdaysLost,
    affected,
    sprintsAtRisk,
    uncoveredCount: affected.filter((a) => !a.hasCover).length,
  };
}

/**
 * How far past the absence a task has to move.
 *
 * Measured to the day AFTER the absence ends rather than by the number of
 * workdays lost: a task due on the first day of a five-day absence and one due
 * on the last day must both land clear of it, and shifting each by the same
 * five days would leave the first one still inside.
 */
function slipFor(dueYmd: string, absenceEnd: string): number {
  const due = parseISO(dueYmd);
  const back = parseISO(absenceEnd);
  const calendarGap = differenceInCalendarDays(back, due) + 1;
  // Convert to business days by walking forward until we clear the absence.
  let days = 1;
  while (days < 60 && addBusinessDays(due, days) <= back) days += 1;
  return calendarGap > 0 ? days : 0;
}

function coverFor(
  task: Task,
  opts: {
    others: { profile_id: string }[];
    members: { id: string; name: string; deactivated_at?: string | null }[];
    skills: Record<string, { skill: string; confidence: number }[]>;
    alsoAway: Set<string>;
    excludeId: string;
    platform?: ProposalPlatform;
  },
): CoverCandidate[] {
  const { others, members, skills, alsoAway, excludeId, platform } = opts;
  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  const out: CoverCandidate[] = [];

  // Anyone already accepted on the task is cover by definition — no guessing.
  for (const o of others) {
    out.push({
      id: o.profile_id,
      name: nameOf.get(o.profile_id) ?? "Someone",
      confidence: 0,
      skill: null,
      alreadyOnTask: true,
    });
  }

  // Otherwise fall back to the SAME skill matcher the assignment engine uses,
  // so a suggestion here and an auto-assignment there cannot disagree. A task
  // seeded from an estimate carries its phase label in `tags`; a hand-made one
  // has no phase, and then there is nothing honest to match on.
  const phase = task.tags.map(phaseIdFromLabel).find((p) => p != null) ?? null;
  if (phase) {
    const wanted = skillTiers(
      { id: task.id, title: task.title, phase, hours: task.estimated_hours ?? 0 },
      platform ?? "wordpress",
    ).flat();
    if (wanted.length) {
      const already = new Set(out.map((c) => c.id));
      for (const m of members) {
        if (m.id === excludeId || already.has(m.id)) continue;
        if (m.deactivated_at) continue;
        if (alsoAway.has(m.id)) continue;
        let best = 0;
        let bestSkill: string | null = null;
        for (const s of skills[m.id] ?? []) {
          if (!wanted.includes(s.skill.toLowerCase())) continue;
          if (s.confidence > best) {
            best = s.confidence;
            bestSkill = s.skill;
          }
        }
        if (best > 0) {
          out.push({
            id: m.id,
            name: m.name,
            confidence: best,
            skill: bestSkill,
            alreadyOnTask: false,
          });
        }
      }
    }
  }

  return out
    .sort(
      (a, b) =>
        Number(b.alreadyOnTask) - Number(a.alreadyOnTask) ||
        b.confidence - a.confidence ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 3);
}

/**
 * The writes an "Approve + reschedule" would make — nothing else.
 *
 * Returned rather than applied so the caller shows them, then persists exactly
 * what was shown. Recomputing at write time is how a preview and its result
 * come to disagree.
 */
export function reschedulePatches(impact: PtoImpact): {
  tasks: { id: string; due_date: string }[];
  sprints: { id: string; end_date: string }[];
} {
  return {
    tasks: impact.affected.map((a) => ({
      id: a.task.id,
      due_date: a.suggestedDue,
    })),
    sprints: impact.sprintsAtRisk.map((s) => ({
      id: s.sprint.id,
      end_date: s.suggestedEnd,
    })),
  };
}
