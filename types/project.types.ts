export type ProjectStatus = "active" | "completed" | "archived";

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  /**
   * Owner. In demo mode this is a stringified TEAM_MEMBERS id ("1"–"6"); in
   * Supabase mode it's the owner's profile UUID.
   */
  /** null = owner was deleted ("Former member"). */
  owner_id: string | null;
  /**
   * Schedule contingency, 0–100 (migration 0036). Carried over from the
   * estimate at conversion. Drives the risk-adjusted finish shown beside the
   * planned one; pushing the real sprint dates out is an explicit action.
   */
  risk_buffer_pct?: number;
  created_at: string;
  updated_at: string;
}

