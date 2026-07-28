"use client";

import { Building2, Loader2, Mail, Phone, Search, UserSearch } from "lucide-react";
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

export type ZohoLeadResult = {
  id: string;
  name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  status: string | null;
  source: string | null;
};

/**
 * Search the Zoho CRM leads (read-only) and pick one. Nothing is stored — the
 * query goes straight to Zoho server-side and only the chosen lead's details are
 * handed back via `onSelect`.
 *
 * The dialog is a FIXED height (flex column, internally scrolling list) so it
 * never resizes as results come and go — the empty, loading, error and result
 * states all occupy the same box.
 */
export function ZohoLeadLookup({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (lead: ZohoLeadResult) => void;
}) {
  const [q, setQ] = React.useState("");
  const [leads, setLeads] = React.useState<ZohoLeadResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [searched, setSearched] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);

  const term = q.trim();
  const tooShort = term.length < 2;

  // Debounced search so we don't spend a Zoho API credit per keystroke.
  React.useEffect(() => {
    if (!open) return;
    if (tooShort) {
      setLeads([]);
      setSearched(false);
      setError(null);
      setLoading(false);
      return;
    }
    const ctl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      setError(null);
      try {
        const res = await fetch(
          `/api/zoho/leads/search?q=${encodeURIComponent(term)}`,
          { signal: ctl.signal },
        );
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setError(data?.error ?? "Search failed.");
          setLeads([]);
        } else {
          setLeads(data.leads ?? []);
          listRef.current?.scrollTo({ top: 0 });
        }
        setSearched(true);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("Search failed.");
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    }, 400);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [term, tooShort, open]);

  // Reset on reopen so stale results never flash.
  React.useEffect(() => {
    if (open) {
      setQ("");
      setLeads([]);
      setSearched(false);
      setError(null);
      setLoading(false);
    }
  }, [open]);

  /** Status line — always rendered at a fixed height so nothing shifts. */
  const status = error
    ? null
    : tooShort
      ? "Search by name, company, or phone"
      : loading && !leads.length
        ? "Searching Zoho…"
        : leads.length
          ? `${leads.length}${leads.length === 25 ? "+" : ""} ${leads.length === 1 ? "match" : "matches"}`
          : searched
            ? "No matches"
            : "";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="flex h-[85dvh] max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:h-136 sm:max-w-lg"
      >
        <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 p-4 pb-3 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <UserSearch className="size-4 shrink-0 text-primary" aria-hidden />
            Find a lead in Zoho CRM
          </DialogTitle>
          <DialogDescription className="text-xs">
            Results come live from Zoho — nothing is copied into this app until
            you pick one.
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 px-4 pt-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Chapman · Myrtle Beach · 843-918-6023"
              className="h-11 pl-9 pr-9 text-base sm:h-10 sm:text-sm"
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
            {loading ? (
              <Loader2
                className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
                aria-hidden
              />
            ) : null}
          </div>
          {/* Fixed-height status row — reserves space in every state. */}
          <p
            className="flex h-6 items-center text-xs text-muted-foreground"
            aria-live="polite"
          >
            {status}
          </p>
        </div>

        {/* The only scrolling region; flex-1 + min-h-0 keeps the dialog rigid. */}
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : loading && !leads.length ? (
            <ul className="flex flex-col gap-2" aria-hidden>
              {Array.from({ length: 4 }).map((_, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-border/50 bg-card/30 p-3"
                >
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="mt-2 h-3 w-52" />
                  <Skeleton className="mt-1.5 h-3 w-32" />
                </li>
              ))}
            </ul>
          ) : leads.length ? (
            <ul className="flex flex-col gap-2">
              {leads.map((lead) => (
                <li key={lead.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(lead);
                      onClose();
                    }}
                    className="w-full rounded-lg border border-border/60 bg-card/50 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-primary/10"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 truncate font-medium">
                        {lead.name?.trim() || "(no name)"}
                      </span>
                      {lead.status ? (
                        <Badge
                          variant="outline"
                          className="shrink-0 text-[0.65rem] font-normal"
                        >
                          {lead.status}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-1.5 flex flex-col gap-1 text-xs text-muted-foreground">
                      {lead.company ? (
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Building2 className="size-3 shrink-0" aria-hidden />
                          <span className="truncate">{lead.company}</span>
                        </span>
                      ) : null}
                      <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        {lead.phone ? (
                          <span className="flex items-center gap-1.5">
                            <Phone className="size-3 shrink-0" aria-hidden />
                            {lead.phone}
                          </span>
                        ) : null}
                        {lead.email ? (
                          <span className="flex min-w-0 items-center gap-1.5">
                            <Mail className="size-3 shrink-0" aria-hidden />
                            <span className="truncate">{lead.email}</span>
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            // Empty + no-match share one centered slot, so neither resizes the box.
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <UserSearch className="size-5" aria-hidden />
              </div>
              <p className="text-sm font-medium">
                {tooShort ? "Search your CRM" : `No leads matched “${term}”`}
              </p>
              <p className="text-xs text-muted-foreground">
                {tooShort
                  ? "Type at least 2 characters to search 120,000+ leads."
                  : "Try a company name, a surname, or a phone number."}
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
