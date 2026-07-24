import "server-only";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/supabase/require-admin";
import { isZohoConfigured } from "@/lib/zoho/config";
import { getConnectionMeta } from "@/lib/zoho/tokens";

/** Admin-only. Reports whether env is configured + whether a connection exists. Never returns tokens. */
export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;

  const meta = await getConnectionMeta();
  return NextResponse.json({
    configured: isZohoConfigured,
    connected: Boolean(meta),
    connectedAt: meta?.connected_at ?? null,
    apiDomain: meta?.api_domain ?? null,
  });
}
