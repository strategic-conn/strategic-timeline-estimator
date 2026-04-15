import type { Metadata } from "next";

import { ReportsClient } from "./reports-client";

export const metadata: Metadata = {
  title: "Reports",
  description: "Workspace stats, progress, and team workload.",
};

export default function ReportsPage() {
  return <ReportsClient />;
}
