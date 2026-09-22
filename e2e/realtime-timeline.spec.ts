import { expect, test } from "@playwright/test";

import { E2E_PREFIX, env, settleRealtime, waitForApp } from "./helpers";

/**
 * The timeline updates without a reload.
 *
 * Writes go in through the REST API — i.e. from *somebody else's session* as
 * far as the browser is concerned — and the page must move on its own. A
 * reload between the write and the assertion would prove nothing, so there
 * isn't one.
 *
 * Covers both channels: `workspace:board` (0008 — what the Gantt draws) and
 * `workspace:scheduling` (0037 — availability, capacity, roster; the things
 * that shape it, which were hydrate-once until now).
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

/** Unique per process — see e2e/README.md on why a prefix alone is not enough. */
const RUN = `${process.pid.toString(36)}${Math.random().toString(36).slice(2, 6)}`;

test.describe("timeline is live", () => {
  test("a sprint created, moved and deleted elsewhere reaches the Gantt", async ({
    page,
  }) => {
    const { url, key } = creds();
    test.skip(!url || !key, "no Supabase credentials");
    const h = headers(key);

    const projectName = `${E2E_PREFIX} realtime ${RUN}`;
    const sprintName = `${E2E_PREFIX} live sprint ${RUN}`;
    const taskName = `${E2E_PREFIX} live task ${RUN}`;
    let projectId: string | null = null;

    try {
      const owner = (
        await (
          await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, {
            headers: h,
          })
        ).json()
      )[0]?.id;
      test.skip(!owner, "no profile to own the fixture");

      const projBody = await (
        await fetch(`${url}/rest/v1/projects`, {
          method: "POST",
          headers: h,
          body: JSON.stringify({
            name: projectName,
            status: "active",
            owner_id: owner,
          }),
        })
      ).json();
      projectId = projBody[0].id;

      // Open the Gantt BEFORE the sprint exists, so the row can only arrive
      // through the realtime INSERT.
      await page.goto("/gantt");
      await waitForApp(page);
      // Scoped to the heading in `main`: a bare getByText(/Timeline/i).first()
      // resolves to the sidebar's nav label, which is hidden below `lg` — so the
      // precondition failed on tablet and mobile before realtime was involved.
      await expect(
        page
          .locator("main")
          .getByRole("heading", { name: /timeline/i })
          .first(),
      ).toBeVisible({ timeout: 30_000 });
      await settleRealtime(page);

      const sprintBody = await (
        await fetch(`${url}/rest/v1/sprints`, {
          method: "POST",
          headers: h,
          body: JSON.stringify({
            project_id: projectId,
            name: sprintName,
            status: "active",
            start_date: "2027-03-01",
            end_date: "2027-03-12",
            position: 0,
          }),
        })
      ).json();
      const sprintId = sprintBody[0].id;

      // ⚠️ The Gantt builds its ROWS from tasks (`buildGanttLayout`) — a sprint
      // is only the window a task's bar is drawn in. An empty sprint renders
      // nothing at all, so the fixture needs a task or this asserts on a chart
      // that was never going to show anything.
      const taskBody = await (
        await fetch(`${url}/rest/v1/tasks`, {
          method: "POST",
          headers: h,
          body: JSON.stringify({
            project_id: projectId,
            sprint_id: sprintId,
            title: taskName,
            status: "todo",
            priority: "medium",
            reporter_id: owner,
            due_date: "2027-03-10",
            estimated_hours: 8,
            tags: [],
            position: 0,
          }),
        })
      ).json();
      const taskId = taskBody[0].id;

      // INSERT arrives with no reload — both the task row and its sprint label.
      //
      // `toBeAttached`, not `toBeVisible`: what is under test is whether the
      // event reached this session, and the Gantt keeps its chart in a
      // horizontal scroller, so a bar dated March 2027 is legitimately off to
      // the right at 375px. Asserting visibility here would make a realtime
      // test fail on the Gantt's layout, which has its own specs.
      await expect(page.getByText(taskName).first()).toBeAttached({
        timeout: 20_000,
      });
      await expect(page.getByText(sprintName).first()).toBeAttached({
        timeout: 20_000,
      });

      // A SPRINT update reaches the chart too. This is the one that matters for
      // a timeline: somebody else reschedules, and the Gantt moves.
      const renamed = `${sprintName} moved`;
      const upd = await fetch(`${url}/rest/v1/sprints?id=eq.${sprintId}`, {
        method: "PATCH",
        headers: h,
        body: JSON.stringify({ name: renamed, end_date: "2027-03-26" }),
      });
      expect(upd.ok, await upd.text()).toBe(true);
      await expect(page.getByText(renamed).first()).toBeAttached({
        timeout: 20_000,
      });

      // And a DELETE takes the row away.
      await fetch(`${url}/rest/v1/tasks?id=eq.${taskId}`, {
        method: "DELETE",
        headers: h,
      });
      await expect(page.getByText(taskName)).toHaveCount(0, {
        timeout: 20_000,
      });
    } finally {
      if (projectId) {
        await fetch(`${url}/rest/v1/tasks?project_id=eq.${projectId}`, {
          method: "DELETE",
          headers: h,
        });
        await fetch(`${url}/rest/v1/sprints?project_id=eq.${projectId}`, {
          method: "DELETE",
          headers: h,
        });
        await fetch(`${url}/rest/v1/projects?id=eq.${projectId}`, {
          method: "DELETE",
          headers: h,
        });
      }
    }
  });

  test("a capacity change elsewhere moves the workload bars (0037)", async ({
    page,
  }) => {
    const { url, key } = creds();
    test.skip(!url || !key, "no Supabase credentials");
    const h = headers(key);

    // A real member, because weekly_capacity is keyed on a real profile.
    const member = (
      await (
        await fetch(
          // `useJoinedTeamMembers` needs confirmed_at too - an invitee who never
          // accepted has no row on the page to assert against.
          `${url}/rest/v1/profiles?select=id,name&deactivated_at=is.null&confirmed_at=not.is.null&limit=1`,
          { headers: h },
        )
      ).json()
    )[0];
    test.skip(!member?.id, "no member to adjust");

    const before = (
      await (
        await fetch(
          `${url}/rest/v1/weekly_capacity?select=hours_per_week&profile_id=eq.${member.id}`,
          { headers: h },
        )
      ).json()
    )[0]?.hours_per_week;

    await page.goto("/workload");
    await waitForApp(page);
    await expect(
      page
        .locator("main")
        .getByText(/% of \d+h/)
        .first(),
    ).toBeVisible({
      timeout: 30_000,
    });
    await settleRealtime(page);

    // A value nobody would set by hand, so the assertion cannot pass by accident.
    const probe = 37;
    try {
      const res = await fetch(`${url}/rest/v1/weekly_capacity`, {
        method: "POST",
        headers: {
          ...h,
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify({ profile_id: member.id, hours_per_week: probe }),
      });
      expect(res.ok, await res.text()).toBe(true);

      // No reload: the bar's "of Nh" label must pick the new number up on its own.
      await expect(
        page
          .locator("main")
          .getByText(new RegExp(`% of ${probe}h`))
          .first(),
      ).toBeVisible({ timeout: 20_000 });
    } finally {
      if (before == null) {
        await fetch(
          `${url}/rest/v1/weekly_capacity?profile_id=eq.${member.id}`,
          {
            method: "DELETE",
            headers: h,
          },
        );
      } else {
        await fetch(
          `${url}/rest/v1/weekly_capacity?profile_id=eq.${member.id}`,
          {
            method: "PATCH",
            headers: h,
            body: JSON.stringify({ hours_per_week: before }),
          },
        );
      }
    }
  });
});
