/**
 * Security probe: attempts known abuse paths with a real MEMBER JWT.
 *
 * The UI's `usePermissions()` hides controls but enforces nothing — the anon key
 * is public, so any signed-in user can call PostgREST directly. This drives the
 * database the way an attacker would, not the way the UI does.
 *
 * Creates a throwaway "[E2E]" member (allowed_emails -> auth user -> profile),
 * runs each probe, then deletes everything it made. Never touches pre-existing
 * rows. Prints one line per probe: PASS means the database behaved safely.
 *
 *   node scripts/security-probe.mjs
 */
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;

const RUN = `${process.pid.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const EMAIL = `e2e-member-${RUN}@example.test`;
const PASSWORD = `Pr0be-${RUN}-${Math.random().toString(36).slice(2)}!`;

const svcH = {
  apikey: SVC,
  Authorization: `Bearer ${SVC}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};
async function call(path, { method = "GET", headers = svcH, body } = {}) {
  const r = await fetch(`${URL_}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: r.status, ok: r.ok, json };
}

const results = [];
const record = (name, safe, detail) =>
  results.push(`${safe ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);

let memberId = null;
let projectId = null;
let adminId = null;
let adminEmail = null;

try {
  // ── Fixture: a real member account ─────────────────────────────────────────
  await call("/rest/v1/allowed_emails?on_conflict=email", {
    method: "POST",
    headers: { ...svcH, Prefer: "resolution=merge-duplicates" },
    body: [{ email: EMAIL, role: "member" }],
  });
  const made = await call("/auth/v1/admin/users", {
    method: "POST",
    body: { email: EMAIL, password: PASSWORD, email_confirm: true },
  });
  memberId = made.json?.id;
  if (!memberId) throw new Error(`createUser failed: ${JSON.stringify(made.json)}`);
  await call(`/rest/v1/profiles?id=eq.${memberId}`, {
    method: "PATCH",
    body: { name: `[E2E] member ${RUN}`, role: "member", confirmed_at: new Date().toISOString() },
  });

  const tok = await call("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: { email: EMAIL, password: PASSWORD },
  });
  const jwt = tok.json?.access_token;
  if (!jwt) throw new Error(`member login failed: ${JSON.stringify(tok.json)}`);
  const mH = {
    apikey: ANON,
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  // ⚠️ No RETURNING for notification/activity inserts. With
  // `return=representation` PostgREST runs INSERT ... RETURNING, and the new
  // row must then pass the SELECT policy — a notification to SOMEONE ELSE is
  // invisible to its sender, so the insert is reported as an RLS violation and
  // every href probe "passes" for the wrong reason. This is how the app inserts.
  const mMin = { ...mH, Prefer: "return=minimal" };
  const stored = async (table, href) =>
    ((await call(`/rest/v1/${table}?actor_id=eq.${memberId}&href=eq.${encodeURIComponent(href)}&select=id`)).json ?? []).length > 0;

  // ⚠️ An APPROVER's JWT for approval fixtures. The service key cannot approve:
  // 0035 fails closed on a caller with no profile role, so a service-role insert
  // of status='approved' is silently forced to 'pending' — which made the first
  // version of P2/P3 test a pending leave and pass for the wrong reason.
  const botTok = await call("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: { email: env.E2E_EMAIL, password: env.E2E_PASSWORD },
  });
  const bH = {
    apikey: ANON,
    Authorization: `Bearer ${botTok.json?.access_token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const approve = async (id, dates) => {
    await call(`/rest/v1/availability_entries?id=eq.${id}`, {
      method: "PATCH",
      headers: bH,
      body: { status: "approved", ...dates },
    });
    const s2 = (await call(`/rest/v1/availability_entries?id=eq.${id}&select=status`)).json[0].status;
    if (s2 !== "approved") throw new Error(`fixture could not approve leave (status=${s2})`);
  };

  // A colleague to aim abuse at: any other confirmed profile.
  const other = (
    await call(`/rest/v1/profiles?select=id&id=neq.${memberId}&limit=1`)
  ).json[0].id;

  // Project + two tasks; the member is an accepted assignee of the first only.
  projectId = (
    await call("/rest/v1/projects", {
      method: "POST",
      body: { name: `[E2E] security ${RUN}`, status: "active", owner_id: other },
    })
  ).json[0].id;
  const mkTask = async (title) =>
    (
      await call("/rest/v1/tasks", {
        method: "POST",
        body: {
          project_id: projectId,
          title,
          status: "todo",
          priority: "medium",
          reporter_id: other,
          tags: [],
          position: 0,
        },
      })
    ).json[0].id;
  const myTask = await mkTask(`[E2E] mine ${RUN}`);
  const notMyTask = await mkTask(`[E2E] not mine ${RUN}`);
  await call("/rest/v1/task_assignees", {
    method: "POST",
    body: { task_id: myTask, profile_id: memberId, status: "accepted" },
  });

  // ── P1: time_entries — move my logged hours onto a colleague / another task ─
  const te = await call("/rest/v1/time_entries", {
    method: "POST",
    headers: mH,
    body: { task_id: myTask, profile_id: memberId, hours: 2 },
  });
  const teId = te.json?.[0]?.id;
  if (!teId) {
    record("P1 time entry setup", false, `insert failed: ${JSON.stringify(te.json)}`);
  } else {
    await call(`/rest/v1/time_entries?id=eq.${teId}`, {
      method: "PATCH",
      headers: mH,
      body: { profile_id: other, task_id: notMyTask, hours: 500 },
    });
    const after = (await call(`/rest/v1/time_entries?id=eq.${teId}&select=profile_id,task_id,hours`)).json[0];
    const untouched =
      after.profile_id === memberId && after.task_id === myTask && Number(after.hours) === 2;
    record(
      "P1 member cannot rewrite a time entry (owner/task/hours)",
      untouched,
      untouched ? "" : `now profile=${after.profile_id === other ? "COLLEAGUE" : after.profile_id} hours=${after.hours}`,
    );
  }

  // ── P2: extend an APPROVED leave without re-approval ────────────────────────
  const leave = (
    await call("/rest/v1/availability_entries", {
      method: "POST",
      headers: mH,
      body: { user_id: memberId, start_date: "2027-11-01", end_date: "2027-11-02", kind: "pto", note: "[E2E] probe" },
    })
  ).json[0].id;
  await approve(leave, {});
  await call(`/rest/v1/availability_entries?id=eq.${leave}`, {
    method: "PATCH",
    headers: mH,
    body: { end_date: "2027-11-12" }, // quietly ten days longer, status not sent
  });
  const l2 = (await call(`/rest/v1/availability_entries?id=eq.${leave}&select=status,end_date`)).json[0];
  record(
    "P2 extending approved leave re-opens it as pending",
    !(l2.status === "approved" && l2.end_date === "2027-11-12"),
    `status=${l2.status} end=${l2.end_date}`,
  );

  // ── P3: the LEGITIMATE member flow — the client re-pends on a date edit ─────
  await approve(leave, { end_date: "2027-11-02" });
  const p3 = await call(`/rest/v1/availability_entries?id=eq.${leave}`, {
    method: "PATCH",
    headers: mH,
    body: { start_date: "2027-11-03", end_date: "2027-11-04", status: "pending", reviewed_by: null, reviewed_at: null },
  });
  const l3 = (await call(`/rest/v1/availability_entries?id=eq.${leave}&select=status,start_date`)).json[0];
  record(
    "P3 member CAN edit dates of own approved leave (re-pends)",
    p3.ok && l3.status === "pending" && l3.start_date === "2027-11-03",
    p3.ok ? `status=${l3.status}` : `refused: ${p3.json?.message ?? p3.status}`,
  );

  // ── P4: forge a reviewer on my own request ──────────────────────────────────
  const forged = await call("/rest/v1/availability_entries", {
    method: "POST",
    headers: mH,
    body: {
      user_id: memberId,
      start_date: "2027-12-01",
      end_date: "2027-12-01",
      kind: "pto",
      status: "pending",
      reviewed_by: other,
      review_note: "Approved by the boss",
    },
  });
  const fr = forged.json?.[0];
  record(
    "P4 member cannot forge reviewer/review note",
    !fr || (fr.reviewed_by === null && fr.review_note === null),
    fr ? `reviewed_by=${fr.reviewed_by ? "SET" : "null"} note=${fr.review_note ?? "null"}` : "",
  );

  // ── P5: hide myself from the roster (and so from capacity) ──────────────────
  const p5 = await call(`/rest/v1/profiles?id=eq.${memberId}`, {
    method: "PATCH",
    headers: mH,
    body: { confirmed_at: null },
  });
  const pr = (await call(`/rest/v1/profiles?id=eq.${memberId}&select=confirmed_at`)).json[0];
  record(
    "P5 member cannot unset own confirmed_at",
    pr.confirmed_at !== null,
    p5.ok ? "" : `refused: ${p5.json?.message ?? p5.status}`,
  );

  // ── P6: phishing link in someone's notification bell ────────────────────────
  await call("/rest/v1/notifications", {
    method: "POST",
    headers: mMin,
    body: {
      recipient_id: other,
      actor_id: memberId,
      text: "[E2E] Your session expired — sign in again",
      href: "https://evil.example/login",
    },
  });
  const p6 = await stored("notifications", "https://evil.example/login");
  record("P6 notification href must be an internal path", !p6, p6 ? "EXTERNAL LINK STORED" : "");

  // ── P7: protocol-relative / backslash variants of the same ──────────────────
  for (const href of ["//evil.example", "/\\evil.example"]) {
    await call("/rest/v1/activity", {
      method: "POST",
      headers: mMin,
      body: { actor_id: memberId, text: "[E2E] probe", href },
    });
    const kept = await stored("activity", href);
    record(`P7 activity href rejects ${JSON.stringify(href)}`, !kept, kept ? "STORED" : "");
  }

  // ── P8: the legitimate case still works ─────────────────────────────────────
  const p8r = await call("/rest/v1/notifications", {
    method: "POST",
    headers: mMin,
    body: { recipient_id: other, actor_id: memberId, text: "[E2E] probe", href: "/dashboard" },
  });
  const p8 = await stored("notifications", "/dashboard");
  record("P8 internal notification href still allowed", p8, p8 ? "" : JSON.stringify(p8r.json));

  // ── P9: role self-escalation (should already be blocked) ────────────────────
  await call(`/rest/v1/profiles?id=eq.${memberId}`, {
    method: "PATCH",
    headers: mH,
    body: { role: "admin" },
  });
  const role = (await call(`/rest/v1/profiles?id=eq.${memberId}&select=role`)).json[0].role;
  record("P9 member cannot make themselves admin", role === "member", `role=${role}`);

  // ── P10-P13: hourly rates (0042) ────────────────────────────────────────────
  // Rates are commercial data: admin + manager read, admin writes. The admin
  // write is proven on a throwaway "[E2E]" row so the real rates are never
  // touched, and the stamp is proven unforgeable by sending someone else's id.
  const probeRole = `[E2E] probe ${RUN}`;
  const mRates = await call("/rest/v1/hourly_rates?select=responsible", { headers: mH });
  record(
    "P10 member cannot read hourly rates",
    (mRates.json ?? []).length === 0,
    `${(mRates.json ?? []).length} rows visible`,
  );
  await call("/rest/v1/hourly_rates", {
    method: "POST",
    headers: mMin,
    body: { responsible: probeRole, level: 1, rate: 1 },
  });
  await call("/rest/v1/hourly_rates?responsible=eq.IT&level=eq.1", {
    method: "PATCH",
    headers: mMin,
    body: { rate: 1 },
  });
  const itAfterMember = (await call("/rest/v1/hourly_rates?responsible=eq.IT&level=eq.1&select=rate")).json[0].rate;
  const memberRow = (await call(`/rest/v1/hourly_rates?responsible=eq.${encodeURIComponent(probeRole)}&select=responsible`)).json.length;
  record(
    "P11 member cannot write hourly rates",
    memberRow === 0 && Number(itAfterMember) !== 1,
    `insertStored=${memberRow} IT_L1=${itAfterMember}`,
  );

  const bRates = await call("/rest/v1/hourly_rates?select=responsible", { headers: bH });
  const itBefore = (await call("/rest/v1/hourly_rates?responsible=eq.IT&level=eq.2&select=rate")).json[0].rate;
  await call("/rest/v1/hourly_rates?responsible=eq.IT&level=eq.2", {
    method: "PATCH",
    headers: { ...bH, Prefer: "return=minimal" },
    body: { rate: Number(itBefore) + 1 },
  });
  const itAfterMgr = (await call("/rest/v1/hourly_rates?responsible=eq.IT&level=eq.2&select=rate")).json[0].rate;
  record(
    "P12 manager can read but not write hourly rates",
    (bRates.json ?? []).length >= 10 && Number(itAfterMgr) === Number(itBefore),
    `reads=${(bRates.json ?? []).length} IT_L2 ${itBefore} -> ${itAfterMgr}`,
  );

  // A throwaway ADMIN, created and removed like the member.
  const aEmail = `e2e-admin-${RUN}@example.test`;
  await call("/rest/v1/allowed_emails?on_conflict=email", {
    method: "POST",
    headers: { ...svcH, Prefer: "resolution=merge-duplicates" },
    body: [{ email: aEmail, role: "admin" }],
  });
  const aMade = await call("/auth/v1/admin/users", {
    method: "POST",
    body: { email: aEmail, password: PASSWORD, email_confirm: true },
  });
  adminId = aMade.json?.id ?? null;
  adminEmail = aEmail;
  if (!adminId) throw new Error(`admin createUser failed: ${JSON.stringify(aMade.json)}`);
  await call(`/rest/v1/profiles?id=eq.${adminId}`, {
    method: "PATCH",
    body: { name: `[E2E] admin ${RUN}`, role: "admin", confirmed_at: new Date().toISOString() },
  });
  const aTok = await call("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: { email: aEmail, password: PASSWORD },
  });
  const aH = {
    apikey: ANON,
    Authorization: `Bearer ${aTok.json?.access_token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const aIns = await call("/rest/v1/hourly_rates", {
    method: "POST",
    headers: aH,
    // updated_by forged as someone else: the 0042 trigger must overwrite it.
    body: { responsible: probeRole, level: 2, rate: 42, updated_by: other },
  });
  const aRow = aIns.json?.[0];
  record(
    "P13 admin can write hourly rates; the stamp can't be forged",
    aIns.ok && aRow?.updated_by === adminId && Number(aRow?.rate) === 42,
    aIns.ok ? `updated_by=${aRow?.updated_by === adminId ? "ADMIN (stamped)" : aRow?.updated_by}` : JSON.stringify(aIns.json),
  );
  await call(`/rest/v1/hourly_rates?responsible=eq.${encodeURIComponent(probeRole)}`, { method: "DELETE" });

  // ── P14-P16: work keys (0043) ────────────────────────────────────────────────
  // A key decides who gets work and at what seniority, so giving yourself
  // "IT|Level 2" is a self-promotion. Only an admin may set one. All writes land
  // on the throwaway member; the manager bot's own profile is never touched.
  const keysOf = async (id) =>
    JSON.stringify((await call(`/rest/v1/profiles?id=eq.${id}&select=work_keys`)).json?.[0]?.work_keys);
  await call(`/rest/v1/profiles?id=eq.${memberId}`, {
    method: "PATCH",
    headers: mMin,
    body: { work_keys: ["IT|Level 2"] },
  });
  const k14 = await keysOf(memberId);
  record("P14 member cannot give themselves a work key", k14 === "[]", `work_keys=${k14}`);

  await call(`/rest/v1/profiles?id=eq.${memberId}`, {
    method: "PATCH",
    headers: { ...bH, Prefer: "return=minimal" },
    body: { work_keys: ["IT|Level 2"] },
  });
  const k15 = await keysOf(memberId);
  record("P15 manager cannot set someone's work keys", k15 === "[]", `work_keys=${k15}`);

  const a16 = await call(`/rest/v1/profiles?id=eq.${memberId}`, {
    method: "PATCH",
    headers: { ...aH, Prefer: "return=minimal" },
    body: { work_keys: ["IT|Level 2", "QA Tester|Level 1"] },
  });
  const k16 = await keysOf(memberId);
  const bad = await call(`/rest/v1/profiles?id=eq.${memberId}`, {
    method: "PATCH",
    headers: { ...aH, Prefer: "return=minimal" },
    body: { work_keys: ["IT|Level 9"] },
  });
  const k16b = await keysOf(memberId);
  record(
    "P16 admin can set work keys; a malformed key is refused",
    a16.ok && k16 === '["IT|Level 2","QA Tester|Level 1"]' && !bad.ok && k16b === k16,
    `set=${k16} malformed=${bad.status} after=${k16b}`,
  );
} catch (e) {
  results.push(`ERROR ${e.message}`);
} finally {
  // ── Cleanup: everything this run made, nothing else ────────────────────────
  if (memberId) {
    await call(`/rest/v1/notifications?actor_id=eq.${memberId}`, { method: "DELETE" });
    await call(`/rest/v1/activity?actor_id=eq.${memberId}`, { method: "DELETE" });
    await call(`/rest/v1/availability_entries?user_id=eq.${memberId}`, { method: "DELETE" });
  }
  if (projectId) {
    await call(`/rest/v1/tasks?project_id=eq.${projectId}`, { method: "DELETE" }); // cascades entries/assignees
    await call(`/rest/v1/projects?id=eq.${projectId}`, { method: "DELETE" });
  }
  if (memberId) await call(`/auth/v1/admin/users/${memberId}`, { method: "DELETE" });
  if (adminId) await call(`/auth/v1/admin/users/${adminId}`, { method: "DELETE" });
  if (adminEmail)
    await call(`/rest/v1/allowed_emails?email=eq.${encodeURIComponent(adminEmail)}`, { method: "DELETE" });
  await call(`/rest/v1/hourly_rates?responsible=like.${encodeURIComponent("[E2E] probe%")}`, { method: "DELETE" });
  await call(`/rest/v1/allowed_emails?email=eq.${encodeURIComponent(EMAIL)}`, { method: "DELETE" });
  const leftover = memberId
    ? (await call(`/rest/v1/profiles?id=eq.${memberId}&select=id`)).json?.length ?? 0
    : 0;
  results.push(`cleanup: ${leftover ? "PROFILE LEFT BEHIND" : "clean"}`);
  console.log(results.join("\n"));
}
