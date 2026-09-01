/**
 * Writing estimate products into the Deal's "Packages" subform.
 *
 * The subform and its columns are custom, so their API names can't be guessed
 * from what the CRM displays — this org already proved that once, where a field
 * labelled "CATEGORY" is reachable only as `CATEGORY1`. So nothing here is
 * hardcoded: the layout is read from field metadata and matched on **labels and
 * types**, the way a person reads the screen.
 *
 * Everything degrades safely. If the subform can't be identified, or its product
 * column can't be found, the caller skips the subform write and the products
 * still travel in the deal's Description. A deal with no rows is recoverable; a
 * deal with rows written to the wrong columns is a mess someone has to unpick by
 * hand, and there is no DELETE scope.
 */
import type { ZohoFieldMeta } from "@/lib/zoho/products";

export type SubformFieldMeta = ZohoFieldMeta & {
  lookup?: { module?: { api_name?: string } } | null;
};

export type DealFieldMeta = ZohoFieldMeta & {
  subform?: { module?: string } | null;
};

/** The resolved column names needed to write one Packages row. */
export type PackagesLayout = {
  /** API name of the subform field on Deals, e.g. "Packages". */
  apiName: string;
  /** Lookup column pointing at the Products module. */
  productField: string;
  /** Currency column for the row's price. Optional — some layouts omit it. */
  priceField: string | null;
  /** Free-text column. Optional. */
  descriptionField: string | null;
};

const label = (f: ZohoFieldMeta) => (f.field_label ?? "").trim().toLowerCase();

/** Currency-ish columns a unit price could live in. */
const PRICE_TYPES = ["currency", "double", "decimal", "bigint", "integer"];
const TEXT_TYPES = ["text", "textarea"];

/**
 * The subform that holds sold products, by label first ("Packages"), then by
 * shape — a subform whose rows carry a lookup into Products is the right one
 * whatever it happens to be called.
 */
export function findPackagesSubform(
  dealFields: DealFieldMeta[],
  rowFieldsOf: (subformModule: string) => SubformFieldMeta[],
): PackagesLayout | null {
  const subforms = dealFields.filter(
    (f) => f.data_type === "subform" && f.api_name && f.subform?.module,
  );
  if (!subforms.length) return null;

  const byLabel = subforms.filter((f) => /package/i.test(label(f)));
  // Label match first, then every subform — a differently-named one still wins
  // if it is the one with a Products lookup.
  for (const candidate of [...byLabel, ...subforms]) {
    const rows = rowFieldsOf(candidate.subform!.module!);
    const productField = rows.find(
      (r) =>
        r.api_name &&
        r.data_type === "lookup" &&
        (r.lookup?.module?.api_name === "Products" || /product/i.test(label(r))),
    );
    if (!productField?.api_name) continue;

    const priceField = rows.find(
      (r) =>
        r.api_name &&
        PRICE_TYPES.includes(r.data_type ?? "") &&
        /unit price|^price$|rate|amount/i.test(label(r)),
    );
    const descriptionField = rows.find(
      (r) =>
        r.api_name &&
        TEXT_TYPES.includes(r.data_type ?? "") &&
        /description/i.test(label(r)),
    );
    return {
      apiName: candidate.api_name!,
      productField: productField.api_name,
      priceField: priceField?.api_name ?? null,
      descriptionField: descriptionField?.api_name ?? null,
    };
  }
  return null;
}

/** One product's share of the estimate, as the client computed and displayed it. */
export type PackageInput = {
  id: string;
  name: string;
  hours: number;
  amount: number;
};

/**
 * Build the subform payload. Only the columns that actually exist are set —
 * writing an unknown key makes Zoho reject the whole record.
 */
export function packageRows(
  layout: PackagesLayout,
  products: PackageInput[],
  rate: number,
): Record<string, unknown>[] {
  return products.map((p) => {
    const row: Record<string, unknown> = {
      [layout.productField]: { id: p.id },
    };
    if (layout.priceField) row[layout.priceField] = p.amount;
    if (layout.descriptionField) {
      // Say where the number came from: the estimate, at the standard rate.
      row[layout.descriptionField] = `${p.hours} h at $${rate}/h`;
    }
    return row;
  });
}

/** The estimate's own totals, for a quote that picked no CRM products. */
export type EstimateTotal = { hours: number; amount: number };

/**
 * One Packages row carrying the estimate's total, with no Product lookup.
 *
 * This is the only way a price reaches the CRM. Writing `Deals.Amount` directly
 * reports SUCCESS and is then **recomputed from this subform within seconds** —
 * verified live: a deal whose single row held 20 000 reverted a written 43 833
 * back to 20 000 in under 4 s. The field metadata claims `Amount` is writable,
 * which is why that had to be tested rather than read.
 *
 * `Product` is `required: false` on this subform (also verified), so a bare
 * priced row is legal and Zoho totals it into `Amount` like any other.
 */
export function estimateTotalRow(
  layout: PackagesLayout,
  total: EstimateTotal,
  rate: number,
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (layout.priceField) row[layout.priceField] = total.amount;
  if (layout.descriptionField) {
    row[layout.descriptionField] = `Estimate — ${total.hours} h at $${rate}/h`;
  }
  return row;
}

/** Products accepted from the client, rejecting anything malformed. */
export function parsePackageInput(raw: unknown): PackageInput[] {
  if (!Array.isArray(raw)) return [];
  const out: PackageInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = String(r.id ?? "");
    // Zoho record ids are numeric strings; anything else can't be a lookup target.
    if (!/^\d+$/.test(id)) continue;
    const hours = Number(r.hours);
    const amount = Number(r.amount);
    out.push({
      id,
      name: typeof r.name === "string" ? r.name : "",
      hours: Number.isFinite(hours) && hours > 0 ? hours : 0,
      amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0,
    });
  }
  return out;
}
