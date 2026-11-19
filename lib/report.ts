import { displayText, type AddressResolution } from "./address";
import type { AreaBundle, AreaSections, ServedCertificate } from "./area-bundle";
import { CHECK_PAGES } from "./check-pages";
import type { CrimeBundle } from "./crime";
import { crimeCategoryLabel } from "./district";
import type { FloodBundle, FloodLiveWarnings, ServedFloodWarning } from "./flood";
import { formatFiledDate, formatMiles, formatPounds } from "./journey";
import type { CategoryAnswer, NearbyBundle, NearbyCategory, NearbyPlace } from "./nearby";
import {
  CATCHMENT_BLOCK_HEADING,
  CATCHMENT_BLOCK_LINE,
  CATCHMENT_LINK,
  reportRoute,
} from "./results";
import { REPORT_DOOR_STATE, type ReportDoorState } from "./site";
import type { ServedSale, SoldPricesBundle } from "./sold-prices";

// The on-screen report (plan step M8.1): the detailed
// report's nine sections, built from the five check
// bundles exactly as the serve layer assembles them for
// the free check — wired to the real backend from the
// first step (D67), no mock data path anywhere.
//
// THE SNAPSHOT DECISION (M8.1 scope note (iv), settled
// here for M8.4 to consume): there is ONE snapshot source
// for a report — this module's buildReportView. It takes
// the five served bundles plus the resolution and returns
// a plain, JSON-serialisable view model (ReportView):
// every figure, line and ordering the report shows is
// decided here, once. The on-screen renderer
// (components/ReportPage.tsx) renders that model and
// derives nothing; the PDF renderer at M8.4 consumes the
// SAME model and derives nothing either, so the screen
// and the PDF can never disagree about what a report
// says. The database `reports` table is the M9-era
// order/delivery record, not a content store — nothing
// here reads or writes it.
//
// THE BUYER-ROUTE SEAM (M8.1 scope note (ii)): a bought
// report is reached at REPORT_VIEW_ROUTE ("/report/view")
// with the journey family's own parameters — ?postcode=
// and, for a single home, &home= (the homeKeyOf key, as
// reportRoute builds for the door). M8.6's safe download
// links, M8.7's tester unlock and M9's payment wiring all
// land on this route and these parameters; nothing later
// needs a second shape. While REPORT_DOOR_STATE holds,
// the route serves nobody: app/report/view/page.tsx
// redirects to the door (reportRoute) before any bundle
// is assembled, so the complete pages exist behind the
// door and the door is not weakened (scope note (i)).
// The flip is the reviewed constant's own change at
// M8.7/M9.6, in the same commit as the lines it gates
// (the M7.6 pattern).
//
// Format authorities: the approved report format (the
// Birkdale detailed-report artifact, v12) governs section
// order, content and wording; the Final Sample Master's
// view 7, minus its SAMPLE furniture, governs the
// on-screen layout. Where the samples and the decisions
// disagree, the decisions govern (the M8.1 carve-outs:
// no IMD rank or score anywhere — the decile in words
// only; no computed sale tiles in Section 1; no monthly
// cost-of-ownership figure anywhere; the flood section in
// its served three-layer form; crime with its D39
// calibration lines). Nation rendering inherits the
// bundles' own not-covered states section by section
// (scope note (v)): a Scottish or Northern Irish report
// renders each section's named not-covered state, never a
// blank and never England data.

export const REPORT_VIEW_ROUTE = "/report/view";

// The buyer-route seam's address builder, on reportRoute's
// own pattern: the postcode always, the home key where the
// report is for one home.
export function reportViewRoute(postcode: string, homeKey?: string | null): string {
  const params = new URLSearchParams({ postcode });
  if (homeKey) params.set("home", homeKey);
  return `${REPORT_VIEW_ROUTE}?${params.toString()}`;
}

// The door gate for the view route, factored out of the
// page so the seam is testable without a server: while
// the door state is "holding" the answer is the door's
// own href for the same identity; any later state serves.
export function reportViewGate(
  postcode: string,
  homeKey: string | null,
  doorState: ReportDoorState = REPORT_DOOR_STATE,
): { action: "door"; href: string } | { action: "serve" } {
  if (doorState === "holding") return { action: "door", href: reportRoute(postcode, homeKey) };
  return { action: "serve" };
}

// The full D9 standing wording, verbatim (decision D9:
// "use it verbatim or near-verbatim wherever a disclaimer
// block appears" — every report, on-screen and PDF,
// carries it in the closing disclaimer block). The short
// form beside the free results is DISCLAIMER_SHORT_FORM
// in lib/site.ts; this is the report's full form, pinned
// by tests/report.test.ts.
export const REPORT_DISCLAIMER_D9 =
  "We present official data as it is published, with its source and date. We do not score, rate or recommend homes or areas, and we do not interpret the data for you — what it means for your decision is your own judgement. Data can be wrong at source, out of date, or incomplete; before you rely on any figure, check it with the council, your solicitor, or the body that published it.";

// The check explanations named in the report (the M7.12
// deferral, discharged at this step): each report section
// names its own How-we-check page(s) — the /check/ pages
// whose method the section's figures rest on — rendered
// as the closing section's link list and as each
// section's own closing link row. Paths are keys of
// CHECK_PAGES; labels come from there, never re-typed.
export const REPORT_SECTION_CHECK_LINKS: Record<number, string[]> = {
  1: ["/check/sold-prices", "/check/epc"],
  2: ["/check/sold-prices"],
  3: ["/check/schools"],
  4: ["/check/family-essentials", "/check/air-quality", "/check/noise", "/check/crime"],
  5: ["/check/family-essentials", "/check/public-transport"],
  6: [
    "/check/council-tax-band",
    "/check/epc",
    "/check/solar-potential",
    "/check/ev-charging",
    "/check/broadband",
    "/check/mobile-coverage",
    "/check/planning-constraints",
  ],
  7: ["/check/flood-risk"],
  8: [],
  9: [],
};

// ------------------------------------------------------------------
// The view model — plain data, JSON-serialisable, the one
// snapshot source (see the header). The renderers (screen
// now, PDF at M8.4) map blocks to their medium and derive
// nothing.
// ------------------------------------------------------------------

export interface ReportRow {
  name: string;
  detail: string | null;
  tag: string | null;
  dist: string | null;
  // Lines that belong to this row alone, printed under it
  // (a school's destinations block, a surgery's CQC
  // rating line).
  extra: string[];
}

export interface ReportMapPin {
  n: number;
  name: string;
  group: string;
  miles: number;
  x: number;
  y: number;
}

export interface ReportMapModel {
  // The projection is decided here, in the model: mile
  // offsets from the home, fitted to the renderer's
  // viewBox (760 × 520) at one uniform scale, so the PDF
  // draws the identical picture from the same numbers.
  homeX: number;
  homeY: number;
  homeLabel: string;
  rings: { r: number; label: string }[];
  pins: ReportMapPin[];
  caption: string;
  ariaLabel: string;
}

export type ReportBlock =
  | { type: "intro"; text: string }
  | { type: "line"; text: string }
  // A "none found" finding: the format prints these in
  // bold only (the approved format's rule).
  | { type: "boldLine"; text: string }
  | { type: "sub"; text: string }
  | { type: "tiles"; tiles: { label: string; value: string; sub: string }[] }
  | { type: "rows"; rows: ReportRow[] }
  | { type: "table"; head: string[]; rows: string[][]; caption?: string }
  | {
      type: "bars";
      title: string;
      rows: { label: string; pct: number; count: number }[];
      caption: string;
    }
  | { type: "list"; items: string[] }
  | { type: "note"; text: string }
  | { type: "lineLink"; text: string; label: string; href: string }
  | { type: "map"; map: ReportMapModel }
  | { type: "links"; links: { label: string; href: string }[] };

export interface ReportSectionView {
  number: number;
  title: string;
  blocks: ReportBlock[];
}

export interface ReportView {
  masthead: {
    brandLine: string;
    title: string;
    addressLine: string | null;
    meta: { label: string; value: string }[];
    preparedLine: string;
  };
  shortVersion: { groups: { heading: string; lines: string[] }[] } | null;
  sections: ReportSectionView[];
}

export interface ReportInput {
  resolution: AddressResolution;
  nearby: NearbyBundle;
  flood: FloodBundle;
  area: AreaBundle;
  sold: SoldPricesBundle;
  crime: CrimeBundle;
  now: Date;
}

// ------------------------------------------------------------------
// Small shared forms
// ------------------------------------------------------------------

// The sold-prices register codes in their display words —
// the same maps lib/results.ts and lib/shortlist-card.ts
// carry (theirs are module-private); keep the three in
// step.
const PROPERTY_TYPE_LABELS: Record<string, string> = {
  D: "Detached",
  S: "Semi-detached",
  T: "Terraced",
  F: "Flat or maisonette",
  O: "Other",
};
const TENURE_LABELS: Record<string, string> = {
  F: "Freehold",
  L: "Leasehold",
};

function monthLabel(isoMonth: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(isoMonth);
  if (!match) return isoMonth;
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${months[Number(match[2]) - 1] ?? isoMonth} ${match[1]}`;
}

// The decile in words, on the IMD loader's own
// deterministic rendering (loaders/load-imd.mjs): deciles
// 1–5 "among the more deprived …", 6–10 "among the less
// deprived …". The report prints no IMD score, no rank
// and no bare decile figure in the demographics block
// (carve-out X1/X5, D26) — the lead line is the bundle's
// own served summary, and the domains take this same
// words form.
function decileWords(decile: number): string {
  return decile <= 5
    ? `among the more deprived ${decile * 10} percent of areas in England`
    : `among the less deprived ${(11 - decile) * 10} percent of areas in England`;
}

function category(bundle: NearbyBundle, key: NearbyCategory): CategoryAnswer | null {
  if (bundle.kind !== "distances") return null;
  return bundle.categories.find((c) => c.category === key) ?? null;
}

// One category's place rows, in the bundle's own order.
function placeRows(answer: CategoryAnswer, extra?: (place: NearbyPlace) => string[]): ReportRow[] {
  return answer.places.map((place) => ({
    name: place.name,
    detail: place.detail,
    tag: null,
    dist: formatMiles(place.miles),
    extra: extra ? extra(place) : [],
  }));
}

// The count line D22 pairs with every nearest-3 list:
// where more filed within the radius than are named, the
// count is stated; where the named list is the whole
// count, the rows speak for themselves.
function countLine(answer: CategoryAnswer): ReportBlock | null {
  if (answer.state !== "within") return null;
  if (answer.countWithin <= answer.places.length) return null;
  return {
    type: "line",
    text: `${answer.countWithin} ${answer.label} within 2 miles — the nearest ${answer.places.length} are named above.`,
  };
}

// A category's non-"within" sentence: an absence finding
// (the empty states) prints bold only, on the format's
// rule; a coverage state (not filed) prints as a plain
// named line — it is a statement about our data, not a
// finding about the area.
function stateLine(answer: CategoryAnswer): ReportBlock | null {
  if (answer.state === "within" || answer.line === null) return null;
  if (answer.state === "empty" || answer.state === "empty-map" || answer.state === "none-within")
    return { type: "boldLine", text: answer.line };
  return { type: "line", text: answer.line };
}

function section(number: number, title: string, blocks: ReportBlock[]): ReportSectionView {
  const links = (REPORT_SECTION_CHECK_LINKS[number] ?? []).map((href) => ({
    label: CHECK_PAGES[href].name,
    href,
  }));
  if (links.length > 0) blocks.push({ type: "links", links });
  return { number, title, blocks };
}

// The rung-1/2 payload extractions. The report route only
// ever resolves a home or a whole postcode, so the wider-
// area and no-location bundle variants never reach the
// builder; where a brain serves a named state instead of
// its payload, the section renders that state.
function areaSections(input: ReportInput): AreaSections | null {
  return input.area.kind === "area-bundle" ? input.area.sections : null;
}

type FloodServed = Extract<FloodBundle, { kind: "flood" }>["flood"];

function floodServed(input: ReportInput): FloodServed | null {
  return input.flood.kind === "flood" ? input.flood.flood : null;
}

function floodStateLine(input: ReportInput): string | null {
  return input.flood.kind === "flood" ? null : input.flood.flood.reason;
}

// The certificate that is this home's own, where one of
// the postcode's certificates is filed under the home's
// own address: a conservative starts-with match on the
// normalised address (the register's address against the
// resolution's label, then its number-and-street key).
// No match, no claim — the masthead and Section 1 simply
// carry no certificate facts for the home.
function matchedCertificate(
  resolution: AddressResolution,
  certificates: ServedCertificate[],
): ServedCertificate | null {
  if (resolution.rung !== 1) return null;
  const address = resolution.address;
  const norm = (value: string) =>
    value
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const label = norm(address.label);
  const streetKey = norm(`${address.paon} ${address.street}`);
  for (const cert of certificates) {
    const certAddress = norm(cert.address);
    if (certAddress === label || certAddress.startsWith(`${label} `)) return cert;
    if (streetKey.length > 3 && certAddress.startsWith(streetKey)) return cert;
  }
  return null;
}

// ------------------------------------------------------------------
// Masthead and the grouped short version
// ------------------------------------------------------------------

function buildMasthead(input: ReportInput, cert: ServedCertificate | null): ReportView["masthead"] {
  const { resolution, sold } = input;
  const meta: { label: string; value: string }[] = [];
  let title: string;
  let addressLine: string | null = null;
  if (resolution.rung === 1) {
    const address = resolution.address;
    title = address.label;
    const place = [address.locality, address.town]
      .filter((part): part is string => part !== null && part !== "")
      .map((part) => displayText(part))
      .join(", ");
    addressLine = place ? `${place} ${address.postcode}` : address.postcode;
    if (cert?.dwellingType) meta.push({ label: "Property", value: cert.dwellingType });
    if (cert?.floorAreaSqM !== null && cert?.floorAreaSqM !== undefined)
      meta.push({ label: "Floor area", value: `${cert.floorAreaSqM} m²` });
    if (sold.kind === "sold-prices" && "ownHistory" in sold && sold.ownHistory.length > 0) {
      const last = sold.ownHistory[0];
      meta.push({ label: "Last sale", value: formatPounds(last.price) });
      meta.push({ label: "Sale date", value: formatFiledDate(last.date) });
    }
  } else if (resolution.rung === 2) {
    title = resolution.directory.postcode;
    addressLine = "The whole postcode";
    if (cert?.dwellingType) meta.push({ label: "Property", value: cert.dwellingType });
  } else {
    // Rung 3/4 resolutions never reach the report (the
    // route resolves homes and postcodes only); the
    // generic form keeps the builder total.
    title = "Detailed report";
  }
  const prepared = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(input.now);
  const postcode =
    resolution.rung === 1 || resolution.rung === 2 ? resolution.directory.postcode : "";
  return {
    brandLine: "Check My Next Home · Detailed Report",
    title,
    addressLine,
    meta,
    preparedLine: postcode ? `Prepared ${prepared} · ${postcode}` : `Prepared ${prepared}`,
  };
}

function nearestOf(answer: CategoryAnswer | null): { name: string; miles: number } | null {
  if (!answer) return null;
  if (answer.places.length > 0)
    return { name: answer.places[0].name, miles: answer.places[0].miles };
  return answer.beyondNearest;
}

function buildShortVersion(input: ReportInput): ReportView["shortVersion"] {
  const { nearby, flood, area, sold, crime } = input;
  const groups: { heading: string; lines: string[] }[] = [];
  const add = (heading: string, lines: (string | null)[]) => {
    const kept = lines.filter((line): line is string => line !== null && line !== "");
    if (kept.length > 0) groups.push({ heading, lines: kept });
  };

  // Price & sold history.
  const priceLines: (string | null)[] = [];
  if (sold.kind === "sold-prices") {
    if ("soldPrices" in sold) {
      priceLines.push(sold.soldPrices.reason);
    } else {
      if (sold.rung === 1 && sold.ownHistory.length > 0) {
        const last = sold.ownHistory[0];
        priceLines.push(
          `This home last sold for ${formatPounds(last.price)} on ${formatFiledDate(last.date)}.`,
        );
      }
      priceLines.push(sold.median.line ?? sold.stateLine);
    }
  } else {
    priceLines.push(sold.soldPrices.reason);
  }
  add("Price & sold history", priceLines);

  // Education.
  const primary = nearestOf(category(nearby, "schools-primary"));
  const secondary = nearestOf(category(nearby, "schools-secondary"));
  const secondaryAnswer = category(nearby, "schools-secondary");
  add("Education", [
    primary ? `Nearest primary: ${primary.name}, ${formatMiles(primary.miles)}.` : null,
    secondary ? `Nearest secondary: ${secondary.name}, ${formatMiles(secondary.miles)}.` : null,
    secondaryAnswer?.nearestSelectiveLine ?? null,
  ]);

  // Health.
  const gp = nearestOf(category(nearby, "gp"));
  const dentist = nearestOf(category(nearby, "dentist"));
  const pharmacy = nearestOf(category(nearby, "pharmacy"));
  const aeAnswer = category(nearby, "ae");
  add("Health", [
    gp ? `GP surgery ${formatMiles(gp.miles)} — ${gp.name}.` : null,
    dentist && pharmacy
      ? `NHS dentist ${formatMiles(dentist.miles)} and pharmacy ${formatMiles(pharmacy.miles)}.`
      : null,
    aeAnswer && aeAnswer.state === "none-within" ? aeAnswer.line : null,
    aeAnswer && aeAnswer.state === "within" && aeAnswer.places.length > 0
      ? `A&E ${formatMiles(aeAnswer.places[0].miles)} — ${aeAnswer.places[0].name}.`
      : null,
  ]);

  // What's nearby.
  const station = nearestOf(category(nearby, "station"));
  const supermarket = category(nearby, "supermarket");
  const park = nearestOf(category(nearby, "parks"));
  const library = nearestOf(category(nearby, "libraries"));
  add("What's nearby", [
    station ? `${station.name} ${formatMiles(station.miles)}.` : null,
    supermarket && supermarket.places.length > 0
      ? supermarket.places.map((p) => `${p.name} ${formatMiles(p.miles)}`).join("; ") + "."
      : null,
    park && library
      ? `${park.name} ${formatMiles(park.miles)}; library ${formatMiles(library.miles)}.`
      : null,
  ]);

  // Risks.
  const riskLines: (string | null)[] = [];
  if (flood.kind === "flood") {
    for (const layer of flood.flood.layers) riskLines.push(`${layer.title}: ${layer.line}`);
  } else {
    riskLines.push(flood.flood.reason);
  }
  if (crime.kind === "crime" && crime.crime.state === "served") {
    riskLines.push(crime.crime.totalLine + ".");
    if (crime.crime.perHead) riskLines.push(crime.crime.perHead.line + ".");
    if (crime.crime.englandFigure) riskLines.push(crime.crime.englandFigure.line + ".");
  }
  add("Risks", riskLines);

  // Home, costs & energy.
  if (area.kind === "area-bundle") {
    const sections = area.sections;
    add("Home, costs & energy", [
      sections.epc.line,
      sections.councilTax.line,
      sections.imd.line,
      sections.broadband.line,
    ]);
  }

  return groups.length > 0 ? { groups } : null;
}

// ------------------------------------------------------------------
// Section 1 — Price & this home; Section 2 — Sold prices nearby
// ------------------------------------------------------------------

function saleRow(sale: ServedSale): string[] {
  return [
    formatFiledDate(sale.date),
    formatPounds(sale.price),
    sale.propertyType ? (PROPERTY_TYPE_LABELS[sale.propertyType] ?? sale.propertyType) : "—",
    sale.tenure ? (TENURE_LABELS[sale.tenure] ?? sale.tenure) : "—",
    sale.newBuild === null ? "—" : sale.newBuild ? "Yes" : "No",
  ];
}

function section1(input: ReportInput, cert: ServedCertificate | null): ReportSectionView {
  const blocks: ReportBlock[] = [];
  const { sold } = input;
  if (sold.kind !== "sold-prices" || "soldPrices" in sold) {
    blocks.push({ type: "line", text: sold.soldPrices.reason });
    return section(1, "Price & this home", blocks);
  }
  if (sold.rung === 2) {
    // A postcode report: Section 1 carries the postcode's
    // own recorded sales (Section 2 carries the median
    // form), so no part of the section is a blank.
    blocks.push({
      type: "intro",
      text: `Every recorded sale filed for this postcode, newest first — category A and category B sales together, as HM Land Registry publishes them.`,
    });
    if (sold.stateLine) blocks.push({ type: "boldLine", text: sold.stateLine });
    if (sold.recentSales.length > 0) {
      blocks.push({
        type: "table",
        head: ["Address", "Sale date", "Sale price", "Type", "Tenure", "New build"],
        rows: sold.recentSales.map((sale) => [sale.address, ...saleRow(sale)]),
        caption: sold.sourceLine,
      });
    }
    return section(1, "Price & this home", blocks);
  }
  const history = sold.ownHistory;
  if (history.length === 0) {
    if (sold.ownLine) blocks.push({ type: "line", text: sold.ownLine });
    blocks.push({ type: "note", text: sold.ownExplainer });
    return section(1, "Price & this home", blocks);
  }
  const last = history[0];
  // The format's factual tiles only: the last sale and the
  // count of recorded sales. The computed tiles the sample
  // once drew (change since previous sale, held by last
  // owner, price change, annual growth) are NOT built —
  // founder ruling B7 / the M8.1 carve-out: sold history
  // serves as filed facts only (D23).
  blocks.push({
    type: "tiles",
    tiles: [
      {
        label: "Last sale",
        value: formatPounds(last.price),
        sub: `${formatFiledDate(last.date)} · HM Land Registry`,
      },
      {
        label: "Times sold",
        value: String(history.length),
        sub:
          history.length === 1
            ? "Only recorded sale found for this address"
            : `${history.length} recorded sales found for this address`,
      },
    ],
  });
  const typeParts = [
    last.propertyType ? (PROPERTY_TYPE_LABELS[last.propertyType] ?? null) : null,
    last.tenure ? (TENURE_LABELS[last.tenure]?.toLowerCase() ?? null) : null,
    last.newBuild ? "new build" : null,
    cert?.floorAreaSqM != null ? `${cert.floorAreaSqM} m²` : null,
  ].filter((part): part is string => part !== null);
  if (typeParts.length > 0) blocks.push({ type: "line", text: `Type: ${typeParts.join(", ")}.` });
  blocks.push({
    type: "table",
    head: ["Sale date", "Sale price", "Type", "Tenure", "New build"],
    rows: history.map(saleRow),
    caption: sold.ownExplainer,
  });
  if (sold.building) {
    blocks.push({ type: "sub", text: `Sales in ${sold.building.building}` });
    if (sold.building.median.line) blocks.push({ type: "line", text: sold.building.median.line });
    blocks.push({ type: "note", text: sold.building.median.explainer });
  }
  return section(1, "Price & this home", blocks);
}

function section2(input: ReportInput): ReportSectionView {
  const blocks: ReportBlock[] = [];
  const { sold } = input;
  if (sold.kind !== "sold-prices" || "soldPrices" in sold) {
    blocks.push({ type: "line", text: sold.soldPrices.reason });
    return section(2, "Sold prices nearby", blocks);
  }
  blocks.push({
    type: "intro",
    text: `Recorded sales in this home's postcode, ${sold.postcode} — category A sales in HM Land Registry Price Paid Data. The median below is the postcode median.`,
  });
  const median = sold.median;
  if (median.state === "served" && median.value !== null) {
    const tiles: { label: string; value: string; sub: string }[] = [
      {
        label: "Postcode median",
        value: formatPounds(median.value),
        sub: `Category A median for ${sold.postcode}`,
      },
      {
        label: "Sales counted",
        value: String(median.counted),
        sub: "Counted sales behind the median",
      },
    ];
    if (median.spanFrom && median.spanTo) {
      tiles.push({
        label: "Span of sales",
        value: `${median.spanFrom.slice(0, 4)} – ${median.spanTo.slice(0, 4)}`,
        sub: `${formatFiledDate(median.spanFrom)} to ${formatFiledDate(median.spanTo)}`,
      });
    }
    if (sold.rung === 1 && sold.ownHistory.length > 0) {
      const last = sold.ownHistory[0];
      tiles.push({
        label: "This home",
        value: formatPounds(last.price),
        sub: `${formatFiledDate(last.date)} · HM Land Registry`,
      });
    }
    blocks.push({ type: "tiles", tiles });
  } else if (median.line) {
    blocks.push({ type: "line", text: median.line });
  }
  blocks.push({ type: "note", text: median.explainer });
  if (sold.recentSales.length > 0) {
    blocks.push({ type: "sub", text: sold.recentLabel });
    blocks.push({
      type: "table",
      head: ["Address", "Sale date", "Sale price", "Type", "Tenure", "New build"],
      rows: sold.recentSales.map((sale) => [sale.address, ...saleRow(sale)]),
      caption: sold.sourceLine,
    });
  }
  if (sold.stateLine) blocks.push({ type: "boldLine", text: sold.stateLine });
  return section(2, "Sold prices nearby", blocks);
}

// ------------------------------------------------------------------
// Section 3 — Schools & nurseries
// ------------------------------------------------------------------

function shareText(fact: { value: number | null; low: boolean }): string | null {
  if (fact.low) return "under 0.5%";
  if (fact.value === null) return null;
  return `${fact.value}%`;
}

function destinationsExtra(place: NearbyPlace): string[] {
  const lines: string[] = [];
  const stages = [
    { label: "KS4", stage: place.destinations?.ks4 },
    { label: "KS5", stage: place.destinations?.ks5 ?? null },
  ];
  for (const { label, stage } of stages) {
    if (!stage) continue;
    if (stage.state !== "served") {
      lines.push(stage.line);
      continue;
    }
    lines.push(stage.cohortLine);
    const shares: string[] = [];
    const overall = shareText(stage.overall);
    if (overall) shares.push(`stayed in education, employment or training: ${overall}`);
    const education = shareText(stage.education);
    if (education) shares.push(`education: ${education}`);
    if (stage.higherEducation) {
      const he = shareText(stage.higherEducation);
      if (he) shares.push(`higher education: ${he}`);
    }
    const apprenticeships = shareText(stage.apprenticeships);
    if (apprenticeships) shares.push(`apprenticeships: ${apprenticeships}`);
    const employment = shareText(stage.employment);
    if (employment) shares.push(`employment: ${employment}`);
    if (shares.length > 0) lines.push(`${label} destinations — ${shares.join("; ")}.`);
    lines.push(stage.sustainedLine);
  }
  return lines;
}

function schoolGroup(
  blocks: ReportBlock[],
  heading: string,
  answer: CategoryAnswer | null,
  extra?: (place: NearbyPlace) => string[],
) {
  blocks.push({ type: "sub", text: heading });
  if (!answer) return;
  if (answer.places.length > 0) blocks.push({ type: "rows", rows: placeRows(answer, extra) });
  const state = stateLine(answer);
  if (state) blocks.push(state);
  const count = countLine(answer);
  if (count) blocks.push(count);
}

function section3(input: ReportInput): ReportSectionView {
  const blocks: ReportBlock[] = [];
  const { nearby } = input;
  const secondaryExtra = (place: NearbyPlace): string[] => {
    const lines: string[] = [];
    if (place.sixthForm === true) lines.push("This school has a sixth form.");
    if (place.sixthForm === false) lines.push("This school has no sixth form.");
    lines.push(...destinationsExtra(place));
    return lines;
  };
  schoolGroup(blocks, "Primary schools", category(nearby, "schools-primary"));
  const secondary = category(nearby, "schools-secondary");
  schoolGroup(blocks, "Secondary schools", secondary, secondaryExtra);
  if (secondary?.nearestSelectiveLine)
    blocks.push({ type: "line", text: secondary.nearestSelectiveLine });
  // The catchment honesty block (founder ruling at M6.23):
  // the fixed hand-written block, exactly as the free page
  // carries it — we hold no catchment boundaries and cannot
  // say whether this home is in or out for any school. It
  // sits here, after the secondary group and before sixth
  // forms, as the approved sample report places it.
  blocks.push({ type: "sub", text: CATCHMENT_BLOCK_HEADING });
  blocks.push({ type: "line", text: CATCHMENT_BLOCK_LINE });
  blocks.push({
    type: "lineLink",
    text: "",
    label: CATCHMENT_LINK.label,
    href: CATCHMENT_LINK.url,
  });
  schoolGroup(blocks, "Sixth forms and colleges", category(nearby, "sixth-forms"));
  schoolGroup(blocks, "Nurseries", category(nearby, "nurseries"));
  return section(3, "Schools & nurseries", blocks);
}

// ------------------------------------------------------------------
// Section 4 — Health, air, noise & crime
// ------------------------------------------------------------------

const CQC_CATEGORIES: ReadonlySet<NearbyCategory> = new Set(["gp", "ae", "maternity"]);

function healthExtra(key: NearbyCategory): (place: NearbyPlace) => string[] {
  return (place) => {
    if (!CQC_CATEGORIES.has(key) || !place.cqcRating) return [];
    // The date is CQC's publication date for the rating,
    // as filed — never worded as an inspection date
    // (M8.1 scope (i), M6.25).
    const published = place.cqcRating.date
      ? ` (rating published ${formatFiledDate(place.cqcRating.date)})`
      : "";
    return [`Rated ${place.cqcRating.rating} overall by the Care Quality Commission${published}.`];
  };
}

function section4(input: ReportInput): ReportSectionView {
  const blocks: ReportBlock[] = [];
  const { nearby, crime } = input;
  const sections = areaSections(input);

  const healthGroups: { heading: string; key: NearbyCategory }[] = [
    { heading: "GP surgeries", key: "gp" },
    { heading: "Dentists", key: "dentist" },
    { heading: "Pharmacies", key: "pharmacy" },
    { heading: "A&E departments", key: "ae" },
    { heading: "Maternity units", key: "maternity" },
  ];
  for (const group of healthGroups) {
    const answer = category(nearby, group.key);
    blocks.push({ type: "sub", text: group.heading });
    if (!answer) continue;
    if (answer.places.length > 0)
      blocks.push({ type: "rows", rows: placeRows(answer, healthExtra(group.key)) });
    const state = stateLine(answer);
    if (state) blocks.push(state);
    const count = countLine(answer);
    if (count) blocks.push(count);
  }

  if (sections) {
    // Air quality, at report depth (D50): the table with
    // the yardstick line under each pollutant, exactly as
    // served, then the AQMA answer under its own sub.
    const air = sections.air;
    blocks.push({ type: "sub", text: "Air quality" });
    if (air.line) blocks.push({ type: "line", text: air.line });
    if (air.state === "served" && air.year !== null) {
      const rows: string[][] = [
        ["Nitrogen dioxide (NO₂)", air.no2 !== null ? `${air.no2} ${air.unit}` : "—"],
        ["Fine particles (PM2.5)", air.pm25 !== null ? `${air.pm25} ${air.unit}` : "—"],
        ["Coarse particles (PM10)", air.pm10 !== null ? `${air.pm10} ${air.unit}` : "—"],
      ];
      blocks.push({
        type: "table",
        head: ["Pollutant", `Modelled annual mean, ${air.year}`],
        rows,
        caption: air.explainer,
      });
      if (air.yardsticks) {
        blocks.push({ type: "note", text: air.yardsticks.basisLine });
        for (const pollutant of air.yardsticks.pollutants) {
          blocks.push({ type: "line", text: pollutant.yardstickLine });
          if (pollutant.summaryLine) blocks.push({ type: "line", text: pollutant.summaryLine });
        }
      }
    }
    blocks.push({ type: "sub", text: "Air Quality Management Areas" });
    blocks.push({ type: air.aqma.state === "none" ? "boldLine" : "line", text: air.aqma.line });
    if (air.aqma.basisLine) blocks.push({ type: "note", text: air.aqma.basisLine });

    // Noise, as served: the publisher's band text
    // verbatim, day and night (scope (h)).
    const noise = sections.noise;
    blocks.push({ type: "sub", text: "Noise" });
    if (noise.line) {
      blocks.push({
        type: noise.state === "served" ? "line" : "line",
        text: noise.line,
      });
    }
    if (noise.state === "served" && noise.bands.length > 0) {
      blocks.push({
        type: "table",
        head: ["Source", "Day", "Night"],
        rows: noise.bands.map((band) => [band.label, band.dayBand ?? "—", band.nightBand ?? "—"]),
        caption: noise.explainer,
      });
    }
  }

  // Crime, with the D39 calibration lines beside the
  // counts, exactly as served (scope (f)).
  blocks.push({ type: "sub", text: "Crime" });
  if (crime.kind === "crime") {
    const served = crime.crime;
    if (served.state === "served") {
      blocks.push({ type: "line", text: served.totalLine + "." });
      blocks.push({
        type: "table",
        head: ["Recorded category", "Incidents"],
        rows: served.categories.map((c) => [crimeCategoryLabel(c.slug), String(c.count)]),
        caption: `${served.windowLine}. ${served.basis}`,
      });
      if (served.perHead) {
        blocks.push({ type: "line", text: served.perHead.line + "." });
        blocks.push({ type: "note", text: served.perHead.basisLine });
      }
      if (served.englandFigure)
        blocks.push({ type: "line", text: served.englandFigure.line + "." });
      blocks.push({
        type: "table",
        head: ["Month", "Incidents"],
        rows: served.months.map((m) => [monthLabel(m.month), String(m.count)]),
        caption: served.explainer,
      });
      if (served.staleLine) blocks.push({ type: "note", text: served.staleLine });
      blocks.push({ type: "note", text: served.calibrationExplainer });
    } else {
      blocks.push({ type: "line", text: served.reason });
    }
  } else {
    blocks.push({ type: "line", text: crime.crime.reason });
  }

  if (sections) {
    // Benefits — the wider area (the Master's placement:
    // the end of this section). The D5 guardrails ride
    // with it: exactly as published with the source date,
    // a neutral label, no colour, score or verdict, and
    // never in the short version, the headlines or the
    // pills — plain lines here and nowhere else.
    const benefits = sections.benefits;
    blocks.push({ type: "sub", text: "Benefits — the wider area" });
    if (benefits.line) blocks.push({ type: "line", text: benefits.line });
    for (const series of benefits.series) {
      if (series.line) blocks.push({ type: "line", text: series.line });
    }
    if (benefits.basesLine) blocks.push({ type: "note", text: benefits.basesLine });

    // Charging zones, under its own label (scope (o)).
    // No charge amount is ever printed.
    const zones = sections.chargingZones;
    blocks.push({ type: "sub", text: "Charging zones" });
    blocks.push({ type: "line", text: zones.line });
    if (zones.scheme) {
      if (zones.scheme.carsLine) blocks.push({ type: "line", text: zones.scheme.carsLine });
      if (zones.scheme.classLine) blocks.push({ type: "line", text: zones.scheme.classLine });
      if (zones.scheme.dateLine) blocks.push({ type: "line", text: zones.scheme.dateLine });
      blocks.push({
        type: "lineLink",
        text: "",
        label: zones.scheme.checkerLabel,
        href: zones.scheme.checkerUrl,
      });
    }
    if (zones.basisLine) blocks.push({ type: "note", text: zones.basisLine });
  }

  return section(4, "Health, air, noise & crime", blocks);
}

// ------------------------------------------------------------------
// Section 5 — What's nearby, its map, and the industrial
// sites block at its end
// ------------------------------------------------------------------

const SECTION5_GROUPS: { heading: string; key: NearbyCategory }[] = [
  { heading: "Supermarkets", key: "supermarket" },
  { heading: "Parks & green spaces", key: "parks" },
  { heading: "Stations", key: "station" },
  { heading: "Bus stops", key: "bus-stop" },
  { heading: "Food & drink", key: "food-and-drink" },
  { heading: "Leisure", key: "leisure" },
  { heading: "Places to visit", key: "places-to-visit" },
  { heading: "Places of worship", key: "places-of-worship" },
  { heading: "Libraries", key: "libraries" },
  { heading: "Vets", key: "vets" },
  { heading: "Pet shops", key: "pet-shops" },
  { heading: "Pet boarding", key: "pet-boarding" },
];

// The Section 5 map's pin set (founder ruling, 16 Nov
// 2026): the home plus one pin per NAMED place in this
// section's own lists — the nearest three per category
// and the essential services' single nearest beyond
// 2 miles. The unnamed points inside the within-2-miles
// counts are never pinned, and no place from any other
// section is pinned (schools print in Section 3, which
// carries no map).
function buildSection5Map(input: ReportInput): ReportMapModel | null {
  const { nearby, resolution } = input;
  if (nearby.kind !== "distances") return null;
  if (resolution.rung !== 1 && resolution.rung !== 2) return null;
  const home = resolution.directory;
  const raw: { name: string; group: string; miles: number; latitude: number; longitude: number }[] =
    [];
  for (const group of SECTION5_GROUPS) {
    const answer = category(nearby, group.key);
    if (!answer) continue;
    for (const place of answer.places) {
      raw.push({
        name: place.name,
        group: group.heading,
        miles: place.miles,
        latitude: place.latitude,
        longitude: place.longitude,
      });
    }
    if (answer.beyondNearest) {
      raw.push({
        name: answer.beyondNearest.name,
        group: group.heading,
        miles: answer.beyondNearest.miles,
        latitude: answer.beyondNearest.latitude,
        longitude: answer.beyondNearest.longitude,
      });
    }
  }
  if (raw.length === 0) return null;
  // Mile space: offsets from the home, eastings scaled by
  // the cosine of the home's latitude.
  const milesPerDegLat = 69.0;
  const milesPerDegLon = 69.0 * Math.cos((home.latitude * Math.PI) / 180);
  const points = raw.map((pin) => ({
    ...pin,
    mx: (pin.longitude - home.longitude) * milesPerDegLon,
    my: -(pin.latitude - home.latitude) * milesPerDegLat,
  }));
  const extent =
    Math.max(2.2, ...points.map((p) => Math.max(Math.abs(p.mx), Math.abs(p.my)))) * 1.08;
  const width = 760;
  const height = 520;
  const scale = Math.min(width, height) / 2 / extent;
  const toX = (mx: number) => width / 2 + mx * scale;
  const toY = (my: number) => height / 2 + my * scale;
  const pins: ReportMapPin[] = points.map((pin, index) => ({
    n: index + 1,
    name: pin.name,
    group: pin.group,
    miles: pin.miles,
    x: Math.round(toX(pin.mx) * 10) / 10,
    y: Math.round(toY(pin.my) * 10) / 10,
  }));
  return {
    homeX: toX(0),
    homeY: toY(0),
    homeLabel: resolution.rung === 1 ? resolution.address.label : home.postcode,
    rings: [
      { r: scale, label: "1 mile" },
      { r: scale * 2, label: "2 miles" },
    ],
    pins,
    caption:
      "The named places in this section, plotted from their filed positions — straight-line distances from the home, with rings at 1 and 2 miles. The picture is drawn from the data this check holds; it is a diagram of the listed places, not a street map.",
    ariaLabel: `Map of the ${pins.length} named places listed in this section, around ${resolution.rung === 1 ? resolution.address.label : home.postcode}, with rings at 1 and 2 miles`,
  };
}

function section5(input: ReportInput): ReportSectionView {
  const blocks: ReportBlock[] = [];
  const { nearby } = input;
  for (const group of SECTION5_GROUPS) {
    const answer = category(nearby, group.key);
    blocks.push({ type: "sub", text: group.heading });
    if (!answer) continue;
    if (answer.places.length > 0) blocks.push({ type: "rows", rows: placeRows(answer) });
    const state = stateLine(answer);
    if (state) blocks.push(state);
    const count = countLine(answer);
    if (count) blocks.push(count);
  }
  const map = buildSection5Map(input);
  if (map) blocks.push({ type: "map", map });

  // The regulated industrial sites block (scope (p)):
  // at the END of this section, only while the bundle
  // carries it (INDUSTRIAL_SITES_ENABLED) — flag off, the
  // key is absent and no placeholder stands in its place.
  if (nearby.kind === "distances" && nearby.industrialSites) {
    const sites = nearby.industrialSites;
    blocks.push({ type: "sub", text: "Regulated industrial sites" });
    if (sites.state === "served") {
      blocks.push({
        type: "rows",
        rows: sites.sites.map((site) => ({
          name: site.operator,
          detail: [site.siteAddress, site.activityDescription].filter(Boolean).join(" · ") || null,
          tag: null,
          dist: formatMiles(site.miles),
          extra: [
            ...(site.belowThresholdLine ? [site.belowThresholdLine] : []),
            ...(site.noAirReturnsLine ? [site.noAirReturnsLine] : []),
          ],
        })),
      });
    } else if (sites.line) {
      blocks.push({
        type: sites.state === "none-within-2-miles" ? "boldLine" : "line",
        text: sites.line,
      });
    }
    if (sites.reportedLine) blocks.push({ type: "line", text: sites.reportedLine });
    if (sites.thresholdLine) blocks.push({ type: "line", text: sites.thresholdLine });
    if (sites.basisLine) blocks.push({ type: "note", text: sites.basisLine });
  }
  return section(5, "What's nearby", blocks);
}

// ------------------------------------------------------------------
// Section 6 — Home, costs & risks
// ------------------------------------------------------------------

function section6(input: ReportInput): ReportSectionView {
  const blocks: ReportBlock[] = [];
  const sections = areaSections(input);
  const { nearby } = input;
  if (!sections) return section(6, "Home, costs & risks", blocks);

  // Council tax.
  const tax = sections.councilTax;
  blocks.push({ type: "sub", text: "Council tax" });
  if (tax.line) blocks.push({ type: "line", text: tax.line });
  if (tax.state === "served" && tax.bands.length > 0) {
    blocks.push({
      type: "table",
      head: ["Band", "A year", "A month"],
      rows: tax.bands.map((band) => [band.band, band.labelPence, band.monthlyLabelPence]),
      caption: tax.bandsLine ?? undefined,
    });
    // The D33 monthly line, inside its own section and
    // never summed with anything (M8.11(b) settles the
    // short version's form; the report carries the served
    // line here).
    if (tax.monthlyLine) blocks.push({ type: "line", text: tax.monthlyLine });
  }

  // Energy certificates.
  const epc = sections.epc;
  blocks.push({ type: "sub", text: "Energy certificates" });
  if (epc.line) blocks.push({ type: "line", text: epc.line });
  if (epc.state === "served" && epc.certificates.length > 0) {
    blocks.push({
      type: "table",
      head: ["Address", "Band", "Potential", "Floor area", "Assessed"],
      rows: epc.certificates.map((c) => [
        c.address,
        c.rating !== null ? `${c.band ?? "—"} (${c.rating})` : (c.band ?? "—"),
        c.potentialBand ?? "—",
        c.floorAreaSqM !== null ? `${c.floorAreaSqM} m²` : "—",
        c.registrationDate
          ? `${c.assessmentLabel}, ${formatFiledDate(c.registrationDate)}`
          : c.assessmentLabel,
      ]),
      caption:
        epc.certificateCountAtPostcode !== null
          ? `${epc.certificateCountAtPostcode} certificates are held for this postcode.`
          : undefined,
    });
    for (const c of epc.certificates) {
      blocks.push({ type: "sub", text: c.address });
      if (c.ratingLine) blocks.push({ type: "line", text: c.ratingLine });
      for (const fact of c.solarFacts) blocks.push({ type: "line", text: fact });
      if (c.energyCosts) {
        blocks.push({ type: "line", text: c.energyCosts.line });
        if (c.energyCosts.potentialLine)
          blocks.push({ type: "line", text: c.energyCosts.potentialLine });
      }
      if (c.improvements) {
        blocks.push({ type: "sub", text: "Suggested improvements" });
        if (c.improvements.state === "served") {
          // Register sequence, each step's own figures,
          // never summed (D41; the sample's "save about
          // £34 a year" line is not reproduced).
          blocks.push({ type: "list", items: c.improvements.steps.map((step) => step.line) });
        } else {
          blocks.push({ type: "line", text: c.improvements.line });
        }
        if (c.improvements.closingLine)
          blocks.push({ type: "line", text: c.improvements.closingLine });
      }
    }
    if (epc.spread) {
      // D34: the spread counts certificates, not homes.
      blocks.push({ type: "sub", text: "Certificates at this postcode" });
      blocks.push({ type: "line", text: epc.spread.grainLine });
      for (const row of epc.spread.rows) blocks.push({ type: "line", text: row.line });
      blocks.push({ type: "note", text: epc.spread.explainer });
    }
  }

  // Solar — the basis rides in the section itself, in the
  // line's own terms (founder requirement, 15 Nov 2026):
  // the served line, then the served basis line, together.
  const solar = sections.solar;
  blocks.push({ type: "sub", text: "Solar potential" });
  if (solar.line) blocks.push({ type: "line", text: solar.line });
  if (solar.basisLine) blocks.push({ type: "line", text: solar.basisLine });

  // EV charging, in the format's grouped form.
  blocks.push({ type: "sub", text: "EV charging" });
  blocks.push({ type: "sub", text: "At home" });
  blocks.push({
    type: "line",
    text: "Home charge points are not something this check can see — it covers the public charge points below.",
  });
  blocks.push({ type: "sub", text: "Public chargers" });
  const chargers = category(nearby, "ev-chargers");
  if (chargers) {
    if (chargers.places.length > 0) blocks.push({ type: "rows", rows: placeRows(chargers) });
    const state = stateLine(chargers);
    if (state) blocks.push(state);
    const count = countLine(chargers);
    if (count) blocks.push(count);
  }

  // Broadband and mobile, headline forms (full depth is
  // M8.11(g)'s step).
  const broadband = sections.broadband;
  blocks.push({ type: "sub", text: "Broadband" });
  if (broadband.line) blocks.push({ type: "line", text: broadband.line });
  if (broadband.bandsLine) blocks.push({ type: "note", text: broadband.bandsLine });
  const mobile = sections.mobile;
  blocks.push({ type: "sub", text: "Mobile coverage" });
  if (mobile.line) blocks.push({ type: "line", text: mobile.line });
  for (const service of mobile.services) {
    if (service.line) blocks.push({ type: "line", text: service.line });
  }

  // The planning hand-off (D31): the council's register,
  // never a count and never a named list.
  const planning = sections.planningApplications;
  blocks.push({ type: "sub", text: "Planning applications" });
  blocks.push({ type: "line", text: planning.line });
  if (planning.link)
    blocks.push({
      type: "lineLink",
      text: "",
      label: planning.link.label,
      href: planning.link.url,
    });

  // Planning constraints & land, exactly as served (full
  // per-site depth is M8.11(i)/(j)'s step).
  const constraints = sections.constraints;
  blocks.push({ type: "sub", text: "Planning constraints & land" });
  for (const layer of [
    constraints.conservationArea,
    constraints.article4,
    constraints.greenBelt,
    constraints.builtUpArea,
  ]) {
    blocks.push({ type: "line", text: layer.line });
  }
  blocks.push({ type: "line", text: constraints.brownfield.line });

  const heritage = sections.heritage;
  blocks.push({ type: "sub", text: "Listed buildings & heritage" });
  blocks.push({ type: "line", text: heritage.listed.line });
  if (heritage.listed.within.length > 0) {
    blocks.push({
      type: "rows",
      rows: heritage.listed.within.map((place) => ({
        name: place.name ?? `Listed building, grade ${place.grade}`,
        detail: `Grade ${place.grade}`,
        tag: null,
        dist: formatMiles(place.miles),
        extra: [],
      })),
    });
  }
  if (heritage.listed.beyondLine) blocks.push({ type: "line", text: heritage.listed.beyondLine });
  if (heritage.atPoint.state === "recorded")
    blocks.push({ type: "line", text: heritage.atPoint.line });
  if (heritage.atPoint.state === "needs-exact-home")
    blocks.push({ type: "line", text: heritage.atPoint.reason });
  for (const layer of [
    heritage.monuments,
    heritage.worldHeritageSites,
    heritage.battlefields,
    heritage.protectedWrecks,
    heritage.worldHeritageBufferZones,
  ]) {
    blocks.push({ type: "line", text: layer.line });
  }
  if (heritage.localListsLine) blocks.push({ type: "line", text: heritage.localListsLine });

  const nature = sections.nature;
  blocks.push({ type: "sub", text: "Nature & protected areas" });
  if (nature.coverageLine) blocks.push({ type: "line", text: nature.coverageLine });
  if (nature.placesLine) blocks.push({ type: "line", text: nature.placesLine });
  if (nature.designationsLine) blocks.push({ type: "line", text: nature.designationsLine });
  blocks.push({ type: "line", text: nature.ancientWoodland.line });
  if (nature.ancientWoodlandInventoryLine)
    blocks.push({ type: "line", text: nature.ancientWoodlandInventoryLine });
  blocks.push({ type: "line", text: nature.priorityHabitat.line });

  // The area in numbers — demographics, led by the IMD
  // decile-in-words line in its ruled sentence form (the
  // bundle's own served line; no score, no rank, scope
  // (g)), then the Census tables as published, with the
  // social-rented share also standing as its own explicit
  // line (scope (d)).
  const imd = sections.imd;
  const census = sections.census;
  blocks.push({ type: "sub", text: "The area in numbers — Census 2021" });
  if (imd.line) blocks.push({ type: "line", text: imd.line });
  if (imd.state === "served" && imd.domains.length > 0) {
    blocks.push({
      type: "list",
      items: imd.domains.map((domain) => `${domain.name}: ${decileWords(domain.decile)}.`),
    });
  }
  if (census.line) blocks.push({ type: "line", text: census.line });
  if (census.medianAge) blocks.push({ type: "line", text: census.medianAge.line });
  for (const table of census.tables) {
    blocks.push({
      type: "bars",
      title: `${table.title} — Census 2021`,
      rows: table.rows.map((row) => ({ label: row.label, pct: row.pct, count: row.count })),
      caption: `Census 2021 table ${table.code.toUpperCase()}: ${table.total.toLocaleString("en-GB")} counted in this table.`,
    });
    if (table.code === "ts054" && census.socialRented)
      blocks.push({ type: "line", text: census.socialRented.line });
  }
  if (census.socialRented && !census.tables.some((table) => table.code === "ts054"))
    blocks.push({ type: "line", text: census.socialRented.line });

  return section(6, "Home, costs & risks", blocks);
}

// ------------------------------------------------------------------
// Section 7 — Flood risk
// ------------------------------------------------------------------

function warningBlocks(warnings: FloodLiveWarnings): ReportBlock[] {
  const blocks: ReportBlock[] = [];
  if (warnings.state === "warnings") {
    for (const warning of warnings.warnings) {
      blocks.push({ type: "sub", text: warning.line });
      blocks.push({ type: "line", text: warning.message });
      blocks.push({ type: "note", text: `${warning.raisedLine}. ${warnings.attributionLine}` });
    }
    if (warnings.overflowLine) blocks.push({ type: "line", text: warnings.overflowLine });
    blocks.push({
      type: "lineLink",
      text: `Checked at ${warnings.checkedAt}.`,
      label: warnings.link.label,
      href: warnings.link.url,
    });
  } else if (warnings.state === "none") {
    // The named "No flood warning in force" line — a
    // checked finding, printed bold only on the format's
    // rule.
    if (warnings.line) blocks.push({ type: "boldLine", text: warnings.line });
  } else {
    if (warnings.line) blocks.push({ type: "line", text: warnings.line });
  }
  return blocks;
}

function section7(input: ReportInput): ReportSectionView {
  const blocks: ReportBlock[] = [];
  const served = floodServed(input);
  if (!served) {
    const line = floodStateLine(input);
    if (line) blocks.push({ type: "line", text: line });
    return section(7, "Flood risk", blocks);
  }
  // The live-warnings block opens the section (scope (e)).
  if (served.liveWarnings) blocks.push(...warningBlocks(served.liveWarnings));
  // The three filed layers, never merged (D25).
  for (const layer of served.layers) {
    blocks.push({ type: "sub", text: layer.title });
    blocks.push({ type: "line", text: layer.line });
    if (layer.proximity.length > 0) {
      blocks.push({
        type: "list",
        items: layer.proximity.map((edge) => `${edge.label} — ${formatMiles(edge.miles)}`),
      });
    }
    if (layer.beyondLine) blocks.push({ type: "line", text: layer.beyondLine });
    blocks.push({ type: "note", text: layer.basisLine });
  }
  // The recorded defences sub-block, as served (scope (k)).
  const defences = served.defences;
  blocks.push({ type: "sub", text: defences.title });
  if (defences.state === "served") {
    if (defences.caveat) blocks.push({ type: "line", text: defences.caveat });
    if (defences.bridgeLine) blocks.push({ type: "line", text: defences.bridgeLine });
    blocks.push({
      type: "rows",
      rows: defences.defences.map((defence) => ({
        name: defence.name ?? defence.type ?? "Recorded flood defence",
        detail:
          [defence.name ? defence.type : null, defence.watercourse, defence.maintainer]
            .filter((part): part is string => part !== null && part !== "")
            .join(" · ") || null,
        tag: null,
        dist: formatMiles(defence.miles),
        extra: [
          defence.conditionLine,
          ...(defence.designSopLine ? [defence.designSopLine] : []),
          ...(defence.currentSopLine ? [defence.currentSopLine] : []),
        ],
      })),
    });
    if (defences.overflowLine) blocks.push({ type: "line", text: defences.overflowLine });
  } else if (defences.line) {
    blocks.push({
      type: defences.state === "none-within-radius" ? "boldLine" : "line",
      text: defences.line,
    });
  }
  // The climate outlook, a fenced sub-block exactly as
  // served (scope (l)): its heading and basis line print
  // every time, the caveats with it, and no line compares
  // a scenario band with a present-day band.
  const climate = served.climate;
  blocks.push({ type: "sub", text: climate.heading });
  blocks.push({ type: "line", text: climate.basisLine });
  blocks.push({ type: "note", text: climate.caveatLine });
  for (const source of climate.sources) {
    blocks.push({ type: "line", text: `${source.title}: ${source.line}` });
    blocks.push({ type: "note", text: source.scenarioLine });
  }
  blocks.push({ type: "note", text: served.howWeCheck });
  return section(7, "Flood risk", blocks);
}

// ------------------------------------------------------------------
// Section 8 — Questions to ask the seller (M8.5's step)
// ------------------------------------------------------------------

function section8(): ReportSectionView {
  // The questions themselves are M8.5's step — hand-written,
  // rule-selected per home, with their own check. This step
  // builds the section's place in the nine; M8.5 fills it.
  // No placeholder copy stands here: an invented question
  // would be content no step has authorised.
  return section(8, "Questions to ask the seller", []);
}

// ------------------------------------------------------------------
// Section 9 — Sources, notes & disclaimers
// ------------------------------------------------------------------

function section9(input: ReportInput): ReportSectionView {
  const blocks: ReportBlock[] = [];
  const sections = areaSections(input);
  const served = floodServed(input);

  blocks.push({ type: "sub", text: "Sources & dates" });
  const sources: string[] = [];
  const collect = (line: string | null | undefined) => {
    if (line && !sources.includes(line)) sources.push(line);
  };
  if (input.sold.kind === "sold-prices" && !("soldPrices" in input.sold))
    collect(input.sold.sourceLine);
  if (input.crime.kind === "crime" && input.crime.crime.state === "served")
    collect(input.crime.crime.sourceLine);
  if (served) {
    for (const layer of served.layers) collect(layer.sourceLine);
    collect(served.defences.sourceLine);
  }
  if (sections) {
    for (const key of Object.keys(sections) as (keyof AreaSections)[]) {
      const value = sections[key] as { sourceLine?: string | null } | undefined;
      if (value && typeof value === "object") collect(value.sourceLine);
    }
  }
  blocks.push({ type: "list", items: sources });

  blocks.push({ type: "sub", text: "How to read this report" });
  if (input.nearby.kind === "distances") {
    blocks.push({
      type: "line",
      text: `Distances are ${input.nearby.basisLabel}, shown to one decimal place. A straight-line distance is always shorter than the route you would actually travel.`,
    });
  }
  blocks.push({
    type: "line",
    text: "Sold prices nearby summarise recorded sales. They are not a valuation of this home and make no claim about what it is worth. A median is only shown where there are enough counted sales to draw on.",
  });
  blocks.push({
    type: "line",
    text: "Modelled figures — air quality, noise and solar potential are modelled estimates for the area, labelled as modelled wherever they appear. They are not measurements taken at this address.",
  });
  if (sections && sections.census.state === "served") {
    blocks.push({
      type: "line",
      text: "Census 2021 tables (Section 6) describe the whole Census area named in that section — not this street or this house. They are the counts and percentages the ONS published from Census Day, 21 March 2021, shown as facts only: no score, rating or verdict is added. Totals differ very slightly between Census tables because the ONS applies small disclosure-control adjustments to each table.",
    });
  }
  blocks.push({
    type: "line",
    text: "Flood: flood zones, surface-water maps and defences are three separate pictures and are never merged into a single answer. Live flood warnings are fetched at the moment a check is run and are never stored.",
  });
  blocks.push({
    type: "line",
    text: "Planning: there is no national dataset of planning applications, so this report hands you to the council's own planning register rather than listing applications.",
  });

  // The check explanations, named for the whole report
  // (the M7.12 discharge): every How-we-check page this
  // report's checks rest on.
  const allLinks: { label: string; href: string }[] = [];
  for (const number of Object.keys(REPORT_SECTION_CHECK_LINKS)) {
    for (const href of REPORT_SECTION_CHECK_LINKS[Number(number)]) {
      if (!allLinks.some((link) => link.href === href))
        allLinks.push({ label: CHECK_PAGES[href].name, href });
    }
  }
  blocks.push({ type: "sub", text: "How we check" });
  blocks.push({ type: "links", links: allLinks });

  blocks.push({ type: "sub", text: "Disclaimers" });
  blocks.push({
    type: "line",
    text: "School places: this report cannot tell you whether this home would get a school place. No national catchment map exists, living near a school does not guarantee a place, and cut-off distances change every year. Check the council and school admissions pages.",
  });
  // The served schoolDeadlines line, verbatim (scope (j)).
  if (input.nearby.kind === "distances" && input.nearby.schoolDeadlines) {
    blocks.push({ type: "line", text: input.nearby.schoolDeadlines.line });
  }
  blocks.push({ type: "line", text: REPORT_DISCLAIMER_D9 });
  return { number: 9, title: "Sources, notes & disclaimers", blocks };
}

// ------------------------------------------------------------------
// The builder — the one snapshot source (see the header)
// ------------------------------------------------------------------

export function buildReportView(input: ReportInput): ReportView {
  const sections = areaSections(input);
  const cert = sections ? matchedCertificate(input.resolution, sections.epc.certificates) : null;
  return {
    masthead: buildMasthead(input, cert),
    shortVersion: buildShortVersion(input),
    sections: [
      section1(input, cert),
      section2(input),
      section3(input),
      section4(input),
      section5(input),
      section6(input),
      section7(input),
      section8(),
      section9(input),
    ],
  };
}
