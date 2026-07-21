import { NextResponse } from "next/server";

import { isUuid, requireAdmin, serverError } from "@/lib/supabase/require-admin";

/**
 * POST /api/users/[id]/status  { deactivate: boolean } — admin-only.
 * Deactivate = ban the auth user (real access revocation) + flag the profile.
 * Reactivate = un-ban + clear the flag. Their data/history stays attributed.
 * Guard: can't deactivate yourself or the last remaining active admin.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
    }

    const gate = await requireAdmin();
    if ("error" in gate) return gate.error;
    const { supabase, admin, user } = gate.ctx;

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

    // Don't let the workspace lose its last way in: block deactivating the only
    // active admin. (Swap admins by promoting someone else first.)
    if (deactivate) {
      const { data: target } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", id)
        .single();
      if (target?.role === "admin") {
        const { count } = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin")
          .is("deactivated_at", null);
        if ((count ?? 0) <= 1) {
          return NextResponse.json(
            {
              error:
                "This is the last active admin — promote another admin before deactivating this one.",
            },
            { status: 400 },
          );
        }
      }
    }

    // The real lock: ban (revokes sessions on refresh) or un-ban.
    const { error: banErr } = await admin.auth.admin.updateUserById(id, {
      ban_duration: deactivate ? "876000h" : "none",
    });
    if (banErr) {
      return serverError("/api/users/[id]/status ban", banErr, 400);
    }

    const { error: flagErr } = await supabase
      .from("profiles")
      .update({ deactivated_at: deactivate ? new Date().toISOString() : null })
      .eq("id", id);
    if (flagErr) {
      return serverError("/api/users/[id]/status flag", flagErr, 400);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError("/api/users/[id]/status", e);
  }
}
