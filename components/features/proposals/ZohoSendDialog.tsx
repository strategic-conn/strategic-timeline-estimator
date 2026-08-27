"use client";

import { addDays, format } from "date-fns";
import { Briefcase, Check, Loader2, Receipt, Upload } from "lucide-react";
import * as React from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  amountForHours,
  priceForHours,
  quoteTotals,
  splitHours,
} from "@/lib/constants/proposal-estimator";
import { cn } from "@/lib/utils";
import {
  buildProposalPdfBlob,
  proposalPdfFilename,
} from "@/lib/utils/proposal-pdf-export";
import { usePbsClients } from "@/hooks/usePbsClients";
import { PUSHABLE_STAGES, zohoPushes } from "@/lib/zoho/push-state";
import type { ClientQuote } from "@/types/proposal.types";

/**
 * Send this estimate to Zoho CRM — one action for both cases.
 *
 * Whether a deal exists is bookkeeping, not a decision the coordinator should
 * have to make before clicking: if there's no deal it creates one, and if there
 * is, it updates it. Previously these were two differently-named buttons in two
 * different places, which made the state of the quote something you had to work
 * out from which button you could see.
 *
 * Either way the write is previewed first. That matters more now that a send
 * carries the estimate's products and prices into a production CRM, not just a
 * stage change.
 */
export function ZohoSendDialog({
  open,
  onClose,
  quote,
  projectName,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  quote: ClientQuote;
  projectName: string | null;
  onDone: () => void | Promise<void>;
}) {
  const dealId = quote.zoho?.deal_id ?? null;
  const isUpdate = Boolean(dealId);

  const [name, setName] = React.useState(quote.title);
  const [closingDate, setClosingDate] = React.useState(() =>
    format(addDays(new Date(), 30), "yyyy-MM-dd"),
  );
  const [stage, setStage] = React.useState<string>(PUSHABLE_STAGES.discovery);
  const [busy, setBusy] = React.useState(false);
  const [alsoCreatePo, setAlsoCreatePo] = React.useState(true);

  React.useEffect(() => {
    if (open) {
      setName(quote.title);
      setClosingDate(format(addDays(new Date(), 30), "yyyy-MM-dd"));
      setStage(PUSHABLE_STAGES.discovery);
      setAlsoCreatePo(true);
    }
  }, [open, quote.title]);

  const accountId = quote.zoho?.account_id ?? null;
  const totals = quoteTotals(quote);
  const products = quote.zoho?.products ?? [];
  // The same derivation the Setup tab shows, so the review can't disagree with
  // what gets sent.
  const shares = splitHours(totals.grandHours, products.length);
  const alreadySent =
    zohoPushes(quote.zoho)[PUSHABLE_STAGES.proposalSent] ?? null;

  // PBS: a PO is only offered when a billing client has been chosen and no PO
  // exists yet. PBS has no delete endpoint, so "already has one" is final.
  const pbsClientId = quote.pbs?.client_id ?? null;
  const existingPo = quote.pbs?.po_no ?? quote.pbs?.po_id ?? null;
  const canCreatePo = Boolean(pbsClientId) && !existingPo;

  // Load the directory when a PO is actually on the table, so the confirmation
  // can name the exact template rather than describing one. Same resolution
  // order as the server (`lib/pbs/directory.ts`): override first, else the
  // client's own most-used.
  const { clients: pbsDirectory, templateOverride, load: loadPbs } = usePbsClients();
  React.useEffect(() => {
    if (open && canCreatePo) loadPbs();
  }, [open, canCreatePo, loadPbs]);
  const pbsTemplate =
    templateOverride ??
    pbsDirectory.find((c) => c.clientId === pbsClientId)?.templates[0] ??
    null;

  // An update always targets Proposal Sent; a create offers the choice.
  const attaches = isUpdate || stage === PUSHABLE_STAGES.proposalSent;

  // The two halves are gated separately. A quote already pushed to Zoho may
  // still have no PO — every estimate sent before PBS existed is in exactly
  // that state — so "Zoho is done" must not disable the PBS half.
  const zohoTodo = !isUpdate || !alreadySent;
  const pbsTodo = canCreatePo && alsoCreatePo;
  const canSubmit =
    !busy &&
    (isUpdate
      ? zohoTodo || pbsTodo
      : Boolean(accountId && name.trim() && closingDate));

  const productPayload = () =>
    JSON.stringify(
      products.map((p, i) => ({
        id: p.id,
        name: p.name,
        hours: shares[i],
        amount: amountForHours(shares[i]),
      })),
    );

  const descriptionPayload = () =>
    [
      quote.notes?.trim(),
      `Estimate: ${totals.grandHours} h across ${quote.line_items.length} line item${
        quote.line_items.length === 1 ? "" : "s"
      } — ${priceForHours(totals.grandHours)}.`,
      products.length
        ? `Products:\n${products
            .map((p, i) => `  - ${p.name}: ${shares[i]} h, ${priceForHours(shares[i])}`)
            .join("\n")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      // Skip the Zoho half when it's already done and only the PO is left.
      if (zohoTodo) {
        const zohoOk = await sendToZoho();
        if (!zohoOk) return;
      }
      await createPoIfWanted();
      await onDone();
      onClose();
    } catch (e) {
      toast.error("Couldn't send to Zoho", {
        description: e instanceof Error ? e.message : "Unexpected error.",
      });
    } finally {
      setBusy(false);
    }
  };

  /** Returns false when the caller should stop (the write failed). */
  const sendToZoho = async (): Promise<boolean> => {
    {
      const form = new FormData();
      form.append("proposalId", quote.id);
      form.append("products", productPayload());
      form.append("description", descriptionPayload());
      // jsPDF is browser-only, so the bytes are built here and posted to the
      // route, which forwards them to Zoho.
      if (attaches) {
        const blob = await buildProposalPdfBlob(quote, projectName);
        form.append("file", blob, proposalPdfFilename(quote));
      }

      let res: Response;
      if (isUpdate) {
        form.append("stage", PUSHABLE_STAGES.proposalSent);
        res = await fetch(
          `/api/zoho/deals/${encodeURIComponent(dealId!)}/push`,
          { method: "POST", body: form },
        );
      } else {
        form.append("name", name.trim());
        form.append("stage", stage);
        form.append("closingDate", closingDate);
        form.append("accountId", accountId!);
        if (quote.zoho?.contact_id) form.append("contactId", quote.zoho.contact_id);
        res = await fetch("/api/zoho/deals", { method: "POST", body: form });
      }

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(isUpdate ? "Couldn't update the deal" : "Couldn't create the deal", {
          description: data?.error ?? `Request failed (${res.status}).`,
        });
        return false;
      }
      if (data?.alreadyPushed) {
        toast.info("Already sent to Zoho", {
          description: "This stage was pushed before — not sending it again.",
        });
      } else {
        const done = [
          data?.packagesWritten
            ? `${data.packagesWritten} product row${
                data.packagesWritten === 1 ? "" : "s"
              } added`
            : null,
          data?.attachmentUploaded ? "PDF attached" : null,
        ].filter(Boolean);
        toast.success(
          isUpdate
            ? `Deal moved to ${PUSHABLE_STAGES.proposalSent}`
            : `Deal created in Zoho at ${data?.stage ?? stage}`,
          { description: done.length ? done.join(" · ") : undefined },
        );
      }
      for (const w of (data?.warnings ?? []) as string[]) toast.warning(w);
      return true;
    }
  };

  const createPoIfWanted = async () => {
    {
      // PBS second, deliberately. The Zoho writes are idempotent per stage, so a
      // retry re-runs them safely; creating a PO is not, and cannot be undone.
      // Putting the non-idempotent call last means any earlier failure can be
      // retried without risking a duplicate PO.
      if (canCreatePo && alsoCreatePo) {
        try {
          const poRes = await fetch("/api/pbs/pos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              proposalId: quote.id,
              name: isUpdate ? quote.title : name.trim(),
              clientId: pbsClientId,
            }),
          });
          const poData = await poRes.json().catch(() => null);
          if (!poRes.ok) {
            // Zoho already succeeded — say so rather than implying a total
            // failure, and leave the retry to the user.
            toast.warning("Sent to Zoho, but PBS didn't create the PO", {
              description: poData?.error ?? `Request failed (${poRes.status}).`,
            });
          } else {
            toast.success(`PO ${poData?.poNo ?? "created"} in PBS`, {
              description: poData?.templateSource === "client-history"
                ? `Template ${poData.templateId}, from this client's own POs.`
                : undefined,
            });
            for (const w of (poData?.warnings ?? []) as string[]) toast.warning(w);
          }
        } catch (err) {
          toast.warning("Sent to Zoho, but PBS couldn't be reached", {
            description: err instanceof Error ? err.message : "Unexpected error.",
          });
        }
      }
    }
  };
  const zohoRows: [string, React.ReactNode][] = [
    [
      "Stage",
      <>
        <span className="font-medium text-foreground">
          {isUpdate ? PUSHABLE_STAGES.proposalSent : stage}
        </span>
        {isUpdate && quote.zoho?.stage ? ` (from ${quote.zoho.stage})` : null}
      </>,
    ],
    [
      "Packages",
      products.length ? (
        <>
          {products.length} row{products.length === 1 ? "" : "s"} ·{" "}
          <span className="font-medium text-foreground">
            {priceForHours(totals.grandHours)}
          </span>
          {isUpdate ? " · skipped if the deal has rows" : null}
        </>
      ) : (
        "none — add products on Setup"
      ),
    ],
    ["PDF", attaches ? "attached" : "not attached"],
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      {/* Fixed header and footer with a scrolling middle: the body grows with
          the estimate (products, skip notes), and the confirm button must never
          be the thing that scrolls off. */}
      <DialogContent className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 space-y-0.5 border-b border-border/60 p-4 pb-3 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <Upload className="size-4 shrink-0 text-primary" aria-hidden />
            {isUpdate ? "Update Zoho deal" : "Send to Zoho"}
            {canCreatePo ? (
              <span className="text-muted-foreground">+ PBS</span>
            ) : null}
          </DialogTitle>
          <DialogDescription className="truncate text-xs">
            {quote.zoho?.account ?? quote.client_name ?? quote.title}
            {quote.zoho?.contact ? ` · ${quote.zoho.contact}` : null}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {!isUpdate ? (
            <>
              {!accountId ? (
                <p className="rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-400">
                  No Zoho account linked. Use <strong>Find in Zoho</strong> on the
                  Client field first — a deal must hang off an existing company.
                </p>
              ) : null}

              <div className="grid gap-1.5">
                <Label htmlFor="zdeal-name" className="text-xs">
                  Deal name
                </Label>
                <Input
                  id="zdeal-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={255}
                  className="h-9"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="zdeal-close" className="text-xs">
                    Closing date
                  </Label>
                  <Input
                    id="zdeal-close"
                    type="date"
                    value={closingDate}
                    onChange={(e) => setClosingDate(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Open at</Label>
                  {/* Segmented control rather than two description cards: the
                      consequence of each is already spelled out below. */}
                  <div className="flex h-9 rounded-md border border-border/60 p-0.5">
                    {[PUSHABLE_STAGES.discovery, PUSHABLE_STAGES.proposalSent].map(
                      (opt) => (
                        <button
                          key={opt}
                          type="button"
                          aria-pressed={stage === opt}
                          onClick={() => setStage(opt)}
                          className={cn(
                            "flex-1 rounded-[0.3rem] px-1 text-xs font-medium transition-colors",
                            stage === opt
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {opt === PUSHABLE_STAGES.discovery ? "Discovery" : "Proposal"}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {/* ── What lands where. Two systems in one click, neither reversible,
              so each destination states its own outcome. ── */}
          <section className="overflow-hidden rounded-md border border-border/60">
            <h3 className="flex items-baseline gap-1.5 border-b border-border/50 bg-muted/30 px-2.5 py-1.5 text-xs font-semibold">
              <Briefcase className="size-3 self-center text-primary" aria-hidden />
              Zoho CRM
              <span className="truncate font-normal text-muted-foreground">
                {isUpdate
                  ? (quote.zoho?.deal_name ?? "linked deal")
                  : name.trim() || "new deal"}
              </span>
            </h3>
            <dl className="px-2.5 py-1.5 text-xs">
              {zohoRows.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 py-0.5">
                  <dt className="shrink-0 text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 truncate text-right text-muted-foreground">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            {products.length ? (
              <ul className="border-t border-border/40 px-2.5 py-1.5 text-[0.7rem] text-muted-foreground">
                {products.slice(0, 3).map((p, i) => (
                  <li key={p.id} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">{p.name}</span>
                    <span className="shrink-0 tabular-nums">
                      {shares[i]} h · {priceForHours(shares[i])}
                    </span>
                  </li>
                ))}
                {products.length > 3 ? (
                  <li className="pt-0.5">+{products.length - 3} more</li>
                ) : null}
              </ul>
            ) : null}
          </section>

          <section className="overflow-hidden rounded-md border border-border/60">
            <h3 className="flex items-baseline gap-1.5 border-b border-border/50 bg-muted/30 px-2.5 py-1.5 text-xs font-semibold">
              <Receipt className="size-3 self-center text-primary" aria-hidden />
              PBS billing
              <span className="truncate font-normal text-muted-foreground">
                {existingPo
                  ? `already ${existingPo}`
                  : canCreatePo
                    ? `new PO · ${quote.pbs?.client_code ?? pbsClientId}`
                    : "nothing to send"}
              </span>
            </h3>
            {existingPo ? (
              <p className="px-2.5 py-1.5 text-xs text-muted-foreground">
                Already billed. PBS can&apos;t update or remove a PO, so no second
                one is created.
              </p>
            ) : canCreatePo ? (
              <>
                <dl className="px-2.5 py-1.5 text-xs">
                  <div className="flex justify-between gap-3 py-0.5">
                    <dt className="shrink-0 text-muted-foreground">Template</dt>
                    <dd className="min-w-0 truncate text-right text-muted-foreground">
                      {pbsTemplate ? (
                        <>
                          {pbsTemplate}
                          {templateOverride ? " · set for all" : " · client default"}
                        </>
                      ) : (
                        "from this client's POs"
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3 py-0.5">
                    <dt className="shrink-0 text-muted-foreground">PO name</dt>
                    <dd className="min-w-0 truncate text-right text-muted-foreground">
                      {(isUpdate ? quote.title : name.trim()) || "—"}
                    </dd>
                  </div>
                </dl>
                <label className="flex cursor-pointer items-start gap-2 border-t border-border/40 px-2.5 py-1.5 text-[0.7rem]">
                  <input
                    type="checkbox"
                    checked={alsoCreatePo}
                    onChange={(ev) => setAlsoCreatePo(ev.target.checked)}
                    className="mt-0.5 size-3.5 accent-primary"
                  />
                  <span>
                    Create this PO — the number comes from PBS, the amount
                    doesn&apos;t (PBS pins new POs to 0). Can&apos;t be undone.
                  </span>
                </label>
              </>
            ) : (
              <p className="px-2.5 py-1.5 text-xs text-muted-foreground">
                No billing client — pick one on the <strong>Setup</strong> tab.
              </p>
            )}
          </section>

          {alreadySent ? (
            <p className="flex items-start gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1.5 text-[0.7rem] text-emerald-700 dark:text-emerald-400">
              <Check className="mt-0.5 size-3 shrink-0" aria-hidden />
              <span>
                Sent to Zoho on {new Date(alreadySent).toLocaleDateString()} — the
                stage and PDF won&apos;t go again.
                {pbsTodo ? " The PO can still be created." : null}
              </span>
            </p>
          ) : null}
        </div>

        <DialogFooter className="mx-0 mb-0 shrink-0 gap-2 border-t border-border/60 p-3 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={submit}
            disabled={!canSubmit}
            className="gap-2"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {busy
              ? "Sending…"
              : !zohoTodo
                ? pbsTodo
                  ? "Create PO"
                  : "Already sent"
                : pbsTodo
                  ? isUpdate
                    ? "Update deal + PO"
                    : "Create deal + PO"
                  : isUpdate
                    ? "Update deal"
                    : "Create deal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
