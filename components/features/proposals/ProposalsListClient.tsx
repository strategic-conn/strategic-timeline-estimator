"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { FileText, Plus, Trash2 } from "lucide-react";

import { ProposalAccessDenied } from "@/components/features/proposals/ProposalAccessDenied";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions } from "@/hooks/usePermissions";
import { useProjectsStore } from "@/store/projects-store";
import { useProposalEstimatorStore } from "@/store/proposal-estimator-store";
import type { ClientQuote } from "@/types/proposal.types";

export function ProposalsListClient() {
  const { canExportProposals } = usePermissions();
  const router = useRouter();
  const projects = useProjectsStore((s) => s.projects);
  const proposals = useProposalEstimatorStore((s) => s.proposals);
  const createProposal = useProposalEstimatorStore((s) => s.createProposal);
  const deleteProposal = useProposalEstimatorStore((s) => s.deleteProposal);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState("");
  const [newClient, setNewClient] = React.useState("");
  const [newProjectId, setNewProjectId] = React.useState<string>("__none__");
  const [deleteTarget, setDeleteTarget] = React.useState<ClientQuote | null>(
    null
  );

  const sorted = React.useMemo(
    () =>
      [...proposals].sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      ),
    [proposals]
  );

  const projectName = React.useCallback(
    (id: string | null | undefined) => {
      if (!id) return null;
      return projects.find((p) => p.id === id)?.name ?? null;
    },
    [projects]
  );

  const submitCreate = () => {
    const title = newTitle.trim();
    if (!title) return;
    const id = createProposal({
      title,
      client_name: newClient.trim() || undefined,
      project_id:
        newProjectId && newProjectId !== "__none__" ? newProjectId : null,
    });
    setCreateOpen(false);
    setNewTitle("");
    setNewClient("");
    setNewProjectId("__none__");
    router.push(`/proposals/${id}`);
  };

  if (!canExportProposals) {
    return <ProposalAccessDenied />;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <WorkspacePageHeader
        eyebrow="Commercial"
        title="Proposals"
        description="Build client quotes with complexity tiers and hour roll-ups. Data stays in this browser until the API is connected."
        actions={
          <Button
            type="button"
            className="w-full gap-2 sm:w-auto"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-4" aria-hidden />
            New quote
          </Button>
        }
      />

      {sorted.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-muted">
              <FileText className="size-6 text-muted-foreground" aria-hidden />
            </div>
            <CardTitle>No quotes yet</CardTitle>
            <CardDescription>
              Create a quote to add line items, set complexity, and preview a
              print layout.
            </CardDescription>
            <Button
              type="button"
              className="mx-auto mt-4 w-fit gap-2"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-4" aria-hidden />
              New quote
            </Button>
          </CardHeader>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {sorted.map((q) => {
            const pn = projectName(q.project_id);
            const hours = q.line_items.reduce((s, li) => s + li.hours, 0);
            return (
              <li key={q.id}>
                <Card className="transition-colors hover:bg-muted/30">
                  <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-base">
                          <Link
                            href={`/proposals/${q.id}`}
                            className="text-foreground underline-offset-4 hover:underline"
                          >
                            {q.title}
                          </Link>
                        </CardTitle>
                        <Badge variant="secondary" className="tabular-nums">
                          {hours} h
                        </Badge>
                      </div>
                      <CardDescription className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                        {q.client_name ? (
                          <span>Client: {q.client_name}</span>
                        ) : null}
                        {pn ? <span>Project: {pn}</span> : null}
                        <span>
                          Updated{" "}
                          {format(new Date(q.updated_at), "MMM d, yyyy")}
                        </span>
                      </CardDescription>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/proposals/${q.id}`}>Open</Link>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Delete ${q.title}`}
                        onClick={() => setDeleteTarget(q)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </CardHeader>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New client quote</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="quote-title">Quote title</Label>
              <Input
                id="quote-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Q2 website refresh"
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="quote-client">Client (optional)</Label>
              <Input
                id="quote-client"
                value={newClient}
                onChange={(e) => setNewClient(e.target.value)}
                placeholder="Organization name"
              />
            </div>
            <div className="grid gap-2">
              <Label>Internal project (optional)</Label>
              <Select
                value={newProjectId}
                onValueChange={setNewProjectId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitCreate}
              disabled={!newTitle.trim()}
            >
              Create and open
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this quote?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.title ?? "this quote"}
              </span>{" "}
              from your browser storage. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteTarget) deleteProposal(deleteTarget.id);
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
