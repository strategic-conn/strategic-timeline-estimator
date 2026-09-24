import "server-only";

import {
  estimateTotalRow,
  isGeneratedDescription,
  findPackagesSubform,
  packageRows,
  type DealFieldMeta,
  type EstimateTotal,
  type PackageInput,
  type PackagesLayout,
  type SubformFieldMeta,
} from "@/lib/zoho/deal-packages";
import { zohoFetch } from "@/lib/zoho/tokens";

/**
 * Putting an estimate's content onto a Deal: the Packages rows, and (for pushes)
 * the description.
 *
 * Shared by "Create deal" and "Push to Zoho" so both behave identically.
 *
 * **Two modes, because "never overwrite" was too strong.** The default still
 * skips anything the deal already has — a subform write replaces every row, so
 * an import or a stage change must never silently drop lines sales typed by
 * hand. But that also made the estimate's price a write-once value: `Amount` is
 * derived from the Packages rows, so a deal that already had rows could never be
 * repriced from the app, and editing an estimate did nothing to its deal.
 *
 * So the send dialog passes `replace`. It is the one caller that shows the
 * deal's current amount and row count first and asks, which is the only thing
 * that makes overwriting a production CRM defensible. Everything else — import,
 * the status changer, "mark complete" — keeps the safe default.
 *
 * The Description is narrower still: `replace` only rewrites a description this
 * app itself wrote (recognised by its `Estimate: … line item…` roll-up line).
 * Free text on a deal is far more likely to be a person's own words than a
 * subform row is, and there is no undo.
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
  /** Rows that were on the deal and got overwritten (`replace` only). */
  packagesReplaced: number;
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
  input: {
    products: PackageInput[];
    description?: string | null;
    /**
     * The estimate's own total. Used when no CRM products were picked, so the
     * quote's price still reaches the deal — Zoho derives `Amount` from these
     * rows and ignores any direct write to it.
     */
    total?: EstimateTotal | null;
    /**
     * Overwrite rows that are already on the deal. Only the send dialog sets
     * this, and only after showing what is there — see the file header.
     */
    replace?: boolean;
  },
): Promise<EstimateSyncResult> {
  const out: EstimateSyncResult = {
    packagesWritten: 0,
    descriptionWritten: false,
    packagesReplaced: 0,
    warnings: [],
  };
  // A priced row either way: one per product, or a single row for the estimate
  // total. Without this, a quote with no products sent no price at all.
  const totalOnly = !input.products.length && (input.total?.amount ?? 0) > 0;
  const wantsPackages = input.products.length > 0 || totalOnly;
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

  // Hoisted so the success path can report the real row count, but only built
  // when there is a layout to build it against — `estimateTotalRow` reads the
  // layout's columns and would throw on the unresolved-subform path, which is
  // precisely the path that has to degrade quietly.
  const rows =
    layout && wantsPackages
      ? totalOnly
        ? [estimateTotalRow(layout, input.total!)]
        : packageRows(layout, input.products)
      : [];

  if (layout && wantsPackages) {
    const existing = current[layout.apiName];
    const found = Array.isArray(existing) ? existing.length : 0;
    if (found && !input.replace) {
      out.warnings.push(
        `The deal already has ${found} ${layout.apiName} row${
          found === 1 ? "" : "s"
        } — left as they are.`,
      );
    } else {
      // Zoho deletes any row not present in the payload, so this IS the whole
      // table. That is why `replace` is gated on a dialog that showed the count.
      payload[layout.apiName] = rows;
      out.packagesReplaced = found;
    }
  }

  if (wantsDescription) {
    const existing = current.Description;
    const occupied = typeof existing === "string" && existing.trim().length > 0;
    if (occupied && !(input.replace && isGeneratedDescription(existing as string))) {
      out.warnings.push(
        input.replace
          ? "The deal's description looks hand-written, so it was left as it is."
          : "The deal already has a description — left as it is.",
      );
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
      // The rows actually sent — `products.length` is 0 for a total-only write,
      // which made the toast say nothing had been written when a price had.
      if (payload[layout?.apiName ?? ""]) {
        out.packagesWritten = rows.length;
        // ── Confirm the subform was REPLACED, not appended to ──
        // A subform PUT with rows that carry no `id` is documented to replace
        // the table, and that is what the price depends on: Zoho recomputes
        // `Amount` by summing these rows. If it ever appended instead, the deal
        // would quietly show double the estimate and this call would still
        // report success. One read turns that into a visible warning.
        if (out.packagesReplaced && layout) {
          try {
            const check = await zohoFetch(
              `/crm/v2/Deals/${dealId}?fields=${encodeURIComponent(layout.apiName)}`,
            );
            const after = (await check.json().catch(() => null))?.data?.[0]?.[
              layout.apiName
            ];
            const n = Array.isArray(after) ? after.length : null;
            if (n !== null && n !== rows.length) {
              out.warnings.push(
                `The deal now has ${n} ${layout.apiName} rows but ${rows.length} were sent — check the deal's Amount in Zoho.`,
              );
            }
          } catch {
            // Best effort. The write already succeeded; failing to verify it is
            // not a reason to report the write as failed.
          }
        }
      }
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
