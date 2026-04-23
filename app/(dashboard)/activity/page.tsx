import type { Metadata } from "next";

import { ActivityFeedClient } from "@/components/features/activity/ActivityFeedClient";

export const metadata: Metadata = {
  title: "Activity",
  description: "Workspace activity and notifications.",
};

export default function ActivityPage() {
  return <ActivityFeedClient />;
}
