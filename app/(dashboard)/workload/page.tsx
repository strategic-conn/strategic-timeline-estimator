import type { Metadata } from "next";

import { WorkloadClient } from "@/components/features/workload/WorkloadClient";

export const metadata: Metadata = {
  title: "Resource allocation",
  description: "Team workload and estimated hours vs capacity reference.",
};

export default function WorkloadPage() {
  return <WorkloadClient />;
}
