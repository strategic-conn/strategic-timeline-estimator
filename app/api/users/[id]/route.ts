import { NextResponse } from "next/server";

import { isUuid, requireAdmin, serverError } from "@/lib/supabase/require-admin";

/**
 * DELETE /api/users/[id] — admin-only, permanent. Deletes the auth user; the DB
 * cascades: their authored/owned rows anonymize to NULL ("Former member", via
 * 0020's on-delete-set-null), and assignments/reactions/time-entries/etc. drop.
 * Irreversible. Server enforces the two-tier flow: the target must already be
 * deactivated, and the last admin account can't be deleted.
 */
export async function DELETE(
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

    if (id === user.id) {
      return NextResponse.json(
        { error: "You can't delete your own account." },
        { status: 400 },
      );
    }

    // Enforce the two-tier flow server-side (the UI only offers delete on
    // deactivated members; this closes the direct-API bypass). Orphan auth users
    // with no profile row are still deletable (cleanup).
    const { data: target } = await supabase
      .from("profiles")
      .select("role, deactivated_at")
      .eq("id", id)
      .single();

    if (target) {
      if (!target.deactivated_at) {
        return NextResponse.json(
          {
            error:
              "Deactivate this member before permanently deleting them.",
          },
          { status: 400 },
        );
      }
      if (target.role === "admin") {
        const { count } = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin");
        if ((count ?? 0) <= 1) {
          return NextResponse.json(
            { error: "You can't delete the last admin account." },
            { status: 400 },
          );
        }
      }
    }

    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      return serverError("/api/users/[id] delete", error, 400);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError("/api/users/[id] delete", e);
  }
}
