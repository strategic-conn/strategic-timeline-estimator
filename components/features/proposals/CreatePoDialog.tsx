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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePbsPoTarget } from "@/hooks/usePbsClients";
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
      (q) => q.id !== quote.id && q.zoho?.account_id === account && q.pbs?.client_id,
    );
    return sibling?.pbs
      ? { client_id: sibling.pbs.client_id, client_code: sibling.pbs.client_code }
      : null;
  }, [allQuotes, quote]);

  const create = async () => {
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
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error("PBS didn't create the PO", {
          description: data?.error ?? `Request failed (${res.status}).`,
        });
        return;
      }
      toast.success(`PO ${data?.poNo ?? "created"} in PBS`, {
        description:
          data?.templateSource === "client-history"
            ? `Template ${data.templateId}, from this client's own POs.`
            : undefined,
      });
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
                client_code: clients.find((c) => c.clientId === v)?.code ?? null,
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
    ["PO number", "generated by PBS"],
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
                  <div key={label} className="flex justify-between gap-3 py-0.5">
                    <dt className="shrink-0 self-center text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="min-w-0 truncate text-right text-muted-foreground">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-[0.7rem] text-amber-700 dark:text-amber-400">
                <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                <span>
                  PBS has no delete endpoint — this can&apos;t be undone. The PO
                  is a shell: PBS pins new POs to a 0 rate, so the estimate&apos;s
                  amounts stay here and in Zoho.
                </span>
              </p>
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
            onClick={create}
            disabled={busy || !clientId || Boolean(existingPo)}
            className="gap-2"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {busy ? "Creating…" : "Create PO"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
