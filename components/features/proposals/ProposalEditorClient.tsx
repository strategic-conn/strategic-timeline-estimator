"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  FileDown,
  FileSpreadsheet,
  FolderPlus,
  Library,
  Link2,
  Plus,
  Printer,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { ProposalAccessDenied } from "@/components/features/proposals/ProposalAccessDenied";
import { ProposalAddonsCard } from "@/components/features/proposals/ProposalAddonsCard";
import { ProposalCatalogBrowser } from "@/components/features/proposals/ProposalCatalogBrowser";
import { ProposalDependencyAlert } from "@/components/features/proposals/ProposalDependencyAlert";
import { ProposalPdfPreviewMock } from "@/components/features/proposals/ProposalPdfPreviewMock";
import { WorkspacePageHeader } from "@/components/layouts/workspace-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/usePermissions";
import {
  TIER_OPTIONS,
  lineEffectiveHours,
  quoteDevHours,
  quoteTotals,
  tierLabel,
} from "@/lib/constants/proposal-estimator";
import {
  PROPOSAL_STATUS_META,
  PROPOSAL_STATUS_ORDER,
} from "@/lib/constants/proposal-status";
import {
  PROPOSAL_PLATFORM_OPTIONS,
  categoryName,
  platformLabel,
  type CatalogItem,
} from "@/lib/proposal-catalog";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cn } from "@/lib/utils";
import { downloadProposalExcel } from "@/lib/utils/proposal-excel-export";
import { downloadProposalPdf } from "@/lib/utils/proposal-pdf-export";
import { useProjectsStore } from "@/store/projects-store";
import { useProposalEstimatorStore } from "@/store/proposal-estimator-store";
import type {
  ClientQuote,
  ProposalLineItem,
  ProposalPlatform,
  ProposalStatus,
  ProposalTier,
} from "@/types/proposal.types";

type ProposalEditorClientProps = {
  proposalId: string;
};

const CUSTOM_GROUP_KEY = "__custom__";

type LineGroup = {
  key: string;
  module: string;
  categoryId: number | null;
  /** Lines with their 1-based position in the full quote (for #refs). */
  lines: { line: ProposalLineItem; index: number }[];
};

function groupLinesByModule(
  lineItems: ProposalLineItem[],
  requirementsUnclear: boolean,
): { groups: LineGroup[]; subtotal: (g: LineGroup) => number } {
  const map = new Map<string, LineGroup>();
  const order: string[] = [];
  lineItems.forEach((line, i) => {
    const key = line.module ? `m:${line.module}` : CUSTOM_GROUP_KEY;
    if (!map.has(key)) {
      map.set(key, {
        key,
        module: line.module ?? "Custom / freehand",
        categoryId: line.category_id ?? null,
        lines: [],
      });
      order.push(key);
    }
    map.get(key)!.lines.push({ line, index: i + 1 });
  });
  const groups = order.map((k) => map.get(k)!);
  const subtotal = (g: LineGroup) =>
    g.lines.reduce(
      (s, { line }) => s + lineEffectiveHours(line, requirementsUnclear),
      0,
    );
  return { groups, subtotal };
}

export function ProposalEditorClient({ proposalId }: ProposalEditorClientProps) {
  const { canExportProposals } = usePermissions();
  const router = useRouter();
  const projects = useProjectsStore((s) => s.projects);
  const quote = useProposalEstimatorStore((s) =>
    s.proposals.find((p) => p.id === proposalId),
  );
  const updateProposal = useProposalEstimatorStore((s) => s.updateProposal);
  const updateAddons = useProposalEstimatorStore((s) => s.updateAddons);
  const addLineItem = useProposalEstimatorStore((s) => s.addLineItem);
  const addLineItemsFromCatalog = useProposalEstimatorStore(
    (s) => s.addLineItemsFromCatalog,
  );
  const updateLineItem = useProposalEstimatorStore((s) => s.updateLineItem);
  const removeLineItem = useProposalEstimatorStore((s) => s.removeLineItem);
  const setProposalStatus = useProposalEstimatorStore(
    (s) => s.setProposalStatus,
  );
  const convertToProject = useProposalEstimatorStore((s) => s.convertToProject);

  const [convertOpen, setConvertOpen] = React.useState(false);
  const [convertName, setConvertName] = React.useState("");
  const [convertSeedTasks, setConvertSeedTasks] = React.useState(true);
  const [converting, setConverting] = React.useState(false);

  // Live mode: gate on the Supabase fetch finishing (WorkspaceSync hydrates the
  // store). Demo mode: gate on localStorage rehydration completing.
  const liveLoaded = useProposalEstimatorStore((s) => s.loaded);
  const [persistHydrated, setPersistHydrated] = React.useState(() =>
    useProposalEstimatorStore.persist.hasHydrated(),
  );
  const hydrated = isSupabaseConfigured ? liveLoaded : persistHydrated;
  const [catalogOpen, setCatalogOpen] = React.useState(false);
  const [tab, setTab] = React.useState("scope");

  React.useEffect(() => {
    if (useProposalEstimatorStore.persist.hasHydrated()) {
      setPersistHydrated(true);
      return;
    }
    const unsub = useProposalEstimatorStore.persist.onFinishHydration(() => {
      setPersistHydrated(true);
    });
    return unsub;
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    if (!quote) {
      router.replace("/proposals");
    }
  }, [hydrated, quote, router]);

  const projectName = quote?.project_id
    ? projects.find((p) => p.id === quote.project_id)?.name ?? null
    : null;

  const totals = quote ? quoteTotals(quote) : null;
  const devHours = quote ? quoteDevHours(quote) : 0;

  const platformHasCatalog = quote
    ? PROPOSAL_PLATFORM_OPTIONS.find((p) => p.value === quote.platform)
        ?.hasCatalog ?? false
    : false;

  const alreadyAddedIds = React.useMemo(
    () =>
      new Set(
        (quote?.line_items ?? [])
          .map((li) => li.catalog_id)
          .filter((id): id is number => typeof id === "number"),
      ),
    [quote?.line_items],
  );

  const { groups, subtotal } = React.useMemo(
    () =>
      quote
        ? groupLinesByModule(quote.line_items, quote.requirements_unclear)
        : { groups: [], subtotal: () => 0 },
    [quote],
  );

  const handlePrint = () => {
    window.print();
  };

  const handleAddFromCatalog = React.useCallback(
    (items: CatalogItem[]) => {
      if (!quote || !items.length) return;
      addLineItemsFromCatalog(quote.id, items);
      toast.success(
        items.length === 1
          ? "Added 1 item from catalog"
          : `Added ${items.length} items from catalog`,
      );
    },
    [quote, addLineItemsFromCatalog],
  );

  const handlePdfDownload = async () => {
    if (!quote) return;
    try {
      await downloadProposalPdf(quote, projectName);
      toast.success("PDF downloaded");
    } catch {
      toast.error("Could not create PDF file");
    }
  };

  const handleExcelExport = async () => {
    if (!quote) return;
    try {
      await downloadProposalExcel(quote, projectName);
      toast.success("Excel file downloaded");
    } catch {
      toast.error("Could not create Excel file");
    }
  };

  const openConvert = () => {
    if (!quote) return;
    setConvertName(quote.title);
    setConvertSeedTasks(true);
    setConvertOpen(true);
  };

  const handleConvert = async () => {
    if (!quote) return;
    setConverting(true);
    const id = await convertToProject(quote.id, {
      name: convertName,
      seedTasks: convertSeedTasks,
    });
    setConverting(false);
    if (id) {
      setConvertOpen(false);
      router.push(`/projects/${id}`);
    }
  };

  if (!canExportProposals) {
    return <ProposalAccessDenied />;
  }

  if (!hydrated || !quote || !totals) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 py-8 text-sm text-muted-foreground">
        <p>Loading quote…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      {/* Screen UI — hidden when printing (a print-only copy lives at the end). */}
      <div className="flex flex-col gap-6 print:hidden">
        <Button variant="ghost" size="sm" className="w-fit gap-2 px-0" asChild>
          <Link href="/proposals">
            <ArrowLeft className="size-4" aria-hidden />
            All proposals
          </Link>
        </Button>

        <WorkspacePageHeader
          eyebrow="Quote editor"
          title={<span className="wrap-break-word">{quote.title}</span>}
          description={[
            quote.client_name ? `Client: ${quote.client_name}` : null,
            projectName ? `Project: ${projectName}` : null,
            `Platform: ${platformLabel(quote.platform)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Select
                value={quote.status}
                onValueChange={(v) =>
                  setProposalStatus(quote.id, v as ProposalStatus)
                }
              >
                <SelectTrigger size="sm" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROPOSAL_STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {PROPOSAL_STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {quote.project_id ? (
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                  <Link href={`/projects/${quote.project_id}`}>
                    <FolderPlus className="size-4" aria-hidden />
                    View project
                  </Link>
                </Button>
              ) : quote.status === "approved" ? (
                <Button size="sm" className="gap-1.5" onClick={openConvert}>
                  <FolderPlus className="size-4" aria-hidden />
                  Start project
                </Button>
              ) : null}

              <div className="hidden flex-col items-end leading-tight sm:flex">
                <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                  Total
                </span>
                <span className="tabular-nums text-lg font-semibold">
                  {totals.grandHours} h
                </span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2 border-border/60 bg-background/80"
                  >
                    Export
                    <ChevronDown className="size-4 opacity-70" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuItem
                    className="gap-2"
                    onSelect={() => {
                      void handlePdfDownload();
                    }}
                  >
                    <FileDown className="size-4" aria-hidden />
                    Download PDF (.pdf)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="gap-2"
                    onSelect={() => {
                      window.setTimeout(handlePrint, 0);
                    }}
                  >
                    <Printer className="size-4" aria-hidden />
                    Print…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="gap-2"
                    onSelect={() => {
                      void handleExcelExport();
                    }}
                  >
                    <FileSpreadsheet className="size-4" aria-hidden />
                    Excel (.xlsx)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          }
        />

        <Tabs value={tab} onValueChange={setTab} className="gap-5">
          <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
            <TabsTrigger value="setup">Setup</TabsTrigger>
            <TabsTrigger value="scope" className="gap-1.5">
              Scope
              <Badge variant="secondary" className="tabular-nums">
                {quote.line_items.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="adjust">Adjust</TabsTrigger>
            <TabsTrigger value="review">Review</TabsTrigger>
          </TabsList>

          {/* ---- SETUP ---- */}
          <TabsContent value="setup" className="flex flex-col gap-5">
            <Card>
              <CardHeader>
                <CardTitle>Quote details</CardTitle>
                <CardDescription>
                  The platform you pick drives which catalog tasks you can
                  browse in Scope.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 pb-5 sm:grid-cols-2">
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="meta-title">Quote title</Label>
                  <Input
                    id="meta-title"
                    value={quote.title}
                    onChange={(e) =>
                      updateProposal(quote.id, { title: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="meta-client">Client</Label>
                  <Input
                    id="meta-client"
                    value={quote.client_name ?? ""}
                    placeholder="Optional"
                    onChange={(e) =>
                      updateProposal(quote.id, {
                        client_name: e.target.value || undefined,
                      })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Internal project</Label>
                  <Select
                    value={quote.project_id ?? "__none__"}
                    onValueChange={(v) =>
                      updateProposal(quote.id, {
                        project_id: v === "__none__" ? null : v,
                      })
                    }
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
                <div className="grid gap-2 sm:col-span-2">
                  <Label>Platform</Label>
                  <Select
                    value={quote.platform}
                    onValueChange={(v) =>
                      updateProposal(quote.id, {
                        platform: v as ProposalPlatform,
                      })
                    }
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
                  <p className="text-xs text-muted-foreground">
                    Changing the platform keeps your current rows but switches
                    the catalog used for new ones and dependency hints.
                  </p>
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="meta-notes">Notes (optional)</Label>
                  <Textarea
                    id="meta-notes"
                    rows={3}
                    value={quote.notes ?? ""}
                    placeholder="Assumptions, exclusions, or pricing context"
                    onChange={(e) =>
                      updateProposal(quote.id, {
                        notes: e.target.value || undefined,
                      })
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button type="button" onClick={() => setTab("scope")}>
                Next: Scope
              </Button>
            </div>
          </TabsContent>

          {/* ---- SCOPE ---- */}
          <TabsContent value="scope" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Scope &amp; line items</h2>
                <p className="text-sm text-muted-foreground">
                  Pull tasks from the {platformLabel(quote.platform)} catalog or
                  add freehand rows.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setCatalogOpen(true)}
                  disabled={!platformHasCatalog}
                  title={
                    platformHasCatalog
                      ? undefined
                      : "Pick a platform with a catalog in Setup"
                  }
                >
                  <Library className="size-3.5" aria-hidden />
                  Browse catalog
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => addLineItem(quote.id)}
                >
                  <Plus className="size-3.5" aria-hidden />
                  Add row
                </Button>
              </div>
            </div>

            {platformHasCatalog ? (
              <ProposalDependencyAlert
                platform={quote.platform}
                selectedCatalogIds={alreadyAddedIds}
                onAdd={handleAddFromCatalog}
              />
            ) : null}

            <div className="flex flex-col gap-4">
              {groups.map((group) => (
                <section
                  key={group.key}
                  className="rounded-2xl border border-border bg-card"
                >
                  <header className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-4 py-2.5 rounded-t-2xl">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold">
                        {group.module}
                      </h3>
                      {group.categoryId != null ? (
                        <p className="text-xs text-muted-foreground">
                          {categoryName(group.categoryId)}
                        </p>
                      ) : null}
                    </div>
                    <Badge
                      variant="secondary"
                      className="shrink-0 tabular-nums"
                    >
                      {subtotal(group)} h
                    </Badge>
                  </header>
                  <div className="flex flex-col divide-y divide-border/60">
                    {group.lines.map(({ line, index }) => (
                      <LineItemRow
                        key={line.id}
                        index={index}
                        line={line}
                        allLines={quote.line_items}
                        requirementsUnclear={quote.requirements_unclear}
                        onChange={(partial) =>
                          updateLineItem(quote.id, line.id, partial)
                        }
                        onRemove={() => removeLineItem(quote.id, line.id)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-md">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Dev hours</span>
                <span className="tabular-nums text-base font-semibold">
                  {devHours} h
                </span>
                {quote.requirements_unclear ? (
                  <Badge
                    variant="outline"
                    className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400"
                  >
                    <TriangleAlert className="size-3" aria-hidden />
                    Priced as Advanced
                  </Badge>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setTab("adjust")}
              >
                <SlidersHorizontal className="size-3.5" aria-hidden />
                Adjust add-ons
              </Button>
            </div>
          </TabsContent>

          {/* ---- ADJUST ---- */}
          <TabsContent value="adjust" className="flex flex-col gap-5">
            <Card
              className={cn(
                quote.requirements_unclear &&
                  "border-amber-500/40 bg-amber-500/5",
              )}
            >
              <CardContent className="flex items-start gap-3 py-4">
                <Checkbox
                  id="requirements-unclear"
                  checked={quote.requirements_unclear}
                  onCheckedChange={(v) =>
                    updateProposal(quote.id, {
                      requirements_unclear: v === true,
                    })
                  }
                  className="mt-0.5"
                />
                <Label
                  htmlFor="requirements-unclear"
                  className="flex-1 cursor-pointer"
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <Sparkles className="size-4 text-amber-600" aria-hidden />
                    Requirements not pinned down yet
                  </span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    Prices every line as Advanced (1.5×) for a safer estimate,
                    ignoring each row&apos;s own tier until you firm things up.
                  </span>
                </Label>
              </CardContent>
            </Card>

            <ProposalAddonsCard
              addons={quote.addons}
              onChange={(p) => updateAddons(quote.id, p)}
            />

            <Card>
              <CardHeader>
                <CardTitle>Totals</CardTitle>
                <CardDescription>
                  Roll-up math from the spreadsheet logic.
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-5">
                <TotalsList quote={quote} />
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button type="button" onClick={() => setTab("review")}>
                Next: Review
              </Button>
            </div>
          </TabsContent>

          {/* ---- REVIEW ---- */}
          <TabsContent value="review" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Client preview</h2>
                <p className="text-sm text-muted-foreground">
                  This is what exports to PDF, print, and Excel.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    void handlePdfDownload();
                  }}
                >
                  <FileDown className="size-3.5" aria-hidden />
                  PDF
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    void handleExcelExport();
                  }}
                >
                  <FileSpreadsheet className="size-3.5" aria-hidden />
                  Excel
                </Button>
              </div>
            </div>
            <ProposalPdfPreviewMock quote={quote} projectName={projectName} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Print-only copy so Print works from any tab. */}
      <div className="hidden print:block">
        <ProposalPdfPreviewMock quote={quote} projectName={projectName} />
      </div>

      <ProposalCatalogBrowser
        open={catalogOpen}
        onOpenChange={setCatalogOpen}
        platform={quote.platform}
        alreadyAddedIds={alreadyAddedIds}
        onAdd={handleAddFromCatalog}
      />

      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start a project from this proposal</DialogTitle>
            <DialogDescription>
              Creates a new project a coordinator can plan and staff. The proposal
              stays linked to it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="convert-name">Project name</Label>
              <Input
                id="convert-name"
                value={convertName}
                onChange={(e) => setConvertName(e.target.value)}
                autoFocus
              />
            </div>
            <label className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 p-3 text-sm">
              <Checkbox
                checked={convertSeedTasks}
                onCheckedChange={(v) => setConvertSeedTasks(v === true)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Create tasks from line items</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {quote.line_items.filter((li) => li.title.trim()).length} backlog
                  task(s) will be created, each with its estimated hours. You can
                  organise them into sprints and assign developers afterward.
                </span>
              </span>
            </label>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConvertOpen(false)}
              disabled={converting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleConvert()}
              disabled={converting || !convertName.trim()}
              className="gap-1.5"
            >
              <FolderPlus className="size-4" aria-hidden />
              {converting ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TotalsList({ quote }: { quote: ClientQuote }) {
  const totals = quoteTotals(quote);
  return (
    <dl className="divide-y divide-border/70">
      <TotalsRow label="Dev hours" value={totals.devHours} />
      {quote.addons.responsive_enabled ? (
        <TotalsRow
          label={`Responsive (${quote.addons.responsive_pct}%)`}
          value={totals.responsiveHours}
        />
      ) : null}
      {quote.addons.design_enabled ? (
        <TotalsRow
          label={`Design (${quote.addons.design_pct}%)`}
          value={totals.designHours}
        />
      ) : null}
      {quote.addons.qa_enabled ? (
        <TotalsRow
          label={`QA (${quote.addons.qa_pct}%)`}
          value={totals.qaHours}
        />
      ) : null}
      {quote.addons.pm_enabled ? (
        <TotalsRow
          label={`PM (${quote.addons.pm_pct}%)`}
          value={totals.pmHours}
        />
      ) : null}
      <TotalsRow
        label="Total estimated hours"
        value={totals.grandHours}
        strong
      />
    </dl>
  );
}

function TotalsRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-2 text-sm",
        strong && "pt-3 text-base font-semibold",
      )}
    >
      <dt className={cn("text-muted-foreground", strong && "text-foreground")}>
        {label}
      </dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

type LineItemRowProps = {
  index: number;
  line: ProposalLineItem;
  allLines: ProposalLineItem[];
  requirementsUnclear: boolean;
  onChange: (
    partial: Partial<
      Pick<
        ProposalLineItem,
        "title" | "tier" | "quantity" | "base_hours" | "depends_on"
      >
    >,
  ) => void;
  onRemove: () => void;
};

function LineItemRow({
  index,
  line,
  allLines,
  requirementsUnclear,
  onChange,
  onRemove,
}: LineItemRowProps) {
  const otherLines = allLines.filter((li) => li.id !== line.id);
  const depCount = line.depends_on.length;
  const missingDep = line.depends_on.some(
    (id) => !allLines.find((li) => li.id === id),
  );
  const effHours = lineEffectiveHours(line, requirementsUnclear);
  const shownTier = requirementsUnclear ? "advanced" : line.tier;

  const depPositions = line.depends_on
    .map((id) => {
      const ix = allLines.findIndex((li) => li.id === id);
      return ix >= 0 ? `#${ix + 1}` : null;
    })
    .filter(Boolean) as string[];

  return (
    <div className="flex items-start gap-3 bg-card p-3 transition-colors hover:bg-muted/30">
      <Badge
        variant="outline"
        className="mt-1 h-6 w-9 shrink-0 justify-center tabular-nums"
      >
        {index}
      </Badge>
      <div className="min-w-0 flex-1 space-y-2.5">
        <Input
          value={line.title}
          placeholder="Work package"
          onChange={(e) => onChange({ title: e.target.value })}
          className="h-9"
        />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Label
              htmlFor={`tier-${line.id}`}
              className="text-xs text-muted-foreground"
            >
              Tier
            </Label>
            <Select
              value={line.tier}
              onValueChange={(v) => onChange({ tier: v as ProposalTier })}
              disabled={requirementsUnclear}
            >
              <SelectTrigger id={`tier-${line.id}`} className="h-8 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}{" "}
                    <span className="text-[0.7rem] text-muted-foreground">
                      · {o.hint.replace(" base hours", "x")}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <Label
              htmlFor={`base-${line.id}`}
              className="text-xs text-muted-foreground"
            >
              Base h
            </Label>
            <Input
              id={`base-${line.id}`}
              type="number"
              inputMode="decimal"
              min={0}
              step={0.5}
              value={line.base_hours}
              onChange={(e) => {
                const n = Number.parseFloat(e.target.value);
                onChange({ base_hours: Number.isFinite(n) ? n : 0 });
              }}
              className="h-8 w-20 text-right tabular-nums"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Label
              htmlFor={`qty-${line.id}`}
              className="text-xs text-muted-foreground"
            >
              Qty
            </Label>
            <Input
              id={`qty-${line.id}`}
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={line.quantity}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10);
                onChange({ quantity: Number.isFinite(n) && n > 0 ? n : 1 });
              }}
              className="h-8 w-16 text-right tabular-nums"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 gap-1.5",
                  missingDep && "border-destructive/40 text-destructive",
                )}
                disabled={otherLines.length === 0}
              >
                <Link2 className="size-3.5" aria-hidden />
                {depCount === 0
                  ? "Add dependency"
                  : `Depends on ${depPositions.join(", ")}`}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="max-h-72 w-80 overflow-y-auto"
            >
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Requires
              </p>
              {otherLines.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Add another line first to link a dependency.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {otherLines.map((o) => {
                    const inputId = `dep-${line.id}-${o.id}`;
                    const checked = line.depends_on.includes(o.id);
                    const otherIx = allLines.findIndex((li) => li.id === o.id);
                    return (
                      <li key={o.id} className="flex items-start gap-2">
                        <Checkbox
                          id={inputId}
                          checked={checked}
                          onCheckedChange={(v) => {
                            const next = new Set(line.depends_on);
                            if (v === true) next.add(o.id);
                            else next.delete(o.id);
                            onChange({ depends_on: Array.from(next) });
                          }}
                          className="mt-0.5"
                        />
                        <Label
                          htmlFor={inputId}
                          className="cursor-pointer text-sm font-normal leading-snug"
                        >
                          <span className="font-medium">#{otherIx + 1}</span>{" "}
                          {o.title || "(untitled)"}
                        </Label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="text-right">
          <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
            Hours
          </span>
          <div className="tabular-nums text-base font-semibold">{effHours}</div>
          <span className="text-[0.65rem] tabular-nums text-muted-foreground">
            {line.base_hours} × {tierLabel(shownTier)} × {line.quantity}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          aria-label={`Remove line ${index}`}
          onClick={onRemove}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
