import { expect, test } from "@playwright/test";

import { truncateAtWord } from "../lib/zoho/products";
import {
  isGeneratedDescription,
  packageRows,
  parsePackageInput,
} from "../lib/zoho/deal-packages";

/**
 * The product's catalogue description travels into the Deal's Packages row, so
 * it is read by people in the CRM. Pure — no browser, no network.
 */

const LAYOUT = {
  apiName: "Packages",
  productField: "Product",
  priceField: "Unit_Price",
  descriptionField: "Description_1",
};

test.describe("truncateAtWord", () => {
  test("leaves short text alone", () => {
    expect(truncateAtWord("A short description.", 100)).toBe("A short description.");
  });

  test("collapses the newlines Zoho's editor produces", () => {
    expect(truncateAtWord("Line one.\n\n  Line two.\t\tLine three.", 200)).toBe(
      "Line one. Line two. Line three.",
    );
  });

  test("breaks on a word, not mid-word", () => {
    // The real failure: "…server-side scripting lang" in a CRM field.
    const out = truncateAtWord("They rely on server-side scripting languages and databases", 40);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/lang…$/);
    expect(out.length).toBeLessThanOrEqual(41);
  });

  test("drops trailing punctuation before the ellipsis", () => {
    expect(truncateAtWord("One thing, another thing, a third", 12)).toBe("One thing…");
  });

  test("still cuts a single unbroken token", () => {
    const out = truncateAtWord("x".repeat(80), 20);
    expect(out).toBe("x".repeat(20) + "…");
  });
});

test.describe("the Packages row description", () => {
  test("carries the product's own description", () => {
    const rows = packageRows(
      LAYOUT,
      [{ id: "1", name: "Website", hours: 366, amount: 36600, description: "Ten dynamic pages." }],
    );
    expect(rows[0].Description_1).toBe("Ten dynamic pages.");
    expect(rows[0].Unit_Price).toBe(36600);
    expect(rows[0].Product).toEqual({ id: "1" });
  });

  test("falls back to the hours note when the catalogue has none", () => {
    const rows = packageRows(LAYOUT, [{ id: "1", name: "Website", hours: 366, amount: 36600 }]);
    expect(rows[0].Description_1).toBe("366 h");
  });

  test("an empty or blank description also falls back", () => {
    for (const description of ["", "   ", null]) {
      const rows = packageRows(
        LAYOUT,
        [{ id: "1", name: "W", hours: 10, amount: 1000, description }],
      );
      expect(rows[0].Description_1, JSON.stringify(description)).toBe("10 h");
    }
  });

  test("the payload parser keeps the description and bounds it", () => {
    const long = "word ".repeat(200);
    const [p] = parsePackageInput([
      { id: "123", name: "W", hours: 1, amount: 100, description: long },
    ]);
    expect(p.description!.length).toBeLessThanOrEqual(256);
    expect(p.description!.endsWith("…")).toBe(true);
    // whitespace collapsed, not preserved
    expect(p.description).not.toMatch(/\s\s/);
  });

  test("a non-string description is rejected, not coerced", () => {
    const [p] = parsePackageInput([
      { id: "123", name: "W", hours: 1, amount: 100, description: { evil: true } },
    ]);
    expect(p.description).toBeNull();
  });
});

test("packageRows bounds the description itself, not just the parser", () => {
  // The parser already trims, but this is the function that writes the field —
  // a caller that builds PackageInput another way must still be safe.
  const rows = packageRows(
    LAYOUT,
    [
      {
        id: "1",
        name: "W",
        hours: 1,
        amount: 100,
        description: "They rely on server-side scripting languages ".repeat(20),
      },
    ],
  );
  const out = rows[0].Description_1 as string;
  expect(out.length).toBeLessThanOrEqual(256);
  expect(out.endsWith("…")).toBe(true);
  expect(out).not.toMatch(/\blang…$/);
});

test.describe("whose description is on the deal", () => {
  // `replace` overwrites Packages rows outright, but the deal's free-text
  // Description only when this app wrote it. Getting this wrong deletes
  // someone's notes from a production CRM, so it is pinned here.
  test("recognises the roll-up this app generates", () => {
    expect(
      isGeneratedDescription("Estimate: 366 h across 3 line items — $36,600."),
    ).toBe(true);
  });

  test("finds it below the quote's own notes", () => {
    const withNotes = "Client wants a phased rollout.\nEstimate: 12 h across 1 line item — $1,200.";
    expect(isGeneratedDescription(withNotes)).toBe(true);
  });

  test("leaves a human's writing alone", () => {
    for (const text of [
      "Spoke to Maria — she wants the quote split by phase.",
      "Estimate attached.",
      "estimate: 366 h across 3 line items", // lower-case: not our format
      "",
    ]) {
      expect(isGeneratedDescription(text), JSON.stringify(text)).toBe(false);
    }
  });
});
