import { displayText, type AddressResolution } from "./address";
import type {
  AreaBundle,
  AreaSections,
  CensusRowServed,
  CensusSection,
  CensusTableServed,
  ServedCertificate,
} from "./area-bundle";
import { CHECK_PAGES } from "./check-pages";
import type { CrimeBundle, ServedCrime } from "./crime";
import { CRIME_CATEGORY_SLUGS, crimeCategoryLabel } from "./district";
import type {
  FloodBundle,
  FloodLiveWarnings,
  FloodMapPolygonSet,
  FloodMaps,
  ServedFloodDefence,
  ServedFloodLayer,
  ServedFloodWarning,
} from "./flood";
import { formatFiledDate, formatMiles, formatPounds } from "./journey";
import type { CategoryAnswer, NearbyBundle, NearbyCategory, NearbyPlace } from "./nearby";
import { REPORT_SCHOOL_LIST_SIZE } from "./nearby";
import { CATCHMENT_LINK, distanceBand, reportRoute, type DistanceBand } from "./results";
import { REPORT_DOOR_STATE, type ReportDoorState } from "./site";
import type { ServedSale, SoldPricesBundle } from "./sold-prices";

// The on-screen report (plan step M8.1): the detailed
// report's ten sections, built from the five check
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
// only; no monthly cost-of-ownership figure anywhere;
// the flood section in its served three-layer form;
// crime with its D39 calibration lines). Nation rendering
// inherits the bundles' own not-covered states section
// by section (scope note (v)): a Scottish or Northern
// Irish report renders each section's named not-covered
// state, never a blank and never England data.
//
// THE COMPOSITION LAYER (M8.4 PDF parity audit, 21 Nov
// 2026 — BUG-039/040/041/042/049/058/065): the report
// composes its own sentences here, from the bundles'
// served figures and facts — it does not lift the
// brains' raw lines as standalone text. The brains' line
// texts are composed for their labelled contexts on the
// results page (continuation fragments, lowercase starts,
// subject carried by the heading); lifted raw into the
// report they read as fragments, drop their subjects,
// and in the median's case never state the figure at
// all. So: the short version's bullets, Section 4's
// crime bullets, Section 6's census intro and Section
// 10's sources are composed in this module, with their
// key facts in bold segments; standalone brain lines
// that remain are sentence-cased at the point they are
// placed; and explanation-grade text rides in note
// blocks, never inside findings at body size (BUG-050).
// The brains and the results page are untouched by all
// of this. (BUG-045 likewise restores Section 1's
// sample form — four tiles and the five-column history
// table — over the M8.1 two-tile carve-out: the added
// cells are arithmetic over the home's own consecutive
// filed sales only; see section1.)

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
// as the closing section's one link list (Section 10; the
// per-section link rows the M8.1 build appended were
// removed by the parity audit, BUG-052 — the sample
// carries check links only in its Sources section).
// Paths are keys of CHECK_PAGES; labels come from there,
// never re-typed. The union of this map's values IS the
// app's check-page set — a test pins the equality (the
// print-check batch, item 21): the report may never link
// to a page that does not exist, nor leave a check page
// unlinked. Section 6 (the neighbourhood) names the two
// pages its deferred explanations live on — planning
// applications hand off to the planning-constraints page,
// charging zones are explained on the air-quality page;
// the Census and benefits blocks carry no check page and
// keep their bases in the report itself (item 20).
export const REPORT_SECTION_CHECK_LINKS: Record<number, string[]> = {
  1: ["/check/sold-prices", "/check/epc"],
  2: ["/check/sold-prices"],
  3: ["/check/schools"],
  4: ["/check/family-essentials", "/check/air-quality", "/check/noise", "/check/crime"],
  5: ["/check/family-essentials", "/check/public-transport"],
  6: ["/check/planning-constraints", "/check/air-quality"],
  7: [
    "/check/council-tax-band",
    "/check/epc",
    "/check/solar-potential",
    "/check/ev-charging",
    "/check/broadband",
    "/check/mobile-coverage",
    "/check/planning-constraints",
  ],
  8: ["/check/flood-risk"],
  9: [],
  10: [],
};

// ------------------------------------------------------------------
// The view model — plain data, JSON-serialisable, the one
// snapshot source (see the header). The renderers (screen
// now, PDF at M8.4) map blocks to their medium and derive
// nothing.
// ------------------------------------------------------------------

// One run of text inside a composed line: the report's
// own composition marks its key facts (figures, distances,
// names) bold, in the sample report's form (the M8.4 PDF
// parity audit, BUG-039: the short version's model carried
// plain strings, so no bullet could carry a bold fact at
// all). A rich line is a list of these segments; the
// renderer maps bold to <strong> and derives nothing.
export interface ReportRichSegment {
  text: string;
  bold?: boolean;
  // A link run (the Sources section's named records): the
  // renderer prints it as a link on screen and, in the
  // PDF's closing section, with its URL beside it.
  href?: string;
}

export type ReportRichLine = ReportRichSegment[];

export interface ReportRow {
  name: string;
  detail: string | null;
  tag: string | null;
  // The tag prints in its highlighted form (the sample's
  // brass-pale pill) rather than the plain pill — the
  // "Grammar school" label (print-check item 7).
  tagStar?: boolean;
  dist: string | null;
  // The distance chip's colour band, from the results
  // page's own distanceBand rules for the row's family
  // (print-check item 8 — no new thresholds are invented
  // here; the band is computed where the row is built).
  distBand?: DistanceBand;
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
  // The legend's distance, formatted as the rest of the
  // report formats distances (formatMiles — "0.3", never
  // the raw filed figure; print-check item 19).
  milesLabel: string;
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
  // The filed street lines as the picture's ground, drawn
  // under the pins (print-check item 19): the same street
  // lines the flood pictures draw, projected into this
  // map's mile space. Absent where no street lines are
  // held for the frame — the rings-only diagram stands.
  streets?: { d: string; home: boolean }[];
  pins: ReportMapPin[];
  caption: string;
  ariaLabel: string;
}

// The dot-plot model (M8.2): every coordinate decided
// here, on the Section 5 map pattern — the renderer maps
// the numbers to SVG and derives nothing, so M8.4's PDF
// draws the identical picture. The plot carries one dot
// per counted sale (the full counted set the median is
// drawn from — no chart-only cap, founder ruling
// 20 Nov 2026), the median as a dashed line, and, at
// rung 1, the home's own last sale as the brass dot.
export interface ReportDotPlotModel {
  title: string;
  // The viewBox is 760 wide; its height grows in fixed
  // 14px steps as same-price stacks rise (the Master's
  // form at two stack rows is 760 × 118).
  height: number;
  axisY: number;
  tickY: number;
  median: {
    x: number;
    label: string;
    anchor: "start" | "middle" | "end";
    labelY: number;
    lineY1: number;
    lineY2: number;
  };
  dots: { x: number; y: number }[];
  home: {
    x: number;
    y: number;
    label: string;
    anchor: "start" | "middle" | "end";
    labelY: number;
  } | null;
  ticks: { x: number; label: string; anchor: "start" | "middle" | "end" }[];
  caption: string;
  ariaLabel: string;
}

// The month-chart model (M8.2): the twelve monthly counts
// as vertical bars on a nice-step axis (1/2/5 × 10^n,
// founder ruling 20 Nov 2026), values printed on every
// bar, geometry decided here like the dot plot's.
export interface ReportMonthChartModel {
  title: string;
  height: number;
  gridlines: { y: number; label: string; baseline: boolean }[];
  bars: {
    x: number;
    y: number;
    height: number;
    cx: number;
    value: string;
    valueY: number;
    month: string;
  }[];
  caption: string;
  ariaLabel: string;
}

// The flood-map model (M8.3): one of Section 8's two map
// pictures, drawn from the flood bundle's own filed
// geometry (lib/flood.ts's maps sibling) over the street
// lines we hold. Every coordinate is decided here, on the
// Section 5 map pattern: the frame the bundle clipped to
// (a mile in each direction, the postcode point centred)
// projects in mile space at ONE uniform scale onto the
// 760 × 560 viewBox — fitted to the height, centred on
// the pin — so distances on the picture are true in
// every direction and M8.4's PDF draws the identical
// picture from the same numbers. The drawn
// geometry rides in the model twice over — as SVG path
// strings for the renderer and as projected point arrays
// — because the M8.3 promise assertions run against the
// DRAWN geometry: the point arrays are what the picture
// actually shades. Flood defences are never drawn (the
// founder's ruling: they are a list, not a picture), and
// a picture exists only where its layer's shapes are
// filed for the frame (see buildFloodMapModels).
export interface ReportFloodMapModel {
  title: string;
  width: 760;
  height: 560;
  homeX: 380;
  homeY: 280;
  // The drawn street lines: path data, the projected
  // points, and whether this line is the home's own
  // street (drawn in the strong tint and named in the
  // caption's clear case).
  streets: { d: string; points: { x: number; y: number }[]; home: boolean; name: string | null }[];
  // The home street's name, labelled on the picture along
  // its own line near the pin (the founder's ruling of
  // 20 Nov 2026, on the independent audit's Divergence 2:
  // the sample's hand-made pictures name their streets;
  // the product names the home street only). Anchor point
  // and rotation are decided here; null where the home
  // street is not resolved or not drawn.
  homeStreetLabel: { text: string; x: number; y: number; angle: number } | null;
  // The shaded shapes, weakest first (draw order): each
  // carries its filed label, its display label, its fill
  // and its projected polygons (a polygon is an array of
  // rings; a ring is an array of points).
  shades: {
    label: string;
    displayLabel: string;
    fill: string;
    d: string;
    polygons: { x: number; y: number }[][][];
  }[];
  legend: { label: string; fill: string }[];
  caption: string;
  attribution: string;
  ariaLabel: string;
}

// The attribution line every flood-map picture carries
// (the ODbL's condition, and the EA shapes' licence).
export const FLOOD_MAP_ATTRIBUTION =
  "Street data © OpenStreetMap contributors, available under the Open Database Licence. Flood shapes: Environment Agency, licensed under the Open Government Licence.";

// The flood shading language: one water family, deep for
// the serious end of each product, pale for the lighter —
// Flood Zone 3 against Flood Zone 2 on the planning
// picture; High, Medium, Low on the surface-water one.
const FLOOD_ZONE_FILLS: Record<string, string> = { FZ3: "#4E7FA8", FZ2: "#A9C6DE" };
const ROFSW_FILLS: Record<string, string> = { High: "#4E7FA8", Medium: "#86AECD", Low: "#C3D8EA" };

export type ReportBlock =
  | { type: "intro"; text: string }
  | { type: "line"; text: string }
  // A "none found" finding: the format prints these in
  // bold only (the approved format's rule).
  | { type: "boldLine"; text: string }
  | { type: "sub"; text: string }
  // A tile's value normally prints at the tile size; a
  // long value (the span-of-sales years) prints at the
  // sample's reduced size instead (BUG-054).
  | { type: "tiles"; tiles: { label: string; value: string; sub: string; smallValue?: boolean }[] }
  | { type: "rows"; rows: ReportRow[] }
  // boldColumns: the column indexes whose cells print
  // bold (Section 1's sale-price column, in the sample's
  // form). cellAlerts / cellSubs (print-check items 2 and
  // 6): a per-cell red highlight — the air table's
  // modelled-level cell, only where the level is above
  // the UK legal limit — and a per-cell second line (the
  // pollutant's position against its yardsticks, printed
  // inside the table with its pollutant). Both are sparse
  // grids aligned with rows; an absent entry is a plain
  // cell.
  | {
      type: "table";
      head: string[];
      rows: string[][];
      caption?: string;
      boldColumns?: number[];
      cellAlerts?: boolean[][];
      cellSubs?: (string | null)[][];
    }
  // A bar chart in a chart card (M8.2's form of the M8.1
  // block): the view decides each row's bar width, its
  // printed value and its fill strength — the largest row
  // full-strength, the rest the pale tint (the sample
  // kit's rule). The renderer maps and decides nothing.
  | {
      type: "bars";
      title: string;
      rows: { label: string; widthPct: number; value: string; strong: boolean }[];
      caption: string;
    }
  // A stat-tile chart card (the Census Age card): a chart
  // card whose body is one stat tile, not bars.
  | {
      type: "statTile";
      title: string;
      label: string;
      value: string;
      sub: string | null;
      caption: string;
    }
  // Chart cards arranged two-abreast (the Census grid).
  | { type: "chartGrid"; cards: ReportBlock[] }
  | { type: "dotPlot"; plot: ReportDotPlotModel }
  | { type: "monthChart"; chart: ReportMonthChartModel }
  | { type: "list"; items: string[] }
  // A tight bullet list of composed lines (the short
  // version's groups are built from these too): each item
  // is a rich line, so its key facts can print bold.
  | { type: "richList"; items: ReportRichLine[] }
  // The seller questions (M8.5): Section 9's numbered
  // list — each item a hand-written block's title and
  // text, selected by fixed rules from the report's own
  // facts (see section9). The renderer prints the
  // ordered list in the sample's form (ol.rpt-seller),
  // so an item's position IS its question number — the
  // flood block's "Question 1" standing (the Exeter
  // sample's cross-reference) reads it.
  | { type: "questions"; items: { title: string; text: string }[] }
  | { type: "note"; text: string }
  | { type: "lineLink"; text: string; label: string; href: string }
  | { type: "map"; map: ReportMapModel }
  | { type: "floodMap"; map: ReportFloodMapModel }
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
  // The short version's bullets are composed lines, not
  // lifted brain text: standalone sentences with their
  // key facts in bold segments (BUG-039/040).
  shortVersion: { groups: { heading: string; lines: ReportRichLine[] }[] } | null;
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

function monthName(isoMonth: string): string {
  const label = monthLabel(isoMonth);
  const space = label.lastIndexOf(" ");
  return space > 0 ? label.slice(0, space) : label;
}

function monthYear(isoMonth: string): string {
  const label = monthLabel(isoMonth);
  const space = label.lastIndexOf(" ");
  return space > 0 ? label.slice(space + 1) : "";
}

const MONTH_ABBREVIATIONS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// "2022-03-22" → "22 Mar 2022": the sample report's date
// form for the masthead strip and the tile subs (the
// masthead's Report date and the prose dates keep
// formatFiledDate's full month). An unparseable value is
// served raw, on formatFiledDate's own rule.
function formatShortFiledDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const month = MONTH_ABBREVIATIONS[Number(match[2]) - 1];
  if (!month) return iso;
  return `${Number(match[3])} ${month} ${match[1]}`;
}

// A brain line standing alone in the report reads as a
// sentence: its first letter capitalised (BUG-065 — the
// brains compose continuation fragments for their labelled
// contexts on the results page, lowercase starts and all;
// the report's standalone lines may not inherit the
// fragment form). Only the first letter changes — the
// line's own words are untouched.
function sentence(text: string): string {
  return text.length > 0 ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

// A sentence with its full stop assured: brain fragments
// carry none (they sit under labels elsewhere), and a
// standalone bullet may not end mid-air.
function sentenceLine(text: string): string {
  const composed = sentence(text);
  return /[.!?]$/.test(composed) ? composed : `${composed}.`;
}

// Segment shorthands for the composed lines.
function seg(text: string): ReportRichSegment {
  return { text };
}
function boldSeg(text: string): ReportRichSegment {
  return { text, bold: true };
}

// ------------------------------------------------------------------
// Chart machinery (M8.2) — the scale rules, settled here
// and pinned by tests/report.test.ts. Every chart's
// geometry is decided in this module; the renderers map
// the models to SVG/HTML and derive nothing.
// ------------------------------------------------------------------

function round1(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  // A hair below zero rounds to -0, which a strict
  // equality check counts as a different leaf from 0
  // while JSON prints both as 0 — a model carrying -0
  // fails its own JSON round-trip (the M8.3 golden
  // failure, CI #266). Zero is zero: normalise it here,
  // in the one helper every model number passes through.
  return rounded === 0 ? 0 : rounded;
}

function count(value: number): string {
  return value.toLocaleString("en-GB");
}

// The nice-step rule (founder ruling, 20 Nov 2026): axis
// steps are 1, 2 or 5 × 10^n — the smallest such step
// that is not finer than the raw division asks for.
function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) {
    if (m * pow >= raw) return m * pow;
  }
  return 10 * pow;
}

// SVG text anchors by position, so a label at the plot's
// edge grows inward and never leaves the viewBox (the
// Master's centre-anchored labels sit mid-plot; the rule
// is the model's answer where the sample never goes).
function anchorFor(x: number): "start" | "middle" | "end" {
  if (x < 110) return "start";
  if (x > 650) return "end";
  return "middle";
}

// One bars block with the kit's fill rule applied: the
// first row attaining the largest width is full-strength,
// every other row the pale tint.
function barsBlock(
  title: string,
  rows: { label: string; widthPct: number; value: string }[],
  caption: string,
): ReportBlock {
  const max = Math.max(0, ...rows.map((row) => row.widthPct));
  let strongUsed = false;
  return {
    type: "bars",
    title,
    rows: rows.map((row) => {
      const strong = !strongUsed && max > 0 && round1(row.widthPct) === round1(max);
      if (strong) strongUsed = true;
      return {
        label: row.label,
        widthPct: Math.min(100, Math.max(0, round1(row.widthPct))),
        value: row.value,
        strong,
      };
    }),
    caption,
  };
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
// The distance pill carries its unit (BUG-042: the sample's
// identical pill prints "0.3 mi"; formatMiles returns the
// bare number by design, for the pill contexts that add
// their own unit — the report's pills add theirs here).
// The pill also carries its colour band (print-check
// item 8): the results page's own distanceBand rules for
// the row's family — schools 1/2 miles, hospitals 5/10,
// everything else 0.5/1.5 — computed here from the filed
// miles, so the web report and the PDF colour the chip
// exactly as the results page colours its own.
function placeRows(
  answer: CategoryAnswer,
  extra?: (place: NearbyPlace) => string[],
  family: "school" | "hospital" | "everyday" = "everyday",
): ReportRow[] {
  return answer.places.map((place) => ({
    name: place.name,
    detail: place.detail,
    tag: null,
    dist: `${formatMiles(place.miles)} mi`,
    distBand: distanceBand(family, place.miles),
    extra: extra ? extra(place) : [],
  }));
}

// A category's non-"within" sentence: an absence finding
// (the empty states) prints bold only, on the format's
// rule; a coverage state (not filed) prints as a plain
// named line — it is a statement about our data, not a
// finding about the area. Either way the line stands
// alone in the report, so it is composed as a sentence
// (BUG-065), and the none-within form is recomposed from
// its parts WITHOUT the basis parenthesis: the basis is
// explanation, and explanation sits in the note style or
// in Section 10's Distances note, never inside a finding
// at body size (BUG-050(i)). The recomposition is at the
// site's one-decimal precision, never the brain's raw
// line — the results page's rule (BUG-014), extended to
// the report by the founder's ruling of 20 Nov 2026.
// The brain's line itself is untouched.
function stateLine(answer: CategoryAnswer): ReportBlock | null {
  if (answer.state === "within" || answer.line === null) return null;
  if (answer.state === "empty" || answer.state === "empty-map" || answer.state === "none-within") {
    const text =
      answer.state === "none-within" && answer.beyondNearest
        ? `None within 2 miles — nearest is ${answer.beyondNearest.name}, ${formatMiles(answer.beyondNearest.miles)} miles away.`
        : sentenceLine(answer.line);
    return { type: "boldLine", text };
  }
  return { type: "line", text: sentenceLine(answer.line) };
}

function section(number: number, title: string, blocks: ReportBlock[]): ReportSectionView {
  // No check-link row closes a section (BUG-052): the
  // sample report carries its How-we-check links only in
  // Section 10, and so does the product — section10 builds
  // the one list from REPORT_SECTION_CHECK_LINKS itself.
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

// The certificates that are this home's own, where the
// postcode's certificates filed under the home's own
// address: a conservative starts-with match on the
// normalised address (the register's address against the
// resolution's label, then its number-and-street key).
// No match, no claim — the masthead and Section 1 simply
// carry no certificate facts for the home. Section 9
// reads the whole set (a home can hold two certificates
// that disagree); the masthead's certificate is the
// first of them.
function matchedCertificates(
  resolution: AddressResolution,
  certificates: ServedCertificate[],
): ServedCertificate[] {
  if (resolution.rung !== 1) return [];
  const address = resolution.address;
  const norm = (value: string) =>
    value
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const label = norm(address.label);
  const streetKey = norm(`${address.paon} ${address.street}`);
  return certificates.filter((cert) => {
    const certAddress = norm(cert.address);
    if (certAddress === label || certAddress.startsWith(`${label} `)) return true;
    return streetKey.length > 3 && certAddress.startsWith(streetKey);
  });
}

function matchedCertificate(
  resolution: AddressResolution,
  certificates: ServedCertificate[],
): ServedCertificate | null {
  return matchedCertificates(resolution, certificates)[0] ?? null;
}

// The newest of a home's certificates by registration
// date — the register's latest word on the home, which
// is the certificate Section 9's heating and improvement
// questions read. A certificate with no filed date sorts
// below every dated one.
function newestCertificate(certificates: ServedCertificate[]): ServedCertificate | null {
  let best: ServedCertificate | null = null;
  for (const cert of certificates) {
    if (!best || (cert.registrationDate ?? "") > (best.registrationDate ?? "")) best = cert;
  }
  return best;
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
      // The strip's sale date takes the sample's short
      // form ("22 Mar 2022", BUG-053); prose dates keep
      // the full month.
      meta.push({ label: "Sale date", value: formatShortFiledDate(last.date) });
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
  // The strip's fifth cell (BUG-053): the Report date, in
  // the sample's arrangement — the full-month date the
  // prepared line carries, as a meta cell of its own. The
  // preparedLine itself stays in the model: the PDF
  // cover's facts date is taken from it, exactly as
  // before; only the masthead's small line under the
  // strip is gone (the renderer no longer prints it).
  meta.push({ label: "Report date", value: prepared });
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

function buildShortVersion(
  input: ReportInput,
  cert: ServedCertificate | null,
): ReportView["shortVersion"] {
  const { nearby, flood, area, sold, crime } = input;
  const groups: { heading: string; lines: ReportRichLine[] }[] = [];
  const add = (heading: string, lines: (ReportRichLine | null)[]) => {
    const kept = lines.filter((line): line is ReportRichLine => line !== null && line.length > 0);
    if (kept.length > 0) groups.push({ heading, lines: kept });
  };
  const rung1 = input.resolution.rung === 1;

  // Price & sold history. The median bullet leads with
  // the median figure (the founder's ruling on BUG-040:
  // the brain's served median line is a continuation
  // fragment that never states the figure — it is not
  // lifted; the bullet is composed from the figure, the
  // count and the span).
  const priceLines: (ReportRichLine | null)[] = [];
  if (sold.kind === "sold-prices") {
    if ("soldPrices" in sold) {
      priceLines.push([seg(sentenceLine(sold.soldPrices.reason))]);
    } else {
      if (sold.rung === 1 && sold.ownHistory.length > 0) {
        const last = sold.ownHistory[0];
        priceLines.push([
          seg("Last sold for "),
          boldSeg(`${formatPounds(last.price)} on ${formatFiledDate(last.date)}`),
          seg(
            sold.ownHistory.length === 1 && last.newBuild
              ? " — its first recorded sale as a new build."
              : ".",
          ),
        ]);
      }
      const median = sold.median;
      if (median.state === "served" && median.value !== null) {
        priceLines.push([
          seg("Postcode median (category A sales): "),
          boldSeg(formatPounds(median.value)),
          seg(
            median.spanFrom && median.spanTo
              ? `, over ${count(median.counted)} counted sales spanning ${formatShortFiledDate(median.spanFrom)} to ${formatShortFiledDate(median.spanTo)}.`
              : `, over ${count(median.counted)} counted sales.`,
          ),
        ]);
      } else if (median.line) {
        priceLines.push([seg(sentenceLine(median.line))]);
      } else if (sold.stateLine) {
        priceLines.push([seg(sentenceLine(sold.stateLine))]);
      }
    }
  } else {
    priceLines.push([seg(sentenceLine(sold.soldPrices.reason))]);
  }
  add("Price & sold history", priceLines);

  // Education.
  const primaryAnswer = category(nearby, "schools-primary");
  const secondaryAnswer = category(nearby, "schools-secondary");
  const primary = nearestOf(primaryAnswer);
  const secondaryPlaces = secondaryAnswer?.places ?? [];
  const secondary = nearestOf(secondaryAnswer);
  const educationLines: (ReportRichLine | null)[] = [
    primary
      ? [
          seg("Nearest primary: "),
          boldSeg(`${primary.name}, ${formatMiles(primary.miles)} miles`),
          seg("."),
        ]
      : null,
    secondaryPlaces.length > 0
      ? [
          seg("Nearest secondary: "),
          seg(`${secondaryPlaces[0].name}, `),
          boldSeg(`${formatMiles(secondaryPlaces[0].miles)} miles`),
          ...(secondaryPlaces[1]
            ? [
                seg(`; ${secondaryPlaces[1].name} `),
                boldSeg(`${formatMiles(secondaryPlaces[1].miles)} miles`),
              ]
            : []),
          seg("."),
        ]
      : secondary
        ? [
            seg("Nearest secondary: "),
            boldSeg(`${secondary.name}, ${formatMiles(secondary.miles)} miles`),
            seg("."),
          ]
        : null,
    secondaryAnswer?.nearestSelective
      ? [
          seg(`${secondaryAnswer.nearestSelective.name}, `),
          boldSeg(`${formatMiles(secondaryAnswer.nearestSelective.miles)} miles`),
          // The selective school's label, in the report's
          // highlighted (bold) form, keeping the
          // entry-by-test fact (item 7).
          seg(" — "),
          boldSeg("Grammar school"),
          seg(", entry by test."),
        ]
      : secondaryAnswer?.nearestSelectiveLine
        ? [seg(sentenceLine(secondaryAnswer.nearestSelectiveLine))]
        : null,
  ];
  add("Education", educationLines);

  // Health.
  const gp = nearestOf(category(nearby, "gp"));
  const dentist = nearestOf(category(nearby, "dentist"));
  const pharmacy = nearestOf(category(nearby, "pharmacy"));
  const aeAnswer = category(nearby, "ae");
  add("Health", [
    gp
      ? [seg("GP surgery "), boldSeg(`${formatMiles(gp.miles)} miles`), seg(` — ${gp.name}.`)]
      : null,
    dentist && pharmacy
      ? [
          seg("NHS dentist "),
          boldSeg(`${formatMiles(dentist.miles)} miles`),
          seg(" and pharmacy "),
          boldSeg(`${formatMiles(pharmacy.miles)} miles`),
          seg("."),
        ]
      : dentist
        ? [
            seg("NHS dentist "),
            boldSeg(`${formatMiles(dentist.miles)} miles`),
            seg(` — ${dentist.name}.`),
          ]
        : pharmacy
          ? [
              seg("Pharmacy "),
              boldSeg(`${formatMiles(pharmacy.miles)} miles`),
              seg(` — ${pharmacy.name}.`),
            ]
          : null,
    // The A&E absence bullet carries its subject (BUG-041:
    // the brain's none-within line is a subjectless
    // continuation for its labelled results-page block;
    // the report composes its own, with the hospital and
    // its distance in bold, on the sample's form).
    aeAnswer && aeAnswer.state === "none-within" && aeAnswer.beyondNearest
      ? [
          seg("No A&E within 2 miles — nearest is "),
          boldSeg(
            `${aeAnswer.beyondNearest.name}, ${formatMiles(aeAnswer.beyondNearest.miles)} miles`,
          ),
          seg("."),
        ]
      : aeAnswer && aeAnswer.state === "within" && aeAnswer.places.length > 0
        ? [
            seg("A&E "),
            boldSeg(`${formatMiles(aeAnswer.places[0].miles)} miles`),
            seg(` — ${aeAnswer.places[0].name}.`),
          ]
        : null,
  ]);

  // What's nearby.
  const station = nearestOf(category(nearby, "station"));
  const supermarket = category(nearby, "supermarket");
  const park = nearestOf(category(nearby, "parks"));
  const library = nearestOf(category(nearby, "libraries"));
  add("What's nearby", [
    station
      ? [seg(`${station.name} `), boldSeg(`${formatMiles(station.miles)} miles`), seg(".")]
      : null,
    supermarket && supermarket.places.length > 0
      ? [
          ...supermarket.places.flatMap((place, index) => [
            seg(`${index > 0 ? "; " : ""}${place.name} `),
            boldSeg(`${formatMiles(place.miles)} miles`),
          ]),
          seg("."),
        ]
      : null,
    park && library
      ? [
          seg(`${park.name} `),
          boldSeg(`${formatMiles(park.miles)} miles`),
          seg("; library "),
          boldSeg(`${formatMiles(library.miles)} miles`),
          seg("."),
        ]
      : park
        ? [seg(`${park.name} `), boldSeg(`${formatMiles(park.miles)} miles`), seg(".")]
        : library
          ? [seg("Library "), boldSeg(`${formatMiles(library.miles)} miles`), seg(".")]
          : null,
  ]);

  // Risks. Flood bullets compose from each layer's own
  // served state (BUG-040(iii)): the likelihood layer in
  // the sample's short form, the zones layer by its
  // point state, surface water by its nearest edges. The
  // crime bullet is BUG-049's composition: the sample's
  // wording, built from the served figures, the England
  // figure folded in as the bullet's second sentence.
  const riskLines: (ReportRichLine | null)[] = [];
  if (flood.kind === "flood") {
    for (const layer of flood.flood.layers) {
      if (layer.pointState === "not-filed") {
        riskLines.push([seg(sentenceLine(layer.line))]);
      } else if (layer.layer === "rofrs") {
        if (layer.pointState === "inside" && layer.covering) {
          riskLines.push([
            seg("Flood from rivers & sea: "),
            boldSeg(layer.covering.displayLabel),
            seg("."),
          ]);
        } else {
          const nearestEdge = layer.proximity[0] ?? layer.beyondNearest;
          riskLines.push([
            seg("Flood from rivers & sea: "),
            boldSeg("no band at this point"),
            seg(
              nearestEdge
                ? ` — nearest ${nearestEdge.displayLabel} band edge ${formatMiles(nearestEdge.miles)} miles away.`
                : ".",
            ),
          ]);
        }
      } else if (layer.layer === "flood_zone") {
        if (layer.pointState === "inside" && layer.covering) {
          riskLines.push([
            seg(
              `Flood zones for planning: ${rung1 ? "this home is in " : "the postcode point is in "}`,
            ),
            boldSeg(layer.covering.displayLabel),
            seg("."),
          ]);
        } else {
          riskLines.push([seg(sentenceLine(layer.line))]);
        }
      } else if (layer.layer === "rofsw") {
        if (layer.pointState === "inside" && layer.covering) {
          riskLines.push([
            seg("Surface water: "),
            boldSeg(layer.covering.displayLabel),
            seg(" band at this point."),
          ]);
        } else if (layer.proximity.length > 0) {
          riskLines.push([
            seg("Surface water: nearest "),
            seg(
              layer.proximity
                .map((edge) => `${edge.displayLabel} ${formatMiles(edge.miles)} miles`)
                .join(", "),
            ),
            seg("."),
          ]);
        } else {
          riskLines.push([seg(sentenceLine(layer.line))]);
        }
      } else {
        riskLines.push([seg(sentenceLine(layer.line))]);
      }
    }
  } else {
    riskLines.push([seg(sentenceLine(flood.flood.reason))]);
  }
  if (crime.kind === "crime" && crime.crime.state === "served") {
    const served = crime.crime;
    const crimeLine: ReportRichLine = [
      seg("Crime: "),
      boldSeg(`${count(served.total)} incidents`),
      seg(
        ` within 1 mile, ${monthName(served.windowFrom).slice(0, 3)} ${monthYear(served.windowFrom)}–${monthName(served.windowTo).slice(0, 3)} ${monthYear(served.windowTo)}.`,
      ),
    ];
    if (served.perHead) {
      crimeLine.push(
        seg(
          ` ${per1000Text(served.perHead.per1000)} recorded crimes for every 1,000 residents here`,
        ),
      );
      if (served.englandFigure) {
        crimeLine.push(
          seg(
            `; across England, the figure is ${per1000Text(served.englandFigure.englandPer1000)}.`,
          ),
        );
      } else {
        crimeLine.push(seg("."));
      }
    }
    riskLines.push(crimeLine);
  }
  add("Risks", riskLines);

  // Home, costs & energy. Each bullet composes from the
  // section's served figures where the report holds them
  // (the home's own certificate, the council's Band D,
  // the deprivation words form, the gigabit share); the
  // served headline line, sentence-cased, is the fallback
  // — never the raw fragment (BUG-040(v)).
  if (area.kind === "area-bundle") {
    const sections = area.sections;
    const bandD = sections.councilTax.bands.find((band) => band.band === "D");
    add("Home, costs & energy", [
      cert && cert.band !== null && cert.rating !== null
        ? [
            seg("Energy rating "),
            boldSeg(`Band ${cert.band} (score ${cert.rating})`),
            seg(
              cert.potentialBand
                ? `, with potential to reach ${cert.potentialBand}${cert.potentialRating !== null ? ` (${cert.potentialRating})` : ""}.`
                : ".",
            ),
            ...(cert.energyCosts
              ? [seg(` Estimated energy cost about ${cert.energyCosts.currentAnnualLabel} a year.`)]
              : []),
          ]
        : sections.epc.line
          ? [seg(sentenceLine(sections.epc.line))]
          : null,
      bandD
        ? [
            seg("Council tax Band D: "),
            boldSeg(`${bandD.labelPence} a year`),
            seg(` (${bandD.monthlyLabelPence} a month).`),
          ]
        : sections.councilTax.line
          ? [seg(sentenceLine(sections.councilTax.line))]
          : null,
      sections.imd.state === "served" && sections.imd.decile !== null
        ? [
            seg("Deprivation: "),
            boldSeg(decileWords(sections.imd.decile)),
            seg(" (Indices of Deprivation 2025)."),
          ]
        : sections.imd.line
          ? [seg(sentenceLine(sections.imd.line))]
          : null,
      sections.broadband.state === "served" && sections.broadband.gigabitCapablePct !== null
        ? [
            seg(
              sections.broadband.gigabitCapablePct >= 100
                ? "Gigabit-capable broadband is available at this postcode."
                : `Gigabit-capable broadband is available to ${pctText(sections.broadband.gigabitCapablePct)}% of premises in this postcode.`,
            ),
          ]
        : sections.broadband.line
          ? [seg(sentenceLine(sections.broadband.line))]
          : null,
    ]);
  }

  return groups.length > 0 ? { groups } : null;
}

// The crime per-1,000 figure in the brain's own text form
// (lib/crime.ts's per1000Text, mirrored: the report
// composes its sentences from the served number, in the
// same words the brain would print).
function per1000Text(value: number): string {
  return value === 0 ? "0" : value.toFixed(1);
}

// A percentage in the area brain's own text form
// (lib/area-bundle.ts's fmtPct, mirrored).
function pctText(value: number): string {
  return String(Math.round(value * 100) / 100);
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

// A price difference with its sign carried in words'
// form: "+£25,000", "−£10,000", "£0" for no change.
function signedPounds(value: number): string {
  if (value === 0) return "£0";
  return value > 0 ? `+${formatPounds(value)}` : `−${formatPounds(-value)}`;
}

// The time between two filed sale dates, in the sample's
// plain form: whole years and months ("3 years",
// "2 years 3 months", "8 months", "Less than a month").
function heldText(fromIso: string, toIso: string): string {
  const from = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const to = new Date(`${toIso.slice(0, 10)}T00:00:00Z`);
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  if (months <= 0) return "Less than a month";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  if (rest > 0) parts.push(`${rest} month${rest === 1 ? "" : "s"}`);
  return parts.join(" ");
}

// The annual growth between two consecutive filed sales
// of the same home: the compound rate that carries the
// earlier price to the later one over the years between
// their dates — arithmetic over the two filed facts,
// nothing else. Unmeasurable pairs (no time between the
// sales, no earlier price) print the sample's "—".
function annualGrowthText(previous: ServedSale, sale: ServedSale): string {
  const days =
    (Date.parse(`${sale.date.slice(0, 10)}T00:00:00Z`) -
      Date.parse(`${previous.date.slice(0, 10)}T00:00:00Z`)) /
    86_400_000;
  if (!(days > 0) || previous.price <= 0) return "—";
  const years = days / 365.25;
  const pct = (Math.pow(sale.price / previous.price, 1 / years) - 1) * 100;
  if (!Number.isFinite(pct)) return "—";
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

function tickLabel(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `£${Number.isInteger(m) ? String(m) : m.toFixed(1)}m`;
  }
  if (value >= 1000) {
    const k = value / 1000;
    return `£${Number.isInteger(k) ? String(k) : k.toFixed(1)}k`;
  }
  return `£${value}`;
}

// The sold-prices dot plot: one dot per counted sale on a
// linear £ axis padded to round ticks, the median as a
// dashed line, the home's last sale (rung 1) as the brass
// dot on the axis. Dots sharing a 12px column stack
// upward in 14px rows; the viewBox grows by one row-step
// for every stack row beyond the Master's two, so no dot
// is ever thinned, binned or hidden — the caption
// promises one dot per counted sale. Built only where a
// median is served: at 1–4 counted sales the section's
// "too few for a median" line stands alone (founder
// ruling, 20 Nov 2026).
function buildDotPlot(args: {
  postcode: string;
  countedSales: ServedSale[];
  medianValue: number;
  counted: number;
  spanFrom: string | null;
  spanTo: string | null;
  homePrice: number | null;
}): ReportDotPlotModel | null {
  const { postcode, countedSales, medianValue, counted } = args;
  if (countedSales.length === 0) return null;
  const prices = countedSales.map((sale) => sale.price);
  const extent = args.homePrice !== null ? [...prices, args.homePrice] : prices;
  const min = Math.min(...extent);
  const max = Math.max(...extent);
  const step = niceStep((max - min) / 4);
  let axisMin = Math.floor(min / step) * step;
  let axisMax = Math.ceil(max / step) * step;
  if (axisMin === min) axisMin -= step;
  if (axisMax === max) axisMax += step;
  if (axisMax <= axisMin) axisMax = axisMin + step;
  const x = (price: number) => round1(30 + ((price - axisMin) / (axisMax - axisMin)) * 700);
  const columns = new Map<number, number>();
  const placed = [...countedSales]
    .sort((a, b) => a.price - b.price)
    .map((sale) => {
      const px = x(sale.price);
      const key = Math.round(px / 12);
      const level = columns.get(key) ?? 0;
      columns.set(key, level + 1);
      return { x: px, level };
    });
  const maxStack = Math.max(1, ...columns.values());
  const topPad = Math.max(0, maxStack - 2) * 14;
  const axisY = 58 + topPad;
  const medianX = x(medianValue);
  const homeX = args.homePrice !== null ? x(args.homePrice) : null;
  const ticks: ReportDotPlotModel["ticks"] = [];
  for (let value = axisMin; value <= axisMax; value += step) {
    ticks.push({
      x: x(value),
      label: tickLabel(value),
      anchor: value === axisMax ? ("end" as const) : ("middle" as const),
    });
  }
  const onMedian = args.homePrice !== null && args.homePrice === medianValue;
  let caption = `Each dot is one of the ${counted} counted recorded sales in this postcode (category A)`;
  if (args.spanFrom && args.spanTo)
    caption += `, spanning ${formatFiledDate(args.spanFrom)} to ${formatFiledDate(args.spanTo)}`;
  caption += `. The dashed line is the postcode median, ${formatPounds(medianValue)}.`;
  if (maxStack > 1)
    caption +=
      " Dots at the same or nearly the same price stack above the line, so every sale stays visible.";
  if (args.homePrice !== null)
    caption += onMedian
      ? " This home's sale, the brass dot, sits on the median line."
      : " This home's sale is the brass dot.";
  let ariaLabel = `Dot plot of the ${counted} counted recorded sales in postcode ${postcode}. The dashed line is the postcode median, ${formatPounds(medianValue)}.`;
  if (args.homePrice !== null)
    ariaLabel += ` This home's sale, ${formatPounds(args.homePrice)}, is the large brass dot${onMedian ? ", on the median line" : ""}.`;
  return {
    title:
      args.homePrice !== null
        ? `Where this home sits — recorded sales in postcode ${postcode}`
        : `Recorded sales in postcode ${postcode}`,
    height: 118 + topPad,
    axisY,
    tickY: axisY + 50,
    median: {
      x: medianX,
      label: `Median ${formatPounds(medianValue)}`,
      anchor: anchorFor(medianX),
      labelY: 12 + topPad,
      lineY1: 18 + topPad,
      lineY2: axisY + 26,
    },
    dots: placed.map((dot) => ({ x: dot.x, y: axisY - 14 * dot.level })),
    home:
      homeX !== null && args.homePrice !== null
        ? {
            x: homeX,
            y: axisY,
            label: `This home — ${formatPounds(args.homePrice)}`,
            anchor: anchorFor(homeX),
            labelY: axisY + 32,
          }
        : null,
    ticks,
    caption,
    ariaLabel,
  };
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
  const previous = history.length > 1 ? history[1] : null;
  // The sample's four tiles and five-column history table
  // (BUG-045, the founder-commissioned parity audit of
  // 21 Nov 2026 restoring the sample's form over the M8.1
  // carve-out's two-tile form): the Change and Held tiles
  // and the table's three right-hand columns are plain
  // arithmetic over this home's OWN consecutive filed
  // sales — the difference between two recorded prices,
  // the time between two recorded dates, and that
  // difference spread evenly over the years between
  // them. No index, no adjustment, no other home's sale
  // enters any of them, and a first recorded sale shows
  // the sample's honest "—" with its reason, exactly as
  // the sample's own single-sale home does.
  blocks.push({
    type: "tiles",
    tiles: [
      {
        label: "Last sale",
        value: formatPounds(last.price),
        sub: `${formatShortFiledDate(last.date)} · HM Land Registry`,
      },
      {
        label: "Times sold",
        value: String(history.length),
        sub:
          history.length === 1
            ? "Only recorded sale found for this address"
            : `${history.length} recorded sales found for this address`,
      },
      {
        label: "Change since previous sale",
        value: previous ? signedPounds(last.price - previous.price) : "—",
        sub: previous
          ? `Previous sale ${formatPounds(previous.price)} on ${formatShortFiledDate(previous.date)}`
          : "First recorded sale — no previous sale to compare",
      },
      {
        label: "Held by last owner",
        value: previous ? heldText(previous.date, last.date) : "—",
        sub: previous
          ? `${formatShortFiledDate(previous.date)} to ${formatShortFiledDate(last.date)}`
          : last.newBuild
            ? `New build — the ${last.date.slice(0, 4)} sale was its first`
            : "Only recorded sale — no previous owner to measure",
      },
    ],
  });
  const bullets: ReportRichLine[] = [];
  const typeParts = [
    cert?.dwellingType
      ? cert.dwellingType.charAt(0).toLowerCase() + cert.dwellingType.slice(1)
      : last.propertyType
        ? (PROPERTY_TYPE_LABELS[last.propertyType]?.toLowerCase() ?? null)
        : null,
    last.tenure ? (TENURE_LABELS[last.tenure]?.toLowerCase() ?? null) : null,
    cert?.floorAreaSqM != null ? `${cert.floorAreaSqM} m²` : null,
  ].filter((part): part is string => part !== null);
  if (typeParts.length > 0) bullets.push([boldSeg("Type:"), seg(` ${typeParts.join(", ")}.`)]);
  const earliest = history[history.length - 1];
  if (earliest.newBuild)
    bullets.push([
      boldSeg("Built:"),
      seg(` new build, first sold in ${earliest.date.slice(0, 4)}.`),
    ]);
  bullets.push([
    boldSeg("Recorded sales for this address:"),
    seg(history.length === 1 ? " one — the sale below." : ` ${history.length} — the sales below.`),
  ]);
  blocks.push({ type: "richList", items: bullets });
  blocks.push({
    type: "table",
    head: ["Sale date", "Sale price", "Price change", "Years held", "Annual growth"],
    rows: history.map((sale, index) => {
      const prev = history[index + 1] ?? null;
      return [
        formatShortFiledDate(sale.date),
        formatPounds(sale.price),
        prev
          ? signedPounds(sale.price - prev.price)
          : `— first recorded sale${sale.newBuild ? " (new build)" : ""}`,
        prev ? heldText(prev.date, sale.date) : "",
        prev ? annualGrowthText(prev, sale) : "",
      ];
    }),
    caption: sold.ownExplainer,
    boldColumns: [1],
  });
  if (sold.building) {
    blocks.push({ type: "sub", text: `Sales in ${sold.building.building}` });
    // The building's middle price stands as a stat in its
    // own right (BUG-036): the counted line and the
    // explainer printed without the figure itself, so the
    // one number the block exists to give never appeared.
    // The form is Section 2's — the median as a tile,
    // labelled and scoped — printed only when the median
    // is served; the too-few and none-recorded states keep
    // their line alone.
    if (sold.building.median.state === "served" && sold.building.median.value !== null) {
      blocks.push({
        type: "tiles",
        tiles: [
          {
            label: "Building median",
            value: formatPounds(sold.building.median.value),
            sub: `Category A median for ${sold.building.building}`,
          },
        ],
      });
    }
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
    const tiles: { label: string; value: string; sub: string; smallValue?: boolean }[] = [
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
        sub: `${formatShortFiledDate(median.spanFrom)} to ${formatShortFiledDate(median.spanTo)}`,
        // The sample sets this tile's long value at the
        // reduced size (BUG-054's micro-difference).
        smallValue: true,
      });
    }
    if (sold.rung === 1 && sold.ownHistory.length > 0) {
      const last = sold.ownHistory[0];
      tiles.push({
        label: "This home",
        value: formatPounds(last.price),
        sub: `${formatShortFiledDate(last.date)} · HM Land Registry`,
      });
    }
    blocks.push({ type: "tiles", tiles });
  } else if (median.line) {
    blocks.push({ type: "line", text: median.line });
  }
  blocks.push({ type: "note", text: median.explainer });
  if (median.state === "served" && median.value !== null) {
    // The dot plot stands with the median it pictures:
    // every counted sale, the median line, and at rung 1
    // the home's own last sale. No median, no plot — the
    // too-few line above stands alone (founder ruling).
    const plot = buildDotPlot({
      postcode: sold.postcode,
      countedSales: sold.countedSales,
      medianValue: median.value,
      counted: median.counted,
      spanFrom: median.spanFrom,
      spanTo: median.spanTo,
      homePrice: sold.rung === 1 && sold.ownHistory.length > 0 ? sold.ownHistory[0].price : null,
    });
    if (plot) blocks.push({ type: "dotPlot", plot });
  }
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
  decorate?: (row: ReportRow, place: NearbyPlace) => ReportRow,
) {
  blocks.push({ type: "sub", text: heading });
  if (!answer) return;
  if (answer.places.length > 0) {
    // School rows take the results page's school distance
    // bands (1/2 miles — item 8).
    let rows = placeRows(answer, extra, "school");
    if (decorate) rows = rows.map((row, index) => decorate(row, answer.places[index]));
    blocks.push({ type: "rows", rows });
  }
  const state = stateLine(answer);
  if (state) blocks.push(state);
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
  // The report's school lists name five (BUG-044): the
  // headings carry the depth, as the sample's do — the
  // report's nearby bundle is built at that depth by the
  // serve layer (checkReport), so the lists stand behind
  // the headings.
  schoolGroup(
    blocks,
    `Primary schools — nearest ${REPORT_SCHOOL_LIST_SIZE}`,
    category(nearby, "schools-primary"),
  );
  const secondary = category(nearby, "schools-secondary");
  schoolGroup(
    blocks,
    `Secondary schools — nearest ${REPORT_SCHOOL_LIST_SIZE}`,
    secondary,
    secondaryExtra,
    // A selective school's row carries the highlighted
    // "Grammar school" label, and keeps the entry-by-test
    // fact as a line of its own under the row (item 7 —
    // the fact is the DfE admissions-policy field, already
    // served on the place).
    (row, place) =>
      place.selective === true
        ? {
            ...row,
            tag: "Grammar school",
            tagStar: true,
            extra: ["Entry by test.", ...row.extra],
          }
        : row,
  );
  if (secondary?.nearestSelectiveLine)
    blocks.push({ type: "line", text: sentenceLine(secondary.nearestSelectiveLine) });
  // The catchment honesty block no longer stands here
  // (BUG-050(ii)): the sample carries the school-places
  // disclaimer in Section 10, not mid-section, so the
  // block's content — no catchment boundaries are held,
  // and the answer lives with the council and the school
  // — is folded into Section 10's School places disclaimer
  // there, with its GOV.UK admissions link beside it. The
  // free results page keeps its own block, untouched.
  schoolGroup(blocks, "Sixth forms and colleges", category(nearby, "sixth-forms"));
  schoolGroup(blocks, "Nurseries", category(nearby, "nurseries"));
  return section(3, "Schools & nurseries", blocks);
}

// ------------------------------------------------------------------
// Section 4 — Health, air & crime
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

// The crime month chart: the served monthly counts in
// window order, on a nice-step axis computed from the
// data (the sample's axis is drawn for a highest month
// of 47; Exeter's window runs to the high hundreds, so
// the step adapts — 1/2/5 × 10^n, the first step-multiple
// at or above the highest month as the top gridline).
// The caption restates the window and the reconciliation
// only — it never names a highest or lowest month (the
// Master dropped the authority's naming; D24 serves the
// counts as dated facts, with no computed emphasis).
function buildMonthChart(served: ServedCrime): ReportMonthChartModel {
  const months = served.months;
  const maxCount = Math.max(0, ...months.map((m) => m.count));
  const step = maxCount === 0 ? 10 : niceStep(maxCount / 5);
  const axisTop = maxCount === 0 ? 10 : Math.ceil(maxCount / step) * step;
  const scale = 200 / axisTop;
  const gridlines: ReportMonthChartModel["gridlines"] = [];
  for (let value = 0; value <= axisTop; value += step) {
    gridlines.push({
      y: round1(232 - value * scale),
      label: count(value),
      baseline: value === 0,
    });
  }
  const bars = months.map((m, index) => {
    const height = round1(m.count * scale);
    const y = round1(232 - height);
    return {
      x: 58 + index * 58,
      y,
      height,
      cx: 58 + index * 58 + 19,
      value: count(m.count),
      valueY: round1(y - 8),
      month: monthName(m.month).slice(0, 3),
    };
  });
  const fromName = monthName(served.windowFrom);
  const toName = monthName(served.windowTo);
  const fromYear = monthYear(served.windowFrom);
  const toYear = monthYear(served.windowTo);
  const windowText =
    fromYear !== "" && toYear !== "" && fromYear !== toYear
      ? `Months run ${fromName} to December ${fromYear}, then January to ${toName} ${toYear}.`
      : `Months run ${fromName} to ${toName} ${toYear}.`;
  const caption = `${windowText} The ${months.length === 12 ? "twelve " : ""}bars add up to the ${count(served.total)} total.`;
  const ariaLabel = `Bar chart of recorded incidents by month, ${monthLabel(served.windowFrom)} to ${monthLabel(served.windowTo)}: ${months.map((m) => `${monthName(m.month)} ${count(m.count)}`).join(", ")}. Total ${count(served.total)}.`;
  return {
    title: `Incidents by month — ${monthLabel(served.windowFrom)} to ${monthLabel(served.windowTo)}`,
    height: 262,
    gridlines,
    bars,
    caption,
    ariaLabel,
  };
}

// The crime category chart: ALL 14 published categories
// as individual rows, zero-filled where the window
// recorded none (founder ruling, 20 Nov 2026 — a missing
// row would invite "was it even checked?"; D24 serves
// zero counts as recorded zeroes). The canonical list is
// CRIME_CATEGORY_SLUGS in lib/district.ts — the 14
// published Police.uk slugs; the label table's fifteenth
// key, "unknown", is the loader's no-category bucket,
// not one of the 14, and serves only where the brain
// served it with a count, never zero-filled. Rows keep
// the brain's own order (count descending, slug order on
// ties) over the filled union, so the zero rows fall
// last in slug order and the bars still sum to the
// section's headline total. Labels are the publisher's
// names via crimeCategoryLabel — the Master's "&" forms
// are the sample's shorthand, not the product's words.
function buildCategoryBars(served: ServedCrime): ReportBlock {
  const bySlug = new Map(served.categories.map((c) => [c.slug, c.count]));
  const slugs = new Set<string>([...CRIME_CATEGORY_SLUGS, ...bySlug.keys()]);
  const filled = [...slugs]
    .map((slug) => ({ slug, value: bySlug.get(slug) ?? 0 }))
    .sort((a, b) => b.value - a.value || a.slug.localeCompare(b.slug));
  const largest = filled[0]?.value ?? 0;
  return barsBlock(
    `Incidents by category — 12 months to ${monthLabel(served.windowTo)} · all 14 categories`,
    filled.map((row) => ({
      label: crimeCategoryLabel(row.slug),
      widthPct: largest > 0 ? (row.value / largest) * 100 : 0,
      value: count(row.value),
    })),
    `All 14 Police.uk categories are shown in full. The categories above add up to the ${count(served.total)} total. ${served.basis}`,
  );
}

function section4(input: ReportInput): ReportSectionView {
  const blocks: ReportBlock[] = [];
  const { nearby, crime } = input;
  const sections = areaSections(input);

  // Health, in the sample's form (BUG-048): ONE
  // subsection of labelled rows — the row's name carries
  // the service ("GP — …", "Hospital with A&E — …"), each
  // with its detail sentence and its distance pill. A
  // service whose nearest stands beyond the radius still
  // draws its row, for that nearest, with the absence
  // stated in the row's detail (the sample's A&E row);
  // a service with nothing to name keeps its composed
  // state line.
  const healthServices: { key: NearbyCategory; prefix: string; absenceNoun: string }[] = [
    { key: "gp", prefix: "GP", absenceNoun: "GP surgery" },
    { key: "dentist", prefix: "NHS dentist", absenceNoun: "NHS dentist" },
    { key: "pharmacy", prefix: "Pharmacy", absenceNoun: "pharmacy" },
    { key: "ae", prefix: "Hospital with A&E", absenceNoun: "A&E" },
    { key: "maternity", prefix: "Maternity unit", absenceNoun: "maternity unit" },
  ];
  blocks.push({ type: "sub", text: "Health" });
  for (const service of healthServices) {
    const answer = category(nearby, service.key);
    if (!answer) continue;
    // The distance chip's band family (item 8): A&E rows
    // take the results page's hospital bands (5/10 miles),
    // the rest the everyday bands.
    const family = service.key === "ae" ? "hospital" : "everyday";
    if (answer.places.length > 0) {
      const rows = placeRows(answer, healthExtra(service.key), family).map((row) => ({
        ...row,
        name: `${service.prefix} — ${row.name}`,
      }));
      blocks.push({ type: "rows", rows });
    } else if (answer.state === "none-within" && answer.beyondNearest) {
      const beyond = answer.beyondNearest;
      blocks.push({
        type: "rows",
        rows: [
          {
            name: `${service.prefix} — ${beyond.name}`,
            detail: `There is no ${service.absenceNoun} within 2 miles of this home; ${beyond.name} is the nearest, at ${formatMiles(beyond.miles)} miles.`,
            tag: null,
            dist: `${formatMiles(beyond.miles)} mi`,
            distBand: distanceBand(family, beyond.miles),
            extra: [],
          },
        ],
      });
    } else {
      const state = stateLine(answer);
      if (state) blocks.push(state);
    }
  }

  if (sections) {
    const air = sections.air;
    // The sample's air form (BUG-048), as the print-check
    // batch settles it (items 2 and 6): the sub names the
    // source and the modelled year; the table carries the
    // yardsticks as its own columns — the modelled level
    // against the UK legal limit and the WHO 2021
    // guideline (D50's figures, in the sample's shape) —
    // and each pollutant's position against those
    // yardsticks prints INSIDE the table, as a second line
    // under its own modelled level, never as a free note
    // under the whole table. The modelled-level cell is
    // highlighted red ONLY where the level is above the
    // UK legal limit (position "above-uk-limit"); a level
    // above the WHO guideline alone never highlights. The
    // long explainers — the yardstick sentences, the
    // zone-compliance basis, the AQMA basis — no longer
    // stand in the report at all: they live on the
    // air-quality How-we-check page, which Section 10
    // links (item 20's rule: minimum explanation here,
    // the fuller explanation behind the link). The table's
    // caption is the short key line — modelled levels for
    // the whole square kilometre, not a measurement at
    // this home. Where a filing predates the yardsticks,
    // the table keeps its two-column served form.
    blocks.push({
      type: "sub",
      text: air.year !== null ? `Air — Defra modelled, ${air.year}` : "Air quality",
    });
    if (air.line) blocks.push({ type: "line", text: air.line });
    if (air.state === "served" && air.year !== null) {
      if (air.yardsticks) {
        const pollutantNames: Record<string, string> = {
          NO2: "Nitrogen dioxide (NO₂)",
          "PM2.5": "Fine particles (PM2.5)",
          PM10: "Coarse particles (PM10)",
        };
        blocks.push({
          type: "table",
          head: [
            "Pollutant",
            "Modelled level",
            "UK legal limit (annual)",
            "WHO 2021 guideline (annual)",
          ],
          rows: air.yardsticks.pollutants.map((pollutant) => [
            pollutantNames[pollutant.pollutant.toUpperCase()] ?? pollutant.pollutant,
            `${pollutant.value} ${air.unit}`,
            `${pollutant.ukLimit} ${air.unit}`,
            `${pollutant.whoGuideline} ${air.unit}`,
          ]),
          caption: air.explainer,
          cellAlerts: air.yardsticks.pollutants.map((pollutant) => [
            false,
            pollutant.position === "above-uk-limit",
            false,
            false,
          ]),
          cellSubs: air.yardsticks.pollutants.map((pollutant) => [
            null,
            pollutant.summaryLine ? sentence(pollutant.summaryLine) : null,
            null,
            null,
          ]),
        });
      } else {
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
      }
    }
    // The AQMA answer as the sample draws it: a row —
    // name, detail sentence, distance pill where a
    // nearest serves — not a subsection of its own. Its
    // basis note no longer stands here (item 6): what an
    // AQMA is, and how one is declared, is explained on
    // the air-quality How-we-check page.
    if (air.aqma.state === "inside" || air.aqma.state === "nearest") {
      blocks.push({
        type: "rows",
        rows: [
          {
            name: "Air quality management area",
            detail: air.aqma.line,
            tag: null,
            dist: air.aqma.miles !== null ? `${formatMiles(air.aqma.miles)} mi` : null,
            distBand:
              air.aqma.miles !== null ? distanceBand("everyday", air.aqma.miles) : undefined,
            extra: [],
          },
        ],
      });
    } else {
      blocks.push({
        type: air.aqma.state === "none" ? "boldLine" : "line",
        text: sentenceLine(air.aqma.line),
      });
    }

    // Noise, as served: the publisher's band text
    // verbatim, day and night (scope (h)). The row labels
    // are the brain's lowercase kind words ("road noise");
    // a table's row label is a standalone line, so it is
    // capitalised here at the composition layer (item 4).
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
        rows: noise.bands.map((band) => [
          sentence(band.label),
          band.dayBand ?? "—",
          band.nightBand ?? "—",
        ]),
        caption: noise.explainer,
      });
    }
  }

  // Crime, in the sample's form (BUG-049): the sub names
  // the window; three bullets lead — the total composed
  // from the served figures in the sample's words, the
  // D39 calibration pair as one fully-bold bullet, and
  // the standing street-anonymity sentence — then the two
  // charts (M8.2), then the standing notes (the per-head
  // basis, the crime explainer, the stale line where one
  // serves, the calibration explainer). The brain's own
  // total/per-head/England lines feed the results page
  // and are not lifted here. The filed basis string rides
  // in the category chart's caption, where the category
  // table's caption carried it. A not-served state stays
  // a named line, chart-free.
  blocks.push({ type: "sub", text: "Crime — last 12 months" });
  if (crime.kind === "crime") {
    const served = crime.crime;
    if (served.state === "served") {
      const bullets: ReportRichLine[] = [
        [
          boldSeg(`${count(served.total)} incidents`),
          seg(
            ` recorded within 1 mile of ${input.resolution.rung === 1 ? "this home" : "this postcode"}, ${monthLabel(served.windowFrom)} to ${monthLabel(served.windowTo)} (Police.uk).`,
          ),
        ],
      ];
      if (served.perHead) {
        bullets.push([
          boldSeg(
            `${per1000Text(served.perHead.per1000)} recorded crimes for every 1,000 residents here.${
              served.englandFigure
                ? ` Across England, the figure is ${per1000Text(served.englandFigure.englandPer1000)}.`
                : ""
            }`,
          ),
        ]);
      } else if (served.englandFigure) {
        bullets.push([
          boldSeg(
            `Across England, the figure is ${per1000Text(served.englandFigure.englandPer1000)} recorded crimes for every 1,000 residents.`,
          ),
        ]);
      }
      bullets.push([
        seg("Incidents are recorded against nearby streets, not against individual houses."),
      ]);
      blocks.push({ type: "richList", items: bullets });
      if (served.perHead) blocks.push({ type: "note", text: served.perHead.basisLine });
      blocks.push({ type: "monthChart", chart: buildMonthChart(served) });
      blocks.push(buildCategoryBars(served));
      blocks.push({ type: "note", text: served.explainer });
      if (served.staleLine) blocks.push({ type: "note", text: served.staleLine });
      blocks.push({ type: "note", text: served.calibrationExplainer });
    } else {
      blocks.push({ type: "line", text: served.reason });
    }
  } else {
    blocks.push({ type: "line", text: crime.crime.reason });
  }

  // Benefits and charging zones no longer stand in this
  // section (print-check item 14): both are neighbourhood
  // facts, and they stand in Section 6, "The
  // neighbourhood", with the Census block. This section
  // is health, air, noise and crime only.

  return section(4, "Health, air & crime", blocks);
}

// ------------------------------------------------------------------
// Section 5 — What's nearby, its map, and the industrial
// sites block at its end
// ------------------------------------------------------------------

// The section's groupings are the sample's (BUG-064):
// Transport gathers the stations and the bus stops, Pets
// gathers the vets, the pet shops and the pet boarding,
// and Places of worship & libraries stands as one group.
// The sample's "Shops" group has no served category — its
// row in the sample is hand-written dummy colour, and no
// brain files a shops list — so no group stands for it;
// the categories themselves are unchanged, and the
// results page's own groupings are untouched.
const SECTION5_GROUPS: { heading: string; keys: NearbyCategory[] }[] = [
  { heading: "Supermarkets", keys: ["supermarket"] },
  { heading: "Parks", keys: ["parks"] },
  { heading: "Transport", keys: ["station", "bus-stop"] },
  { heading: "Food & drink", keys: ["food-and-drink"] },
  { heading: "Leisure", keys: ["leisure"] },
  { heading: "Places to visit", keys: ["places-to-visit"] },
  { heading: "Places of worship & libraries", keys: ["places-of-worship", "libraries"] },
  { heading: "Pets", keys: ["vets", "pet-shops", "pet-boarding"] },
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
    for (const key of group.keys) {
      const answer = category(nearby, key);
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
  const pins: ReportMapPin[] = points.map((pin, index) => {
    let x = round1(toX(pin.mx));
    let y = round1(toY(pin.my));
    // A pin whose centre lands within a pin-width of the
    // home marker is swallowed by it (BUG-060's
    // sub-defect: pin 1, the Co-op at 0.3 miles, vanished
    // under the home pin in the audited render). Nudge
    // such a pin radially outward to a full pin-width's
    // clearance, keeping its direction: the picture stays
    // honest about where the place lies, and every
    // numbered pin stays visible beside the home marker.
    const dx = x - width / 2;
    const dy = y - height / 2;
    const d = Math.hypot(dx, dy);
    if (d < 24) {
      const ux = d === 0 ? 1 : dx / d;
      const uy = d === 0 ? 0 : dy / d;
      x = round1(width / 2 + ux * 24);
      y = round1(height / 2 + uy * 24);
    }
    return {
      n: index + 1,
      name: pin.name,
      group: pin.group,
      miles: pin.miles,
      milesLabel: formatMiles(pin.miles),
      x,
      y,
    };
  });
  // The ground (item 19): the filed street lines for the
  // frame, projected into this map's mile space exactly as
  // the flood pictures project them — the home's own
  // street in the strong tint, the rest pale. The streets
  // ride with the flood bundle's maps sibling (the one
  // filed street set the check holds); where no flood
  // maps serve, or the frame holds no street lines, the
  // picture keeps its rings-only ground.
  const flood = floodServed(input);
  const streets: { d: string; home: boolean }[] = [];
  if (flood && flood.maps && flood.maps.streets.length > 0) {
    for (const street of flood.maps.streets) {
      const projected = street.points.map(([lon, lat]) => ({
        mx: (lon - home.longitude) * milesPerDegLon,
        my: -(lat - home.latitude) * milesPerDegLat,
      }));
      // A street wholly outside the drawn extent adds
      // nothing to the ground; keep the model lean.
      if (!projected.some((p) => Math.abs(p.mx) <= extent && Math.abs(p.my) <= extent)) continue;
      streets.push({
        d: projected.map((p) => `${round1(toX(p.mx))},${round1(toY(p.my))}`).join(" "),
        home: flood.maps.homeStreet !== null && street === flood.maps.homeStreet,
      });
    }
  }
  const onStreets = streets.length > 0;
  return {
    homeX: toX(0),
    homeY: toY(0),
    homeLabel: resolution.rung === 1 ? resolution.address.label : home.postcode,
    rings: [
      { r: scale, label: "1 mile" },
      { r: scale * 2, label: "2 miles" },
    ],
    ...(onStreets ? { streets } : {}),
    pins,
    caption: onStreets
      ? "The named places in this section, plotted over the street lines this check holds for the area — straight-line distances from the home, with rings at 1 and 2 miles. The picture is drawn from the filed street lines and the listed places; it is a diagram of the listed places, not a street map."
      : "The named places in this section, plotted from their filed positions — straight-line distances from the home, with rings at 1 and 2 miles. The picture is drawn from the data this check holds; it is a diagram of the listed places, not a street map.",
    ariaLabel: `Map of the ${pins.length} named places listed in this section, around ${resolution.rung === 1 ? resolution.address.label : home.postcode}, with rings at 1 and 2 miles`,
  };
}

// The straight-line distance between two filed points,
// in miles, on the report's own mile-space projection —
// used only to recognise a pair of bus stops as the two
// sides of one stopping place.
function milesBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const milesPerDegLat = 69.0;
  const milesPerDegLon = 69.0 * Math.cos((a.latitude * Math.PI) / 180);
  return Math.hypot(
    (b.longitude - a.longitude) * milesPerDegLon,
    (b.latitude - a.latitude) * milesPerDegLat,
  );
}

// The Transport group's rows (print-check items 12 and
// 13). Every entry carries its kind in words — "Rail
// station" or "Bus stop" — from the stop type the
// register files (the category the serve layer drew the
// place from). The register holds no indicator, bearing
// or direction for a bus stop, so a same-name pair cannot
// be told apart by direction; where two same-name stops
// stand within a few metres of each other — the pair on
// opposite sides of the road — they print as ONE entry
// saying both directions, at the nearer distance. The
// map's pins are untouched: both filed positions are
// real, and both stay plotted.
const BUS_STOP_PAIR_MILES = 0.05;

function transportRows(key: NearbyCategory, answer: CategoryAnswer): ReportRow[] {
  const kind = key === "station" ? "Rail station" : "Bus stop";
  const rows = placeRows(answer).map((row) => ({ ...row, tag: kind }));
  if (key !== "bus-stop") return rows;
  const merged: { row: ReportRow; place: NearbyPlace }[] = [];
  answer.places.forEach((place, index) => {
    const twin = merged.find(
      (entry) =>
        entry.place.name === place.name && milesBetween(entry.place, place) <= BUS_STOP_PAIR_MILES,
    );
    if (!twin) {
      merged.push({ row: rows[index], place });
      return;
    }
    // The pair stands as one entry: the nearer distance
    // (the bundle orders nearest first, so the standing
    // row already carries it), and a detail that says
    // both directions in plain words.
    const bothSides = "Stops on both sides of the road — one for each direction.";
    twin.row = {
      ...twin.row,
      detail: twin.row.detail ? `${twin.row.detail} ${bothSides}` : bothSides,
    };
  });
  return merged.map((entry) => entry.row);
}

function section5(input: ReportInput): ReportSectionView {
  const blocks: ReportBlock[] = [];
  const { nearby } = input;
  for (const group of SECTION5_GROUPS) {
    blocks.push({ type: "sub", text: group.heading });
    for (const key of group.keys) {
      const answer = category(nearby, key);
      if (!answer) continue;
      if (answer.places.length > 0) {
        blocks.push({
          type: "rows",
          rows: group.heading === "Transport" ? transportRows(key, answer) : placeRows(answer),
        });
      }
      const state = stateLine(answer);
      if (state) blocks.push(state);
    }
  }
  const map = buildSection5Map(input);
  if (map) blocks.push({ type: "map", map });

  // The regulated industrial sites block (scope (p)):
  // at the END of this section, only while the bundle
  // carries it (INDUSTRIAL_SITES_ENABLED) — flag off, the
  // key is absent and no placeholder stands in its place.
  if (nearby.kind === "distances" && nearby.industrialSites) {
    const sites = nearby.industrialSites;
    blocks.push({ type: "sub", text: "Industrial sites" });
    if (sites.state === "served") {
      blocks.push({
        type: "rows",
        rows: sites.sites.map((site) => ({
          name: site.operator,
          detail: [site.siteAddress, site.activityDescription].filter(Boolean).join(" · ") || null,
          tag: null,
          dist: `${formatMiles(site.miles)} mi`,
          distBand: distanceBand("everyday", site.miles),
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
// Section 7 — Home, costs & risks
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// The Census chart cards (M8.2) — the Master's grid: the
// Age tile first, then the five tables in the Master's
// order (Tenure, Accommodation type, Ethnic group,
// Religion, Bedroom occupancy). Bars carry the
// percentage alone; the counts live in the caption,
// composed from the served rows (D13). Rows sort by
// share descending — the Master's order — with served
// order kept on ties.
// ------------------------------------------------------------------

const CENSUS_GRID_ORDER = ["ts054", "ts044", "ts021", "ts030", "ts052"];

const CENSUS_COUNT_UNITS: Record<string, string> = {
  ts021: "residents",
  ts030: "residents",
  ts044: "households",
  ts052: "households",
};

function byShareDesc(rows: CensusRowServed[]): CensusRowServed[] {
  return [...rows].sort((a, b) => b.pct - a.pct);
}

function censusCountsCaption(table: CensusTableServed, rows: CensusRowServed[]): string {
  const unit = CENSUS_COUNT_UNITS[table.code] ?? "counted";
  let caption = `Counts, of ${count(table.total)} ${unit}: ${rows.map((row) => `${row.label} ${count(row.count)}`).join(" · ")}.`;
  if (table.code === "ts030") caption += " The religion question was voluntary in Census 2021.";
  if (table.code === "ts052")
    caption +=
      " Occupancy is the Census rating comparing bedrooms in the home with the bedrooms the ONS standard says the household needs.";
  return caption;
}

function censusBarsBlock(table: CensusTableServed): ReportBlock {
  const title = `${table.title} — Census 2021`;
  const bar = (row: CensusRowServed) => ({
    label: row.label,
    widthPct: row.pct,
    value: `${row.pct.toFixed(1)}%`,
  });
  if (table.code === "ts021" && table.groups) {
    // The five headline groups as bars; the detailed
    // categories compose into the caption under their
    // headline group (the loader files every category as
    // "{group}: {detail}", so the mapping is the label's
    // own prefix — never a load-time merge).
    const groups = byShareDesc(table.groups);
    const caption = `Counts, of ${count(table.total)} residents: ${groups
      .map((group) => {
        const details = byShareDesc(
          table.rows.filter((row) => row.label.startsWith(`${group.label}: `)),
        ).map((row) => `${row.label.slice(group.label.length + 2)} ${count(row.count)}`);
        return `${group.label} ${count(group.count)}${details.length > 0 ? ` (${details.join(", ")})` : ""}`;
      })
      .join(" · ")}.`;
    return barsBlock(title, groups.map(bar), caption);
  }
  if (table.code === "ts054") {
    // The Master's tenure form: the Owned total first,
    // its own split beside it, then the remaining
    // top-level tenures by share. The sub-parts of the
    // other totals (a part of Social rented, of Private
    // rented, of Shared ownership) are not charted — as
    // bars beside their own totals they would
    // double-count them; the bundle still serves them
    // at every depth that prints rows. The caption is
    // the Master's terse form: the table and its base.
    const owned = table.rows.find((row) => row.label === "Owned");
    let chartRows: CensusRowServed[];
    if (owned) {
      const splits = table.rows.filter((row) => row.label.startsWith("Owned: "));
      const others = byShareDesc(
        table.rows.filter((row) => row.label !== "Owned" && !row.label.includes(": ")),
      );
      chartRows = [owned, ...splits, ...others];
    } else {
      chartRows = byShareDesc(table.rows);
    }
    return barsBlock(
      title,
      chartRows.map(bar),
      `Tenure table (TS054): ${count(table.total)} households.`,
    );
  }
  const rows = byShareDesc(table.rows);
  return barsBlock(title, rows.map(bar), censusCountsCaption(table, rows));
}

// The Age card: the grid opens with the median-age
// tile, captioned with the product's honest basis —
// the median age is CALCULATED from the Census's
// single years of age (the brain's own served basis),
// never the sample's "published figure" wording. The
// age-bands table (TS007A) is not charted: the Master
// draws no age-bands bars (founder ruling, 20 Nov 2026).
function censusAgeCard(census: CensusSection): ReportBlock | null {
  if (!census.medianAge) return null;
  const value = census.medianAge.value;
  const subParts: string[] = [];
  if (census.msoaName) subParts.push(`MSOA ${census.msoaName}`);
  if (census.residentsTotal !== null)
    subParts.push(`${count(census.residentsTotal)} residents counted in this area's tables`);
  const baseParts: string[] = [];
  if (census.residentsTotal !== null) baseParts.push(`${count(census.residentsTotal)} residents`);
  if (census.householdsTotal !== null)
    baseParts.push(`${count(census.householdsTotal)} households`);
  return {
    type: "statTile",
    title: "Age — Census 2021",
    label: "Median age",
    value: `${value} years`,
    sub: subParts.length > 0 ? subParts.join(" · ") : null,
    caption: `Median age ${value} years, calculated from the Census's single years of age${census.msoaName ? ` for ${census.msoaName}` : ""}${baseParts.length > 0 ? ` (${baseParts.join(", ")})` : ""}.`,
  };
}

function section7(input: ReportInput): ReportSectionView {
  const blocks: ReportBlock[] = [];
  const sections = areaSections(input);
  const { nearby } = input;
  if (!sections) return section(7, "Home, costs & risks", blocks);

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
      // The distribution chart (M8.11(e)'s chart, moved
      // up into this step by the founder's ruling of
      // 20 Nov 2026 so every chart is built in one step):
      // one bar chart per assessment kind, band counts
      // as served in the brain's own A–G order, widths
      // relative to the row's largest band; each row's
      // served line becomes the chart's caption, so
      // every figure the prose carried survives the
      // swap. The checked home's own band is never
      // marked on or against the spread — the chart
      // model carries no home marker at all.
      blocks.push({ type: "sub", text: "Certificates at this postcode" });
      blocks.push({ type: "line", text: epc.spread.grainLine });
      for (const row of epc.spread.rows) {
        const largest = Math.max(0, ...row.bands.map((band) => band.count));
        blocks.push(
          barsBlock(
            row.kind === "predicted"
              ? "Band spread — predicted (SAP) certificates"
              : "Band spread — assessments of existing homes (RdSAP)",
            row.bands.map((band) => ({
              label: band.band ? `Band ${band.band}` : "No band recorded",
              widthPct: largest > 0 ? (band.count / largest) * 100 : 0,
              value: count(band.count),
            })),
            row.line,
          ),
        );
      }
      blocks.push({ type: "note", text: epc.spread.explainer });
    }
  }

  // Solar (print-check item 23c): the served line is one
  // dense paragraph of modelling facts; where the served
  // basis is complete, the block prints as separate short
  // lines instead — the generation figure, the sunshine
  // figure, the standard system's assumptions, and the
  // radiation source with its year span — each composed
  // from the served structured facts, never re-wording a
  // figure. Where the basis is incomplete (an older
  // filing), the served line and basis line stand as
  // before, in the section itself (founder requirement,
  // 15 Nov 2026).
  const solar = sections.solar;
  blocks.push({ type: "sub", text: "Solar potential" });
  const solarBasis = solar.state === "served" ? solar.basis : null;
  if (
    solarBasis &&
    typeof solarBasis.radiationDb === "string" &&
    solarBasis.radiationDb !== "" &&
    solar.yieldKwhPerKwp !== null &&
    solar.irradiationKwhM2 !== null
  ) {
    const assumptions: string[] = [
      `${solarBasis.peakPowerKwp} kWp of panels`,
      "unshaded",
      "south-facing",
      ...(solarBasis.slopeDeg !== null ? [`${solarBasis.slopeDeg}° slope`] : []),
      ...(solarBasis.systemLossPct !== null ? [`${solarBasis.systemLossPct}% system losses`] : []),
    ];
    blocks.push({
      type: "list",
      items: [
        `A standard 1 kWp system at this location is modelled to generate about ${solar.yieldKwhPerKwp} kWh in a year.`,
        `The sunshine figure behind it is ${solar.irradiationKwhM2} kWh per square metre in a year.`,
        `The standard system: ${assumptions.join(", ")}.`,
        `Radiation data: ${solarBasis.radiationDb}${solarBasis.yearMin !== null && solarBasis.yearMax !== null ? `, ${solarBasis.yearMin}–${solarBasis.yearMax}` : ""}.`,
      ],
    });
  } else {
    if (solar.line) blocks.push({ type: "line", text: solar.line });
    if (solar.basisLine) blocks.push({ type: "line", text: solar.basisLine });
  }

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
    if (service.line) {
      // Every line leads with the service it describes, in
      // plain words (item 16): the served lines all open
      // with the same "at least one mobile network…"
      // clause, so as printed they read as one repeated
      // fact. The lead names the service from the held
      // Ofcom data — the service key's plain-words form,
      // falling back to the publisher's own label for a
      // key this table does not know.
      const lead = MOBILE_SERVICE_LEADS[service.service] ?? service.label;
      blocks.push({ type: "line", text: `${lead} — ${sentence(service.line)}` });
    }
  }

  // Planning applications no longer stand in this section
  // (item 14): the hand-off is a neighbourhood fact and
  // stands in Section 6, with the Census block.

  // Planning constraints & land, exactly as served (full
  // per-site depth is M8.11(i)/(j)'s step). The five
  // layer lines print as one bullet list, not a stack of
  // paragraphs (item 23b).
  const constraints = sections.constraints;
  blocks.push({ type: "sub", text: "Planning constraints & land" });
  blocks.push({
    type: "list",
    items: [
      constraints.conservationArea,
      constraints.article4,
      constraints.greenBelt,
      constraints.builtUpArea,
      constraints.brownfield,
    ].map((layer) => sentenceLine(layer.line)),
  });

  // Listed buildings & heritage (item 23): the named
  // buildings keep their rows; every other line of the
  // block — the absence lines for the registers that hold
  // nothing here, the at-point line, the local-lists line
  // — prints as ONE bullet list in the same order, not a
  // stack of look-alike paragraphs. Where buildings are
  // named, the listed line still leads the rows as
  // before; where none are, it takes its place in the
  // list.
  const heritage = sections.heritage;
  blocks.push({ type: "sub", text: "Listed buildings & heritage" });
  if (heritage.listed.within.length > 0) {
    blocks.push({ type: "line", text: sentenceLine(heritage.listed.line) });
    blocks.push({
      type: "rows",
      rows: heritage.listed.within.map((place) => ({
        name: place.name ?? `Listed building, grade ${place.grade}`,
        detail: `Grade ${place.grade}`,
        tag: null,
        dist: `${formatMiles(place.miles)} mi`,
        distBand: distanceBand("everyday", place.miles),
        extra: [],
      })),
    });
  }
  const heritageLines: string[] = [];
  if (heritage.listed.within.length === 0) heritageLines.push(sentenceLine(heritage.listed.line));
  if (heritage.listed.beyondLine) heritageLines.push(sentenceLine(heritage.listed.beyondLine));
  if (heritage.atPoint.state === "recorded")
    heritageLines.push(sentenceLine(heritage.atPoint.line));
  if (heritage.atPoint.state === "needs-exact-home")
    heritageLines.push(sentenceLine(heritage.atPoint.reason));
  for (const layer of [
    heritage.monuments,
    heritage.worldHeritageSites,
    heritage.battlefields,
    heritage.protectedWrecks,
    heritage.worldHeritageBufferZones,
  ]) {
    heritageLines.push(sentenceLine(layer.line));
  }
  if (heritage.localListsLine) heritageLines.push(sentenceLine(heritage.localListsLine));
  if (heritageLines.length > 0) blocks.push({ type: "list", items: heritageLines });

  // Nature & protected areas (item 23): the same
  // treatment — the block's lines print as one bullet
  // list, in their served order.
  const nature = sections.nature;
  blocks.push({ type: "sub", text: "Nature & protected areas" });
  const natureLines: string[] = [];
  if (nature.coverageLine) natureLines.push(sentenceLine(nature.coverageLine));
  if (nature.placesLine) natureLines.push(sentenceLine(nature.placesLine));
  if (nature.designationsLine) natureLines.push(sentenceLine(nature.designationsLine));
  natureLines.push(sentenceLine(nature.ancientWoodland.line));
  if (nature.ancientWoodlandInventoryLine)
    natureLines.push(sentenceLine(nature.ancientWoodlandInventoryLine));
  natureLines.push(sentenceLine(nature.priorityHabitat.line));
  blocks.push({ type: "list", items: natureLines });

  // The area in numbers no longer stands in this section
  // (item 14): the Census and deprivation block is a
  // neighbourhood fact and opens Section 6, "The
  // neighbourhood" (see section6 below).
  return section(7, "Home, costs & risks", blocks);
}

// ------------------------------------------------------------------
// Section 6 — The neighbourhood
// ------------------------------------------------------------------

// The plain-words lead for each mobile service the Ofcom
// data holds (item 16), keyed by the brain's service key;
// a key this table does not know falls back to the
// publisher's own served label.
const MOBILE_SERVICE_LEADS: Record<string, string> = {
  voice: "Voice calls",
  "4g": "4G data",
  "5g_high_confidence": "5G data (high confidence)",
  "5g_very_high_confidence": "5G data (very high confidence)",
  "5g_sa_high_confidence": "5G standalone data (high confidence)",
  "5g_sa_very_high_confidence": "5G standalone data (very high confidence)",
};

function section6(input: ReportInput): ReportSectionView {
  const blocks: ReportBlock[] = [];
  const sections = areaSections(input);
  if (!sections) return section(6, "The neighbourhood", blocks);

  // The area in numbers — demographics, led by the IMD
  // decile-in-words line in its ruled sentence form (the
  // bundle's own served line; no score, no rank, scope
  // (g)), then the Census tables as published, with the
  // social-rented share also standing as its own explicit
  // line (scope (d)).
  const imd = sections.imd;
  const census = sections.census;
  blocks.push({ type: "sub", text: "The area in numbers — Census 2021" });
  // The sample's opening bullets (BUG-058): bold lead-ins
  // naming the deprivation position, the Census area and
  // its headline counts, and the area's classification.
  // The deprivation figure keeps the ruled words form —
  // the decile in words, never a bare figure or a rank
  // (carve-out X1/X5, D26 governs over the sample's
  // numeral here, as it governed at M8.1). The
  // classification bullet composes only what the served
  // directory carries (ward, council, region): no bundle
  // serves a rural/urban classification, a parish or a
  // constituency, so those elements of the sample's
  // bullet are not composed — inventing them is not an
  // option, and the gap is named in the batch report.
  const censusIntro: ReportRichLine[] = [];
  if (imd.state === "served" && imd.decile !== null && imd.lsoaName) {
    censusIntro.push([
      boldSeg("Deprivation:"),
      seg(
        ` this neighbourhood (LSOA ${imd.lsoaName}) is ${decileWords(imd.decile)} on the Indices of Deprivation 2025.`,
      ),
    ]);
  }
  if (census.state === "served" && census.msoaName) {
    const stats: string[] = [];
    if (census.residentsTotal !== null) stats.push(`${count(census.residentsTotal)} residents`);
    if (census.householdsTotal !== null) stats.push(`${count(census.householdsTotal)} households`);
    if (census.medianAge) stats.push(`median age ${census.medianAge.value}`);
    censusIntro.push([
      boldSeg("Census area:"),
      seg(` MSOA ${census.msoaName}${stats.length > 0 ? " — " : ""}`),
      ...(stats.length > 0 ? [boldSeg(stats.join(", "))] : []),
      seg(
        ". The tables below are the published Census 2021 figures for this area — counts and percentages exactly as the ONS published them.",
      ),
    ]);
  }
  const directory =
    input.resolution.rung === 1 || input.resolution.rung === 2 ? input.resolution.directory : null;
  if (directory && (directory.ward || directory.council)) {
    const parts = [
      directory.ward ? `Ward: ${displayText(directory.ward)}` : null,
      directory.council ? `Council: ${displayText(directory.council)}` : null,
      directory.region ? displayText(directory.region) : null,
    ].filter((part): part is string => part !== null);
    censusIntro.push([boldSeg("Classification:"), seg(` ${parts.join(" · ")}.`)]);
  }
  if (censusIntro.length > 0) blocks.push({ type: "richList", items: censusIntro });
  if (imd.state !== "served" && imd.line)
    blocks.push({ type: "line", text: sentenceLine(imd.line) });
  if (imd.state === "served" && imd.domains.length > 0) {
    // The domains' lead labels print bold, like every
    // other labelled bullet in the report (item 22).
    blocks.push({
      type: "richList",
      items: imd.domains.map((domain) => [
        boldSeg(`${domain.name}:`),
        seg(` ${decileWords(domain.decile)}.`),
      ]),
    });
  }
  if (census.state !== "served" && census.line)
    blocks.push({ type: "line", text: sentenceLine(census.line) });
  // The Census charts in the Master's grid (M8.2): the
  // median-age tile opens the grid, then the five table
  // cards in the Master's order; the section-level note
  // — the bundle's own census explainer, that the
  // figures describe the whole Census area — follows
  // the grid, as in the samples. The social-rented
  // share stands as its own line after the grid (scope
  // (d)); it stood after the tenure bars at M8.1, and
  // the grid keeps it beside the same card's section.
  const cards: ReportBlock[] = [];
  const ageCard = censusAgeCard(census);
  if (ageCard) cards.push(ageCard);
  const tablesByCode = new Map(census.tables.map((table) => [table.code, table]));
  for (const code of CENSUS_GRID_ORDER) {
    const table = tablesByCode.get(code);
    if (table) cards.push(censusBarsBlock(table));
  }
  for (const table of census.tables) {
    if (table.code !== "ts007a" && !CENSUS_GRID_ORDER.includes(table.code))
      cards.push(censusBarsBlock(table));
  }
  if (cards.length > 0) {
    blocks.push({ type: "chartGrid", cards });
    blocks.push({ type: "note", text: census.explainer });
  }
  if (census.socialRented) blocks.push({ type: "line", text: census.socialRented.line });

  // Benefits — the wider area. The D5 guardrails ride
  // with it: exactly as published with the source date,
  // a neutral label, no colour, score or verdict, and
  // never in the short version, the headlines or the
  // pills — plain lines here and nowhere else. (The block
  // stood at the end of Section 4 until the print-check
  // regrouping, item 14; its bases stay explained in the
  // report — no check page covers benefits, and item 20's
  // audit names that plainly rather than deferring to a
  // page that does not exist.)
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

  // The planning hand-off (D31): the council's register,
  // never a count and never a named list.
  const planning = sections.planningApplications;
  blocks.push({ type: "sub", text: "Planning applications" });
  blocks.push({ type: "line", text: sentenceLine(planning.line) });
  if (planning.link)
    blocks.push({
      type: "lineLink",
      text: "",
      label: planning.link.label,
      href: planning.link.url,
    });

  return section(6, "The neighbourhood", blocks);
}

// ------------------------------------------------------------------
// Section 8 — Flood risk
// ------------------------------------------------------------------

// The two flood-map models (M8.3), built from the served
// flood bundle's maps sibling. A picture is built only
// where its layer's entry is non-null — the bundle itself
// nulls an entry whose shapes are not filed for the frame
// or whose frame holds no street lines we hold (the
// founder's ruling), so the report never draws a picture
// the data cannot stand behind; the section's existing
// not-filed and absence lines carry those cases in words.
// Captions compose from the bundle's own served lines:
// the layer's point line always; on the zones picture,
// where the point falls inside a zone but the rivers &
// sea likelihood is the Very low defended story, the
// rivers & sea line follows with the defences point the
// served bridge line makes (its full text prints in the
// defences sub-block below); where the home is clear of
// the shaded areas, the caption says the areas are
// mapped and this home sits outside them — the claim the
// served point state actually makes. (The M8.3 build's
// caption named the street as sitting outside them; the
// independent audit's Divergence 3: the served fact is
// the home POINT's state, not the street's whole
// geometry. Reworded on the founder's ruling of
// 20 Nov 2026.)
export function buildFloodMapModels(served: Extract<FloodBundle, { kind: "flood" }>["flood"]): {
  zones: ReportFloodMapModel | null;
  surfaceWater: ReportFloodMapModel | null;
} {
  const maps: FloodMaps = served.maps;
  const layerOf = (type: string) => served.layers.find((layer) => layer.layer === type) ?? null;
  const displayLabels = new Map<string, string>();
  for (const layer of served.layers) {
    if (layer.covering) displayLabels.set(layer.covering.label, layer.covering.displayLabel);
    for (const edge of layer.proximity) displayLabels.set(edge.label, edge.displayLabel);
  }
  // As the module round1: a hair below zero must not
  // reach the model as -0 (see the note there).
  const round1 = (n: number) => {
    const rounded = Math.round(n * 10) / 10;
    return rounded === 0 ? 0 : rounded;
  };
  // The projection (the Section 5 pattern): mile space —
  // eastings scaled by the cosine of the frame centre's
  // latitude — at ONE scale for both axes, fitted to the
  // card's height (the frame spans two miles), so a mile
  // east covers exactly the pixels a mile north does and
  // the picture's distances are true in every direction.
  // The frame's content centres on the pin: its east and
  // west edges land at x = 100 and x = 660. (The M8.3
  // build projected longitude across the card's full 760
  // width against latitude's 560, stretching east–west
  // by about 1.36× — the independent audit's Divergence
  // 1, corrected on the founder's ruling of 20 Nov 2026.)
  const centreLon = (maps.frame.west + maps.frame.east) / 2;
  const centreLat = (maps.frame.south + maps.frame.north) / 2;
  const milesPerDegLat = 69.0;
  const milesPerDegLon = 69.0 * Math.cos((centreLat * Math.PI) / 180);
  const pxPerMile = 560 / 2;
  const project = (lon: number, lat: number) => ({
    x: round1(380 + (lon - centreLon) * milesPerDegLon * pxPerMile),
    y: round1(280 - (lat - centreLat) * milesPerDegLat * pxPerMile),
  });
  const pathOf = (points: { x: number; y: number }[]) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
  const streets = maps.streets.map((street) => {
    const points = street.points.map(([lon, lat]) => project(lon, lat));
    const homeStreet = maps.homeStreet;
    return {
      d: pathOf(points),
      points,
      home:
        homeStreet !== null &&
        street.name === homeStreet.name &&
        street.points.length === homeStreet.points.length &&
        street.points[0]?.[0] === homeStreet.points[0]?.[0] &&
        street.points[0]?.[1] === homeStreet.points[0]?.[1],
      name: street.name,
    };
  });
  const capitalise = (line: string) => line.charAt(0).toUpperCase() + line.slice(1);

  // The home street's label (the founder's ruling of
  // 20 Nov 2026, on the audit's Divergence 2): the sample
  // report's hand-made pictures name their streets; the
  // product names the HOME street only, along its own
  // line near the pin. The anchor sits on the line at an
  // arc distance from the point nearest the pin, on the
  // side where the street runs longer, so the centred
  // text clears the pin; it turns with the line's
  // direction there (never upside down) and lifts just
  // off the line — the sample label's placement.
  const homeStreetLabel = ((): ReportFloodMapModel["homeStreetLabel"] => {
    const homeLine = streets.find((s) => s.home);
    if (!homeLine || !homeLine.name || homeLine.points.length < 2) return null;
    const pts = homeLine.points;
    // Arc lengths along the drawn line.
    const cum = [0];
    for (let i = 1; i < pts.length; i++)
      cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const total = cum[cum.length - 1];
    if (total === 0) return null;
    // The point on the line nearest the pin, its arc
    // position, and the line's direction there.
    let best = { s: 0, x: pts[0].x, y: pts[0].y, ux: 1, uy: 0 };
    let bestD = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t =
        len2 === 0 ? 0 : Math.max(0, Math.min(1, ((380 - a.x) * dx + (280 - a.y) * dy) / len2));
      const x = a.x + t * dx;
      const y = a.y + t * dy;
      const d = Math.hypot(380 - x, 280 - y);
      if (d < bestD) {
        const len = Math.sqrt(len2);
        bestD = d;
        best = {
          s: cum[i] + t * len,
          x,
          y,
          ux: len === 0 ? 1 : dx / len,
          uy: len === 0 ? 0 : dy / len,
        };
      }
    }
    // The point and direction at an arc position.
    const at = (s: number) => {
      const target = Math.max(0, Math.min(total, s));
      let i = 0;
      while (i < pts.length - 2 && cum[i + 1] < target) i++;
      const segLen = cum[i + 1] - cum[i];
      const t = segLen === 0 ? 0 : (target - cum[i]) / segLen;
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      return {
        x: a.x + t * dx,
        y: a.y + t * dy,
        ux: len === 0 ? 1 : dx / len,
        uy: len === 0 ? 0 : dy / len,
      };
    };
    const forwardRoom = total - best.s;
    const backwardRoom = best.s;
    const forward = forwardRoom >= backwardRoom;
    const room = forward ? forwardRoom : backwardRoom;
    let anchor: { x: number; y: number; ux: number; uy: number };
    if (room >= 55) {
      anchor = at(best.s + (forward ? 1 : -1) * Math.min(110, room));
    } else {
      // A stub of a street near the pin on both sides:
      // the label sits just past its farther end, along
      // the line — still clear of the pin.
      const end = at(forward ? total : 0);
      const push = forward ? 45 : -45;
      anchor = { x: end.x + end.ux * push, y: end.y + end.uy * push, ux: end.ux, uy: end.uy };
    }
    let angle = (Math.atan2(anchor.uy, anchor.ux) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    // Lift the baseline just off the line, on the upper
    // side of the text's direction (the sample's labels
    // sit above their street).
    const rad = (angle * Math.PI) / 180;
    const liftX = Math.sin(rad) * 9;
    const liftY = -Math.cos(rad) * 9;
    return {
      text: homeLine.name,
      x: round1(Math.max(60, Math.min(700, anchor.x + liftX))),
      y: round1(Math.max(24, Math.min(536, anchor.y + liftY))),
      angle: round1(angle),
    };
  })();

  const build = (
    entry: { polygons: FloodMapPolygonSet[] } | null,
    fills: Record<string, string>,
    weakestFirst: string[],
    title: string,
    layer: ServedFloodLayer | null,
    clearAreasLine: string,
  ): ReportFloodMapModel | null => {
    if (!entry || !layer) return null;
    const rank = (label: string) => {
      const idx = weakestFirst.indexOf(label);
      return idx === -1 ? weakestFirst.length : idx;
    };
    const shades = [...entry.polygons]
      .sort((a, b) => rank(a.label) - rank(b.label))
      .map((set) => {
        const polygons = set.polygons.map((polygon) =>
          polygon.map((ring) => ring.map(([lon, lat]) => project(lon, lat))),
        );
        return {
          label: set.label,
          displayLabel: displayLabels.get(set.label) ?? set.label,
          fill: fills[set.label] ?? "#C3D8EA",
          d: polygons
            .map((polygon) => polygon.map((ring) => `${pathOf(ring)} Z`).join(" "))
            .join(" "),
          polygons,
        };
      });
    const legend = [...shades]
      .sort((a, b) => rank(b.label) - rank(a.label))
      .map((shade) => ({ label: shade.displayLabel, fill: shade.fill }));
    const inside = layer.pointState === "inside" && layer.covering !== null;
    let caption: string;
    if (inside) {
      caption = `${capitalise(layer.line)}.`;
      if (layer.layer === "flood_zone") {
        const rofrs = layerOf("rofrs");
        if (
          rofrs &&
          rofrs.pointState === "inside" &&
          rofrs.covering?.displayLabel === "Very low" &&
          served.defences.bridgeLine !== null
        ) {
          caption += ` ${capitalise(rofrs.line)} — that likelihood already counts the flood defences in place and their condition.`;
        }
      }
    } else {
      caption = `${clearAreasLine}, and this home sits outside them. ${capitalise(layer.line)}.`;
    }
    const shadeSummary = shades
      .map(
        (shade) =>
          `${shade.displayLabel} (${shade.polygons.length} ${shade.polygons.length === 1 ? "area" : "areas"})`,
      )
      .join(", ");
    const homeState = inside
      ? `sits inside ${layer.covering?.displayLabel ?? "a shaded area"}`
      : "sits outside every shaded area";
    return {
      title,
      width: 760,
      height: 560,
      homeX: 380,
      homeY: 280,
      streets,
      homeStreetLabel,
      shades,
      legend,
      caption,
      attribution: FLOOD_MAP_ATTRIBUTION,
      ariaLabel: `Flood map: ${title} around this postcode, drawn from the Environment Agency's filed shapes over OpenStreetMap street lines. ${maps.streets.length} street lines are drawn. Shaded: ${shadeSummary}. The home pin at the centre ${homeState}.${homeStreetLabel ? ` The home street, ${homeStreetLabel.text}, is labelled on the picture.` : ""}`,
    };
  };

  return {
    zones: build(
      maps.zones,
      FLOOD_ZONE_FILLS,
      ["FZ2", "FZ3"],
      "Flood zones for planning (rivers and the sea)",
      layerOf("flood_zone"),
      "The shaded areas in this picture are the mapped Flood Zone 2 and Flood Zone 3 areas around this postcode",
    ),
    surfaceWater: build(
      maps.surfaceWater,
      ROFSW_FILLS,
      ["Low", "Medium", "High"],
      "Flooding from surface water",
      layerOf("rofsw"),
      "The shaded areas in this picture are the mapped surface-water flood areas around this postcode",
    ),
  };
}

function warningBlocks(warnings: FloodLiveWarnings): ReportBlock[] {
  const blocks: ReportBlock[] = [];
  if (warnings.state === "warnings") {
    for (const warning of warnings.warnings) {
      blocks.push({ type: "sub", text: warning.line });
      // The warning's message is explanation-grade text:
      // it takes the note style, not body size (BUG-050(iii)).
      blocks.push({ type: "note", text: warning.message });
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

function section8(input: ReportInput): ReportSectionView {
  const blocks: ReportBlock[] = [];
  const served = floodServed(input);
  if (!served) {
    const line = floodStateLine(input);
    if (line) blocks.push({ type: "line", text: line });
    return section(8, "Flood risk", blocks);
  }
  // The live-warnings block opens the section (scope (e)).
  if (served.liveWarnings) blocks.push(...warningBlocks(served.liveWarnings));
  // The two flood-map pictures (M8.3): each rides directly
  // under its own layer's words — the zones picture under
  // the flood-zone layer, the surface-water picture under
  // the surface-water layer — and exists only where the
  // bundle filed that layer's shapes for the frame.
  const floodMaps = buildFloodMapModels(served);
  // The three filed layers, never merged (D25). The
  // per-band proximity bullets no longer print (item 17):
  // the section keeps the home's own position line, the
  // pictures and the short basis note; what the bands are
  // and how the nearest-band distances are read is
  // explained on the flood-risk How-we-check page, which
  // Section 10 links. (The short version's flood bullets
  // are a different surface and keep their served form.)
  for (const layer of served.layers) {
    blocks.push({ type: "sub", text: layer.title });
    blocks.push({ type: "line", text: layer.line });
    if (layer.beyondLine) blocks.push({ type: "line", text: layer.beyondLine });
    blocks.push({ type: "note", text: layer.basisLine });
    if (layer.layer === "flood_zone" && floodMaps.zones)
      blocks.push({ type: "floodMap", map: floodMaps.zones });
    if (layer.layer === "rofsw" && floodMaps.surfaceWater)
      blocks.push({ type: "floodMap", map: floodMaps.surfaceWater });
  }
  // The recorded defences sub-block (scope (k)), with the
  // print-check condensing (item 18): entries identical
  // in everything the report prints — name, type,
  // watercourse, maintainer, condition and standard of
  // protection — print as ONE entry at the nearest
  // distance, carrying the record count ("25 recorded
  // stretches"); a group whose printed facts genuinely
  // differ (a different condition, say) stays separate.
  // The served order is kept: a group stands where its
  // first entry stood.
  const defences = served.defences;
  blocks.push({ type: "sub", text: defences.title });
  if (defences.state === "served") {
    if (defences.caveat) blocks.push({ type: "line", text: defences.caveat });
    if (defences.bridgeLine) blocks.push({ type: "line", text: defences.bridgeLine });
    const defenceRowOf = (defence: ServedFloodDefence): ReportRow => ({
      name: defence.name ?? defence.type ?? "Recorded flood defence",
      detail:
        [defence.name ? defence.type : null, defence.watercourse, defence.maintainer]
          .filter((part): part is string => part !== null && part !== "")
          .join(" · ") || null,
      tag: null,
      dist: `${formatMiles(defence.miles)} mi`,
      distBand: distanceBand("everyday", defence.miles),
      extra: [
        defence.conditionLine,
        ...(defence.designSopLine ? [defence.designSopLine] : []),
        ...(defence.currentSopLine ? [defence.currentSopLine] : []),
      ],
    });
    const groups: { key: string; row: ReportRow; count: number }[] = [];
    for (const defence of defences.defences) {
      const row = defenceRowOf(defence);
      const key = JSON.stringify([row.name, row.detail, ...row.extra]);
      const existing = groups.find((group) => group.key === key);
      if (existing) existing.count += 1;
      else groups.push({ key, row, count: 1 });
    }
    blocks.push({
      type: "rows",
      rows: groups.map((group) =>
        group.count > 1
          ? {
              ...group.row,
              extra: [`${group.count} recorded stretches`, ...group.row.extra],
            }
          : group.row,
      ),
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
  return section(8, "Flood risk", blocks);
}

// ------------------------------------------------------------------
// Section 9 — Questions to ask the seller (M8.5)
// ------------------------------------------------------------------

// The question bank (founder-adopted prep, 20 Nov 2026):
// eleven hand-written blocks, each a fixed template whose
// only moving parts are named slots filled from figures
// the report already shows — never a new figure computed
// for the section, and a block whose slot figure is
// missing does not fire at all. Selection is a fixed rule
// set over the report's own facts and named states, in
// the priority order the blocks are evaluated below,
// capped at five. No AI generation anywhere.
//
// The guardrail (Business Case, absolute): seller
// questions are never drawn from the demographics or
// benefits figures — no block below reads the Census,
// IMD or benefits sections, and those facts trigger
// nothing. Data-coverage gaps (a layer not filed, a
// nation not covered) never become questions either: a
// gap becomes a question only where the seller holds the
// fact — the band, the lease, the floor area, the
// heating arrangement.
//
// The priority order is the samples' own: it reproduces
// both golden sets exactly (Exeter: flood, lease,
// heating, floor area, council tax; Birkdale: council
// tax, surface water, energy improvements, broadband,
// school places) and keeps the flood block Question 1
// whenever it fires — the standing cross-reference
// ("see Question 1") needs.

interface SellerQuestion {
  title: string;
  text: string;
}

const SELLER_QUESTION_CAP = 5;

const QUESTION_COUNT_WORDS = ["One", "Two", "Three", "Four", "Five"];

// The empty case: no sample carries it (every sample
// home raises five), so this line is new copy in the
// samples' voice, pinned here — a home whose results
// raised nothing still gets its section, with the honest
// line, rather than a silent blank.
export const SELLER_QUESTIONS_EMPTY_LINE =
  "Nothing in this home's results above raised a question that needs a seller's answer — every check was answered from the published sources.";

interface SellerContext {
  input: ReportInput;
  sections: AreaSections | null;
  homeCerts: ServedCertificate[];
  newestCert: ServedCertificate | null;
  flood: FloodServed | null;
}

function floodLayer(ctx: SellerContext, type: string): ServedFloodLayer | null {
  return ctx.flood?.layers.find((layer) => layer.layer === type) ?? null;
}

// (1) Flood risk and insurance — the planning map puts
// the home in Flood Zone 3 while the defended long-term
// check rates the risk Very low: the two tellings
// disagree, and only the seller can settle what the home
// has actually lived. The zone's display label is the
// slot; the "very low" is the trigger's own term.
function floodInsuranceQuestion(ctx: SellerContext): SellerQuestion | null {
  const zones = floodLayer(ctx, "flood_zone");
  const rivers = floodLayer(ctx, "rofrs");
  if (!zones || zones.pointState !== "inside" || zones.covering?.label !== "FZ3") return null;
  if (!rivers || rivers.pointState !== "inside" || rivers.covering?.displayLabel !== "Very low")
    return null;
  return {
    title: "Flood risk and insurance",
    text: `the planning map puts this postcode in ${zones.covering.displayLabel}, while the long-term check with the flood defences in place rates the risk very low — ask whether the home has ever flooded, whether buildings insurance has ever been refused, loaded or made subject to a flood excess, and what the current premium is.`,
  };
}

// (2) The lease — the home's latest recorded sale is
// leasehold. The figures that decide what the home costs
// to own are in no public source; the seller holds them.
function leaseQuestion(ctx: SellerContext): SellerQuestion | null {
  const { sold } = ctx.input;
  if (sold.kind !== "sold-prices" || "soldPrices" in sold || sold.rung !== 1) return null;
  if (sold.ownHistory[0]?.tenure !== "L") return null;
  return {
    title: "The lease",
    text: "this home is leasehold — ask how many years are left on the lease, what the ground rent is and how it reviews, and what the annual service charge is and what it covers. None of those figures are in the public sources checked for this report, and they decide what this home really costs to own.",
  };
}

// (3) Community heating — the home's newest certificate
// records a community scheme as its main heating (the
// register's own description, in the certificate's
// construction block). No slots: the sample's text is
// the whole block.
function communityHeatingQuestion(ctx: SellerContext): SellerQuestion | null {
  const heating = ctx.newestCert?.construction?.groups.find((group) => group.key === "mainHeating");
  if (!heating) return null;
  const described = heating.descriptions.join(" ").toLowerCase();
  if (!described.includes("community")) return null;
  return {
    title: "Community heating",
    text: "heating and hot water come from a community scheme — ask who runs it, what the unit rate and standing charge are, what the current household pays over a year, and whether any scheme repairs or price rises are planned.",
  };
}

// (4) Floor area — the home holds two or more
// certificates whose recorded floor areas disagree. The
// slots are the earliest and latest dated certificates'
// areas and years, both as filed; a certificate with no
// area or no date cannot stand in the sentence, so the
// block stays silent rather than guess.
function floorAreaQuestion(ctx: SellerContext): SellerQuestion | null {
  const dated = ctx.homeCerts
    .filter((cert) => cert.floorAreaSqM !== null && cert.registrationDate !== null)
    .sort((a, b) => (a.registrationDate ?? "").localeCompare(b.registrationDate ?? ""));
  if (dated.length < 2) return null;
  const first = dated[0];
  const last = dated[dated.length - 1];
  if (!first || !last || first.floorAreaSqM === last.floorAreaSqM) return null;
  return {
    title: "Floor area",
    text: `the two energy certificates disagree — ${first.floorAreaSqM} m² in ${(first.registrationDate ?? "").slice(0, 4)} and ${last.floorAreaSqM} m² in ${(last.registrationDate ?? "").slice(0, 4)} — ask the seller to confirm the home's actual internal area, and check the current certificate on GOV.UK.`,
  };
}

// (5) Council tax band — Section 7 serves the council's
// scale, and the home's own band is published in none of
// the sources checked: the reader is budgeting from the
// scale without the one figure that sets their bill.
// Fires only on the served state — a council whose
// charges are not filed yet is our gap, not a question,
// and the not-covered nations run different systems the
// sample's GOV.UK wording does not describe.
function councilTaxQuestion(ctx: SellerContext): SellerQuestion | null {
  if (!ctx.sections || ctx.sections.councilTax.state !== "served") return null;
  return {
    title: "Council tax band",
    text: "the band isn't published in the sources checked — ask the seller to confirm it, and check it against the GOV.UK council tax band service before you budget.",
  };
}

// (6) Planning applications — the planning section is a
// hand-off everywhere (D31), but where the hand-off
// serves a register link the reader can check
// applications themselves; the block fires only where
// the hand-off leaves them with no link at all
// (Scotland, Mid Ulster, an unknown nation), which is
// why no golden home triggers it. NO SAMPLE carries this
// block — the text is written in the samples' voice and
// pinned here for the founder's eye.
function planningQuestion(ctx: SellerContext): SellerQuestion | null {
  const planning = ctx.sections?.planningApplications;
  if (!planning || planning.state !== "handed-off" || planning.link !== null) return null;
  return {
    title: "Planning applications",
    text: "there is no register this report can link to for this area, and it holds no copy of any council's register — ask the seller whether any planning applications have been made for this home or the homes around it, and whether any work on the home was done with the planning consent it needed.",
  };
}

// (7) Estate charges and warranties — the home's newest
// certificate is the register's new-dwelling prediction:
// the register knows the home only as a new build, so
// its estate charges and builder's warranties are live
// questions. The slot is the prediction's year. (An
// assessed certificate — Birkdale's — means the home has
// been measured since it was built, and the block stays
// silent.)
function estateChargesQuestion(ctx: SellerContext): SellerQuestion | null {
  const cert = ctx.newestCert;
  if (!cert || !cert.predicted || !cert.registrationDate) return null;
  return {
    title: "Estate charges and warranties",
    text: `this is a ${cert.registrationDate.slice(0, 4)} new build on a modern estate — is there an annual estate or management charge, what does it cover, and are the builder's warranties still running with any snagging or defect claims still open?`,
  };
}

// (8) Surface water — the point itself is in no band,
// but a band is mapped near it: where the strongest
// nearby band is High or Medium, the sample's edge form
// (the band and its distance are the slots); where only
// the Low band — the extreme 1-in-1,000-year event — is
// mapped near, the sample's extreme-event form. A point
// inside a band is the flood conversation's graver case
// and no sample words it, so the block stays silent
// there rather than improvise.
function surfaceWaterQuestion(ctx: SellerContext): SellerQuestion | null {
  const layer = floodLayer(ctx, "rofsw");
  if (!layer || layer.pointState === "inside" || layer.pointState === "not-filed") return null;
  if (layer.proximity.length === 0) return null;
  const tail =
    "ask whether the street or the plot has ever flooded or held standing water in heavy rain, and whether drains or soakaways have ever been an issue.";
  const strongest = ["High", "Medium", "Low"]
    .map((label) => layer.proximity.find((edge) => edge.label === label))
    .find((edge) => edge !== undefined);
  if (!strongest) return null;
  if (strongest.label === "Low") {
    return {
      title: "Surface water",
      text: `the postcode is mapped only in the extreme 1-in-1,000-year surface-water event — ${tail}`,
    };
  }
  return {
    title: "Surface water",
    text: `the nearest ${strongest.label} surface-water band edge is ${formatMiles(strongest.miles)} miles from this home — ${tail}`,
  };
}

// (9) Energy improvements — the home's newest
// certificate publishes suggested steps. The saving slot
// is the steps' own typical savings added together (the
// sample's "about £34" is exactly that sum on Birkdale's
// certificate) — a step with no filed saving leaves a
// hole in the total, so the block stays silent. The lift
// slots are the certificate's band, rating and potential
// band, as filed.
function energyImprovementsQuestion(ctx: SellerContext): SellerQuestion | null {
  const cert = ctx.newestCert;
  const improvements = cert?.improvements;
  if (!cert || !improvements || improvements.state !== "served") return null;
  if (improvements.steps.length === 0) return null;
  if (improvements.steps.some((step) => step.typicalSavingPence === null)) return null;
  if (cert.band === null || cert.rating === null || cert.potentialBand === null) return null;
  const totalPence = improvements.steps.reduce(
    (sum, step) => sum + (step.typicalSavingPence ?? 0),
    0,
  );
  return {
    title: "Energy improvements",
    text: `the certificate's suggested steps would save about ${formatPounds(Math.round(totalPence / 100))} a year and lift the home from ${cert.band} (${cert.rating}) to ${cert.potentialBand} — ask which, if any, of those steps have already been done since the certificate was issued.`,
  };
}

// (10) Broadband at this house — Ofcom serves every
// premises in the postcode as gigabit-capable. The
// sample's hand-made lead claimed "full fibre"; the
// served data does not separate full fibre from other
// gigabit technologies (the broadband section's own
// explainer says so), so the template carries the served
// claim — gigabit-capable — and nothing stronger. The
// slot is the home's number, and only a plain house
// number carries the sample's "No." form.
function broadbandQuestion(ctx: SellerContext): SellerQuestion | null {
  const broadband = ctx.sections?.broadband;
  if (!broadband || broadband.state !== "served" || broadband.gigabitCapablePct !== 100)
    return null;
  const { resolution } = ctx.input;
  if (resolution.rung !== 1) return null;
  if (!resolution.address.paon) return null;
  const paon = resolution.address.paon.trim();
  if (!/^\d+[A-Za-z]?$/.test(paon)) return null;
  return {
    title: `Broadband at No. ${paon}`,
    text: "the postcode is gigabit-capable — ask which provider the current service uses and what speed is actually delivered at this house.",
  };
}

// (11) School places — a primary school stands within
// the check's radius. The distance slot is the nearest
// named primary's, as the report prints it; the council
// is named only as "the council" because the served
// directory names the district, and admissions belong to
// the county — a district name here would send the
// reader to the wrong desk. Where a selective secondary
// stands within the same radius, the sample's grammar
// tail follows, with the school's name as the slot.
function schoolPlacesQuestion(ctx: SellerContext): SellerQuestion | null {
  const primary = category(ctx.input.nearby, "schools-primary");
  if (!primary || primary.state !== "within" || primary.places.length === 0) return null;
  const nearest = primary.places[0];
  if (!nearest) return null;
  const secondary = category(ctx.input.nearby, "schools-secondary");
  const selective = secondary?.nearestSelective;
  const tail =
    selective && selective.miles <= 2 ? `, and note that ${selective.name} admits by test` : "";
  return {
    title: "School places",
    text: `living ${formatMiles(nearest.miles)} miles from the nearest primary school does not guarantee a place — check admissions and recent cut-off distances with the council and the schools directly${tail}.`,
  };
}

// The bank in priority order (see the header): the first
// five blocks that fire are the section's questions.
const SELLER_QUESTION_BANK: ((ctx: SellerContext) => SellerQuestion | null)[] = [
  floodInsuranceQuestion,
  leaseQuestion,
  communityHeatingQuestion,
  floorAreaQuestion,
  councilTaxQuestion,
  planningQuestion,
  estateChargesQuestion,
  surfaceWaterQuestion,
  energyImprovementsQuestion,
  broadbandQuestion,
  schoolPlacesQuestion,
];

function sellerQuestions(ctx: SellerContext): SellerQuestion[] {
  const fired: SellerQuestion[] = [];
  for (const block of SELLER_QUESTION_BANK) {
    const question = block(ctx);
    if (question) fired.push(question);
  }
  return fired.slice(0, SELLER_QUESTION_CAP);
}

function section9(input: ReportInput, homeCerts: ServedCertificate[]): ReportSectionView {
  const blocks: ReportBlock[] = [];
  // The questions belong to a home, not a postcode: a
  // whole-postcode report has no single seller to ask,
  // and the section stands empty there, as it did before
  // this step.
  if (input.resolution.rung === 1) {
    const ctx: SellerContext = {
      input,
      sections: areaSections(input),
      homeCerts,
      newestCert: newestCertificate(homeCerts),
      flood: floodServed(input),
    };
    const questions = sellerQuestions(ctx);
    if (questions.length > 0) {
      const word = QUESTION_COUNT_WORDS[questions.length - 1] ?? String(questions.length);
      blocks.push({
        type: "intro",
        text: `${word} question${questions.length === 1 ? "" : "s"} drawn from this home's own results above — the ${questions.length === 1 ? "point" : "points"} a viewing or a direct question can settle.`,
      });
      blocks.push({ type: "questions", items: questions });
    } else {
      blocks.push({ type: "line", text: SELLER_QUESTIONS_EMPTY_LINE });
    }
  }
  return section(9, "Questions to ask the seller", blocks);
}

// ------------------------------------------------------------------
// Section 10 — Sources, notes & disclaimers
// ------------------------------------------------------------------

function section10(input: ReportInput, cert: ServedCertificate | null): ReportSectionView {
  const blocks: ReportBlock[] = [];
  const sections = areaSections(input);
  const served = floodServed(input);
  const prepared = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(input.now);

  // Sources & dates, in the sample's form (BUG-051):
  // bold-named bullets stating what was checked and
  // linking the official record where one exists — not a
  // bare list of source lines. Each bullet composes from
  // the served bundle it names; a topic whose data did
  // not serve draws no bullet. Sections the sample does
  // not name still carry their source: the catch-all at
  // the end files each remaining section's served source
  // line under its topic name, so no checked source goes
  // unnamed in the closing section.
  blocks.push({ type: "sub", text: `Sources & dates — everything checked on ${prepared}` });
  const sources: ReportRichLine[] = [];
  // The sources the composed bullets below account for,
  // by line and by section key — the catch-all at the end
  // files only what is left, so no topic appears twice.
  const consumed = new Set<string>();
  const consumedKeys = new Set<keyof AreaSections>();
  const sourceItem = (name: string, body: ReportRichSegment[]) =>
    sources.push([boldSeg(name), seg(" — "), ...body]);
  const strippedSource = (line: string) => sentenceLine(line.replace(/^Source:\s*/, ""));

  if (cert && cert.certificateNumber) {
    sourceItem("Energy certificate", [
      seg(
        `GOV.UK Find an Energy Certificate, certificate ${cert.certificateNumber} for this address${cert.registrationDate ? `, registered ${formatFiledDate(cert.registrationDate)}` : ""}: `,
      ),
      {
        text: "view certificate",
        href: `https://find-energy-certificate.service.gov.uk/energy-certificate/${cert.certificateNumber}`,
      },
      seg("."),
    ]);
  } else if (sections && sections.epc.sourceLine) {
    sourceItem("Energy certificates", [seg(strippedSource(sections.epc.sourceLine))]);
  }
  if (cert || (sections && sections.epc.sourceLine)) consumedKeys.add("epc");

  if (input.sold.kind === "sold-prices" && !("soldPrices" in input.sold)) {
    const soldBundle = input.sold;
    const median = soldBundle.median;
    if (median.state === "served" && median.value !== null) {
      const own =
        soldBundle.rung === 1 && soldBundle.ownHistory.length > 0
          ? `, including this home (${formatPounds(soldBundle.ownHistory[0].price)}, ${formatShortFiledDate(soldBundle.ownHistory[0].date)})`
          : "";
      sourceItem("Sold prices", [
        seg(
          `HM Land Registry Price Paid data for postcode ${soldBundle.postcode}: the median (${formatPounds(median.value)}) in Section 2 is the postcode category A median, calculated from the ${count(median.counted)} counted sales${
            median.spanFrom && median.spanTo
              ? ` spanning ${formatShortFiledDate(median.spanFrom)} to ${formatShortFiledDate(median.spanTo)}`
              : ""
          }${own}. Land Registry data typically lags by around two months.`,
        ),
      ]);
    } else {
      sourceItem("Sold prices", [seg(strippedSource(soldBundle.sourceLine))]);
    }
  }

  if (input.crime.kind === "crime" && input.crime.crime.state === "served") {
    const crimeServed = input.crime.crime;
    sourceItem("Crime", [
      seg(
        `Police.uk street-level data, ${monthLabel(crimeServed.windowFrom)} to ${monthLabel(crimeServed.windowTo)}, within 1 mile of this postcode: ${count(crimeServed.total)} incidents. Monthly counts: ${crimeServed.months.map((m) => `${monthName(m.month).slice(0, 3)} ${count(m.count)}`).join(", ")}.`,
      ),
      ...(crimeServed.perHead && crimeServed.englandFigure
        ? [
            seg(
              ` The per-1,000-residents figures (${per1000Text(crimeServed.perHead.per1000)} here; ${per1000Text(crimeServed.englandFigure.englandPer1000)} across England) are built from Census populations.`,
            ),
          ]
        : []),
    ]);
  }

  if (input.nearby.kind === "distances") {
    sourceItem("Schools", [
      seg(
        "Department for Education school data and Ofsted reports, as filed for the schools named in Section 3.",
      ),
    ]);
  }

  if (served) {
    sourceItem("Flood check", [
      seg(
        "findings in Section 8 are from checking Environment Agency flood data. This report does not include Environment Agency flood maps. Check flood risk, including the actual flood maps, at the ",
      ),
      {
        text: "GOV.UK long-term flood risk service",
        href: "https://check-long-term-flood-risk.service.gov.uk/postcode",
      },
      seg("."),
    ]);
  }

  if (sections && sections.councilTax.state === "served") {
    const tax = sections.councilTax;
    const bandD = tax.bands.find((band) => band.band === "D");
    sourceItem("Council tax", [
      seg(
        `${tax.authority ? `${tax.authority} ` : ""}council tax${tax.taxYear ? `, ${tax.taxYear}` : ""}. The A–H table in Section 7 is derived from the Band D figure by the statutory ratios and is labelled as derived wherever it appears.${bandD ? ` Band D is ${bandD.labelPence} a year (${bandD.monthlyLabelPence} a month).` : ""}`,
      ),
    ]);
    consumedKeys.add("councilTax");
  }

  if (sections && sections.census.state === "served") {
    const census = sections.census;
    const tableLinks: ReportRichSegment[] = [];
    for (const code of CENSUS_GRID_ORDER) {
      const table = census.tables.find((t) => t.code === code);
      if (!table) continue;
      if (tableLinks.length > 0) tableLinks.push(seg(", "));
      const unit = CENSUS_COUNT_UNITS[code] ?? (code === "ts054" ? "households" : "counted");
      tableLinks.push({
        text: `${code.toUpperCase()} ${table.title} (${count(table.total)} ${unit})`,
        href: `https://www.nomisweb.co.uk/datasets/c2021${code}`,
      });
    }
    sourceItem("Area & Census 2021", [
      seg(
        `ONS Census 2021 (Census Day 21 March 2021) for MSOA ${census.msoaName}, via Nomis${tableLinks.length > 0 ? ": " : "."}`,
      ),
      ...tableLinks,
      ...(tableLinks.length > 0
        ? [seg(". Percentages in Section 6 are calculated from those published counts.")]
        : []),
    ]);
    consumedKeys.add("census");
  }

  const chargers = category(input.nearby, "ev-chargers");
  if (chargers && chargers.places.length > 0) {
    sourceItem("EV chargers", [
      seg(
        "Open Charge Map and operator listings for the chargers named in Section 7; distances are straight-line from this postcode, calculated from each charger's published location.",
      ),
    ]);
  }

  if (sections) {
    const parts: string[] = [];
    if (sections.air.state === "served" && sections.air.year !== null) {
      parts.push(
        `Defra modelled background air quality, ${sections.air.year} (Section 4), with UK legal limits and WHO 2021 guidelines as yardsticks`,
      );
      consumedKeys.add("air");
    }
    if (sections.noise.line) {
      parts.push("modelled noise bands (Section 4)");
      consumedKeys.add("noise");
    }
    if (sections.broadband.state === "served") {
      parts.push("Ofcom Connected Nations (Section 7)");
      consumedKeys.add("broadband");
    }
    if (sections.benefits.line) {
      parts.push(
        "claimant count and Universal Credit figures via Stat-Xplore and Nomis (Section 6)",
      );
      consumedKeys.add("benefits");
    }
    if (parts.length > 0)
      sourceItem("Air, noise, broadband & benefits", [seg(`${parts.join("; ")}`)]);
  }

  // The catch-all: every remaining served source line,
  // under its topic name.
  if (input.sold.kind === "sold-prices" && !("soldPrices" in input.sold))
    consumed.add(input.sold.sourceLine);
  if (input.crime.kind === "crime" && input.crime.crime.state === "served")
    consumed.add(input.crime.crime.sourceLine ?? "");
  if (served) for (const layer of served.layers) consumed.add(layer.sourceLine ?? "");
  const topicNames: Partial<Record<keyof AreaSections, string>> = {
    epc: "Energy certificates",
    councilTax: "Council tax",
    census: "Area & Census 2021",
    air: "Air quality",
    noise: "Noise",
    benefits: "Benefits",
    broadband: "Broadband",
    solar: "Solar potential",
    mobile: "Mobile coverage",
    planningApplications: "Planning",
    constraints: "Planning constraints & land",
    heritage: "Listed buildings & heritage",
    nature: "Nature & protected areas",
    chargingZones: "Charging zones",
    imd: "Deprivation",
    buildingSafety: "Building safety",
  };
  if (sections) {
    for (const key of Object.keys(sections) as (keyof AreaSections)[]) {
      const value = sections[key] as { sourceLine?: string | null } | undefined;
      if (!value || typeof value !== "object" || !value.sourceLine) continue;
      if (consumedKeys.has(key)) continue;
      if (consumed.has(value.sourceLine)) continue;
      consumed.add(value.sourceLine);
      sourceItem(topicNames[key] ?? "Source", [seg(strippedSource(value.sourceLine))]);
    }
  }
  if (served && served.defences.sourceLine && !consumed.has(served.defences.sourceLine)) {
    sourceItem("Flood defences", [seg(strippedSource(served.defences.sourceLine))]);
  }
  if (sources.length > 0) blocks.push({ type: "richList", items: sources });

  // How to read this report: the sample's bold lead-ins,
  // the standing explanations in their composed form.
  blocks.push({ type: "sub", text: "How to read this report" });
  const howToRead: ReportRichLine[] = [];
  if (input.nearby.kind === "distances") {
    howToRead.push([
      boldSeg("Distances"),
      seg(
        ` are ${input.nearby.basisLabel.replace(" distance ", " distances ")}, shown to one decimal place, unless a line says otherwise (for example, a road distance or a walking time). Straight-line distance is always shorter than the route you would actually travel.`,
      ),
    ]);
  }
  howToRead.push([
    boldSeg("Sold prices nearby"),
    seg(
      " summarise recorded sales. They are not a valuation of this home and make no claim about what it is worth. A median is only shown where there are enough counted sales to draw on.",
    ),
  ]);
  howToRead.push([
    boldSeg("Modelled figures"),
    seg(
      " — air quality, noise and solar potential are modelled estimates for the area, clearly labelled as modelled wherever they appear. They are not measurements taken at this address.",
    ),
  ]);
  if (sections && sections.census.state === "served") {
    howToRead.push([
      boldSeg("Census 2021 charts (Section 6):"),
      seg(
        ` the tables describe the whole Census area${sections.census.msoaName ? ` — MSOA ${sections.census.msoaName}` : ""} — not this street or this house. They are the counts and percentages the ONS published from Census Day, 21 March 2021, shown as facts only: no score, rating or verdict is added. Totals differ very slightly between Census tables because the ONS applies small disclosure-control adjustments to each table.`,
      ),
    ]);
  }
  howToRead.push([
    boldSeg("Flood:"),
    seg(
      " flood zones, surface-water maps and defences are three separate pictures and are never merged into a single answer. Flood boundaries follow the lie of the land and can change within a single street — always confirm the position for the building itself on the GOV.UK long-term flood risk service before you commit. Live flood warnings are fetched at the moment a check is run and are never stored.",
    ),
  ]);
  howToRead.push([
    boldSeg("Planning:"),
    seg(
      " there is no national dataset of planning applications, so this report hands you to the council's own planning register rather than listing applications.",
    ),
  ]);
  blocks.push({ type: "richList", items: howToRead });

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

  // Disclaimers, in the sample's form (BUG-051): bold
  // lead-ins, the sample's six bullets — School places
  // (carrying the catchment block's first sentence
  // verbatim — "We hold no catchment boundaries, so we
  // cannot say whether this home is in or out for any
  // school" — folded in from Section 3 by BUG-050(ii);
  // the block's remaining sentence duplicates the
  // bullet's own check-the-council wording, and its link
  // stands below the list), Health services, Pets, Crime,
  // Why the period ends, and the standing D9 general
  // wording, verbatim under its lead.
  blocks.push({ type: "sub", text: "Disclaimers" });
  const disclaimers: ReportRichLine[] = [
    [
      boldSeg("School places:"),
      seg(
        " this report cannot tell you whether this home would get a school place. No national catchment map exists, living near a school does not guarantee a place, and cut-off distances change every year. Check the council and school admissions pages. We hold no catchment boundaries, so we cannot say whether this home is in or out for any school.",
      ),
    ],
  ];
  // The served schoolDeadlines line, verbatim (scope (j)).
  if (input.nearby.kind === "distances" && input.nearby.schoolDeadlines) {
    disclaimers.push([seg(input.nearby.schoolDeadlines.line)]);
  }
  disclaimers.push(
    [
      boldSeg("Health services:"),
      seg(
        " GP lists and NHS dentist places open and close. This report shows distance only — check whether a practice is accepting new patients, and phone to confirm, before you move. Where a Care Quality Commission rating is published for a service, it is shown as the CQC published it; dentists are not CQC-rated, so no rating is shown for them.",
      ),
    ],
    [
      boldSeg("Pets:"),
      seg(
        " vet, pet-shop and pet-boarding locations come from OpenStreetMap and the filed data, and may be incomplete. Use the RCVS “Find a Vet” register to confirm the full local list.",
      ),
    ],
    [
      boldSeg("Crime:"),
      seg(
        " Police.uk anonymises each incident to a nearby street, so the counts in Section 4 cover the streets within 1 mile of this postcode, not this house. The figures are counts only — this report offers no view on whether an area is “safe” or “unsafe”, and draws no trend from the monthly counts.",
      ),
    ],
  );
  if (input.crime.kind === "crime" && input.crime.crime.state === "served") {
    const windowEnd = monthLabel(input.crime.crime.windowTo);
    disclaimers.push([
      boldSeg(`Why the period ends in ${windowEnd}:`),
      seg(
        ` Police.uk publishes street-level crime in arrears, about six weeks behind. When this report was prepared on ${prepared}, ${windowEnd} was the latest month published — later figures do not exist yet in the source, so the last 12 complete published months are used.`,
      ),
    ]);
  }
  disclaimers.push([boldSeg("General:"), seg(` ${REPORT_DISCLAIMER_D9}`)]);
  blocks.push({ type: "richList", items: disclaimers });
  // The catchment block's link, beside the disclaimer it
  // belongs to (moved with the block, BUG-050(ii)).
  blocks.push({
    type: "lineLink",
    text: "",
    label: CATCHMENT_LINK.label,
    href: CATCHMENT_LINK.url,
  });
  return { number: 10, title: "Sources, notes & disclaimers", blocks };
}

// ------------------------------------------------------------------
// The builder — the one snapshot source (see the header)
// ------------------------------------------------------------------

// The standalone-line capitalisation pass (print-check
// items 9, 15 and 15b; BUG-065 generalised from its named
// instances to a rule of the whole report): EVERY line
// that stands alone in the report — a section line, a
// bullet, a note, a caption, a sub-heading — begins with
// a capital letter. The brains compose many of their
// lines as lowercase fragments for their labelled
// contexts elsewhere; most section builders already
// sentence-case the lines they lift, but not all, and a
// missed one is exactly the inconsistency the founder's
// print check kept finding. So the rule is enforced
// here, once, over the finished view: only a line's
// first letter can change; its words never do.
//
// What is NOT a standalone line, and is left untouched:
// a row's detail and extra lines (fragments that belong
// to their row), a tile's value and sub (display
// fragments under a label), a seller question's text
// (the continuation of its title, in the samples' own
// form), table cells and bar labels (data, not lines),
// and link labels. A test pins the rule over a rendered
// report (item 15b).
function capitaliseBlock(block: ReportBlock): void {
  switch (block.type) {
    case "intro":
    case "line":
    case "boldLine":
    case "note":
    case "sub":
      block.text = sentence(block.text);
      break;
    case "list":
      block.items = block.items.map((item) => sentence(item));
      break;
    case "richList":
      block.items = block.items.map((line) =>
        line.length > 0 ? [{ ...line[0], text: sentence(line[0].text) }, ...line.slice(1)] : line,
      );
      break;
    case "table":
      if (block.caption) block.caption = sentence(block.caption);
      break;
    case "bars":
    case "statTile":
      block.caption = sentence(block.caption);
      break;
    case "chartGrid":
      for (const card of block.cards) capitaliseBlock(card);
      break;
    case "dotPlot":
      block.plot.caption = sentence(block.plot.caption);
      break;
    case "monthChart":
      block.chart.caption = sentence(block.chart.caption);
      break;
    case "map":
      block.map.caption = sentence(block.map.caption);
      break;
    case "floodMap":
      block.map.caption = sentence(block.map.caption);
      break;
    default:
      break;
  }
}

function capitaliseStandaloneLines(view: ReportView): void {
  if (view.shortVersion) {
    for (const group of view.shortVersion.groups) {
      group.lines = group.lines.map((line) =>
        line.length > 0 ? [{ ...line[0], text: sentence(line[0].text) }, ...line.slice(1)] : line,
      );
    }
  }
  for (const viewSection of view.sections) {
    for (const block of viewSection.blocks) capitaliseBlock(block);
  }
}

export function buildReportView(input: ReportInput): ReportView {
  const sections = areaSections(input);
  const cert = sections ? matchedCertificate(input.resolution, sections.epc.certificates) : null;
  const homeCerts = sections
    ? matchedCertificates(input.resolution, sections.epc.certificates)
    : [];
  const view: ReportView = {
    masthead: buildMasthead(input, cert),
    shortVersion: buildShortVersion(input, cert),
    sections: [
      section1(input, cert),
      section2(input),
      section3(input),
      section4(input),
      section5(input),
      section6(input),
      section7(input),
      section8(input),
      section9(input, homeCerts),
      section10(input, cert),
    ],
  };
  capitaliseStandaloneLines(view);
  return view;
}
