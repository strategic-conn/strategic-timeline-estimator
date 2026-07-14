import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * DELETE /api/users/[id] — admin-only, permanent. Deletes the auth user; the DB
 * cascades: their authored/owned rows anonymize to NULL ("Former member", via
 * 0020's on-delete-set-null), and assignments/reactions/time-entries/etc. drop.
 * Irreversible — the UI only offers this on already-deactivated members.
 */
export async function DELETE(
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
    if (id === user.id) {
      return NextResponse.json(
        { error: "You can't delete your own account." },
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

    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/users/[id]] delete error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected server error." },
      { status: 500 },
    );
  }
}
