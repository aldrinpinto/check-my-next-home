import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import Calculators from "../components/Calculators";
import { CheckPageView } from "../components/ContentPage";
import ReportPage from "../components/ReportPage";
import ResultsPage from "../components/ResultsPage";
import SampleReportDocument from "../components/SampleReportDocument";
import type { AreaBundle } from "../lib/area-bundle";
import { CHECK_PAGES } from "../lib/check-pages";
import type { FloodBundle, FloodLayerType, FloodLiveWarnings, FloodPointState } from "../lib/flood";
import {
  collectOutsideLinks,
  checkPageOutsideLinks,
  sampleReportOutsideLinks,
} from "../lib/outside-links";
import { buildReportView } from "../lib/report";
import { buildResultsView, type ResultsInput } from "../lib/results";
import type { ShortFloodLayer, ShortSections } from "../lib/short-bundle";
import {
  alertWorthy,
  checkOutsideLinks,
  classifyStatus,
  renderNote,
} from "../scripts/outside-link-check.mjs";
import { baseNearby, birkdale, crimeServed, input, soldServed } from "./fixtures/report-inputs";

// M8.7 — the outside-link robot and the new-tab promise.
//
// What is pinned, point by point from the adopted prep:
//   (5) the robot's list is GENERATED from the code's own
//       link sources — the collected set is pinned below,
//       the generated JSON copy must equal the derivation,
//       a link added to a source is collected, and the
//       charging loader's filed checker URLs are a subset
//       of the set (they resolve to the check page's own
//       three destinations);
//   (1) the checker follows redirects and judges the FINAL
//       landing; a landing that changed since last week is
//       flagged for human review, never called dead;
//   (2) three verdicts — works / dead / couldn't check —
//       with robot blocks (403, 429) and network failures
//       on the couldn't-check side, never dead;
//   (3) the note lists every link with its verdict and,
//       for a problem, where the site shows it and when it
//       was last seen working;
//   (4) the new-tab promise is a standing gate check:
//       every outside anchor on every rendered surface
//       carries target="_blank" and rel with noopener.
//
// The step's own check rides here too: the first report
// lists every link (the note test), and a deliberately
// dead link — planted into a source, collected, then
// checked — makes the robot alert (the loop test).

// BUG-159: the sample report is the generated report —
// it serves the report's own destinations and no literals
// of its own, so the collection takes no sample text.
const collected = collectOutsideLinks();
const collectedUrls = collected.map((link) => link.url);

const EXPECTED_URLS = [
  // The check pages' vehicle checkers (also the charging
  // zones' filed checker destinations).
  "https://www.gov.uk/clean-air-zones",
  "https://tfl.gov.uk/modes/driving/check-your-vehicle/",
  "https://vehicleemissionscheck.service.gov.scot/",
  // The calculators.
  "https://www.gov.uk/stamp-duty-land-tax",
  "https://revenue.scot/taxes/land-buildings-transaction-tax/residential-property",
  "https://www.gov.wales/land-transaction-tax-guide",
  // The brains' hand-offs and warnings.
  "https://www.gov.uk/check-flooding",
  "https://www.gov.uk/schools-admissions",
  "https://www.gov.uk/search-register-planning-decisions",
  "https://planningregister.planningsystemni.gov.uk/simple-search",
  "https://www.register-high-rise-building.service.gov.uk/public-register/search",
  // The report's Sources list.
  "https://check-long-term-flood-risk.service.gov.uk/postcode",
  "https://www.nomisweb.co.uk/datasets/c2021ts054",
  "https://www.nomisweb.co.uk/datasets/c2021ts044",
  "https://www.nomisweb.co.uk/datasets/c2021ts021",
  "https://www.nomisweb.co.uk/datasets/c2021ts030",
  "https://www.nomisweb.co.uk/datasets/c2021ts052",
  "https://find-energy-certificate.service.gov.uk/",
  // BUG-159: the hand-built sample's three sample-only
  // literals (pay council tax, the planning-permission
  // guide, one school's Ofsted page) are NOT fixed
  // destinations of the generated sample: it serves the
  // report's own set, and its Ofsted links are per-school
  // data, exactly like a bought report's — outside the
  // fixed set the robot checks.
];

describe("outside links — the collected set (prep point 5)", () => {
  it("collects exactly the fixed destinations the site serves, from the code's own sources", () => {
    expect([...collectedUrls].sort()).toEqual([...EXPECTED_URLS].sort());
  });

  it("the energy certificate stands as a pattern: the robot checks the service, the pattern is recorded", () => {
    const pattern = collected.find((link) => link.pattern);
    expect(pattern?.url).toBe("https://find-energy-certificate.service.gov.uk/");
    expect(pattern?.pattern).toBe(
      "https://find-energy-certificate.service.gov.uk/energy-certificate/{certificate number}",
    );
    expect(pattern?.shownOn).toContain("the sample report");
  });

  it("every entry names where the site shows it", () => {
    for (const link of collected) {
      expect(link.shownOn.length, link.url).toBeGreaterThan(0);
    }
  });

  it("the generated JSON the robot reads equals this derivation (regenerate: OUTSIDE_LINKS_REGEN=1 npm test -- tests/outside-links.test.ts)", () => {
    const path = fileURLToPath(new URL("../scripts/outside-links.json", import.meta.url));
    if (process.env.OUTSIDE_LINKS_REGEN) {
      writeFileSync(
        path,
        `${JSON.stringify(
          {
            generated:
              "Generated from lib/outside-links.ts by tests/outside-links.test.ts (OUTSIDE_LINKS_REGEN=1). Do not hand-edit: the gate test fails while this file and the code's own link sources disagree.",
            links: collected,
          },
          null,
          2,
        )}\n`,
      );
    }
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { links: unknown };
    expect(parsed.links).toEqual(collected);
  });

  it("a link added to a check page's own link list is collected — the list follows the source", () => {
    const doctored = {
      ...CHECK_PAGES,
      "/check/air-quality": {
        ...CHECK_PAGES["/check/air-quality"],
        sections: [
          ...CHECK_PAGES["/check/air-quality"].sections,
          {
            heading: "A planted section",
            paragraphs: [],
            links: [{ label: "Planted", href: "https://example.invalid/planted" }],
          },
        ],
      },
    };
    const urls = checkPageOutsideLinks(doctored, {}).map((link) => link.url);
    expect(urls).toContain("https://example.invalid/planted");
  });

  it("the charging loader's filed checker URLs resolve into the collected set", () => {
    const loader = readFileSync(
      fileURLToPath(new URL("../loaders/load-charging-zones.mjs", import.meta.url)),
      "utf8",
    );
    const filed = [...loader.matchAll(/const (?:CAZ|ULEZ|LEZ)_CHECKER = "(https:[^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(filed).toHaveLength(3);
    for (const url of filed) expect(collectedUrls).toContain(url);
  });

  it("the sample contributes no destinations of its own — the generated sample serves the report's set", () => {
    expect(sampleReportOutsideLinks()).toEqual([]);
    const pattern = collected.find((link) => link.pattern);
    expect(pattern?.shownOn).toContain("the sample report");
  });
});

describe("outside-link checker — verdicts (prep points 1 and 2)", () => {
  let server: Server;
  let base = "";
  let refusedUrl = "";
  let flakyStatus = 200;

  beforeAll(async () => {
    server = createServer((request, response) => {
      switch (request.url) {
        case "/ok":
          response.writeHead(200, { "Content-Type": "text/html" });
          response.end("<p>ok</p>");
          break;
        case "/gone":
          response.writeHead(404);
          response.end();
          break;
        case "/error":
          response.writeHead(500);
          response.end();
          break;
        case "/blocked":
          response.writeHead(403);
          response.end();
          break;
        case "/moved":
          response.writeHead(302, { Location: "/ok" });
          response.end();
          break;
        case "/flaky":
          response.writeHead(flakyStatus);
          response.end();
          break;
        default:
          response.writeHead(404);
          response.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    // A port that was open and is now closed: the visit is
    // refused, which must read as couldn't-check.
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
    refusedUrl = `http://127.0.0.1:${(probe.address() as AddressInfo).port}/`;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const link = (path: string) => ({
    url: `${base}${path}`,
    label: path,
    shownOn: ["the test"],
  });
  const NOW = new Date("2026-11-21T12:00:00.000Z");

  it("classifyStatus: only a demonstrably gone page is dead", () => {
    expect(classifyStatus(200)).toBe("works");
    expect(classifyStatus(301)).toBe("works");
    expect(classifyStatus(404)).toBe("dead");
    expect(classifyStatus(410)).toBe("dead");
    expect(classifyStatus(503)).toBe("dead");
    expect(classifyStatus(403)).toBe("couldnt-check");
    expect(classifyStatus(429)).toBe("couldnt-check");
    expect(classifyStatus(400)).toBe("couldnt-check");
  });

  it("works / dead / couldn't check, with the final landing followed and recorded", async () => {
    const { results } = await checkOutsideLinks(
      [
        link("/ok"),
        link("/gone"),
        link("/error"),
        link("/blocked"),
        link("/moved"),
        { url: refusedUrl, label: "refused", shownOn: ["the test"] },
      ],
      { state: {}, now: NOW, pauseMs: 0 },
    );
    const byPath = new Map(results.map((result) => [result.label, result]));
    expect(byPath.get("/ok")?.verdict).toBe("works");
    expect(byPath.get("/gone")?.verdict).toBe("dead");
    expect(byPath.get("/error")?.verdict).toBe("dead");
    expect(byPath.get("/blocked")?.verdict).toBe("couldnt-check");
    expect(byPath.get("/moved")?.verdict).toBe("works");
    expect(byPath.get("/moved")?.finalUrl).toBe(`${base}/ok`);
    expect(byPath.get("refused")?.verdict).toBe("couldnt-check");
    expect(alertWorthy(results)).toBe(true);
  });

  it("a landing that changed since last week is flagged for review, not called dead", async () => {
    const state = {
      [`${base}/moved`]: {
        finalUrl: `${base}/somewhere-else`,
        lastWorking: "2026-11-14",
        lastVerdict: "works",
      },
    };
    const { results } = await checkOutsideLinks([link("/moved")], { state, now: NOW, pauseMs: 0 });
    expect(results[0].verdict).toBe("works");
    expect(results[0].landingChanged).toBe(true);
    expect(alertWorthy(results)).toBe(true);
    const note = renderNote(results, NOW);
    expect(note).toContain("LANDING CHANGED");
    expect(note).toContain(`${base}/ok`);
  });

  it("the note lists every link, and a death names where it is shown and when it last worked", async () => {
    flakyStatus = 200;
    const first = await checkOutsideLinks([link("/flaky"), link("/ok")], {
      state: {},
      now: NOW,
      pauseMs: 0,
    });
    const firstState = first.nextState as Record<
      string,
      { finalUrl: string | null; lastWorking: string | null; lastVerdict: string }
    >;
    expect(firstState[`${base}/flaky`].lastWorking).toBe("2026-11-21");
    flakyStatus = 404;
    const second = await checkOutsideLinks([link("/flaky"), link("/ok")], {
      state: firstState,
      now: new Date("2026-11-28T12:00:00.000Z"),
      pauseMs: 0,
    });
    const note = renderNote(second.results, new Date("2026-11-28T12:00:00.000Z"));
    expect(note).toContain("DEAD");
    expect(note).toContain("shown on the test");
    expect(note).toContain("last seen working 2026-11-21");
    const listSection = note.split("Every link:")[1];
    expect(listSection.match(/^[✓✗?⚑] /gm)).toHaveLength(2);
  });

  it("the loop, end to end: a dead link in the collected list makes the robot alert (the step's own check)", async () => {
    const withDead = [
      ...collected.slice(0, 2),
      { url: `${base}/gone`, label: "A deliberately dead link", shownOn: ["the test"] },
    ];
    const { results } = await checkOutsideLinks(withDead, { state: {}, now: NOW, pauseMs: 0 });
    // The two real links are not visited successfully here
    // (no network in the gate) — what matters is the dead
    // one is judged dead and the run is alert-worthy.
    const dead = results.find((result) => result.label === "A deliberately dead link");
    expect(dead?.verdict).toBe("dead");
    expect(alertWorthy(results)).toBe(true);
    expect(renderNote(results, NOW)).toContain("A deliberately dead link");
  });
});

// The results-page fabricators follow tests/results.test.ts's
// own shapes (the Birkdale fabrication, trimmed to what this
// gate exercises): a served nearby with school deadlines (the
// catchment link), the short bundle's planning hand-off, and
// a flood bundle with a live warning in force.
function floodLayer(
  layer: FloodLayerType,
  pointState: FloodPointState,
  coveringLabel: string | null,
  line: string,
): ShortFloodLayer {
  return {
    layer,
    title: layer,
    pointState,
    line,
    coveringLabel,
    coveringDefinition: null,
    coveringDetail: null,
    basisLine: "basis",
    sourceLine: "Environment Agency data",
  };
}

function shortSections(overrides: Partial<ShortSections> = {}): ShortSections {
  const polygon = (line: string) => ({
    layer: "conservation_area" as never,
    label: "layer",
    state: "outside" as never,
    line,
    insideName: null,
    nearest: null,
    beyondLine: null,
    sourceLine: null,
  });
  return {
    soldPrices: {
      state: "served",
      stateLine: null,
      ownLastSale: { price: 588995, date: "2023-06-15" },
      ownLine: "19 Birkdale Rise last sold for £588,995 on 15 June 2023",
      median: {
        state: "served",
        value: 588995,
        counted: 29,
        spanFrom: "1995",
        spanTo: "2026",
        line: "the middle of 29 category-A sales in CM3 2JT since 1995 is £588,995",
      },
      buildingMedian: null,
      sourceLine: "HM Land Registry Price Paid Data",
      explainer: "explainer",
    },
    flood: {
      state: "served",
      liveWarnings: null,
      layers: [
        floodLayer("flood_zone", "zone-1", null, "this postcode point is in Flood Zone 1"),
        floodLayer(
          "rofrs",
          "no-band-published",
          null,
          "no river or sea flood band is published for this postcode point",
        ),
        floodLayer(
          "rofsw",
          "no-band-published",
          null,
          "no surface-water flood band is published for this postcode point",
        ),
      ],
    },
    crime: {
      state: "served",
      total: 330,
      totalLine:
        "330 recorded crimes within 1 mile of this postcode, October 2025 to September 2026",
      windowLine: "the 12 months from October 2025 to September 2026",
      asb: { count: 90 },
      perHeadLine: "about 45 recorded crimes per 1,000 residents in this postcode's area",
      englandLine:
        "England's figure for the same months is 94.5 per 1,000 — about 0.5× this area's rate",
      per1000: 45,
      englandPer1000: 94.5,
      staleLine: null,
      sourceLine: "Police.uk crime data",
      explainer: "explainer",
    },
    epc: {
      state: "served",
      headlineBand: "C",
      headlineAssessmentLabel: "the newest certificate for this home is assessed band C",
      line: "energy certificates for CM3 2JT",
    },
    councilTax: {
      state: "served",
      authority: "Braintree",
      taxYear: "2026/27",
      bandDAverageLabel: "£2,280.36",
      line: "Band D averages £2,280.36 a year in Braintree (the council's scale — not this home's bill)",
    },
    constraints: {
      state: "served",
      conservationArea: polygon("this postcode point is not in a conservation area"),
      article4: polygon("no Article 4 direction is filed for this postcode point"),
      greenBelt: polygon("this postcode point is not in the green belt"),
      builtUpArea: polygon("this postcode point is inside a built-up area"),
      brownfield: {
        state: "none-found",
        line: "no brownfield site is filed within 2 miles",
        countWithin: 0,
        nearest: null,
        beyondLine: null,
        sourceLine: null,
      },
    },
    heritage: {
      state: "served",
      listed: {
        state: "served",
        line: "3 listed buildings within 2 miles",
        countWithin: 3,
        nearest: null,
        beyondLine: null,
      },
      atPoint: { state: "none" },
      sourceLine: "Historic England",
    },
    nature: {
      state: "served",
      coverageLine: null,
      placesLine: "1 designated nature site within 2 miles",
      designationsLine: null,
      placesWithinCount: 1,
      nearestPlace: null,
      beyondLine: null,
      ancientWoodland: polygon("no ancient woodland is filed at this postcode point"),
      priorityHabitat: { state: "not-filed", line: "priority habitat data is not filed yet" },
      sourceLine: "Natural England",
    },
    air: {
      state: "served",
      headlineFigure: {
        pollutant: "NO2",
        value: 8.2,
        line: "modelled nitrogen dioxide (NO₂) of 8.2 micrograms per cubic metre",
      },
      line: "modelled air quality for this postcode's area",
    },
    noise: { state: "not-filed", headlineBand: null, line: "noise is not filed" },
    broadband: {
      state: "served",
      gigabitCapablePct: 98,
      line: "98% of homes in this postcode can get gigabit broadband",
    },
    nearby: { basisLabel: "basis", categories: [] },
    // The hand-off pick (M7.9): buildResultsView reads
    // the hand-off from the short bundle now, so the
    // fixture carries the pick in the picked form —
    // state, council, line and link, matching the area
    // fixture's section below.
    planningApplications: {
      state: "handed-off",
      council: "Braintree",
      line: "planning applications for this area are held on the council's register",
      link: {
        label: "Search the register of planning decisions (GOV.UK)",
        url: "https://www.gov.uk/search-register-planning-decisions",
      },
    },
    ...overrides,
  };
}

const noWarnings: FloodLiveWarnings = {
  state: "none",
  checkedAt: "09:00 on 17 November 2026",
  line: "No flood warning in force for this area — checked at 09:00 on 17 November 2026",
  warnings: [],
  overflowCount: null,
  overflowLine: null,
  attributionLine: "Flood warnings from the Environment Agency",
  link: { label: "Check for flooding", url: "https://www.gov.uk/check-flooding" },
};

const activeWarnings: FloodLiveWarnings = {
  ...noWarnings,
  state: "warnings",
  line: null,
  warnings: [
    {
      severityLevel: 2,
      severity: "Flood warning",
      areaDescription: "River Leadon catchment",
      riverOrSea: "River Leadon",
      message: "EA-MESSAGE-FULL-TEXT",
      timeRaised: "2026-11-15T16:35:00",
      raisedLine: "raised at 16:35 on 15 November 2026",
      line: "Flood warning — River Leadon catchment",
    },
  ],
};

function areaBundle(noiseState: "served" | "not-filed" | "not-covered" = "not-filed"): AreaBundle {
  return {
    rung: 1,
    kind: "area-bundle",
    postcode: "CM3 2JT",
    sections: {
      air: { sourceLine: "Defra air quality data" },
      noise:
        noiseState === "served"
          ? {
              state: "served",
              line: null,
              bands: [
                {
                  sourceKind: "road",
                  label: "Road noise",
                  dayBand: "Below 55 dB",
                  nightBand: "Below 50 dB",
                  line: "road noise: Below 55 dB by day, Below 50 dB by night",
                },
              ],
              headlineBand: { sourceKind: "road", dayBand: "Below 55 dB" },
              sourceLine: "Defra noise mapping",
            }
          : {
              state: noiseState,
              line:
                noiseState === "not-filed"
                  ? "modelled noise bands are not filed yet, so no noise answer can be given yet"
                  : "the modelled noise mapping filed covers England only — Wales is not covered",
              bands: [],
              headlineBand: null,
              sourceLine: null,
            },
      councilTax: {
        // The served fields the Costs rows compose from
        // (parity fix batch): the stub previously carried
        // only the monthly line, which masked the real
        // section shape.
        state: "served",
        authority: "Braintree",
        taxYear: "2026/27",
        bandDAveragePence: 228036,
        bandDAverageLabel: "£2,280.36",
        bandDMonthlyPence: 19003,
        bandDMonthlyLabel: "£190.03",
        monthlyLine: "£190.03 a month if the Band D average is spread evenly over 12 months",
        sourceLine: "Council tax data",
      },
      epc: { sourceLine: "EPC register" },
      planningApplications: {
        state: "handed-off",
        council: "Braintree",
        line: "planning applications for this area are held on the council's register",
        link: {
          label: "Search the register of planning decisions (GOV.UK)",
          url: "https://www.gov.uk/search-register-planning-decisions",
        },
        sourceLine: null,
      },
    },
  } as unknown as AreaBundle;
}

function floodWithWarnings(): FloodBundle {
  return {
    rung: 1,
    kind: "flood",
    postcode: "CM3 2JT",
    flood: { state: "served", liveWarnings: activeWarnings, layers: [] },
  } as unknown as FloodBundle;
}

function resultsView() {
  const view: ResultsInput = {
    resolution: birkdale,
    nearby: baseNearby,
    flood: floodWithWarnings(),
    crime: crimeServed,
    sold: soldServed,
    area: areaBundle(),
    short: { rung: 1, kind: "short-bundle", postcode: "CM3 2JT", sections: shortSections() },
    homeKey: "19||BIRKDALE RISE",
  };
  return buildResultsView(view);
}

describe("outside links — the new-tab promise on every rendered surface (prep point 4)", () => {
  function outsideAnchors(html: string) {
    const anchors: { href: string; target?: string; rel?: string }[] = [];
    for (const match of html.matchAll(/<a\s[^>]*>/g)) {
      const tag = match[0];
      const href = /href="([^"]*)"/.exec(tag)?.[1] ?? "";
      if (!/^https?:\/\//.test(href)) continue;
      anchors.push({
        href,
        target: /target="([^"]*)"/.exec(tag)?.[1],
        rel: /rel="([^"]*)"/.exec(tag)?.[1],
      });
    }
    return anchors;
  }

  function expectNewTabPromise(html: string) {
    const anchors = outsideAnchors(html);
    expect(anchors.length).toBeGreaterThan(0);
    for (const anchor of anchors) {
      expect(anchor.target, anchor.href).toBe("_blank");
      expect(anchor.rel ?? "", anchor.href).toContain("noopener");
    }
    return anchors;
  }

  it("the calculators: the stamp-duty link and both devolved-nation links", () => {
    expectNewTabPromise(
      renderToStaticMarkup(
        createElement(Calculators, { lastSalePrice: 588995, nation: "england" }),
      ),
    );
    const scotland = expectNewTabPromise(
      renderToStaticMarkup(
        createElement(Calculators, { lastSalePrice: 300000, nation: "scotland" }),
      ),
    );
    expect(scotland.map((anchor) => anchor.href)).toContain(
      "https://revenue.scot/taxes/land-buildings-transaction-tax/residential-property",
    );
    const wales = expectNewTabPromise(
      renderToStaticMarkup(createElement(Calculators, { lastSalePrice: 300000, nation: "wales" })),
    );
    expect(wales.map((anchor) => anchor.href)).toContain(
      "https://www.gov.wales/land-transaction-tax-guide",
    );
  });

  it("the check pages: the air-quality page's three vehicle checkers", () => {
    const anchors = expectNewTabPromise(
      renderToStaticMarkup(
        createElement(CheckPageView, { page: CHECK_PAGES["/check/air-quality"] }),
      ),
    );
    expect(anchors.map((anchor) => anchor.href)).toEqual(
      expect.arrayContaining([
        "https://www.gov.uk/clean-air-zones",
        "https://tfl.gov.uk/modes/driving/check-your-vehicle/",
        "https://vehicleemissionscheck.service.gov.scot/",
      ]),
    );
  });

  it("the results page: the planning hand-off and the flood-warning links", () => {
    const html = renderToStaticMarkup(createElement(ResultsPage, { view: resultsView() }));
    const anchors = expectNewTabPromise(html);
    const hrefs = anchors.map((anchor) => anchor.href);
    // Re-pinned (FC-06, BUG-154): the catchment block —
    // the results page's schools-admissions link — is
    // retired; the link stands in the report (next test)
    // and the outside-links list, not on this page.
    expect(hrefs).not.toContain("https://www.gov.uk/schools-admissions");
    expect(hrefs).toContain("https://www.gov.uk/search-register-planning-decisions");
    expect(hrefs).toContain("https://www.gov.uk/check-flooding");
  });

  it("the report page: every Sources and hand-off anchor", () => {
    const html = renderToStaticMarkup(
      createElement(ReportPage, { view: buildReportView(input()) }),
    );
    const anchors = expectNewTabPromise(html);
    // The catchment link stands here (FC-06): Section
    // 10's admissions hand-off, beside the disclaimer it
    // belongs to.
    expect(anchors.map((anchor) => anchor.href)).toContain("https://www.gov.uk/schools-admissions");
  });

  it("the sample report: the generated document's anchors keep the promise", () => {
    // BUG-159: the sample is the generated report, so its
    // anchors are the report's own — rendered here through
    // the sample's document composition.
    const html = renderToStaticMarkup(
      createElement(SampleReportDocument, { view: buildReportView(input()) }),
    );
    const anchors = expectNewTabPromise(html);
    expect(anchors.length).toBeGreaterThanOrEqual(10);
  });
});
