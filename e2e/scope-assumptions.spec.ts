import { expect, test } from "@playwright/test";

import {
  analyzeDiscovery,
  generatedAssumptions,
  scopeAssumptions,
} from "../lib/discovery";
import { createEmptyDiscoveryProject } from "../lib/discovery/constants";
import type { DiscoveryProject } from "../types/discovery.types";

/**
 * Scope assumptions are generated from the answers, editable on the Hours tab,
 * and printed on the quote. One definition (`scopeAssumptions`) feeds both, so
 * the quote states exactly what the coordinator sees. Pure.
 */
const base = (over: Partial<DiscoveryProject> = {}): DiscoveryProject => ({
  ...createEmptyDiscoveryProject(),
  id: "t",
  platform: "wordpress",
  total_pages: 12,
  created_at: "",
  updated_at: "",
  ...over,
});

test.describe("pure", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "pure — once"));

  test("defaults come from the answers", () => {
    const a = scopeAssumptions(base());
    expect(a).toContain("Platform: wordpress");
    expect(a).toContain("2 design revision rounds");
    expect(a).toEqual(generatedAssumptions(base()));
  });

  test("an edited list replaces the defaults, on screen and on the quote", () => {
    const edited = ["Client supplies all photography", "Two rounds of revisions"];
    const p = base({ assumptions: edited });
    expect(scopeAssumptions(p)).toEqual(edited);
    expect(analyzeDiscovery(p).estimate.assumptions).toEqual(edited);
  });

  test("an empty edit means no assumptions; null goes back to the defaults", () => {
    expect(scopeAssumptions(base({ assumptions: [] }))).toEqual([]);
    expect(scopeAssumptions(base({ assumptions: null }))).toEqual(
      generatedAssumptions(base()),
    );
  });

  test("editing does not change the hours", () => {
    const before = analyzeDiscovery(base());
    const after = analyzeDiscovery(base({ assumptions: ["Anything"] }));
    expect(after.estimate.total).toEqual(before.estimate.total);
  });
});
