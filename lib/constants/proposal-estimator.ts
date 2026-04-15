import type { ProposalComplexity } from "@/types/proposal.types";

/** Fixed hours per complexity tier (demo — replace with API config later). */
export const COMPLEXITY_HOURS: Record<ProposalComplexity, number> = {
  easy: 2,
  medium: 4,
  complex: 8,
  very_complex: 16,
};

export const COMPLEXITY_OPTIONS: {
  value: ProposalComplexity;
  label: string;
}[] = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "complex", label: "Complex" },
  { value: "very_complex", label: "Very complex" },
];

export function hoursForComplexity(c: ProposalComplexity): number {
  return COMPLEXITY_HOURS[c];
}
