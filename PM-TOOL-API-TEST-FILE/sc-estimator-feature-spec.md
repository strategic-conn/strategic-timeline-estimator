# SC Estimator — Feature & Discovery Documentation

*Reconstructed from Strategic Connection's "SC Estimator" feature/discovery PDF (screenshots) for reuse as a feature spec in another app.*

---

## 1. Application Overview

SC Estimator is a fullstack web application built for Strategic Connection that automates the translation of a completed Discovery Checklist into a precise, defensible hours estimate and project timeline. The tool eliminates guesswork from the scoping process by turning structured discovery answers into calculated phase-by-phase projections.

The application covers the complete lifecycle of a web project — from initial scoping through post-launch retainer — and includes a live project tracker so the same tool used to estimate a project can also be used to run it.

### Core Capabilities

- **Discovery Wizard** — An 8-section, 60+ question form that mirrors the Strategic Connection Discovery Checklist verbatim. Every question maps directly to hours and timeline logic.
- **Estimation Engine** — A rules-based calculation engine that converts each discovery answer into additive hours per phase. Produces Min, Mid, and Max figures for every line item.
- **Hours Breakdown** — A fully expanded, clickable table showing every phase broken down into individual tasks with Min · Mid · Max hours per task, proportional bar charts, and a totals footer.
- **Gantt Timeline** — A calendar-anchored SVG Gantt chart showing all 7 project phases with real dates, week markers, month dividers, and milestone diamonds for key approval gates.
- **Project Tracker** — A live task-tracking dashboard per project: checkboxes for every deliverable, phase status (Not Started / In Progress / In Review / Complete / Blocked), hours-logged inputs with variance tracking, phase notes, and milestone check-in cards.
- **Risk Scoring** — An automatic risk level (Low / Medium / High / Critical) based on unanswered questions and scope flags, with a recommended action drawn directly from the SC Discovery Checklist scoring table.
- **Multi-Project Dashboard** — The home screen lists all saved scoping sessions with quick-view hours range, week count, launch date, and risk badge per project.

---

## 2. The 8-Section Discovery Wizard

The Discovery Wizard is a step-by-step form that guides the Scoping Lead through all eight sections of the Strategic Connection Discovery Checklist. Each section must be completed before the estimate is generated. Answers are validated in real time and saved to the database on submission. Every field below maps to at least one calculation in the estimation engine.

### Section 1 — Goals & Context
*These answers determine the complexity of the strategy and research phase and reveal whether the project is truly a "website" or closer to a web application.*

| # | Question / Field | Input Type | Options / Range | Estimation Impact |
|---|---|---|---|---|
| 1 | Project Name | Text input | Free text | Identifier only — no hours impact |
| 2 | Client Name | Text input | Free text | Identifier only — no hours impact |
| 3 | Primary Business Goal | Dropdown | Lead Gen, E-Commerce, Brand Awareness, Recruiting, Customer Portal, Event Registration, Other | Informs strategy phase framing |
| 4 | Is this a redesign / rebuild? | Toggle | Yes / No | +3–5 hrs Discovery (site audit). Enables redirect mapping in Section 5 |
| 5 | Current Website URL | Text input | URL (if redesign = Yes) | Required for audit — no direct hours |
| 6 | Regulated Industry? | Toggle | Yes / No | +4–8 hrs Discovery (compliance review) |
| 7 | Industry Type | Dropdown | Healthcare, Finance, Legal, Education, Other (if regulated = Yes) | Contextual — same hours bucket |

### Section 2 — Scope & Structure
*Page count, template count, and development complexity are the three biggest drivers of total hours. Every "yes" in this section adds directly to the Development phase estimate.*

| # | Question / Field | Input Type | Options / Range | Estimation Impact |
|---|---|---|---|---|
| 1 | Total Pages | Number | 1–500+ | Dev base: pages × 1.5 hrs. Directly scales Development phase |
| 2 | Unique Layout Templates | Number | 1–50+ | Dev: templates × 4 hrs. Design: templates × 4–6 hrs per template |
| 3 | Blog / News / Resource Section? | Toggle | Yes / No | +6–10 hrs Development |
| 4 | Client Login / Member Portal? | Toggle | Yes / No | +12–20 hrs Development. +1 risk point |
| 5 | Appointment / Booking System? | Toggle | Yes / No | +8–14 hrs Development |
| 6 | Job Board / Careers Listing? | Toggle | Yes / No | +8–12 hrs Development |
| 7 | Custom Calculator / Configurator? | Toggle | Yes / No | +10–18 hrs Development. +1 risk point |
| 8 | Multi-Language Support? | Toggle | Yes / No | +14–18 hrs per additional language. +2 risk points |
| 9 | Number of Languages | Number | 2+ (if multilang = Yes) | Hours multiplied by (count − 1) |
| 10 | Custom Forms? | Toggle | Yes / No | +3–6 hrs depending on complexity |
| 11 | Form Complexity | Dropdown | Basic / Multi-step / Conditional Logic (if forms = Yes) | Basic +3–6, Multi-step +6–10, Conditional +10–16 hrs |
| 12 | E-Commerce Required? | Toggle | Yes / No | +20–40 hrs base e-commerce scope |
| 13 | Number of Products / SKUs | Number | 1–10000+ (if ecom = Yes) | 50+ products adds +6–10 hrs |
| 14 | Payment Gateway | Dropdown | Stripe, PayPal, Square, Other (if ecom = Yes) | Non-Stripe adds +3–6 hrs integration |
| 15 | Product Variations? | Toggle | Yes / No (if ecom = Yes) | Size/color/etc adds +4–8 hrs |

### Section 3 — Design & Brand
*Starting from existing brand assets vs. greenfield design is a significant time difference. This section controls both the Brand Identity and Visual Design sub-phases.*

| # | Question / Field | Input Type | Options / Range | Estimation Impact |
|---|---|---|---|---|
| 1 | Has Existing Brand Guide? | Toggle | Yes / No | No brand guide adds +12 hrs Design (brand definition) |
| 2 | Full Rebrand Alongside Website? | Toggle | Yes / No | +16 hrs Design (identity from scratch) |
| 3 | Existing Design Files Available? | Toggle | Yes / No | Yes reduces Design by −8 hrs |
| 4 | Approved Photography Provided? | Toggle | Yes / No | No adds +3–6 hrs (stock sourcing/licensing) |
| 5 | Custom Illustrations Required? | Toggle | Yes / No | +12–20 hrs Design |
| 6 | Animations / Parallax Effects? | Toggle | Yes / No | +8–14 hrs Design (motion design & prototype) |
| 7 | Preferred CMS / Platform | Dropdown | WordPress, Webflow, Shopify, Custom, Other | Platform affects dev setup hours (4–8 hrs) |
| 8 | Design Revision Rounds | Number | 1–6 (standard = 2) | Each round above 2 adds +4–6 hrs. Shown as warning if > 2 |

### Section 4 — Content
*Content ownership is the single most common source of timeline delays. "Client copy not ready" is flagged as a HIGH risk warning and adds risk score points.*

| # | Question / Field | Input Type | Options / Range | Estimation Impact |
|---|---|---|---|---|
| 1 | SC Writes Website Copy? | Toggle | Yes / No | Yes: adds copyPageCount × 1.5–2 hrs to Content phase |
| 2 | Pages Requiring Copywriting | Number | 1–500 (if SC writes) | Each page adds 1.5 hrs min, 2 hrs max |
| 3 | Client Copy Approved & Ready? | Toggle | Yes / No (if client writes) | Yes: +2–4 hrs coordination. No: +3 risk points + HIGH warning |
| 4 | Agreed Content Delivery Date | Date | Calendar picker (if copy not ready) | Shown in timeline but does not shift estimate hours |
| 5 | Video Content Required? | Toggle | Yes / No | +4–8 hrs Content (production coordination) |
| 6 | Legal / Compliance Review of Content? | Toggle | Yes / No | +6–10 hrs Content. +2 risk points |
| 7 | Pages to Migrate from Existing Site | Number | 0–5000 | Per 10 pages ≈ 3 hrs migration |

### Section 5 — Technical Requirements & Integrations
*Every "yes" in this section adds hours to Development and QA. Internal system integrations carry the highest uncertainty and +3 risk points.*

| # | Question / Field | Input Type | Options / Range | Estimation Impact |
|---|---|---|---|---|
| 1 | Preferred Hosting Environment | Dropdown | Azure, WP Engine, Cloudflare, Client's existing host, Shopify, Other | Identifier — affects setup time noted in dev but not directly additive |
| 2 | CRM Integration? | Toggle | Yes / No | +8–12 hrs Development |
| 3 | CRM Platform | Dropdown | Salesforce, HubSpot, Zoho, Other (if CRM = Yes) | Specific platform logged in assumptions |
| 4 | Email Marketing Integration? | Toggle | Yes / No | +4–8 hrs Development |
| 5 | Email Platform | Dropdown | Helium, Mailchimp, Klaviyo, Other (if email = Yes) | Specific platform logged in assumptions |
| 6 | Internal System Integration? | Toggle | Yes / No | +12–24 hrs Development. +3 risk points. HIGH uncertainty warning |
| 7 | Google Analytics / GA4 Setup? | Toggle | Yes / No | +2–4 hrs Development |
| 8 | Live Chat / Chatbot Integration? | Toggle | Yes / No | +3–5 hrs Development |
| 9 | Social Media Feed Embeds? | Toggle | Yes / No | +4–7 hrs Development |
| 10 | 301 Redirect Mapping? | Toggle | Yes / No | +4–8 hrs Development (SEO continuity for redesigns) |
| 11 | ADA / WCAG Accessibility? | Toggle | Yes / No | +8–14 hrs Development + +4–8 hrs QA |
| 12 | Core Web Vitals / Performance Benchmarks? | Toggle | Yes / No | +6–10 hrs Development |

### Section 6 — SEO & Digital Marketing
*Clarifying SEO scope upfront prevents "can also set up our SEO?" conversations post-launch. On-page SEO is enabled by default and scales with page count.*

| # | Question / Field | Input Type | Options / Range | Estimation Impact |
|---|---|---|---|---|
| 1 | On-Page SEO Included? | Toggle | Yes / No (default: Yes) | +SEO hours: ceil(pages/5) × 2–3 hrs + base 2–4 hrs |
| 2 | Keyword Research Included? | Toggle | Yes / No | +8–14 hrs SEO phase |
| 3 | Schema Markup Required? | Toggle | Yes / No | +6–10 hrs SEO phase |
| 4 | Google My Business Setup? | Toggle | Yes / No | +2–4 hrs SEO phase |

### Section 7 — Timeline & Decision-Making
*These answers expose schedule risks before the timetable is built. The review turnaround time is applied as a buffer after every approval gate in the Gantt chart.*

| # | Question / Field | Input Type | Options / Range | Estimation Impact |
|---|---|---|---|---|
| 1 | Project Start Date | Date | Calendar picker | Anchors all Gantt dates. Default = today if blank |
| 2 | Hard Launch Deadline | Date | Calendar picker | If estimated launch > hard date: warning + 3 risk points |
| 3 | Client Review Turnaround | Number | 1–20 business days | Added as buffer days after each phase gate in timeline |
| 4 | Number of Stakeholders | Number | 1–20+ | > 3 stakeholders adds +2–4 hrs Discovery + 2 risk points |
| 5 | First-Time Web Agency Client? | Toggle | Yes / No | +2–4 hrs Discovery (onboarding) + 2 risk points |
| 6 | Known Blackout Periods? | Toggle | Yes / No | +10 buffer days added to total timeline |
| 7 | Blackout Period Notes | Text input | Free text (if blackout = Yes) | Logged in assumptions — no direct hours |

### Section 8 — Post-Launch & Ongoing Support
*Defining post-launch scope at project start prevents ambiguity about what is included vs. billable after go-live. The retainer is shown as a separate line item, not counted in the main project total.*

| # | Question / Field | Input Type | Options / Range | Estimation Impact |
|---|---|---|---|---|
| 1 | CMS Training Session Required? | Toggle | Yes / No | +2–4 hrs Launch & Handoff phase |
| 2 | Phase 2 Planned? | Toggle | Yes / No | +3–5 hrs Launch (architecture planning at handoff) |
| 3 | Post-Launch Retainer? | Toggle | Yes / No | Adds a separate "Post-Launch Retainer" phase row |
| 4 | Retainer Hours Per Month | Number | 1–200 (if retainer = Yes) | Shown as separate line item — not included in project total |

---

## 3. Estimation Engine

The estimation engine is implemented entirely in TypeScript in `client/src/lib/estimator.ts`. It takes a fully typed `Project` object and returns a complete `Estimate` object containing phases, task line items, timeline events, risk metadata, and formatted dates. All logic runs client-side — no server call is needed to generate an estimate.

### 3.1 Phase-by-Phase Hours Logic

| Phase | Color | Base Hours | Variable Additions |
|---|---|---|---|
| Discovery & Strategy | Purple | 8–10 hrs | Redesign audit +3–5, Regulated +4–8, First-time client +2–4, Stakeholders > 3 +2–4, Milestone plan +1–2 |
| Content & Copy | Teal | 4–6 hrs | SC copy: pages × 1.5–2 hrs each. Client copy coordination +2–4. Migration: ceil(pages/10) × 3 hrs. Video +4–8. Legal review +6–10. Stock photos +3–6 |
| Design & UX | Amber | 16–24 hrs | Wireframes +8–14. Templates × 4–6 hrs each. No brand guide +12–20. Rebrand +16. Existing files −8. Custom illustrations +12–20. Animations +8–14. Revision rounds × 4–6 hrs |
| Development | Green | 24–32 hrs | Pages × 1.5–2 hrs. Templates × 4–5 hrs. Every integration adds per its row. ADA +8–14. Perf optimization +6–10. Analytics +2–4. Dev QA +4–8 |
| QA & Testing | Red | Cross-browser 4–6, Mobile 4–6, Forms 3–5, Proofing 2–4, Performance 2–4, Staging 3–5, Bug fixes 18% of dev | ADA enabled: +4–8 hrs accessibility audit (screen reader / keyboard nav) |
| SEO Setup | Indigo | Scales with pages | On-page: ceil(pages/5) × 2–3 + base. Keyword research +8–14. Schema +6–10. GMB +2–4 |
| Launch & Handoff | Pink | 7–12 hrs | Pre-launch checklist +1–2. DNS/SSL +2–4. Smoke testing +2–3. Docs +2–3. CMS training +2–4. Phase 2 plan +3–5 |

### 3.2 Timeline & Calendar Logic

The engine converts phase hours to business days using a 6-productive-hours/day assumption, then adds client review buffers at each gate. Phases are sequenced as follows:

- **Discovery**: Runs first. Includes review buffer.
- **Content**: Runs concurrently with Discovery, starting on Day 0.
- **Design**: Starts the day after Discovery ends. Includes buffer × revision rounds.
- **Development**: Starts after both Design AND Content are complete (whichever is later).
- **QA**: Starts immediately after Development ends. Includes one review buffer.
- **SEO**: Starts at 60% through Development, running in parallel with late dev and QA.
- **Launch**: Starts after QA ends. Adds 2 extra days for DNS propagation buffer.

Real calendar dates are computed by calling `addBusinessDays(startDate, n)`, which increments calendar days while skipping Saturdays and Sundays. Blackout periods (from Section 7) add a flat 10-day buffer to the total. The Gantt chart's month dividers are generated by computing which business-day offset each month boundary falls at, relative to the start date.

### 3.3 Risk Scoring Model

Risk score is the sum of individual flag points plus 1/2 the number of unanswered required fields. The risk level thresholds match the Strategic Connection Discovery Checklist scoring table exactly:

| Unanswered Items | Risk Level | Recommended Action |
|---|---|---|
| 0–3 | Low | Proceed with estimate |
| 4–8 | Medium | Note assumptions in scoping document; confirm with client before signing |
| 9–15 | High | Schedule a follow-up discovery call before finalizing any hours or timeline |
| 16+ | Critical | Do not issue an estimate — return to BD for a more thorough Discovery session |

**Additional risk flag points applied by the engine:**

| Flag | Points | Reason |
|---|---|---|
| Client copy not ready | +3 pts | Content delay is the #1 timeline risk |
| Internal system integration | +3 pts | Scope is undefined — high uncertainty |
| Stakeholder count > 3 | +2 pts | More approvers = slower feedback cycles |
| First-time client | +2 pts | Requires extra guidance and onboarding |
| Multi-language site | +2 pts | Complexity multiplies across all phases |
| Content needs legal review | +2 pts | Legal turnaround adds timeline uncertainty |
| Custom calculator / portal | +1 pt each | Complex interactive features |
| Extra revision rounds (above 2) | +1 pt | Scope creep risk |
| Estimated launch exceeds hard deadline | +3 pts | Schedule is infeasible as scoped |

---

## 4. Hours Breakdown Tab

The Hours Breakdown tab is the first view shown after opening a project. It presents the complete hours estimate in a three-column **Min · Mid · Max** table with two levels of hierarchy: phase rows and task rows.

### Phase Rows
Each of the 7 core phases (Discovery, Content, Design, Development, QA, SEO, Launch) appears as a collapsible row. Clicking the row reveals all line-item tasks beneath it. Each phase row shows:
- Phase label and one-line description
- Proportional bar chart showing this phase's share of total hours
- Min / Mid (colored, boldest) / Max hours
- Expand / collapse chevron

### Task Rows (expanded)
Expanding a phase reveals every individual deliverable task with:
- Task name and optional clarifying note
- Micro proportional bar (task hours as % of phase total)
- Min / Mid / Max hours for the specific task

### Totals Footer
A totals row beneath all phases shows the full project Min · Mid · Max. The Mid column is highlighted in the primary brand color and labeled **"quote this"** — it is the recommended figure to present to clients. If a post-launch retainer was specified, it appears as a separate row below the total, explicitly excluded from the project total.

### Scope Assumptions Panel
Below the table, a two-column grid lists every assumption made by the estimation engine — for example: "CRM integration: HubSpot", "Content migration: 20 pages", "On-page SEO: meta titles, descriptions, alt text for all pages". Each assumption is generated only when the corresponding toggle or field was set.

---

## 5. Timeline Tab (Gantt Chart)

The Timeline tab renders a full calendar Gantt chart as an inline SVG. It is the visual companion to the hours breakdown and shows when each phase occurs on an actual calendar.

### Chart Structure
- **Left column**: phase labels (truncated at 20 characters)
- **Header row**: week number markers (W1, W2, W3...) spaced proportionally
- **Month dividers**: vertical rules with month + year labels (e.g. "Jul 2026", "Aug 2026")
- **Row backgrounds**: alternating white / light slate for readability
- **Phase bars**: colored rectangles scaled to the phase's business-day duration
- **Duration labels**: printed inside each bar if the bar is wide enough (> 50px)
- **Date labels**: start and end dates printed beneath each bar in the phase color
- **Milestone diamonds**: printed at the right edge of qualifying phase bars

### Phase Sequence & Concurrency
Content & Copy runs from Day 0 concurrently with Discovery (not sequentially). SEO Setup starts at the 60% mark of Development, overlapping with late dev and QA. All other phases are sequential. This concurrency is intentional and reflects real agency workflow — content gathering and site building are independent work streams.

### Milestone Diamonds

Five milestones are marked with colored diamond shapes:

| Milestone | Trigger Point | Color |
|---|---|---|
| Kickoff | End of Discovery phase | Purple |
| Design Approved | End of Design phase | Amber |
| Dev Complete | End of Development phase | Green |
| QA Sign-off | End of QA phase | Red |
| Go-Live | End of Launch & Handoff phase | Pink |

### Milestone Summary Cards
Below the Gantt chart, a card grid lists every milestone with its exact calendar date (e.g. "Design Approved — Aug 13, 2026"). These dates update in real time whenever the project's start date or any scope input changes.

---

## 6. Project Tracker Tab

The Project Tracker tab transforms the estimate into a live project management view. It uses the same task list generated by the estimation engine — so the tasks tracked are always exactly the tasks that were scoped.

### Overview Dashboard
- Master progress bar (% of all tasks checked across the project)
- Tasks Done counter (e.g. "12 / 48")
- Phases Complete counter (e.g. "2 / 7")
- Hours Logged (sum of all phase hours-logged inputs)
- Hours Estimated (total mid estimate, for comparison)
- Active phase indicator with animated pulse dot

### Phase Tracker Cards
Each of the 7 phases has an expandable card containing:
- Phase number, label, and phase color dot
- Status badge (selected from 5 statuses — see below)
- Per-phase progress bar and task count (e.g. "3/5 tasks · 60%")
- Hours Logged input field with estimated hours shown alongside
- Variance indicator: green if under estimate, orange if over
- Expand/collapse toggle to show task checklist and notes

### Phase Status Options

| Status | Color | Icon | When to Use |
|---|---|---|---|
| Not Started | Gray | Circle | Phase has not begun |
| In Progress | Blue | Clock | Active work is underway |
| In Review | Yellow | Alert circle | Deliverable sent to client for review |
| Complete | Green | Check circle | Phase signed off and closed |
| Blocked | Red | Alert circle | Work cannot proceed — escalation needed |

### Task Checklist (Expanded)
Expanding a phase card reveals the full task checklist. Each task row shows:
- Checkbox (clicking marks/unmarks the task as complete)
- Task name with strikethrough styling when checked
- Optional clarifying note in muted text
- Min–Max hours range on the right
- Mid hours labeled separately
- Row background turns green when task is checked

### Phase Notes
Each expanded phase card includes a Notes section with an Edit button. Notes support free-text entry for client feedback, blockers, decisions made, or any context the team needs to carry through the project. Notes are stored in the module-level tracker state (persists during the browser session).

### Milestone Check-In Panel
At the bottom of the Tracker tab, the five milestones are listed as check-in cards. A milestone is automatically marked "Achieved" (green with strikethrough) when its corresponding phase status is set to Complete. Each card shows the milestone name, its calendar date, and achieved/pending status.

---

## 7. Complete Question Reference

Complete, ordered list of every question asked in the Discovery Wizard, the section it belongs to, the field name in the database schema, and whether it is required for a valid estimate. Fields marked required contribute to the unanswered-items risk score if left blank.

| Section | # | Question / Field | DB Column | Required |
|---|---|---|---|---|
| S1 | 1 | Project Name | `name` | Yes |
| S1 | 2 | Client Name | `client_name` | Yes |
| S1 | 3 | Primary Business Goal | `primary_goal` | Yes |
| S1 | 4 | Is this a redesign / rebuild? | `is_redesign` | No |
| S1 | 5 | Current Website URL | `current_url` | If redesign |
| S1 | 6 | Regulated Industry? | `regulated_industry` | No |
| S1 | 7 | Industry Type | `regulated_type` | If regulated |
| S2 | 8 | Total Pages | `total_pages` | Yes |
| S2 | 9 | Unique Layout Templates | `unique_templates` | Yes |
| S2 | 10 | Blog / News Section? | `has_blog` | No |
| S2 | 11 | Client Login / Portal? | `has_client_login` | No |
| S2 | 12 | Appointment Booking System? | `has_booking` | No |
| S2 | 13 | Job Board / Careers? | `has_job_board` | No |
| S2 | 14 | Custom Calculator? | `has_calculators` | No |
| S2 | 15 | Multi-Language? | `multi_language` | No |
| S2 | 16 | Number of Languages | `language_count` | If multilang |
| S2 | 17 | Custom Forms? | `has_custom_forms` | No |
| S2 | 18 | Form Complexity | `form_complexity` | If forms |
| S2 | 19 | E-Commerce Required? | `has_ecommerce` | No |
| S2 | 20 | Number of Products / SKUs | `product_count` | If ecommerce |
| S2 | 21 | Payment Gateway | `payment_gateway` | If ecommerce |
| S2 | 22 | Product Variations? | `has_product_variations` | If ecommerce |
| S3 | 23 | Has Existing Brand Guide? | `has_brand_guide` | No |
| S3 | 24 | Full Rebrand? | `is_rebrand` | No |
| S3 | 25 | Existing Design Files? | `has_existing_design_files` | No |
| S3 | 26 | Approved Photography? | `has_approved_photography` | No |
| S3 | 27 | Custom Illustrations? | `needs_custom_illustrations` | No |
| S3 | 28 | Animations / Parallax? | `needs_animations` | No |
| S3 | 29 | Preferred Platform / CMS | `platform` | Yes |
| S3 | 30 | Design Revision Rounds | `design_revision_rounds` | No |
| S4 | 31 | SC Writes Copy? | `sc_writes_copy` | No |
| S4 | 32 | Pages Requiring Copywriting | `copy_page_count` | If SC writes |
| S4 | 33 | Client Copy Ready? | `copy_ready` | No |
| S4 | 34 | Agreed Content Delivery Date | `content_delivery_date` | If not ready |
| S4 | 35 | Video Content Required? | `has_video_content` | No |
| S4 | 36 | Content Needs Legal Review? | `content_needs_legal_review` | No |
| S4 | 37 | Pages to Migrate | `migration_page_count` | No |
| S5 | 38 | Preferred Hosting Environment | `hosting_environment` | Yes |
| S5 | 39 | CRM Integration? | `has_crm_integration` | No |
| S5 | 40 | CRM Platform | `crm_platform` | If CRM |
| S5 | 41 | Email Marketing Integration? | `has_email_integration` | No |
| S5 | 42 | Email Platform | `email_platform` | If email |
| S5 | 43 | Internal System Integration? | `has_internal_system_integration` | No |
| S5 | 44 | Google Analytics / GA4? | `needs_analytics` | No |
| S5 | 45 | Live Chat / Chatbot? | `needs_live_chat` | No |
| S5 | 46 | Social Media Feeds? | `needs_social_feeds` | No |
| S5 | 47 | 301 Redirect Mapping? | `needs_redirect_mapping` | No |
| S5 | 48 | ADA / WCAG Accessibility? | `needs_ada` | No |
| S5 | 49 | Core Web Vitals Benchmarks? | `needs_performance_benchmarks` | No |
| S6 | 50 | On-Page SEO Included? | `on_page_seo_included` | No |
| S6 | 51 | Keyword Research Included? | `keyword_research_included` | No |
| S6 | 52 | Schema Markup? | `needs_schema_markup` | No |
| S6 | 53 | Google My Business Setup? | `needs_google_my_business` | No |
| S7 | 54 | Project Start Date | `project_start_date` | Yes |
| S7 | 55 | Hard Launch Deadline | `hard_launch_date` | No |
| S7 | 56 | Client Review Turnaround (days) | `client_review_turnaround` | Yes |
| S7 | 57 | Number of Stakeholders | `stakeholder_count` | No |
| S7 | 58 | First-Time Agency Client? | `first_time_client` | No |
| S7 | 59 | Known Blackout Periods? | `has_blackout_periods` | No |
| S7 | 60 | Blackout Period Notes | `blackout_notes` | If blackout |
| S8 | 61 | CMS Training Session? | `needs_cms_training` | No |
| S8 | 62 | Phase 2 Planned? | `has_phase_2` | No |
| S8 | 63 | Post-Launch Retainer? | `has_retainer` | No |
| S8 | 64 | Retainer Hours Per Month | `retainer_hours_per_month` | If retainer |

---

## 8. Risk Level Thresholds — Quick Reference

This section reproduces the full risk scoring reference from the Strategic Connection Discovery Checklist, as implemented in the SC Estimator.

| Unanswered Items | Risk Level | Badge Color | Recommended Action |
|---|---|---|---|
| 0–3 | Low | Green | Proceed with estimate. |
| 4–8 | Medium | Yellow | Note all assumptions in the scoping document. Confirm key unknowns with the client before anyone signs anything. |
| 9–15 | High | Orange | Do not finalize any hours or timeline. Schedule a follow-up discovery call to close the open items before issuing a proposal. |
| 16+ | Critical | Red | Do not issue an estimate at all. Return the project to Business Development for a more thorough Discovery session before any scoping work begins. |

---

*Source: SC Estimator — Feature & Discovery Documentation, Strategic Connection. Reconstructed from screenshots of the original PDF (generated by Perplexity Computer, June 25, 2026, Version 1.0).*
