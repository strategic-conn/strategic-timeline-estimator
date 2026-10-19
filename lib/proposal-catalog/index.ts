/**
 * Static proposal catalog generated from `project-csv/tasks and integration.xlsx`.
 * Frontend-only data source. Replace with API when available.
 */

import catalogJson from "./catalog.json";

export type ProposalPlatform =
  | "wordpress"
  | "shopify"
  | "wix"
  | "squarespace"
  | "php"
  | "react_next"
  | "custom";

/** What a new estimate starts on — most of the work quoted here is WordPress. */
export const DEFAULT_PLATFORM: ProposalPlatform = "wordpress";

export interface CatalogCategory {
  id: number;
  name: string;
  description: string;
}

export interface CatalogItem {
  id: number;
  module: string;
  name: string;
  category_id: number | null;
  base_hours: number;
  description: string;
  dependencies_note: string | null;
  /**
   * Who does the work and at what seniority — the workbook's Responsible +
   * Level. Together they are the lookup key into `hourly_rates` ("IT|Level 2").
   * Not yet used for pricing (pricing plan Phase 3) or assignment (Phase 4).
   */
  responsible: string;
  level: 1 | 2;
  /** What can push the hours up or down. A note only; changes no calculation. */
  things_to_consider: string | null;
}

interface CatalogShape {
  categories: CatalogCategory[];
  platforms: Record<Exclude<ProposalPlatform, "custom">, CatalogItem[]>;
}

const data = catalogJson as CatalogShape;

export const PROPOSAL_PLATFORM_OPTIONS: {
  value: ProposalPlatform;
  label: string;
  /** True when this platform has a baked catalog list. `custom` has none. */
  hasCatalog: boolean;
}[] = [
  { value: "wordpress", label: "WordPress", hasCatalog: true },
  { value: "shopify", label: "Shopify", hasCatalog: true },
  { value: "wix", label: "Wix", hasCatalog: true },
  { value: "squarespace", label: "Squarespace", hasCatalog: true },
  { value: "php", label: "Custom (PHP / HTML / CSS)", hasCatalog: true },
  { value: "react_next", label: "Custom (React / Next.js)", hasCatalog: true },
  { value: "custom", label: "Other / blank slate", hasCatalog: false },
];

export const CATALOG_CATEGORIES: CatalogCategory[] = data.categories;

export function platformLabel(platform: ProposalPlatform): string {
  return (
    PROPOSAL_PLATFORM_OPTIONS.find((p) => p.value === platform)?.label ??
    platform
  );
}

export function categoryById(
  id: number | null | undefined,
): CatalogCategory | null {
  if (id == null) return null;
  return CATALOG_CATEGORIES.find((c) => c.id === id) ?? null;
}

/**
 * A category's id by its NAME. Categories were renumbered in catalog v3
 * (19 -> 23), so code must never compare against a literal id: Esther checked
 * `category_id === 5` for "e-commerce", and 5 now means Custom Tools.
 */
export function categoryIdByName(name: string): number | null {
  return data.categories.find((c) => c.name === name)?.id ?? null;
}

export function categoryName(id: number | null | undefined): string | null {
  return categoryById(id)?.name ?? null;
}

/** Returns the catalog rows for a platform (empty array for `custom`). */
export function catalogForPlatform(platform: ProposalPlatform): CatalogItem[] {
  if (platform === "custom") return [];
  return data.platforms[platform] ?? [];
}

/**
 * Parse a free-text `dependencies_note` into the catalog ids it references.
 * Handles ranges ("37-40"), singles ("108"), and `+`-joined lists
 * ("122: Backup + 121: Final QA"). Ranges are expanded inclusively.
 */
export function parseDependencyIds(note: string | null | undefined): number[] {
  if (!note) return [];
  const ids = new Set<number>();
  // Expand "a-b" ranges first, then strip them so the leftover scan only sees singles.
  const rest = note.replace(/(\d+)\s*-\s*(\d+)/g, (_, a: string, b: string) => {
    const start = Number(a);
    const end = Number(b);
    if (end >= start && end - start < 200) {
      for (let i = start; i <= end; i++) ids.add(i);
    }
    return " ";
  });
  for (const m of rest.matchAll(/\d+/g)) ids.add(Number(m[0]));
  return [...ids];
}

/** The catalog rows a given item depends on (same platform). */
export function catalogDependencies(
  platform: ProposalPlatform,
  catalogId: number,
): CatalogItem[] {
  const items = catalogForPlatform(platform);
  const item = items.find((it) => it.id === catalogId);
  if (!item) return [];
  const depIds = new Set(parseDependencyIds(item.dependencies_note));
  return items.filter((it) => depIds.has(it.id));
}

export interface MissingDependency {
  /** The catalog row that should probably be added. */
  item: CatalogItem;
  /** Names of the already-selected items that require it. */
  requiredBy: string[];
}

/**
 * Given the catalog ids already on a quote, surface prerequisite catalog rows
 * that are referenced by a selected item but not themselves selected. This is
 * the workbook's "you probably missed a task" check.
 */
export function findMissingDependencies(
  platform: ProposalPlatform,
  selectedCatalogIds: Iterable<number>,
): MissingDependency[] {
  const items = catalogForPlatform(platform);
  if (!items.length) return [];
  const byId = new Map(items.map((it) => [it.id, it]));
  const selected = new Set(selectedCatalogIds);

  // missing id -> names of selected items that require it
  const missing = new Map<number, string[]>();
  for (const id of selected) {
    const item = byId.get(id);
    if (!item) continue;
    for (const depId of parseDependencyIds(item.dependencies_note)) {
      if (selected.has(depId) || !byId.has(depId)) continue;
      const list = missing.get(depId) ?? [];
      list.push(item.name);
      missing.set(depId, list);
    }
  }

  return [...missing.entries()]
    .map(([depId, requiredBy]) => ({ item: byId.get(depId)!, requiredBy }))
    .sort((a, b) => a.item.id - b.item.id);
}

/** Grouping helper used by the catalog browser. */
export interface CatalogModuleGroup {
  module: string;
  categoryId: number | null;
  items: CatalogItem[];
}

export function groupCatalogByModule(
  items: CatalogItem[],
): CatalogModuleGroup[] {
  const map = new Map<string, CatalogModuleGroup>();
  const order: string[] = [];
  for (const it of items) {
    const key = it.module || "General";
    if (!map.has(key)) {
      map.set(key, {
        module: key,
        categoryId: it.category_id,
        items: [],
      });
      order.push(key);
    }
    map.get(key)!.items.push(it);
  }
  return order.map((k) => map.get(k)!);
}
