/**
 * Sorts scope assumptions into the groups a reader looks for — what's
 * included, what the client provides, what's still to confirm, what's not
 * included — so the list can be scanned instead of read. The view groups any
 * stored list; saving from the editor stores it in group order, with a short
 * marker on a line whose wording alone wouldn't land in the group it was put
 * in. The PDF and Excel print the stored lines. Pure — `e2e/assumption-groups.spec.ts`.
 *
 * ponytail: keyword rules, not a model. An assumption that matches nothing is
 * "Included", which is the safe reading. The editor keeps a line in the group
 * it was put in with a short marker (`toStored`), so the rules never override
 * the coordinator.
 */

export type AssumptionGroup = "confirm" | "client" | "included" | "excluded";

export const ASSUMPTION_GROUPS: { id: AssumptionGroup; label: string }[] = [
  { id: "included", label: "Included" },
  { id: "client", label: "The client provides" },
  { id: "confirm", label: "Still to confirm with the client" },
  { id: "excluded", label: "Not included" },
];

/** "(assumed, not confirmed)" and friends — the group heading says it instead. */
const UNCONFIRMED = /\s*\((?:assumed|to (?:be )?confirm(?:ed)?|not (?:yet )?confirmed|tbc)[^)]*\)/gi;

/** A marker that names the group outright — written by the editor (`toStored`). */
const MARKER: [AssumptionGroup, RegExp][] = [
  ["included", /^included:\s*/i],
  ["excluded", /^not included:\s*/i],
  ["client", /^(?:the )?client provides:\s*/i],
];

const RULES: [AssumptionGroup, RegExp][] = [
  ...MARKER,
  ["confirm", /\((?:assumed|to (?:be )?confirm|not (?:yet )?confirmed|tbc)|\bnot (?:yet )?confirmed\b|\bto be confirmed\b|\bassumed to\b|\bare assumed\b|\bis assumed\b/i],
  ["excluded", /^(?:not included|excluded|out of scope)\b|\bnot included\b|\bare not included\b|\bis not included\b|\bisn't included\b|\baren't included\b|\bnot part of\b|\bout of scope\b|\bscoped separately\b|\bnot in (?:this|the) project\b|\bno (?:redesign|new|ongoing)\b|\bexcludes?\b/i],
  ["client", /^(?:the )?client (?:will )?(?:supply|supplies|provide|provides|send|sends|deliver|delivers|is responsible|opens|pays)\b|\bprovided by the client\b|\bclient[- ]supplied\b|\bclient supplies\b|\bclient provides\b/i],
];

/** The text without its group marker, for showing under that group's heading. */
export function withoutMarker(text: string): string {
  let out = text;
  for (const [, re] of MARKER) out = out.replace(re, "");
  out = out.replace(UNCONFIRMED, "").trim();
  return out ? out[0].toUpperCase() + out.slice(1) : out;
}

/**
 * The line to store for an assumption the coordinator put in `group`. If its
 * wording already lands there, it's stored as typed; otherwise a short marker
 * is added so it stays in the group it was put in ("Not included: …").
 */
export function toStored(group: AssumptionGroup, text: string): string {
  const t = text.trim();
  if (!t || groupOf(t) === group) return t;
  const bare = withoutMarker(t);
  switch (group) {
    case "included":
      return `Included: ${bare}`;
    case "excluded":
      return `Not included: ${bare}`;
    case "client":
      return `Client provides: ${bare}`;
    case "confirm":
      return `${bare} (to confirm)`;
  }
}

export function groupOf(text: string): AssumptionGroup {
  for (const [group, re] of RULES) if (re.test(text)) return group;
  return "included";
}

/** Assumptions grouped in display order; empty groups are left out. */
export function groupAssumptions(items: string[]): { id: AssumptionGroup; label: string; items: string[] }[] {
  const by = new Map<AssumptionGroup, string[]>();
  for (const raw of items) {
    const text = raw.trim();
    if (!text) continue;
    const g = groupOf(text);
    const shown = withoutMarker(text);
    by.set(g, [...(by.get(g) ?? []), shown]);
  }
  return ASSUMPTION_GROUPS.filter((g) => by.has(g.id)).map((g) => ({ ...g, items: by.get(g.id)! }));
}
