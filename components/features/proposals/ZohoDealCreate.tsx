"use client";

import { addDays, format } from "date-fns";
import { Briefcase, Building2, Loader2 } from "lucide-react";
import * as React from "react";

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
import { PUSHABLE_STAGES } from "@/lib/zoho/push-state";
import type { ClientQuote } from "@/types/proposal.types";
import { toast } from "sonner";

/**
 * Open a NEW Zoho Deal from an estimate that never came from one — the inverse
 * of "Import from Zoho".
 *
 * Two stages are offered, and the choice decides whether the PDF goes with it:
 * a deal opened at Discovery is a scoping placeholder with nothing to send yet,
 * while Proposal Sent means the quote is going to the client, so the PDF is
 * attached and recorded as that stage's push (Zoho does not dedupe attachments,
 * so the editor's own push button must not send it again).
 *
 * An Account is required and never created here: picking the wrong company in a
 * CRM with ~4k accounts is how duplicates start, so the coordinator links one
 * with "Find in Zoho" first.
 */
export function ZohoDealCreate({
  open,
  onClose,
  quote,
  projectName,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  quote: ClientQuote;
  projectName: string | null;
  onCreated: () => void | Promise<void>;
}) {
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
  const attaches = stage === PUSHABLE_STAGES.proposalSent;
  const totals = quoteTotals(quote);
  const products = quote.zoho?.products ?? [];
  // Same derivation the Setup tab shows, so the review can't disagree with it.
  const shares = splitHours(totals.grandHours, products.length);
  const canSubmit = Boolean(accountId && name.trim() && closingDate) && !busy;

  const submit = async () => {
    if (!canSubmit || !accountId) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("proposalId", quote.id);
      form.append("name", name.trim());
      form.append("stage", stage);
      form.append("closingDate", closingDate);
      form.append("accountId", accountId);
      if (quote.zoho?.contact_id) form.append("contactId", quote.zoho.contact_id);
      // Until the "Packages" subform's API name is known, the picked products
      // ride along in Description — a standard field, so no guessing — which at
      // least puts them on the deal where sales will look.
      // The reviewer just saw hours, price and the per-product split, so the
      // deal should carry the same figures — names alone would lose the point.
      const summary = [
        quote.notes?.trim(),
        `Estimate: ${totals.grandHours} h across ${quote.line_items.length} line item${
          quote.line_items.length === 1 ? "" : "s"
        } — ${priceForHours(totals.grandHours)}.`,
        products.length
          ? `Products:\n${products
              .map(
                (p, i) => `  - ${p.name}: ${shares[i]} h, ${priceForHours(shares[i])}`,
              )
              .join("\n")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n");
      form.append("description", summary);
      // The same rows the dialog just showed — hours and price per product —
      // so the CRM's Packages table matches the review exactly.
      form.append(
        "products",
        JSON.stringify(
          products.map((p, i) => ({
            id: p.id,
            name: p.name,
            hours: shares[i],
            amount: amountForHours(shares[i]),
          })),
        ),
      );
      // The PDF is only meaningful for a deal opened at Proposal Sent, and jsPDF
      // is browser-only, so the bytes are built here and posted to the route.
      if (attaches) {
        const blob = await buildProposalPdfBlob(quote, projectName);
        form.append("file", blob, proposalPdfFilename(quote));
      }

      const res = await fetch("/api/zoho/deals", { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error("Couldn't create the deal", {
          description: data?.error ?? `Request failed (${res.status}).`,
        });
        return;
      }
      const done = [
        data?.packagesWritten
          ? `${data.packagesWritten} product row${data.packagesWritten === 1 ? "" : "s"} added`
          : null,
        data?.attachmentUploaded ? "PDF attached" : null,
      ].filter(Boolean);
      toast.success(`Deal created in Zoho at ${data?.stage ?? stage}`, {
        description: done.length ? done.join(" · ") : undefined,
      });
      for (const w of (data?.warnings ?? []) as string[]) toast.warning(w);
      await onCreated();
      onClose();
    } catch (e) {
      toast.error("Couldn't create the deal", {
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
            <Briefcase className="size-4 shrink-0 text-primary" aria-hidden />
            Create a Zoho deal from this estimate
          </DialogTitle>
          <DialogDescription className="text-xs">
            Opens a new Deal on the linked account and links it to this quote.
            Only the fields below are written — Amount and Quote # are computed
            by Zoho.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
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
                <Building2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
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

          <div className="grid gap-2">
            <Label>What goes with it</Label>
            <div className="rounded-lg border border-border/60 text-sm">
              <div className="flex items-baseline justify-between gap-4 px-3 py-2">
                <span className="text-muted-foreground">Estimate</span>
                <span className="tabular-nums">
                  <span className="font-medium">{priceForHours(totals.grandHours)}</span>
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
              <p className="border-t border-border/50 px-3 py-1.5 text-[0.7rem] text-muted-foreground">
                Products are written as rows in the deal&apos;s Packages table,
                priced from the estimate, and repeated in the Description.
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Open it at</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                {
                  value: PUSHABLE_STAGES.discovery,
                  title: PUSHABLE_STAGES.discovery,
                  hint: "Still scoping — no attachment.",
                },
                {
                  value: PUSHABLE_STAGES.proposalSent,
                  title: PUSHABLE_STAGES.proposalSent,
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
                  <span className="block text-sm font-medium">{opt.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {opt.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={!canSubmit} className="gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {busy ? "Creating…" : "Create deal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
