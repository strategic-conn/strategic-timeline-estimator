import "server-only";

import { NextResponse } from "next/server";

import { requireAdmin, serverError } from "@/lib/supabase/require-admin";
import { deleteConnection } from "@/lib/zoho/tokens";

/** Admin-only. Removes the stored connection (tokens). */
export async function POST() {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const { error } = await deleteConnection();
  if (error) return serverError("zoho disconnect", error);
  return NextResponse.json({ ok: true });
}
