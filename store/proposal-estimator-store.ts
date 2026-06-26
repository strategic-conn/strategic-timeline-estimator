"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { CatalogItem } from "@/lib/proposal-catalog";
import {
  DEFAULT_ADDONS,
  computeLineHours,
} from "@/lib/constants/proposal-estimator";
import type {
  ClientQuote,
  ProposalAddons,
  ProposalLineItem,
  ProposalPlatform,
  ProposalTier,
} from "@/types/proposal.types";

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function nextQuoteId(quotes: ClientQuote[]): string {
  let max = 0;
  for (const q of quotes) {
    const m = /^quote-(\d+)$/.exec(q.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `quote-${max + 1}`;
}

const proposalEstimatorStorage = createJSONStorage(() => {
  if (typeof window === "undefined") {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
  }
  return window.localStorage;
});

function emptyLineItem(): ProposalLineItem {
  const tier: ProposalTier = "basic";
  const base_hours = 2;
  return {
    id: uid(),
    title: "",
    module: null,
    category_id: null,
    catalog_id: null,
    base_hours,
    tier,
    quantity: 1,
    hours: computeLineHours(base_hours, tier, 1),
    depends_on: [],
  };
}

function lineItemFromCatalog(item: CatalogItem): ProposalLineItem {
  const tier: ProposalTier = "basic";
  return {
    id: uid(),
    title: item.name,
    module: item.module,
    category_id: item.category_id,
    catalog_id: item.id,
    base_hours: item.base_hours,
    tier,
    quantity: 1,
    hours: computeLineHours(item.base_hours, tier, 1),
    depends_on: [],
  };
}

export type CreateQuoteInput = {
  title: string;
  project_id?: string | null;
  client_name?: string;
  platform?: ProposalPlatform;
};

/** A fully-formed quote draft (e.g. from Esther) imported in one shot, tiers preserved. */
export type ProposalDraftInput = {
  title: string;
  project_id?: string | null;
  client_name?: string;
  notes?: string;
  platform: ProposalPlatform;
  requirements_unclear?: boolean;
  addons?: Partial<ProposalAddons>;
  line_items: Array<
    Pick<
      ProposalLineItem,
      "title" | "base_hours" | "tier" | "quantity"
    > &
      Partial<Pick<ProposalLineItem, "module" | "category_id" | "catalog_id">>
  >;
};

export type LineItemPatch = Partial<
  Pick<
    ProposalLineItem,
    | "title"
    | "module"
    | "category_id"
    | "catalog_id"
    | "base_hours"
    | "tier"
    | "quantity"
    | "depends_on"
  >
>;

interface ProposalEstimatorState {
  proposals: ClientQuote[];
  createProposal: (input: CreateQuoteInput) => string;
  createProposalFromDraft: (input: ProposalDraftInput) => string;
  updateProposal: (
    id: string,
    partial: Partial<
      Pick<
        ClientQuote,
        | "title"
        | "project_id"
        | "client_name"
        | "notes"
        | "platform"
        | "requirements_unclear"
      >
    >,
  ) => void;
  updateAddons: (id: string, partial: Partial<ProposalAddons>) => void;
  deleteProposal: (id: string) => void;
  addLineItem: (proposalId: string) => void;
  addLineItemsFromCatalog: (proposalId: string, items: CatalogItem[]) => void;
  updateLineItem: (
    proposalId: string,
    lineId: string,
    partial: LineItemPatch,
  ) => void;
  removeLineItem: (proposalId: string, lineId: string) => void;
}

function recomputeHours(line: ProposalLineItem): ProposalLineItem {
  return {
    ...line,
    hours: computeLineHours(line.base_hours, line.tier, line.quantity),
  };
}

export const useProposalEstimatorStore = create<ProposalEstimatorState>()(
  persist(
    (set, get) => ({
      proposals: [],

      createProposal: (input) => {
        const id = nextQuoteId(get().proposals);
        const now = new Date().toISOString();
        const quote: ClientQuote = {
          id,
          title: input.title.trim() || "Untitled quote",
          project_id: input.project_id ?? null,
          client_name: input.client_name?.trim() || undefined,
          notes: undefined,
          platform: input.platform ?? "react_next",
          line_items: [emptyLineItem()],
          addons: { ...DEFAULT_ADDONS },
          requirements_unclear: false,
          created_at: now,
          updated_at: now,
        };
        set((s) => ({ proposals: [quote, ...s.proposals] }));
        return id;
      },

      createProposalFromDraft: (input) => {
        const id = nextQuoteId(get().proposals);
        const now = new Date().toISOString();
        const line_items: ProposalLineItem[] = (
          input.line_items.length ? input.line_items : [{
            title: "",
            base_hours: 2,
            tier: "basic" as ProposalTier,
            quantity: 1,
          }]
        ).map((li) => ({
          id: uid(),
          title: li.title,
          module: li.module ?? null,
          category_id: li.category_id ?? null,
          catalog_id: li.catalog_id ?? null,
          base_hours: li.base_hours,
          tier: li.tier,
          quantity: li.quantity,
          hours: computeLineHours(li.base_hours, li.tier, li.quantity),
          depends_on: [],
        }));
        const quote: ClientQuote = {
          id,
          title: input.title.trim() || "Untitled quote",
          project_id: input.project_id ?? null,
          client_name: input.client_name?.trim() || undefined,
          notes: input.notes?.trim() || undefined,
          platform: input.platform,
          line_items,
          addons: { ...DEFAULT_ADDONS, ...input.addons },
          requirements_unclear: input.requirements_unclear ?? false,
          created_at: now,
          updated_at: now,
        };
        set((s) => ({ proposals: [quote, ...s.proposals] }));
        return id;
      },

      updateProposal: (id, partial) =>
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id === id
              ? {
                  ...p,
                  ...partial,
                  updated_at: new Date().toISOString(),
                }
              : p,
          ),
        })),

      updateAddons: (id, partial) =>
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id === id
              ? {
                  ...p,
                  addons: { ...p.addons, ...partial },
                  updated_at: new Date().toISOString(),
                }
              : p,
          ),
        })),

      deleteProposal: (id) =>
        set((s) => ({ proposals: s.proposals.filter((p) => p.id !== id) })),

      addLineItem: (proposalId) =>
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id === proposalId
              ? {
                  ...p,
                  line_items: [...p.line_items, emptyLineItem()],
                  updated_at: new Date().toISOString(),
                }
              : p,
          ),
        })),

      addLineItemsFromCatalog: (proposalId, items) => {
        if (!items.length) return;
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id === proposalId
              ? {
                  ...p,
                  line_items: [
                    ...p.line_items,
                    ...items.map((it) => lineItemFromCatalog(it)),
                  ],
                  updated_at: new Date().toISOString(),
                }
              : p,
          ),
        }));
      },

      updateLineItem: (proposalId, lineId, partial) =>
        set((s) => ({
          proposals: s.proposals.map((p) => {
            if (p.id !== proposalId) return p;
            return {
              ...p,
              line_items: p.line_items.map((li) => {
                if (li.id !== lineId) return li;
                const next: ProposalLineItem = { ...li, ...partial };
                if (
                  partial.base_hours !== undefined ||
                  partial.tier !== undefined ||
                  partial.quantity !== undefined
                ) {
                  return recomputeHours(next);
                }
                return next;
              }),
              updated_at: new Date().toISOString(),
            };
          }),
        })),

      removeLineItem: (proposalId, lineId) =>
        set((s) => ({
          proposals: s.proposals.map((p) => {
            if (p.id !== proposalId) return p;
            const nextLines = p.line_items
              .filter((li) => li.id !== lineId)
              .map((li) => ({
                ...li,
                depends_on: li.depends_on.filter((d) => d !== lineId),
              }));
            return {
              ...p,
              line_items:
                nextLines.length > 0 ? nextLines : [emptyLineItem()],
              updated_at: new Date().toISOString(),
            };
          }),
        })),
    }),
    {
      name: "timeline-proposal-estimator",
      version: 3,
      storage: proposalEstimatorStorage,
      migrate: (state, fromVersion) => {
        if (!state || typeof state !== "object") return state;
        // v2 -> v3: add pm_basis to add-ons and requirements_unclear to quotes.
        if (fromVersion >= 2) {
          const current = state as {
            proposals?: Array<Record<string, unknown>>;
          };
          const proposals = Array.isArray(current.proposals)
            ? current.proposals.map((q) => {
                const addons =
                  q.addons && typeof q.addons === "object"
                    ? (q.addons as Record<string, unknown>)
                    : {};
                return {
                  ...q,
                  requirements_unclear:
                    typeof q.requirements_unclear === "boolean"
                      ? q.requirements_unclear
                      : false,
                  addons: {
                    ...DEFAULT_ADDONS,
                    ...addons,
                    pm_basis:
                      addons.pm_basis === "complex" ||
                      addons.pm_basis === "custom"
                        ? addons.pm_basis
                        : "simple",
                  },
                };
              })
            : [];
          return { ...current, proposals } as unknown as ProposalEstimatorState;
        }
        // v1 -> v2 migration: map old complexity tiers + add new fields.
        const legacy = state as {
          proposals?: Array<Record<string, unknown>>;
        };
        const proposals = Array.isArray(legacy.proposals)
          ? legacy.proposals.map((q) => {
              const lineItemsRaw = Array.isArray(q.line_items)
                ? (q.line_items as Array<Record<string, unknown>>)
                : [];
              const line_items: ProposalLineItem[] = lineItemsRaw.map(
                (li) => {
                  const oldHours =
                    typeof li.hours === "number" ? li.hours : 2;
                  const title =
                    typeof li.title === "string" ? li.title : "";
                  return {
                    id:
                      typeof li.id === "string"
                        ? li.id
                        : `${Date.now()}-${Math.random()
                            .toString(36)
                            .slice(2, 9)}`,
                    title,
                    module: null,
                    category_id: null,
                    catalog_id: null,
                    base_hours: oldHours,
                    tier: "basic",
                    quantity: 1,
                    hours: oldHours,
                    depends_on: [],
                  };
                },
              );
              return {
                ...q,
                platform: "react_next",
                line_items,
                addons: { ...DEFAULT_ADDONS },
                requirements_unclear: false,
              };
            })
          : [];
        return { ...legacy, proposals } as unknown as ProposalEstimatorState;
      },
    },
  ),
);
