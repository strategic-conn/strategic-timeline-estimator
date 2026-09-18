"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Compass,
  ExternalLink,
  FileDown,
  FileSpreadsheet,
  FolderPlus,
  Library,
  Link2,
  Package,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { DiscoveryGantt } from "@/components/features/discovery/DiscoveryGantt";
import {
  poScheduleDrift,
  projectDateRange,
} from "@/lib/sync/estimate-project-sync";
import { GanttClient } from "@/components/features/gantt/GanttClient";
import { DiscoveryHoursBreakdown } from "@/components/features/discovery/DiscoveryHoursBreakdown";
import { DiscoveryRiskBadge } from "@/components/features/discovery/DiscoveryRiskBadge";
import { DiscoveryWizard } from "@/components/features/discovery/DiscoveryWizard";
import { ProposalAccessDenied } from "@/components/features/proposals/ProposalAccessDenied";
import { RiskBufferCard } from "@/components/features/proposals/RiskBufferCard";
import { SchedulePreviewPanel } from "@/components/features/proposals/SchedulePreviewPanel";
import { ZohoAccountLookup } from "@/components/features/proposals/ZohoAccountLookup";
import { ZohoDealImport } from "@/components/features/proposals/ZohoDealImport";
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
import { useTeamCalendar } from "@/hooks/useTeamCalendar";
import {
  HOURLY_RATE,
  TIER_OPTIONS,
  amountForHours,
  formatAmount,
  priceForHours,
  lineEffectiveHours,
  quoteDevHours,
  quoteTotals,
  splitHours,
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
import { analyzeDiscovery, formatHours } from "@/lib/discovery";
import { createEmptyDiscoveryProject } from "@/lib/discovery/constants";
import {
  quoteHasWork,
  resultFromQuote,
  tentativeProject,
} from "@/lib/discovery/from-line-items";
import { syncDiscoveryToQuote } from "@/lib/discovery/platform-sync";
import {
  discoveryCoverage,
  type DiscoveryFieldId,
} from "@/lib/discovery/questions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  PUSHABLE_STAGES,
  canRaisePo,
  requestStagePush,
  zohoPushes,
} from "@/lib/zoho/push-state";
import { ZohoSendDialog } from "@/components/features/proposals/ZohoSendDialog";
import { ZohoProductPicker } from "@/components/features/proposals/ZohoProductPicker";
import { ZohoStageSelect } from "@/components/features/proposals/ZohoStageSelect";
import { CreatePoDialog } from "@/components/features/proposals/CreatePoDialog";
import { usePbsPoRefresh } from "@/hooks/usePbsPoRefresh";
import { recordStageChange } from "@/lib/zoho/won-transition";
import { poStatusLabel } from "@/lib/pbs/po-status";
import {
  dealTakenMessage,
  findActiveDealHolder,
} from "@/lib/zoho/deal-exclusivity";
import { useZohoStageRefresh } from "@/hooks/useZohoStageRefresh";
import { cn } from "@/lib/utils";
import { downloadProposalExcel } from "@/lib/utils/proposal-excel-export";
import { downloadProposalPdf } from "@/lib/utils/proposal-pdf-export";
import { useProjectsStore } from "@/store/projects-store";
import { useSprintsStore } from "@/store/sprints-store";
import {
  useProposalEstimatorStore,
  type SchedulePreview,
} from "@/store/proposal-estimator-store";
import type { DiscoveryProject } from "@/types/discovery.types";
import type {
  ClientQuote,
  ProposalLineItem,
  ProposalPlatform,
  ProposalStatus,
  ProposalTier,
  ZohoProductLink,
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
  // Booked time off, folded into every timeline this page draws.
  const teamCalendar = useTeamCalendar();
  const router = useRouter();
  const projects = useProjectsStore((s) => s.projects);
  const quote = useProposalEstimatorStore((s) =>
    s.proposals.find((p) => p.id === proposalId),
  );
  const updateProposal = useProposalEstimatorStore((s) => s.updateProposal);
  // Re-check this quote's deal stage on open, so the badge reflects Zoho
  // rather than whatever it said when the deal was imported.
  const onScreen = React.useMemo(() => (quote ? [quote] : []), [quote]);
  const zohoStages = useZohoStageRefresh(onScreen);
  // And the PO's live state in PBS — exact, keyed on the stored `po_id`.
  usePbsPoRefresh(onScreen);
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
  const setDiscovery = useProposalEstimatorStore((s) => s.setDiscovery);
  const regenerateLineItems = useProposalEstimatorStore(
    (s) => s.regenerateLineItems,
  );
  const convertToProject = useProposalEstimatorStore((s) => s.convertToProject);
  const previewConversion = useProposalEstimatorStore(
    (s) => s.previewConversion,
  );
  /** How much of the questionnaire is actually answered (null = catalog quote). */
  const coverage = React.useMemo(
    () => (quote?.discovery ? discoveryCoverage(quote.discovery) : null),
    [quote],
  );
  // Amber on either signal: a blank *required* field is the concrete gap, while
  // low overall coverage means the number is mostly assumptions.
  const coverageThin = Boolean(
    coverage && (coverage.missingRequired > 0 || coverage.ratio < 0.5),
  );
  const hydrateProposals = useProposalEstimatorStore(
    (s) => s.hydrateFromSupabase,
  );
  /** When the proposal stage was pushed (per-stage, so a later completion push
   *  doesn't wrongly disable this button). */
  const proposalPushed =
    zohoPushes(quote?.zoho)[PUSHABLE_STAGES.proposalSent] ?? null;

  const [convertOpen, setConvertOpen] = React.useState(false);
  const [convertName, setConvertName] = React.useState("");
  const [convertSeedTasks, setConvertSeedTasks] = React.useState(true);
  const [convertStrategy, setConvertStrategy] = React.useState<
    "efficient" | "quick" | "none"
  >("efficient");
  const [converting, setConverting] = React.useState(false);
  /** Non-null once the plan has been computed for review (step 2 of the dialog). */
  const [convertPreview, setConvertPreview] =
    React.useState<SchedulePreview | null>(null);
  const [clientLookupOpen, setClientLookupOpen] = React.useState(false);
  const [dealLinkOpen, setDealLinkOpen] = React.useState(false);
  const [sendOpen, setSendOpen] = React.useState(false);
  const [poOpen, setPoOpen] = React.useState(false);
  const allQuotes = useProposalEstimatorStore((s) => s.proposals);
  const [productsOpen, setProductsOpen] = React.useState(false);

  // Live mode: gate on the Supabase fetch finishing (WorkspaceSync hydrates the
  // store). Demo mode: gate on localStorage rehydration completing.
  const liveLoaded = useProposalEstimatorStore((s) => s.loaded);
  const [persistHydrated, setPersistHydrated] = React.useState(() =>
    useProposalEstimatorStore.persist.hasHydrated(),
  );
  const hydrated = isSupabaseConfigured ? liveLoaded : persistHydrated;
  const [catalogOpen, setCatalogOpen] = React.useState(false);
  const [tab, setTab] = React.useState("scope");
  const [scopeTab, setScopeTab] = React.useState("questionnaire");

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

  // A freshly-created guided estimate (scope present, no lines yet) opens on the
  // questionnaire so the user starts scoping right away.
  const tabInitRef = React.useRef(false);
  React.useEffect(() => {
    if (!hydrated || !quote || tabInitRef.current) return;
    tabInitRef.current = true;
    if (quote.discovery && quote.line_items.length === 0) setTab("guided");
  }, [hydrated, quote]);

  /**
   * The project this estimate started — resolved against the live store, not
   * taken on trust from `project_id`.
   *
   * A link can outlive its project: `proposals.project_id` is `on delete set
   * null`, so Postgres clears it, but proposals have no realtime channel (the
   * row is one JSONB document; an echoed upsert would replace someone's
   * in-progress line items). Trusting the raw id showed "View project" pointing
   * at a page that no longer exists AND hid "Start project", leaving an
   * approved estimate with no way to get its work scheduled again.
   */
  const linkedProject = quote?.project_id
    ? (projects.find((p) => p.id === quote.project_id) ?? null)
    : null;
  const projectName = linkedProject?.name ?? null;

  // The PO was billed against a date range PBS cannot be asked to change (it
  // has no update endpoint, and `fetch-po` doesn't even return the range). So
  // when the project's real sprints move away from it, say so — somebody has to
  // correct it in PBS by hand.
  const projectSprints = useSprintsStore((s) => s.sprints);
  const pbsLink = quote?.pbs ?? null;
  const linkedProjectId = linkedProject?.id ?? null;
  const poDrift = React.useMemo(() => {
    if (!pbsLink?.po_no || !linkedProjectId) return null;
    return poScheduleDrift(
      pbsLink,
      projectDateRange(
        projectSprints.filter((s) => s.project_id === linkedProjectId),
      ),
    );
  }, [pbsLink, linkedProjectId, projectSprints]);

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

  // Guided scope: derive the estimate/timeline/risk from the saved answers.
  const scopeResult = React.useMemo(
    () =>
      quote?.discovery
        ? analyzeDiscovery(quote.discovery, teamCalendar, quote.risk_buffer_pct ?? 0)
        : null,
    [quote, teamCalendar],
  );

  // Catalog / manual estimates (no guided scope): a tentative timeline from the
  // line items + add-ons, through the same engine. Recomputes as the quote changes.
  const catalogResult = React.useMemo(
    () =>
      quote && !quote.discovery && quoteHasWork(quote)
        ? resultFromQuote(quote, teamCalendar)
        : null,
    [quote, teamCalendar],
  );
  const tentProject = React.useMemo(() => tentativeProject(), []);
  /** Whichever timeline this quote actually has — guided answers or line items. */
  const activeResult = scopeResult ?? catalogResult;

  const startGuided = React.useCallback(() => {
    if (!quote) return;
    const now = new Date().toISOString();
    const blank: DiscoveryProject = {
      ...createEmptyDiscoveryProject(),
      id: quote.id,
      name: quote.title,
      client_name: quote.client_name ?? "",
      created_at: now,
      updated_at: now,
    };
    setDiscovery(quote.id, syncDiscoveryToQuote(blank, quote));
  }, [quote, setDiscovery]);

  const handleScopeChange = React.useCallback(
    (id: DiscoveryFieldId, value: string | number | boolean | null) => {
      if (!quote?.discovery) return;
      setDiscovery(quote.id, {
        ...quote.discovery,
        [id]: value,
        updated_at: new Date().toISOString(),
      } as DiscoveryProject);
    },
    [quote, setDiscovery],
  );

  const handleGenerateLines = React.useCallback(() => {
    if (!quote) return;
    regenerateLineItems(quote.id);
    toast.success("Line items generated from scope");
    setTab("scope");
    // setTab is listed because the compiler infers it; omitting it is what made
    // it give up on this component.
  }, [quote, regenerateLineItems, setTab]);

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
    setConvertStrategy("efficient");
    setConvertPreview(null);
    setConvertOpen(true);
  };

  const strategyArg = () =>
    convertSeedTasks && convertStrategy !== "none" ? convertStrategy : undefined;

  /** Step 1 → 2: compute the plan for review. Writes nothing. */
  const handlePreview = () => {
    if (!quote) return;
    const p = previewConversion(quote.id, {
      seedTasks: convertSeedTasks,
      strategy: strategyArg(),
    });
    if (!p) {
      toast.error("Couldn't build a preview for this estimate.");
      return;
    }
    setConvertPreview(p);
  };

  const handleConvert = async () => {
    if (!quote) return;
    setConverting(true);
    const id = await convertToProject(quote.id, {
      name: convertName,
      seedTasks: convertSeedTasks,
      strategy: strategyArg(),
      // Persist exactly what was reviewed rather than recomputing.
      preview: convertPreview,
    });
    setConverting(false);
    if (id) {
      setConvertOpen(false);
      setConvertPreview(null);
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
            All estimates
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

              {linkedProject ? (
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                  <Link href={`/projects/${linkedProject.id}`}>
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

              {/* The one moment this appears — deal won, no PO yet — so it goes
                  in the header where every tab can see it, not inside Review. */}
              {canRaisePo(quote) ? (
                <Button
                  size="sm"
                  className="gap-1.5"
                  title="Raise the purchase order in PBS"
                  onClick={() => setPoOpen(true)}
                >
                  <Receipt className="size-4" aria-hidden />
                  Create PO
                </Button>
              ) : quote.pbs?.po_no ? (
                /* The other half of that moment: once a PO exists the button
                   goes away, and without this the estimate showed nothing at
                   all — the number lived only in PBS. It is also the signal
                   that billing is done, so it sits in the same slot. */
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium tabular-nums",
                    quote.pbs.missing
                      ? // PBS says this PO is gone. Showing it as normal would
                        // be the app asserting something billing denies.
                        "border-destructive/40 bg-destructive/10 text-destructive"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                  )}
                  title={[
                    `Purchase order ${quote.pbs.po_no} in PBS`,
                    quote.pbs.missing
                      ? "PBS reports this PO no longer exists."
                      : quote.pbs.status
                        ? `Status ${quote.pbs.status}`
                        : null,
                    quote.pbs.created_at ? `Created ${quote.pbs.created_at}` : null,
                    // The range the PO was filed with. PBS keeps it in a
                    // `po_parameter` record nothing here can read back, so this
                    // stored copy is the only place it is visible at all.
                    quote.pbs.start_date && quote.pbs.end_date
                      ? `Project ${quote.pbs.start_date} → ${quote.pbs.end_date}`
                      : null,
                    poDrift
                      ? `The project now runs ${poDrift.actual.start} → ${poDrift.actual.end}. PBS has no way to edit a PO, so change it there by hand.`
                      : null,
                    quote.pbs.status_synced_at
                      ? `Checked ${new Date(quote.pbs.status_synced_at).toLocaleString()}`
                      : null,
                    quote.pbs.adopted
                      ? "Linked to an existing PO rather than created here."
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                >
                  {quote.pbs.missing ? (
                    <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                  ) : (
                    <Receipt className="size-3.5 shrink-0" aria-hidden />
                  )}
                  PO {quote.pbs.po_no}
                  {quote.pbs.missing ? (
                    <span className="font-normal">· not in PBS</span>
                  ) : poStatusLabel(quote.pbs.status) ? (
                    <span className="font-normal opacity-80">
                      · {poStatusLabel(quote.pbs.status)}
                    </span>
                  ) : null}
                  {poDrift && !quote.pbs.missing ? (
                    /* Dates only, deliberately: the PO's status is fine, it is
                       the billed schedule that no longer matches the plan. */
                    <span className="font-normal text-amber-700 dark:text-amber-400">
                      · dates changed
                    </span>
                  ) : null}
                </span>
              ) : null}

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

              <span
                className="mx-1 hidden h-8 w-px bg-border/70 sm:block"
                aria-hidden
              />
              <div className="flex items-baseline gap-2 sm:flex-col sm:items-end sm:gap-0 sm:leading-tight">
                <span className="tabular-nums text-lg font-semibold">
                  {priceForHours(totals.grandHours)}
                </span>
                <span className="tabular-nums text-[0.7rem] text-muted-foreground">
                  {totals.grandHours} h @ {formatAmount(HOURLY_RATE)}/h
                </span>
              </div>
            </div>
          }
        />

        <Tabs value={tab} onValueChange={setTab} className="gap-5">
          {/* Wraps instead of scrolling under sm: five tabs need 433px and a 375px
              phone gives 351px, so "Review" — where Send to Zoho lives — sat
              off-screen behind a scrollbar nobody sees on touch. */}
          <TabsList className="h-auto w-full flex-wrap justify-start sm:w-fit sm:flex-nowrap">
            <TabsTrigger value="setup">Setup</TabsTrigger>
            <TabsTrigger value="guided" className="gap-1.5">
              <Compass className="size-3.5" aria-hidden />
              Scope &amp; risk
            </TabsTrigger>
            <TabsTrigger value="scope" className="gap-1.5">
              Line items
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
              <CardContent className="grid items-start gap-4 pb-5 sm:grid-cols-2">
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
                {/* No deal linked → offer to attach one. Pushing to Zoho needs a
                    specific deal as its target; the client alone isn't enough,
                    since a company can have many deals. */}
                {!quote.zoho?.deal_id ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border/60 p-3 text-xs">
                    <span className="text-muted-foreground">
                      Not linked to a Zoho deal — link an existing one, or send
                      this estimate from the Review tab to open a new one.
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 gap-1.5 text-xs"
                      onClick={() => setDealLinkOpen(true)}
                    >
                      <Link2 className="size-3.5" aria-hidden />
                      Link a Zoho deal
                    </Button>
                  </div>
                ) : null}
                {quote.zoho ? (
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-foreground">
                        {quote.zoho.deal_id ? "Linked to Zoho CRM" : "Client from Zoho CRM"}
                      </span>
                      {quote.zoho.web_url ? (
                        <a
                          href={quote.zoho.web_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex shrink-0 items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
                        >
                          View in Zoho
                          <ExternalLink className="size-3" aria-hidden />
                        </a>
                      ) : null}
                    </div>
                    <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                      {quote.zoho.deal_name ? (
                        <span>Deal: {quote.zoho.deal_name}</span>
                      ) : null}
                      {quote.zoho.stage && quote.zoho.deal_id ? (
                        <span className="inline-flex items-center gap-1">
                          {/* Doubles as the status changer: the badge shows where
                              the deal is, and opens the org's own stage list to
                              move it — no trip to Zoho for a stage change. */}
                          <ZohoStageSelect
                            dealId={quote.zoho.deal_id!}
                            proposalId={quote.id}
                            stage={quote.zoho.stage}
                            syncedAt={
                              quote.zoho.stage_synced_at ?? quote.zoho.imported_at
                            }
                            // Records the stage AND applies the win — the same
                            // call the pipeline board makes, so the two cannot
                            // drift apart again.
                            onChanged={(next) => recordStageChange(quote, next)}
                          />
                          {/* The badge is a snapshot — this re-reads it without
                              reloading the page. */}
                          <button
                            type="button"
                            aria-label="Refresh the deal stage from Zoho"
                            title="Refresh the deal stage from Zoho"
                            disabled={zohoStages.refreshing}
                            onClick={() => void zohoStages.refresh()}
                            className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                          >
                            <RefreshCw
                              className={cn(
                                "size-3",
                                zohoStages.refreshing && "animate-spin",
                              )}
                              aria-hidden
                            />
                          </button>
                        </span>
                      ) : null}
                      {/* The CRM's own price, refreshed alongside the stage.
                          Zoho derives it from the Packages subform, so this is
                          how a reprice made *in Zoho* becomes visible here.
                          Shown beside the estimate rather than folded into it:
                          the line items are this app's source of truth, and
                          silently adopting a CRM number would overwrite them. */}
                      {typeof quote.zoho.amount === "number" &&
                      quote.zoho.deal_id ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1",
                            quote.zoho.amount !==
                              amountForHours(totals.grandHours) &&
                              "font-medium text-amber-600 dark:text-amber-500",
                          )}
                          title={
                            quote.zoho.amount !==
                            amountForHours(totals.grandHours)
                              ? `Zoho holds ${formatAmount(quote.zoho.amount)}; this estimate is ${priceForHours(totals.grandHours)}. Send to Zoho to reprice the deal.`
                              : "Zoho matches this estimate."
                          }
                        >
                          CRM amount: {formatAmount(quote.zoho.amount)}
                          {quote.zoho.amount !==
                          amountForHours(totals.grandHours) ? (
                            <TriangleAlert className="size-3" aria-hidden />
                          ) : null}
                        </span>
                      ) : null}
                      {quote.zoho.contact ? (
                        <span>Contact: {quote.zoho.contact}</span>
                      ) : null}
                      {quote.zoho.owner ? <span>Rep: {quote.zoho.owner}</span> : null}
                      {quote.zoho.closing_date ? (
                        <span>Target close: {quote.zoho.closing_date}</span>
                      ) : null}
                      {quote.zoho.quote_number ? (
                        <span>CRM quote #{quote.zoho.quote_number}</span>
                      ) : null}
                    </dl>
                  </div>
                ) : null}
                {/* What we're selling, straight from the CRM's Products module.
                    Kept on the quote for now — writing it onto the Deal needs the
                    API name of this org's "Packages" subform. */}
                <div className="grid gap-2 sm:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>
                      Products
                      {quote.zoho?.products?.length ? (
                        <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">
                          {quote.zoho.products.length}
                        </span>
                      ) : null}
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setProductsOpen(true)}
                    >
                      <Package className="size-3.5" aria-hidden />
                      {quote.zoho?.products?.length
                        ? "Add or remove products"
                        : "Add products from Zoho"}
                    </Button>
                  </div>
                  {quote.zoho?.products?.length ? (
                    <ProductAllocation
                      products={quote.zoho.products}
                      totalHours={totals.grandHours}
                      onChange={(products) =>
                        updateProposal(quote.id, {
                          zoho: { ...quote.zoho!, products },
                        })
                      }
                    />
                  ) : (
                    <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                      No products picked. Add as many as this deal sells — these
                      are the CRM catalogue items, separate from the line items
                      below, which are the work.
                    </p>
                  )}
                </div>
                <div className="grid gap-2">
                  <div className="flex h-8 items-center justify-between gap-2">
                    <Label htmlFor="meta-client">Client</Label>
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
                  <div className="flex h-8 items-center">
                    <Label>Internal project</Label>
                  </div>
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
                <div className="grid gap-2">
                  <div className="flex h-8 items-center">
                    <Label>Platform</Label>
                  </div>
                  <Select
                    value={quote.platform}
                    onValueChange={(v) => {
                      const platform = v as ProposalPlatform;
                      // The store mirrors the change onto the questionnaire.
                      updateProposal(quote.id, { platform });
                    }}
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
              <Button type="button" onClick={() => setTab("guided")}>
                Next: Scope &amp; risk
              </Button>
            </div>
          </TabsContent>

          {/* ---- GUIDED SCOPE & RISK ---- */}
          <TabsContent value="guided" className="flex flex-col gap-5">
            {quote.discovery && scopeResult ? (
              <>
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                      <DiscoveryRiskBadge
                        level={scopeResult.risk.level}
                        score={scopeResult.risk.score}
                      />
                      <span className="tabular-nums">
                        <span className="text-muted-foreground">Estimate </span>
                        {formatHours(scopeResult.estimate.total.min)}–
                        {formatHours(scopeResult.estimate.total.max)} hrs
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        ~{scopeResult.timeline.totalWeeks} wks · launch{" "}
                        {scopeResult.timeline.launchDate}
                      </span>
                      <span className="text-muted-foreground">
                        Platform:{" "}
                        <span className="font-medium text-foreground">
                          {platformLabel(quote.platform)}
                        </span>{" "}
                        <span className="text-xs">(set in Setup)</span>
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Button
                        type="button"
                        size="sm"
                        className="gap-1.5"
                        onClick={handleGenerateLines}
                      >
                        <Wand2 className="size-3.5" aria-hidden />
                        {quote.line_items.length
                          ? "Regenerate line items"
                          : "Generate line items"}
                      </Button>
                      {quote.line_items.length ? (
                        <span className="text-[0.7rem] text-muted-foreground">
                          Replaces the current {quote.line_items.length} line
                          {quote.line_items.length === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </div>
                  </CardContent>

                  {/* The engine always returns a complete estimate, filling any
                      unanswered question with a default — which reads as "it
                      ignored my input". Say plainly how much is actually yours. */}
                  {coverage ? (
                    <CardContent className="pt-0">
                      <p
                        className={cn(
                          "flex items-start gap-2 rounded-lg border p-2.5 text-xs",
                          coverageThin
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                            : "border-border/60 bg-muted/20 text-muted-foreground",
                        )}
                      >
                        {coverageThin ? (
                          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        ) : null}
                        <span>
                          {/* Lead with the required gaps — they're the specific,
                              fixable thing, and they also drive the risk score. */}
                          {coverage.missingRequired > 0 ? (
                            <>
                              <span className="font-medium">
                                {coverage.missingRequired} required question
                                {coverage.missingRequired === 1 ? "" : "s"} still blank
                              </span>
                              {" — the estimate covers them with industry defaults. "}
                            </>
                          ) : null}
                          <span
                            className={coverage.missingRequired > 0 ? "" : "font-medium"}
                          >
                            {coverage.answered} of {coverage.total} details filled in
                          </span>
                          {coverage.missingRequired === 0 && coverageThin ? (
                            <>
                              {" "}— the rest fall back to defaults, so treat this as a
                              ballpark.
                            </>
                          ) : (
                            <>.</>
                          )}
                        </span>
                      </p>
                    </CardContent>
                  ) : null}
                </Card>

                <Tabs
                  value={scopeTab}
                  onValueChange={setScopeTab}
                  className="gap-4"
                >
                  {/* Wraps instead of scrolling under sm: five tabs need 433px and a 375px
              phone gives 351px, so "Review" — where Send to Zoho lives — sat
              off-screen behind a scrollbar nobody sees on touch. */}
          <TabsList className="h-auto w-full flex-wrap justify-start sm:w-fit sm:flex-nowrap">
                    <TabsTrigger value="questionnaire">Questionnaire</TabsTrigger>
                    <TabsTrigger value="hours">Hours</TabsTrigger>
                    <TabsTrigger value="timeline">Timeline</TabsTrigger>
                  </TabsList>
                  <TabsContent value="questionnaire">
                    <DiscoveryWizard
                      project={quote.discovery}
                      onChange={handleScopeChange}
                      onViewEstimate={() => setScopeTab("hours")}
                    />
                  </TabsContent>
                  <TabsContent value="hours">
                    <DiscoveryHoursBreakdown result={scopeResult} />
                  </TabsContent>
                  <TabsContent value="timeline">
                    {linkedProject ? (
                      <LiveProjectTimeline projectId={linkedProject.id} />
                    ) : (
                      <DiscoveryGantt
                        result={scopeResult}
                        project={quote.discovery}
                        teamCalendar={teamCalendar}
                      />
                    )}
                  </TabsContent>
                </Tabs>
              </>
            ) : catalogResult ? (
              <>
                {linkedProject ? (
                  <LiveProjectTimeline projectId={linkedProject.id} />
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
                      <p className="max-w-md text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">
                          Tentative timeline
                        </span>{" "}
                        — auto-generated from your line items &amp; add-ons,
                        starting today. Answer the questionnaire for a detailed
                        timeline and a risk score.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={startGuided}
                      >
                        <Compass className="size-3.5" aria-hidden />
                        Start guided scoping
                      </Button>
                    </div>
                    <DiscoveryGantt
                      result={catalogResult}
                      project={tentProject}
                      teamCalendar={teamCalendar}
                    />
                  </>
                )}
              </>
            ) : (
              <Card>
                <CardHeader className="items-center gap-2 text-center">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                    <Compass className="size-6 text-muted-foreground" aria-hidden />
                  </div>
                  <CardTitle>Scope this estimate to see a timeline</CardTitle>
                  <CardDescription className="max-w-md text-balance">
                    Add line items (Line items tab) for a tentative timeline, or
                    answer the guided questionnaire for Min/Mid/Max hours, a phased
                    timeline, and a risk score — then generate the line items for you.
                  </CardDescription>
                  <Button
                    type="button"
                    className="mt-2 gap-1.5"
                    onClick={startGuided}
                  >
                    <Compass className="size-4" aria-hidden />
                    Start guided scoping
                  </Button>
                </CardHeader>
              </Card>
            )}
          </TabsContent>

          {/* ---- SCOPE ---- */}
          <TabsContent value="scope" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Line items</h2>
                <p className="text-sm text-muted-foreground">
                  Generate them from Scope &amp; risk, pull from the{" "}
                  {platformLabel(quote.platform)} catalog, or add freehand rows.
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

            {quote.discovery && quote.line_items.length === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                <p className="flex items-center gap-2 text-sm">
                  <Compass className="size-4 shrink-0 text-primary" aria-hidden />
                  <span>
                    You scoped this with the questionnaire
                    {scopeResult
                      ? ` (~${formatHours(scopeResult.estimate.total.mid)} hrs)`
                      : ""}
                    , but haven&apos;t built the line items yet.
                  </span>
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleGenerateLines}
                >
                  <Wand2 className="size-3.5" aria-hidden />
                  Generate from scope
                </Button>
              </div>
            ) : null}

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

            <div className="sticky bottom-3 z-10 flex flex-col gap-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-md sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
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
                className="w-full gap-1.5 sm:w-auto"
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

            <RiskBufferCard
              value={quote.risk_buffer_pct ?? 0}
              onChange={(pct) =>
                updateProposal(quote.id, { risk_buffer_pct: pct })
              }
              baseDays={activeResult?.timeline.baseBusinessDays}
              bufferedDays={activeResult?.timeline.totalBusinessDays}
            />

            <ProposalAddonsCard
              addons={quote.addons}
              onChange={(p) => updateAddons(quote.id, p)}
              itemisedByScope={Boolean(quote.discovery)}
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
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  // Creating needs an account to hang the deal off; updating an
                  // existing deal doesn't, since it already has one.
                  disabled={
                    !quote.zoho?.deal_id && !quote.zoho?.account_id
                  }
                  title={
                    quote.zoho?.deal_id
                      ? proposalPushed
                        ? `Already sent ${new Date(proposalPushed).toLocaleString()}`
                        : `Update ${quote.zoho.deal_name ?? "the linked deal"} in Zoho`
                      : quote.zoho?.account_id
                        ? `Open a deal on ${quote.zoho.account ?? "the linked account"}`
                        : "Link the client to a Zoho account first — “Find in Zoho” on Setup"
                  }
                  onClick={() => setSendOpen(true)}
                >
                  <Upload className="size-3.5" aria-hidden />
                  {proposalPushed ? "Sent to Zoho" : "Send to Zoho"}
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

      {/* Same picker the Estimator list uses to import — here it attaches the
          chosen deal to THIS quote instead of creating a new one. */}
      <ZohoProductPicker
        open={productsOpen}
        onClose={() => setProductsOpen(false)}
        selected={quote.zoho?.products ?? []}
        onSave={(products) =>
          updateProposal(quote.id, {
            zoho: {
              ...(quote.zoho ?? { imported_at: new Date().toISOString() }),
              products,
            },
          })
        }
      />

      <CreatePoDialog
        open={poOpen}
        onClose={() => setPoOpen(false)}
        quote={quote}
        onDone={hydrateProposals}
      />

      <ZohoSendDialog
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        quote={quote}
        projectName={projectName}
        onDone={hydrateProposals}
      />

      <ZohoDealImport
        open={dealLinkOpen}
        onClose={() => setDealLinkOpen(false)}
        onSelect={(deal) => {
          const holder = findActiveDealHolder(allQuotes, deal.id, quote.id);
          if (holder) {
            toast.error("That deal already has an estimate", {
              description: dealTakenMessage(holder),
            });
            return;
          }
          updateProposal(quote.id, {
            // Keep whatever client details are already set; layer the deal on top.
            zoho: {
              ...(quote.zoho ?? {}),
              deal_id: deal.id,
              deal_name: deal.name,
              stage: deal.stage,
              closing_date: deal.closingDate,
              amount: deal.amount,
              currency: deal.currency,
              quote_number: deal.quoteNumber,
              owner: deal.owner,
              contact: quote.zoho?.contact ?? deal.contact,
              account: quote.zoho?.account ?? deal.account,
              web_url: deal.webUrl,
              imported_at: quote.zoho?.imported_at ?? new Date().toISOString(),
            },
            // Only fill the client if it's still empty — never overwrite a name
            // someone chose deliberately.
            ...(quote.client_name?.trim()
              ? {}
              : { client_name: deal.account ?? deal.name ?? undefined }),
          });
          toast.success("Linked to Zoho deal", {
            description: deal.name ?? undefined,
          });
          // Linking a deal to a live estimate is the same act as importing one:
          // scoping starts now, so the CRM should say Discovery. Forward-only,
          // enforced server-side.
          void (async () => {
            if (!isSupabaseConfigured) return;
            const res = await requestStagePush(deal.id, {
              proposalId: quote.id,
              stage: PUSHABLE_STAGES.discovery,
            });
            if (res.error) {
              toast.warning("Linked, but Zoho wasn't updated", {
                description: res.error,
              });
            } else if (res.moved) {
              toast.success(`Zoho deal moved to ${PUSHABLE_STAGES.discovery}`);
              await hydrateProposals();
            } else if (res.skipped && res.currentStage) {
              toast.info(`Zoho deal left at ${res.currentStage}`, {
                description: "Linking only advances a deal, never moves it back.",
              });
            }
          })();
        }}
      />

      <ZohoAccountLookup
        open={clientLookupOpen}
        onClose={() => setClientLookupOpen(false)}
        onSelect={({ account, contact }) => {
          const client = account.name?.trim();
          if (!client) return;
          updateProposal(quote.id, {
            client_name: client,
            // Keep any existing deal link; layer the client details on top.
            zoho: {
              ...(quote.zoho ?? {}),
              account_id: account.id,
              account: account.name,
              contact_id: contact?.id ?? null,
              contact: contact?.name ?? null,
              contact_email: contact?.email ?? null,
              contact_phone: contact?.phone ?? null,
              web_url: quote.zoho?.web_url ?? account.webUrl,
              imported_at: quote.zoho?.imported_at ?? new Date().toISOString(),
            },
          });
          toast.success(`Client set from Zoho — ${client}`, {
            description: contact?.name ? `Contact: ${contact.name}` : undefined,
          });
        }}
      />

      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent
          className={cn(
            convertPreview
              ? "max-h-[85dvh] overflow-y-auto sm:max-w-xl"
              : "sm:max-w-md",
          )}
        >
          <DialogHeader>
            <DialogTitle>
              {convertPreview
                ? "Review the schedule"
                : "Start a project from this proposal"}
            </DialogTitle>
            <DialogDescription>
              {convertPreview
                ? "Nothing has been created yet. This is exactly what will be saved when you confirm."
                : "Creates a new project a coordinator can plan and staff. The proposal stays linked to it."}
            </DialogDescription>
          </DialogHeader>

          {convertPreview ? (
            <div className="py-1">
              <SchedulePreviewPanel preview={convertPreview} />
            </div>
          ) : (
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
                  {quote.line_items.filter((li) => li.title.trim()).length}{" "}
                  task(s) will be created, each with its estimated hours, and
                  slotted into phase sprints.
                </span>
              </span>
            </label>
            {convertSeedTasks ? (
              <div className="space-y-1.5">
                <Label>Auto-assign developers &amp; build the timeline</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      ["efficient", "Best-fit"],
                      ["quick", "Fastest"],
                      ["none", "Manual"],
                    ] as const
                  ).map(([val, label]) => (
                    <Button
                      key={val}
                      type="button"
                      size="sm"
                      variant={convertStrategy === val ? "default" : "outline"}
                      className="h-9"
                      onClick={() => setConvertStrategy(val)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {convertStrategy === "efficient"
                    ? "Assigns each dev & QA task to the best-skilled available person; sprint dates follow their capacity."
                    : convertStrategy === "quick"
                      ? "Spreads work across every qualified dev to finish soonest."
                      : "Tasks are created unassigned — you'll assign people yourself."}
                </p>
              </div>
            ) : null}
          </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                convertPreview ? setConvertPreview(null) : setConvertOpen(false)
              }
              disabled={converting}
            >
              {convertPreview ? "Back" : "Cancel"}
            </Button>
            {convertPreview ? (
              <Button
                type="button"
                onClick={() => void handleConvert()}
                disabled={converting || !convertName.trim()}
                className="gap-1.5"
              >
                <FolderPlus className="size-4" aria-hidden />
                {converting ? "Creating…" : "Confirm & create"}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handlePreview}
                disabled={!convertName.trim()}
                className="gap-1.5"
              >
                Review schedule
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Once an estimate has become a project, the project's sprints ARE the
 * timeline. Drawing the estimate's own tentative Gantt beside them is how the
 * two pages came to disagree — the manager moves a sprint, and the estimate
 * carries on showing dates nobody is working to.
 *
 * ponytail: reuse `GanttClient` (already embedded on the project overview the
 * same way) rather than a second renderer that could drift from it.
 */
function LiveProjectTimeline({ projectId }: { projectId: string }) {
  return (
    <div className="space-y-3">
      <p className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Live project timeline</span>{" "}
        — this estimate has a project, so its sprints are the schedule. Edit the
        dates on the{" "}
        <Link
          href={`/projects/${projectId}`}
          className="font-medium text-foreground underline underline-offset-2"
        >
          project page
        </Link>
        ; the tentative estimate timeline no longer applies.
      </p>
      <GanttClient lockedProjectId={projectId} />
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
      <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-border/60 pt-2">
        <dt className="text-sm font-medium">
          Price
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            at {formatAmount(HOURLY_RATE)}/h
          </span>
        </dt>
        <dd className="tabular-nums text-base font-semibold">
          {priceForHours(totals.grandHours)}
        </dd>
      </div>
    </dl>
  );
}

/**
 * How the estimate's hours land on each product — the rows that become the CRM's
 * Packages subform, priced at hours x HOURLY_RATE.
 *
 * Read-only on purpose: the hours come from the estimator, so there is nothing
 * to type and nothing that can drift out of step with the line items. Splitting
 * evenly across products is a stated assumption, shown rather than hidden.
 */
function ProductAllocation({
  products,
  totalHours,
  onChange,
}: {
  products: ZohoProductLink[];
  totalHours: number;
  onChange: (products: ZohoProductLink[]) => void;
}) {
  const shares = splitHours(totalHours, products.length);

  return (
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full min-w-[22rem] text-xs">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="px-2.5 py-1.5 text-left font-medium">Product</th>
            <th className="w-16 px-2 py-1.5 text-right font-medium">Hours</th>
            <th className="w-24 px-2 py-1.5 text-right font-medium">Price</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {products.map((p, i) => (
            <tr key={p.id} className="border-t border-border/50">
              <td className="px-2.5 py-1.5">
                <span className="font-medium">{p.name}</span>
                {p.tag ?? p.category ? (
                  <span className="ml-1.5 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                    {p.tag ?? p.category}
                  </span>
                ) : null}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {shares[i]}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {priceForHours(shares[i])}
              </td>
              <td className="pr-1.5">
                <button
                  type="button"
                  aria-label={`Remove ${p.name}`}
                  className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => onChange(products.filter((x) => x.id !== p.id))}
                >
                  <X className="size-3" aria-hidden />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border/60 bg-muted/20">
            <td className="px-2.5 py-1.5 text-muted-foreground">
              {products.length > 1
                ? "From the estimate, split evenly"
                : "From the estimate"}
            </td>
            <td className="px-2 py-1.5 text-right font-medium tabular-nums">
              {totalHours} h
            </td>
            <td className="px-2 py-1.5 text-right font-medium tabular-nums">
              {priceForHours(totalHours)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
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

  // Details (tier/base/qty/deps) collapse by default — the summary row stays
  // scannable, especially on mobile. A freshly-added freehand row (no title yet)
  // starts expanded so you can set its hours right away.
  const [open, setOpen] = React.useState(() => !line.title.trim());

  return (
    <div className="bg-card p-3 transition-colors hover:bg-muted/30">
      {/* Summary — always visible, scannable */}
      <div className="flex items-center gap-2.5">
        <Badge
          variant="outline"
          className="h-6 w-8 shrink-0 justify-center tabular-nums"
        >
          {index}
        </Badge>
        <div className="min-w-0 flex-1">
          <Input
            value={line.title}
            placeholder="Work package"
            onChange={(e) => onChange({ title: e.target.value })}
            className="h-9"
          />
          <p className="mt-1 truncate text-[0.7rem] tabular-nums text-muted-foreground">
            {tierLabel(shownTier)} · {line.base_hours}h base · ×{line.quantity}
            {requirementsUnclear ? " · priced Advanced" : ""}
            {depCount ? ` · needs ${depPositions.join(", ")}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right leading-none">
          <span className="tabular-nums text-base font-semibold">{effHours}</span>
          <span className="text-xs text-muted-foreground">h</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-expanded={open}
          aria-label={open ? "Hide details" : "Edit details"}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronDown
            className={cn("size-4 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </Button>
      </div>

      {/* Details — tier / base / qty / dependency / remove (collapsed by default) */}
      {open ? (
        <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-border/60 pt-3">
          <div className="flex flex-col gap-1">
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
              <SelectTrigger id={`tier-${line.id}`} className="h-8 w-36">
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
          <div className="flex flex-col gap-1">
            <Label
              htmlFor={`base-${line.id}`}
              className="text-xs text-muted-foreground"
            >
              Base hours
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
              className="h-8 w-24 text-right tabular-nums"
            />
          </div>
          <div className="flex flex-col gap-1">
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
              className="h-8 w-20 text-right tabular-nums"
            />
          </div>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
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
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-destructive"
              aria-label={`Remove line ${index}`}
              onClick={onRemove}
            >
              <Trash2 className="size-3.5" />
              Remove
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
