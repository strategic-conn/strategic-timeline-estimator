import { expect, test } from "@playwright/test";

import { withDefaultDependencies } from "../lib/discovery/default-dependencies";

const line = (id: string, title: string, module: string | null, depends_on: string[] = []) => ({
  id,
  title,
  module,
  depends_on,
});

test("guided lines get the default order; catalog lines and set ones are left alone", () => {
  const out = withDefaultDependencies([
    line("s", "Development setup & architecture", "Development"),
    line("p", "Platform setup", "Development"),
    line("t", "Template implementation", "Development"),
    line("b", "Page build", "Development"),
    line("f", "Custom forms", "Development"),
    line("q", "Development QA pass", "Development"),
    line("w", "Wireframes", "Design & UX"),
    line("v", "Visual design system", "Design & UX"),
    line("td", "Template designs", "Design & UX"),
    line("c", "Page build", "Homepage - Standard"), // catalog row, same title
    line("x", "Smoke testing", "Launch & Handoff", ["mine"]), // already set
  ]);
  const deps = Object.fromEntries(out.map((l) => [l.id, l.depends_on]));
  expect(deps.s).toEqual([]);
  expect(deps.p).toEqual(["s"]);
  expect(deps.t).toEqual(["s", "p"]);
  expect(deps.b).toEqual(["s", "p", "t"]);
  expect(deps.f).toEqual(["s"]); // any other dev line waits for setup
  expect(deps.q).toEqual(["s", "p", "t", "b", "f"]);
  expect(deps.v).toEqual([]); // no brand line on this quote
  expect(deps.td).toEqual(["w", "v"]);
  expect(deps.c).toEqual([]);
  expect(deps.x).toEqual(["mine"]);
});

test("only the listed lines are filled in, and they may point at existing lines", () => {
  const out = withDefaultDependencies(
    [
      line("s", "Development setup & architecture", "Development"),
      line("b", "Blog / news section", "Development"),
    ],
    new Set(["b"]),
  );
  expect(out.map((l) => l.depends_on)).toEqual([[], ["s"]]);
});
