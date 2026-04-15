"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { hoursForComplexity } from "@/lib/constants/proposal-estimator";
import type {
  ClientQuote,
  ProposalComplexity,
  ProposalLineItem,
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

function emptyLineItem(): ProposalLineItem {
  const complexity: ProposalComplexity = "medium";
  return {
    id: uid(),
    title: "",
    complexity,
    hours: hoursForComplexity(complexity),
  };
}

export type CreateQuoteInput = {
  title: string;
  project_id?: string | null;
  client_name?: string;
};

interface ProposalEstimatorState {
  proposals: ClientQuote[];
  createProposal: (input: CreateQuoteInput) => string;
  updateProposal: (
    id: string,
    partial: Partial<
      Pick<ClientQuote, "title" | "project_id" | "client_name" | "notes">
    >
  ) => void;
  deleteProposal: (id: string) => void;
  addLineItem: (proposalId: string) => void;
  updateLineItem: (
    proposalId: string,
    lineId: string,
    partial: Partial<Pick<ProposalLineItem, "title" | "complexity">>
  ) => void;
  removeLineItem: (proposalId: string, lineId: string) => void;
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
          line_items: [emptyLineItem()],
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
              : p
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
              : p
          ),
        })),

      updateLineItem: (proposalId, lineId, partial) =>
        set((s) => ({
          proposals: s.proposals.map((p) => {
            if (p.id !== proposalId) return p;
            return {
              ...p,
              line_items: p.line_items.map((li) => {
                if (li.id !== lineId) return li;
                const next = { ...li, ...partial };
                if (partial.complexity != null) {
                  next.hours = hoursForComplexity(partial.complexity);
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
            const nextLines = p.line_items.filter((li) => li.id !== lineId);
            return {
              ...p,
              line_items:
                nextLines.length > 0 ? nextLines : [emptyLineItem()],
              updated_at: new Date().toISOString(),
            };
          }),
        })),
    }),
    { name: "timeline-proposal-estimator", version: 1 }
  )
);
