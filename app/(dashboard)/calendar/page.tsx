import type { Metadata } from "next";

import { CalendarClient } from "./calendar-client";

export const metadata: Metadata = {
  title: "Calendar",
  description: "Task deadlines and sprint milestones at a glance.",
};

export default function CalendarPage() {
  return <CalendarClient />;
}
