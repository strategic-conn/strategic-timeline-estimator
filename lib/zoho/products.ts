/**
 * Mapping for the Products module. Kept out of the route so the field-picking
 * rules — the part that can silently pick the wrong column — are testable.
 *
 * Records arrive from Zoho unfiltered (see the route for why), so the job here
 * is to reduce a full CRM record to what the picker shows, without hardcoding
 * any custom field's API name.
 */
export type ZohoProduct = {
  id: string;
  name: string;
  code: string | null;
  /** Standard `Product_Category` picklist (Creative / Sysdev / Phone / …). */
  category: string | null;
  /** The org's own category-style field (ONBOARDING / SEO / …), if it has one. */
  tag: string | null;
  unitPrice: number | null;
  description: string | null;
};

/** One entry of `GET /crm/v2/settings/fields?module=Products`. */
export type ZohoFieldMeta = {
  api_name?: string;
  field_label?: string;
  data_type?: string;
};

/** Text-ish types a category could plausibly be stored in. */
const CATEGORY_TYPES = ["picklist", "text", "textarea", "multiselectpicklist"];

/**
 * The API name of the org's own category field, found by its LABEL.
 *
 * A custom field's API name is whatever it was auto-generated as — matching on
 * the name is a guess, and this org's "CATEGORY" column proved it: the field is
 * labelled CATEGORY but is not reachable as `CATEGORY`. The label is the thing
 * a human actually sees in the CRM, so that's what we match, and the standard
 * `Product_Category` is excluded because it has its own slot.
 */
export function findCategoryField(fields: ZohoFieldMeta[]): string | null {
  const usable = fields.filter(
    (f) =>
      f.api_name &&
      f.api_name !== "Product_Category" &&
      (!f.data_type || CATEGORY_TYPES.includes(f.data_type)),
  );
  const label = (f: ZohoFieldMeta) => (f.field_label ?? "").trim().toLowerCase();
  // Exact "category" first; only then something like "Service Category".
  return (
    usable.find((f) => label(f) === "category")?.api_name ??
    usable.find((f) => /\bcategor(y|ies)\b/.test(label(f)))?.api_name ??
    null
  );
}

/** First non-empty string field whose API name matches, ignoring `exclude`. */
export function pickField(
  rec: Record<string, unknown>,
  match: RegExp,
  exclude: string[] = [],
): string | null {
  for (const [k, v] of Object.entries(rec)) {
    if (exclude.includes(k) || !match.test(k)) continue;
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * @param tagField API name of the org's category field, from `findCategoryField`.
 *   Falls back to matching on the API name when the metadata call didn't run or
 *   found nothing — worse, but better than dropping the field entirely.
 */
export function toProduct(
  rec: Record<string, unknown>,
  tagField?: string | null,
): ZohoProduct {
  const price = rec.Unit_Price;
  const description =
    pickField(rec, /^brief[_ ]?description$/i) ??
    (typeof rec.Description === "string" ? rec.Description : null);
  const tagged = tagField ? rec[tagField] : null;
  return {
    id: String(rec.id),
    name: (rec.Product_Name as string) ?? "(unnamed product)",
    code: (rec.Product_Code as string) ?? null,
    category: (rec.Product_Category as string) ?? null,
    tag:
      typeof tagged === "string" && tagged.trim()
        ? tagged.trim()
        : pickField(rec, /^category$/i, ["Product_Category"]),
    unitPrice: typeof price === "number" && price > 0 ? price : null,
    // Descriptions here run to several paragraphs; the picker needs a hint, and
    // the full text would dominate the payload.
    description: description ? description.replace(/\s+/g, " ").slice(0, 160) : null,
  };
}

/** What a product is filed under, in the order a person would look for it. */
export function productGroup(p: ZohoProduct): string {
  return p.tag ?? p.category ?? "Other";
}

/** Distinct groups, alphabetical, with the catch-all last. */
export function productCategories(products: ZohoProduct[]): string[] {
  return [...new Set(products.map(productGroup))].sort((a, b) =>
    a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b),
  );
}
