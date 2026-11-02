import { NextResponse } from "next/server";

import { isUuid, requireAdmin, serverError } from "@/lib/supabase/require-admin";

/**
 * DELETE /api/users/[id]/mfa — admin-only. Removes every two-factor factor of
 * someone who lost their phone, so their password works on its own again (and
 * they can set up a new app from Settings → Security). Not for yourself: you
 * turn your own off in Settings, which needs your current code.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
    }
    const gate = await requireAdmin();
    if ("error" in gate) return gate.error;
    const { admin, user } = gate.ctx;
    if (id === user.id) {
      return NextResponse.json(
        { error: "Turn off your own two-factor in Settings → Security." },
        { status: 400 },
      );
    }

    const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: id });
    if (error) return serverError("/api/users/[id]/mfa list", error, 400);
    for (const f of data.factors) {
      const { error: delErr } = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: id });
      if (delErr) return serverError("/api/users/[id]/mfa delete", delErr, 400);
    }
    return NextResponse.json({ ok: true, removed: data.factors.length });
  } catch (e) {
    return serverError("/api/users/[id]/mfa", e);
  }
}
