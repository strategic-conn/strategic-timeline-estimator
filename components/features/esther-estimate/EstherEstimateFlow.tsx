"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileText, Sparkles, TriangleAlert, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ZohoAccountLookup } from "@/components/features/proposals/ZohoAccountLookup";
import {
  contextFromAnswers,
  linesFromDraft,
  schedulePlanFromAnswers,
  uncoveredRequirements,
} from "@/lib/esther/estimate/build";
import type { CatalogActual } from "@/lib/esther/estimate/history";
import {
  ACCEPTED_EXTENSIONS,
  ACCEPTED_LABEL,
  MAX_FILE_BYTES,
  type DraftResult,
  type ScanResult,
} from "@/lib/esther/estimate/types";
import { cn } from "@/lib/utils";
import { EstherFace } from "@/components/features/esther-estimate/EstherFace";
import { useProposalEstimatorStore } from "@/store/proposal-estimator-store";
import type { ProposalZohoLink } from "@/types/proposal.types";

import { EstherDetails, initialDraft, toConfirmed, type DetailsDraft } from "./EstherDetails";
import { EstherMagic } from "./EstherMagic";

/**
 * "Let Esther estimate" — drop the client's document, Esther reads it, asks
 * what's missing, and drafts an estimate that opens in the editor ready for a
 * developer to review. Same end state as a coordinator finishing a manual
 * draft: a line-items estimate, Setup's context and the Adjust tab's schedule
 * filled in, custom lines marked "to confirm".
 *
 * Steps: drop → reading (scan) → details → drafting → saved + opened.
 * Nothing is written until the very end; closing or cancelling at any point
 * leaves no estimate behind.
 */

type Step = "drop" | "reading" | "details" | "drafting";

const ACCEPT = ACCEPTED_EXTENSIONS.join(",");

async function post<T>(url: string, body: FormData, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { method: "POST", body, signal });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      data?.error ??
        (res.status === 504
          ? "Esther took too long. Try again, or split the document."
          : "Esther ran into a problem. Please try again."),
    );
  }
  return data as T;
}

export function EstherEstimateFlow({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const createEstimate = useProposalEstimatorStore((s) => s.createEstimateFromEsther);

  const [step, setStep] = React.useState<Step>("drop");
  const [file, setFile] = React.useState<File | null>(null);
  const [pasteMode, setPasteMode] = React.useState(false);
  const [pasted, setPasted] = React.useState("");
  const [note, setNote] = React.useState("");
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [scan, setScan] = React.useState<ScanResult | null>(null);
  const [fileName, setFileName] = React.useState("");
  const [draft, setDraft] = React.useState<DetailsDraft | null>(null);
  const [zoho, setZoho] = React.useState<ProposalZohoLink | null>(null);
  const [lookupOpen, setLookupOpen] = React.useState(false);
  /** A draft was tried: coming back (failed / stopped) lands on the review. */
  const [tried, setTried] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const reset = () => {
    abortRef.current?.abort();
    setStep("drop");
    setFile(null);
    setPasteMode(false);
    setPasted("");
    setNote("");
    setError(null);
    setScan(null);
    setDraft(null);
    setZoho(null);
    setTried(false);
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    const ext = `.${f.name.toLowerCase().split(".").pop()}`;
    if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
      setError(ACCEPTED_LABEL);
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setError("That file is over 4 MB. Paste the text instead.");
      return;
    }
    setError(null);
    setFile(f);
  };

  /** The document, sent with both calls (the server reads it again for the draft). */
  const documentForm = () => {
    const form = new FormData();
    if (!pasteMode && file) form.set("file", file);
    else form.set("text", pasted);
    return form;
  };

  const canRead = pasteMode ? pasted.trim().length >= 40 : Boolean(file);

  const read = async () => {
    const ctl = new AbortController();
    abortRef.current = ctl;
    setError(null);
    setStep("reading");
    try {
      const form = documentForm();
      form.set("note", note);
      const res = await post<{ scan: ScanResult; fileName: string }>("/api/esther/scan", form, ctl.signal);
      setScan(res.scan);
      setFileName(res.fileName);
      setDraft(initialDraft(res.scan));
      setTried(false);
      setStep("details");
    } catch (e) {
      if (ctl.signal.aborted) return;
      setError((e as Error).message);
      setStep("drop");
    }
  };

  const build = async () => {
    if (!scan || !draft) return;
    const ctl = new AbortController();
    abortRef.current = ctl;
    setError(null);
    setTried(true);
    setStep("drafting");
    const answers = toConfirmed(draft);
    try {
      const form = documentForm();
      form.set("scan", JSON.stringify(scan));
      form.set("answers", JSON.stringify(answers));
      const { draft: result, history } = await post<{
        draft: DraftResult;
        history?: { used: string[]; actuals: Record<number, CatalogActual>; references?: number };
      }>("/api/esther/draft", form, ctl.signal);
      if (ctl.signal.aborted) return;

      const lines = linesFromDraft(result, answers.platform, history?.actuals ?? {});
      const meta = {
        file_name: fileName,
        drafted_at: new Date().toISOString(),
        summary: scan.summary,
        requirements: scan.requirements,
        uncovered: uncoveredRequirements(scan, result),
        open_questions: result.open_questions,
        based_on: history?.used ?? [],
        references_used: history?.references ?? 0,
      };
      const id = await createEstimate({
        title: answers.title,
        client_name: answers.client_name || undefined,
        platform: answers.platform,
        zoho,
        requirements_unclear: result.requirements_unclear,
        line_items: lines,
        context: contextFromAnswers(answers, result, meta),
        schedule_plan: schedulePlanFromAnswers(answers),
      });
      if (!id) {
        setStep("details");
        return;
      }
      const toConfirm = lines.filter((l) => l.catalog_id == null && l.hours_confirmed === false).length;
      toast.success("Esther's estimate is ready", {
        description: toConfirm
          ? `${lines.length} lines. ${toConfirm} new ${toConfirm === 1 ? "task needs" : "tasks need"} a developer to confirm the hours.`
          : `${lines.length} lines, all from your catalog.`,
      });
      close();
      router.push(`/proposals/${id}`);
    } catch (e) {
      if (ctl.signal.aborted) return;
      setError((e as Error).message);
      setStep("details");
    }
  };

  const cancelWork = () => {
    abortRef.current?.abort();
    setStep(step === "drafting" ? "details" : "drop");
  };

  const busy = step === "reading" || step === "drafting";

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) close();
        }}
      >
        <DialogContent
          className="sm:max-w-2xl"
          // A stray click outside would throw away the answers (or a running
          // read). Close with the ✕ or Cancel only.
          onInteractOutside={(e) => e.preventDefault()}
          data-testid="esther-flow"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <EstherFace mood={error ? "sorry" : "idle"} className="size-7" />
              Let Esther estimate
            </DialogTitle>
            <DialogDescription>
              {step === "details"
                ? "A few quick questions, then Esther drafts the estimate."
                : "Drop the client's scope. Esther reads it, asks what's missing, and drafts an estimate for your team to review."}
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}

          {step === "drop" ? (
            <div className="flex flex-col gap-4">
              {pasteMode ? (
                <Textarea
                  aria-label="Client's scope"
                  autoFocus
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  placeholder="Paste the client's email, brief or scope here…"
                  className="min-h-48 text-sm"
                />
              ) : (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    pick(e.dataTransfer.files?.[0]);
                  }}
                  className={cn(
                    "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
                    dragging ? "border-primary bg-primary/10" : "border-border bg-muted/30",
                  )}
                  data-testid="esther-dropzone"
                >
                  {file ? (
                    <div className="flex w-full max-w-sm items-center gap-3 rounded-lg border bg-background px-3 py-2 text-left">
                      <FileText className="size-5 shrink-0 text-primary" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{file.name}</span>
                        <span className="text-xs text-muted-foreground">{`${Math.max(1, Math.round(file.size / 1024))} KB`}</span>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0"
                        aria-label="Remove file"
                        onClick={() => setFile(null)}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <span className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-chart-2 text-primary-foreground" aria-hidden>
                        <Upload className="size-5" />
                      </span>
                      <div>
                        <p className="text-sm font-medium">Drop the client&apos;s document here</p>
                        <p className="text-xs text-muted-foreground">PDF, Word, Excel, CSV or text · up to 4 MB</p>
                      </div>
                    </>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                    {file ? "Choose a different file" : "Choose a file"}
                  </Button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept={ACCEPT}
                    className="hidden"
                    data-testid="esther-file-input"
                    onChange={(e) => {
                      pick(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </div>
              )}
              <button
                type="button"
                className="w-fit text-sm text-primary dark:text-indigo-300 underline-offset-4 hover:underline"
                onClick={() => {
                  setPasteMode((v) => !v);
                  setError(null);
                }}
              >
                {pasteMode ? "Upload a file instead" : "No file? Paste the text instead"}
              </button>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">
                  Anything Esther should know? <span className="font-normal text-muted-foreground">(optional)</span>
                </span>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={1000}
                  rows={2}
                  placeholder="e.g. They already have a logo. Budget is tight."
                />
              </label>
              <p className="text-xs text-muted-foreground">
                {"The document is sent to Anthropic's Claude to read it. Nothing is saved until Esther's estimate is ready."}
              </p>
            </div>
          ) : null}

          {busy ? (
            <EstherMagic
              key={step}
              phase={step === "reading" ? "reading" : "drafting"}
              fileName={pasteMode ? "Pasted scope" : (file?.name ?? fileName)}
            />
          ) : null}

          {step === "details" && scan && draft ? (
            <EstherDetails
              scan={scan}
              fileName={fileName}
              draft={draft}
              setDraft={(update) => setDraft((d) => (d ? update(d) : d))}
              zoho={zoho}
              onFindClient={() => setLookupOpen(true)}
              onBack={() => setStep("drop")}
              onBuild={() => void build()}
              startAtReview={tried}
            />
          ) : null}

          {/* The conversation has its own footer (Back / Next / Build). */}
          {step !== "details" ? (
            <DialogFooter className="sticky -bottom-4 z-10 gap-2 bg-popover sm:items-center">
              {step === "drop" ? (
                <>
                  <Button type="button" variant="outline" onClick={close}>
                    Cancel
                  </Button>
                  <Button type="button" className="gap-2" disabled={!canRead} onClick={() => void read()}>
                    <Sparkles className="size-4" aria-hidden />
                    Let Esther read it
                  </Button>
                </>
              ) : (
                <Button type="button" variant="outline" onClick={cancelWork}>
                  Stop
                </Button>
              )}
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>

      {lookupOpen ? (
        <ZohoAccountLookup
          open
          initialQuery={scan?.client_name ?? ""}
          onClose={() => setLookupOpen(false)}
          onSelect={({ account, contact }) => {
            const name = account.name?.trim();
            if (!name) return;
            setDraft((d) => (d ? { ...d, client_name: name } : d));
            setZoho({
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
      ) : null}
    </>
  );
}
