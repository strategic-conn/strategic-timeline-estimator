import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/users/[id]/status  { deactivate: boolean } — admin-only.
 * Deactivate = ban the auth user (real access revocation) + flag the profile.
 * Reactivate = un-ban + clear the flag. Their data/history stays attributed.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "You're not signed in." }, { status: 401 });
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Admins only." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as {
      deactivate?: boolean;
    } | null;
    const deactivate = body?.deactivate === true;

    if (deactivate && id === user.id) {
      return NextResponse.json(
        { error: "You can't deactivate your own account." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Not configured on the server (missing SUPABASE_SERVICE_ROLE_KEY)." },
        { status: 501 },
      );
    }

    // The real lock: ban (revokes sessions on refresh) or un-ban.
    const { error: banErr } = await admin.auth.admin.updateUserById(id, {
      ban_duration: deactivate ? "876000h" : "none",
    });
    if (banErr) {
      return NextResponse.json({ error: banErr.message }, { status: 400 });
    }

    const { error: flagErr } = await supabase
      .from("profiles")
      .update({ deactivated_at: deactivate ? new Date().toISOString() : null })
      .eq("id", id);
    if (flagErr) {
      return NextResponse.json({ error: flagErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/users/[id]/status] error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected server error." },
      { status: 500 },
    );
  }
}
