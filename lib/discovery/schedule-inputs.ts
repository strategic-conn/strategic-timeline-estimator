import { DEFAULT_CLIENT_REVIEW_DAYS } from "@/lib/assignment/plan";
import type { DiscoveryProject } from "@/types/discovery.types";
import type { ClientQuote } from "@/types/proposal.types";

/**
 * The schedule answers of an estimate: when it can start, the client's hard
 * deadline, how long each client review takes, and blackout periods.
 *
 * They used to be questionnaire section 7, so an estimate built from line items
 * alone (no questionnaire) always started "today" and could never be checked
 * against a deadline. Since 2026-11-12 they are set on the Adjust tab for every
 * estimate and stored on `schedule_plan`. A field never set there falls back to
 * the questionnaire's old answer, so existing estimates keep their dates.
 */
export type ScheduleInputs = {
  startDate: string; // YYYY-MM-DD, "" = today
  hardDeadline: string; // YYYY-MM-DD, "" = none
  reviewDays: number;
  blackout: boolean;
  blackoutNotes: string;
};

type Q = Pick<ClientQuote, "schedule_plan" | "discovery">;

export function scheduleInputsOf(quote: Q): ScheduleInputs {
  const sp = quote.schedule_plan ?? null;
  const d = quote.discovery ?? null;
  const own = sp?.review_days;
  const asked = d?.client_review_turnaround;
  return {
    startDate: sp?.start_date ?? d?.project_start_date ?? "",
    hardDeadline: sp?.hard_deadline ?? d?.hard_launch_date ?? "",
    reviewDays:
      typeof own === "number" && own >= 0
        ? own
        : typeof asked === "number" && asked >= 0
          ? asked
          : DEFAULT_CLIENT_REVIEW_DAYS,
    blackout: sp?.blackout ?? d?.has_blackout_periods ?? false,
    blackoutNotes: sp?.blackout_notes ?? d?.blackout_notes ?? "",
  };
}

/**
 * `p` with the estimate's schedule answers written into the fields the engine
 * reads (`computeTimeline`, `computeRisk`) — the one way those answers reach a
 * timeline, guided or not.
 */
export function withScheduleInputs(p: DiscoveryProject, quote: Q): DiscoveryProject {
  const s = scheduleInputsOf(quote);
  return {
    ...p,
    project_start_date: s.startDate,
    hard_launch_date: s.hardDeadline,
    client_review_turnaround: s.reviewDays,
    has_blackout_periods: s.blackout,
    blackout_notes: s.blackoutNotes,
  };
}
