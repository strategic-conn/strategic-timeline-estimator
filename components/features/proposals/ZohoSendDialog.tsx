"use client";

import { addDays, format } from "date-fns";
import { Briefcase, Check, Loader2, TriangleAlert, Upload } from "lucide-react";
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
  formatAmount,
  quotePricing,
  rateSummary,
  splitAmount,
  splitHours,
} from "@/lib/constants/proposal-estimator";
import {
  buildProposalPdfBlob,
  proposalPdfFilename,
} from "@/lib/utils/proposal-pdf-export";
import {
  PUSHABLE_STAGES,
  shouldAttach,
  zohoAttachments,
} from "@/lib/zoho/push-state";
import type { ClientQuote } from "@/types/proposal.types";

/** Product id → catalogue description. One read per page load. */
let productDescriptionCache: Record<string, string> | null = null;

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
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(quote.title);
      setClosingDate(format(addDays(new Date(), 30), "yyyy-MM-dd"));
    }
  }, [open, quote.title]);

  /**
   * Catalogue descriptions for this quote's products, keyed by product id.
   *
   * Fetched rather than read off the quote: `zoho.products` stores the id, name
   * and price picked at the time, not the description — and quotes saved before
   * this existed carry none at all. Reading the live catalogue means an existing
   * estimate shows its descriptions without anyone re-picking products, and the
   * copy is whatever Zoho says today.
   *
   * Module-scoped cache, like the stage picklist: one read per page load, shared
   * by every estimate you open.
   */
  const [descriptions, setDescriptions] = React.useState<Record<string, string>>(
    productDescriptionCache ?? {},
  );
  /**
   * The catalogue read is the slowest thing in this dialog, and the payload is
   * built from its result at click time — so submitting before it lands wrote
   * the "N h at $R/h" fallback into the CRM even though the product HAS a
   * description. Blocking the button is the honest fix: the alternative is a
   * send whose content depends on how fast you clicked.
   */
  const [loadingDescriptions, setLoadingDescriptions] = React.useState(false);
  React.useEffect(() => {
    if (!open || !quote.zoho?.products?.length) return;
    if (productDescriptionCache) {
      setDescriptions(productDescriptionCache);
      return;
    }
    let active = true;
    setLoadingDescriptions(true);
    void (async () => {
      try {
        const res = await fetch("/api/zoho/products");
        const data = await res.json().catch(() => null);
        if (!res.ok || !active) return;
        const map: Record<string, string> = {};
        for (const r of (data?.products ?? []) as {
          id?: string;
          description?: string | null;
        }[]) {
          if (r.id && r.description) map[r.id] = r.description;
        }
        productDescriptionCache = map;
        setDescriptions(map);
      } catch {
        // A catalogue that can't be read is a fine outcome — the row falls back
        // to the hours-and-rate note. Only an unfinished read is a problem,
        // because that one silently looks like "no description".
      } finally {
        if (active) setLoadingDescriptions(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [open, quote.zoho?.products]);

  /**
   * What the deal holds in Zoho *right now* — amount and Packages row count.
   *
   * Read on every open and never cached: this is the number the confirm button
   * is about to overwrite, so a stale one would defeat the point. `zoho.amount`
   * on the quote is the last value the app happened to see, which is exactly
   * what goes wrong when sales edits the deal.
   */
  const [live, setLive] = React.useState<{
    amount: number | null;
    /** `null` = Zoho answered but the subform couldn't be resolved: unknown. */
    packageRows: number | null;
  } | null>(null);
  /**
   * Submit waits on this, not just on the catalogue read. The row count IS the
   * preview — confirming an irreversible subform replace before it arrives
   * means agreeing to "replaces any existing rows", which is exactly the
   * uninformed click this dialog exists to prevent. A read that *fails* still
   * lets the send through; only an unfinished one blocks.
   */
  const [loadingLive, setLoadingLive] = React.useState(false);
  React.useEffect(() => {
    if (!open || !dealId) {
      setLive(null);
      return;
    }
    const ctl = new AbortController();
    setLoadingLive(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/zoho/deals/stages?ids=${encodeURIComponent(dealId)}`,
          { signal: ctl.signal },
        );
        const d = await res.json().catch(() => null);
        if (!res.ok || !d) return;
        setLive({
          amount: d.amounts?.[dealId] ?? null,
          packageRows: d.packageRows?.[dealId] ?? null,
        });
      } catch {
        // Offline or Zoho down. The send still works; it just can't promise
        // what it is replacing, and the copy below says so rather than guessing.
      } finally {
        if (!ctl.signal.aborted) setLoadingLive(false);
      }
    })();
    return () => ctl.abort();
  }, [open, dealId]);

  const accountId = quote.zoho?.account_id ?? null;
  const pricing = quotePricing(quote);
  const totals = pricing.totals;
  const products = quote.zoho?.products ?? [];
  // The same derivation the Setup tab shows, so the review can't disagree with
  // what gets sent. MONEY is split directly, never "hour share x a rate": lines
  // carry their own rates now, so there is no single rate to multiply by.
  const shares = splitHours(totals.grandHours, products.length);
  const amounts = splitAmount(pricing.grandAmount, products.length);
  // "Sent" = this estimate's document reached the deal. Keying it on a stage
  // stopped working once every send targets Discovery, which an import records
  // on its own — the attachment is the thing that actually marks a send.
  const sentAt = Object.values(zohoAttachments(quote.zoho)).sort();
  const alreadySent = sentAt.length ? sentAt[sentAt.length - 1] : null;

  // Nothing about billing lives here. A PO is raised from its own dialog once
  // the deal is won, and that dialog picks the client — one place to choose it,
  // at the moment it is actually acted on.

  // The proposal PDF goes up at whichever stage the deal opens at — sales reads
  // it during Discovery, not only once the quote is formally sent. The guard is
  // the filename, not the stage: the same document is never attached twice (Zoho
  // doesn't dedupe and there's no DELETE scope), but an estimate edited later
  // produces a new filename and its updated PDF does go up.
  const attaches = shouldAttach(quote.zoho, proposalPdfFilename(quote));

  /** Rows already on the deal that this send will overwrite. */
  const replacingRows =
    isUpdate && typeof live?.packageRows === "number" ? live.packageRows : 0;
  /**
   * The read finished but couldn't say how many rows are there — a failed
   * fetch, or Zoho answered without a resolvable Packages subform. Treated as
   * "there may be rows", never as "there are none": this gates the warning
   * before an irreversible overwrite.
   */
  const rowsUnknown =
    isUpdate && !loadingLive && (!live || live.packageRows === null);
  /** The CRM price and the estimate price disagree — the reprice is the point. */
  const priceMoves =
    isUpdate &&
    live?.amount != null &&
    live.amount !== pricing.grandAmount;

  // A quote already at Proposal Sent can still be re-sent: the stage write is a
  // no-op and the PDF is deduped by filename, so an edited estimate's updated
  // document still reaches the deal.
  const reading = loadingDescriptions || loadingLive;
  const canSubmit =
    !busy &&
    !reading &&
    (isUpdate || Boolean(accountId && name.trim() && closingDate));

  const productPayload = () =>
    JSON.stringify(
      products.map((p, i) => ({
        id: p.id,
        name: p.name,
        hours: shares[i],
        amount: amounts[i],
        description: descriptions[p.id] ?? null,
      })),
    );

  const descriptionPayload = () =>
    [
      quote.notes?.trim(),
      `Estimate: ${totals.grandHours} h across ${quote.line_items.length} line item${
        quote.line_items.length === 1 ? "" : "s"
      } — ${formatAmount(pricing.grandAmount)}.`,
      products.length
        ? `Products:\n${products
            .map((p, i) => {
              const line = `  - ${p.name}: ${shares[i]} h, ${formatAmount(amounts[i])}`;
              const desc = descriptions[p.id];
              // The catalogue copy, indented under its product — the same text
              // the Packages row carries, so the deal reads consistently
              // whichever field someone looks at.
              return desc ? `${line}\n      ${desc}` : line;
            })
            .join("\n")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const zohoOk = await sendToZoho();
      if (!zohoOk) return;
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
      // The estimate's price. It reaches Zoho as a Packages row, never as a
      // direct `Amount` write — Zoho recomputes that field from the subform.
      form.append("totalHours", String(totals.grandHours));
      form.append("totalAmount", String(pricing.grandAmount));
      // The estimate owns its own pricing, so a re-send reprices the deal rather
      // than skipping a table that already has rows — which is what made an
      // edited estimate silently fail to update its deal. Safe only because the
      // rows above showed what is being replaced.
      if (isUpdate) form.append("replace", "1");
      // jsPDF is browser-only, so the bytes are built here and posted to the
      // route, which forwards them to Zoho.
      if (attaches) {
        const blob = await buildProposalPdfBlob(quote, projectName);
        form.append("file", blob, proposalPdfFilename(quote));
      }

      let res: Response;
      if (isUpdate) {
        form.append("stage", PUSHABLE_STAGES.discovery);
        res = await fetch(
          `/api/zoho/deals/${encodeURIComponent(dealId!)}/push`,
          { method: "POST", body: form },
        );
      } else {
        form.append("name", name.trim());
        form.append("stage", PUSHABLE_STAGES.discovery);
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
      const done = [
        data?.packagesWritten
          ? `${data.packagesWritten} Packages row${
              data.packagesWritten === 1 ? "" : "s"
            } ${data.packagesReplaced ? `replaced (was ${data.packagesReplaced})` : "written"}`
          : null,
        data?.attachmentUploaded ? "PDF attached" : null,
      ].filter(Boolean);
      toast.success(
        !isUpdate
          ? `Deal created in Zoho at ${data?.stage ?? PUSHABLE_STAGES.discovery}`
          : data?.skipped
            ? `Estimate sent to ${quote.zoho?.deal_name ?? "the deal"}`
            : data?.stageAlreadySet
              ? `Deal already at ${PUSHABLE_STAGES.discovery}`
              : `Deal moved to ${PUSHABLE_STAGES.discovery}`,
        { description: done.length ? done.join(" · ") : undefined },
      );
      for (const w of (data?.warnings ?? []) as string[]) toast.warning(w);
      return true;
    }
  };

  const zohoRows: [string, React.ReactNode][] = [
    [
      "Stage",
      <>
        <span className="font-medium text-foreground">
          {PUSHABLE_STAGES.discovery}
        </span>
        {/* The stage only moves forward. A deal sales has already carried past
            Discovery keeps its stage; the PDF and Packages still go up. */}
        {isUpdate && quote.zoho?.stage && quote.zoho.stage !== PUSHABLE_STAGES.discovery
          ? ` — or left at ${quote.zoho.stage}, whichever is further along`
          : null}
      </>,
    ],
    [
      "Amount",
      <span key="amount" className="font-medium text-foreground">
        {/* Zoho derives Amount from the Packages rows, so showing the live value
            beside the new one is the only honest preview of a reprice. */}
        {priceMoves ? (
          <>
            <s className="font-normal text-muted-foreground">
              {formatAmount(live!.amount!)}
            </s>{" "}
            →{" "}
          </>
        ) : null}
        {formatAmount(pricing.grandAmount)}
      </span>,
    ],
    ["Hours", `${totals.grandHours} h ${rateSummary(pricing)}`.trim()],
    [
      "Packages",
      <>
        {products.length ? (
          <>
            {products.length} row{products.length === 1 ? "" : "s"} ·{" "}
            <span className="font-medium text-foreground">
              {formatAmount(pricing.grandAmount)}
            </span>
          </>
        ) : (
          "1 row · no product"
        )}
        {replacingRows
          ? ` · replaces ${replacingRows} existing row${replacingRows === 1 ? "" : "s"}`
          : rowsUnknown
            ? " · replaces any existing rows"
            : null}
      </>,
    ],
    ["PDF", attaches ? "attached" : "already on the deal — not sent twice"],
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

              <div className="grid gap-3">
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
                  <li key={p.id} className="py-0.5">
                    <div className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{p.name}</span>
                      <span className="shrink-0 tabular-nums">
                        {shares[i]} h · {formatAmount(amounts[i])}
                      </span>
                    </div>
                    {/* The exact text that lands in the row's Description
                        column — previewed for the same reason as everything
                        else here: nothing reaches the CRM unseen. */}
                    <p className="mt-0.5 line-clamp-2 text-[0.65rem] text-muted-foreground/80">
                      {loadingDescriptions
                        ? "Reading the catalogue description…"
                        : (descriptions[p.id] ?? `${shares[i]} h`)}
                    </p>
                  </li>
                ))}
                {products.length > 3 ? (
                  <li className="pt-0.5">+{products.length - 3} more</li>
                ) : null}
              </ul>
            ) : (
              /* Same slot the product list uses, so saying this costs no height.
                 A row with no Product is valid and still carries the price —
                 but it's worth knowing before it lands in the CRM. */
              <p className="flex items-start gap-1.5 border-t border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[0.7rem] text-amber-700 dark:text-amber-400">
                <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                <span>
                  <strong className="font-semibold">No product selected.</strong>{" "}
                  The row carries the price and hours only, so Zoho&apos;s{" "}
                  <strong className="font-semibold">Product</strong> column stays
                  empty. Add products on{" "}
                  <strong className="font-semibold">Setup</strong> to itemise it.
                </span>
              </p>
            )}
          </section>

          {replacingRows || rowsUnknown ? (
            <p className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[0.7rem] text-amber-700 dark:text-amber-400">
              <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
              <span>
                <strong className="font-semibold">
                  {replacingRows
                    ? `Replaces ${replacingRows} Packages row${
                        replacingRows === 1 ? "" : "s"
                      } on the deal.`
                    : "Replaces any Packages rows on the deal."}
                </strong>{" "}
                That is how the estimate&apos;s price reaches Zoho — it
                recomputes <strong className="font-semibold">Amount</strong>{" "}
                from these rows and ignores a direct write. A subform write
                replaces the whole table and Zoho has no undo, so anything typed
                into those rows there is lost.
              </span>
            </p>
          ) : null}

          {alreadySent ? (
            <p className="flex items-start gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1.5 text-[0.7rem] text-emerald-700 dark:text-emerald-400">
              <Check className="mt-0.5 size-3 shrink-0" aria-hidden />
              <span>
                Sent to Zoho on {new Date(alreadySent).toLocaleDateString()}.
                Sending again re-prices the deal from this estimate; the stage
                only moves forward and the same PDF isn&apos;t attached twice.
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
              : reading
                ? "Reading the deal…"
                : isUpdate
                  ? "Update deal"
                  : "Create deal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
