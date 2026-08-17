import "server-only";

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Gate for reading CRM data. Leads carry PII (names, phones, emails), so this is
 * limited to admin + manager — the same tier that can use the Estimator
 * (`canExportProposals`). Members/viewers get 403.
 */
/**
 * Gate for WRITING to the CRM (stage moves, attachments).
 *
 * Same admin+manager tier as reading today, but deliberately a separate named
 * gate: writes mutate a production CRM (~900 real deals), so the surface should
 * be greppable and tightenable without touching every read route.
 */
export async function requireZohoWriter(): Promise<
  { userId: string } | { error: NextResponse }
> {
  return requireZohoReader();
}

export async function requireZohoReader(): Promise<
  { userId: string } | { error: NextResponse }
> {
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
        { error: "Admins and managers only." },
        { status: 403 },
      ),
    };
  }
  return { userId: user.id };
}
