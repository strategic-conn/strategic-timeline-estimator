/**
 * Discovery Estimator — a rules-based scoping tool merged in from the SC Estimator spec.
 *
 * A completed 8-section Discovery Wizard (67 asked fields — each dropdown offering "Other" carries a `*_other` free-text companion, shown only when "Other" is picked; name/client/platform + platform-implied answers are mirrored from the estimate) feeds a deterministic engine
 * (lib/discovery/*) that produces Min/Mid/Max hours per phase + task, a calendar
 * timeline with milestones, and a risk score. Frontend-only (Zustand + localStorage);
 * the engine is the seam a backend/AI fills later. Sibling to the catalog-based
 * Proposals estimator — it can hand its result off to a ClientQuote.
 */

// ── Discovery project (mirrors the 64 DB columns in the spec) ───────────────
export interface DiscoveryProject {
  id: string;

  // Section 1 — Goals & Context
  name: string;
  client_name: string;
  primary_goal: string;
  /** Free text when `primary_goal` is "other". */
  primary_goal_other: string;
  is_redesign: boolean;
  current_url: string;
  regulated_industry: boolean;
  regulated_type: string;
  regulated_type_other: string;

  // Section 2 — Scope & Structure
  total_pages: number | null;
  unique_templates: number | null;
  has_blog: boolean;
  has_client_login: boolean;
  has_booking: boolean;
  has_job_board: boolean;
  has_calculators: boolean;
  multi_language: boolean;
  language_count: number | null;
  has_custom_forms: boolean;
  form_complexity: string;
  has_ecommerce: boolean;
  product_count: number | null;
  payment_gateway: string;
  payment_gateway_other: string;
  has_product_variations: boolean;

  // Section 3 — Design & Brand
  has_brand_guide: boolean;
  is_rebrand: boolean;
  has_existing_design_files: boolean;
  has_approved_photography: boolean;
  needs_custom_illustrations: boolean;
  needs_animations: boolean;
  platform: string;
  design_revision_rounds: number | null;

  // Section 4 — Content
  sc_writes_copy: boolean;
  copy_page_count: number | null;
  copy_ready: boolean;
  content_delivery_date: string;
  has_video_content: boolean;
  content_needs_legal_review: boolean;
  migration_page_count: number | null;

  // Section 5 — Technical Requirements & Integrations
  hosting_environment: string;
  hosting_environment_other: string;
  has_crm_integration: boolean;
  crm_platform: string;
  crm_platform_other: string;
  has_email_integration: boolean;
  email_platform: string;
  email_platform_other: string;
  has_internal_system_integration: boolean;
  needs_analytics: boolean;
  needs_live_chat: boolean;
  needs_social_feeds: boolean;
  needs_redirect_mapping: boolean;
  needs_ada: boolean;
  needs_performance_benchmarks: boolean;

  // Section 6 — SEO & Digital Marketing
  on_page_seo_included: boolean;
  keyword_research_included: boolean;
  needs_schema_markup: boolean;
  needs_google_my_business: boolean;

  // Section 7 — Timeline & Decision-Making
  project_start_date: string;
  hard_launch_date: string;
  client_review_turnaround: number | null;
  stakeholder_count: number | null;
  first_time_client: boolean;
  has_blackout_periods: boolean;
  blackout_notes: string;

  // Section 8 — Post-Launch & Ongoing Support
  needs_cms_training: boolean;
  has_phase_2: boolean;
  has_retainer: boolean;
  retainer_hours_per_month: number | null;

  created_at: string;
  updated_at: string;
}

// ── Estimate ────────────────────────────────────────────────────────────────
export type PhaseId =
  | "discovery"
  | "content"
  | "design"
  | "development"
  | "qa"
  | "seo"
  | "launch";

export interface HoursRange {
  min: number;
  mid: number;
  max: number;
}

export interface EstimateTask extends HoursRange {
  /** Stable id (`${phaseId}:${slug}`) so tracker checkboxes survive re-computation. */
  id: string;
  phaseId: PhaseId;
  name: string;
  note?: string;
}

export interface EstimatePhase extends HoursRange {
  id: PhaseId;
  label: string;
  description: string;
  tasks: EstimateTask[];
}

export interface Estimate {
  phases: EstimatePhase[];
  total: HoursRange;
  /** Shown as a separate line, excluded from the project total. */
  retainer: { hoursPerMonth: number } | null;
  assumptions: string[];
}

// ── Risk ────────────────────────────────────────────────────────────────────
export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskFlag {
  label: string;
  points: number;
}

export interface RiskResult {
  score: number;
  level: RiskLevel;
  recommendedAction: string;
  flags: RiskFlag[];
  unansweredCount: number;
}

// ── Timeline ────────────────────────────────────────────────────────────────
export interface TimelinePhase {
  id: PhaseId;
  label: string;
  /** Business-day offsets from the project start. */
  startOffset: number;
  endOffset: number;
  durationDays: number;
  startDate: string;
  endDate: string;
}

export type MilestoneId =
  | "kickoff"
  | "design_approved"
  | "dev_complete"
  | "qa_signoff"
  | "go_live";

export interface Milestone {
  id: MilestoneId;
  label: string;
  phaseId: PhaseId;
  offset: number;
  date: string;
}

export interface DiscoveryTimeline {
  phases: TimelinePhase[];
  milestones: Milestone[];
  totalBusinessDays: number;
  totalWeeks: number;
  launchDate: string;
}

export interface DiscoveryResult {
  estimate: Estimate;
  timeline: DiscoveryTimeline;
  risk: RiskResult;
}

// ── Tracker ─────────────────────────────────────────────────────────────────
export type PhaseStatus =
  | "not_started"
  | "in_progress"
  | "in_review"
  | "complete"
  | "blocked";

export interface TrackerState {
  checkedTasks: Record<string, boolean>;
  phaseStatus: Record<string, PhaseStatus>;
  hoursLogged: Record<string, number>;
  phaseNotes: Record<string, string>;
}
