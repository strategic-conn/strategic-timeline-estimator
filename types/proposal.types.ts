/**
 * Client quote / proposal estimator — coordinator line items (not sprint tasks).
 * Persisted locally until wired to Supabase (proposals table — see supabase/migrations/).
 *
 * v2 schema: replaces 4-tier complexity with Basic/Advanced/Custom multipliers,
 * adds platform, catalog references, dependencies, quantity, and global rollup
 * add-ons (PM/responsive/design/QA).
 */

import type { ProposalPlatform } from "@/lib/proposal-catalog";
import type { DiscoveryProject } from "@/types/discovery.types";

export type { ProposalPlatform };

export type ProposalTier = "basic" | "advanced" | "custom";

/** Approval lifecycle: draft → sent → approved/rejected. Approved → convert to project. */
export type ProposalStatus = "draft" | "sent" | "approved" | "rejected";

export interface ProposalLineItem {
  id: string;
  /** Short description of work for the client quote */
  title: string;
  /** Optional module label inherited from the catalog (e.g. "Homepage - Standard"). */
  module?: string | null;
  /** Optional category id from the catalog. */
  category_id?: number | null;
  /** Reference back to the catalog row id (per platform). Null = freehand line. */
  catalog_id?: number | null;
  /**
   * Base hours per unit before tier multiplier. Pulled from the catalog when
   * an item is imported, editable manually for freehand lines.
   */
  base_hours: number;
  /** Tier multiplier: basic=1x, advanced=1.5x, custom=2x. */
  tier: ProposalTier;
  /** Quantity (e.g. "per product w/ variations" = multiply by product count). */
  quantity: number;
  /** Computed snapshot: base_hours * tierMultiplier(tier) * quantity. */
  hours: number;
  /** Ids of other line items on the same quote that this depends on. */
  depends_on: string[];
}

/** How the PM percentage is chosen — preset simple/complex or a manual value. */
export type ProposalPmBasis = "simple" | "complex" | "custom";

export interface ProposalAddons {
  pm_enabled: boolean;
  /** Drives `pm_pct`: simple = 10%, complex = 15%, custom = manual entry. */
  pm_basis: ProposalPmBasis;
  pm_pct: number;
  responsive_enabled: boolean;
  responsive_pct: number;
  design_enabled: boolean;
  design_pct: number;
  qa_enabled: boolean;
  qa_pct: number;
}

/**
 * Snapshot of the Zoho CRM Deal a quote was imported from. Stored as jsonb on
 * `proposals.zoho` (migration 0029) so the CRM context (and a link back) is
 * available without calling Zoho again.
 */
/** A Zoho Products record picked for an estimate (and, later, for its Deal). */
export interface ZohoProductLink {
  id: string;
  name: string;
  code?: string | null;
  /** Standard `Product_Category` picklist (Creative / Sysdev / …). */
  category?: string | null;
  /** The org's own category field (ONBOARDING / SEO / …), when it has one. */
  tag?: string | null;
  /** Catalogue price from Zoho — reference only; the quote is priced by hours. */
  unit_price?: number | null;
}

/**
 * The estimate's link into PBS (the billing system).
 *
 * `client_id` is a PBS-internal numeric id — NOT the Zoho account id. The two
 * systems share no identifiers, and PBS has no clients endpoint, so the id is
 * picked in the estimator from a list derived from PO history.
 */
export interface ProposalPbsLink {
  client_id?: string | null;
  /** Three-letter client code, kept for display so the UI needn't re-derive it. */
  client_code?: string | null;
  po_id?: number | string | null;
  po_no?: string | null;
  /** When THIS app created the PO. */
  created_at?: string | null;
  /**
   * Server-side claim while a PO is being created — the compare-and-set that
   * stops two submits creating two POs. PBS has no delete endpoint.
   */
  creating_at?: string | null;
}

export interface ProposalZohoLink {
  /** Set when the quote was started from a Deal. */
  deal_id?: string | null;
  deal_name?: string | null;
  /** Company (Accounts module) — the client being billed. */
  account_id?: string | null;
  account?: string | null;
  /** Person at that company (Contacts module). An account can have several. */
  contact_id?: string | null;
  contact?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  /** Salesperson who owns the record (Owner). */
  owner?: string | null;
  closing_date?: string | null;
  amount?: number | null;
  currency?: string | null;
  quote_number?: string | number | null;
  /** Deal stage as of the last time this app read or wrote it in Zoho. */
  stage?: string | null;
  /** When `stage` was last confirmed against Zoho (absent = as of import). */
  stage_synced_at?: string | null;
  /**
   * Products this estimate is selling, chosen from the CRM's Products module.
   * Stored on the quote, not (yet) written onto the Deal — that needs the API
   * name of this org's "Packages" subform.
   */
  products?: ZohoProductLink[] | null;
  /** Set when THIS app opened the deal (POST /api/zoho/deals), not imported it. */
  created_in_zoho_at?: string | null;
  /**
   * Server-side claim marker while a deal is being created — the compare-and-set
   * that stops two concurrent requests opening two deals. Cleared on both the
   * success and failure paths; a value older than 2 min is treated as a crashed
   * request and stolen.
   */
  creating_at?: string | null;
  /** Deep link into the Zoho CRM record. */
  web_url?: string | null;
  imported_at: string;
  /**
   * CRM stage → when this app pushed it, e.g.
   * `{ "Proposal Sent": "2026-08-…", "Project Completed": "2026-09-…" }`.
   *
   * Per-stage rather than a single flag, because the deal advances more than
   * once over its life. It's the idempotency guard: Zoho does NOT dedupe
   * attachments, so re-pushing a stage would duplicate its file. Written
   * server-side by `POST /api/zoho/deals/[id]/push`.
   *
   * Read it via `zohoPushes()` — that folds in the legacy fields below.
   */
  pushes?: Record<string, string> | null;
  /** @deprecated Superseded by `pushes`; kept so quotes pushed before it still read correctly. */
  pushed_at?: string | null;
  /** @deprecated Superseded by `pushes`. */
  pushed_stage?: string | null;
}

export interface ClientQuote {
  id: string;
  title: string;
  /** Optional link to an internal project for context */
  project_id?: string | null;
  client_name?: string;
  notes?: string;
  /** Which platform's catalog this quote pulls from. */
  platform: ProposalPlatform;
  /** Approval lifecycle. New quotes start as `draft`. */
  status: ProposalStatus;
  line_items: ProposalLineItem[];
  /** Roll-up add-ons applied on top of dev hours (PM, responsive, design, QA). */
  addons: ProposalAddons;
  /**
   * Guided-scoping answers (the merged Discovery questionnaire). Present when the
   * estimate was built via the guided path; risk/timeline/Min-Mid-Max derive from
   * it (lib/discovery). Null/undefined = a catalog/manual quote with no scope.
   */
  discovery?: DiscoveryProject | null;
  /**
   * When true, requirements aren't pinned down yet — every line is priced as
   * Advanced (1.5×) for the totals regardless of its own tier (workbook rule).
   */
  requirements_unclear: boolean;
  /** Set when the quote was imported from a Zoho CRM Deal. */
  zoho?: ProposalZohoLink | null;
  /** Which PBS client this bills to, and the PO once it exists. */
  pbs?: ProposalPbsLink | null;
  created_at: string;
  updated_at: string;
}
