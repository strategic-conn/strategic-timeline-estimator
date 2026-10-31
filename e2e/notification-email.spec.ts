import { expect, request as pwRequest, test } from "@playwright/test";

import { renderNotificationEmail } from "../lib/email/notification-email";
import { E2E_PREFIX, env } from "./helpers";

/**
 * Notification emails (0051, POST /api/notifications/email).
 *
 * Live Supabase + live Resend, so the recipient is a throwaway [E2E] member at
 * Resend's sink address (`delivered@resend.dev` accepts and drops — nothing
 * reaches a real inbox, nothing bounces against our sending domain). Rows are
 * inserted with the service key as if the bot had sent them; the route is then
 * called with the bot's real session. Desktop project only — three viewports
 * would send three times for no extra coverage.
 */

const RUN = Date.now().toString(36);
const SINK = `delivered+e2e-${RUN}@resend.dev`;

test("the email copy escapes user-written text", () => {
  const m = renderNotificationEmail({
    text: `Ann assigned you "<script>alert(1)</script>" & more`,
    url: "https://x.test/projects/1",
    recipientName: "<b>Bo</b> Smith",
  });
  expect(m.html).not.toContain("<script>");
  expect(m.html).toContain("&lt;script&gt;");
  expect(m.html).not.toContain("<b>Bo</b>");
  expect(m.html).toContain("https://x.test/settings");
  // Negative control: the escaped form really is what a raw tag turns into.
  expect(renderNotificationEmail({ text: "<i>", url: "https://x.test/" }).html).toContain("&lt;i&gt;");
});

test("emails once, only the caller's own recent rows, and honours the opt-out", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "sends real API calls; once is enough");
  const e = env();
  const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = e.SUPABASE_SERVICE_ROLE_KEY || "";
  test.skip(!url || !key || !e.RESEND_API_KEY, "needs Supabase service key + RESEND_API_KEY");

  const h = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const call = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(`${url}${path}`, { ...init, headers: { ...h, ...(init.headers ?? {}) } });
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  };

  const bot = (await call(`/rest/v1/profiles?email=eq.${encodeURIComponent(e.E2E_EMAIL)}&select=id`))?.[0]?.id;
  test.skip(!bot, "e2e bot not seeded (npm run e2e:seed-user)");

  let memberId: string | null = null;
  try {
    await call("/rest/v1/allowed_emails?on_conflict=email", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify([{ email: SINK, role: "member" }]),
    });
    const made = await call("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({ email: SINK, password: `E2e!${RUN}${RUN}`, email_confirm: true }),
    });
    memberId = made?.id;
    expect(memberId, JSON.stringify(made)).toBeTruthy();
    await call(`/rest/v1/profiles?id=eq.${memberId}`, {
      method: "PATCH",
      body: JSON.stringify({ name: `${E2E_PREFIX} mail ${RUN}`, confirmed_at: new Date().toISOString() }),
    });

    const insert = async (actor: string) =>
      (
        await call("/rest/v1/notifications", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            recipient_id: memberId,
            actor_id: actor,
            text: `${E2E_PREFIX} email test ${RUN}`,
            href: "/dashboard",
          }),
        })
      )[0].id as string;
    const emailedAt = async (id: string) =>
      (await call(`/rest/v1/notifications?id=eq.${id}&select=emailed_at`))[0].emailed_at;
    const send = async (ids: string[]) => {
      const r = await page.request.post("/api/notifications/email", { data: { ids } });
      return { status: r.status(), body: await r.json() };
    };

    // 1. The caller's own fresh row → one email, row stamped.
    const mine = await insert(bot);
    expect((await send([mine])).body).toMatchObject({ sent: 1, failed: 0 });
    expect(await emailedAt(mine)).toBeTruthy();

    // 2. Same row again → nothing (compare-and-set claim).
    expect((await send([mine])).body).toMatchObject({ sent: 0 });

    // 3. Someone else's row → refused, left unstamped.
    const theirs = await insert(memberId!);
    expect((await send([theirs])).body).toMatchObject({ sent: 0 });
    expect(await emailedAt(theirs)).toBeNull();

    // 4. Older than 15 minutes → refused.
    const old = await insert(bot);
    await call(`/rest/v1/notifications?id=eq.${old}`, {
      method: "PATCH",
      body: JSON.stringify({ created_at: new Date(Date.now() - 3600_000).toISOString() }),
    });
    expect((await send([old])).body).toMatchObject({ sent: 0 });

    // 5. Recipient switched emails off → skipped (but claimed, so never retried).
    await call(`/rest/v1/profiles?id=eq.${memberId}`, {
      method: "PATCH",
      body: JSON.stringify({ email_notifications: false }),
    });
    const optedOut = await insert(bot);
    expect((await send([optedOut])).body).toMatchObject({ sent: 0, skipped: 1 });

    // 6. A client can't pre-stamp emailed_at on insert (trigger nulls it).
    const pre = (
      await call("/rest/v1/notifications", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          recipient_id: memberId,
          actor_id: bot,
          text: `${E2E_PREFIX} prestamp ${RUN}`,
          emailed_at: new Date().toISOString(),
        }),
      })
    )[0];
    expect(pre.emailed_at).toBeNull();

    // 7. Signed out → 401.
    const anon = await pwRequest.newContext({ storageState: { cookies: [], origins: [] } });
    const res = await anon.post(`${process.env.E2E_BASE_URL ?? "http://localhost:3000"}/api/notifications/email`, {
      data: { ids: [mine] },
      maxRedirects: 0,
    });
    expect(res.status(), await res.text()).toBe(401);
    await anon.dispose();
  } finally {
    if (memberId) {
      // notifications cascade with the profile; the profile with the auth user.
      await call(`/auth/v1/admin/users/${memberId}`, { method: "DELETE" });
    }
    await call(`/rest/v1/allowed_emails?email=eq.${encodeURIComponent(SINK)}`, { method: "DELETE" });
  }
});

test("Settings → Profile switches the person's own emails off and on", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one viewport is enough");
  const e = env();
  const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = e.SUPABASE_SERVICE_ROLE_KEY || "";
  test.skip(!url || !key, "no Supabase credentials");
  const h = { apikey: key, Authorization: `Bearer ${key}` };
  const flag = async () =>
    (await (await fetch(`${url}/rest/v1/profiles?email=eq.${encodeURIComponent(e.E2E_EMAIL)}&select=email_notifications`, { headers: h })).json())[0]
      .email_notifications;

  await page.goto("/settings");
  const box = page.getByRole("checkbox", { name: "Email me about these" });
  await expect(box).toBeChecked();
  await box.click();
  await expect.poll(flag).toBe(false);
  await box.click();
  await expect.poll(flag).toBe(true);
});
