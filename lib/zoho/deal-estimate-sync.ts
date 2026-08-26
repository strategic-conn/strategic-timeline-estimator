import "server-only";

import { HOURLY_RATE } from "@/lib/constants/proposal-estimator";
import {
  findPackagesSubform,
  packageRows,
  type DealFieldMeta,
  type PackageInput,
  type PackagesLayout,
  type SubformFieldMeta,
} from "@/lib/zoho/deal-packages";
import { zohoFetch } from "@/lib/zoho/tokens";

/**
 * Putting an estimate's content onto a Deal: the Packages rows, and (for pushes)
 * the description.
 *
 * Shared by "Create deal" and "Push to Zoho" so both behave identically. The
 * rule that makes it safe for an existing deal: **never overwrite content that
 * is already there.** A subform write replaces every row, so a deal where sales
 * has typed their own Packages lines would silently lose them. On a deal we just
 * created the table is empty by definition, so the same code does the obvious
 * thing there without a special case.
 */

/**
 * Resolved layout, cached per server instance — layouts change about never.
 * `undefined` = not looked up yet, `null` = looked up and there is no usable
 * subform, so the write is skipped rather than guessed at.
 */
let layoutCache: PackagesLayout | null | undefined;

export async function resolvePackagesLayout(): Promise<PackagesLayout | null> {
  if (layoutCache !== undefined) return layoutCache;
  try {
    const res = await zohoFetch("/crm/v2/settings/fields?module=Deals");
    if (!res.ok) return null; // transient — don't cache a failure
    const data = await res.json().catch(() => null);
    const dealFields = (data?.fields ?? []) as DealFieldMeta[];

    const rowCache = new Map<string, SubformFieldMeta[]>();
    for (const f of dealFields) {
      const mod = f.subform?.module;
      if (f.data_type !== "subform" || !mod || rowCache.has(mod)) continue;
      const r = await zohoFetch(
        `/crm/v2/settings/fields?module=${encodeURIComponent(mod)}`,
      );
      const rd = r.ok ? await r.json().catch(() => null) : null;
      rowCache.set(mod, (rd?.fields ?? []) as SubformFieldMeta[]);
    }
    layoutCache = findPackagesSubform(dealFields, (m) => rowCache.get(m) ?? []);
  } catch (e) {
    console.error("[zoho sync] packages layout lookup failed", e);
    return null;
  }
  return layoutCache;
}

export type EstimateSyncResult = {
  packagesWritten: number;
  descriptionWritten: boolean;
  warnings: string[];
};

/**
 * Write the estimate's products (and optionally a description) onto a Deal,
 * skipping anything the deal already has.
 *
 * @param description Only supplied by the push path; "Create deal" sets it in
 *   the insert itself, where there is nothing to preserve.
 */
export async function applyEstimateToDeal(
  dealId: string,
  input: { products: PackageInput[]; description?: string | null },
): Promise<EstimateSyncResult> {
  const out: EstimateSyncResult = {
    packagesWritten: 0,
    descriptionWritten: false,
    warnings: [],
  };
  const wantsPackages = input.products.length > 0;
  const wantsDescription = Boolean(input.description?.trim());
  if (!wantsPackages && !wantsDescription) return out;

  const layout = wantsPackages ? await resolvePackagesLayout() : null;
  if (wantsPackages && !layout) {
    out.warnings.push(
      "Couldn't find a Packages subform on the Deals layout, so the products weren't written as rows.",
    );
  }

  // Read what the deal already holds. A failure here means we can't tell whether
  // we'd be overwriting, so we don't write — the whole point of this path.
  const fields = [layout?.apiName, "Description"].filter(Boolean).join(",");
  let current: Record<string, unknown> | null = null;
  try {
    const res = await zohoFetch(
      `/crm/v2/Deals/${dealId}?fields=${encodeURIComponent(fields)}`,
    );
    if (res.ok) {
      const body = await res.json().catch(() => null);
      current = (body?.data?.[0] as Record<string, unknown>) ?? null;
    }
  } catch (e) {
    console.error("[zoho sync] couldn't read the deal", e);
  }
  if (!current) {
    out.warnings.push(
      "Couldn't read the deal's current contents, so nothing was overwritten.",
    );
    return out;
  }

  const payload: Record<string, unknown> = {};

  if (layout && wantsPackages) {
    const existing = current[layout.apiName];
    const hasRows = Array.isArray(existing) && existing.length > 0;
    if (hasRows) {
      out.warnings.push(
        `The deal already has ${existing.length} ${layout.apiName} row${
          existing.length === 1 ? "" : "s"
        } — left as they are.`,
      );
    } else {
      payload[layout.apiName] = packageRows(layout, input.products, HOURLY_RATE);
    }
  }

  if (wantsDescription) {
    const existing = current.Description;
    if (typeof existing === "string" && existing.trim()) {
      out.warnings.push("The deal already has a description — left as it is.");
    } else {
      payload.Description = input.description;
    }
  }

  if (!Object.keys(payload).length) return out;

  try {
    const res = await zohoFetch(`/crm/v2/Deals/${dealId}`, {
      method: "PUT",
      body: JSON.stringify({ data: [payload] }),
    });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.data?.[0]?.code === "SUCCESS") {
      if (payload[layout?.apiName ?? ""]) out.packagesWritten = input.products.length;
      if (payload.Description) out.descriptionWritten = true;
    } else {
      console.error("[zoho sync] write failed", res.status, JSON.stringify(body));
      out.warnings.push(
        `Couldn't write the estimate details onto the deal (${
          body?.data?.[0]?.message ?? `HTTP ${res.status}`
        }).`,
      );
    }
  } catch (e) {
    console.error("[zoho sync] write threw", e);
    out.warnings.push("Couldn't write the estimate details onto the deal.");
  }
  return out;
}
