import { NextResponse } from "next/server";

import { estherConfigured, requireEstimator } from "@/lib/esther/estimate/server";

/** Is "Let Esther estimate" available? The New-estimate chooser asks before offering it. */
export async function GET() {
  const gate = await requireEstimator();
  if (gate) return gate.error;
  return NextResponse.json({ ready: estherConfigured() });
}
