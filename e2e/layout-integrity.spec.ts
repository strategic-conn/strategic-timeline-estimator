import { expect, test } from "@playwright/test";

import { env, waitForApp } from "./helpers";

/**
 * Layout integrity across every page, at whichever viewport the project runs.
 *
 * `page-header-fit` guards the header; this guards the body. Three failures it
 * is looking for, all of them things a human only catches by scrolling every
 * page on every device:
 *
 *  1. **Sideways scroll.** The page is wider than the screen.
 *  2. **Content past the right edge.** Something is cut off with no scroller to
 *     reach it — invisible rather than merely cramped, which is the failure mode
 *     `WorkspacePageHeader`'s `overflow-hidden` already produced once.
 *  3. **Overlapping controls.** Two buttons/links sitting on top of each other:
 *     one of them is unclickable, and which one is a coin toss.
 *
 * Deliberately narrow about false positives — see the skips inline. A layout
 * test that cries wolf gets muted, and then it guards nothing.
 */
const PAGES = [
  "/dashboard",
  "/projects",
  "/proposals",
  "/activity",
  "/calendar",
  "/gantt",
  "/workload",
  "/reports",
  "/team",
  "/settings",
];

type Problem = { kind: string; detail: string };

/**
 * The two most control-dense pages are dynamic routes, so they are resolved
 * from live data rather than hardcoded. Skipping them would leave the estimator
 * editor — five tabs, a header full of actions — untested by the one spec that
 * checks for clipped and overlapping controls.
 */
async function dynamicPages(): Promise<string[]> {
  const e = env();
  const url = (e.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = e.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return [];
  const h = { apikey: key, Authorization: `Bearer ${key}` };
  const one = async (table: string, route: (id: string) => string) => {
    try {
      const r = await fetch(`${url}/rest/v1/${table}?select=id&limit=1`, {
        headers: h,
      });
      const rows = await r.json();
      return rows?.[0]?.id ? [route(rows[0].id)] : [];
    } catch {
      return [];
    }
  };
  // The sprint board is the densest task surface (kanban columns, cards, the
  // view switcher), so resolve a sprint together with its project.
  let sprintPages: string[] = [];
  try {
    const r = await fetch(
      `${url}/rest/v1/sprints?select=id,project_id&limit=1`,
      { headers: h },
    );
    const sp = (await r.json())?.[0];
    if (sp?.id) {
      sprintPages = [
        `/projects/${sp.project_id}/sprints/${sp.id}`,
        `/projects/${sp.project_id}/backlog`,
        `/projects/${sp.project_id}/activity`,
      ];
    }
  } catch {
    /* fall through: the length assertion below reports a short list */
  }
  return [
    ...(await one("projects", (id) => `/projects/${id}`)),
    ...(await one("proposals", (id) => `/proposals/${id}`)),
    ...sprintPages,
  ];
}

/**
 * Everything the walk measures on one rendered page. Module-level so the
 * negative control below runs the SAME check against planted breakage —
 * serialised into the page by `page.evaluate`, so it must stay self-contained.
 */
function auditPage(): Problem[] {
  const out: { kind: string; detail: string }[] = [];
  const doc = document.documentElement;
  const vw = doc.clientWidth;

  if (doc.scrollWidth > vw + 1) {
    out.push({
      kind: "sideways-scroll",
      detail: `document scrollWidth ${doc.scrollWidth} > viewport ${vw}`,
    });
  }

  const describe = (el: Element) => {
    const id = el.id ? `#${el.id}` : "";
    const cls =
      typeof el.className === "string" && el.className
        ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}`
        : "";
    const text = (el.textContent ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 30);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ""}`;
  };

  /**
   * The nearest ancestor that actually scrolls sideways, or null.
   *
   * ⚠️ `main` ITSELF is `overflow-x: auto` in this app. An earlier version
   * of this check asked "is this element inside any scroller?" and so
   * skipped literally everything under `main` — the check was inert and
   * passed every page by doing nothing. A negative control (a 5000px div,
   * measured at right=5280 inside a 1280 viewport) is what exposed it.
   *
   * So the question is WHICH scroller: overflowing `main` means the page
   * scrolls sideways, which is the bug. Overflowing a deliberate inner
   * scroller — the Gantt chart, a wide table — is the design.
   */
  const nearestScroller = (el: Element): Element | null => {
    // Starts at `el`, not its parent: an element that IS the scroller
    // (the Estimator's stage-board strip) clips its own content, so it is
    // not evidence of breakage either.
    for (let n: Element | null = el; n; n = n.parentElement) {
      const o = getComputedStyle(n).overflowX;
      if (o === "auto" || o === "scroll") return n;
    }
    return null;
  };

  /** Fixed/sticky chrome legitimately sits over scrolling content. */
  const inFixed = (el: Element) => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      const p = getComputedStyle(n).position;
      if (p === "fixed" || p === "sticky") return true;
    }
    return false;
  };

  const main = document.querySelector("main");
  if (!main) return out;

  // 2a. The content column itself must not scroll sideways.
  if (main.scrollWidth > main.clientWidth + 1) {
    out.push({
      kind: "main-scrolls-sideways",
      detail: `main scrollWidth ${main.scrollWidth} > clientWidth ${main.clientWidth}`,
    });
  }

  // 2b. Anything reaching past the edge of `main` with no inner scroller to
  // bring it back into view.
  const mainRight = main.getBoundingClientRect().left + main.clientWidth;
  main.querySelectorAll("*").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (inFixed(el)) return;
    // Decoration cannot be "cut off" in any way a user cares about: the
    // app's atmosphere layer is an absolutely-positioned, unclickable wash
    // that deliberately bleeds past the content column.
    if (getComputedStyle(el).pointerEvents === "none") return;
    const sc = nearestScroller(el);
    if (sc && sc !== main) return; // inside a deliberate inner scroller
    if (r.right > mainRight + 1) {
      out.push({
        kind: "past-right-edge",
        detail: `${describe(el)} right=${Math.round(r.right)} > main ${Math.round(mainRight)}`,
      });
    }
  });

  /**
   * The part of `el` its clipping ancestors actually let show.
   *
   * ⚠️ The Gantt scrolls its rows inside its own box, so a bar further down
   * keeps a layout position BELOW the chart — over whatever comes next on the
   * page — while being clipped out of sight. Comparing raw boxes flagged an
   * invisible bar "over" the Velocity card's help button. Stops at `main`:
   * clipping by the page's own scroller is just "below the fold", and counting
   * it would hide every control off-screen — the inert-check trap above.
   */
  const visibleRect = (el: Element) => {
    const r = el.getBoundingClientRect();
    let { left, top, right, bottom } = r;
    for (let n = el.parentElement; n && n !== main; n = n.parentElement) {
      const st = getComputedStyle(n);
      if (st.overflowX === "visible" && st.overflowY === "visible") continue;
      const c = n.getBoundingClientRect();
      left = Math.max(left, c.left);
      top = Math.max(top, c.top);
      right = Math.min(right, c.right);
      bottom = Math.min(bottom, c.bottom);
    }
    return { left, top, right, bottom };
  };

  // 3. Overlapping interactive elements.
  const controls = [
    ...main.querySelectorAll("button, a[href], input, select"),
  ]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return false;
      const st = getComputedStyle(el);
      if (st.visibility === "hidden" || st.opacity === "0") return false;
      // A control inside fixed/sticky chrome is meant to float over things.
      return !inFixed(el);
    })
    .slice(0, 250); // enough to be meaningful, bounded so this stays fast

  for (let i = 0; i < controls.length; i++) {
    for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i];
      const b = controls[j];
      // Nesting is normal: a button inside a link shares its box.
      if (a.contains(b) || b.contains(a)) continue;
      const ra = visibleRect(a);
      const rb = visibleRect(b);
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      // 4px in BOTH axes: ignores hairline borders and 1px rounding, keeps
      // anything a finger could actually hit the wrong half of.
      if (ox > 4 && oy > 4) {
        out.push({
          kind: "overlapping-controls",
          detail: `${describe(a)} over ${describe(b)}`,
        });
      }
    }
  }
  return out;
}

test("no page overflows, clips content, or overlaps its own controls", async ({
  page,
}) => {
  const failures: string[] = [];
  const paths = [...PAGES, ...(await dynamicPages())];
  // Named in the output so a silently-empty dynamic list is visible rather
  // than passing by testing fewer pages than it claims.
  expect(paths.length, `pages walked: ${paths.join(", ")}`).toBe(
    PAGES.length + 5,
  );

  for (const path of paths) {
    await page.goto(path);
    await waitForApp(page);
    // Charts and Gantt bars lay out after their data resolves; measuring before
    // that reports a half-built page.
    await page.waitForTimeout(1200);

    const problems: Problem[] = await page.evaluate(auditPage);

    const vw = page.viewportSize()?.width;
    for (const p of problems)
      failures.push(`${path} @${vw}px [${p.kind}] ${p.detail}`);
  }

  expect(failures, failures.join("\n")).toEqual([]);
});

/**
 * Negative control for the overlap check: it must still catch two controls on
 * top of each other, and must NOT count a control clipped out of sight by its
 * own scroll box (the Gantt case). Planted into a real page, run through the
 * same `auditPage`.
 */
test("overlap check: catches real overlaps, ignores clipped-away controls", async ({ page }) => {
  await page.goto("/dashboard");
  await waitForApp(page);
  await page.evaluate(() => {
    const main = document.querySelector("main")!;
    const host = document.createElement("div");
    host.innerHTML = `
      <div style="position:relative;height:120px">
        <button id="nc-a" style="position:absolute;left:0;top:0;width:60px;height:40px">A</button>
        <button id="nc-b" style="position:absolute;left:20px;top:10px;width:60px;height:40px">B</button>
      </div>
      <div style="position:relative;height:120px">
        <div style="height:20px;overflow-y:auto;overflow-x:hidden">
          <div style="height:200px;position:relative">
            <button id="nc-hidden" style="position:absolute;left:0;top:60px;width:60px;height:40px">hidden</button>
          </div>
        </div>
        <button id="nc-visible" style="position:absolute;left:0;top:60px;width:60px;height:40px">visible</button>
      </div>`;
    main.prepend(host);
  });
  const problems = (await page.evaluate(auditPage)).filter((p) => p.kind === "overlapping-controls");
  const text = problems.map((p) => p.detail).join(" | ");
  expect(text, "two overlapping buttons must be reported").toMatch(/"A".*"B"|"B".*"A"/);
  expect(text, "a clipped-away button must not be reported").not.toMatch(/hidden/);
});
