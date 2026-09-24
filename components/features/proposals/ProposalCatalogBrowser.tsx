"use client";

import * as React from "react";
import { Check, Lightbulb, Plus, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  catalogForPlatform,
  categoryName,
  groupCatalogByModule,
  platformLabel,
  type CatalogItem,
  type ProposalPlatform,
} from "@/lib/proposal-catalog";
import { cn } from "@/lib/utils";
import { formatRate, rateFor } from "@/lib/pricing/hourly-rates";
import { useHourlyRatesStore } from "@/store/hourly-rates-store";

type ProposalCatalogBrowserProps = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  platform: ProposalPlatform;
  /** Catalog ids already present on the quote — shown as "Added". */
  alreadyAddedIds: Set<number>;
  onAdd: (items: CatalogItem[]) => void;
};

const ALL = "all";
const catKey = (it: CatalogItem) =>
  it.category_id == null ? "none" : String(it.category_id);

export function ProposalCatalogBrowser({
  open,
  onOpenChange,
  platform,
  alreadyAddedIds,
  onAdd,
}: ProposalCatalogBrowserProps) {
  const items = React.useMemo(() => catalogForPlatform(platform), [platform]);
  // Rates are priced from now on (pricing Phase 3), so the browser shows them.
  const rates = useHourlyRatesStore((s) => s.rates);
  const [query, setQuery] = React.useState("");
  const [activeCat, setActiveCat] = React.useState<string>(ALL);
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  // The workbook's own "how to quote" step: filter by Responsible or Level.
  const [role, setRole] = React.useState<string | null>(null);
  const [level, setLevel] = React.useState<1 | 2 | null>(null);

  // Reset everything each time it opens (or the platform changes underneath it).
  React.useEffect(() => {
    setQuery("");
    setSelected(new Set());
    setActiveCat(ALL);
    setRole(null);
    setLevel(null);
  }, [open, platform]);

  const rolesHere = React.useMemo(
    () => [...new Set(items.map((it) => it.responsible))],
    [items],
  );

  // Everything below works on the role/level-filtered set, so the category
  // rail's counts, search and "Select all" all agree with what is on screen.
  const pool = React.useMemo(
    () =>
      items.filter(
        (it) =>
          (role === null || it.responsible === role) &&
          (level === null || it.level === level),
      ),
    [items, role, level],
  );

  const searching = query.trim().length > 0;

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        it.module.toLowerCase().includes(q) ||
        (it.description ?? "").toLowerCase().includes(q),
    );
  }, [pool, query]);

  // Category rail: every category present for this platform, with counts +
  // how many are selected (so you can see where your picks are).
  const categories = React.useMemo(() => {
    const map = new Map<
      string,
      { key: string; name: string; count: number; selected: number }
    >();
    for (const it of pool) {
      const key = catKey(it);
      const entry = map.get(key) ?? {
        key,
        name:
          it.category_id == null
            ? "Other"
            : (categoryName(it.category_id) ?? "Other"),
        count: 0,
        selected: 0,
      };
      entry.count += 1;
      if (selected.has(it.id)) entry.selected += 1;
      map.set(key, entry);
    }
    const list = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    return [
      {
        key: ALL,
        name: "All items",
        count: pool.length,
        selected: selected.size,
      },
      ...list,
    ];
  }, [pool, selected]);

  // Items shown in the right pane: search is global; otherwise scoped to the
  // active category.
  const shown = React.useMemo(() => {
    if (searching) return filtered;
    if (activeCat === ALL) return pool;
    return pool.filter((it) => catKey(it) === activeCat);
  }, [searching, filtered, pool, activeCat]);

  const groups = React.useMemo(() => groupCatalogByModule(shown), [shown]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setMany = (ids: number[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const selectCategory = (key: string) => {
    setActiveCat(key);
    setQuery("");
  };

  const selectedItems = React.useMemo(
    () => items.filter((it) => selected.has(it.id)),
    [items, selected],
  );
  const totalBaseHours = selectedItems.reduce((s, it) => s + it.base_hours, 0);

  const handleAdd = () => {
    if (!selectedItems.length) return;
    onAdd(selectedItems);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] w-[calc(100vw-1.5rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:h-[80vh] sm:max-w-4xl">
        <DialogHeader className="shrink-0 space-y-0 border-b p-4 pr-12 text-left">
          <DialogTitle>Catalog · {platformLabel(platform)}</DialogTitle>
          <DialogDescription>
            Pick prebuilt tasks by category. Hours auto-fill from base × tier.
          </DialogDescription>
          <div className="mt-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search all categories…"
                className="pl-7"
              />
            </div>
            <Badge
              variant="secondary"
              className="shrink-0 tabular-nums"
              aria-live="polite"
            >
              {searching ? filtered.length : shown.length}
            </Badge>
          </div>
          {/* Wraps rather than scrolling: a strip that scrolls sideways reads
              as a strip that ends. */}
          <div
            role="group"
            aria-label="Filter by role and level"
            className="mt-2 flex flex-wrap items-center gap-1.5"
          >
            {[null, ...rolesHere].map((r) => (
              <FilterChip
                key={r ?? "all-roles"}
                active={role === r}
                onClick={() => setRole(r)}
              >
                {r ?? "All roles"}
              </FilterChip>
            ))}
            {/* Hidden on phones: when the chips wrap it can hang alone at a line end. */}
            <span
              className="mx-1 hidden h-4 w-px bg-border sm:block"
              aria-hidden
            />
            {([null, 1, 2] as const).map((l) => (
              <FilterChip
                key={l ?? "any-level"}
                active={level === l}
                onClick={() => setLevel(l)}
                title={
                  l === 1
                    ? "Level 1 — standard build and config work"
                    : l === 2
                      ? "Level 2 — senior, custom-coded or higher-risk work"
                      : undefined
                }
              >
                {l === null ? "Any level" : `Level ${l}`}
              </FilterChip>
            ))}
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden sm:flex-row">
          {/* Category rail */}
          <nav
            aria-label="Catalog categories"
            className="flex shrink-0 gap-1 overflow-x-auto border-b p-2 sm:w-52 sm:flex-col sm:overflow-x-visible sm:overflow-y-auto sm:border-b-0 sm:border-r"
          >
            {categories.map((cat) => {
              const isActive = !searching && activeCat === cat.key;
              return (
                <button
                  key={cat.key}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => selectCategory(cat.key)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors sm:w-full",
                    isActive
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <span className="truncate sm:flex-1">{cat.name}</span>
                  {cat.selected > 0 ? (
                    <Badge className="h-5 shrink-0 px-1.5 tabular-nums">
                      {cat.selected}
                    </Badge>
                  ) : (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">
                      {cat.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Items pane */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:p-3">
            {groups.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                {searching
                  ? "No catalog items match your search."
                  : "No items in this category."}
              </p>
            ) : (
              <ul className="flex flex-col gap-4">
                {groups.map((group) => {
                  const ids = group.items.map((it) => it.id);
                  const allOn = ids.every((id) => selected.has(id));
                  return (
                    <li key={group.module}>
                      <div className="flex items-center justify-between gap-2 px-2 pb-1">
                        <div className="min-w-0 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
                          <span>{group.module}</span>
                          {group.categoryId != null ? (
                            <span className="ml-2 text-foreground/60">
                              · {categoryName(group.categoryId)}
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => setMany(ids, !allOn)}
                          className="shrink-0 text-[0.7rem] font-medium text-primary hover:underline"
                        >
                          {allOn ? "Clear" : "Select all"}
                        </button>
                      </div>
                      <ul className="rounded-2xl border bg-card/40 p-1">
                        {group.items.map((it) => {
                          const checked = selected.has(it.id);
                          const isAdded = alreadyAddedIds.has(it.id);
                          const inputId = `cat-${it.id}`;
                          return (
                            <li
                              key={it.id}
                              className={cn(
                                "flex items-start gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-muted/60",
                                checked && "bg-primary/5",
                              )}
                            >
                              <Checkbox
                                id={inputId}
                                checked={checked}
                                onCheckedChange={() => toggle(it.id)}
                                className="mt-0.5"
                              />
                              <Label
                                htmlFor={inputId}
                                className="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-1"
                              >
                                <div className="flex w-full flex-wrap items-center gap-2">
                                  <span className="text-sm font-medium leading-snug">
                                    {it.name}
                                  </span>
                                  {isAdded ? (
                                    <Badge
                                      variant="outline"
                                      className="gap-1 text-[0.65rem]"
                                    >
                                      <Check className="size-3" aria-hidden />
                                      Added
                                    </Badge>
                                  ) : null}
                                  <Badge
                                    variant="secondary"
                                    className="ml-auto shrink-0 tabular-nums"
                                  >
                                    {it.base_hours} h base
                                  </Badge>
                                </div>
                                {it.description ? (
                                  <p className="line-clamp-2 text-xs text-muted-foreground">
                                    {it.description}
                                  </p>
                                ) : null}
                                <span
                                  className="text-[0.7rem] text-muted-foreground"
                                  title={
                                    it.level === 2
                                      ? "Level 2 — senior, custom-coded or higher-risk work"
                                      : "Level 1 — standard build and config work"
                                  }
                                >
                                  {`${it.responsible} · Level ${it.level}`}
                                </span>
                                {(() => {
                                  const r = rateFor(
                                    rates,
                                    it.responsible,
                                    it.level,
                                  );
                                  return r === null ? null : (
                                    <span className="text-[0.7rem] tabular-nums text-muted-foreground">
                                      {`${formatRate(r)}/h`}
                                    </span>
                                  );
                                })()}
                                {it.things_to_consider ? (
                                  <p
                                    className="flex items-start gap-1 text-xs italic text-amber-800/90 dark:text-amber-300/90"
                                    title={it.things_to_consider}
                                  >
                                    <Lightbulb
                                      className="mt-0.5 size-3 shrink-0"
                                      aria-hidden
                                    />
                                    <span className="line-clamp-2">
                                      {it.things_to_consider}
                                    </span>
                                  </p>
                                ) : null}
                              </Label>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t bg-background/60 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground" aria-live="polite">
            {selectedItems.length === 0
              ? "Select items to add to the quote."
              : `${selectedItems.length} selected · ${totalBaseHours} h base`}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              onClick={handleAdd}
              disabled={selectedItems.length === 0}
            >
              <Plus className="size-3.5" aria-hidden />
              Add {selectedItems.length || ""} to quote
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A small toggle pill for the role / level filters. */
function FilterChip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      title={title}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
        active
          ? "border-primary bg-primary/10 font-medium text-primary"
          : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
