import type { DiscoveryFieldId } from "@/lib/discovery/questions";

/**
 * What each guided-scoping question means, in plain words — shown behind the
 * (i) next to its label. One file, one voice, like `estimator-help.tsx`.
 *
 * Says what to ask the client and what to pick when unsure. The hours effect
 * stays in each question's own `impact` line (on screen already), so this copy
 * does not repeat numbers that the engine owns and could drift from.
 * `e2e/question-help.spec.ts` fails on any visible question without one.
 */
export const QUESTION_HELP: Partial<Record<DiscoveryFieldId, string>> = {
  // ── 1 · Goals & Context ────────────────────────────────────────────────
  primary_goal:
    "The one outcome the client most wants from the site, such as more leads, online sales or hiring. It's printed on the quote for context and doesn't change the hours, so pick the closest match.",
  primary_goal_other: "Describe the goal in a few words, the way the client put it. This is what the quote will show.",
  is_redesign:
    "Yes if the client already has a website we're replacing or rebuilding. We then audit the old site first and can map old links to new pages so search rankings aren't lost.",
  current_url: "The address of the site being replaced, so the team can audit it. Paste the full link, including https://.",
  regulated_industry:
    "Yes if the client works in a field with rules about what a website can say or collect, such as healthcare, finance, legal or education. It adds a compliance review and makes the project riskier.",
  regulated_type: "Which regulated field the client is in. It tells the team which rules to check during the compliance review.",
  regulated_type_other: "Name the industry, for example \"insurance\" or \"pharmaceutical\".",

  // ── 2 · Scope & Structure ──────────────────────────────────────────────
  total_pages:
    "Every page the finished site will have, including Contact, About, legal pages and each service page. Count from the sitemap if there is one. This is one of the biggest drivers of the estimate.",
  unique_templates:
    "How many different page layouts are needed. Ten service pages that look alike are one template; the home page is usually its own. Fewer templates means less design and build time.",
  has_blog: "Yes if the site needs a blog, news or resources area that the client posts to over time.",
  has_client_login:
    "Yes if visitors need to sign in to see private content, such as a customer portal or members-only area. Logins add build time and risk.",
  has_booking: "Yes if visitors should book appointments or reserve times directly on the site.",
  has_job_board: "Yes if the site lists open jobs that the client adds and removes themselves.",
  has_calculators:
    "Yes for an interactive tool, such as a price calculator, quote builder or product configurator. These are custom work and carry extra risk.",
  multi_language: "Yes if the site must be available in more than one language.",
  language_count: "Total languages including the main one. English plus Spanish is 2.",
  has_custom_forms:
    "Yes if the site needs forms beyond a simple contact form, such as applications, intake forms or quote requests.",
  form_complexity:
    "Basic: one page of fields. Multi-step: the form runs over several screens. Conditional logic: questions change based on earlier answers. Pick the most complex form on the site.",
  has_ecommerce: "Yes if visitors can buy products or pay online on the site itself.",
  product_count: "Roughly how many products or SKUs will be sold. Large catalogs need extra setup and import time.",
  payment_gateway:
    "The service that takes card payments. Stripe is the standard setup; anything else needs extra configuration. Ask what the client already uses.",
  payment_gateway_other: "Name the payment provider, for example \"Authorize.net\".",
  has_product_variations: "Yes if products come in options such as sizes, colors or materials, each with its own stock or price.",

  // ── 3 · Design & Brand ─────────────────────────────────────────────────
  has_brand_guide:
    "Yes if the client has a brand guide covering logo, colors and fonts. Without one, the designers define the look first, which adds design time.",
  is_rebrand: "Yes if we're also creating a new brand identity (logo, colors, type) as part of this project.",
  has_existing_design_files:
    "Yes if the client can hand over usable design files (Figma, Adobe XD, Sketch) to build from. It saves design time.",
  has_approved_photography:
    "Yes if the client will supply their own approved photos. If not, the team sources stock images, which takes extra time.",
  needs_custom_illustrations: "Yes if the site needs original drawings or icons made just for this client, not stock.",
  needs_animations: "Yes for motion beyond simple hovers: scroll effects, parallax, animated sections or intros.",
  design_revision_rounds:
    "How many rounds of design changes the client gets. Two is our standard; each extra round adds time and the risk of the scope growing.",

  // ── 4 · Content ────────────────────────────────────────────────────────
  sc_writes_copy: "Yes if our team writes the website text. No if the client provides it.",
  copy_page_count: "How many pages need text written by us. Often fewer than the total, since legal or simple pages may need none.",
  copy_ready:
    "Yes only if the client's text is written, approved and ready to hand over now. \"Almost ready\" is a No. Late content is the most common reason sites launch late.",
  content_delivery_date:
    "The date the client has agreed to deliver their final text. It appears on the timeline so everyone can see what the launch depends on.",
  has_video_content: "Yes if the site needs videos produced, edited or embedded as part of this project.",
  content_needs_legal_review:
    "Yes if the client's legal or compliance team must sign off every page of text. It adds content time and slows approvals.",
  migration_page_count:
    "How many pages, posts or products must be moved over from the old site. Leave 0 for a fresh site with nothing to carry across.",

  // ── 5 · Technical Requirements & Integrations ──────────────────────────
  hosting_environment:
    "Where the site will live once it's built. Only hosts that work with this platform are listed. Ask the client whether they have a host they must keep.",
  hosting_environment_other: "Name the host, for example \"SiteGround\" or \"AWS\".",
  has_crm_integration:
    "Yes if form submissions or sign-ups should go straight into the client's CRM, so their sales team gets leads automatically.",
  crm_platform: "Which CRM the client uses. Ask them; don't assume.",
  crm_platform_other: "Name the CRM, for example \"Pipedrive\".",
  has_email_integration: "Yes if site sign-ups should feed the client's email newsletter or marketing lists.",
  email_platform: "Which email marketing service the client uses.",
  email_platform_other: "Name the email service, for example \"Constant Contact\".",
  has_internal_system_integration:
    "Yes if the site must connect to the client's own systems, such as inventory, ERP or an in-house database. These are often poorly documented, so they carry the most uncertainty.",
  needs_analytics: "Yes to set up Google Analytics (GA4) so the client can see visitor numbers and where people come from.",
  needs_live_chat: "Yes to add a chat window or chatbot (for example Intercom, Tidio or HubSpot chat).",
  needs_social_feeds: "Yes to show live posts from Instagram, Facebook, LinkedIn or similar on the site.",
  needs_redirect_mapping:
    "Yes when replacing an old site: each old link is pointed at its new page, so search rankings and bookmarks keep working. Usually yes for a redesign.",
  needs_ada:
    "Yes if the site must meet accessibility standards (ADA / WCAG) for people using screen readers or keyboards. Often required for regulated or public-sector clients.",
  needs_performance_benchmarks:
    "Yes if the client needs the site to hit specific speed scores, such as Google's Core Web Vitals, and wants it tested and tuned.",

  // ── 6 · SEO & Digital Marketing ────────────────────────────────────────
  on_page_seo_included:
    "Yes to set page titles, descriptions and headings so each page is set up for search engines. On by default, and it grows with the page count.",
  keyword_research_included: "Yes if we research which search terms the client's customers actually use before writing and optimizing pages.",
  needs_schema_markup:
    "Yes to add structured data that helps Google show rich results, such as star ratings, events, FAQs or business details.",
  needs_google_my_business: "Yes to set up or clean up the client's Google Business Profile (the listing shown in Google Maps).",

  // ── 7 · Timeline & Decision-Making ─────────────────────────────────────
  project_start_date: "The day work can actually begin, usually once the contract is signed and the deposit is in. Every date on the timeline counts from here.",
  hard_launch_date:
    "Only fill this in if the site must be live by a fixed date, such as a product launch or event. If the estimate runs past it, you'll get a warning.",
  client_review_turnaround:
    "How many business days the client usually takes to give feedback at each approval step. Be realistic: slow reviewers stretch the whole timeline.",
  stakeholder_count:
    "How many people on the client's side must approve the work. More than three usually means more meetings and slower decisions.",
  first_time_client: "Yes if the client has never worked with a web agency before. They often need more guidance and explanation along the way.",
  has_blackout_periods:
    "Yes if there are times the client can't review or launch, such as holidays, busy seasons or an event. Buffer days are added to the timeline.",
  blackout_notes: "List the dates and the reason, for example \"Dec 15 – Jan 5, holiday shutdown\".",

  // ── 8 · Post-Launch & Ongoing Support ──────────────────────────────────
  needs_cms_training: "Yes if we'll run a session teaching the client's team to update the site themselves.",
  has_phase_2: "Yes if more work is already planned after launch. The build is then set up so phase 2 can be added cleanly.",
  has_retainer: "Yes if the client wants ongoing monthly support after launch. It's priced as a separate line, not part of this project's total.",
  retainer_hours_per_month: "How many support hours a month the client is buying after launch.",
};
