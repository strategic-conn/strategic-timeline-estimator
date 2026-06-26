"use client";

import * as React from "react";
import { Plus, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  catalogForPlatform,
  categoryName,
  groupCatalogByModule,
  platformLabel,
  type CatalogItem,
  type ProposalPlatform,
} from "@/lib/proposal-catalog";

type ProposalCatalogBrowserProps = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  platform: ProposalPlatform;
  /** Catalog ids already present on the quote — shown as "Added". */
  alreadyAddedIds: Set<number>;
  onAdd: (items: CatalogItem[]) => void;
};

export function ProposalCatalogBrowser({
  open,
  onOpenChange,
  platform,
  alreadyAddedIds,
  onAdd,
}: ProposalCatalogBrowserProps) {
  const items = React.useMemo(
    () => catalogForPlatform(platform),
    [platform],
  );
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<Set<number>>(new Set());

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setSelected(new Set());
    }
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        it.module.toLowerCase().includes(q) ||
        (it.description ?? "").toLowerCase().includes(q),
    );
  }, [items, query]);

  const groups = React.useMemo(
    () => groupCatalogByModule(filtered),
    [filtered],
  );

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedItems = React.useMemo(
    () => items.filter((it) => selected.has(it.id)),
    [items, selected],
  );

  const totalBaseHours = selectedItems.reduce(
    (s, it) => s + it.base_hours,
    0,
  );

  const handleAdd = () => {
    if (!selectedItems.length) return;
    onAdd(selectedItems);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full max-w-full flex-col gap-0 p-0 sm:max-w-2xl"
      >
        <SheetHeader className="shrink-0 border-b px-4 pb-3 pt-4 pr-12">
          <SheetTitle>Catalog · {platformLabel(platform)}</SheetTitle>
          <SheetDescription>
            Pick prebuilt tasks. Hours auto-fill from base × tier multiplier.
          </SheetDescription>
          <div className="mt-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tasks, modules, descriptions"
                className="pl-7"
              />
            </div>
            <Badge
              variant="secondary"
              className="shrink-0 tabular-nums"
              aria-live="polite"
            >
              {filtered.length}
            </Badge>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3">
          {groups.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No catalog items match your search.
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {groups.map((group) => (
                <li key={group.module}>
                  <div className="px-3 pb-1 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
                    <span>{group.module}</span>
                    {group.categoryId != null ? (
                      <span className="ml-2 text-foreground/60">
                        · {categoryName(group.categoryId)}
                      </span>
                    ) : null}
                  </div>
                  <ul className="rounded-2xl border bg-card/40 p-1">
                    {group.items.map((it) => {
                      const checked = selected.has(it.id);
                      const isAdded = alreadyAddedIds.has(it.id);
                      const inputId = `cat-${it.id}`;
                      return (
                        <li
                          key={it.id}
                          className="flex items-start gap-3 rounded-xl px-3 py-2 hover:bg-muted/60"
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
                                  className="text-[0.65rem]"
                                >
                                  Added
                                </Badge>
                              ) : null}
                              <Badge
                                variant="secondary"
                                className="ml-auto tabular-nums"
                              >
                                {it.base_hours} h base
                              </Badge>
                            </div>
                            {it.description ? (
                              <p className="line-clamp-2 text-xs text-muted-foreground">
                                {it.description}
                              </p>
                            ) : null}
                          </Label>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>

        <SheetFooter className="shrink-0 border-t bg-background/60 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
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
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
