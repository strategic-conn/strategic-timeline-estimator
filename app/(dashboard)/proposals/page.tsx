import type { Metadata } from "next";

import { ProposalsListClient } from "@/components/features/proposals/ProposalsListClient";

export const metadata: Metadata = {
  title: "Proposals",
  description: "Client quotes and hour estimates.",
};

export default function ProposalsPage() {
  return <ProposalsListClient />;
}
