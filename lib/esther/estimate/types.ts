import { z } from "zod";

import { RESPONSIBLE_ROLES } from "@/lib/pricing/hourly-rates";

/**
 * "Let Esther estimate" — what crosses the wire between the browser and the
 * two server routes (`/api/esther/scan`, `/api/esther/draft`).
 *
 * Shared by both sides, so it holds no server code. Each Claude reply is
 * checked against these Zod schemas before anything uses it: structured
 * outputs guarantee the SHAPE, but a catalog id, a role or an hour count still
 * has to be checked against this app's data (see `build.ts`).
 */

export const ESTHER_PLATFORMS = [
  "wordpress",
  "shopify",
  "wix",
  "squarespace",
  "php",
  "react_next",
  "custom",
] as const;

export const ESTHER_GOALS = [
  "lead_gen",
  "ecommerce",
  "brand_awareness",
  "recruiting",
  "customer_portal",
  "event_registration",
  "other",
] as const;

export const ESTHER_REGULATED = ["healthcare", "finance", "legal", "education", "other"] as const;

/** Where a value came from. Drives the green / amber / "please answer" tags. */
export const SOURCES = ["document", "guess", "none"] as const;
export type Source = (typeof SOURCES)[number];

/** Limits shared by the dropzone and the routes. Vercel caps a request at 4.5 MB. */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_TEXT_CHARS = 300_000;
export const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".xls", ".csv", ".txt", ".md"] as const;
export const ACCEPTED_LABEL = "Esther reads PDF, Word (.docx), Excel (.xlsx), CSV and text files.";

// Quotes and suggestions are "" when empty, not null: structured outputs allow at
// most 16 nullable fields per schema, and every value here already is one.
const sourced = <T extends z.ZodTypeAny>(value: T) =>
  z.object({ value, source: z.enum(SOURCES), quote: z.string() });

export const scanResultSchema = z.object({
  project_title: z.string(),
  client_name: z.string().nullable(),
  summary: z.string(),
  platform: sourced(z.enum(ESTHER_PLATFORMS).nullable()),
  primary_goal: sourced(z.enum(ESTHER_GOALS).nullable()),
  is_redesign: sourced(z.boolean().nullable()),
  current_url: sourced(z.string().nullable()),
  regulated_industry: sourced(z.boolean().nullable()),
  regulated_type: sourced(z.enum(ESTHER_REGULATED).nullable()),
  start_date: sourced(z.string().nullable()),
  hard_deadline: sourced(z.string().nullable()),
  review_days: sourced(z.number().nullable()),
  blackout: sourced(z.boolean().nullable()),
  blackout_notes: sourced(z.string().nullable()),
  requirements: z
    .array(z.object({ id: z.string(), area: z.string(), text: z.string(), quote: z.string() })),
  questions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      why: z.string(),
      kind: z.enum(["choice", "number", "yes_no", "text"]),
      options: z.array(z.string()),
      suggested: z.string(),
    }),
  ),
});
export type ScanResult = z.infer<typeof scanResultSchema>;
export type ScanQuestion = ScanResult["questions"][number];
export type ScanRequirement = ScanResult["requirements"][number];

export const draftLineSchema = z.object({
  catalog_id: z.number().int().nullable(),
  title: z.string(),
  base_hours: z.number(),
  responsible: z.enum(RESPONSIBLE_ROLES),
  level: z.union([z.literal(1), z.literal(2)]),
  tier: z.enum(["basic", "advanced", "custom"]),
  quantity: z.number().int(),
  /** Catalog lines only: per-unit hours backed by finished-task history, else null. */
  adjusted_hours: z.number().nullable(),
  requirement_ids: z.array(z.string()),
  note: z.string(),
});
export type DraftLine = z.infer<typeof draftLineSchema>;

export const draftResultSchema = z.object({
  lines: z.array(draftLineSchema).min(1),
  assumptions: z.array(z.string()),
  open_questions: z.array(z.string()),
  requirements_unclear: z.boolean(),
});
export type DraftResult = z.infer<typeof draftResultSchema>;

/**
 * What the coordinator confirmed in the conversation with Esther (EstherDetails). Sent with
 * the draft request (so Esther prices what was agreed, not what she guessed)
 * and written onto the estimate (Setup's context + the Adjust tab's schedule).
 */
export const confirmedAnswersSchema = z.object({
  title: z.string().min(1).max(200),
  client_name: z.string().max(200),
  platform: z.enum(ESTHER_PLATFORMS),
  primary_goal: z.enum(ESTHER_GOALS).nullable(),
  is_redesign: z.boolean(),
  current_url: z.string().max(500),
  regulated_industry: z.boolean(),
  regulated_type: z.enum(ESTHER_REGULATED).nullable(),
  start_date: z.string().max(10), // YYYY-MM-DD or "" = as soon as approved
  hard_deadline: z.string().max(10), // YYYY-MM-DD or "" = none
  review_days: z.number().int().min(1).max(30),
  blackout: z.boolean(),
  blackout_notes: z.string().max(1000),
  /** Esther's own questions: id → the answer as text ("" = "not sure, assume"). */
  extra: z.record(z.string(), z.string().max(1000)),
});
export type ConfirmedAnswers = z.infer<typeof confirmedAnswersSchema>;

/** Kept on the estimate (`proposals.context.esther`) so reviewers see where the draft came from. */
export interface EstherDraftMeta {
  file_name: string;
  drafted_at: string;
  summary: string;
  requirements: ScanRequirement[];
  /** Requirement ids no line covers — shown to the reviewer as "not priced". */
  uncovered: string[];
  open_questions: string[];
  /** The past approved estimates Esther was shown (ids, for "Based on" links). */
  based_on?: string[];
  /** How many uploaded past estimates (Settings → Esther's past estimates) she was shown. */
  references_used?: number;
}

/** The errors the routes return, so the UI can say something useful for each. */
export type EstherErrorCode =
  | "not_configured"
  | "bad_input"
  | "too_large"
  | "unreadable"
  | "refused"
  | "busy"
  | "failed";
