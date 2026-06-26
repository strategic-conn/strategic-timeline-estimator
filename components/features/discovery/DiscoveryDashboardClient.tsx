"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Clock, Compass, Plus, Trash2 } from "lucide-react";

import { DiscoveryRiskBadge } from "@/components/features/discovery/DiscoveryRiskBadge";
import { WorkspacePageHeader } from "@/components/layouts/workspace-page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePermissions } from "@/hooks/usePermissions";
import { analyzeDiscovery, formatHours } from "@/lib/discovery";
import { useDiscoveryStore } from "@/store/discovery-store";
import type { DiscoveryProject } from "@/types/discovery.types";

export function DiscoveryDashboardClient() {
  const { canExportProposals } = usePermissions();
  const router = useRouter();

  const projects = useDiscoveryStore((s) => s.projects);
  const createProject = useDiscoveryStore((s) => s.createProject);
  const deleteProject = useDiscoveryStore((s) => s.deleteProject);

  const [hydrated, setHydrated] = React.useState(() =>
    useDiscoveryStore.persist.hasHydrated(),
  );
  const [deleteTarget, setDeleteTarget] =
    React.useState<DiscoveryProject | null>(null);

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

  const sorted = React.useMemo(
    () =>
      [...projects].sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      ),
    [projects],
  );

  if (!canExportProposals) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader className="text-center">
          <CardTitle>Discovery Estimator is restricted</CardTitle>
          <CardDescription className="text-balance">
            Scoping and estimates are available to admins and managers only.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const startNew = () => {
    const id = createProject();
    router.push(`/discovery/${id}`);
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <WorkspacePageHeader
        eyebrow="Discovery estimator"
        title="Discovery sessions"
        description="Turn a completed discovery checklist into a defensible hours estimate, timeline, and live tracker."
        actions={
          <Button type="button" size="sm" className="gap-1.5" onClick={startNew}>
            <Plus className="size-4" aria-hidden />
            New discovery
          </Button>
        }
      />

      {!hydrated ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : sorted.length === 0 ? (
        <Card>
          <CardHeader className="items-center text-center">
            <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-full bg-muted">
              <Compass className="size-7 text-muted-foreground" aria-hidden />
            </div>
            <CardTitle>No discovery sessions yet</CardTitle>
            <CardDescription className="text-balance">
              Start a discovery to scope a project into Min/Mid/Max hours, a
              phased timeline, and a risk score.
            </CardDescription>
            <Button type="button" className="mt-3 gap-1.5" onClick={startNew}>
              <Plus className="size-4" aria-hidden />
              New discovery
            </Button>
          </CardHeader>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {sorted.map((project) => (
            <DiscoveryCard
              key={project.id}
              project={project}
              onDelete={() => setDeleteTarget(project)}
            />
          ))}
        </ul>
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this discovery?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name || "This discovery session"} and its tracker
              progress will be permanently removed. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) deleteProject(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DiscoveryCard({
  project,
  onDelete,
}: {
  project: DiscoveryProject;
  onDelete: () => void;
}) {
  const result = React.useMemo(() => analyzeDiscovery(project), [project]);
  const { estimate, timeline, risk } = result;

  return (
    <li>
      <Card className="h-full transition-colors hover:bg-muted/30">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">
              <Link
                href={`/discovery/${project.id}`}
                className="underline-offset-4 hover:underline"
              >
                {project.name || "Untitled discovery"}
              </Link>
            </CardTitle>
            {project.client_name ? (
              <CardDescription>{project.client_name}</CardDescription>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            aria-label="Delete discovery"
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pb-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="flex items-center gap-1.5">
              <Clock className="size-4 text-muted-foreground" aria-hidden />
              <span className="font-medium tabular-nums">
                {formatHours(estimate.total.min)}–{formatHours(estimate.total.max)} hrs
              </span>
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <CalendarClock className="size-4" aria-hidden />
              <span className="tabular-nums">~{timeline.totalWeeks} wks</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Launch {timeline.launchDate}
            </span>
            <DiscoveryRiskBadge level={risk.level} score={risk.score} />
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
