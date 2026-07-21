/**
 * Per-person skill / tech-stack profile. Decoupled from `role` — any member
 * (admin included) can have skills. `confidence` is a 1–5 self/assessed rating
 * shown as stars. Backed by the `member_skills` table (demo: localStorage).
 */
export interface MemberSkill {
  skill: string;
  /** 1–5 (stars). */
  confidence: number;
}

export const MIN_CONFIDENCE = 1;
export const MAX_CONFIDENCE = 5;
export const DEFAULT_CONFIDENCE = 3;

export function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_CONFIDENCE;
  return Math.min(MAX_CONFIDENCE, Math.max(MIN_CONFIDENCE, Math.round(n)));
}

/** Normalized key for case-insensitive dedupe (display keeps the entered casing). */
export function skillKey(skill: string): string {
  return skill.trim().toLowerCase();
}
