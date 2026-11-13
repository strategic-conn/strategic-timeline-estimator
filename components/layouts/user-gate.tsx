"use client";

import DashboardLoading from "@/app/(dashboard)/loading";
import { useUserResolved } from "@/store/auth-store";

/**
 * Pages wait for the signed-in person. Until their profile loads, the store
 * holds a placeholder (no name, viewer rights), and every page would render
 * against it: "Welcome back, …" with the wrong name, an Estimator "no access"
 * screen for a manager, a Settings / Workload tab picked for the wrong role.
 */
export function UserGate({ children }: { children: React.ReactNode }) {
  return useUserResolved() ? children : <DashboardLoading />;
}
