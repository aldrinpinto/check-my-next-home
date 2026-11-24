import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import CheckingScreen from "../components/CheckingScreen";
import DistrictCheckingScreen from "../components/DistrictCheckingScreen";
import ReportSuccessPage from "../components/ReportSuccessPage";
import { mortgageMonthly } from "../lib/calculators";
import { joinSegments, nearbyCheckingGroups } from "../lib/journey";
import {
  emptyAnswerForm,
  type CategoryAnswer,
  type NearbyBundle,
  type NearbyCategory,
} from "../lib/nearby";
import type { ReportDoorIdentity } from "../lib/report-door";
import { buildReportSuccessView } from "../lib/report-success";
import { everydayTiles, placeGroupView } from "../lib/results";

// Fix round BUG-257–262 + BUG-250 items 24–25 (founder
// go-ahead, 24 Nov 2026): one pin per fix, in the file
// the fix lives in where a render pin is possible, in
// this file where the fix is a small exported helper or
// a CSS rule (the mobile stack's pattern).

const ROOT = process.cwd();
const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");

describe("BUG-257 — the '; ' join never prints '.;'", () => {
  it("a non-final segment's trailing full stop is dropped before the join", () => {
    expect(
      joinSegments("HM Land Registry", [
        { text: "median sold price £425,000 across 612 sales", named: false },
        { text: "Maldon — its council tax charges are not filed yet.", named: true },
        { text: "88% of postcodes outside the mapped river & sea flood bands", named: false },
      ]),
    ).toBe(
      "HM Land Registry — median sold price £425,000 across 612 sales; Maldon — its council tax charges are not filed yet; 88% of postcodes outside the mapped river & sea flood bands",
    );
  });

  it("the final segment keeps the line's own terminal full stop", () => {
    expect(
      joinSegments("ONS & Police.uk", [
        { text: "41,850 residents across 26 small areas", named: false },
        { text: "Crime is not filed for this district yet.", named: true },
      ]),
    ).toBe(
      "ONS & Police.uk — 41,850 residents across 26 small areas; Crime is not filed for this district yet.",
    );
  });

  it("a single segment keeps its full stop, and stop-free segments join unchanged (the per-home screen's clean shape)", () => {
    expect(
      joinSegments("DfE & Ofsted", [
        { text: "Schools are not filed for this district yet.", named: true },
      ]),
    ).toBe("DfE & Ofsted — Schools are not filed for this district yet.");
    expect(
      joinSegments("NHS & local data", [
        { text: "773 recorded crimes in the last 12 months", named: false },
        { text: "Environment Agency — flood risk very low", named: false },
      ]),
    ).toBe(
      "NHS & local data — 773 recorded crimes in the last 12 months; Environment Agency — flood risk very low",
    );
  });
});

describe("BUG-258 — the district 'Counts in …' tiles singularise at a count of 1", () => {
  it("all four labels read singular at 1 and plural at 0 and 2", () => {
    expect(
      everydayTiles({ gp: 1, dentists: 1, pharmacies: 1, stations: ["Hatfield Peverel"] }),
    ).toEqual([
      { label: "GP surgery", value: "1" },
      { label: "Dentist", value: "1" },
      { label: "Pharmacy", value: "1" },
      { label: "Rail station", value: "1" },
    ]);
    expect(
      everydayTiles({
        gp: 0,
        dentists: 2,
        pharmacies: 4,
        stations: ["Hatfield Peverel", "Southminster"],
      }),
    ).toEqual([
      { label: "GP surgeries", value: "0" },
      { label: "Dentists", value: "2" },
      { label: "Pharmacies", value: "4" },
      { label: "Rail stations", value: "2" },
    ]);
  });
});

describe("BUG-259 — the success card's field resets its flex-basis at phone width", () => {
  it("the success and failed cards' fields flex from auto at ≤30rem, and the card padding narrows", () => {
    expect(css).toContain(
      ".report-success .postcode-box__row .field__input,\n  .report-failed .postcode-box__row .field__input {\n    flex: 1 1 auto;",
    );
    expect(css).toContain(
      ".report-success .report-door__card,\n  .report-failed .report-door__card {\n    padding: 1.5rem 1rem;",
    );
  });
});

const HOME: ReportDoorIdentity = {
  kind: "home",
  subject: "19 Birkdale Rise",
  subline: "Hatfield Peverel, CM3 2JT",
  postcode: "CM3 2JT",
  homeKey: "19||BIRKDALE RISE",
};

describe("BUG-260 — the preparing page shows a visible progress indicator", () => {
  it("the preparing surface carries the spinning indicator; the ready surface carries none", () => {
    const preparing = renderToStaticMarkup(
      createElement(ReportSuccessPage, {
        view: buildReportSuccessView({
          state: "preparing",
          kind: "paid",
          identity: HOME,
          email: "buyer@example.co.uk",
        }),
      }),
    );
    expect(preparing).toContain('role="status"');
    expect(preparing).toContain("report-success__preparing");
    expect(preparing).toContain("checking__spinner");
    expect(preparing).toContain("Preparing your report");

    const ready = renderToStaticMarkup(
      createElement(ReportSuccessPage, {
        view: buildReportSuccessView({
          state: "ready",
          kind: "paid",
          identity: HOME,
          email: "buyer@example.co.uk",
        }),
      }),
    );
    expect(ready).not.toContain("report-success__preparing");
    expect(ready).not.toContain("Preparing your report");
  });
});

describe("BUG-261 — the checking-screen bullet rides inside the headline line", () => {
  it("the dot is the first child of the headline text span on the per-home screen", () => {
    const html = renderToStaticMarkup(
      // The ticker is the component's own props shape; the
      // test renders it with no children, as the static
      // renderer does for the checking screen's first paint.
      // eslint-disable-next-line react/no-children-prop
      createElement(CheckingScreen, {
        postcode: "CM3 2JT",
        homeKey: "19||BIRKDALE RISE",
        heading: "Checking this home",
        eyebrow: { lead: "19 Birkdale Rise", town: "Hatfield Peverel" },
        children: null,
      }),
    );
    expect(html).toContain('class="checking__ticker-text"><span class="checking__ticker-dot"');
  });

  it("the dot is the first child of the headline text span on the district screen", () => {
    const html = renderToStaticMarkup(
      // eslint-disable-next-line react/no-children-prop -- as above.
      createElement(DistrictCheckingScreen, { outward: "CM3", children: null }),
    );
    expect(html).toContain('class="checking__ticker-text"><span class="checking__ticker-dot"');
  });
});

describe("BUG-262 — the mortgage calculator shows the exact figure to the penny", () => {
  it("£180,000 at 4.5% over 25 years is £1,000.50 a month (the Godalming case)", () => {
    const result = mortgageMonthly(200000, 20000, 4.5, 25);
    expect(result.loan).toBe(180000);
    expect(result.monthly).toBe(1000.5);
    expect(result.sentence).toBe(
      "On a loan of £180,000 (£200,000 price less £20,000 deposit) at 4.5% over 25 years: £1,000.50 a month, repayment.",
    );
  });
});

describe("BUG-250 item 24 — no filing language on the sixth-form line", () => {
  it("a secondary row with no sixth form reads 'sixth form: no'", () => {
    const secondary: CategoryAnswer = {
      category: "schools-secondary",
      label: "places",
      basisLabel: "straight-line distance from the postcode point",
      state: "within",
      places: [
        {
          latitude: 51.7,
          longitude: 0.6,
          name: "No Sixth School",
          miles: 1.2,
          detail: null,
          sixthForm: false,
          urn: "2",
        },
      ],
      countWithin: 1,
      beyondNearest: null,
      line: null,
      nearestSelective: null,
    };
    const group = placeGroupView(
      secondary,
      {
        heading: "Secondary schools",
        groupLabel: "secondary schools",
        display: 2,
        family: "school",
      },
      true,
    );
    expect(group.rows[0].detail).toBe("sixth form: no");
  });
});

describe("BUG-250 item 25 — the nurseries empty line carries its closing full stop", () => {
  it("the register-empty line is a finished sentence", () => {
    expect(emptyAnswerForm("nurseries" as NearbyCategory, 0).line).toBe(
      "no nursery within 2 miles of the postcode point in the childcare register we hold.",
    );
  });
});

describe("BUG-264 — the schools line states both radii honestly", () => {
  // Minimal bundle fixture in the journey.test.ts
  // shape: per-category filed counts, health included
  // so the health group also resolves.
  const category = (
    name: NearbyCategory,
    state: string,
    extra: { countWithin?: number; places?: { name: string; miles: number }[] } = {},
  ) =>
    ({
      category: name,
      label: name,
      basisLabel: "basis",
      state,
      places: extra.places ?? [],
      countWithin: extra.countWithin ?? 0,
      beyondNearest: null,
      line: null,
    }) as unknown as CategoryAnswer;
  const schoolsLine = (categories: CategoryAnswer[]) =>
    nearbyCheckingGroups({
      rung: 1,
      kind: "distances",
      postcode: "GU7 1XW",
      basisLabel: "basis",
      categories,
      schoolDeadlines: null,
    } as unknown as NearbyBundle).schools.line;
  const health = [
    category("gp", "within", { places: [{ name: "GP", miles: 0.3 }] }),
    category("dentist", "within", { places: [{ name: "Dentist", miles: 0.8 }] }),
    category("pharmacy", "within", { places: [{ name: "Pharmacy", miles: 0.5 }] }),
  ];

  it("the Godalming case: primary within 2 miles, secondary and sixth forms within 5", () => {
    expect(
      schoolsLine([
        category("schools-primary", "within", { countWithin: 8 }),
        category("schools-secondary", "within", { countWithin: 5 }),
        category("sixth-forms", "within", { countWithin: 2 }),
        category("nurseries", "none-within"),
        ...health,
      ]),
    ).toBe(
      "Ofsted — Within 2 miles: 8 primary schools · Within 5 miles: 5 secondary schools · 2 sixth forms",
    );
  });

  it("a radius with no counts is not named: secondary alone reads 5 miles only", () => {
    expect(
      schoolsLine([
        category("schools-primary", "none-within"),
        category("schools-secondary", "within", { countWithin: 1 }),
        category("sixth-forms", "none-within"),
        category("nurseries", "none-within"),
        ...health,
      ]),
    ).toBe("Ofsted — Within 5 miles: 1 secondary school");
  });
});
