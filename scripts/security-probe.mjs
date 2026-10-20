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

  // ── P1b: the same, ONE field at a time (0046) ───────────────────────────────
  // P1 also sends profile_id, which 0017's policy refused for that reason alone —
  // so P1 passed while a member could still inflate their own hours or move them
  // to another task. Each field is tried on its own here.
  if (teId) {
    const tries = { hours: 500, task_id: notMyTask, logged_at: "2020-01-01T00:00:00Z" };
    const changed = [];
    for (const [k, v] of Object.entries(tries)) {
      await call(`/rest/v1/time_entries?id=eq.${teId}`, { method: "PATCH", headers: mMin, body: { [k]: v } });
      const row = (await call(`/rest/v1/time_entries?id=eq.${teId}&select=task_id,hours,logged_at`)).json[0];
      if (k === "hours" && Number(row.hours) !== 2) changed.push(`hours=${row.hours}`);
      if (k === "task_id" && row.task_id !== myTask) changed.push("task moved");
      if (k === "logged_at" && row.logged_at.startsWith("2020")) changed.push("back-dated");
    }
    await call(`/rest/v1/time_entries?id=eq.${teId}`, { method: "DELETE", headers: mMin });
    const still = ((await call(`/rest/v1/time_entries?id=eq.${teId}&select=id`)).json ?? []).length;
    if (!still) changed.push("deleted");
    record("P1b member cannot edit or delete own time entry (hours/task/date)", changed.length === 0, changed.join(", "));
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

  // ── P27: holiday settings (0049) ─────────────────────────────────────────────
  // Everyone reads (it shapes their capacity); only an admin writes. Proven on a
  // throwaway "[E2E]" name so the real holidays are never touched.
  const hName = `[E2E] probe holiday ${RUN}`;
  const hRead = await call("/rest/v1/holiday_settings?select=name", { headers: mH });
  await call("/rest/v1/holiday_settings", { method: "POST", headers: mMin, body: { name: hName, working: true } });
  const hMember = ((await call(`/rest/v1/holiday_settings?name=eq.${encodeURIComponent(hName)}&select=name`)).json ?? []).length;
  const hAdmin = await call("/rest/v1/holiday_settings", {
    method: "POST", headers: aH, body: { name: hName, working: true, updated_by: other },
  });
  const hRow = (await call(`/rest/v1/holiday_settings?name=eq.${encodeURIComponent(hName)}&select=working,updated_by`)).json?.[0];
  await call(`/rest/v1/holiday_settings?name=eq.${encodeURIComponent(hName)}`, { method: "DELETE" });
  record(
    "P27 holidays: member reads but can't write; admin writes, stamp unforgeable",
    hRead.ok && hMember === 0 && hAdmin.ok && hRow?.working === true && hRow?.updated_by === adminId,
    `memberRead=${hRead.status} memberWrite=${hMember ? "STORED" : "refused"} admin=${hAdmin.status} by=${hRow?.updated_by === adminId ? "ADMIN" : hRow?.updated_by}`,
  );

  // ── P17: onboarding tour progress (0045) ─────────────────────────────────────
  // Self only. Reading someone's progress is harmless-looking but it is still
  // another person's row; writing it could suppress their welcome or checklist.
  // The positive control is the member writing its OWN row, which must work.
  const botId = botTok.json?.user?.id;
  const ownWrite = await call("/rest/v1/tour_progress", {
    method: "POST",
    headers: mMin,
    body: { profile_id: memberId, tour_id: "probe-own", version: 1, status: "completed" },
  });
  const forged17 = await call("/rest/v1/tour_progress", {
    method: "POST",
    headers: mMin,
    body: { profile_id: botId, tour_id: "probe-forge", version: 1, status: "dismissed" },
  });
  const forgedStored =
    ((await call(`/rest/v1/tour_progress?profile_id=eq.${botId}&tour_id=eq.probe-forge&select=tour_id`)).json ?? [])
      .length > 0;
  const seen = (await call("/rest/v1/tour_progress?select=profile_id", { headers: mH })).json ?? [];
  const othersSeen = seen.filter((r) => r.profile_id !== memberId).length;
  const botBefore = (await call(`/rest/v1/tour_progress?profile_id=eq.${botId}&select=tour_id`)).json?.length ?? 0;
  await call(`/rest/v1/tour_progress?profile_id=eq.${botId}`, { method: "DELETE", headers: mMin });
  const botAfter = (await call(`/rest/v1/tour_progress?profile_id=eq.${botId}&select=tour_id`)).json?.length ?? 0;
  record(
    "P17 tour progress is self-only (read, insert, delete)",
    ownWrite.ok && !forgedStored && othersSeen === 0 && botBefore > 0 && botAfter === botBefore,
    `own=${ownWrite.status} forged=${forged17.status}/${forgedStored ? "stored" : "refused"} othersVisible=${othersSeen} botRows=${botBefore}->${botAfter}`,
  );

  // ── P22: a task's logged total is derived, not written (0048) ──────────────
  // The member is an accepted assignee of myTask, so 0018 let them PATCH the
  // total to any number. Now only time entries move it.
  const totalOf = async (id) =>
    Number((await call(`/rest/v1/tasks?id=eq.${id}&select=logged_hours`)).json[0].logged_hours ?? 0);
  const before22 = await totalOf(myTask);
  await call(`/rest/v1/tasks?id=eq.${myTask}`, { method: "PATCH", headers: mMin, body: { logged_hours: 999 } });
  const forged22 = await totalOf(myTask);
  const add22 = await call("/rest/v1/time_entries", {
    method: "POST", headers: mMin, body: { task_id: myTask, profile_id: memberId, hours: 1.5 },
  });
  const after22 = await totalOf(myTask);
  record(
    "P22 logged total can't be typed over; logging time moves it",
    forged22 === before22 && add22.ok && after22 === before22 + 1.5,
    `before=${before22} forged→${forged22} afterEntry=${after22}`,
  );

  // ── P23: deleting a task keeps the time logged on it (0048) ─────────────────
  const doomed = await mkTask(`[E2E] doomed ${RUN}`);
  await call("/rest/v1/task_assignees", {
    method: "POST",
    body: { task_id: doomed, profile_id: memberId, status: "accepted" },
  });
  const e23 = await call("/rest/v1/time_entries", {
    method: "POST", headers: mH, body: { task_id: doomed, profile_id: memberId, hours: 3 },
  });
  const e23id = e23.json?.[0]?.id;
  await call(`/rest/v1/tasks?id=eq.${doomed}`, { method: "DELETE" });
  const kept = (await call(`/rest/v1/time_entries?id=eq.${e23id}&select=task_id,hours`)).json?.[0];
  record(
    "P23 deleting a task keeps its time entries (detached)",
    !!e23id && kept != null && kept.task_id === null && Number(kept.hours) === 3,
    kept ? `task_id=${kept.task_id ?? "null"} hours=${kept.hours}` : "ENTRY ERASED",
  );

  // ── P24: feed rows can't be back-dated or pre-read (0048) ───────────────────
  const mark = `[E2E] stamp ${RUN}`;
  await call("/rest/v1/notifications", {
    method: "POST", headers: mMin,
    body: { recipient_id: other, actor_id: memberId, text: mark, href: "/dashboard", created_at: "2020-01-01T00:00:00Z", read: true },
  });
  await call("/rest/v1/activity", {
    method: "POST", headers: mMin,
    body: { actor_id: memberId, text: mark, href: "/dashboard", created_at: "2020-01-01T00:00:00Z" },
  });
  const n24 = (await call(`/rest/v1/notifications?actor_id=eq.${memberId}&text=eq.${encodeURIComponent(mark)}&select=created_at,read`)).json?.[0];
  const a24 = (await call(`/rest/v1/activity?actor_id=eq.${memberId}&text=eq.${encodeURIComponent(mark)}&select=created_at`)).json?.[0];
  const recent = (iso) => !!iso && Date.now() - Date.parse(iso) < 10 * 60_000;
  record(
    "P24 notification/activity time and read flag are server-set",
    recent(n24?.created_at) && n24?.read === false && recent(a24?.created_at),
    `notif=${n24?.created_at ?? "missing"} read=${n24?.read} activity=${a24?.created_at ?? "missing"}`,
  );

  // ── P25: no empty or essay-length feed text (0048) ──────────────────────────
  const long = `[E2E] ${"x".repeat(600)}`;
  for (const text of ["   ", long]) {
    await call("/rest/v1/notifications", {
      method: "POST", headers: mMin,
      body: { recipient_id: other, actor_id: memberId, text, href: "/dashboard" },
    });
  }
  const n25 = ((await call(`/rest/v1/notifications?actor_id=eq.${memberId}&select=text`)).json ?? [])
    .filter((r) => r.text.trim() === "" || r.text.length > 500).length;
  record("P25 empty or >500-char notification text is refused", n25 === 0, `${n25} stored`);

  // ── P18-P19: task assignments (0046) ─────────────────────────────────────────
  // Self-assigning is accepted at once (by design). Putting a COLLEAGUE on a
  // task must be a request they answer — an "accepted" row loads their workload
  // and lets hours be logged on their behalf without them ever agreeing.
  await call("/rest/v1/task_assignees", {
    method: "POST",
    headers: mMin,
    body: { task_id: notMyTask, profile_id: other, assigned_by: memberId, status: "accepted" },
  });
  const forcedRow = (
    await call(`/rest/v1/task_assignees?task_id=eq.${notMyTask}&profile_id=eq.${other}&select=status`)
  ).json?.[0];
  const selfIns = await call("/rest/v1/task_assignees", {
    method: "POST",
    headers: mMin,
    body: { task_id: notMyTask, profile_id: memberId, assigned_by: memberId, status: "accepted" },
  });
  const selfRow = (
    await call(`/rest/v1/task_assignees?task_id=eq.${notMyTask}&profile_id=eq.${memberId}&select=status`)
  ).json?.[0];
  record(
    "P18 member can't assign a colleague as accepted; self-assign still accepted",
    (!forcedRow || forcedRow.status === "pending") && selfIns.ok && selfRow?.status === "accepted",
    `colleague=${forcedRow?.status ?? "refused"} self=${selfRow?.status ?? selfIns.status}`,
  );

  // My accepted row on myTask: re-pointing it at another task, or storing a
  // status the app never stores, must not stick. Accepting must still work.
  const moved = await mkTask(`[E2E] moved-to ${RUN}`);
  await call(`/rest/v1/task_assignees?task_id=eq.${myTask}&profile_id=eq.${memberId}`, {
    method: "PATCH",
    headers: mMin,
    body: { task_id: moved },
  });
  const onMoved = ((await call(`/rest/v1/task_assignees?task_id=eq.${moved}&select=profile_id`)).json ?? []).length;
  const rej = await call(`/rest/v1/task_assignees?task_id=eq.${myTask}&profile_id=eq.${memberId}`, {
    method: "PATCH",
    headers: mMin,
    body: { status: "rejected" },
  });
  const myStatus = (
    await call(`/rest/v1/task_assignees?task_id=eq.${myTask}&profile_id=eq.${memberId}&select=status`)
  ).json?.[0]?.status;
  // Positive control: a pending row the member answers with "accepted".
  await call(`/rest/v1/task_assignees?task_id=eq.${notMyTask}&profile_id=eq.${memberId}`, {
    method: "PATCH",
    body: { status: "pending" },
  });
  const acc = await call(`/rest/v1/task_assignees?task_id=eq.${notMyTask}&profile_id=eq.${memberId}`, {
    method: "PATCH",
    headers: mMin,
    body: { status: "accepted", responded_at: new Date().toISOString() },
  });
  const accStatus = (
    await call(`/rest/v1/task_assignees?task_id=eq.${notMyTask}&profile_id=eq.${memberId}&select=status`)
  ).json?.[0]?.status;
  record(
    "P19 member can't re-point or mis-set own assignment; accepting works",
    onMoved === 0 && myStatus === "accepted" && acc.ok && accStatus === "accepted",
    `moved=${onMoved} afterReject=${myStatus} (${rej.status}) accept=${accStatus}`,
  );

  // ── P20-P21: a deactivated member (0046) ─────────────────────────────────────
  // Deactivation bans the auth user, but a token already issued lives for up to
  // an hour. It must stop working at once — and the role guard must not mistake
  // a deactivated person (NULL role) for a trusted system writer. LAST, because
  // it disables the member. P20 opens with a positive control: same insert,
  // still active, must succeed.
  const taskBody = (t) => ({
    project_id: projectId, title: t, status: "todo", priority: "low",
    reporter_id: memberId, tags: [], position: 0,
  });
  const before = await call("/rest/v1/tasks", { method: "POST", headers: mMin, body: taskBody(`[E2E] active ${RUN}`) });
  await call(`/rest/v1/profiles?id=eq.${memberId}`, {
    method: "PATCH",
    body: { deactivated_at: new Date().toISOString() },
  });
  const after = await call("/rest/v1/tasks", { method: "POST", headers: mMin, body: taskBody(`[E2E] deactivated ${RUN}`) });
  const ghost = ((await call(`/rest/v1/tasks?title=eq.${encodeURIComponent(`[E2E] deactivated ${RUN}`)}&select=id`)).json ?? []).length;
  record(
    "P20 deactivated member's live token can no longer write",
    before.ok && ghost === 0,
    `active=${before.status} deactivated=${after.status}${ghost ? " STORED" : ""}`,
  );
  await call(`/rest/v1/profiles?id=eq.${memberId}`, { method: "PATCH", headers: mMin, body: { deactivated_at: null, role: "admin" } });
  const self21 = (await call(`/rest/v1/profiles?id=eq.${memberId}&select=deactivated_at,role`)).json[0];
  record(
    "P21 deactivated member can't reactivate or promote themselves",
    self21.deactivated_at !== null && self21.role === "member",
    `deactivated_at=${self21.deactivated_at ? "set" : "CLEARED"} role=${self21.role}`,
  );

  // ── P26: a deactivated member can't post to bells or the feed (0048) ────────
  const mark26 = `[E2E] after deactivation ${RUN}`;
  await call("/rest/v1/notifications", {
    method: "POST", headers: mMin,
    body: { recipient_id: other, actor_id: memberId, text: mark26, href: "/dashboard" },
  });
  await call("/rest/v1/activity", {
    method: "POST", headers: mMin,
    body: { actor_id: memberId, text: mark26, href: "/dashboard" },
  });
  const n26 = ((await call(`/rest/v1/notifications?actor_id=eq.${memberId}&text=eq.${encodeURIComponent(mark26)}&select=id`)).json ?? []).length
    + ((await call(`/rest/v1/activity?actor_id=eq.${memberId}&text=eq.${encodeURIComponent(mark26)}&select=id`)).json ?? []).length;
  record("P26 deactivated member can't send notifications or activity", n26 === 0, `${n26} stored`);
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
  // Detached entries (P23) no longer go with their task; the user delete below
  // cascades them too, but say so explicitly.
  if (memberId) await call(`/rest/v1/time_entries?profile_id=eq.${memberId}`, { method: "DELETE" });
  if (memberId) await call(`/auth/v1/admin/users/${memberId}`, { method: "DELETE" });
  if (adminId) await call(`/auth/v1/admin/users/${adminId}`, { method: "DELETE" });
  if (adminEmail)
    await call(`/rest/v1/allowed_emails?email=eq.${encodeURIComponent(adminEmail)}`, { method: "DELETE" });
  await call(`/rest/v1/hourly_rates?responsible=like.${encodeURIComponent("[E2E] probe%")}`, { method: "DELETE" });
  // Only if P17 failed would this exist; the member's own row cascades away.
  await call(`/rest/v1/tour_progress?tour_id=eq.probe-forge`, { method: "DELETE" });
  await call(`/rest/v1/holiday_settings?name=like.${encodeURIComponent("[E2E] probe holiday%")}`, { method: "DELETE" });
  await call(`/rest/v1/allowed_emails?email=eq.${encodeURIComponent(EMAIL)}`, { method: "DELETE" });
  const leftover = memberId
    ? (await call(`/rest/v1/profiles?id=eq.${memberId}&select=id`)).json?.length ?? 0
    : 0;
  results.push(`cleanup: ${leftover ? "PROFILE LEFT BEHIND" : "clean"}`);
  console.log(results.join("\n"));
}
