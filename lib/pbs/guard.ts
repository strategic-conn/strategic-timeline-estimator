import "server-only";

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Gates for the PBS (billing) routes.
 *
 * Same admin+manager tier as the Zoho routes and the Estimator itself
 * (`canExportProposals`), but deliberately its own named gate rather than
 * borrowing `requireZohoReader`: these routes reach a different production
 * system, and a PBS route failing with a Zoho-worded error would be a small lie
 * at exactly the wrong moment. Separate names also keep each write surface
 * greppable and tightenable on its own.
 */
async function requireManager(
  what: string,
): Promise<{ userId: string } | { error: NextResponse }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "You're not signed in." }, { status: 401 }),
    };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin" && profile?.role !== "manager") {
    return {
      error: NextResponse.json(
        { error: `Admins and managers only (${what}).` },
        { status: 403 },
      ),
    };
  }
  return { userId: user.id };
}

/** Reading PBS data — purchase orders carry client and billing information. */
export function requirePbsReader() {
  return requireManager("PBS billing data");
}

/** Creating a PO. Same tier today; separate so it can be tightened alone. */
export function requirePbsWriter() {
  return requireManager("creating a PO in PBS");
}
