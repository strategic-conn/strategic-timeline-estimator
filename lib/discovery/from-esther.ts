/** Seeds a DiscoveryProject from an Esther brief analysis (chatbot → wizard hand-off). */
import { categoryIdByName } from "@/lib/proposal-catalog";
import type { DiscoveryProject } from "@/types/discovery.types";
import type { EstherAnalysis } from "@/types/esther.types";

/**
 * Looked up by NAME: categories were renumbered in catalog v3, and this used to
 * be the literal `5` — which now means Custom Tools, so every Esther brief with
 * a custom tool would have been read as an online store.
 */
const ECOMMERCE_CATEGORY_ID = categoryIdByName("E-Commerce");

type DiscoverySeed = Partial<
  Omit<DiscoveryProject, "id" | "created_at" | "updated_at">
>;

function mapPlatform(platform: string): string {
  switch (platform) {
    case "wordpress":
      return "wordpress";
    case "shopify":
      return "shopify";
    case "react_next":
    case "php":
      return "custom";
    default:
      return "custom";
  }
}

export function discoveryFromEstherAnalysis(
  analysis: EstherAnalysis,
): DiscoverySeed {
  const text = analysis.lineItems
    .map((li) => `${li.module ?? ""} ${li.title}`)
    .join(" ")
    .toLowerCase();

  const pageItems = analysis.lineItems.filter((li) =>
    /page/.test(`${li.module ?? ""} ${li.title}`.toLowerCase()),
  ).length;
  const total_pages = pageItems > 0 ? Math.max(pageItems, 5) : 5;

  const has_ecommerce =
    analysis.lineItems.some((li) => li.category_id === ECOMMERCE_CATEGORY_ID) ||
    /commerce|product|cart|checkout|sku/.test(text);

  return {
    name: analysis.suggestedTitle,
    client_name: analysis.clientName ?? "",
    platform: mapPlatform(analysis.platform),
    total_pages,
    unique_templates: Math.max(2, Math.ceil(total_pages / 4)),
    has_blog: /blog|news|article|resource/.test(text),
    has_booking: /appointment|booking|schedul/.test(text),
    has_client_login: /member|login|account|portal/.test(text),
    has_custom_forms: /form/.test(text),
    multi_language: /multi-?language|translation/.test(text),
    has_ecommerce,
    needs_ada: /accessib|ada|wcag/.test(text),
    needs_analytics: /analytics|ga4|tracking/.test(text),
    on_page_seo_included: true,
  };
}
