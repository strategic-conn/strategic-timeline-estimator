import { expect, test } from "@playwright/test";

import { E2E_PREFIX, env } from "./helpers";

/**
 * The database is the real gate on approving time off.
 *
 * `usePermissions().canApproveTimeOff` only decides what is on screen; a raw
 * API call has to be refused too, because the "write availability" policy must
 * keep letting a person write their OWN row — that is how a request is made.
 * The decision is therefore guarded by the `prevent_self_approval` trigger.
 *
 * ⚠️ This exists because 0034's first version never fired.
 * `current_user_role()` returns NULL when there is no profile row, and
 * `NULL in ('admin','manager')` is NULL — so `if not approver` was `not NULL`,
 * which is not true, and BOTH guards were skipped. 0035 wraps it in
 * `coalesce(..., false)` so an unrecognised caller fails closed.
 *
 * Runs against LIVE Supabase with the service-role key, which the trigger sees
 * as a non-approver (`auth.uid()` is null there). Everything it writes carries
 * the [E2E] prefix and is deleted in `finally`.
 */
function creds() {
  const e = env();
  return {
    url: (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, ""),
    key: e.SUPABASE_SERVICE_ROLE_KEY || "",
  };
}

const headers = (key: string) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
});

test.describe("time-off approval guard", () => {
  test("a non-approver cannot grant leave, but can still request and edit it", async () => {
    const { url, key } = creds();
    test.skip(!url || !key, "no Supabase credentials");

    const h = headers(key);
    const people = await (
      await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, { headers: h })
    ).json();
    test.skip(!people?.[0]?.id, "no profiles to attach a request to");
    const userId = people[0].id;

    let id: string | null = null;
    try {
      // 1. Submitting a request that CLAIMS to be approved must not be.
      const insert = await fetch(`${url}/rest/v1/availability_entries`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          user_id: userId,
          // Far future so it can never collide with real planning, even if a
          // cleanup ever failed.
          start_date: "2099-01-05",
          end_date: "2099-01-09",
          kind: "pto",
          note: `${E2E_PREFIX} approval guard`,
          status: "approved",
        }),
      });
      // Read the body ONCE — `await insert.text()` inside the expect message
      // consumes it, and the following `.json()` then throws "Body is unusable"
      // before `id` is set, so the cleanup in `finally` has nothing to delete.
      const insertBody = await insert.text();
      expect(insert.ok, insertBody).toBe(true);
      const [row] = JSON.parse(insertBody);
      id = row.id;
      expect(row.status, "a non-approver's request must start pending").toBe(
        "pending",
      );

      // 2. Flipping the status afterwards must be refused outright.
      const approve = await fetch(
        `${url}/rest/v1/availability_entries?id=eq.${id}`,
        { method: "PATCH", headers: h, body: JSON.stringify({ status: "approved" }) },
      );
      expect(approve.ok, "self-approval was ALLOWED").toBe(false);
      expect(await approve.text()).toContain(
        "Only an admin or manager can approve or reject time off",
      );

      // 3. But the guard must not lock the row: editing your own request is
      //    the normal way to answer "can you shift this by a week?".
      const edit = await fetch(`${url}/rest/v1/availability_entries?id=eq.${id}`, {
        method: "PATCH",
        headers: h,
        body: JSON.stringify({ note: `${E2E_PREFIX} approval guard (edited)` }),
      });
      expect(edit.ok, "a note-only edit must still be allowed").toBe(true);

      // 4. And it is still pending — nothing snuck through.
      const [after] = await (
        await fetch(
          `${url}/rest/v1/availability_entries?id=eq.${id}&select=status`,
          { headers: h },
        )
      ).json();
      expect(after.status).toBe("pending");
    } finally {
      if (id) {
        await fetch(`${url}/rest/v1/availability_entries?id=eq.${id}`, {
          method: "DELETE",
          headers: h,
        });
      }
    }
  });

  test("anonymous callers read no availability at all", async () => {
    const e = env();
    const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
    const anon = e.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    test.skip(!url || !anon, "no Supabase credentials");

    // 0034 narrowed reads from "any authenticated user" to self-or-approver.
    // Leave notes are personal data and used to be world-readable in-workspace.
    const res = await fetch(
      `${url}/rest/v1/availability_entries?select=id,note,user_id`,
      { headers: { apikey: anon, Authorization: `Bearer ${anon}` } },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});
