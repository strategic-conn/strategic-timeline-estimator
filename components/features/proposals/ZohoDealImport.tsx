"use client";

import {
  Briefcase,
  Building2,
  CalendarDays,
  Loader2,
  Search,
  User,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type ZohoDealResult = {
  id: string;
  name: string | null;
  stage: string | null;
  amount: number | null;
  currency: string | null;
  closingDate: string | null;
  service: string | null;
  account: string | null;
  contact: string | null;
  owner: string | null;
  description: string | null;
  quoteNumber: string | number | null;
  webUrl: string | null;
};

const STAGES = [
  "Proposal Requested",
  "Discovery",
  "Negotiation",
  "Verbal Yes",
] as const;

function formatDate(d: string | null) {
  if (!d) return null;
  const parsed = new Date(`${d}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? d
    : parsed.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

/**
 * Pick a Zoho CRM Deal to start an estimate from. Fixed-height dialog (the list
 * is the only scrolling region) so it never resizes as results change.
 */
export function ZohoDealImport({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (deal: ZohoDealResult) => void;
}) {
  const [stage, setStage] = React.useState<string>(STAGES[0]);
  const [q, setQ] = React.useState("");
  const [deals, setDeals] = React.useState<ZohoDealResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);

  const term = q.trim();
  const searching = term.length >= 2;

  React.useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      setError(null);
      try {
        const qs = searching
          ? `q=${encodeURIComponent(term)}`
          : `stage=${encodeURIComponent(stage)}`;
        const res = await fetch(`/api/zoho/deals?${qs}`, { signal: ctl.signal });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setError(data?.error ?? "Couldn't load deals.");
          setDeals([]);
        } else {
          setDeals(data.deals ?? []);
          listRef.current?.scrollTo({ top: 0 });
        }
        setLoaded(true);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("Couldn't load deals.");
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    }, term ? 400 : 0);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [open, stage, term, searching]);

  React.useEffect(() => {
    if (open) {
      setQ("");
      setStage(STAGES[0]);
      setDeals([]);
      setLoaded(false);
      setError(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex h-[88dvh] max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:h-144 sm:max-w-xl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 p-4 pb-3 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Briefcase className="size-4 shrink-0 text-primary" aria-hidden />
            Start an estimate from a Zoho deal
          </DialogTitle>
          <DialogDescription className="text-xs">
            Pick a deal and we&apos;ll pre-fill the quote with its client and
            dates, and keep a link back to the CRM record.
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 space-y-2 px-4 pt-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search all deals by name or company…"
              className="h-11 pl-9 pr-9 text-base sm:h-10 sm:text-sm"
              autoComplete="off"
            />
            {loading ? (
              <Loader2
                className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
                aria-hidden
              />
            ) : null}
          </div>

          {/* Stage filter — ignored while free-text searching. */}
          <div
            className={cn(
              // Wraps rather than scrolls: on a phone these ran past the dialog
              // edge behind a hidden scrollbar, so the later stage filters read
              // as if they did not exist. They fit one row from sm up anyway.
              "-mx-1 flex flex-wrap gap-1.5 px-1 pb-1",
              searching && "pointer-events-none opacity-40",
            )}
          >
            {STAGES.map((s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant={!searching && stage === s ? "default" : "outline"}
                className="h-8 shrink-0 text-xs"
                onClick={() => setStage(s)}
              >
                {s}
              </Button>
            ))}
          </div>
          <p className="flex h-5 items-center text-xs text-muted-foreground">
            {searching
              ? `Searching all deals for “${term}”`
              : loading
                ? "Loading…"
                : `${deals.length}${deals.length === 25 ? "+" : ""} in ${stage}`}
          </p>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : loading && !deals.length ? (
            <ul className="flex flex-col gap-2" aria-hidden>
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="rounded-lg border border-border/50 bg-card/30 p-3">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="mt-2 h-3 w-56" />
                  <Skeleton className="mt-1.5 h-3 w-36" />
                </li>
              ))}
            </ul>
          ) : deals.length ? (
            <ul className="flex flex-col gap-2">
              {deals.map((deal) => (
                <li key={deal.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(deal);
                      onClose();
                    }}
                    className="w-full rounded-lg border border-border/60 bg-card/50 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-primary/10"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 truncate font-medium">
                        {deal.name?.trim() || "(untitled deal)"}
                      </span>
                      {deal.stage ? (
                        <Badge variant="outline" className="shrink-0 text-[0.65rem] font-normal">
                          {deal.stage}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-1.5 flex flex-col gap-1 text-xs text-muted-foreground">
                      {deal.account ? (
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Building2 className="size-3 shrink-0" aria-hidden />
                          <span className="truncate">{deal.account}</span>
                        </span>
                      ) : null}
                      <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        {deal.contact ? (
                          <span className="flex items-center gap-1.5">
                            <User className="size-3 shrink-0" aria-hidden />
                            {deal.contact}
                          </span>
                        ) : null}
                        {deal.closingDate ? (
                          <span className="flex items-center gap-1.5">
                            <CalendarDays className="size-3 shrink-0" aria-hidden />
                            {formatDate(deal.closingDate)}
                          </span>
                        ) : null}
                        {deal.amount ? (
                          <span className="font-medium text-foreground/80 tabular-nums">
                            {deal.currency === "USD" ? "$" : `${deal.currency ?? ""} `}
                            {deal.amount.toLocaleString()}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Briefcase className="size-5" aria-hidden />
              </div>
              <p className="text-sm font-medium">
                {searching
                  ? `No deals matched “${term}”`
                  : loaded
                    ? `No deals in ${stage}`
                    : "Loading deals…"}
              </p>
              <p className="text-xs text-muted-foreground">
                {searching
                  ? "Try a company name or the deal's title."
                  : "Pick another stage above, or search all deals."}
              </p>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-border/60 p-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="h-10 w-full sm:h-9"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
