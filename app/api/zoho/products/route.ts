import "server-only";

import { NextResponse } from "next/server";

import { requireZohoReader } from "@/lib/zoho/guard";
import {
  findCategoryField,
  productCategories,
  toProduct,
  type ZohoProduct,
} from "@/lib/zoho/products";
import { zohoFetch } from "@/lib/zoho/tokens";

/**
 * The Products module, for the estimate's product picker — read-only.
 *
 * GET /api/zoho/products  → { products: ZohoProduct[], categories: string[] }
 *
 * Live, not a CSV snapshot: `ZohoCRM.modules.READ` (already granted) covers
 * Products, so a product added in the CRM shows up here with no redeploy and no
 * re-consent.
 *
 * Records are fetched WITHOUT a `fields` filter on purpose. This org files
 * products under two different things — the standard `Product_Category`
 * (Creative / Sysdev / Phone / …) and its own custom "CATEGORY" field
 * (ONBOARDING / SEO / WEBSITE DESIGN / …) — and a custom field's API name isn't
 * knowable up front. So records come back whole and `lib/zoho/products.ts` picks
 * the fields out, with the custom one resolved from field metadata by its LABEL
 * (one cached call) rather than guessed from its name.
 */
const PER_PAGE = 200;
const MAX_PAGES = 5;

/**
 * API name of the org's own category field, resolved from field metadata by
 * LABEL (a custom field's API name can't be guessed from its label). Layouts
 * change about never, so this is cached for the life of the server instance —
 * same treatment as the org id in the deals route. `undefined` = not looked up
 * yet, `null` = looked up and this org has no such field.
 */
let categoryFieldCache: string | null | undefined;

async function categoryField(): Promise<string | null> {
  if (categoryFieldCache !== undefined) return categoryFieldCache;
  try {
    const res = await zohoFetch("/crm/v2/settings/fields?module=Products");
    if (!res.ok) {
      // Don't cache a failure: a transient 5xx shouldn't disable grouping for
      // the life of the instance.
      console.error("[zoho products] field metadata", res.status);
      return null;
    }
    const data = await res.json().catch(() => null);
    categoryFieldCache = findCategoryField(data?.fields ?? []);
  } catch (e) {
    console.error("[zoho products] field metadata threw", e);
    return null;
  }
  return categoryFieldCache;
}

export async function GET() {
  const gate = await requireZohoReader();
  if ("error" in gate) return gate.error;

  const products: ZohoProduct[] = [];
  const tagField = await categoryField();
  try {
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const res = await zohoFetch(
        `/crm/v2/Products?per_page=${PER_PAGE}&page=${page}&sort_by=Product_Name&sort_order=asc`,
      );
      if (res.status === 204) break;
      if (!res.ok) {
        const body = await res.text();
        console.error("[zoho products]", res.status, body.slice(0, 300));
        return NextResponse.json(
          { error: "Zoho request failed.", status: res.status },
          { status: 502 },
        );
      }
      const data = await res.json();
      for (const rec of (data?.data ?? []) as Record<string, unknown>[]) {
        // Retired products stay in the CRM; they shouldn't be sellable here.
        if (rec.Product_Active === false) continue;
        products.push(toProduct(rec, tagField));
      }
      if (!data?.info?.more_records) break;
    }
  } catch (e) {
    console.error("[zoho products]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Zoho is not connected." },
      { status: 503 },
    );
  }

  return NextResponse.json({
    products,
    categories: productCategories(products),
    // Surfaced so a mis-detected category field is visible, not mysterious.
    categoryField: tagField,
  });
}
