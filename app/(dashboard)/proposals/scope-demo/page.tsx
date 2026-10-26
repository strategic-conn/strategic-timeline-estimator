import type { Metadata } from "next";

import { ScopeDraftDemo } from "@/components/features/proposals/ScopeDraftDemo";

export const metadata: Metadata = {
  title: "Draft from scope (demo)",
  description: "Demo UI only — a preview of drafting estimate lines from a client's scope.",
};

export default function ScopeDemoPage() {
  return <ScopeDraftDemo />;
}
