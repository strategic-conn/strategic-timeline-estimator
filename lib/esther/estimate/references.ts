import { z } from "zod";

import { RESPONSIBLE_ROLES } from "@/lib/pricing/hourly-rates";

import { anonymize, rankByWords } from "./history";
import { ESTHER_PLATFORMS } from "./types";

/**
 * Past estimates uploaded for Esther (`esther_references`, 0055): the team's
 * old Word / Excel / CSV / PDF estimates from before this app. Each upload is
 * read ONCE by Claude into plain lines (`referenceExtractSchema`), cleaned here
 * (`referenceFromExtract`) and stored; every draft then shows Claude the most
 * similar few (`referencesPrompt`), next to the approved estimates in the app.
 * Pure — `e2e/esther-references.spec.ts`.
 */

const PLATFORM_OR_UNKNOWN = [...ESTHER_PLATFORMS, "unknown"] as const;
const ROLE_OR_NONE = [...RESPONSIBLE_ROLES, ""] as const;

/** What Claude returns for one uploaded file. No unions: structured outputs cap them. */
export const referenceExtractSchema = z.object({
  is_estimate: z.boolean(),
  title: z.string(),
  platform: z.enum(PLATFORM_OR_UNKNOWN),
  summary: z.string(),
  /** Every client / company / person name in the file — removed before anything is stored. */
  client_names: z.array(z.string()),
  lines: z.array(
    z.object({
      title: z.string(),
      phase: z.string(),
      /** Total hours for the line (quantity included). */
      hours: z.number(),
      quantity: z.number(),
      role: z.enum(ROLE_OR_NONE),
    }),
  ),
});
export type ReferenceExtract = z.infer<typeof referenceExtractSchema>;

export type ReferenceLine = { title: string; phase: string; hours: number; quantity: number; role: string };

/** One row of `esther_references`. */
export type EstherReference = {
  id: string;
  title: string;
  file_name: string;
  platform: string | null;
  summary: string;
  lines: ReferenceLine[];
  total_hours: number;
  created_at: string;
};

export const MAX_REFERENCE_LINES = 200;
const MAX_PROMPT_REFERENCES = 3;
const MAX_PROMPT_LINES = 40;

const clampHours = (n: number) => Math.min(2000, Math.max(0, Math.round((Number.isFinite(n) ? n : 0) * 4) / 4));

/**
 * Claude's reading of a file → the row to store. Names are removed from every
 * field with the same `anonymize` the in-app history uses; hours are clamped
 * to quarter hours (0–2000); lines without a title or hours are dropped.
 * Returns null when the file isn't an estimate or has no usable lines.
 */
export function referenceFromExtract(
  x: ReferenceExtract,
  fileName: string,
): Omit<EstherReference, "id" | "created_at"> | null {
  if (!x.is_estimate) return null;
  const names = x.client_names
    .map((n) => n.trim())
    .filter((n) => n.length >= 2)
    .sort((a, b) => b.length - a.length);
  const clean = (s: string, max: number) => anonymize(s, names).slice(0, max);
  const lines = x.lines
    .map((l) => ({
      title: clean(l.title, 200),
      phase: clean(l.phase, 80),
      hours: clampHours(l.hours),
      quantity: Math.max(1, Math.round(Number.isFinite(l.quantity) ? l.quantity : 1)),
      role: l.role,
    }))
    .filter((l) => l.title && l.hours > 0)
    .slice(0, MAX_REFERENCE_LINES);
  if (!lines.length) return null;
  const total = Math.round(lines.reduce((s, l) => s + l.hours, 0) * 4) / 4;
  return {
    title: clean(x.title, 200) || fileName.replace(/\.[^.]+$/, "").slice(0, 200) || "Past estimate",
    file_name: fileName.slice(0, 300),
    platform: x.platform === "unknown" ? null : x.platform,
    summary: clean(x.summary, 2000),
    lines,
    total_hours: total,
  };
}

/** The uploads closest to the new brief: same platform or unstated, most shared words first. */
export function pickReferences(refs: EstherReference[], platform: string, briefText: string): EstherReference[] {
  const eligible = refs.filter((r) => r.platform == null || r.platform === platform);
  return rankByWords(
    eligible,
    (r) => `${r.summary} ${r.lines.map((l) => `${l.title} ${l.phase}`).join(" ")}`,
    (r) => r.created_at,
    briefText,
    MAX_PROMPT_REFERENCES,
  );
}

/** The prompt section, or "" with nothing to show. Numbered, never titled. */
export function referencesPrompt(refs: EstherReference[]): string {
  if (!refs.length) return "";
  const blocks = refs.map((r, i) => {
    const lines = r.lines.slice(0, MAX_PROMPT_LINES).map(
      (l) =>
        `  - ${l.title}${l.phase ? ` [${l.phase}]` : ""} · ${l.hours} h${l.quantity > 1 ? ` (× ${l.quantity})` : ""}${l.role ? ` · ${l.role}` : ""}`,
    );
    const more = r.lines.length > MAX_PROMPT_LINES ? `\n  … ${r.lines.length - MAX_PROMPT_LINES} more lines` : "";
    return `Uploaded estimate ${i + 1} — ${r.platform ?? "platform not stated"}, ${r.lines.length} lines, ${r.total_hours} h${r.summary ? `\n  What it was: ${r.summary}` : ""}\n${lines.join("\n")}${more}`;
  });
  return `Estimates the team wrote before this app (uploaded by the team; client names removed). They show how the agency's own developers break work down and size it. Use them the same way as the approved estimates — task breakdown and realistic hours for the same kinds of requests — but only for work the new client actually asks for, and still prefer catalog rows where one fits:\n\n${blocks.join("\n\n")}`;
}
