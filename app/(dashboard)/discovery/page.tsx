import type { Metadata } from "next";

import { DiscoveryDashboardClient } from "@/components/features/discovery/DiscoveryDashboardClient";

export const metadata: Metadata = {
  title: "Discovery Estimator",
  description: "Scope projects into hours estimates, timelines, and risk scores.",
};

export default function DiscoveryPage() {
  return <DiscoveryDashboardClient />;
}
