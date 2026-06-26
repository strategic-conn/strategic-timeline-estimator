/**
 * Esther — the document-to-proposal assistant (demo / frontend-only).
 *
 * Esther reads a brief (typed or "uploaded"), scopes it against the real proposal
 * catalog, and produces an estimate + timeline + a proposal draft. All analysis is
 * deterministic and runs in the browser (lib/esther/engine.ts) — there is no AI
 * backend yet; this is the seam an LLM/Edge Function fills later.
 */
import type { QuoteTotals } from "@/lib/constants/proposal-estimator";
import type { ProposalPlatform, ProposalTier } from "@/types/proposal.types";

export interface EstherLineItem {
  /** Catalog row this maps to (null = freehand). Enables a lossless proposal hand-off. */
  catalog_id: number | null;
  title: string;
  module: string | null;
  category_id: number | null;
  base_hours: number;
  tier: ProposalTier;
  quantity: number;
  /** base_hours × tier multiplier × quantity (snapshot). */
  hours: number;
}

export interface EstherTimelinePhase {
  name: string;
  hours: number;
  /** 1-based, inclusive week bounds. */
  startWeek: number;
  endWeek: number;
  /** Share of total effort (0–1) — drives the bar width. */
  share: number;
}

export interface EstherAnalysis {
  suggestedTitle: string;
  clientName?: string;
  platform: ProposalPlatform;
  /** One-paragraph plain-language summary of the scope + estimate. */
  summary: string;
  assumptions: string[];
  lineItems: EstherLineItem[];
  totals: QuoteTotals;
  totalWeeks: number;
  timeline: EstherTimelinePhase[];
}

export type EstherMessage =
  | {
      id: string;
      role: "user";
      createdAt: string;
      text: string;
      /** Name of the "document" attached to this message, if any. */
      attachmentName?: string;
    }
  | {
      id: string;
      role: "assistant";
      createdAt: string;
      kind: "text";
      text: string;
    }
  | {
      id: string;
      role: "assistant";
      createdAt: string;
      kind: "analysis";
      /** Intro line shown above the analysis card. */
      text: string;
      analysis: EstherAnalysis;
    };
