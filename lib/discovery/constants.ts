import type {
  DiscoveryProject,
  MilestoneId,
  PhaseId,
  PhaseStatus,
  RiskLevel,
} from "@/types/discovery.types";

/** Productive hours per business day used to convert effort → calendar duration. */
export const BUSINESS_HOURS_PER_DAY = 6;

export const PHASE_ORDER: PhaseId[] = [
  "discovery",
  "content",
  "design",
  "development",
  "qa",
  "seo",
  "launch",
];

type PhaseMeta = {
  label: string;
  description: string;
  /** Tailwind bg for bars/dots. */
  bar: string;
  /** Tailwind text accent. */
  text: string;
  /** Tailwind soft background. */
  soft: string;
  /** Hex for SVG fills (spec-mandated phase colors). */
  hex: string;
};

export const PHASE_META: Record<PhaseId, PhaseMeta> = {
  discovery: {
    label: "Discovery & Strategy",
    description: "Kickoff, research, and project planning",
    bar: "bg-violet-500",
    text: "text-violet-600 dark:text-violet-400",
    soft: "bg-violet-500/10",
    hex: "#8b5cf6",
  },
  content: {
    label: "Content & Copy",
    description: "Copywriting, migration, and media coordination",
    bar: "bg-teal-500",
    text: "text-teal-600 dark:text-teal-400",
    soft: "bg-teal-500/10",
    hex: "#14b8a6",
  },
  design: {
    label: "Design & UX",
    description: "Wireframes, visual design, and brand",
    bar: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    soft: "bg-amber-500/10",
    hex: "#f59e0b",
  },
  development: {
    label: "Development",
    description: "Build, integrations, and functionality",
    bar: "bg-green-500",
    text: "text-green-600 dark:text-green-400",
    soft: "bg-green-500/10",
    hex: "#22c55e",
  },
  qa: {
    label: "QA & Testing",
    description: "Cross-browser, accessibility, and bug fixes",
    bar: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    soft: "bg-red-500/10",
    hex: "#ef4444",
  },
  seo: {
    label: "SEO Setup",
    description: "On-page SEO, schema, and search foundations",
    bar: "bg-indigo-500",
    text: "text-indigo-600 dark:text-indigo-400",
    soft: "bg-indigo-500/10",
    hex: "#6366f1",
  },
  launch: {
    label: "Launch & Handoff",
    description: "Go-live, documentation, and training",
    bar: "bg-pink-500",
    text: "text-pink-600 dark:text-pink-400",
    soft: "bg-pink-500/10",
    hex: "#ec4899",
  },
};

export const MILESTONES: { id: MilestoneId; label: string; phaseId: PhaseId }[] = [
  { id: "kickoff", label: "Kickoff", phaseId: "discovery" },
  { id: "design_approved", label: "Design Approved", phaseId: "design" },
  { id: "dev_complete", label: "Dev Complete", phaseId: "development" },
  { id: "qa_signoff", label: "QA Sign-off", phaseId: "qa" },
  { id: "go_live", label: "Go-Live", phaseId: "launch" },
];

export const PHASE_STATUS_META: Record<
  PhaseStatus,
  { label: string; dot: string; badge: string }
> = {
  not_started: {
    label: "Not Started",
    dot: "bg-muted-foreground/50",
    badge: "bg-muted text-muted-foreground",
  },
  in_progress: {
    label: "In Progress",
    dot: "bg-blue-500",
    badge: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  in_review: {
    label: "In Review",
    dot: "bg-yellow-500",
    badge: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  },
  complete: {
    label: "Complete",
    dot: "bg-green-500",
    badge: "bg-green-500/15 text-green-600 dark:text-green-400",
  },
  blocked: {
    label: "Blocked",
    dot: "bg-red-500",
    badge: "bg-red-500/15 text-red-600 dark:text-red-400",
  },
};

export const PHASE_STATUS_ORDER: PhaseStatus[] = [
  "not_started",
  "in_progress",
  "in_review",
  "complete",
  "blocked",
];

export const RISK_LEVEL_META: Record<
  RiskLevel,
  { label: string; badge: string; action: string }
> = {
  low: {
    label: "Low",
    badge: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
    action: "Proceed with estimate.",
  },
  medium: {
    label: "Medium",
    badge:
      "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
    action:
      "Note all assumptions in the scoping document. Confirm key unknowns with the client before anyone signs anything.",
  },
  high: {
    label: "High",
    badge:
      "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
    action:
      "Do not finalize any hours or timeline. Schedule a follow-up discovery call to close the open items before issuing a proposal.",
  },
  critical: {
    label: "Critical",
    badge: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
    action:
      "Do not issue an estimate at all. Return the project to Business Development for a more thorough Discovery session before any scoping work begins.",
  },
};

// ── Dropdown option lists ────────────────────────────────────────────────────
export type Option = { value: string; label: string };

export const PRIMARY_GOAL_OPTIONS: Option[] = [
  { value: "lead_gen", label: "Lead Gen" },
  { value: "ecommerce", label: "E-Commerce" },
  { value: "brand_awareness", label: "Brand Awareness" },
  { value: "recruiting", label: "Recruiting" },
  { value: "customer_portal", label: "Customer Portal" },
  { value: "event_registration", label: "Event Registration" },
  { value: "other", label: "Other" },
];

export const REGULATED_TYPE_OPTIONS: Option[] = [
  { value: "healthcare", label: "Healthcare" },
  { value: "finance", label: "Finance" },
  { value: "legal", label: "Legal" },
  { value: "education", label: "Education" },
  { value: "other", label: "Other" },
];

export const FORM_COMPLEXITY_OPTIONS: Option[] = [
  { value: "basic", label: "Basic" },
  { value: "multi_step", label: "Multi-step" },
  { value: "conditional", label: "Conditional Logic" },
];

export const PAYMENT_GATEWAY_OPTIONS: Option[] = [
  { value: "stripe", label: "Stripe" },
  { value: "paypal", label: "PayPal" },
  { value: "square", label: "Square" },
  { value: "other", label: "Other" },
];

export const DISCOVERY_PLATFORM_OPTIONS: Option[] = [
  { value: "wordpress", label: "WordPress" },
  { value: "webflow", label: "Webflow" },
  { value: "shopify", label: "Shopify" },
  { value: "custom", label: "Custom" },
  { value: "other", label: "Other" },
];

export const HOSTING_OPTIONS: Option[] = [
  { value: "azure", label: "Azure" },
  { value: "wp_engine", label: "WP Engine" },
  { value: "cloudflare", label: "Cloudflare" },
  { value: "client_host", label: "Client's existing host" },
  { value: "shopify", label: "Shopify" },
  { value: "other", label: "Other" },
];

export const CRM_OPTIONS: Option[] = [
  { value: "salesforce", label: "Salesforce" },
  { value: "hubspot", label: "HubSpot" },
  { value: "zoho", label: "Zoho" },
  { value: "other", label: "Other" },
];

export const EMAIL_OPTIONS: Option[] = [
  { value: "helium", label: "Helium" },
  { value: "mailchimp", label: "Mailchimp" },
  { value: "klaviyo", label: "Klaviyo" },
  { value: "other", label: "Other" },
];

export function optionLabel(options: Option[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

/** A blank project with spec defaults (on-page SEO on, 2 revision rounds). */
export function createEmptyDiscoveryProject(): Omit<
  DiscoveryProject,
  "id" | "created_at" | "updated_at"
> {
  return {
    name: "",
    client_name: "",
    primary_goal: "",
    is_redesign: false,
    current_url: "",
    regulated_industry: false,
    regulated_type: "",

    total_pages: null,
    unique_templates: null,
    has_blog: false,
    has_client_login: false,
    has_booking: false,
    has_job_board: false,
    has_calculators: false,
    multi_language: false,
    language_count: null,
    has_custom_forms: false,
    form_complexity: "",
    has_ecommerce: false,
    product_count: null,
    payment_gateway: "",
    has_product_variations: false,

    has_brand_guide: false,
    is_rebrand: false,
    has_existing_design_files: false,
    has_approved_photography: false,
    needs_custom_illustrations: false,
    needs_animations: false,
    platform: "",
    design_revision_rounds: 2,

    sc_writes_copy: false,
    copy_page_count: null,
    copy_ready: false,
    content_delivery_date: "",
    has_video_content: false,
    content_needs_legal_review: false,
    migration_page_count: null,

    hosting_environment: "",
    has_crm_integration: false,
    crm_platform: "",
    has_email_integration: false,
    email_platform: "",
    has_internal_system_integration: false,
    needs_analytics: false,
    needs_live_chat: false,
    needs_social_feeds: false,
    needs_redirect_mapping: false,
    needs_ada: false,
    needs_performance_benchmarks: false,

    on_page_seo_included: true,
    keyword_research_included: false,
    needs_schema_markup: false,
    needs_google_my_business: false,

    project_start_date: "",
    hard_launch_date: "",
    client_review_turnaround: 3,
    stakeholder_count: null,
    first_time_client: false,
    has_blackout_periods: false,
    blackout_notes: "",

    needs_cms_training: false,
    has_phase_2: false,
    has_retainer: false,
    retainer_hours_per_month: null,
  };
}
