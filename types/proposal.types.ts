/**
 * Client quote / proposal estimator — coordinator line items (not sprint tasks).
 * Persisted locally until Laravel endpoints exist.
 */

export type ProposalComplexity = "easy" | "medium" | "complex" | "very_complex";

export interface ProposalLineItem {
  id: string;
  /** Short description of work for the client quote */
  title: string;
  complexity: ProposalComplexity;
  /** Snapshot hours from tier at last edit (display + roll-up) */
  hours: number;
}

export interface ClientQuote {
  id: string;
  title: string;
  /** Optional link to an internal project for context */
  project_id?: string | null;
  client_name?: string;
  notes?: string;
  line_items: ProposalLineItem[];
  created_at: string;
  updated_at: string;
}
