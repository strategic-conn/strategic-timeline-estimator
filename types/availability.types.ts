/**
 * PTO and availability blocks (local demo until wired to Supabase — availability_entries table).
 * Dates are calendar dates in YYYY-MM-DD (workspace-local day boundaries).
 */

export type AvailabilityEntryKind = "pto" | "unavailable" | "partial";

export interface AvailabilityEntry {
  id: string;
  user_id: string;
  /** Inclusive start (YYYY-MM-DD) */
  start_date: string;
  /** Inclusive end (YYYY-MM-DD) */
  end_date: string;
  kind: AvailabilityEntryKind;
  note?: string;
  created_at: string;
  updated_at: string;
}
