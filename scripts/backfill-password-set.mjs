// One-time: mark existing accounts that clearly have a password of their own
// (app_metadata.password_set), so an admin can't make a setup link for them.
// See lib/auth/setup-link.ts.
//
// Rule: someone who signed in more than 10 minutes after their email was
// confirmed signed in again later — i.e. with a password. A scanner-burned
// invite (the bug this guards) signs in at the very moment it confirms, and is
// deliberately left unmarked so the admin CAN send them a setup link.
// Anyone this misses is marked the next time they sign in with a password.
//
//   node scripts/backfill-password-set.mjs           # dry run, writes nothing
//   node scripts/backfill-password-set.mjs --apply
import fs from "node:fs";

const env = {};
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const url = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
const apply = process.argv.includes("--apply");

const res = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1000`, { headers: H });
const { users } = await res.json();
const GAP = 10 * 60 * 1000;
let mark = 0, already = 0, leave = 0;
for (const u of users) {
  const confirmed = u.email_confirmed_at ? Date.parse(u.email_confirmed_at) : null;
  const signedIn = u.last_sign_in_at ? Date.parse(u.last_sign_in_at) : null;
  const masked = u.email.replace(/^(.).*(@.*)$/, "$1***$2");
  if (u.app_metadata?.password_set === true) { already++; continue; }
  const hasPassword = confirmed && signedIn && signedIn - confirmed > GAP;
  if (!hasPassword) {
    leave++;
    console.log(`leave  ${masked}  confirmed=${u.email_confirmed_at ?? "-"}  last_sign_in=${u.last_sign_in_at ?? "-"}`);
    continue;
  }
  mark++;
  if (apply) {
    const r = await fetch(`${url}/auth/v1/admin/users/${u.id}`, {
      method: "PUT",
      headers: H,
      body: JSON.stringify({ app_metadata: { ...u.app_metadata, password_set: true } }),
    });
    if (!r.ok) console.log(`FAILED ${masked} ${r.status}`);
  }
}
console.log(`${apply ? "marked" : "would mark"} ${mark} · already marked ${already} · left unmarked ${leave} · of ${users.length}`);
