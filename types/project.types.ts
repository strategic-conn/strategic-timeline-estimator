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
  owner_id: string;
  created_at: string;
  updated_at: string;
}

