"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  FileDown,
  FileSpreadsheet,
  Plus,
  Printer,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { ProposalAccessDenied } from "@/components/features/proposals/ProposalAccessDenied";
import { WorkspacePageHeader } from "@/components/layouts/workspace-page-header";
import { ProposalPdfPreviewMock } from "@/components/features/proposals/ProposalPdfPreviewMock";
import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/usePermissions";
import { COMPLEXITY_OPTIONS } from "@/lib/constants/proposal-estimator";
import { downloadProposalExcel } from "@/lib/utils/proposal-excel-export";
import { downloadProposalPdf } from "@/lib/utils/proposal-pdf-export";
import { useProjectsStore } from "@/store/projects-store";
import { useProposalEstimatorStore } from "@/store/proposal-estimator-store";
import type { ProposalComplexity } from "@/types/proposal.types";

type ProposalEditorClientProps = {
  proposalId: string;
};

export function ProposalEditorClient({ proposalId }: ProposalEditorClientProps) {
  const { canExportProposals } = usePermissions();
  const router = useRouter();
  const projects = useProjectsStore((s) => s.projects);
  const quote = useProposalEstimatorStore((s) =>
    s.proposals.find((p) => p.id === proposalId)
  );
  const updateProposal = useProposalEstimatorStore((s) => s.updateProposal);
  const addLineItem = useProposalEstimatorStore((s) => s.addLineItem);
  const updateLineItem = useProposalEstimatorStore((s) => s.updateLineItem);
  const removeLineItem = useProposalEstimatorStore((s) => s.removeLineItem);

  const [hydrated, setHydrated] = React.useState(() =>
    useProposalEstimatorStore.persist.hasHydrated()
  );

  React.useEffect(() => {
    if (useProposalEstimatorStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    const unsub = useProposalEstimatorStore.persist.onFinishHydration(() => {
      setHydrated(true);
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

  const totalHours = quote
    ? quote.line_items.reduce((s, li) => s + li.hours, 0)
    : 0;

  const handlePrint = () => {
    window.print();
  };

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

  if (!canExportProposals) {
    return <ProposalAccessDenied />;
  }

  if (!hydrated || !quote) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 py-8 text-sm text-muted-foreground">
        <p>Loading quote…</p>
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="print:hidden">
        <Button variant="ghost" size="sm" className="w-fit gap-2 px-0" asChild>
          <Link href="/proposals">
            <ArrowLeft className="size-4" aria-hidden />
            All proposals
          </Link>
        </Button>
      </div>

      <WorkspacePageHeader
        eyebrow="Quote editor"
        title={
          <span className="wrap-break-word">{quote.title}</span>
        }
        description={
          [
            quote.client_name ? `Client: ${quote.client_name}` : null,
            projectName ? `Project: ${projectName}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "Line items, complexity tiers, and export preview."
        }
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-2 border-border/60 bg-background/80 sm:w-auto"
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
        }
      />

      <div className="grid gap-8 lg:grid-cols-[1fr,min(24rem,40vw)] xl:grid-cols-[1fr,28rem]">
        <div className="space-y-6 print:hidden">
          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>

          <div className="grid gap-2">
            <Label htmlFor="meta-notes">Notes (optional)</Label>
            <Textarea
              id="meta-notes"
              rows={3}
              value={quote.notes ?? ""}
              placeholder="Assumptions, exclusions, or pricing context"
              onChange={(e) =>
                updateProposal(quote.id, { notes: e.target.value || undefined })
              }
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <Label className="text-base">Line items</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => addLineItem(quote.id)}
              >
                <Plus className="size-4" aria-hidden />
                Add row
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-32">Description</TableHead>
                  <TableHead className="w-38">Complexity</TableHead>
                  <TableHead className="w-20 text-right">Hours</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {quote.line_items.map((li) => (
                  <TableRow key={li.id}>
                    <TableCell className="align-top">
                      <Input
                        value={li.title}
                        placeholder="Work package"
                        onChange={(e) =>
                          updateLineItem(quote.id, li.id, {
                            title: e.target.value,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <Select
                        value={li.complexity}
                        onValueChange={(v) =>
                          updateLineItem(quote.id, li.id, {
                            complexity: v as ProposalComplexity,
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COMPLEXITY_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="align-middle text-right tabular-nums text-muted-foreground">
                      {li.hours}
                    </TableCell>
                    <TableCell className="align-top">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Remove line"
                        onClick={() => removeLineItem(quote.id, li.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="text-right font-medium">
                    Total hours
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {totalHours}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </div>

        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground print:hidden">
            Client preview (print / PDF)
          </p>
          <ProposalPdfPreviewMock quote={quote} projectName={projectName} />
        </div>
      </div>
    </div>
    </>
  );
}
