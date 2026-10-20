"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { useHolidaySettingsStore } from "@/store/holiday-settings-store";

/**
 * Redraws the page when the company's worked holidays change.
 *
 * Holidays feed figures computed inside memos all over the app (capacity,
 * timelines, the planner, velocity), none of which list the holiday setting as
 * an input — it lives in `lib/calendar/us-holidays`. Re-mounting the page is
 * the one place that guarantees every one of them recomputes. It only happens
 * when the set actually changes: once at load if the workspace has worked
 * holidays (before anyone is typing), and when an admin saves one.
 *
 * Settings is left alone: it is where the change is made, shows no holiday-
 * dependent figures, and re-mounting it would reset the open tab.
 */
export function HolidayRefresh({ children }: { children: React.ReactNode }) {
  const working = useHolidaySettingsStore((s) => s.working.join("|"));
  const pathname = usePathname();
  const key = pathname.startsWith("/settings") ? "settings" : working;
  return <React.Fragment key={key}>{children}</React.Fragment>;
}
