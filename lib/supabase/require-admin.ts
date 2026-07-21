import "server-only";

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type AdminContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  admin: NonNullable<ReturnType<typeof createAdminClient>>;
  user: { id: string };
};

/**
 * Auth + admin gate + service-role client for the admin-only API routes
 * (invites, user status, user delete). One place to audit the authorization so
 * the three routes can't drift. Returns either the context or a ready
 * NextResponse to return immediately on failure (401 / 403 / 501).
 */
export async function requireAdmin(): Promise<
  { ctx: AdminContext } | { error: NextResponse }
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
  if (profile?.role !== "admin") {
    return { error: NextResponse.json({ error: "Admins only." }, { status: 403 }) };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      error: NextResponse.json(
        {
          error:
            "Not configured on the server (missing SUPABASE_SERVICE_ROLE_KEY).",
        },
        { status: 501 },
      ),
    };
  }

  return { ctx: { supabase, admin, user } };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

/**
 * Log the real error server-side and return a generic message to the client, so
 * raw Postgres/GoTrue internals never leak. Use for privileged-operation
 * failures (not for input-validation 400s, which stay specific + helpful).
 */
export function serverError(context: string, err: unknown, status = 500) {
  console.error(`[${context}]`, err);
  return NextResponse.json(
    { error: "Something went wrong on our end. Please try again." },
    { status },
  );
}
