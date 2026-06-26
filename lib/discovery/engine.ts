/**
 * Discovery estimation engine — converts a DiscoveryProject into Min/Mid/Max hours
 * per phase and task. Pure & deterministic; mirrors the SC Estimator spec §3.1.
 */
import {
  CRM_OPTIONS,
  EMAIL_OPTIONS,
  HOSTING_OPTIONS,
  PAYMENT_GATEWAY_OPTIONS,
  PHASE_META,
  PHASE_ORDER,
  optionLabel,
} from "@/lib/discovery/constants";
import type {
  DiscoveryProject,
  Estimate,
  EstimatePhase,
  EstimateTask,
  HoursRange,
  PhaseId,
} from "@/types/discovery.types";

const num = (v: number | null | undefined, fallback = 0): number =>
  v === null || v === undefined || Number.isNaN(v) ? fallback : v;

const mid = (min: number, max: number): number => Math.round((min + max) / 2);

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

type Draft = { name: string; min: number; max: number; note?: string };

function sumRange(tasks: EstimateTask[]): HoursRange {
  return tasks.reduce<HoursRange>(
    (acc, t) => ({ min: acc.min + t.min, mid: acc.mid + t.mid, max: acc.max + t.max }),
    { min: 0, mid: 0, max: 0 },
  );
}

function buildPhase(id: PhaseId, drafts: Draft[]): EstimatePhase {
  const meta = PHASE_META[id];
  const seen = new Map<string, number>();
  const tasks: EstimateTask[] = drafts.map((d) => {
    let base = `${id}:${slug(d.name)}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    if (n > 0) base = `${base}-${n}`;
    return {
      id: base,
      phaseId: id,
      name: d.name,
      note: d.note,
      min: d.min,
      max: d.max,
      mid: mid(d.min, d.max),
    };
  });
  const range = sumRange(tasks);
  return { id, label: meta.label, description: meta.description, tasks, ...range };
}

export function computeEstimate(p: DiscoveryProject): Estimate {
  const pages = num(p.total_pages);
  const templates = num(p.unique_templates);

  // ── Discovery & Strategy ────────────────────────────────────────────────
  const discovery: Draft[] = [
    { name: "Kickoff & strategy session", min: 8, max: 10 },
    { name: "Project plan & milestones", min: 1, max: 2 },
  ];
  if (p.is_redesign)
    discovery.push({ name: "Existing site audit", min: 3, max: 5, note: p.current_url || undefined });
  if (p.regulated_industry)
    discovery.push({ name: "Compliance review", min: 4, max: 8 });
  if (p.first_time_client)
    discovery.push({ name: "Client onboarding", min: 2, max: 4 });
  if (num(p.stakeholder_count) > 3)
    discovery.push({ name: "Stakeholder alignment", min: 2, max: 4 });

  // ── Content & Copy ──────────────────────────────────────────────────────
  const content: Draft[] = [{ name: "Content audit & planning", min: 4, max: 6 }];
  if (p.sc_writes_copy) {
    const cp = num(p.copy_page_count);
    content.push({
      name: "Copywriting",
      min: Math.round(cp * 1.5),
      max: Math.round(cp * 2),
      note: `${cp} pages × 1.5–2 hrs`,
    });
  } else if (p.copy_ready) {
    content.push({ name: "Client copy coordination", min: 2, max: 4 });
  }
  const migration = num(p.migration_page_count);
  if (migration > 0) {
    const chunks = Math.ceil(migration / 10);
    content.push({
      name: "Content migration",
      min: chunks * 3,
      max: chunks * 3,
      note: `${migration} pages (~${chunks} × 10-page batches)`,
    });
  }
  if (p.has_video_content)
    content.push({ name: "Video production coordination", min: 4, max: 8 });
  if (p.content_needs_legal_review)
    content.push({ name: "Legal / compliance content review", min: 6, max: 10 });
  if (!p.has_approved_photography)
    content.push({ name: "Stock photo sourcing & licensing", min: 3, max: 6 });

  // ── Design & UX ─────────────────────────────────────────────────────────
  const design: Draft[] = [
    { name: "Visual design system", min: 16, max: 24 },
    { name: "Wireframes", min: 8, max: 14 },
  ];
  if (templates > 0)
    design.push({
      name: "Template designs",
      min: templates * 4,
      max: templates * 6,
      note: `${templates} templates × 4–6 hrs`,
    });
  if (!p.has_brand_guide)
    design.push({ name: "Brand definition", min: 12, max: 20 });
  if (p.is_rebrand)
    design.push({ name: "Full rebrand / identity", min: 16, max: 16 });
  if (p.has_existing_design_files)
    design.push({ name: "Existing design files provided", min: -8, max: -8, note: "Credit" });
  if (p.needs_custom_illustrations)
    design.push({ name: "Custom illustrations", min: 12, max: 20 });
  if (p.needs_animations)
    design.push({ name: "Animations & motion prototype", min: 8, max: 14 });
  const extraRounds = Math.max(0, num(p.design_revision_rounds, 2) - 2);
  if (extraRounds > 0)
    design.push({
      name: "Extra revision rounds",
      min: extraRounds * 4,
      max: extraRounds * 6,
      note: `${extraRounds} round(s) above standard 2`,
    });

  // ── Development ─────────────────────────────────────────────────────────
  const development: Draft[] = [
    { name: "Development setup & architecture", min: 24, max: 32 },
  ];
  if (p.platform)
    development.push({ name: `Platform setup`, min: 4, max: 8, note: p.platform });
  if (pages > 0)
    development.push({
      name: "Page build",
      min: Math.round(pages * 1.5),
      max: Math.round(pages * 2),
      note: `${pages} pages × 1.5–2 hrs`,
    });
  if (templates > 0)
    development.push({
      name: "Template implementation",
      min: templates * 4,
      max: templates * 5,
      note: `${templates} templates × 4–5 hrs`,
    });
  if (p.has_blog) development.push({ name: "Blog / news section", min: 6, max: 10 });
  if (p.has_client_login)
    development.push({ name: "Client login / member portal", min: 12, max: 20 });
  if (p.has_booking)
    development.push({ name: "Appointment / booking system", min: 8, max: 14 });
  if (p.has_job_board)
    development.push({ name: "Job board / careers listing", min: 8, max: 12 });
  if (p.has_calculators)
    development.push({ name: "Custom calculator / configurator", min: 10, max: 18 });
  if (p.multi_language) {
    const extra = Math.max(0, num(p.language_count, 2) - 1);
    development.push({
      name: "Multi-language support",
      min: extra * 14,
      max: extra * 18,
      note: `${extra} additional language(s)`,
    });
  }
  if (p.has_custom_forms) {
    const fc = p.form_complexity;
    const range =
      fc === "conditional"
        ? { min: 10, max: 16 }
        : fc === "multi_step"
          ? { min: 6, max: 10 }
          : { min: 3, max: 6 };
    development.push({ name: "Custom forms", ...range, note: fc || "basic" });
  }
  if (p.has_ecommerce) {
    development.push({ name: "E-commerce base", min: 20, max: 40 });
    if (num(p.product_count) >= 50)
      development.push({
        name: "Large product catalog",
        min: 6,
        max: 10,
        note: `${num(p.product_count)} products`,
      });
    if (p.payment_gateway && p.payment_gateway !== "stripe")
      development.push({
        name: "Payment gateway integration",
        min: 3,
        max: 6,
        note: optionLabel(PAYMENT_GATEWAY_OPTIONS, p.payment_gateway),
      });
    if (p.has_product_variations)
      development.push({ name: "Product variations", min: 4, max: 8 });
  }
  if (p.has_crm_integration)
    development.push({
      name: "CRM integration",
      min: 8,
      max: 12,
      note: p.crm_platform ? optionLabel(CRM_OPTIONS, p.crm_platform) : undefined,
    });
  if (p.has_email_integration)
    development.push({
      name: "Email marketing integration",
      min: 4,
      max: 8,
      note: p.email_platform ? optionLabel(EMAIL_OPTIONS, p.email_platform) : undefined,
    });
  if (p.has_internal_system_integration)
    development.push({
      name: "Internal system integration",
      min: 12,
      max: 24,
      note: "High uncertainty",
    });
  if (p.needs_analytics)
    development.push({ name: "Analytics / GA4 setup", min: 2, max: 4 });
  if (p.needs_live_chat)
    development.push({ name: "Live chat / chatbot", min: 3, max: 5 });
  if (p.needs_social_feeds)
    development.push({ name: "Social media feed embeds", min: 4, max: 7 });
  if (p.needs_redirect_mapping)
    development.push({ name: "301 redirect mapping", min: 4, max: 8 });
  if (p.needs_ada)
    development.push({ name: "ADA / WCAG implementation", min: 8, max: 14 });
  if (p.needs_performance_benchmarks)
    development.push({ name: "Core Web Vitals / performance", min: 6, max: 10 });
  development.push({ name: "Development QA pass", min: 4, max: 8 });

  const developmentPhase = buildPhase("development", development);

  // ── QA & Testing (depends on dev totals) ────────────────────────────────
  const qa: Draft[] = [
    { name: "Cross-browser testing", min: 4, max: 6 },
    { name: "Mobile / responsive testing", min: 4, max: 6 },
    { name: "Form testing", min: 3, max: 5 },
    { name: "Content proofing", min: 2, max: 4 },
    { name: "Performance testing", min: 2, max: 4 },
    { name: "Staging deployment & review", min: 3, max: 5 },
    {
      name: "Bug fixes",
      min: Math.round(developmentPhase.min * 0.18),
      max: Math.round(developmentPhase.max * 0.18),
      note: "18% of development",
    },
  ];
  if (p.needs_ada)
    qa.push({ name: "Accessibility audit (screen reader / keyboard)", min: 4, max: 8 });

  // ── SEO Setup ───────────────────────────────────────────────────────────
  const seo: Draft[] = [];
  if (p.on_page_seo_included) {
    const chunks = Math.ceil(Math.max(pages, 1) / 5);
    seo.push({
      name: "On-page SEO",
      min: 2 + chunks * 2,
      max: 4 + chunks * 3,
      note: `meta, descriptions, alt text — ${pages} pages`,
    });
  }
  if (p.keyword_research_included)
    seo.push({ name: "Keyword research", min: 8, max: 14 });
  if (p.needs_schema_markup)
    seo.push({ name: "Schema markup", min: 6, max: 10 });
  if (p.needs_google_my_business)
    seo.push({ name: "Google My Business setup", min: 2, max: 4 });

  // ── Launch & Handoff ────────────────────────────────────────────────────
  const launch: Draft[] = [
    { name: "Pre-launch checklist", min: 1, max: 2 },
    { name: "DNS / SSL configuration", min: 2, max: 4 },
    { name: "Smoke testing", min: 2, max: 3 },
    { name: "Handoff documentation", min: 2, max: 3 },
  ];
  if (p.needs_cms_training)
    launch.push({ name: "CMS training session", min: 2, max: 4 });
  if (p.has_phase_2)
    launch.push({ name: "Phase 2 architecture planning", min: 3, max: 5 });

  const phasesById: Record<PhaseId, EstimatePhase> = {
    discovery: buildPhase("discovery", discovery),
    content: buildPhase("content", content),
    design: buildPhase("design", design),
    development: developmentPhase,
    qa: buildPhase("qa", qa),
    seo: buildPhase("seo", seo),
    launch: buildPhase("launch", launch),
  };

  const phases = PHASE_ORDER.map((id) => phasesById[id]);
  const total = phases.reduce<HoursRange>(
    (acc, ph) => ({ min: acc.min + ph.min, mid: acc.mid + ph.mid, max: acc.max + ph.max }),
    { min: 0, mid: 0, max: 0 },
  );

  const retainer = p.has_retainer
    ? { hoursPerMonth: num(p.retainer_hours_per_month) }
    : null;

  return {
    phases,
    total,
    retainer,
    assumptions: buildAssumptions(p),
  };
}

function buildAssumptions(p: DiscoveryProject): string[] {
  const a: string[] = [];
  if (p.platform) a.push(`Platform: ${p.platform}`);
  if (p.hosting_environment)
    a.push(`Hosting: ${optionLabel(HOSTING_OPTIONS, p.hosting_environment)}`);
  if (p.is_redesign) a.push(`Redesign audit of ${p.current_url || "current site"} included`);
  if (p.regulated_industry) a.push(`Regulated industry: ${p.regulated_type || "compliance review included"}`);
  if (p.multi_language) a.push(`${num(p.language_count, 2)} languages`);
  if (p.has_ecommerce)
    a.push(
      `E-commerce: ${num(p.product_count)} products, ${optionLabel(PAYMENT_GATEWAY_OPTIONS, p.payment_gateway) || "gateway TBD"}${p.has_product_variations ? ", with variations" : ""}`,
    );
  if (p.has_crm_integration)
    a.push(`CRM integration: ${optionLabel(CRM_OPTIONS, p.crm_platform) || "platform TBD"}`);
  if (p.has_email_integration)
    a.push(`Email marketing: ${optionLabel(EMAIL_OPTIONS, p.email_platform) || "platform TBD"}`);
  if (p.has_internal_system_integration)
    a.push("Internal system integration (scope undefined — high uncertainty)");
  if (num(p.migration_page_count) > 0)
    a.push(`Content migration: ${num(p.migration_page_count)} pages`);
  if (p.sc_writes_copy) a.push(`SC writing copy for ${num(p.copy_page_count)} pages`);
  else if (!p.copy_ready) a.push("Client copy NOT ready — timeline risk");
  else a.push("Client copy provided & ready");
  if (p.on_page_seo_included)
    a.push(`On-page SEO: meta titles, descriptions, alt text for all ${num(p.total_pages)} pages`);
  if (p.needs_ada) a.push("ADA / WCAG accessibility compliance included");
  a.push(`${num(p.design_revision_rounds, 2)} design revision rounds`);
  if (p.has_retainer)
    a.push(`Post-launch retainer: ${num(p.retainer_hours_per_month)} hrs/month (separate line)`);
  return a;
}
