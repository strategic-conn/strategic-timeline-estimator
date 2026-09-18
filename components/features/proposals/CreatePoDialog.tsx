"use client";

import { Loader2, Receipt, TriangleAlert } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePbsPoTarget } from "@/hooks/usePbsClients";
import { useTeamCalendar } from "@/hooks/useTeamCalendar";
import { estimateDateRange } from "@/lib/discovery/from-line-items";
import { formatYmdLocal } from "@/lib/utils/availability-dates";
import { useProposalEstimatorStore } from "@/store/proposal-estimator-store";
import type { ClientQuote } from "@/types/proposal.types";

/**
 * Raise the PBS purchase order for a won deal.
 *
 * The only path that creates a PO. It used to be a checkbox on the send dialog,
 * which meant billing happened when a quote went OUT; a PO is now raised once
 * sales has actually won the deal, so it needs its own moment and its own
 * confirmation. The server re-checks the won stage live — this dialog is the
 * deliberate click, not the guard.
 *
 * PBS has no delete or update endpoint. Everything shown here is final.
 */
export function CreatePoDialog({
  open,
  onClose,
  quote,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  quote: ClientQuote;
  onDone: () => void | Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);
  const updateProposal = useProposalEstimatorStore((s) => s.updateProposal);
  const {
    clients,
    load,
    loading,
    error,
    clientId,
    code,
    usingDefault,
    template,
    templateOverride,
    existingPo,
  } = usePbsPoTarget(quote);

  React.useEffect(() => {
    if (open) load();
  }, [open, load]);

  /**
   * The project date range the PO is filed against.
   *
   * PBS treats both as optional and **defaults each to the current UTC date**,
   * which would record a months-long project as starting and ending today. So
   * they are always sent, pre-filled from the estimate's own timeline (the same
   * analyzer the Gantt draws) — and editable, because the schedule a client is
   * billed against is a call the coordinator may need to make differently from
   * the tentative plan.
   *
   * PBS writes the PO and its date record in one transaction and offers no way
   * to edit either afterwards, so this is a one-shot decision.
   */
  // Memoised on what the derivation actually reads, NOT on `quote`. Picking a
  // billing client writes `pbs` through the store, which hands this component a
  // new quote object while these four are untouched — so keying on `quote`
  // recomputed (and re-fired the effect below) on an unrelated edit.
  // Booked time off is part of the derivation now, so the PO's range matches
  // the Gantt on screen rather than a pure business-day count. `useTeamCalendar`
  // is memoised on its store slices, so adding it here does not reintroduce the
  // "new object every render" problem this memo exists to avoid.
  const teamCalendar = useTeamCalendar();
  const derived = React.useMemo(
    () => estimateDateRange(quote, teamCalendar),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the fields `estimateDateRange` reads
    [
      quote.discovery,
      quote.line_items,
      quote.addons,
      quote.requirements_unclear,
      teamCalendar,
    ],
  );
  const derivedStart = derived?.start ?? null;
  const derivedEnd = derived?.end ?? null;

  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  React.useEffect(() => {
    if (!open) return;
    // ⚠️ Depends on the derived STRINGS, never on the object.
    //
    // `derived` is a fresh object on every recompute, so an object dependency
    // re-ran this and **silently reset dates the coordinator had typed** — pick
    // the billing client after setting the range and the PO was filed with the
    // derived dates instead, with nothing on screen saying so. On a record PBS
    // cannot edit, that is a wrong date range nobody would catch. Primitives
    // re-fill only when the estimate's own timeline genuinely moves.
    const fallback = formatYmdLocal(new Date());
    setStartDate(derivedStart ?? fallback);
    setEndDate(derivedEnd ?? fallback);
  }, [open, derivedStart, derivedEnd]);

  /** PBS rejects a backwards range, and so does the route — say so before either. */
  const datesValid = Boolean(startDate && endDate && endDate >= startDate);

  /**
   * A PO already in PBS that might be this estimate's.
   *
   * PBS creates the PO before this app records the link, so a Supabase failure
   * in between leaves a real PO with nothing pointing at it — and the button
   * below would then raise a second one, into a system with no delete endpoint.
   *
   * Shown, never applied. The match is the estimate's title within this client,
   * and a repeat client can have the same job name twice a year, so this is a
   * candidate rather than an identity. Linking it is a separate, explicit click.
   */
  const [candidate, setCandidate] = React.useState<{
    po_no: string;
    name: string;
    create_date: string | null;
    create_by: string | null;
    matchCount: number;
  } | null>(null);
  const [checking, setChecking] = React.useState(false);
  React.useEffect(() => {
    setCandidate(null);
    if (!open || !clientId || quote.pbs?.po_no || quote.pbs?.po_id) return;
    const ctl = new AbortController();
    setChecking(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/pbs/pos?proposalId=${encodeURIComponent(quote.id)}&clientId=${encodeURIComponent(clientId)}`,
          { signal: ctl.signal },
        );
        const d = await res.json().catch(() => null);
        if (res.ok && d?.candidate) setCandidate(d.candidate);
      } catch {
        // The server refuses to create when it finds a candidate it can't
        // check, so a failed preview degrades to "no preview", not to a
        // duplicate.
      } finally {
        if (!ctl.signal.aborted) setChecking(false);
      }
    })();
    return () => ctl.abort();
  }, [open, clientId, quote.id, quote.pbs?.po_no, quote.pbs?.po_id]);

  /**
   * The PBS client an earlier estimate for this same Zoho account billed to.
   *
   * "Remembered per client" without a mapping table — the quotes already in the
   * store carry the answer. Offered as one click rather than filled in silently:
   * a wrong billing client is a PO on the wrong account, and PBS has no delete
   * endpoint, so the choice stays deliberate.
   */
  const allQuotes = useProposalEstimatorStore((s) => s.proposals);
  const suggestion = React.useMemo(() => {
    const account = quote.zoho?.account_id;
    if (!account || quote.pbs?.client_id) return null;
    const sibling = allQuotes.find(
      (q) =>
        q.id !== quote.id && q.zoho?.account_id === account && q.pbs?.client_id,
    );
    return sibling?.pbs
      ? {
          client_id: sibling.pbs.client_id,
          client_code: sibling.pbs.client_code,
        }
      : null;
  }, [allQuotes, quote]);

  const create = async (linkExisting?: string) => {
    if (!clientId || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/pbs/pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposalId: quote.id,
          name: quote.title,
          clientId,
          // Only on a create. Linking records a PO whose date range PBS already
          // holds; sending ours would imply this app set it, and the route
          // would validate a range it then ignores.
          ...(linkExisting ? {} : { startDate, endDate }),
          // Only ever the number the server itself offered. It re-finds the
          // candidate and compares, so this can't attach an arbitrary PO.
          ...(linkExisting ? { linkExisting } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error("PBS didn't create the PO", {
          description: data?.error ?? `Request failed (${res.status}).`,
        });
        return;
      }
      toast.success(
        data?.linked
          ? `Linked to PO ${data.poNo}`
          : `PO ${data?.poNo ?? "created"} in PBS`,
        {
          description:
            data?.templateSource === "client-history"
              ? `Template ${data.templateId}, from this client's own POs.`
              : undefined,
        },
      );
      for (const w of (data?.warnings ?? []) as string[]) toast.warning(w);
      await onDone();
      onClose();
    } catch (e) {
      toast.error("PBS couldn't be reached", {
        description: e instanceof Error ? e.message : "Unexpected error.",
      });
    } finally {
      setBusy(false);
    }
  };

  const rows: [string, React.ReactNode][] = [
    [
      "Client",
      <span key="c" className="flex items-center justify-end gap-2">
        {usingDefault ? (
          <span className="shrink-0 text-[0.7rem] text-muted-foreground">
            default
          </span>
        ) : null}
        <Select
          value={clientId ?? ""}
          onValueChange={(v) =>
            updateProposal(quote.id, {
              pbs: {
                ...(quote.pbs ?? {}),
                client_id: v,
                client_code:
                  clients.find((c) => c.clientId === v)?.code ?? null,
              },
            })
          }
        >
          <SelectTrigger
            size="sm"
            className="h-7 w-auto min-w-24 gap-1 border-border/60 text-xs"
          >
            <SelectValue placeholder={code ?? "Pick one"} />
          </SelectTrigger>
          <SelectContent align="end">
            {clients.map((c) => (
              <SelectItem key={c.clientId} value={c.clientId}>
                {c.code || `Client ${c.clientId}`}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {c.poCount} PO{c.poCount === 1 ? "" : "s"}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </span>,
    ],
    [
      "Template",
      template ? (
        <>
          {template}
          {templateOverride ? " · set for all" : " · client default"}
        </>
      ) : (
        "from this client's POs"
      ),
    ],
    ["PO name", quote.title || "—"],
    [
      "PO number",
      // Nothing is generated when an existing PO is being linked, and saying so
      // while the button reads "Link PO STR000428" is a contradiction in the
      // one dialog that must be read literally.
      candidate ? (
        <span key="po" className="font-medium text-foreground">
          {candidate.po_no} · existing
        </span>
      ) : (
        "generated by PBS"
      ),
    ],
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 p-3 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Receipt className="size-4 text-primary" aria-hidden />
            Create the PO in PBS
          </DialogTitle>
          <DialogDescription className="text-xs">
            The deal is won. This raises the purchase order in the billing app.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {existingPo ? (
            <p className="rounded-md border border-border/60 px-2.5 py-1.5 text-xs text-muted-foreground">
              Already billed as <strong>{existingPo}</strong>. PBS can&apos;t
              update or remove a PO, so no second one is created.
            </p>
          ) : (
            <>
              <dl className="overflow-hidden rounded-md border border-border/60 px-2.5 py-1.5 text-xs">
                {rows.map(([label, value]) => (
                  <div
                    key={label}
                    className="flex justify-between gap-3 py-0.5"
                  >
                    <dt className="shrink-0 self-center text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="min-w-0 truncate text-right text-muted-foreground">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>

              {/* Omitted entirely while a candidate is offered: that button
                  LINKS an existing PO, whose date range already exists in PBS
                  and which this app cannot change. Editable fields there would
                  look like they set something.

                  Conditionally rendered rather than class-hidden: `hidden` and
                  `grid` both set `display`, so which one wins is CSS order, not
                  the order they appear in the attribute.

                  Own fields rather than a <dl> row: two native date inputs do
                  not fit a right-aligned truncating cell at 375px. Stacked
                  below sm for the same reason. */}
              {candidate ? null : (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="grid gap-1">
                      <Label htmlFor="po-start" className="text-xs">
                        Project start
                      </Label>
                      <Input
                        id="po-start"
                        type="date"
                        value={startDate}
                        max={endDate || undefined}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="po-end" className="text-xs">
                        Project end
                      </Label>
                      <Input
                        id="po-end"
                        type="date"
                        value={endDate}
                        min={startDate || undefined}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  {!datesValid ? (
                    <p className="text-xs text-destructive">
                      {!startDate || !endDate
                        ? "Both project dates are required."
                        : "The end date must be on or after the start date."}
                    </p>
                  ) : derived ? (
                    <p className="text-[0.7rem] text-muted-foreground">
                      From this estimate&apos;s timeline. PBS stores this range
                      with the PO and can&apos;t change it afterwards.
                    </p>
                  ) : (
                    <p className="text-[0.7rem] text-amber-700 dark:text-amber-400">
                      This estimate has no line items to schedule, so the dates
                      default to today — set the real range before creating the
                      PO.
                    </p>
                  )}
                </>
              )}

              {candidate ? (
                /* PBS already has a PO with this name for this client. Almost
                   certainly this estimate's, whose link write failed — but
                   "almost" is why nothing is linked automatically: a repeat
                   client can have the same job name twice a year, and billing
                   against the wrong PO is silent where a duplicate is obvious. */
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[0.7rem] text-amber-700 dark:text-amber-400">
                  <p className="flex items-start gap-1.5">
                    <TriangleAlert
                      className="mt-0.5 size-3 shrink-0"
                      aria-hidden
                    />
                    <span>
                      <strong className="font-semibold">
                        PBS already has PO {candidate.po_no}
                      </strong>{" "}
                      named &ldquo;{candidate.name}&rdquo; for this client
                      {candidate.create_date
                        ? `, created ${candidate.create_date}`
                        : null}
                      {candidate.create_by
                        ? ` by ${candidate.create_by}`
                        : null}
                      .
                    </span>
                  </p>
                  <p className="mt-1 pl-4.5">
                    {candidate.matchCount > 1
                      ? `${candidate.matchCount} POs share that name for this client — check PBS before linking.`
                      : "If that is this estimate's PO, link it. If it's a different job, rename the estimate first — creating a second PO can't be undone."}
                  </p>
                </div>
              ) : (
                <p className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-[0.7rem] text-amber-700 dark:text-amber-400">
                  <TriangleAlert
                    className="mt-0.5 size-3 shrink-0"
                    aria-hidden
                  />
                  <span>
                    PBS has no delete endpoint — this can&apos;t be undone. The
                    PO is a shell: PBS pins new POs to a 0 rate, so the
                    estimate&apos;s amounts stay here and in Zoho.
                  </span>
                </p>
              )}
              {suggestion ? (
                <button
                  type="button"
                  className="w-fit text-xs font-medium text-primary underline-offset-2 hover:underline"
                  onClick={() =>
                    updateProposal(quote.id, {
                      pbs: { ...(quote.pbs ?? {}), ...suggestion },
                    })
                  }
                >
                  Earlier estimates for this client billed to{" "}
                  {suggestion.client_code ?? suggestion.client_id} — use it
                </button>
              ) : null}
              {loading ? (
                <p className="text-xs text-muted-foreground">
                  Loading billing clients…
                </p>
              ) : null}
              {error ? (
                <p className="text-xs text-destructive">{error}</p>
              ) : !loading && !clientId ? (
                <p className="text-xs text-muted-foreground">
                  No billing client — pick one above, or on the{" "}
                  <strong>Setup</strong> tab.
                </p>
              ) : null}
            </>
          )}
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
            onClick={() => void create(candidate?.po_no)}
            disabled={
              busy ||
              checking ||
              !clientId ||
              // Dates gate a create only — a link doesn't use them.
              (!candidate && !datesValid) ||
              Boolean(existingPo)
            }
            className="gap-2"
          >
            {busy || checking ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {/* One button, and it says which of the two things it does. The
                server refuses a plain create while a candidate exists, so the
                label can never promise something the route would reject. */}
            {checking
              ? "Checking PBS…"
              : busy
                ? candidate
                  ? "Linking…"
                  : "Creating…"
                : candidate
                  ? `Link PO ${candidate.po_no}`
                  : "Create PO"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
