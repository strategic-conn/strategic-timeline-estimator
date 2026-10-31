import "server-only";

import { NextResponse } from "next/server";

import { renderNotificationEmail } from "@/lib/email/notification-email";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Email copies of bell notifications the CALLER just created.
 *
 * POST /api/notifications/email  { ids: string[] }
 *
 * Which notifications deserve an email is decided by the caller
 * (`notifyUsers(..., { email: true })`); this route decides whether it MAY
 * send: only rows whose `actor_id` is the signed-in user, created in the last
 * 15 minutes, never emailed before. So a member can email exactly the people
 * they could already put a bell row in front of, once per row — the same
 * attributable reach the bell has (see "What a member can still write").
 *
 * Skipped silently: the actor themselves, deactivated people, and anyone who
 * switched emails off (`profiles.email_notifications`). No RESEND_API_KEY =
 * no-op, so local dev and the demo never send.
 */

const RECENT_MS = 15 * 60 * 1000;
const MAX_IDS = 50;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You're not signed in." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids)
    ? [...new Set(body.ids.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)))]
    : [];
  if (!ids.length || ids.length > MAX_IDS) {
    return NextResponse.json({ error: "Expected 1-50 notification ids." }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ sent: 0, skipped: "RESEND_API_KEY not set" });

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Not configured on the server (missing SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 501 },
    );
  }

  // Claim: stamp emailed_at only on rows this caller may email. Compare-and-set,
  // so a double call (retry, two tabs) sends once.
  const { data: claimed, error } = await admin
    .from("notifications")
    .update({ emailed_at: new Date().toISOString() })
    .in("id", ids)
    .eq("actor_id", user.id)
    .is("emailed_at", null)
    .gte("created_at", new Date(Date.now() - RECENT_MS).toISOString())
    .select("id, recipient_id, text, href");
  if (error) {
    console.error("[notifications/email] claim failed", error);
    return NextResponse.json({ error: "Couldn't read the notifications." }, { status: 500 });
  }
  const rows = (claimed ?? []).filter((r) => r.recipient_id !== user.id);
  if (!rows.length) return NextResponse.json({ sent: 0 });

  const { data: people } = await admin
    .from("profiles")
    .select("id, name, email, email_notifications, deactivated_at")
    .in("id", [...new Set(rows.map((r) => r.recipient_id))]);
  const byId = new Map((people ?? []).map((p) => [p.id, p]));

  const origin = new URL(request.url).origin;
  const from =
    process.env.EMAIL_FROM || "Strategic Estimator <no-reply@mail.strategicsuite.net>";

  const results = await Promise.all(
    rows.map(async (r) => {
      const p = byId.get(r.recipient_id);
      if (!p?.email || !p.email_notifications || p.deactivated_at) return "skipped";
      // href is internal-only by CHECK constraint (0041), so this stays on our origin.
      const url = new URL(r.href || "/dashboard", origin).toString();
      const mail = renderNotificationEmail({ text: r.text, url, recipientName: p.name });
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [p.email], ...mail }),
      }).catch((e: unknown) => e);
      if (res instanceof Response && res.ok) return "sent";
      // ponytail: no retry queue — the bell row is the source of truth, the email a courtesy copy.
      console.error(
        "[notifications/email] send failed",
        r.id,
        res instanceof Response ? `${res.status} ${await res.text()}` : res,
      );
      return "failed";
    }),
  );

  return NextResponse.json({
    sent: results.filter((x) => x === "sent").length,
    skipped: results.filter((x) => x === "skipped").length,
    failed: results.filter((x) => x === "failed").length,
  });
}
