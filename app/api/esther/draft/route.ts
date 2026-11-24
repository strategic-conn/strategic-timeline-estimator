import { NextResponse } from "next/server";

import {
  askEsther,
  draftTask,
  loadHistory,
  EstherError,
  errorResponse,
  readDocument,
  requireEstimator,
  todayIso,
} from "@/lib/esther/estimate/server";
import {
  confirmedAnswersSchema,
  draftResultSchema,
  scanResultSchema,
} from "@/lib/esther/estimate/types";

export const maxDuration = 300;

/**
 * Step 2: the same document again (sent in full: it is a different model from the scan, so nothing is cached between them) plus the
 * scan and the coordinator's confirmed answers → line items, assumptions and
 * open questions. Writes nothing; the browser builds the estimate from it.
 */
export async function POST(req: Request) {
  const gate = await requireEstimator();
  if (gate) return gate.error;
  try {
    const form = await req.formData();
    const json = (field: string): unknown => {
      try {
        return JSON.parse(String(form.get(field) ?? ""));
      } catch {
        return null;
      }
    };
    const scan = scanResultSchema.safeParse(json("scan"));
    const answers = confirmedAnswersSchema.safeParse(json("answers"));
    if (!scan.success || !answers.success) {
      throw new EstherError("bad_input", "Some answers were missing. Go back and check them.");
    }
    const doc = await readDocument(form);
    // This workspace's approved estimates + finished-task hours, client names removed.
    const history = await loadHistory(
      answers.data.platform,
      scan.data.requirements.map((r) => r.text).join(" "),
    );
    const draft = await askEsther({
      doc,
      task: draftTask(todayIso(), scan.data, answers.data, answers.data.platform, history.prompt),
      schema: draftResultSchema,
      step: "draft",
      signal: req.signal,
    });
    return NextResponse.json({ draft, history: { used: history.used, actuals: history.actuals, references: history.references ?? 0 } });
  } catch (e) {
    return errorResponse(e);
  }
}
