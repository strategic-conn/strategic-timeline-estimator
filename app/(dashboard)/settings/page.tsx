import type { Metadata } from "next";

import { SettingsClient } from "./settings-client";

export const metadata: Metadata = {
  title: "Settings",
  description: "Profile, workspace, and security preferences.",
};

/**
 * The tab comes from the page's own searchParams, not `window.location`: on a
 * client-side navigation (the checklist's "Show me") the address bar hasn't
 * updated yet when the client first renders, so it read the OLD url and
 * always opened Profile — and the server/client mismatch broke hydration.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // Land on Workspace after the Zoho OAuth redirect (?zoho=...).
  const tab = params.zoho != null ? "workspace" : params.tab;
  return <SettingsClient requestedTab={typeof tab === "string" ? tab : undefined} />;
}
