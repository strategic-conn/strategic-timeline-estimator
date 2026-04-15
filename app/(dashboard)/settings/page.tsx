import type { Metadata } from "next";

import { SettingsClient } from "./settings-client";

export const metadata: Metadata = {
  title: "Settings",
  description: "Profile, workspace, and security preferences.",
};

export default function SettingsPage() {
  return <SettingsClient />;
}
