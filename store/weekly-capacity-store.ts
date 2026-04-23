"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEFAULT_WEEKLY_CAPACITY_HOURS } from "@/lib/constants/workload";

const MIN_H = 1;
const MAX_H = 168;

function clampHours(h: number): number {
  if (!Number.isFinite(h)) return DEFAULT_WEEKLY_CAPACITY_HOURS;
  return Math.min(MAX_H, Math.max(MIN_H, Math.round(h)));
}

/** Pure read for selectors / memo (same rules as store). */
export function getEffectiveWeeklyHours(
  overrides: Record<string, number>,
  memberId: number
): number {
  const raw = overrides[String(memberId)];
  if (raw != null && Number.isFinite(raw) && raw > 0) {
    return clampHours(raw);
  }
  return DEFAULT_WEEKLY_CAPACITY_HOURS;
}

type WeeklyCapacityState = {
  /** Keyed by team member id string for stable JSON persist. */
  overrides: Record<string, number>;
  setWeeklyHours: (memberId: number, hours: number) => void;
  getWeeklyHours: (memberId: number) => number;
};

export const useWeeklyCapacityStore = create<WeeklyCapacityState>()(
  persist(
    (set, get) => ({
      overrides: {},
      setWeeklyHours: (memberId, hours) =>
        set((s) => ({
          overrides: {
            ...s.overrides,
            [String(memberId)]: clampHours(hours),
          },
        })),
      getWeeklyHours: (memberId) =>
        getEffectiveWeeklyHours(get().overrides, memberId),
    }),
    {
      name: "timeline-weekly-capacity",
      version: 1,
    }
  )
);
