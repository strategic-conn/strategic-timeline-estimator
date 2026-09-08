/**
 * PBS purchase-order status codes.
 *
 * Live history uses five: B (440 of 500 POs), C (27), N (19), A (8), E (6).
 *
 * ⚠️ Only **N** is confirmed — the PBS web UI renders it "NEW". The rest are
 * shown as their raw code on purpose: a guessed label on a billing status is
 * worse than an unfamiliar letter, because it reads as authoritative. Fill
 * these in once someone confirms them in PBS.
 */
const LABELS: Record<string, string> = {
  N: "New",
};

/** How a status reads in the UI. Unknown codes show as `PBS status "X"`. */
export function poStatusLabel(code: string | null | undefined): string | null {
  const c = (code ?? "").trim().toUpperCase();
  if (!c) return null;
  return LABELS[c] ?? c;
}

/** True when the code has a confirmed meaning, so the UI can avoid implying one. */
export function poStatusKnown(code: string | null | undefined): boolean {
  return Boolean(LABELS[(code ?? "").trim().toUpperCase()]);
}
