import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ReportPage from "../components/ReportPage";
import { CHECK_PAGES } from "../lib/check-pages";
import { buildReportView, type ReportBlock } from "../lib/report";
import { titleCaseName } from "../lib/results";
import { areaWith, category, input, nearbyWith } from "./fixtures/report-inputs";

// BUG-250 (24 Nov 2026) — the polish round: the smallest
// useful pin per fix. The CSS pins read app/globals.css
// the way the look-feel kit does; the composition pins
// drive the real report builder over the fixtures.

const ROOT = process.cwd();
const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");

function sectionBlocks(number: number): ReportBlock[] {
  const view = buildReportView(input());
  return view.sections[number - 1].blocks;
}

describe("BUG-250 polish — CSS pins (app/globals.css)", () => {
  it("item 1: the related-links block centres its wrapped rows", () => {
    expect(css).toContain(".site-pages .related-links {");
    expect(css).toContain("justify-content: center;");
  });

  it("item 3: the calculator cards and the report chart grid take their own heights", () => {
    expect(css).toContain(".calculators__cards {");
    expect(css).toContain("align-items: flex-start;");
    expect(css).toContain(".site-pages .rpt-chartGrid {");
    expect(css).toContain("align-items: start;");
  });

  it("item 4: the grammar row carries a right-hand end cluster", () => {
    expect(css).toContain(".place-row__end {");
    expect(css).toContain("margin-left: auto;");
  });

  it("item 6: the cover fact strip runs five across, the last cell spanning at phone width", () => {
    expect(css).toContain("grid-template-columns: repeat(5, 1fr);");
    expect(css).toContain(".site-pages .rpt-meta > div:last-child {");
    expect(css).toContain("grid-column: 1 / -1;");
  });

  it("item 8: the SAMPLE watermark is softened, not removed", () => {
    expect(css).toContain("opacity: 0.032;");
    expect(css).toContain(".site-pages .watermark span {");
  });

  it("item 11: the Energy certificates table keeps its headers on one line", () => {
    expect(css).toContain("table.rpt-table--energy th {");
    expect(css).toContain("white-space: nowrap;");
  });

  it("item 12: the census sub-items take the hollow-circle marker", () => {
    expect(css).toContain(".results-list__item--sub {");
    expect(css).toContain("list-style-type: circle;");
  });

  it("item 14: the how-we-check cards use their full width", () => {
    expect(css).toContain(".site-pages .how-card p {");
    expect(css).toContain("max-width: none;");
  });

  it("item 16: the chrome pages take the wider column", () => {
    expect(css).toContain(".site-pages__inner--wide {");
    expect(css).toContain("max-width: 1180px;");
    expect(css).toContain("max-width: 840px;");
    expect(css).toContain("max-width: 920px;");
  });

  it("item 17: the place-page district detail stays on one line at desktop width", () => {
    expect(css).toContain(".district-place__detail {");
    expect(css).toContain("text-overflow: ellipsis;");
  });

  it("item 18 (BUG-304): the shortlist header closes tighter under Remove", () => {
    // BUG-304 (founder ruling, 25 Nov 2026): the tiles row
    // is gone — the card's tight close is retired with it.
    // The header cell carries the same close: the Remove
    // button sits 0.7rem under the sale line, and the
    // comparison keeps its 1.8rem gap above.
    expect(css).not.toContain(".shortlist-card {");
    const actions = css.match(/\.compare-table__actions \{[^}]*\}/)?.[0] ?? "";
    expect(actions).toContain("margin: 0.7rem 0 0;");
    expect(css).toContain("margin-top: 1.8rem;");
  });

  it("item 19: the district settlement pills centre", () => {
    expect(css).toContain(".results-pills {");
    expect(css).toContain("justify-content: center;");
  });

  it("item 20: the sources strip centres its wrapped rows at phone width", () => {
    expect(css).toMatch(/\.source-strip__logos\s*\{[^}]*justify-content:\s*center;[^}]*\}/);
  });

  it("item 21 (BUG-363): the header nav collapses behind a hamburger at phone width — the BUG-250 centred wrap is retired", () => {
    // BUG-363 (founder ruling, 26 Nov 2026) supersedes
    // BUG-250's centred 4 + 1 wrap: below 30rem the list
    // is hidden until the button opens it as a dropdown.
    // No centred-wrap rule survives on the list.
    expect(css).not.toMatch(/\.site-nav__list\s*\{[^}]*justify-content:\s*center;[^}]*\}/);
    expect(css).toContain(".site-nav__toggle {");
    expect(css).toContain(".site-nav__list--open {");
    expect(css).toMatch(/\.site-nav__list--open\s*\{[^}]*position:\s*absolute;[^}]*\}/);
    expect(css).toMatch(/\.site-nav__list--open\s*\{[^}]*top:\s*100%;[^}]*\}/);
  });

  it("item 22: the free-page pills centre their wrapped rows at phone width", () => {
    // BUG-369 (26 Nov 2026): the strip is one scrollable
    // row below 40rem now, so the centring is `safe
    // center` — plain `center` would clip the left edge
    // of an overflowing row out of scroll reach. The row
    // still centres whenever it fits.
    expect(css).toMatch(/\.results-strip\s*\{[^}]*justify-content:\s*safe center;[^}]*\}/);
  });
});

describe("BUG-250 polish — check-page paragraphs (item 2)", () => {
  it("no paragraph on the flood-risk or air-quality pages runs past 100 words", () => {
    for (const path of ["/check/flood-risk", "/check/air-quality"]) {
      const page = CHECK_PAGES[path];
      for (const section of page.sections) {
        for (const paragraph of section.paragraphs) {
          expect(paragraph.split(/\s+/).length, `${path} / ${section.heading}`).toBeLessThanOrEqual(
            100,
          );
        }
      }
    }
  });

  it("the split paragraphs keep every word — the flood climate paragraph still reads in full", () => {
    const known = CHECK_PAGES["/check/flood-risk"].sections.find(
      (section) => section.heading === "Known limits",
    );
    const joined = (known?.paragraphs ?? []).join(" ");
    expect(joined).toContain("UKCP18 projections under RCP 8.5");
    expect(joined).toContain("scenarios for planning, not predictions for a home");
  });
});

describe("BUG-250 polish — casing (item 7)", () => {
  it("title-cases an all-caps register name, small words lowercase", () => {
    expect(titleCaseName("CHURCH OF ST LUKE")).toBe("Church of St Luke");
    expect(titleCaseName("THE OLD RECTORY")).toBe("The Old Rectory");
  });

  it("leaves a name the register already files in mixed case exactly as filed", () => {
    expect(titleCaseName("Church of St Andrew")).toBe("Church of St Andrew");
    expect(titleCaseName("St Luke's Church")).toBe("St Luke's Church");
  });

  it("the report serves the worship detail capitalised, not lowercase", () => {
    const view = buildReportView(
      input({
        nearby: nearbyWith({
          "places-of-worship": category({
            category: "places-of-worship",
            state: "within",
            places: [
              {
                name: "St Mary's Church",
                detail: "christian",
                miles: 0.3,
                latitude: 51.7,
                longitude: 0.6,
              },
            ],
            countWithin: 1,
            line: null,
          }),
        }),
      }),
    );
    const section5 = JSON.stringify(view.sections[4]);
    expect(section5).toContain('"detail":"Christian"');
    expect(section5).not.toContain('"detail":"christian"');
  });

  it("the report serves the listed-building name title-cased", () => {
    const area = areaWith();
    if (area.kind !== "area-bundle") throw new Error("expected an area bundle");
    area.sections.heritage.listed.within = [
      { listEntryId: "1", name: "CHURCH OF ST LUKE", grade: "II", miles: 0.4 },
    ];
    const view = buildReportView(input({ area }));
    const section7 = JSON.stringify(view.sections[6]);
    expect(section7).toContain("Church of St Luke");
    expect(section7).not.toContain("CHURCH OF ST LUKE");
  });
});

describe("BUG-250 polish — Section 5 Pets subheadings (item 9)", () => {
  it("the Pets kinds stand as layer-3 subheadings, not layer-2", () => {
    const view = buildReportView(
      input({
        nearby: nearbyWith({
          vets: category({
            category: "vets",
            state: "within",
            places: [
              { name: "Birkdale Vets", detail: null, miles: 0.4, latitude: 51.7, longitude: 0.6 },
            ],
            countWithin: 1,
            line: null,
          }),
          "pet-shops": category({
            category: "pet-shops",
            state: "within",
            places: [
              { name: "Pets at Home", detail: null, miles: 0.8, latitude: 51.7, longitude: 0.6 },
            ],
            countWithin: 1,
            line: null,
          }),
          "pet-boarding": category({
            category: "pet-boarding",
            state: "within",
            places: [
              {
                name: "Latneys Boarding Kennels",
                detail: null,
                miles: 1.1,
                latitude: 51.7,
                longitude: 0.6,
              },
            ],
            countWithin: 1,
            line: null,
          }),
        }),
      }),
    );
    const blocks = view.sections[4].blocks;
    const sub3 = blocks.filter((block) => block.type === "sub3").map((block) => block.text);
    expect(sub3).toContain("Vets");
    expect(sub3).toContain("Pet shops");
    expect(sub3).toContain("Pet boarding (kennels & catteries)");
    const sub = blocks.filter((block) => block.type === "sub").map((block) => block.text);
    expect(sub).toContain("Pets");
    expect(sub).not.toContain("Vets");
  });
});

describe("BUG-250 polish — report rendering (items 10 and 11)", () => {
  it("item 10: the flood map title is print-only — hidden on screen, kept for the printed report", () => {
    const source = readFileSync(join(ROOT, "components/ReportPage.tsx"), "utf8");
    expect(source).toContain('<h4 className="rpt-printTitle">{map.title}</h4>');
    expect(source).toContain("aria-label={map.ariaLabel}");
    expect(css).toContain(".site-pages .rpt-printTitle {\n  display: none;\n}");
    expect(css).toContain(".site-pages .rpt-printTitle {\n    display: block;\n  }");
  });

  it("item 11: the Energy certificates table carries the energy marker", () => {
    const html = renderToStaticMarkup(
      createElement(ReportPage, { view: buildReportView(input()) }),
    );
    expect(html).toContain("rpt-table--energy");
    expect(html).toContain("Floor area");
  });
});

describe("BUG-250 polish — chrome pages (item 16)", () => {
  it("About, Contact, Privacy and Terms render in the wide inner", () => {
    for (const page of ["about", "contact", "privacy", "terms"]) {
      const source = readFileSync(join(ROOT, "app", page, "page.tsx"), "utf8");
      expect(source, page).toContain("site-pages__inner--wide");
    }
  });
});
