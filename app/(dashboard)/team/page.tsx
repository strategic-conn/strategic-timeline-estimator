import type { Metadata } from "next";

import { TeamClientPage } from "./team-client";

export const metadata: Metadata = {
  title: "Team & access",
  description: "Invite-only registration, roles, and permissions.",
};

export default function TeamPage() {
  return <TeamClientPage />;
}
