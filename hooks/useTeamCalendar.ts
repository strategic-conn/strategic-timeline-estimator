"use client";

import { useMemo } from "react";

import {
  buildTeamCalendar,
  type TeamCalendar,
} from "@/lib/discovery/team-calendar";
import { useAvailabilityStore } from "@/store/availability-store";
import { useTeamStore } from "@/store/team-store";

/**
 * The team's booked time off, shaped for the timeline engine.
 *
 * ⚠️ Memoised on the two store slices, so its identity is stable between
 * renders. `estimateDateRange` and friends are called inside `useMemo`s that
 * take this as a dependency — a fresh object every render would re-run them
 * constantly, and in `CreatePoDialog` that is exactly the shape of bug that
 * once silently reset dates a coordinator had typed.
 */
export function useTeamCalendar(): TeamCalendar | null {
  const members = useTeamStore((s) => s.members);
  const entries = useAvailabilityStore((s) => s.entries);
  return useMemo(() => buildTeamCalendar(members, entries), [members, entries]);
}

/**
 * The same thing outside React, for stores that read snapshots rather than
 * subscribe (`phaseScaffold`, `regenerateLineItems`) — the pattern
 * `currentRoster()` already uses in the estimator store.
 */
export function currentTeamCalendar(): TeamCalendar | null {
  return buildTeamCalendar(
    useTeamStore.getState().members,
    useAvailabilityStore.getState().entries,
  );
}
