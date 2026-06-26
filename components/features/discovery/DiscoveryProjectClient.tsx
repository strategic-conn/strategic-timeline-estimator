"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { DiscoveryGantt } from "@/components/features/discovery/DiscoveryGantt";
import { DiscoveryHoursBreakdown } from "@/components/features/discovery/DiscoveryHoursBreakdown";
import { DiscoveryRiskBadge } from "@/components/features/discovery/DiscoveryRiskBadge";
import { DiscoveryTracker } from "@/components/features/discovery/DiscoveryTracker";
import { DiscoveryWizard } from "@/components/features/discovery/DiscoveryWizard";
import { WorkspacePageHeader } from "@/components/layouts/workspace-page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/hooks/usePermissions";
import { analyzeDiscovery, formatHours } from "@/lib/discovery";
import { proposalDraftFromDiscovery } from "@/lib/discovery/to-proposal";
import { useDiscoveryStore } from "@/store/discovery-store";
import { useProposalEstimatorStore } from "@/store/proposal-estimator-store";
import type { DiscoveryFieldId } from "@/lib/discovery/questions";
import type { DiscoveryProject } from "@/types/discovery.types";

export function DiscoveryProjectClient({ projectId }: { projectId: string }) {
  const { canExportProposals } = usePermissions();
  const router = useRouter();

  const project = useDiscoveryStore((s) =>
    s.projects.find((p) => p.id === projectId),
  );
  const updateProject = useDiscoveryStore((s) => s.updateProject);
  const createProposalFromDraft = useProposalEstimatorStore(
    (s) => s.createProposalFromDraft,
  );

  const [hydrated, setHydrated] = React.useState(() =>
    useDiscoveryStore.persist.hasHydrated(),
  );
  const [tab, setTab] = React.useState("discovery");
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    if (useDiscoveryStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    const unsub = useDiscoveryStore.persist.onFinishHydration(() =>
      setHydrated(true),
    );
    return unsub;
  }, []);

  React.useEffect(() => {
    if (hydrated && !project) router.replace("/discovery");
  }, [hydrated, project, router]);

  const result = React.useMemo(
    () => (project ? analyzeDiscovery(project) : null),
    [project],
  );

  if (!canExportProposals) return <DiscoveryAccessDenied />;

  if (!hydrated || !project || !result) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
    );
  }

  const handleChange = (
    id: DiscoveryFieldId,
    value: string | number | boolean | null,
  ) => {
    updateProject(projectId, { [id]: value } as Partial<DiscoveryProject>);
  };

  const handleCreateProposal = () => {
    setCreating(true);
    try {
      const draft = proposalDraftFromDiscovery(project, result);
      const id = createProposalFromDraft(draft);
      toast.success("Proposal created from discovery estimate");
      router.push(`/proposals/${id}`);
    } catch {
      setCreating(false);
      toast.error("Could not create the proposal");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <Button variant="ghost" size="sm" className="w-fit gap-2 px-0" asChild>
        <Link href="/discovery">
          <ArrowLeft className="size-4" aria-hidden />
          All discoveries
        </Link>
      </Button>

      <WorkspacePageHeader
        eyebrow="Discovery estimator"
        title={<span className="wrap-break-word">{project.name || "Untitled discovery"}</span>}
        description={[
          project.client_name ? `Client: ${project.client_name}` : null,
          `${formatHours(result.estimate.total.min)}–${formatHours(result.estimate.total.max)} hrs`,
          `~${result.timeline.totalWeeks} weeks`,
          `Launch ${result.timeline.launchDate}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        meta={<DiscoveryRiskBadge level={result.risk.level} score={result.risk.score} />}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleCreateProposal}
            disabled={creating}
          >
            {creating ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <FileText className="size-4" aria-hidden />
            )}
            Create proposal
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="gap-5">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="discovery">Discovery</TabsTrigger>
          <TabsTrigger value="hours">Hours</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="tracker">Tracker</TabsTrigger>
        </TabsList>

        <TabsContent value="discovery">
          <DiscoveryWizard
            project={project}
            onChange={handleChange}
            onViewEstimate={() => setTab("hours")}
          />
        </TabsContent>
        <TabsContent value="hours">
          <DiscoveryHoursBreakdown result={result} />
        </TabsContent>
        <TabsContent value="timeline">
          <DiscoveryGantt result={result} project={project} />
        </TabsContent>
        <TabsContent value="tracker">
          <DiscoveryTracker projectId={projectId} result={result} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DiscoveryAccessDenied() {
  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader className="text-center">
        <CardTitle>Discovery Estimator is restricted</CardTitle>
        <CardDescription className="text-balance">
          Scoping and estimates are available to admins and managers only.
        </CardDescription>
      </CardHeader>
      <CardFooter className="justify-center border-t pt-0">
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
