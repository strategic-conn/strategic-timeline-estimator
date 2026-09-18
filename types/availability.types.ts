/**
 * PTO and availability blocks (local demo until wired to Supabase — availability_entries table).
 * Dates are calendar dates in YYYY-MM-DD (workspace-local day boundaries).
 */

export type AvailabilityEntryKind = "pto" | "unavailable" | "partial";

/**
 * Time off is a REQUEST until an approver decides (migration 0034).
 *
 * Only `approved` reduces capacity or steers scheduling — see
 * `countsAgainstCapacity()`. Entries an admin/manager creates start approved:
 * they are the approver, so asking them to approve themselves is theatre.
 */
export type AvailabilityStatus = "pending" | "approved" | "rejected";

export interface AvailabilityEntry {
  id: string;
  user_id: string;
  /** Inclusive start (YYYY-MM-DD) */
  start_date: string;
  /** Inclusive end (YYYY-MM-DD) */
  end_date: string;
  kind: AvailabilityEntryKind;
  note?: string;
  status: AvailabilityStatus;
  /** Who decided. Null while pending, and cleared again if it is re-requested. */
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  /** The approver's reason — shown to the requester, who is owed one. */
  review_note?: string | null;
  created_at: string;
  updated_at: string;
}
