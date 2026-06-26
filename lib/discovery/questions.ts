import {
  CRM_OPTIONS,
  DISCOVERY_PLATFORM_OPTIONS,
  EMAIL_OPTIONS,
  FORM_COMPLEXITY_OPTIONS,
  HOSTING_OPTIONS,
  PAYMENT_GATEWAY_OPTIONS,
  PRIMARY_GOAL_OPTIONS,
  REGULATED_TYPE_OPTIONS,
  type Option,
} from "@/lib/discovery/constants";
import type { DiscoveryProject } from "@/types/discovery.types";

export type FieldType =
  | "text"
  | "textarea"
  | "url"
  | "number"
  | "toggle"
  | "dropdown"
  | "date";

export type DiscoveryFieldId = keyof Omit<
  DiscoveryProject,
  "id" | "created_at" | "updated_at"
>;

export interface DiscoveryQuestion {
  id: DiscoveryFieldId;
  section: number;
  label: string;
  type: FieldType;
  options?: Option[];
  help?: string;
  /** Short "what this drives" hint from the spec's Estimation Impact column. */
  impact?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  /** Always required for a valid estimate. */
  required?: boolean;
  /** Conditionally required (e.g. URL only when redesign). */
  requiredWhen?: (p: DiscoveryProject) => boolean;
  /** Hidden until the condition is met. */
  visibleWhen?: (p: DiscoveryProject) => boolean;
  /** Inline warning (e.g. client copy not ready). */
  warnWhen?: (p: DiscoveryProject) => boolean;
  warnText?: string;
}

export const DISCOVERY_SECTIONS: {
  n: number;
  title: string;
  subtitle: string;
}[] = [
  {
    n: 1,
    title: "Goals & Context",
    subtitle:
      "Determines strategy/research complexity and whether this is a website or a web app.",
  },
  {
    n: 2,
    title: "Scope & Structure",
    subtitle:
      "Page count, templates, and features are the biggest drivers of total hours.",
  },
  {
    n: 3,
    title: "Design & Brand",
    subtitle:
      "Existing brand assets vs. greenfield design is a major time difference.",
  },
  {
    n: 4,
    title: "Content",
    subtitle: "Content ownership is the #1 source of timeline delays.",
  },
  {
    n: 5,
    title: "Technical Requirements & Integrations",
    subtitle:
      "Every integration adds Development and QA hours; internal systems carry the most uncertainty.",
  },
  {
    n: 6,
    title: "SEO & Digital Marketing",
    subtitle: "On-page SEO is on by default and scales with page count.",
  },
  {
    n: 7,
    title: "Timeline & Decision-Making",
    subtitle:
      "Exposes schedule risks; review turnaround buffers every approval gate.",
  },
  {
    n: 8,
    title: "Post-Launch & Ongoing Support",
    subtitle:
      "Defines what's included vs. billable after go-live. Retainer is a separate line.",
  },
];

export const DISCOVERY_QUESTIONS: DiscoveryQuestion[] = [
  // ── Section 1 ──────────────────────────────────────────────────────────
  { id: "name", section: 1, label: "Project Name", type: "text", required: true },
  { id: "client_name", section: 1, label: "Client Name", type: "text", required: true },
  {
    id: "primary_goal",
    section: 1,
    label: "Primary Business Goal",
    type: "dropdown",
    options: PRIMARY_GOAL_OPTIONS,
    required: true,
    impact: "Informs strategy phase framing",
  },
  {
    id: "is_redesign",
    section: 1,
    label: "Is this a redesign / rebuild?",
    type: "toggle",
    impact: "+3–5 hrs Discovery (site audit); enables redirect mapping",
  },
  {
    id: "current_url",
    section: 1,
    label: "Current Website URL",
    type: "url",
    placeholder: "https://…",
    visibleWhen: (p) => p.is_redesign,
    requiredWhen: (p) => p.is_redesign,
    impact: "Required for the audit",
  },
  {
    id: "regulated_industry",
    section: 1,
    label: "Regulated Industry?",
    type: "toggle",
    impact: "+4–8 hrs Discovery (compliance review)",
  },
  {
    id: "regulated_type",
    section: 1,
    label: "Industry Type",
    type: "dropdown",
    options: REGULATED_TYPE_OPTIONS,
    visibleWhen: (p) => p.regulated_industry,
    requiredWhen: (p) => p.regulated_industry,
  },

  // ── Section 2 ──────────────────────────────────────────────────────────
  {
    id: "total_pages",
    section: 2,
    label: "Total Pages",
    type: "number",
    min: 1,
    required: true,
    impact: "Dev base: pages × 1.5–2 hrs",
  },
  {
    id: "unique_templates",
    section: 2,
    label: "Unique Layout Templates",
    type: "number",
    min: 1,
    required: true,
    impact: "Templates × 4–5 hrs dev; × 4–6 hrs design",
  },
  { id: "has_blog", section: 2, label: "Blog / News / Resource Section?", type: "toggle", impact: "+6–10 hrs Development" },
  {
    id: "has_client_login",
    section: 2,
    label: "Client Login / Member Portal?",
    type: "toggle",
    impact: "+12–20 hrs Development · +1 risk",
  },
  { id: "has_booking", section: 2, label: "Appointment / Booking System?", type: "toggle", impact: "+8–14 hrs Development" },
  { id: "has_job_board", section: 2, label: "Job Board / Careers Listing?", type: "toggle", impact: "+8–12 hrs Development" },
  {
    id: "has_calculators",
    section: 2,
    label: "Custom Calculator / Configurator?",
    type: "toggle",
    impact: "+10–18 hrs Development · +1 risk",
  },
  {
    id: "multi_language",
    section: 2,
    label: "Multi-Language Support?",
    type: "toggle",
    impact: "+14–18 hrs per extra language · +2 risk",
  },
  {
    id: "language_count",
    section: 2,
    label: "Number of Languages",
    type: "number",
    min: 2,
    visibleWhen: (p) => p.multi_language,
    requiredWhen: (p) => p.multi_language,
    impact: "Hours × (count − 1)",
  },
  { id: "has_custom_forms", section: 2, label: "Custom Forms?", type: "toggle", impact: "+3–16 hrs by complexity" },
  {
    id: "form_complexity",
    section: 2,
    label: "Form Complexity",
    type: "dropdown",
    options: FORM_COMPLEXITY_OPTIONS,
    visibleWhen: (p) => p.has_custom_forms,
    requiredWhen: (p) => p.has_custom_forms,
    impact: "Basic +3–6 · Multi-step +6–10 · Conditional +10–16",
  },
  { id: "has_ecommerce", section: 2, label: "E-Commerce Required?", type: "toggle", impact: "+20–40 hrs base scope" },
  {
    id: "product_count",
    section: 2,
    label: "Number of Products / SKUs",
    type: "number",
    min: 1,
    visibleWhen: (p) => p.has_ecommerce,
    requiredWhen: (p) => p.has_ecommerce,
    impact: "50+ products adds +6–10 hrs",
  },
  {
    id: "payment_gateway",
    section: 2,
    label: "Payment Gateway",
    type: "dropdown",
    options: PAYMENT_GATEWAY_OPTIONS,
    visibleWhen: (p) => p.has_ecommerce,
    requiredWhen: (p) => p.has_ecommerce,
    impact: "Non-Stripe adds +3–6 hrs",
  },
  {
    id: "has_product_variations",
    section: 2,
    label: "Product Variations?",
    type: "toggle",
    visibleWhen: (p) => p.has_ecommerce,
    impact: "Size/colour/etc. adds +4–8 hrs",
  },

  // ── Section 3 ──────────────────────────────────────────────────────────
  { id: "has_brand_guide", section: 3, label: "Has Existing Brand Guide?", type: "toggle", impact: "No guide adds +12–20 hrs Design" },
  { id: "is_rebrand", section: 3, label: "Full Rebrand Alongside Website?", type: "toggle", impact: "+16 hrs Design (identity)" },
  { id: "has_existing_design_files", section: 3, label: "Existing Design Files Available?", type: "toggle", impact: "Reduces Design by −8 hrs" },
  { id: "has_approved_photography", section: 3, label: "Approved Photography Provided?", type: "toggle", impact: "No adds +3–6 hrs (stock sourcing)" },
  { id: "needs_custom_illustrations", section: 3, label: "Custom Illustrations Required?", type: "toggle", impact: "+12–20 hrs Design" },
  { id: "needs_animations", section: 3, label: "Animations / Parallax Effects?", type: "toggle", impact: "+8–14 hrs Design (motion)" },
  {
    id: "platform",
    section: 3,
    label: "Preferred CMS / Platform",
    type: "dropdown",
    options: DISCOVERY_PLATFORM_OPTIONS,
    required: true,
    impact: "Platform setup 4–8 hrs",
  },
  {
    id: "design_revision_rounds",
    section: 3,
    label: "Design Revision Rounds",
    type: "number",
    min: 1,
    max: 6,
    impact: "Each round above 2 adds +4–6 hrs",
    warnWhen: (p) => (p.design_revision_rounds ?? 0) > 2,
    warnText: "Above the standard 2 rounds — adds hours and scope-creep risk.",
  },

  // ── Section 4 ──────────────────────────────────────────────────────────
  { id: "sc_writes_copy", section: 4, label: "SC Writes Website Copy?", type: "toggle", impact: "Pages × 1.5–2 hrs Content" },
  {
    id: "copy_page_count",
    section: 4,
    label: "Pages Requiring Copywriting",
    type: "number",
    min: 1,
    visibleWhen: (p) => p.sc_writes_copy,
    requiredWhen: (p) => p.sc_writes_copy,
    impact: "Each page 1.5–2 hrs",
  },
  {
    id: "copy_ready",
    section: 4,
    label: "Client Copy Approved & Ready?",
    type: "toggle",
    visibleWhen: (p) => !p.sc_writes_copy,
    impact: "Yes +2–4 hrs coordination · No = +3 risk",
    warnWhen: (p) => !p.sc_writes_copy && !p.copy_ready,
    warnText: "Client copy not ready is the #1 timeline risk (+3 risk points).",
  },
  {
    id: "content_delivery_date",
    section: 4,
    label: "Agreed Content Delivery Date",
    type: "date",
    visibleWhen: (p) => !p.sc_writes_copy && !p.copy_ready,
    requiredWhen: (p) => !p.sc_writes_copy && !p.copy_ready,
    impact: "Shown in timeline; does not change hours",
  },
  { id: "has_video_content", section: 4, label: "Video Content Required?", type: "toggle", impact: "+4–8 hrs Content" },
  { id: "content_needs_legal_review", section: 4, label: "Legal / Compliance Review of Content?", type: "toggle", impact: "+6–10 hrs Content · +2 risk" },
  { id: "migration_page_count", section: 4, label: "Pages to Migrate from Existing Site", type: "number", min: 0, impact: "Per 10 pages ≈ 3 hrs" },

  // ── Section 5 ──────────────────────────────────────────────────────────
  {
    id: "hosting_environment",
    section: 5,
    label: "Preferred Hosting Environment",
    type: "dropdown",
    options: HOSTING_OPTIONS,
    required: true,
    impact: "Affects setup time noted in dev",
  },
  { id: "has_crm_integration", section: 5, label: "CRM Integration?", type: "toggle", impact: "+8–12 hrs Development" },
  {
    id: "crm_platform",
    section: 5,
    label: "CRM Platform",
    type: "dropdown",
    options: CRM_OPTIONS,
    visibleWhen: (p) => p.has_crm_integration,
    requiredWhen: (p) => p.has_crm_integration,
  },
  { id: "has_email_integration", section: 5, label: "Email Marketing Integration?", type: "toggle", impact: "+4–8 hrs Development" },
  {
    id: "email_platform",
    section: 5,
    label: "Email Platform",
    type: "dropdown",
    options: EMAIL_OPTIONS,
    visibleWhen: (p) => p.has_email_integration,
    requiredWhen: (p) => p.has_email_integration,
  },
  {
    id: "has_internal_system_integration",
    section: 5,
    label: "Internal System Integration?",
    type: "toggle",
    impact: "+12–24 hrs Development · +3 risk",
    warnWhen: (p) => p.has_internal_system_integration,
    warnText: "High uncertainty — scope is often undefined.",
  },
  { id: "needs_analytics", section: 5, label: "Google Analytics / GA4 Setup?", type: "toggle", impact: "+2–4 hrs Development" },
  { id: "needs_live_chat", section: 5, label: "Live Chat / Chatbot Integration?", type: "toggle", impact: "+3–5 hrs Development" },
  { id: "needs_social_feeds", section: 5, label: "Social Media Feed Embeds?", type: "toggle", impact: "+4–7 hrs Development" },
  { id: "needs_redirect_mapping", section: 5, label: "301 Redirect Mapping?", type: "toggle", impact: "+4–8 hrs (SEO continuity)" },
  { id: "needs_ada", section: 5, label: "ADA / WCAG Accessibility?", type: "toggle", impact: "+8–14 hrs Dev + +4–8 hrs QA" },
  { id: "needs_performance_benchmarks", section: 5, label: "Core Web Vitals / Performance Benchmarks?", type: "toggle", impact: "+6–10 hrs Development" },

  // ── Section 6 ──────────────────────────────────────────────────────────
  { id: "on_page_seo_included", section: 6, label: "On-Page SEO Included?", type: "toggle", impact: "ceil(pages/5) × 2–3 + base" },
  { id: "keyword_research_included", section: 6, label: "Keyword Research Included?", type: "toggle", impact: "+8–14 hrs SEO" },
  { id: "needs_schema_markup", section: 6, label: "Schema Markup Required?", type: "toggle", impact: "+6–10 hrs SEO" },
  { id: "needs_google_my_business", section: 6, label: "Google My Business Setup?", type: "toggle", impact: "+2–4 hrs SEO" },

  // ── Section 7 ──────────────────────────────────────────────────────────
  { id: "project_start_date", section: 7, label: "Project Start Date", type: "date", required: true, impact: "Anchors all timeline dates" },
  { id: "hard_launch_date", section: 7, label: "Hard Launch Deadline", type: "date", impact: "If estimate exceeds it: warning + 3 risk" },
  {
    id: "client_review_turnaround",
    section: 7,
    label: "Client Review Turnaround (business days)",
    type: "number",
    min: 1,
    max: 20,
    required: true,
    impact: "Buffer after each approval gate",
  },
  { id: "stakeholder_count", section: 7, label: "Number of Stakeholders", type: "number", min: 1, impact: "> 3 adds +2–4 hrs Discovery · +2 risk" },
  { id: "first_time_client", section: 7, label: "First-Time Web Agency Client?", type: "toggle", impact: "+2–4 hrs Discovery · +2 risk" },
  { id: "has_blackout_periods", section: 7, label: "Known Blackout Periods?", type: "toggle", impact: "+10 buffer days to timeline" },
  {
    id: "blackout_notes",
    section: 7,
    label: "Blackout Period Notes",
    type: "textarea",
    visibleWhen: (p) => p.has_blackout_periods,
    requiredWhen: (p) => p.has_blackout_periods,
  },

  // ── Section 8 ──────────────────────────────────────────────────────────
  { id: "needs_cms_training", section: 8, label: "CMS Training Session Required?", type: "toggle", impact: "+2–4 hrs Launch & Handoff" },
  { id: "has_phase_2", section: 8, label: "Phase 2 Planned?", type: "toggle", impact: "+3–5 hrs Launch (architecture planning)" },
  { id: "has_retainer", section: 8, label: "Post-Launch Retainer?", type: "toggle", impact: "Adds a separate retainer line" },
  {
    id: "retainer_hours_per_month",
    section: 8,
    label: "Retainer Hours Per Month",
    type: "number",
    min: 1,
    max: 200,
    visibleWhen: (p) => p.has_retainer,
    requiredWhen: (p) => p.has_retainer,
    impact: "Separate line — not in project total",
  },
];

export function isQuestionVisible(
  q: DiscoveryQuestion,
  p: DiscoveryProject,
): boolean {
  return q.visibleWhen ? q.visibleWhen(p) : true;
}

export function isQuestionRequired(
  q: DiscoveryQuestion,
  p: DiscoveryProject,
): boolean {
  if (q.required) return true;
  return q.requiredWhen ? q.requiredWhen(p) : false;
}

export function isBlank(
  value: DiscoveryProject[DiscoveryFieldId],
  type: FieldType,
): boolean {
  if (type === "toggle") return false;
  if (type === "number") {
    return value === null || value === undefined || Number(value) <= 0;
  }
  return value === null || value === undefined || String(value).trim() === "";
}

export function getSectionQuestions(
  section: number,
  p: DiscoveryProject,
): DiscoveryQuestion[] {
  return DISCOVERY_QUESTIONS.filter(
    (q) => q.section === section && isQuestionVisible(q, p),
  );
}

/** Count of required, visible fields left blank — feeds the risk score. */
export function countUnanswered(p: DiscoveryProject): number {
  let count = 0;
  for (const q of DISCOVERY_QUESTIONS) {
    if (!isQuestionVisible(q, p)) continue;
    if (!isQuestionRequired(q, p)) continue;
    if (isBlank(p[q.id], q.type)) count += 1;
  }
  return count;
}

/** Per-section count of blank required fields, for wizard progress markers. */
export function unansweredBySection(p: DiscoveryProject): Record<number, number> {
  const out: Record<number, number> = {};
  for (const q of DISCOVERY_QUESTIONS) {
    if (!isQuestionVisible(q, p)) continue;
    if (!isQuestionRequired(q, p)) continue;
    if (isBlank(p[q.id], q.type)) out[q.section] = (out[q.section] ?? 0) + 1;
  }
  return out;
}
