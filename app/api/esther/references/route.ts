import { NextResponse } from "next/server";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import {
  askEsther,
  EstherError,
  errorResponse,
  readDocument,
  referenceTask,
  requireEstimator,
} from "@/lib/esther/estimate/server";
import { referenceExtractSchema, referenceFromExtract } from "@/lib/esther/estimate/references";

// A long spreadsheet can take a minute to read.
export const maxDuration = 300;

const TABLE = "esther_references" as never;
const COLUMNS = "id,title,file_name,platform,summary,lines,total_hours,created_at";

/**
 * Past estimates for Esther (Settings → Workspace → Esther's past estimates).
 * GET lists them, POST reads one uploaded file with Claude (once) and stores
 * its lines with names removed, DELETE removes one. Listing is admin +
 * manager; uploading and deleting are admin-only. Always through the person's
 * own session, so RLS applies too (0055).
 */

async function db() {
  if (!isSupabaseConfigured) throw new EstherError("bad_input", "Past estimates need the live database.", 404);
  return createClient();
}

/** The table is missing until 0055 is applied — say so plainly. */
function tableError(error: { code?: string; message?: string } | null): never | void {
  if (!error) return;
  if (error.code === "42P01" || error.code === "PGRST205" || /esther_references/.test(error.message ?? "")) {
    throw new EstherError("not_configured", "Past estimates aren't set up yet: an admin needs to apply migration 0055.", 503);
  }
  throw new EstherError("failed", "Couldn't reach the past estimates. Try again.", 500);
}

/** Uploading and deleting: admins only. */
async function adminOnly(): Promise<NextResponse | null> {
  if (!isSupabaseConfigured) return (await requireEstimator())?.error ?? null;
  const gate = await requireAdmin();
  return "error" in gate ? gate.error : null;
}

export async function GET() {
  const gate = await requireEstimator();
  if (gate) return gate.error;
  try {
    const supabase = await db();
    const { data, error } = await supabase.from(TABLE).select(COLUMNS).order("created_at", { ascending: false });
    tableError(error);
    return NextResponse.json({ references: data ?? [] });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  const gate = await adminOnly();
  if (gate) return gate;
  try {
    const supabase = await db();
    const form = await req.formData();
    const doc = await readDocument(form);
    const extract = await askEsther({
      doc,
      task: referenceTask(),
      schema: referenceExtractSchema,
      step: "reference",
      signal: req.signal,
    });
    const row = referenceFromExtract(extract, doc.name);
    if (!row) {
      throw new EstherError("unreadable", "Esther couldn't find tasks with hours in that file, so it wasn't added.", 422);
    }
    const { data, error } = await supabase.from(TABLE).insert(row as never).select(COLUMNS).single();
    tableError(error);
    return NextResponse.json({ reference: data });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  const gate = await adminOnly();
  if (gate) return gate;
  try {
    const id = new URL(req.url).searchParams.get("id") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new EstherError("bad_input", "Which past estimate?");
    const supabase = await db();
    const { error } = await supabase.from(TABLE).delete().eq("id" as never, id as never);
    tableError(error);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
