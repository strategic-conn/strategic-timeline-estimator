/** Canned demo content for Esther — used for suggestion chips and "attach" fallback. */

export const ESTHER_SAMPLE_BRIEF = `Client: Northwind Outdoors. They need a new Shopify store to sell
~60 products with variants, a strong homepage offer, featured collections, customer reviews,
a blog for SEO, a contact page, and Klaviyo email signup. They also want basic analytics and
conversion tracking set up before launch. Budget-conscious but want it to look premium.`;

export const ESTHER_SUGGESTIONS: { label: string; prompt: string }[] = [
  {
    label: "Estimate a Shopify store",
    prompt:
      "We need a Shopify store for ~40 products with variants, a conversion-focused homepage, featured collections, customer reviews, a blog, and a contact page. Add analytics and conversion tracking before launch.",
  },
  {
    label: "Scope a marketing site",
    prompt:
      "Build a WordPress marketing site: homepage with strong hero and benefits, about, services, a 6-page blog, contact form with CRM integration, and on-page SEO.",
  },
  {
    label: "Custom web app estimate",
    prompt:
      "We want a custom Next.js app with member login, a dynamic dashboard, API-driven content, a multi-step form, and accessibility compliance. This is a complex, bespoke build.",
  },
  {
    label: "Turn this into a timeline",
    prompt:
      "Take the scope above and break it into a phased delivery timeline with rough weeks per phase.",
  },
];

export const ESTHER_GREETING =
  "Hi, I'm Esther 👋 Paste a project brief (or attach one) and I'll scope it into an hours estimate, a phased timeline, and a ready-to-edit proposal. Tip: mention the platform (Shopify, WordPress, Next.js…) and rough page/product counts for a sharper estimate.";
