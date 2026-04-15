import type { Metadata } from "next";

import { ProposalEditorClient } from "@/components/features/proposals/ProposalEditorClient";

export const metadata: Metadata = {
  title: "Quote",
  description: "Edit proposal line items and preview.",
};

type ProposalDetailPageProps = {
  params: Promise<{ proposalId: string }>;
};

export default async function ProposalDetailPage({
  params,
}: ProposalDetailPageProps) {
  const { proposalId } = await params;
  return <ProposalEditorClient proposalId={proposalId} />;
}
