import type { Metadata } from "next";

import { GanttClient } from "@/components/features/gantt/GanttClient";

export const metadata: Metadata = {
  title: "Timeline",
  description: "Read-only Gantt-style schedule of tasks across projects.",
};

export default function GanttPage() {
  return <GanttClient />;
}
