"use client";

import { Check, Loader2, Package, Search } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ZohoProductLink } from "@/types/proposal.types";

type ZohoProduct = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  tag: string | null;
  unitPrice: number | null;
  description: string | null;
};

const ALL = "All";

/** What a product is filed under, in the order a person would look for it. */
function groupOf(p: ZohoProduct): string {
  return p.tag ?? p.category ?? "Other";
}

/**
 * Pick the Zoho Products this estimate is selling, filtered by category.
 *
 * Category pills rather than grouped sections, matching the deal picker — with
 * a dozen categories, scanning one filtered list beats scrolling past eleven
 * headings to reach the twelfth.
 *
 * The whole catalogue is fetched once (a few dozen records) and filtered in the
 * browser: instant search and instant category switching, one CRM call per open
 * instead of one per keystroke.
 */
export function ZohoProductPicker({
  open,
  onClose,
  selected,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  selected: ZohoProductLink[];
  onSave: (products: ZohoProductLink[]) => void;
}) {
  const [products, setProducts] = React.useState<ZohoProduct[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [category, setCategory] = React.useState<string>(ALL);
  const [chosen, setChosen] = React.useState<Record<string, ZohoProductLink>>({});
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setQ("");
    setCategory(ALL);
    setChosen(Object.fromEntries(selected.map((p) => [p.id, p])));
  }, [open, selected]);

  React.useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch("/api/zoho/products", { signal: ctl.signal });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setError(data?.error ?? "Couldn't load products.");
          return;
        }
        setProducts(data.products ?? []);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("Couldn't load products.");
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    })();
    return () => ctl.abort();
  }, [open]);

  const term = q.trim().toLowerCase();

  // Search first, then count per category, so the pill counts describe what the
  // current search would actually show — a category reading 0 is where the
  // matches aren't.
  const matched = React.useMemo(
    () =>
      term
        ? products.filter((p) =>
            [p.name, p.code, p.category, p.tag, p.description]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(term)),
          )
        : products,
    [products, term],
  );

  const categories = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of matched) {
      const g = groupOf(p);
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    // Every category stays on screen even at zero, so the row doesn't reflow
    // under the cursor while someone is typing.
    for (const p of products) {
      const g = groupOf(p);
      if (!counts.has(g)) counts.set(g, 0);
    }
    return [...counts.entries()].sort(([a], [b]) =>
      a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b),
    );
  }, [matched, products]);

  const visible = React.useMemo(
    () => (category === ALL ? matched : matched.filter((p) => groupOf(p) === category)),
    [matched, category],
  );

  const toggle = (p: ZohoProduct) => {
    setChosen((prev) => {
      const next = { ...prev };
      if (next[p.id]) delete next[p.id];
      else {
        next[p.id] = {
          id: p.id,
          name: p.name,
          code: p.code,
          category: p.category,
          tag: p.tag,
          unit_price: p.unitPrice,
        };
      }
      return next;
    });
  };

  const count = Object.keys(chosen).length;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex h-[88dvh] max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:h-144 sm:max-w-xl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 p-4 pb-3 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Package className="size-4 shrink-0 text-primary" aria-hidden />
            Products on this estimate
          </DialogTitle>
          <DialogDescription className="text-xs">
            Straight from the Zoho Products module — add one in the CRM and it
            appears here.
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
              placeholder="Search all products by name or description…"
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

          {/* Category filter, straight from Zoho. Wraps rather than scrolling
              sideways: with the scrollbar hidden, a mouse has no way to reach an
              off-screen pill (a vertical wheel doesn't pan, and shift+wheel is
              invisible). Two short rows beat one unreachable one. */}
          <div className="flex flex-wrap gap-1.5 pb-1">
            <Button
              type="button"
              size="sm"
              variant={category === ALL ? "default" : "outline"}
              className="h-8 shrink-0 text-xs"
              onClick={() => {
                setCategory(ALL);
                listRef.current?.scrollTo({ top: 0 });
              }}
            >
              {ALL}
            </Button>
            {categories.map(([cat, n]) => (
              <Button
                key={cat}
                type="button"
                size="sm"
                variant={category === cat ? "default" : "outline"}
                className={cn("h-8 shrink-0 gap-1.5 text-xs", n === 0 && "opacity-50")}
                onClick={() => {
                  setCategory(cat);
                  listRef.current?.scrollTo({ top: 0 });
                }}
              >
                {cat}
                <span className="tabular-nums opacity-70">{n}</span>
              </Button>
            ))}
          </div>

          <p className="flex h-5 items-center text-xs text-muted-foreground">
            {loading
              ? "Loading…"
              : `${visible.length} product${visible.length === 1 ? "" : "s"}${
                  category === ALL ? "" : ` in ${category}`
                }${count ? ` · ${count} selected` : ""}`}
          </p>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : loading && !products.length ? (
            <div className="flex flex-col gap-2" aria-hidden>
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : visible.length ? (
            <ul className="flex flex-col gap-1.5">
              {visible.map((p) => {
                const on = Boolean(chosen[p.id]);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(p)}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors",
                        on
                          ? "border-primary bg-primary/5"
                          : "border-border/60 bg-card/50 hover:border-primary/40 hover:bg-primary/5",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border",
                        )}
                        aria-hidden
                      >
                        {on ? <Check className="size-3" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-sm font-medium">{p.name}</span>
                          {/* Only worth showing when it isn't the active filter. */}
                          {category === ALL && (p.tag ?? p.category) ? (
                            <Badge
                              variant="outline"
                              className="text-[0.65rem] font-normal uppercase tracking-wide"
                            >
                              {p.tag ?? p.category}
                            </Badge>
                          ) : null}
                          {p.unitPrice ? (
                            <span className="text-xs font-medium tabular-nums text-foreground/80">
                              ${p.unitPrice.toLocaleString()}
                            </span>
                          ) : null}
                        </span>
                        {p.description ? (
                          <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                            {p.description}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Package className="size-5" aria-hidden />
              </div>
              <p className="text-sm font-medium">
                {term
                  ? `No products matched “${term}”`
                  : `No products in ${category}`}
              </p>
              {term && category !== ALL ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setCategory(ALL)}
                >
                  Search all categories
                </Button>
              ) : null}
            </div>
          )}
        </div>

        {/* mx-0/mb-0 undo DialogFooter's -mx-4 -mb-4, which assume the default
            p-4 DialogContent — this one is p-0, so they push the buttons past
            the (overflow-hidden) edge and clip them. */}
        <DialogFooter className="mx-0 mb-0 shrink-0 gap-2 border-t border-border/60 p-3 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="h-10 sm:h-9">
            Cancel
          </Button>
          <Button
            type="button"
            className="h-10 sm:h-9"
            onClick={() => {
              onSave(Object.values(chosen));
              onClose();
            }}
          >
            {count ? `Save ${count} product${count === 1 ? "" : "s"}` : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
