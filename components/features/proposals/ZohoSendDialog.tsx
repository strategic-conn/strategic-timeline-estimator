"use client";

import { addDays, format } from "date-fns";
import { Briefcase, Building2, Check, Loader2, Upload } from "lucide-react";
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

  React.useEffect(() => {
    if (open) {
      setName(quote.title);
      setClosingDate(format(addDays(new Date(), 30), "yyyy-MM-dd"));
      setStage(PUSHABLE_STAGES.discovery);
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

  // An update always targets Proposal Sent; a create offers the choice.
  const attaches = isUpdate || stage === PUSHABLE_STAGES.proposalSent;
  const canSubmit =
    !busy &&
    !alreadySent &&
    (isUpdate ? true : Boolean(accountId && name.trim() && closingDate));

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
        return;
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

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            {isUpdate ? (
              <Upload className="size-4 shrink-0 text-primary" aria-hidden />
            ) : (
              <Briefcase className="size-4 shrink-0 text-primary" aria-hidden />
            )}
            {isUpdate ? "Update the Zoho deal" : "Create a Zoho deal from this estimate"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isUpdate
              ? "Sends this estimate to the deal it's linked to. Anything the deal already has is left alone."
              : "Opens a new Deal on the linked account and links it to this quote. Amount and Quote # are computed by Zoho."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {isUpdate ? (
            <div className="grid gap-2">
              <Label>Linked deal</Label>
              <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                <span className="font-medium">
                  {quote.zoho?.deal_name ?? "Zoho deal"}
                </span>
                {quote.zoho?.stage ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · currently {quote.zoho.stage}
                  </span>
                ) : null}
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-2">
                <Label htmlFor="zdeal-name">Deal name</Label>
                <Input
                  id="zdeal-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={255}
                />
              </div>

              <div className="grid gap-2">
                <Label>Account</Label>
                {accountId ? (
                  <p className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                    <Building2
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    {quote.zoho?.account ?? "Linked account"}
                    {quote.zoho?.contact ? (
                      <span className="text-muted-foreground">
                        · {quote.zoho.contact}
                      </span>
                    ) : null}
                  </p>
                ) : (
                  <p className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                    No Zoho account linked. Use <strong>Find in Zoho</strong> on the
                    Client field first — a deal has to hang off an existing company,
                    and this app never creates one.
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="zdeal-close">Closing date</Label>
                <Input
                  id="zdeal-close"
                  type="date"
                  value={closingDate}
                  onChange={(e) => setClosingDate(e.target.value)}
                  className="max-w-52"
                />
              </div>
            </>
          )}

          <div className="grid gap-2">
            <Label>What gets sent</Label>
            <div className="rounded-lg border border-border/60 text-sm">
              <div className="flex items-baseline justify-between gap-4 px-3 py-2">
                <span className="text-muted-foreground">Estimate</span>
                <span className="tabular-nums">
                  <span className="font-medium">
                    {priceForHours(totals.grandHours)}
                  </span>
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {totals.grandHours} h
                  </span>
                </span>
              </div>
              {products.length ? (
                <ul className="border-t border-border/50">
                  {products.map((p, i) => (
                    <li
                      key={p.id}
                      className="flex items-baseline justify-between gap-4 px-3 py-1.5 text-xs"
                    >
                      <span className="min-w-0 truncate">
                        {p.name}
                        {p.tag ?? p.category ? (
                          <span className="ml-1.5 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                            {p.tag ?? p.category}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {shares[i]} h · {priceForHours(shares[i])}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-t border-border/50 px-3 py-2 text-xs text-muted-foreground">
                  No products picked — add them on the Setup tab if this deal
                  should name what it sells.
                </p>
              )}
              <ul className="border-t border-border/50 px-3 py-2 text-[0.7rem] text-muted-foreground">
                <li>
                  Stage → <strong>{isUpdate ? PUSHABLE_STAGES.proposalSent : stage}</strong>
                </li>
                <li>{attaches ? "Attaches the proposal PDF" : "No attachment"}</li>
                <li>
                  {products.length
                    ? "Products go in the deal's Packages table"
                    : "Estimate total goes in the description"}
                  {isUpdate ? " — skipped if the deal already has its own" : null}
                </li>
              </ul>
            </div>
          </div>

          {!isUpdate ? (
            <div className="grid gap-2">
              <Label>Open it at</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  {
                    value: PUSHABLE_STAGES.discovery,
                    hint: "Still scoping — no attachment.",
                  },
                  {
                    value: PUSHABLE_STAGES.proposalSent,
                    hint: "Attaches the proposal PDF.",
                  },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={stage === opt.value}
                    onClick={() => setStage(opt.value)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors",
                      stage === opt.value
                        ? "border-primary bg-primary/5"
                        : "border-border/60 hover:border-primary/40 hover:bg-muted/40",
                    )}
                  >
                    <span className="block text-sm font-medium">{opt.value}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {opt.hint}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {alreadySent ? (
            <p className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
              <Check className="size-3.5 shrink-0" aria-hidden />
              Already sent on {new Date(alreadySent).toLocaleString()} — the PDF
              isn&apos;t attached twice.
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="gap-2"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {busy
              ? "Sending…"
              : alreadySent
                ? "Already sent"
                : isUpdate
                  ? "Update deal"
                  : "Create deal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
