"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Briefcase,
  Columns3,
  FileText,
  Layers,
  Link2,
  List,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { ProposalAccessDenied } from "@/components/features/proposals/ProposalAccessDenied";
import { ProposalStageBoard } from "@/components/features/proposals/ProposalStageBoard";
import { ZohoAccountLookup } from "@/components/features/proposals/ZohoAccountLookup";
import {
  ZohoDealImport,
  type ZohoDealResult,
} from "@/components/features/proposals/ZohoDealImport";
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
import { quoteTotals } from "@/lib/constants/proposal-estimator";
import { priceForHours } from "@/lib/constants/proposal-estimator";
import {
  dealTakenMessage,
  findActiveDealHolder,
} from "@/lib/zoho/deal-exclusivity";
import { PROPOSAL_STATUS_META } from "@/lib/constants/proposal-status";
import { PUSHABLE_STAGES, canRaisePo, requestStagePush } from "@/lib/zoho/push-state";
import { CreatePoDialog } from "@/components/features/proposals/CreatePoDialog";
import { usePbsPoRefresh } from "@/hooks/usePbsPoRefresh";
import { poStatusLabel } from "@/lib/pbs/po-status";
import { ZohoStageBadge } from "@/components/features/proposals/ZohoStageBadge";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cn } from "@/lib/utils";
import {
  PROPOSAL_PLATFORM_OPTIONS,
  platformLabel,
} from "@/lib/proposal-catalog";
import { useProjectsStore } from "@/store/projects-store";
import { useProposalEstimatorStore } from "@/store/proposal-estimator-store";
import { useZohoStageRefresh } from "@/hooks/useZohoStageRefresh";
import type {
  ClientQuote,
  ProposalPlatform,
  ProposalZohoLink,
} from "@/types/proposal.types";

export function ProposalsListClient() {
  const { canExportProposals } = usePermissions();
  const router = useRouter();
  const projects = useProjectsStore((s) => s.projects);
  const proposals = useProposalEstimatorStore((s) => s.proposals);
  // The PO is written server-side, so the store only learns about it on a re-read.
  const hydrateProposals = useProposalEstimatorStore(
    (s) => s.hydrateFromSupabase,
  );
  const proposalsLoaded = useProposalEstimatorStore((s) => s.loaded);
  const createProposal = useProposalEstimatorStore((s) => s.createProposal);
  const deleteProposal = useProposalEstimatorStore((s) => s.deleteProposal);
  const updateProposal = useProposalEstimatorStore((s) => s.updateProposal);
  // Sales can move a deal in Zoho without telling us — re-check the linked ones
  // whenever the list is opened, in a single batched read.
  const zohoStages = useZohoStageRefresh(proposals);
  // Keep each linked PO's status honest against PBS.
  usePbsPoRefresh(proposals);

  /**
   * List or the Zoho-shaped pipeline board.
   *
   * Defaults to Stages — the pipeline view is now the primary way people work
   * this list, and it degrades gracefully on its own (a Zoho read failure shows
   * an inline message pointing back to List) rather than needing the default to
   * protect against that. Deliberately not persisted beyond that: no reason to
   * add storage for a per-session toggle when the default already matches how
   * it is used.
   */
  const [view, setView] = React.useState<"list" | "stages">("stages");
  const [createOpen, setCreateOpen] = React.useState(false);
  // Which estimate the PO dialog is for. The list can hold several won deals, so
  // this is an id — and an id rather than the row itself, because the store
  // rewrites the quote once the PO lands and a captured object would go stale.
  const [poTargetId, setPoTargetId] = React.useState<string | null>(null);
  const poTarget = poTargetId
    ? (proposals.find((q) => q.id === poTargetId) ?? null)
    : null;
  const [dealImportOpen, setDealImportOpen] = React.useState(false);
  const [clientLookupOpen, setClientLookupOpen] = React.useState(false);
  /** CRM link captured when the client is picked from Zoho (null = typed by hand). */
  const [newZoho, setNewZoho] = React.useState<ProposalZohoLink | null>(null);
  const [newTitle, setNewTitle] = React.useState("");
  const [newClient, setNewClient] = React.useState("");
  const [newProjectId, setNewProjectId] = React.useState<string>("__none__");
  const [newPlatform, setNewPlatform] =
    React.useState<ProposalPlatform>("react_next");
  const [deleteTarget, setDeleteTarget] = React.useState<ClientQuote | null>(
    null,
  );

  const sorted = React.useMemo(
    () =>
      [...proposals].sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      ),
    [proposals],
  );

  /**
   * Record where a deal actually landed after a stage move.
   *
   * Takes the SETTLED stage, never the requested one — `moveDealStage` resolves
   * that, because a push can be held back and persisting the request would make
   * the badge lie.
   */
  const handleStageChanged = React.useCallback(
    (proposalId: string, stage: string) => {
      const quote = useProposalEstimatorStore
        .getState()
        .proposals.find((q) => q.id === proposalId);
      if (!quote?.zoho) return;
      updateProposal(proposalId, {
        zoho: { ...quote.zoho, stage, stage_synced_at: new Date().toISOString() },
      });
    },
    [updateProposal],
  );

  const projectName = React.useCallback(
    (id: string | null | undefined) => {
      if (!id) return null;
      return projects.find((p) => p.id === id)?.name ?? null;
    },
    [projects],
  );

  const submitCreate = () => {
    const title = newTitle.trim();
    if (!title) return;
    // No scope-method choice here: guided and catalog produce the same document,
    // both tabs exist on every estimate, and "Start guided scoping" (editor,
    // Scope & risk) attaches the questionnaire whenever it's wanted. Asking up
    // front only picked a landing tab, at the moment the user knew least.
    const id = createProposal({
      title,
      client_name: newClient.trim() || undefined,
      project_id:
        newProjectId && newProjectId !== "__none__" ? newProjectId : null,
      platform: newPlatform,
      // Only set when the client was picked from Zoho (typing clears it).
      zoho: newZoho,
    });
    setCreateOpen(false);
    setNewTitle("");
    setNewClient("");
    setNewProjectId("__none__");
    setNewPlatform("react_next");
    setNewZoho(null);
    router.push(`/proposals/${id}`);
  };

  /**
   * Move the linked deal to Discovery. Fire-and-forget: the estimate already
   * exists locally and navigation shouldn't wait on the CRM, but the outcome is
   * always surfaced — a silent CRM write is worse than a slow one.
   */
  const advanceToDiscovery = async (dealId: string, proposalId: string) => {
    if (!isSupabaseConfigured) return;
    const res = await requestStagePush(dealId, {
      proposalId,
      stage: PUSHABLE_STAGES.discovery,
    });
    if (res.error) {
      toast.warning("Estimate created, but Zoho wasn't updated", {
        description: res.error,
      });
    } else if (res.moved) {
      toast.success(`Zoho deal moved to ${PUSHABLE_STAGES.discovery}`);
    } else if (res.skipped && res.currentStage) {
      toast.info(`Zoho deal left at ${res.currentStage}`, {
        description: "An import only advances a deal, never moves it back.",
      });
    }
  };

  /**
   * Create a quote from a Zoho deal. Only the fields the CRM reliably holds are
   * copied (title, client, dates); scope/hours are still built here. The deal
   * link + snapshot are stored so the quote can point back at the CRM record.
   */
  const handleImportDeal = (deal: ZohoDealResult) => {
    // One active estimate per deal: a second one would push the same deal
    // again, attaching a duplicate PDF and leaving the other estimate's pricing
    // in the Packages table.
    const holder = findActiveDealHolder(proposals, deal.id);
    if (holder) {
      toast.error("That deal already has an estimate", {
        description: dealTakenMessage(holder),
      });
      return;
    }
    const client = deal.account?.trim() || deal.contact?.trim() || undefined;
    const id = createProposal({
      title: deal.name?.trim() || "Untitled quote",
      client_name: client,
      platform: "react_next",
      zoho: {
        deal_id: deal.id,
        deal_name: deal.name,
        account: deal.account,
        contact: deal.contact,
        owner: deal.owner,
        closing_date: deal.closingDate,
        amount: deal.amount,
        currency: deal.currency,
        quote_number: deal.quoteNumber,
        stage: deal.stage,
        web_url: deal.webUrl,
        imported_at: new Date().toISOString(),
      },
    });
    toast.success("Estimate started from Zoho", {
      description: client ? `Client: ${client}` : undefined,
    });
    // Importing a deal IS the start of discovery, so say so in the CRM. The
    // route only ever advances a deal forward, so a deal further along is left
    // where sales put it — hence the two outcomes reported here.
    void advanceToDiscovery(deal.id, id);
    router.push(`/proposals/${id}`);
  };

  if (!canExportProposals) {
    return <ProposalAccessDenied />;
  }

  return (
    <div className="flex w-full flex-col gap-6">
      {poTarget ? (
        <CreatePoDialog
          open
          onClose={() => setPoTargetId(null)}
          quote={poTarget}
          onDone={hydrateProposals}
        />
      ) : null}

      <ZohoDealImport
        open={dealImportOpen}
        onClose={() => setDealImportOpen(false)}
        onSelect={handleImportDeal}
      />

      <ZohoAccountLookup
        open={clientLookupOpen}
        onClose={() => setClientLookupOpen(false)}
        onSelect={({ account, contact }) => {
          const client = account.name?.trim();
          if (!client) return;
          setNewClient(client);
          setNewZoho({
            account_id: account.id,
            account: account.name,
            contact_id: contact?.id ?? null,
            contact: contact?.name ?? null,
            contact_email: contact?.email ?? null,
            contact_phone: contact?.phone ?? null,
            web_url: account.webUrl,
            imported_at: new Date().toISOString(),
          });
        }}
      />

      <WorkspacePageHeader
        eyebrow="Commercial"
        title="Estimator"
        description={`Scope work with the guided questionnaire or the platform catalog, then quote it — tier multipliers, dependencies, and roll-up add-ons.${
          isSupabaseConfigured
            ? ""
            : " Data stays in this browser until the API is connected."
        }`}
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
            {/* Matches the task board's switcher. The pipeline board is the same
                estimates arranged by their Zoho stage — familiar to anyone who
                works the deal in the CRM. */}
            <div
              data-slot="button-group"
              className="inline-flex w-full items-center rounded-lg border border-border bg-muted/40 p-0.5 sm:w-auto"
              role="group"
              aria-label="Estimator view"
            >
              <Button
                type="button"
                size="sm"
                variant={view === "list" ? "secondary" : "ghost"}
                className="flex-1 gap-1.5 rounded-md sm:flex-none"
                onClick={() => setView("list")}
                aria-pressed={view === "list"}
              >
                <List className="size-4" aria-hidden />
                List
              </Button>
              <Button
                type="button"
                size="sm"
                variant={view === "stages" ? "secondary" : "ghost"}
                className="flex-1 gap-1.5 rounded-md sm:flex-none"
                onClick={() => setView("stages")}
                aria-pressed={view === "stages"}
              >
                <Columns3 className="size-4" aria-hidden />
                Stages
              </Button>
            </div>

            {/* Sales can move a deal in Zoho at any time; this re-reads the
                linked ones without reloading the page. */}
            {zohoStages.linkedCount ? (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2 border-border/60 bg-background/80 sm:w-auto"
                disabled={zohoStages.refreshing}
                onClick={() => void zohoStages.refresh()}
                title={`Re-read ${zohoStages.linkedCount} linked deal${
                  zohoStages.linkedCount === 1 ? "" : "s"
                } from Zoho`}
              >
                <RefreshCw
                  className={cn("size-4", zohoStages.refreshing && "animate-spin")}
                  aria-hidden
                />
                {zohoStages.refreshing ? "Refreshing…" : "Refresh Zoho"}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2 border-border/60 bg-background/80 sm:w-auto"
              onClick={() => setDealImportOpen(true)}
            >
              <Briefcase className="size-4" aria-hidden />
              Import from Zoho
            </Button>
            <Button
              type="button"
              className="w-full gap-2 sm:w-auto"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-4" aria-hidden />
              New estimate
            </Button>
          </div>
        }
      />

      {!proposalsLoaded ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Loading quotes…
        </p>
      ) : sorted.length === 0 ? (
        <Card className="max-w-3xl border-dashed">
          <CardHeader className="items-center text-center">
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-muted">
              <FileText className="size-6 text-muted-foreground" aria-hidden />
            </div>
            <CardTitle>No estimates yet</CardTitle>
            <CardDescription>
              Start one with the guided questionnaire or the platform catalog,
              then roll up hours and quote it.
            </CardDescription>
            <Button
              type="button"
              className="mx-auto mt-4 w-fit gap-2"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-4" aria-hidden />
              New estimate
            </Button>
          </CardHeader>
        </Card>
      ) : view === "stages" ? (
        <ProposalStageBoard
          quotes={sorted}
          projectName={projectName}
          onChanged={handleStageChanged}
        />
      ) : (
        <ul className="flex max-w-3xl flex-col gap-3">
          {sorted.map((q) => {
            const pn = projectName(q.project_id);
            const totals = quoteTotals(q);
            return (
              <li key={q.id}>
                <Card className="transition-colors hover:bg-muted/30">
                  {/* Stacks under sm: three controls on one row squeezed the
                      title into a five-line column on a 375px screen. */}
                  <CardHeader className="flex flex-col gap-3 space-y-0 pb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
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
                        <Badge
                          variant="outline"
                          className="gap-1 font-normal"
                        >
                          <Layers className="size-3" aria-hidden />
                          {platformLabel(q.platform)}
                        </Badge>
                        <Badge variant="secondary" className="tabular-nums">
                          {totals.grandHours} h
                        </Badge>
                        <Badge variant="secondary" className="tabular-nums">
                          {priceForHours(totals.grandHours)}
                        </Badge>
                        <Badge
                          className={cn(
                            "font-normal",
                            PROPOSAL_STATUS_META[q.status ?? "draft"].className,
                          )}
                        >
                          {PROPOSAL_STATUS_META[q.status ?? "draft"].label}
                        </Badge>
                        <ZohoStageBadge
                          stage={q.zoho?.stage}
                          syncedAt={q.zoho?.stage_synced_at ?? q.zoho?.imported_at}
                        />
                      </div>
                      <CardDescription className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                        {q.client_name ? (
                          <span>Client: {q.client_name}</span>
                        ) : null}
                        {pn ? <span>Project: {pn}</span> : null}
                        <span className="tabular-nums">
                          {q.line_items.length} line
                          {q.line_items.length === 1 ? "" : "s"}
                        </span>
                        <span>
                          Updated{" "}
                          {format(new Date(q.updated_at), "MMM d, yyyy")}
                        </span>
                      </CardDescription>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {/* Deal won and nothing billed yet — the next step, offered
                          without making anyone open the estimate first. */}
                      {canRaisePo(q) ? (
                        <Button
                          type="button"
                          size="sm"
                          className="gap-1.5"
                          title="Raise the purchase order in PBS"
                          onClick={() => setPoTargetId(q.id)}
                        >
                          <Receipt className="size-4" aria-hidden />
                          Create PO
                        </Button>
                      ) : q.pbs?.po_no ? (
                        /* Billed. The number is what someone scanning this list
                           is looking for, and it lived only in PBS before. */
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium tabular-nums",
                            q.pbs.missing
                              ? "border-destructive/40 bg-destructive/10 text-destructive"
                              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                          )}
                          title={[
                            `Purchase order ${q.pbs.po_no} in PBS`,
                            q.pbs.missing
                              ? "PBS reports this PO no longer exists."
                              : q.pbs.status
                                ? `Status ${q.pbs.status}`
                                : null,
                            q.pbs.created_at ? `Created ${q.pbs.created_at}` : null,
                            q.pbs.start_date && q.pbs.end_date
                              ? `Project ${q.pbs.start_date} → ${q.pbs.end_date}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        >
                          <Receipt className="size-3.5 shrink-0" aria-hidden />
                          PO {q.pbs.po_no}
                          {q.pbs.missing ? (
                            <span className="font-normal">· not in PBS</span>
                          ) : poStatusLabel(q.pbs.status) ? (
                            <span className="font-normal opacity-80">
                              · {poStatusLabel(q.pbs.status)}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
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
            <DialogTitle>New estimate</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="quote-title">Estimate title</Label>
              <Input
                id="quote-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Q2 website refresh"
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="quote-client">Client (optional)</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setClientLookupOpen(true)}
                >
                  <Search className="size-3.5" aria-hidden />
                  Find in Zoho
                </Button>
              </div>
              <Input
                id="quote-client"
                value={newClient}
                onChange={(e) => {
                  setNewClient(e.target.value);
                  // Typing over a picked client breaks the CRM link — drop it
                  // rather than keep a link that no longer matches the name.
                  setNewZoho(null);
                }}
                placeholder="Organization name"
              />
              {newZoho ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Link2 className="size-3 shrink-0" aria-hidden />
                  Linked to Zoho
                  {newZoho.contact ? ` · ${newZoho.contact}` : ""}
                </p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label>Internal project (optional)</Label>
              <Select value={newProjectId} onValueChange={setNewProjectId}>
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
            <div className="grid gap-2">
              <Label>Platform</Label>
              <Select
                value={newPlatform}
                onValueChange={(v) => setNewPlatform(v as ProposalPlatform)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROPOSAL_PLATFORM_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
            >
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
