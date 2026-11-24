import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ReportPage from "../components/ReportPage";
import type { ReportView } from "../lib/report";
import { truncationFor } from "../lib/results";

// Mobile phone-width fixes (BUG-249, BUG-251, BUG-252,
// BUG-253, BUG-254 — founder-ordered fix round, 24 Nov
// 2026): the smallest useful pin per bug. The CSS pins
// read app/globals.css the way the look-feel kit does;
// the render pins drive the real components. These live
// in their own file so the parallel stacks' edits to
// tests/look-feel-kit.test.ts and tests/results.test.ts
// merge cleanly.

const ROOT = process.cwd();
const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");

describe("mobile phone-width fixes — CSS pins (app/globals.css)", () => {
  it("BUG-249: the bare placeholder drops to the caption size at phone width", () => {
    expect(css).toContain(".postcode-box--bare .field__input::placeholder");
    expect(css).toContain("font-size: 0.8125rem;");
  });

  it("BUG-249: the hero's side gutters narrow at phone width", () => {
    expect(css).toContain("@media (max-width: 30rem)");
    expect(css).toContain("padding: 2.75rem 1rem 2.5rem;");
  });

  it("BUG-251: the how-card may shrink to its grid track and the source-tag wraps at phone width", () => {
    expect(css).toContain(".site-pages .how-card {\n    min-width: 0;");
    expect(css).toContain(".site-pages .source-tag {\n    white-space: normal;");
  });

  it("BUG-252: the search-block field's flex-basis resets at phone width", () => {
    expect(css).toContain(
      ".site-pages .search-block .postcode-box__row .field__input {\n    flex: 1 1 auto;",
    );
    expect(css).toContain("padding: 1.6rem 1rem;");
  });

  it("BUG-253: the defences tables restack at phone width, screen only", () => {
    expect(css).toContain("@media screen and (max-width: 640px)");
    expect(css).toContain("table.rpt-table--defences");
    expect(css).toContain("content: attr(data-label);");
  });
});

describe("mobile phone-width fixes — BUG-253 defences table rendering", () => {
  const defencesTable = {
    type: "table" as const,
    head: [
      "Watercourse",
      "Maintainer",
      "Recorded stretches",
      "Condition",
      "Design standard",
      "Distance",
    ],
    rows: [
      [
        "River Lea or Lee",
        "Private individual, Company or Charity",
        "12",
        "No condition is recorded for this defence",
        "1 in 100",
        "0.1 miles",
      ],
    ],
    align: ["left", "left", "right", "left", "left", "right"] as ("left" | "right")[],
  };
  const plainTable = {
    type: "table" as const,
    head: ["Date", "Price"],
    rows: [["15 June 2023", "£588,995"]],
    align: ["left", "right"] as ("left" | "right")[],
  };
  const view: ReportView = {
    masthead: {
      brandLine: "Check My Next Home",
      title: "Sample report",
      addressLine: "12 Willow Close",
      meta: [],
      preparedLine: "Prepared 22 November 2026",
    },
    shortVersion: null,
    sections: [{ number: 8, title: "Flood risk", blocks: [defencesTable, plainTable] }],
  };

  it("marks the defences table and labels its cells; other tables are untouched", () => {
    const html = renderToStaticMarkup(createElement(ReportPage, { view }));
    expect(html).toContain('class="rpt-table--defences"');
    expect(html).toContain('data-label="Design standard"');
    expect(html).toContain('data-label="Watercourse"');
    expect(html).toContain("1 in 100");
    // The plain table carries no defences class and no
    // data-labels: exactly one table is marked.
    expect(html.match(/rpt-table--defences/g)?.length).toBe(1);
    expect(html).not.toContain('data-label="Date"');
  });
});

describe("mobile phone-width fixes — BUG-254 truncation singular", () => {
  it("n = 1 reads singular", () => {
    expect(truncationFor(2, 1, "pet shops", true, "pet-shops")?.lead).toBe("Plus 1 more pet shop");
    expect(truncationFor(2, 1, "nurseries", true, "nurseries")?.lead).toBe("Plus 1 more nursery");
    expect(truncationFor(2, 1, "places to visit", true, "places-to-visit")?.lead).toBe(
      "Plus 1 more place to visit",
    );
    expect(truncationFor(2, 1, "sixth forms and colleges", true, "sixth-forms")?.lead).toBe(
      "Plus 1 more sixth form or college",
    );
  });

  it("n >= 2 keeps the plural form exactly", () => {
    expect(truncationFor(5, 2, "primary schools", true, "schools-primary")?.lead).toBe(
      "Plus 3 more primary schools",
    );
    // Pet kinds serve at PET_LIST_SIZE (2), so n = 2
    // needs a schools category — the cap, not the
    // singular, decides the number here.
    expect(truncationFor(4, 2, "primary schools", true, "schools-primary")?.lead).toBe(
      "Plus 2 more primary schools",
    );
  });
});
