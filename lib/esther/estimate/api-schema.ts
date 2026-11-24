import { z } from "zod";

/**
 * Zod → the JSON Schema subset structured outputs accept. Limits the API
 * rejects (min/max, lengths, item counts) are stripped here and re-checked by
 * Zod on the reply, so each schema is written once, in `types.ts`.
 */
const UNSUPPORTED = new Set([
  "$schema",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
]);

/** Zod → the JSON Schema subset structured outputs accept (limits are re-checked by Zod after). */
export function apiSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) if (!UNSUPPORTED.has(k)) out[k] = strip(v);
    if (out.type === "object") out.additionalProperties = false;
    // "enum or null" / "boolean or null" as one enum: same values, but no union.
    // Unions make the compiled grammar explode (the API rejects it as too large).
    const alts = out.anyOf as Record<string, unknown>[] | undefined;
    if (alts?.length === 2 && alts.some((a) => a.type === "null")) {
      const other = alts.find((a) => a.type !== "null")!;
      if (Array.isArray(other.enum)) return { enum: [...other.enum, null] };
      if (other.type === "boolean") return { enum: [true, false, null] };
    }
    return out;
  };
  return strip(z.toJSONSchema(schema)) as Record<string, unknown>;
}
