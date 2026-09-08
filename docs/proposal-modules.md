# Proposal modules — for grouping

Generated from `lib/proposal-catalog/catalog.json` (source: `project-csv/tasks and integration.xlsx`).

There are **two** different things the app calls a "module", and the Line items
tab shows whichever one built the estimate. Worth separating before grouping.

---

## 1. Guided-estimate phases (7)

These are what a **guided** estimate shows in the Module column — the screenshot
with Discovery & Strategy / Content & Copy / Design & UX / Development / QA & Testing
is this list. They are fixed in code (`lib/discovery/constants.ts`), not in the catalog,
and every guided estimate uses the same seven.

| # | Phase |
| - | ----- |
| 1 | Discovery & Strategy |
| 2 | Content & Copy |
| 3 | Design & UX |
| 4 | Development |
| 5 | QA & Testing |
| 6 | SEO Setup |
| 7 | Launch & Handoff |

---

## 2. Catalog modules (59)

These are what a **catalog** estimate shows. They come from the spreadsheet, vary by
platform, and are the ones most likely to need grouping.

| Module | Platforms | Items | Base hours | Category |
| ------ | --------- | ----: | ---------: | -------- |
| Accessibility | Squarespace | 1 | 4 | Integration |
| Advanced | Wix | 4 | 38 | Custom Tools |
| Advanced E-Commerce | Shopify | 5 | 53 | Custom Tools |
| Analytics | Shopify, Wix | 6 | 20 | Performance & Security |
| Analytics & Tracking | WordPress, Squarespace, PHP, React/Next | 17 | 57 | Performance & Security, Conversion Tracking |
| Backend | PHP, React/Next | 10 | 76 | Database |
| Backup Before Deploy | WordPress | 1 | 1 | Deployment |
| Blog | Shopify, Wix | 6 | 10 | SEO & Content |
| Blog Setup | WordPress, Squarespace, PHP, React/Next | 12 | 27 | SEO & Content |
| Cache/CDN Setup | WordPress | 1 | 3 | Deployment |
| CMS Structure Setup | WordPress, React/Next | 2 | 20 | CMS & Content Prep |
| Configurator - 3D | PHP, React/Next | 4 | 195 | Custom Tools |
| Configurator - 3D WebGL | WordPress | 3 | 145 | Custom Tools |
| Configurator - Advanced | React/Next | 3 | 100 | Custom Tools |
| Configurator - Advanced 2D | WordPress, PHP | 6 | 200 | Custom Tools |
| Configurator - Basic | React/Next | 3 | 65 | Custom Tools |
| Configurator - Basic 2D | WordPress, PHP | 6 | 130 | Custom Tools |
| Configurator - Features | WordPress, PHP, React/Next | 12 | 245 | Custom Tools |
| Configurator - Full Builder | WordPress, PHP, React/Next | 10 | 720 | Custom Tools |
| Content Entry | WordPress, Shopify, Wix, React/Next | 7 | 17 | CMS & Content Prep |
| Core Page - Blog Detail | Shopify, Wix | 2 | 8 | Frontend |
| Core Page - Contact Page | WordPress, Squarespace, Shopify, Wix, PHP, React/Next | 6 | 33 | Frontend |
| Core Page - Detail Page | Squarespace | 1 | 5 | Frontend |
| Core Page - Detail Pages | WordPress, PHP, React/Next | 3 | 18 | Frontend |
| Core Page - Landing Page | WordPress, Squarespace, Shopify, Wix, PHP, React/Next | 6 | 45 | Frontend |
| Core Page - Standard | WordPress, Squarespace, Shopify, Wix, PHP, React/Next | 6 | 42 | Frontend |
| Deployment | WordPress, Squarespace, Shopify, Wix, PHP, React/Next | 22 | 72 | Deployment, Post-Launch |
| Dynamic Templates | WordPress, React/Next | 2 | 28 | CMS & Content Prep |
| E-Commerce | WordPress, Squarespace, Wix, PHP, React/Next | 66 | 345.5 | E-Commerce |
| E-Commerce Core | Shopify | 6 | 23 | E-Commerce |
| Environment Setup | WordPress, Squarespace, Shopify, Wix, PHP, React/Next | 32 | 93 | Environment Setup |
| Forms - Advanced | Squarespace | 1 | 2 | Integration |
| Forms - CRM Integration | WordPress, PHP, React/Next | 9 | 24 | Integration |
| Forms - Multi-Step | WordPress, Shopify, Wix, PHP, React/Next | 11 | 42 | Integration |
| Forms - Standard | WordPress, Squarespace, Shopify, Wix, PHP, React/Next | 8 | 20 | Integration |
| General | WordPress | 1 | 3 | Environment Setup |
| Homepage - Advanced Dynamic | WordPress, PHP, React/Next | 15 | 258 | Backend, Integration |
| Homepage - Conversion | WordPress, Squarespace, Shopify, Wix, PHP, React/Next | 35 | 88 | Frontend, Integration |
| Homepage - Creative | WordPress, Squarespace, Shopify, Wix, PHP, React/Next | 28 | 126 | Design |
| Homepage - E-Commerce | WordPress, Shopify | 7 | 31 | Integration, E-Commerce |
| Homepage - Multi-Industry | WordPress, PHP, React/Next | 15 | 148 | Frontend |
| Homepage - Standard | WordPress, Squarespace, Shopify, Wix, PHP, React/Next | 61 | 165 | Frontend |
| Integrations | WordPress, Squarespace, Shopify, Wix, PHP, React/Next | 37 | 341 | Integration |
| Media Optimization | WordPress | 1 | 3 | CMS & Content Prep |
| Member Login | WordPress, PHP, React/Next | 12 | 156 | Integration |
| Members / Accounts | Shopify | 3 | 14 | Integration |
| Members Area | Squarespace, Wix | 5 | 24 | Integration |
| Performance | Squarespace, Shopify, Wix | 3 | 11 | Performance & Security |
| Performance & Security | WordPress, PHP, React/Next | 9 | 37 | Performance & Security |
| Performance Check | WordPress | 1 | 2 | Post-Launch |
| Post-Launch | Shopify, Wix, PHP, React/Next | 10 | 33 | Post-Launch |
| Post-Launch QA | WordPress | 1 | 6 | Post-Launch |
| Pre-Launch QA | WordPress, Shopify, Wix, PHP | 4 | 17 | Deployment |
| Production Deployment | WordPress | 1 | 4 | Deployment |
| SEO | Shopify, Wix | 10 | 18 | SEO & Content |
| SEO & Content | WordPress, Squarespace, PHP, React/Next | 29 | 88 | SEO & Content |
| SSL & Mixed Content Fix | WordPress | 1 | 2 | Deployment |
| Tracking Verification | WordPress | 1 | 2 | Post-Launch |
| URL/DB Sync | WordPress | 1 | 2 | Deployment |

### Plain list (for copy/paste)

```
Accessibility
Advanced
Advanced E-Commerce
Analytics
Analytics & Tracking
Backend
Backup Before Deploy
Blog
Blog Setup
Cache/CDN Setup
CMS Structure Setup
Configurator - 3D
Configurator - 3D WebGL
Configurator - Advanced
Configurator - Advanced 2D
Configurator - Basic
Configurator - Basic 2D
Configurator - Features
Configurator - Full Builder
Content Entry
Core Page - Blog Detail
Core Page - Contact Page
Core Page - Detail Page
Core Page - Detail Pages
Core Page - Landing Page
Core Page - Standard
Deployment
Dynamic Templates
E-Commerce
E-Commerce Core
Environment Setup
Forms - Advanced
Forms - CRM Integration
Forms - Multi-Step
Forms - Standard
General
Homepage - Advanced Dynamic
Homepage - Conversion
Homepage - Creative
Homepage - E-Commerce
Homepage - Multi-Industry
Homepage - Standard
Integrations
Media Optimization
Member Login
Members / Accounts
Members Area
Performance
Performance & Security
Performance Check
Post-Launch
Post-Launch QA
Pre-Launch QA
Production Deployment
SEO
SEO & Content
SSL & Mixed Content Fix
Tracking Verification
URL/DB Sync
```

---

## 3. ⚠️ 6 catalog rows with a broken Module value

Not modules — the spreadsheet's **dependency** text landed in the Module column
for one consecutive block. All six are React/Next, ids 68–73, and all are
e-commerce items that should read **E-Commerce** (id 67, immediately above them,
does). Their `dependencies_note` is `null`, so the real dependency information
was lost in the same shift.

| id | Module value (wrong) | Item | Should be |
| -: | -------------------- | ---- | --------- |
| 68 | `68: Variations` | Advanced Product Options (Plugin) | E-Commerce |
| 69 | `68: Options` | Product Add-Ons (Conditional Logic) | E-Commerce |
| 70 | `62-66 Required` | Subscriptions Setup | E-Commerce |
| 71 | `62-66 Required` | Discount Rules / Coupons Setup | E-Commerce |
| 72 | `71: Discounts` | Advanced Pricing Rules (Plugin) | E-Commerce |
| 73 | `55-66 Required` | Product Bundles / Packages | E-Commerce |

These currently show up in the catalog browser as six one-item "modules" with
nonsense names. Fix in `project-csv/tasks and integration.xlsx` and re-import
rather than grouping them — and the dependency notes ("requires 62-66", etc.)
are worth restoring into `dependencies_note`, which is what drives the
missing-prerequisite warning in the editor.

---

## 4. Categories (18) — the other axis

Every catalog item also carries a category. If the goal is grouping, this may
already be the grouping — modules are finer-grained than categories.

| # | Category | Description |
| - | -------- | ----------- |
| 1 | Frontend | UI components and client-side features |
| 2 | Backend | Server-side logic and database tasks |
| 3 | Design | Visual and UX design tasks |
| 4 | Integration | Third-party services and APIs |
| 5 | E-Commerce | Online store features and product catalog |
| 6 | Custom Tools | Configurators |
| 7 | Performance & Security | Optimization |
| 8 | SEO & Content | Blog setup |
| 9 | Local SEO | This category is for the  company that would want local Visibility for their website. |
| 10 | SEO on-page | On-page SEO is how you optimize a webpage so |
| 11 | SEO off-page | Off-page SEO is everything done outside your website t |
| 12 | Conversion Tracking | Conversion tracking is the process of measuring |
| 13 | Environment Setup | Setting up Environment for Stagin and Deployment of Content and files |
| 14 | Deployment | — |
| 15 | CMS & Content Prep | — |
| 16 | Pre-Lanuch | — |
| 17 | Post-Launch | — |
| 18 | Database | — |

---

## Counts

| Platform | Catalog items | Distinct modules |
| -------- | ------------: | ---------------: |
| WordPress | 136 | 41 |
| Squarespace | 67 | 19 |
| Shopify | 69 | 23 |
| Wix | 70 | 22 |
| PHP | 118 | 29 |
| React/Next | 137 | 36 |
| **Total** | **597** | **64** |
