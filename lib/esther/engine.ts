/**
 * Esther's mock analysis engine — deterministic, offline, frontend-only.
 *
 * Given a brief, it scores the brief against the real platform catalog
 * (lib/proposal-catalog), picks a believable scope, infers tiers/quantities,
 * and reuses the actual estimator math (lib/constants/proposal-estimator) so the
 * numbers match what the Proposals editor would compute. No network, no AI — this
 * is the seam a real model/Edge Function replaces later.
 */
import {
  DEFAULT_ADDONS,
  computeLineHours,
  computeQuoteTotals,
  roundHours,
} from "@/lib/constants/proposal-estimator";
import {
  PROPOSAL_PLATFORM_OPTIONS,
  catalogForPlatform,
  platformLabel,
  type CatalogItem,
  type ProposalPlatform,
} from "@/lib/proposal-catalog";
import type {
  EstherAnalysis,
  EstherLineItem,
  EstherTimelinePhase,
} from "@/types/esther.types";
import type { ProposalTier } from "@/types/proposal.types";

/** Productive hours/week assumed when turning effort into a calendar timeline. */
const WEEKLY_THROUGHPUT = 32;

const PHASE_PLAN: { name: string; weight: number }[] = [
  { name: "Discovery & planning", weight: 0.1 },
  { name: "Design", weight: 0.2 },
  { name: "Build", weight: 0.45 },
  { name: "QA & revisions", weight: 0.15 },
  { name: "Launch", weight: 0.1 },
];

/** Catalog item names that form a sensible baseline even for a vague brief. */
const BASELINE_NAME_HINTS = [
  "hero",
  "footer",
  "standard page",
  "contact",
  "form setup",
  "on-page seo",
  "basic seo",
];

const STOPWORDS = new Set([
  "the","a","an","and","or","of","for","to","with","in","on","we","our","need",
  "want","would","like","please","site","website","page","pages","build","new",
  "client","project","is","are","be","that","this","it","they","them","their",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

function detectPlatform(text: string, fallback: ProposalPlatform): ProposalPlatform {
  const t = text.toLowerCase();
  if (/\bshopify\b/.test(t)) return "shopify";
  if (/\bwoo|wordpress|\bwp\b/.test(t)) return "wordpress";
  if (/\bsquarespace\b/.test(t)) return "squarespace";
  if (/\bwix\b/.test(t)) return "wix";
  if (/next\.?js|react/.test(t)) return "react_next";
  if (/\bphp|laravel|html\s*\/?\s*css\b/.test(t)) return "php";
  return fallback;
}

/** Global complexity lean inferred from the brief's language. */
function detectComplexity(text: string): "low" | "mid" | "high" {
  const t = text.toLowerCase();
  if (/\b(custom|bespoke|complex|enterprise|advanced|integrat|dynamic|portal|dashboard)\b/.test(t))
    return "high";
  if (/\b(simple|basic|mvp|landing|brochure|quick|minimal)\b/.test(t)) return "low";
  return "mid";
}

/** Per-item tier from the item's own labels, nudged by the brief's overall complexity. */
function tierForItem(item: CatalogItem, complexity: "low" | "mid" | "high"): ProposalTier {
  const label = `${item.module} ${item.name}`.toLowerCase();
  const heavy = /(advanced|dynamic|custom|complex|integration|api|multi-)/.test(label);
  if (heavy) return complexity === "high" ? "custom" : "advanced";
  if (complexity === "high") return "advanced";
  return "basic";
}

function firstNumberBefore(text: string, unit: RegExp): number | null {
  const re = new RegExp(`(\\d{1,3})\\s*(?:${unit.source})`, "i");
  const m = re.exec(text);
  return m ? Number(m[1]) : null;
}

function quantityForItem(item: CatalogItem, text: string): number {
  const label = `${item.module} ${item.name}`.toLowerCase();
  if (/page/.test(label)) {
    const n = firstNumberBefore(text, /pages?/);
    if (n && n > 1) return Math.min(n, 40);
  }
  if (/product/.test(label)) {
    const n = firstNumberBefore(text, /products?|skus?/);
    if (n && n > 1) return Math.min(n, 200);
  }
  return 1;
}

function extractClientName(text: string): string | undefined {
  const explicit = /client[:\s-]+([A-Z][\w&'.-]+(?:\s+[A-Z][\w&'.-]+){0,2})/.exec(text);
  if (explicit) return explicit[1].trim();
  const forName = /\bfor\s+([A-Z][\w&'.-]+(?:\s+[A-Z][\w&'.-]+){0,2})\b/.exec(text);
  if (forName) return forName[1].trim();
  return undefined;
}

function deriveTitle(text: string, fileName: string | undefined, platform: ProposalPlatform): string {
  if (fileName) {
    const base = fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
    if (base) return `${base.charAt(0).toUpperCase()}${base.slice(1)}`;
  }
  const firstLine = text.split(/[.\n]/)[0]?.trim() ?? "";
  if (firstLine.length >= 8) {
    const words = firstLine.split(/\s+/).slice(0, 7).join(" ");
    return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
  }
  return `${platformLabel(platform)} website estimate`;
}

/** Score + select catalog rows that best match the brief, always returning a usable scope. */
function selectScope(items: CatalogItem[], text: string): CatalogItem[] {
  const tokens = tokenize(text);
  const scored = items.map((item) => {
    const haystack = tokenize(`${item.name} ${item.module} ${item.description}`);
    let score = 0;
    for (const tok of tokens) if (haystack.has(tok)) score += 2;
    if (BASELINE_NAME_HINTS.some((h) => item.name.toLowerCase().includes(h))) score += 1;
    return { item, score };
  });

  const matched = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.item.id - b.item.id)
    .map((s) => s.item);

  // Cap the scope, then guarantee a minimum sensible size with baseline rows.
  const picked = matched.slice(0, 14);
  if (picked.length < 6) {
    const have = new Set(picked.map((i) => i.id));
    for (const item of items) {
      if (picked.length >= 8) break;
      if (have.has(item.id)) continue;
      if (BASELINE_NAME_HINTS.some((h) => item.name.toLowerCase().includes(h))) {
        picked.push(item);
        have.add(item.id);
      }
    }
    for (const item of items) {
      if (picked.length >= 6) break;
      if (!have.has(item.id)) {
        picked.push(item);
        have.add(item.id);
      }
    }
  }
  // Keep catalog order for a tidy, grouped-feeling scope.
  return picked.sort((a, b) => a.id - b.id);
}

function buildTimeline(grandHours: number): {
  totalWeeks: number;
  timeline: EstherTimelinePhase[];
} {
  if (grandHours <= 0) return { totalWeeks: 0, timeline: [] };
  let cursor = 1;
  const timeline: EstherTimelinePhase[] = PHASE_PLAN.map((phase) => {
    const hours = roundHours(grandHours * phase.weight);
    const weeks = Math.max(1, Math.round(hours / WEEKLY_THROUGHPUT));
    const startWeek = cursor;
    const endWeek = cursor + weeks - 1;
    cursor = endWeek + 1;
    return { name: phase.name, hours, startWeek, endWeek, share: phase.weight };
  });
  return { totalWeeks: cursor - 1, timeline };
}

export interface AnalyzeInput {
  text: string;
  /** Defaults the platform when the brief doesn't name one. */
  platform?: ProposalPlatform;
  fileName?: string;
}

/** Turn a brief into a full estimate + timeline + proposal-ready line items. */
export function analyzeBrief({ text, platform, fileName }: AnalyzeInput): EstherAnalysis {
  const fallback = platform ?? "react_next";
  const resolvedPlatform = detectPlatform(text, fallback);
  const complexity = detectComplexity(text);

  const catalog = catalogForPlatform(resolvedPlatform);
  const scope = selectScope(catalog, text);

  const lineItems: EstherLineItem[] = scope.map((item) => {
    const tier = tierForItem(item, complexity);
    const quantity = quantityForItem(item, text);
    return {
      catalog_id: item.id,
      title: item.name,
      module: item.module,
      category_id: item.category_id,
      base_hours: item.base_hours,
      tier,
      quantity,
      hours: computeLineHours(item.base_hours, tier, quantity),
    };
  });

  const devHours = roundHours(lineItems.reduce((s, li) => s + li.hours, 0));
  const totals = computeQuoteTotals(devHours, DEFAULT_ADDONS);
  const { totalWeeks, timeline } = buildTimeline(totals.grandHours);

  const platformName = platformLabel(resolvedPlatform);
  const summary =
    `Based on the brief, I scoped ${lineItems.length} work items on ${platformName}. ` +
    `Estimated effort is ${totals.grandHours} hours (~${totalWeeks} weeks) including design, ` +
    `QA and PM add-ons. Complexity reads as ${complexity}.`;

  const assumptions = [
    "Tiers reflect complexity inferred from the brief — fine-tune them in the proposal editor.",
    "Includes one round of revisions per phase; extra rounds are out of scope.",
    "Content, copy and brand assets are provided by the client.",
    `Timeline assumes ~${WEEKLY_THROUGHPUT} productive hours/week of capacity.`,
  ];

  return {
    suggestedTitle: deriveTitle(text, fileName, resolvedPlatform),
    clientName: extractClientName(text),
    platform: resolvedPlatform,
    summary,
    assumptions,
    lineItems,
    totals,
    totalWeeks,
    timeline,
  };
}

/** Classify a message so the chat can answer briefs vs. small talk vs. refinements. */
export function classifyMessage(
  text: string,
  hasAttachment: boolean,
  hasPriorAnalysis: boolean,
): "analyze" | "smalltalk" | "refine" {
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  if (hasAttachment) return "analyze";
  if (words >= 8) return "analyze";
  if (hasPriorAnalysis) return "refine";
  return "smalltalk";
}

export function isKnownPlatform(value: string): value is ProposalPlatform {
  return PROPOSAL_PLATFORM_OPTIONS.some((p) => p.value === value);
}
