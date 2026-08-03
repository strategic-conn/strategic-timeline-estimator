"use client";

import {
  ArrowLeft,
  Briefcase,
  Building2,
  Globe,
  Loader2,
  Mail,
  MapPin,
  Phone,
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

export type ZohoAccountDealSummary = {
  id: string;
  name: string | null;
  stage: string | null;
  amount: number | null;
};

export type ZohoAccountResult = {
  id: string;
  name: string | null;
  phone: string | null;
  website: string | null;
  city: string | null;
  owner: string | null;
  viaContact?: string | null;
  webUrl: string | null;
  deals?: ZohoAccountDealSummary[];
};

export type ZohoContactResult = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  accountId: string | null;
  accountName: string | null;
};

export type ZohoClientSelection = {
  account: ZohoAccountResult;
  contact: ZohoContactResult | null;
};

/**
 * Two-step client picker over Zoho's *qualified* records: find the company
 * (Accounts), then choose the person (Contacts) — an account can have several.
 * Read-only; only the chosen names/ids are handed back via `onSelect`.
 *
 * Fixed-height dialog so it never resizes between states.
 */
export function ZohoAccountLookup({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (selection: ZohoClientSelection) => void;
}) {
  const [q, setQ] = React.useState("");
  const [accounts, setAccounts] = React.useState<ZohoAccountResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  // Step 2 state — set once a company is chosen.
  const [picked, setPicked] = React.useState<ZohoAccountResult | null>(null);
  const [contacts, setContacts] = React.useState<ZohoContactResult[]>([]);
  const [contactsLoading, setContactsLoading] = React.useState(false);

  const listRef = React.useRef<HTMLDivElement>(null);
  const term = q.trim();

  // Step 1 — companies (debounced; empty query = most recently touched).
  React.useEffect(() => {
    if (!open || picked) return;
    const ctl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      setError(null);
      try {
        const res = await fetch(
          `/api/zoho/accounts${term.length >= 2 ? `?q=${encodeURIComponent(term)}` : ""}`,
          { signal: ctl.signal },
        );
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setError(data?.error ?? "Couldn't load companies.");
          setAccounts([]);
        } else {
          setAccounts(data.accounts ?? []);
          listRef.current?.scrollTo({ top: 0 });
        }
        setLoaded(true);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("Couldn't load companies.");
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    }, term ? 400 : 0);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [open, term, picked]);

  // Step 2 — that company's people.
  const choose = async (account: ZohoAccountResult) => {
    setPicked(account);
    setContacts([]);
    setContactsLoading(true);
    try {
      const res = await fetch(
        `/api/zoho/accounts?contactsOf=${encodeURIComponent(account.id)}`,
      );
      const data = await res.json().catch(() => null);
      setContacts(res.ok ? (data.contacts ?? []) : []);
    } catch {
      setContacts([]);
    } finally {
      setContactsLoading(false);
    }
  };

  React.useEffect(() => {
    if (open) {
      setQ("");
      setAccounts([]);
      setLoaded(false);
      setError(null);
      setPicked(null);
      setContacts([]);
    }
  }, [open]);

  const finish = (contact: ZohoContactResult | null) => {
    if (!picked) return;
    onSelect({ account: picked, contact });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex h-[88dvh] max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:h-136 sm:max-w-lg">
        <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 p-4 pb-3 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Building2 className="size-4 shrink-0 text-primary" aria-hidden />
            {picked ? "Who's the contact?" : "Find the client in Zoho CRM"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {picked
              ? `People at ${picked.name ?? "this company"} — pick one, or continue with just the company.`
              : "Search your CRM companies. Typing a person's name also works."}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: search box. Step 2: the chosen company + back. */}
        <div className="shrink-0 px-4 pt-3">
          {picked ? (
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                onClick={() => setPicked(null)}
                aria-label="Back to companies"
              >
                <ArrowLeft className="size-4" aria-hidden />
              </Button>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {picked.name}
              </span>
            </div>
          ) : (
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Company name, or a person's name…"
                className="h-11 pl-9 pr-9 text-base sm:h-10 sm:text-sm"
                autoFocus
                autoComplete="off"
              />
              {loading ? (
                <Loader2
                  className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
                  aria-hidden
                />
              ) : null}
            </div>
          )}
          <p className="flex h-6 items-center text-xs text-muted-foreground">
            {picked
              ? contactsLoading
                ? "Loading contacts…"
                : `${contacts.length} contact${contacts.length === 1 ? "" : "s"}`
              : loading
                ? "Searching…"
                : term.length >= 2
                  ? `${accounts.length}${accounts.length === 25 ? "+" : ""} compan${accounts.length === 1 ? "y" : "ies"}`
                  : "Recently updated companies"}
          </p>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : picked ? (
            // ── step 2: contacts ──
            contactsLoading ? (
              <ul className="flex flex-col gap-2" aria-hidden>
                {Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className="rounded-lg border border-border/50 bg-card/30 p-3">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="mt-2 h-3 w-48" />
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="flex flex-col gap-2">
                {contacts.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => finish(c)}
                      className="w-full rounded-lg border border-border/60 bg-card/50 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 truncate font-medium">
                          {c.name?.trim() || "(no name)"}
                        </span>
                        {c.title ? (
                          <Badge variant="outline" className="shrink-0 text-[0.65rem] font-normal">
                            {c.title}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {c.email ? (
                          <span className="flex min-w-0 items-center gap-1.5">
                            <Mail className="size-3 shrink-0" aria-hidden />
                            <span className="truncate">{c.email}</span>
                          </span>
                        ) : null}
                        {c.phone ? (
                          <span className="flex items-center gap-1.5">
                            <Phone className="size-3 shrink-0" aria-hidden />
                            {c.phone}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    onClick={() => finish(null)}
                    className="w-full rounded-lg border border-dashed border-border/60 p-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {contacts.length
                      ? "Use the company only (no specific contact)"
                      : "No contacts on this company — use the company only"}
                  </button>
                </li>
              </ul>
            )
          ) : loading && !accounts.length ? (
            <ul className="flex flex-col gap-2" aria-hidden>
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="rounded-lg border border-border/50 bg-card/30 p-3">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="mt-2 h-3 w-52" />
                </li>
              ))}
            </ul>
          ) : accounts.length ? (
            // ── step 1: companies ──
            <ul className="flex flex-col gap-2">
              {accounts.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => void choose(a)}
                    className="w-full rounded-lg border border-border/60 bg-card/50 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 truncate font-medium">
                        {a.name?.trim() || "(unnamed company)"}
                      </span>
                      {a.viaContact ? (
                        <Badge variant="secondary" className="shrink-0 text-[0.65rem] font-normal">
                          via {a.viaContact}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {a.city ? (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="size-3 shrink-0" aria-hidden />
                          {a.city}
                        </span>
                      ) : null}
                      {a.phone ? (
                        <span className="flex items-center gap-1.5">
                          <Phone className="size-3 shrink-0" aria-hidden />
                          {a.phone}
                        </span>
                      ) : null}
                      {a.website ? (
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Globe className="size-3 shrink-0" aria-hidden />
                          <span className="truncate">
                            {a.website.replace(/^https?:\/\//, "")}
                          </span>
                        </span>
                      ) : null}
                    </div>
                    {/* Prior CRM history — "have we worked with them before?" */}
                    {a.deals?.length ? (
                      <div className="mt-2 flex min-w-0 items-start gap-1.5 border-t border-border/50 pt-2 text-xs">
                        <Briefcase
                          className="mt-0.5 size-3 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <span className="min-w-0">
                          <span className="font-medium text-foreground/80">
                            {a.deals.length} prior{" "}
                            {a.deals.length === 1 ? "deal" : "deals"}
                          </span>
                          <span className="text-muted-foreground">
                            {" — "}
                            <span className="truncate">{a.deals[0].name}</span>
                            {a.deals[0].stage ? ` (${a.deals[0].stage})` : null}
                            {a.deals.length > 1
                              ? ` +${a.deals.length - 1} more`
                              : null}
                          </span>
                        </span>
                      </div>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <User className="size-5" aria-hidden />
              </div>
              <p className="text-sm font-medium">
                {loaded && term.length >= 2
                  ? `Nothing matched “${term}”`
                  : "Search your CRM clients"}
              </p>
              <p className="text-xs text-muted-foreground">
                {loaded && term.length >= 2
                  ? "Try the company name, or the contact person's name."
                  : "~4,000 companies and ~3,700 contacts."}
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
