/**
 * Seed placeholder dev accounts into the LIVE Supabase project so the
 * auto-assignment engine has a real roster to assign across (test data).
 *
 * Idempotent — safe to re-run. Uses the service-role key from .env.local and
 * plain HTTP (GoTrue admin + PostgREST), so it runs on Node 20 without the
 * supabase-js realtime/WebSocket dependency.
 *
 * Run:  node scripts/seed-dev-team.mjs
 *
 * Each dev: allowlist entry (the handle_new_user trigger requires it) → a
 * confirmed auth user (email_confirm:true → NO email sent) → member_skills +
 * weekly_capacity. Emails are "*.dev@example.com" (reserved domain) so you can
 * find + remove them later via Team → offboarding.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const DEVS = [
  { email: "daniel.dev@example.com", name: "Daniel", hours: 40, skills: [["HTML", 5], ["CSS", 5], ["JavaScript", 5], ["WordPress", 5], ["Custom Plugin WordPress", 3], ["Shopify", 5], ["Next.js", 5], ["React", 5]] },
  { email: "francis.dev@example.com", name: "Francis Jan", hours: 40, skills: [["HTML", 5], ["CSS", 5], ["JavaScript", 5], ["WordPress", 5], ["Custom Plugin WordPress", 4], ["Shopify", 5], ["Wix", 5]] },
  { email: "martin.dev@example.com", name: "Martin", hours: 20, skills: [["HTML", 5], ["CSS", 5], ["JavaScript", 5], ["WordPress", 5], ["Custom Plugin WordPress", 5], ["PHP", 5], ["InMotion Hosting", 5], ["Domain Config", 5], ["DNS Config", 5], ["Next.js", 5], ["React", 5]] },
  { email: "arvin.dev@example.com", name: "Arvin", hours: 40, skills: [["HTML", 5], ["CSS", 5], ["JavaScript", 5], ["WordPress", 4], ["Shopify", 4], ["Wix", 5]] },
  { email: "ronel.dev@example.com", name: "Ronel", hours: 40, skills: [["HTML", 5], ["CSS", 5], ["JavaScript", 5], ["WordPress", 4], ["Shopify", 4], ["Wix", 5], ["Quality Assurance", 5]] },
  { email: "patrick.dev@example.com", name: "Patrick", hours: 40, skills: [["Quality Assurance", 5]] },
];

function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch {
    /* fall back to process.env */
  }
  return { ...env, ...process.env };
}

const env = loadEnv();
const URL_BASE = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const baseHeaders = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

async function req(path, opts = {}) {
  const res = await fetch(`${URL_BASE}${path}`, {
    ...opts,
    headers: { ...baseHeaders, ...(opts.headers || {}) },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

// ── existing auth users ──
const listed = await req("/auth/v1/admin/users?per_page=1000");
if (!listed.ok) {
  console.error("listUsers failed:", listed.status, listed.body);
  process.exit(1);
}
const users = Array.isArray(listed.body) ? listed.body : listed.body?.users ?? [];
const byEmail = new Map(users.map((u) => [(u.email ?? "").toLowerCase(), u]));

let created = 0;
let refreshed = 0;
for (const dev of DEVS) {
  let user = byEmail.get(dev.email.toLowerCase());

  if (!user) {
    const allow = await req("/rest/v1/allowed_emails?on_conflict=email", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{ email: dev.email, role: "member" }]),
    });
    if (!allow.ok) {
      console.error(`  allowlist ${dev.email}: ${allow.status} ${JSON.stringify(allow.body)}`);
      continue;
    }
    const make = await req("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email: dev.email,
        password: randomUUID(),
        email_confirm: true,
        user_metadata: { name: dev.name },
      }),
    });
    if (!make.ok || !(make.body?.id || make.body?.user?.id)) {
      console.error(`  createUser ${dev.email}: ${make.status} ${JSON.stringify(make.body)}`);
      continue;
    }
    user = make.body.id ? make.body : make.body.user;
    created += 1;
    console.log(`  created  ${dev.name} <${dev.email}>`);
  } else {
    refreshed += 1;
    console.log(`  exists   ${dev.name} <${dev.email}>`);
  }

  // Skills: replace wholesale so re-runs stay clean.
  await req(`/rest/v1/member_skills?profile_id=eq.${user.id}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  const ins = await req("/rest/v1/member_skills", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(
      dev.skills.map(([skill, confidence]) => ({ profile_id: user.id, skill, confidence })),
    ),
  });
  if (!ins.ok) console.error(`  skills ${dev.name}: ${ins.status} ${JSON.stringify(ins.body)}`);

  const cap = await req("/rest/v1/weekly_capacity?on_conflict=profile_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ profile_id: user.id, hours_per_week: dev.hours }),
  });
  if (!cap.ok) console.error(`  capacity ${dev.name}: ${cap.status} ${JSON.stringify(cap.body)}`);
}

console.log(`\nDone — ${created} created, ${refreshed} already existed. Skills + hours set for all ${DEVS.length}.`);
