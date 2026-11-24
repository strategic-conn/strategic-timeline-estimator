import { NextResponse } from "next/server";

import {
  askEsther,
  EstherError,
  errorResponse,
  readDocument,
  requireEstimator,
  scanTask,
  todayIso,
} from "@/lib/esther/estimate/server";
import { scanResultSchema } from "@/lib/esther/estimate/types";

// Reading a long PDF can take a minute or two.
export const maxDuration = 300;

/**
 * Step 1 of "Let Esther estimate": read the client's document and return what
 * it says (with sources), the requirements, and the questions it leaves open.
 * Writes nothing — the estimate is created in the browser after step 2.
 */
export async function POST(req: Request) {
  const gate = await requireEstimator();
  if (gate) return gate.error;
  try {
    const form = await req.formData();
    const doc = await readDocument(form);
    const note = String(form.get("note") ?? "").trim().slice(0, 1000);
    const scan = await askEsther({
      doc,
      task: scanTask(todayIso(), note),
      schema: scanResultSchema,
      step: "scan",
      signal: req.signal,
    });
    if (!scan.requirements.length) {
      throw new EstherError(
        "unreadable",
        "Esther couldn't find anything to estimate in that document. Check it's the client's scope, or paste the text.",
        422,
      );
    }
    return NextResponse.json({ scan, fileName: doc.name });
  } catch (e) {
    return errorResponse(e);
  }
}
