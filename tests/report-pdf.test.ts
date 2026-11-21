import { inflateSync } from "node:zlib";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AddressResolution } from "../lib/address";
import { floodMapFrame, type FloodBundle, type FloodMaps } from "../lib/flood";
import { buildReportView, type ReportBlock, type ReportView } from "../lib/report";
import {
  reportPdfCover,
  reportPdfFileName,
  reportPdfFooterHtml,
  reportPdfKey,
  reportPrintUrl,
  sampleReportPdfContentDisposition,
  sampleReportPdfCover,
  sampleReportPdfFileName,
  sampleReportPdfFooterHtml,
} from "../lib/report-pdf";
import {
  generateReportPdf,
  reportPrintCss,
  reportPrintDocument,
  storeReportPdf,
} from "../lib/server/report-pdf";
import { generateSampleReportPdf, samplePrintUrl } from "../lib/server/sample-pdf";
import SampleReportPrintPage from "../app/sample-report/print/page";
import { createLocalReportPdfStore } from "../lib/server/report-storage";
import type { SoldPricesBundle } from "../lib/sold-prices";
import { floodServed, input } from "./fixtures/report-inputs";

// The PDF twin (plan step M8.4) — the pure derivations
// (file name, storage key, cover, footer, printed URLs)
// pinned exactly; the print document's composition
// asserted on its markup; and the render proof: the two
// golden reports (Birkdale and Exeter, on the fixtures'
// fabricated golden-fact bundles, with filed-shape flood
// maps composed the M8.3 tests' way) printed through
// the real generator, their PDFs read back with the
// small extractor below — cover on page 1, the footer
// on every page, Sources URLs printed, and no chart
// card, chart or flood picture split across pages.
//
// The render proof needs a Chromium (the Playwright
// browsers). Where none is installed — the CI checks
// job runs the unit suite without them — its tests skip
// with the reason named, like the golden replay skips
// without its database; everywhere a browser exists
// they run in full.

// ------------------------------------------------------------------
// The golden views
// ------------------------------------------------------------------

function squareAt(lon: number, lat: number, d: number): [number, number][][][] {
  return [
    [
      [
        [lon - d, lat - d],
        [lon + d, lat - d],
        [lon + d, lat + d],
        [lon - d, lat + d],
        [lon - d, lat - d],
      ],
    ],
  ];
}

type ServedFlood = Extract<FloodBundle, { kind: "flood" }>["flood"];

function floodWithMaps(
  maps: FloodMaps,
  patch?: (served: ServedFlood) => void,
  postcode?: string,
): FloodBundle {
  const served = structuredClone(floodServed.flood) as ServedFlood;
  served.maps = maps;
  if (patch) patch(served);
  return { ...floodServed, postcode: postcode ?? floodServed.postcode, flood: served };
}

function mapsFor(
  home: { lat: number; lon: number },
  streetName: string,
  zones: FloodMaps["zones"],
  surfaceWater: FloodMaps["surfaceWater"],
): FloodMaps {
  const homeStreet = {
    name: streetName,
    highway: "residential",
    points: [
      [home.lon - 0.004, home.lat],
      [home.lon + 0.004, home.lat],
    ] as [number, number][],
  };
  return {
    frame: floodMapFrame(home.lat, home.lon),
    streets: [
      homeStreet,
      {
        name: null,
        highway: "service",
        points: [
          [home.lon, home.lat - 0.004],
          [home.lon, home.lat + 0.004],
        ] as [number, number][],
      },
    ],
    homeStreet,
    zones,
    surfaceWater,
  };
}

// Birkdale: the home outside every shaded area — an FZ2
// area and a Low surface-water band mapped nearby.
const BIRKDALE_HOME = { lat: 51.776176, lon: 0.60387 };
const birkdaleFlood = floodWithMaps(
  mapsFor(
    BIRKDALE_HOME,
    "Birkdale Rise",
    {
      polygons: [
        {
          label: "FZ2",
          polygons: squareAt(BIRKDALE_HOME.lon + 0.01, BIRKDALE_HOME.lat + 0.006, 0.004),
        },
      ],
    },
    {
      polygons: [
        {
          label: "Low",
          polygons: squareAt(BIRKDALE_HOME.lon - 0.011, BIRKDALE_HOME.lat - 0.005, 0.0035),
        },
      ],
    },
  ),
);
const birkdaleView: ReportView = buildReportView(input({ flood: birkdaleFlood }));

// Exeter (6 Exeter Road, E16 1GN): the home inside
// Flood Zone 3, its likelihood with the Thames defences
// counted Very low; the golden sold figures (this home
// £270,000; the postcode median £310,000 over 9 counted).
const EXETER_HOME = { lat: 51.5152, lon: 0.0212 };
const exeterResolution: AddressResolution = {
  rung: 1,
  kind: "home",
  address: {
    postcode: "E16 1GN",
    paon: "6",
    saon: null,
    street: "EXETER ROAD",
    locality: null,
    town: "LONDON",
    label: "6 Exeter Road",
  },
  directory: {
    postcode: "E16 1GN",
    latitude: EXETER_HOME.lat,
    longitude: EXETER_HOME.lon,
    council: "Newham",
    ward: "Custom House",
    region: "London",
    lsoaCode: "E01023779",
    msoaCode: "E02000622",
  },
};

const exeterSold: SoldPricesBundle = {
  rung: 1,
  kind: "sold-prices",
  postcode: "E16 1GN",
  loadState: "found",
  recordedCount: 9,
  sourceName: "HM Land Registry",
  edition: "2026-10-28",
  sourceLine: "Source: HM Land Registry Price Paid Data, edition 28 October 2026",
  stateLine: null,
  median: {
    state: "served",
    value: 310000,
    counted: 9,
    spanFrom: "2013-10-14",
    spanTo: "2023-05-25",
    line: "the postcode median",
    explainer: "MEDIAN-EXPLAINER",
  },
  countedSales: [230000, 250000, 270000, 295000, 310000, 325000, 340000, 360000, 385000].map(
    (price) => ({
      price,
      date: "2020-01-01",
      propertyType: "F",
      tenure: "L",
      newBuild: false,
      address: "Exeter Road",
    }),
  ),
  recentSales: [],
  recentLabel: "The most recent recorded sales in this postcode",
  building: null,
  ownHistory: [
    {
      price: 270000,
      date: "2023-05-25",
      propertyType: "F",
      tenure: "L",
      newBuild: false,
      address: "6 Exeter Road",
    },
  ],
  ownLine: null,
  ownExplainer: "OWN-EXPLAINER",
};

const exeterFlood = floodWithMaps(
  mapsFor(
    EXETER_HOME,
    "Exeter Road",
    {
      polygons: [{ label: "FZ3", polygons: squareAt(EXETER_HOME.lon, EXETER_HOME.lat, 0.005) }],
    },
    {
      polygons: [
        {
          label: "Medium",
          polygons: squareAt(EXETER_HOME.lon + 0.012, EXETER_HOME.lat - 0.004, 0.0035),
        },
      ],
    },
  ),
  (served) => {
    for (const layer of served.layers) {
      if (layer.layer === "flood_zone") {
        layer.pointState = "inside";
        layer.line = "this home is in Flood Zone 3";
        layer.covering = {
          label: "FZ3",
          displayLabel: "Flood Zone 3",
          definition: "land with a high probability of flooding from rivers or the sea",
          detail: "river and sea · modelled",
        };
        layer.remainder = null;
      }
      if (layer.layer === "rofrs") {
        layer.pointState = "inside";
        layer.line =
          "the likelihood of flooding from rivers and the sea is very low, counting the defences in place";
        layer.covering = {
          label: "Very low",
          displayLabel: "Very low",
          definition: "a very low likelihood of flooding in any year",
          detail: ">0 m",
        };
      }
    }
  },
  "E16 1GN",
);
const exeterView: ReportView = buildReportView(
  input({ resolution: exeterResolution, sold: exeterSold, flood: exeterFlood }),
);

// ------------------------------------------------------------------
// The pure derivations
// ------------------------------------------------------------------

describe("report-pdf — the file name, the key, the cover, the footer", () => {
  it("the file is named for the home, in the adopted pattern", () => {
    expect(reportPdfFileName(birkdaleView, "CM3 2JT")).toBe(
      "Check My Next Home — 19 Birkdale Rise CM3 2JT.pdf",
    );
    expect(reportPdfFileName(exeterView, "E16 1GN")).toBe(
      "Check My Next Home — 6 Exeter Road E16 1GN.pdf",
    );
  });

  it("a whole-postcode report's name carries its postcode once", () => {
    const view = {
      masthead: { title: "CM3 2JT" },
    } as unknown as ReportView;
    expect(reportPdfFileName(view, "cm3 2jt")).toBe("Check My Next Home — CM3 2JT.pdf");
  });

  it("the storage key is the postcode's directory and the home's slug", () => {
    expect(reportPdfKey("CM3 2JT", "19||BIRKDALE RISE")).toBe(
      "reports/CM32JT/19-birkdale-rise.pdf",
    );
    expect(reportPdfKey("E16 1GN", null)).toBe("reports/E161GN/postcode.pdf");
  });

  it("the cover carries the masthead's address and facts date, untouched", () => {
    const cover = reportPdfCover(birkdaleView);
    expect(cover.title).toBe("19 Birkdale Rise");
    expect(cover.addressLine).toBe(birkdaleView.masthead.addressLine);
    expect(cover.preparedLine).toContain("19 November 2026");
    expect(cover.brandLine).toBe(birkdaleView.masthead.brandLine);
  });

  it("the footer carries the address, Page X of Y and the standing line", () => {
    const html = reportPdfFooterHtml(birkdaleView, "CM3 2JT");
    expect(html).toContain("19 Birkdale Rise · CM3 2JT");
    expect(html).toContain("Facts, not scores");
    expect(html).toContain('<span class="pageNumber"></span>');
    expect(html).toContain('<span class="totalPages"></span>');
  });

  it("printed URLs: the site's own paths gain its address; external URLs stand", () => {
    expect(reportPrintUrl("/check/sold-prices")).toBe(
      "https://checkmynexthome.co.uk/check/sold-prices",
    );
    expect(reportPrintUrl("https://www.gov.uk/check-flooding")).toBe(
      "https://www.gov.uk/check-flooding",
    );
  });
});

// ------------------------------------------------------------------
// The print document and stylesheet
// ------------------------------------------------------------------

describe("report-pdf — the print document", () => {
  it("composes the real page: cover first, then the document, in the site-pages wrapper", () => {
    const html = reportPrintDocument(birkdaleView, "/* test css */");
    expect(html).toContain('<main class="site-pages">');
    expect(html).toContain("/* test css */");
    const coverAt = html.indexOf('class="rpt-cover"');
    const docAt = html.indexOf('class="rpt-doc"');
    expect(coverAt).toBeGreaterThan(-1);
    expect(docAt).toBeGreaterThan(coverAt);
    expect(html).toContain("19 Birkdale Rise");
  });

  it("the Sources links carry their printed URLs in the document; the names stay the links", () => {
    const html = reportPrintDocument(birkdaleView, "");
    // Second pass (BUG-102/103): the printed URL stands
    // bare — no brackets, no touching punctuation — and
    // is itself a working anchor, as the label is.
    expect(html).toContain('<a class="rpt-printUrl" href="/check/sold-prices">');
    expect(html).toContain("> https://checkmynexthome.co.uk/check/sold-prices</a>");
    expect(html).not.toContain("(https://checkmynexthome.co.uk/check/sold-prices)");
  });

  it("the print stylesheet carries the adopted rules", async () => {
    const css = await readFile(join(process.cwd(), "app", "globals.css"), "utf8");
    const printAt = css.indexOf("\n@media print");
    expect(printAt).toBeGreaterThan(-1);
    const print = css.slice(printAt);
    // The cream ground drops to white; cards and charts
    // never split; headings keep with what follows; a
    // tall chart scales (its height is capped); Sources
    // URLs show only in the closing section.
    expect(print).toContain("background: #ffffff");
    expect(print).toContain("break-inside: avoid");
    expect(print).toContain("break-after: avoid");
    expect(print).toContain("max-height: 225mm");
    expect(print).toContain(".rpt-final .rpt-printUrl");
    expect(print).toContain(".floodMap > rect");
    // And on screen the cover and the printed URLs
    // never show.
    const screen = css.slice(0, printAt);
    expect(screen).toContain(".rpt-printUrl");
  });

  it("the standalone print CSS inlines the self-hosted fonts as data URIs", async () => {
    const css = await reportPrintCss();
    expect(css).toContain("data:font/woff2;base64,");
    expect(css).not.toContain('url("/fonts/');
  });
});

// ------------------------------------------------------------------
// Reading a generated PDF back: a small extractor for
// Chromium's own output — per-page text via each font's
// ToUnicode map, pages in the page tree's order.
// ------------------------------------------------------------------

interface PdfObject {
  dict: string;
  stream: string | null;
}

function pdfObjects(bytes: Uint8Array): Map<number, PdfObject> {
  const raw = Buffer.from(bytes).toString("latin1");
  const objects = new Map<number, PdfObject>();
  let pos = 0;
  for (;;) {
    const head = /(\d+) 0 obj\b/g;
    head.lastIndex = pos;
    const m = head.exec(raw);
    if (!m) break;
    const num = Number(m[1]);
    const bodyStart = m.index + m[0].length;
    const streamAt = raw.indexOf("stream", bodyStart);
    const endObjAt = raw.indexOf("endobj", bodyStart);
    if (streamAt !== -1 && streamAt < endObjAt) {
      const dict = raw.slice(bodyStart, streamAt);
      const length = Number(/\/Length (\d+)/.exec(dict)?.[1] ?? 0);
      let dataStart = streamAt + "stream".length;
      if (raw[dataStart] === "\r") dataStart++;
      if (raw[dataStart] === "\n") dataStart++;
      const data = Buffer.from(raw.slice(dataStart, dataStart + length), "latin1");
      let stream: string | null = null;
      try {
        stream = inflateSync(data).toString("latin1");
      } catch {
        stream = null;
      }
      objects.set(num, { dict, stream });
      pos = dataStart + length;
    } else {
      objects.set(num, { dict: raw.slice(bodyStart, endObjAt), stream: null });
      pos = endObjAt + "endobj".length;
    }
  }
  return objects;
}

function parseCMap(stream: string): Map<number, string> {
  const map = new Map<number, string>();
  const decodeDst = (hex: string): string => {
    const buf = Buffer.from(hex, "hex");
    let out = "";
    for (let i = 0; i + 1 < buf.length; i += 2) out += String.fromCharCode(buf.readUInt16BE(i));
    return out;
  };
  const charSection = /beginbfchar([\s\S]*?)endbfchar/g;
  for (const section of stream.matchAll(charSection)) {
    for (const pair of section[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set(parseInt(pair[1], 16), decodeDst(pair[2]));
    }
  }
  const rangeSection = /beginbfrange([\s\S]*?)endbfrange/g;
  for (const section of stream.matchAll(rangeSection)) {
    for (const range of section[1].matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
    )) {
      const lo = parseInt(range[1], 16);
      const hi = parseInt(range[2], 16);
      const dst = Buffer.from(range[3], "hex");
      for (let code = lo; code <= hi && code - lo < 10000; code++) {
        const unit = Buffer.from(dst);
        unit.writeUInt16BE(unit.readUInt16BE(unit.length - 2) + (code - lo), unit.length - 2);
        map.set(code, decodeDst(unit.toString("hex")));
      }
    }
    for (const range of section[1].matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([^\]]+)\]/g,
    )) {
      const lo = parseInt(range[1], 16);
      const dsts = [...range[3].matchAll(/<([0-9A-Fa-f]+)>/g)];
      dsts.forEach((dst, i) => map.set(lo + i, decodeDst(dst[1])));
    }
  }
  return map;
}

function pdfPageTexts(bytes: Uint8Array): string[] {
  const objects = pdfObjects(bytes);
  const fontMaps = new Map<number, Map<number, string>>();
  for (const [num, obj] of objects) {
    const toUnicode = /\/ToUnicode (\d+) 0 R/.exec(obj.dict);
    if (toUnicode) {
      const cmap = objects.get(Number(toUnicode[1]))?.stream;
      if (cmap) fontMaps.set(num, parseCMap(cmap));
    }
  }
  // The leaves of the page tree, in order: the catalog's
  // /Pages root, walked down — a long document's tree
  // has intermediate /Pages nodes between the root and
  // the /Page leaves.
  const leaves: number[] = [];
  const walkTree = (num: number, depth: number) => {
    const obj = objects.get(num);
    if (!obj || depth > 8) return;
    if (/\/Type \/Page\b/.test(obj.dict) && !/\/Type \/Pages\b/.test(obj.dict)) {
      leaves.push(num);
      return;
    }
    const k = /\/Kids \[([^\]]+)\]/.exec(obj.dict);
    if (k) for (const ref of k[1].matchAll(/(\d+) 0 R/g)) walkTree(Number(ref[1]), depth + 1);
  };
  for (const obj of objects.values()) {
    const root = /\/Type \/Catalog[\s\S]*?\/Pages (\d+) 0 R/.exec(obj.dict);
    if (root) {
      walkTree(Number(root[1]), 0);
      break;
    }
  }
  const kids = leaves;
  const decodeHex = (hex: string, font: Map<number, string> | null): string => {
    let out = "";
    for (let i = 0; i + 4 <= hex.length; i += 4) {
      out += font?.get(parseInt(hex.slice(i, i + 4), 16)) ?? "";
    }
    return out;
  };
  return kids.map((pageNum) => {
    const page = objects.get(pageNum);
    if (!page) return "";
    const fonts = new Map<string, Map<number, string>>();
    const fontDictAt = page.dict.indexOf("/Font <<");
    if (fontDictAt !== -1) {
      const fontDict = page.dict.slice(fontDictAt, page.dict.indexOf(">>", fontDictAt));
      for (const entry of fontDict.matchAll(/\/(\w+) (\d+) 0 R/g)) {
        const cmap = fontMaps.get(Number(entry[2]));
        if (cmap) fonts.set(entry[1], cmap);
      }
    }
    const contents: string[] = [];
    const single = /\/Contents (\d+) 0 R/.exec(page.dict);
    const array = /\/Contents \[([^\]]+)\]/.exec(page.dict);
    if (single) {
      const stream = objects.get(Number(single[1]))?.stream;
      if (stream) contents.push(stream);
    } else if (array) {
      for (const ref of array[1].matchAll(/(\d+) 0 R/g)) {
        const stream = objects.get(Number(ref[1]))?.stream;
        if (stream) contents.push(stream);
      }
    }
    let current: Map<number, string> | null = null;
    let out = "";
    const token =
      /\/(\w+) [0-9.]+ Tf|<([0-9A-Fa-f]+)>\s*Tj|\[([^\]]*)\]\s*TJ|\(((?:\\.|[^\\()])*)\)\s*Tj/g;
    for (const content of contents) {
      for (const m of content.matchAll(token)) {
        if (m[1]) current = fonts.get(m[1]) ?? null;
        else if (m[2]) out += decodeHex(m[2], current);
        else if (m[3]) {
          for (const h of m[3].matchAll(/<([0-9A-Fa-f]+)>/g)) out += decodeHex(h[1], current);
        } else if (m[4]) out += m[4].replace(/\\(.)/g, "$1");
      }
    }
    return out.replace(/\s+/g, " ").trim();
  });
}

// Whitespace- and case-insensitive comparison form:
// wrapped lines and glyph-by-glyph footer runs
// concatenate without reliable spacing, and headings
// print in their text-transformed (uppercase) form, so
// assertions compare squashed and lowered.
function squash(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

// Every chart-shaped block in a view, as the pair a
// split would separate: its title and the tail of its
// caption (the flood pictures: title and attribution).
function cardPairs(view: ReportView): { title: string; tail: string }[] {
  const pairs: { title: string; tail: string }[] = [];
  const tailOf = (caption: string) => caption.split(" ").slice(-5).join(" ");
  const walk = (blocks: ReportBlock[]) => {
    for (const block of blocks) {
      if (block.type === "bars" || block.type === "statTile")
        pairs.push({ title: block.title, tail: tailOf(block.caption) });
      else if (block.type === "dotPlot")
        pairs.push({ title: block.plot.title, tail: tailOf(block.plot.caption) });
      else if (block.type === "monthChart")
        pairs.push({ title: block.chart.title, tail: tailOf(block.chart.caption) });
      else if (block.type === "floodMap")
        pairs.push({ title: block.map.title, tail: "Open Database Licence" });
      else if (block.type === "map")
        pairs.push({ title: "Where the named places are", tail: tailOf(block.map.caption) });
      else if (block.type === "chartGrid") walk(block.cards);
    }
  };
  for (const section of view.sections) walk(section.blocks);
  return pairs;
}

// ------------------------------------------------------------------
// The render proof
// ------------------------------------------------------------------

async function chromiumAvailable(): Promise<boolean> {
  try {
    const { chromium } = await import("@playwright/test");
    const browser = await chromium.launch();
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

describe("report-pdf — the render proof (the two golden reports, printed)", () => {
  const cases = [
    {
      name: "Birkdale",
      view: birkdaleView,
      postcode: "CM3 2JT",
      homeKey: "19||BIRKDALE RISE",
      fileName: "Check My Next Home — 19 Birkdale Rise CM3 2JT.pdf",
      key: "reports/CM32JT/19-birkdale-rise.pdf",
      footerAddress: "19 Birkdale Rise · CM3 2JT",
    },
    {
      name: "Exeter",
      view: exeterView,
      postcode: "E16 1GN",
      homeKey: "6||EXETER ROAD",
      fileName: "Check My Next Home — 6 Exeter Road E16 1GN.pdf",
      key: "reports/E161GN/6-exeter-road.pdf",
      footerAddress: "6 Exeter Road · E16 1GN",
    },
  ];

  for (const golden of cases) {
    it(`${golden.name}: cover first, footer on every page, Sources URLs printed, nothing split`, async (ctx) => {
      if (!(await chromiumAvailable())) {
        ctx.skip("no Chromium available in this environment");
        return;
      }
      const { fileName, bytes } = await generateReportPdf(golden.view, golden.postcode);
      expect(fileName).toBe(golden.fileName);
      expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");

      const pages = pdfPageTexts(bytes);
      // A full nine-section report with charts and two
      // flood pictures: a sane page count, never a
      // pamphlet and never a runaway.
      expect(pages.length).toBeGreaterThanOrEqual(6);
      expect(pages.length).toBeLessThanOrEqual(24);
      const squashed = pages.map(squash);

      // The cover stands alone on page 1: the address
      // and the facts date, and none of the document.
      expect(squashed[0]).toContain(squash(golden.view.masthead.title));
      expect(squashed[0]).toContain(squash(golden.view.masthead.preparedLine));
      expect(squashed[0]).not.toContain(squash("The short version"));

      // The footer on every page: the address, the
      // page's own number of the total, the line.
      pages.forEach((_, i) => {
        expect(squashed[i]).toContain(squash(golden.footerAddress));
        expect(squashed[i]).toContain(squash(`Page ${i + 1} of ${pages.length}`));
        expect(squashed[i]).toContain(squash("Facts, not scores"));
      });

      // Sources prints the URLs beside the names —
      // bare, without brackets (BUG-102).
      const sourcesUrl = squash("https://checkmynexthome.co.uk/check/sold-prices");
      expect(squashed.some((page) => page.includes(sourcesUrl))).toBe(true);

      // Nothing splits: every chart card, chart and
      // flood picture keeps its title and its caption
      // tail on one page.
      const pairs = cardPairs(golden.view);
      expect(pairs.length).toBeGreaterThanOrEqual(6);
      for (const pair of pairs) {
        const together = squashed.some(
          (page) => page.includes(squash(pair.title)) && page.includes(squash(pair.tail)),
        );
        expect(together, `${pair.title} split from its caption`).toBe(true);
      }
    }, 180_000);
  }

  it("every protected element fits within one printed page (the scale-to-fit bound)", async (ctx) => {
    if (!(await chromiumAvailable())) {
      ctx.skip("no Chromium available in this environment");
      return;
    }
    const { chromium } = await import("@playwright/test");
    const css = await reportPrintCss();
    const html = reportPrintDocument(birkdaleView, css);
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      // The printed page's own content width: A4 less
      // the declared side margins (182mm at 96 CSS px
      // per inch) — the layout the PDF paginates.
      await page.setViewportSize({ width: 688, height: 1123 });
      await page.setContent(html, { waitUntil: "load" });
      await page.emulateMedia({ media: "print" });
      const heights = await page.evaluate(() => {
        const els = document.querySelectorAll(
          ".rpt-chartCard, .rpt-doc table, .rpt-tiles, .rpt-chartGrid",
        );
        return [...els].map((el) => el.getBoundingClientRect().height);
      });
      expect(heights.length).toBeGreaterThanOrEqual(6);
      // A4's printable height at the declared margins:
      // (297 − 16 − 18)mm at 96 CSS px per inch.
      const printablePx = ((297 - 16 - 18) / 25.4) * 96;
      for (const height of heights) expect(height).toBeLessThanOrEqual(printablePx);
    } finally {
      await browser.close();
    }
  }, 180_000);

  it("generate + store: the stored file reads back through the seam, byte for byte", async (ctx) => {
    if (!(await chromiumAvailable())) {
      ctx.skip("no Chromium available in this environment");
      return;
    }
    const root = await mkdtemp(join(tmpdir(), "cmnh-report-pdf-"));
    try {
      const store = createLocalReportPdfStore(root);
      const stored = await storeReportPdf(birkdaleView, "CM3 2JT", "19||BIRKDALE RISE", store);
      expect(stored.fileName).toBe("Check My Next Home — 19 Birkdale Rise CM3 2JT.pdf");
      expect(stored.key).toBe("reports/CM32JT/19-birkdale-rise.pdf");
      expect(stored.stored).toBe(true);
      expect(await store.get(stored.key)).toEqual(stored.bytes);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 180_000);
});

// ------------------------------------------------------------------
// The sample report's PDF (M8.8)
// ------------------------------------------------------------------

describe("the sample report's PDF (M8.8)", () => {
  it("the file name is descriptive: the brand, the word Sample, the example home", () => {
    expect(sampleReportPdfFileName()).toBe(
      "Check My Next Home — Sample report — 12 Willow Close MB3 4QX.pdf",
    );
  });

  it("the cover carries the SAMPLE marking, the name with its tagline, and the invented-example line", () => {
    const cover = sampleReportPdfCover();
    expect(cover.mark).toBe("SAMPLE");
    expect(cover.brandLine).toBe("Check My Next Home");
    // The pairing rule (T-SEO-06's form): the name never
    // stands bare on a cover — the tagline rides with it.
    expect(cover.taglineLine).toBe("Check the house. Choose the home.");
    expect(cover.title).toBe("Sample report — 12 Willow Close");
    expect(cover.addressLine).toBe("Millbrook, Kingsford, Kent MB3 4QX");
    expect(cover.exampleLine).toContain("invented example");
  });

  it("no sample surface names a real home", () => {
    const surfaces = [
      sampleReportPdfFileName(),
      JSON.stringify(sampleReportPdfCover()),
      sampleReportPdfFooterHtml(),
      sampleReportPdfContentDisposition(),
    ].join("\n");
    expect(surfaces).not.toContain("Birkdale");
    expect(surfaces).not.toContain("CM3 2JT");
    expect(surfaces).not.toContain("Exeter");
    expect(surfaces).not.toContain("E16 1GN");
  });

  it("the footer names the document a sample on every page, in the twin's shape", () => {
    const html = sampleReportPdfFooterHtml();
    expect(html).toContain("Sample report — 12 Willow Close · MB3 4QX");
    expect(html).toContain("Facts, not scores");
    expect(html).toContain('<span class="pageNumber"></span>');
    expect(html).toContain('<span class="totalPages"></span>');
  });

  it("the download disposition carries the descriptive name, UTF-8 and ASCII forms", () => {
    const disposition = sampleReportPdfContentDisposition();
    expect(disposition.startsWith("attachment; ")).toBe(true);
    expect(disposition).toContain(
      'filename="Check My Next Home - Sample report - 12 Willow Close MB3 4QX.pdf"',
    );
    expect(disposition).toContain("filename*=UTF-8''");
    expect(disposition).toContain(
      encodeURIComponent("Check My Next Home — Sample report — 12 Willow Close MB3 4QX.pdf"),
    );
  });

  it("the print view composes the cover first, then the sample page's own document", () => {
    // The composition the PDF is printed from is a Server
    // Component (app/sample-report/print) — a route
    // handler's graph cannot render markup to a string in
    // this setup, so the composition is pinned here as a
    // render, the way the sample page's own tests pin it.
    const html = renderToStaticMarkup(createElement(SampleReportPrintPage));
    expect(html).toContain('<main class="site-pages">');
    const coverAt = html.indexOf('class="rpt-cover"');
    const docAt = html.indexOf('class="report-wrap"');
    expect(coverAt).toBeGreaterThan(-1);
    expect(docAt).toBeGreaterThan(coverAt);
    // The cover's furniture, in order: the marking, the
    // paired name and tagline, the title, the example
    // home, the disclosure.
    const cover = html.slice(coverAt, docAt);
    expect(cover).toContain(">SAMPLE</span>");
    expect(cover).toContain("Check My Next Home");
    expect(cover).toContain("Check the house. Choose the home.");
    expect(cover).toContain("Sample report — 12 Willow Close");
    expect(cover).toContain("Millbrook, Kingsford, Kent MB3 4QX");
    expect(cover).toContain("invented example");
    // And the document that follows is the sample page's
    // own — its banner and its dummy home, not a bought
    // report's view.
    expect(html).toContain("This is a sample report");
    expect(html).toContain("12 Willow Close");
    expect(html).not.toContain("Birkdale");
    // The generator prints the print view, at the app's
    // own address unless an origin is handed to it.
    expect(samplePrintUrl("http://127.0.0.1:4321")).toBe(
      "http://127.0.0.1:4321/sample-report/print",
    );
  });

  it("the generated PDF: SAMPLE cover first, the sample footer on every page", async (ctx) => {
    if (!(await chromiumAvailable())) {
      ctx.skip("no Chromium available in this environment");
      return;
    }
    // The generator prints the app's print view over
    // HTTP; the test stands in for the app with a local
    // server holding the same composition, dressed in
    // the twin's standalone print CSS (the app itself
    // serves the same stylesheet with the page).
    const css = await reportPrintCss();
    const body = renderToStaticMarkup(createElement(SampleReportPrintPage));
    const document =
      `<!doctype html>\n<html lang="en-GB"><head><meta charset="utf-8">` +
      `<title>Sample report — print view</title><style>${css}</style></head>` +
      `<body>${body}</body></html>`;
    const server = createServer((request, response) => {
      if (request.url === "/sample-report/print") {
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(document);
      } else {
        response.statusCode = 404;
        response.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const { fileName, bytes } = await generateSampleReportPdf(`http://127.0.0.1:${port}`);
      expect(fileName).toBe("Check My Next Home — Sample report — 12 Willow Close MB3 4QX.pdf");
      expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");

      const pages = pdfPageTexts(bytes);
      expect(pages.length).toBeGreaterThanOrEqual(6);
      const squashed = pages.map(squash);

      // The cover stands alone on page 1: the marking, the
      // paired name and tagline, the example home — and
      // none of the document.
      expect(squashed[0]).toContain(squash("SAMPLE"));
      expect(squashed[0]).toContain(squash("Check My Next Home"));
      expect(squashed[0]).toContain(squash("Check the house. Choose the home."));
      expect(squashed[0]).toContain(squash("Sample report — 12 Willow Close"));
      expect(squashed[0]).toContain(squash("invented example"));
      expect(squashed[0]).not.toContain(squash("The short version"));

      // The footer on every page after the cover: the
      // sample address, the page's own number of the
      // total, the standing line.
      pages.forEach((_, i) => {
        if (i === 0) return;
        expect(squashed[i]).toContain(squash("Sample report — 12 Willow Close · MB3 4QX"));
        expect(squashed[i]).toContain(squash(`Page ${i + 1} of ${pages.length}`));
        expect(squashed[i]).toContain(squash("Facts, not scores"));
      });

      // The whole file names no real home.
      expect(squashed.join(" ")).not.toContain(squash("Birkdale"));
    } finally {
      server.close();
    }
  }, 180_000);
});
