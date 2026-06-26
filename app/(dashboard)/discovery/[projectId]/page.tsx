import type { Metadata } from "next";

import { DiscoveryProjectClient } from "@/components/features/discovery/DiscoveryProjectClient";

export const metadata: Metadata = {
  title: "Discovery",
  description: "Discovery wizard, hours breakdown, timeline, and tracker.",
};

type DiscoveryDetailPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function DiscoveryDetailPage({
  params,
}: DiscoveryDetailPageProps) {
  const { projectId } = await params;
  return <DiscoveryProjectClient projectId={projectId} />;
}
