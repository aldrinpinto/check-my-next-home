import type { AddressQueryable, AddressResolution } from "./address";
import { DISTANCE_BASIS_LABEL, RADIUS_MILES } from "./nearby";

// Flood (plan step M6.5, decision D25).
//
// The brain's flood answer: for a resolved postcode, what the
// three Environment Agency products filed at M5.1 into
// flood_layers say about the POSTCODE POINT — whether the point
// falls inside each published layer, which zone or band applies
// there, and how far the nearest mapped edge of each other zone
// or band is. The three layers are served as three separate
// answers and are NEVER merged (the filing rule, gap L1, is the
// serving rule): the planning zones are drawn as if flood
// defences did not exist, the rivers & sea bands take defences
// and their condition into account, and surface water is a
// different water source entirely. At the Exeter golden home
// the zones say Flood Zone 3 and the rivers & sea bands say
// Very low at the same point, and both are right — any single
// combined line would have to pick a winner and mislead.
//
// Point honesty caps every claim: what we hold is the postcode
// directory point, never the building, so every statement is
// about the point on the published map ("the postcode point
// falls inside Flood Zone 3 on the Environment Agency's
// planning map") — never "this home is in a flood zone", never
// "this home is at risk". The source itself sets the same
// ceiling: the zones "are not suitable for showing whether an
// individual property is at risk of flooding", and the national
// products "do not show risk at a property level" (the EA's
// words, recorded in the M5.1 loaders).
//
// The ruled shape (D25):
//   - Rung 1 and rung 2 serve the IDENTICAL answer, computed
//     from and worded as the postcode point; rung 3 serves the
//     named state "flood answers need an exact postcode" with
//     no flood payload; rung 4 nothing.
//   - Coverage is England only: the three products are
//     Environment Agency products. The nation is read from the
//     resolution's own filed fact — the first letter of the
//     directory's lsoa_code (E01… England, W01… Wales, S01…
//     Scotland, N… Northern Ireland) — never from outward
//     postcode letters, which straddle the Welsh border (SY,
//     CH). Welsh, Scottish and Northern Ireland postcodes serve
//     the named not-covered state, never any layer's absence:
//     in those nations an empty lookup means no coverage, not
//     a finding about water.
//   - The three absences are three distinct named facts, never
//     one shared line and never "no flood risk": zones — the
//     point is not in Flood Zone 2 or 3 (Zone 1 is named only
//     as the EA's name for that remainder); rivers & sea — no
//     likelihood band is published for this point; surface
//     water — no band reaches this point, below the lowest
//     band the product publishes.
//   - Proximity is part of every layer's answer, never a bare
//     band: outside a layer's polygons, the nearest mapped edge
//     per zone or band within 2 miles, and the "none within
//     2 miles — nearest is…" form beyond it; for the band
//     products, the nearest edge of each OTHER band within
//     2 miles even when a band covers the point. At surface-
//     water scale the near miss is the fact — Exeter's point
//     is in no surface-water polygon with Low mapped about
//     9 metres away.
//   - Distances are PostGIS geography distances from the filed
//     shapes (the serving basis, D25/Q6); the loaders' planar
//     pins (degrees of latitude x 69.05) are filing artefacts,
//     and divergences from them are named in the golden matrix.
//   - Each zone and band travels with the EA's own published
//     definition in annual-chance terms (verified against the
//     EA's Flood Zones product description and the Planning
//     Practice Guidance flood zone table for the zones, and
//     the EA's published likelihood categories for the bands).
//   - No computed defended / not-defended label: the zones
//     answer and the rivers & sea answer sit side by side with
//     their basis lines, and where they disagree the pair is
//     the fact. No per-point defence fact is filed anywhere.
//   - Each layer carries its own source line with its own
//     edition date as filed — the three editions revise
//     independently. There is no brain-side stale line in V1:
//     the monthly canary watches republication and the loaders
//     re-file quarterly.
//   - The answer never advises on insurance and never claims
//     anything about insurability or lending; the limits are
//     stated in FLOOD_HOW_WE_CHECK below.
//
// Live warnings (M6.22, decision D42) ride on top of the filed
// answer without touching it: the Environment Agency's live
// warnings for the areas around the point are fetched at
// serve time — one fetch per check, through the cached
// builder's serve-time hook (the mechanism crime's stale line
// uses) — and are NEVER stored, cached or memoised, so a
// cached bundle picks up a newly raised warning on its next
// read and drops a lapsed one the same way. Only severity
// levels 1–3 serve (level 4, "Warning no longer in force",
// never does). Severity labels, area descriptions and
// message text are the EA's verbatim words under its
// required attribution; the block always sits beside the
// link to the official Check for flooding service, because
// the EA offers no service guarantee and states its API is
// not a safety channel — we are never the warning channel.
// Both empty states are named, never silent: a successful
// fetch with nothing in force serves its timestamped line,
// and a failed fetch serves its own line, because silence
// could read as "no warning" when the check never ran. A
// warning is a fact about the EA's named area, never about
// this point or this home — the served wording attributes
// it to the area, exactly as the filed lines attribute
// their facts to the postcode point.

export const FLOOD_UNAVAILABLE_REASON = "flood answers need an exact postcode";

// The limits, stated plainly (D25's insurance boundary; the
// closing sentence is D27's unknown-source statement). This
// copy is served with the flood answer wherever the answer is
// presented in full.
export const FLOOD_HOW_WE_CHECK =
  "These answers describe the postcode point on the Environment Agency's published maps, not the property: a postcode covers more ground than one home, and the point can fall in a different mapped area from the building itself. We hold no record of past flooding at any home — holding no record does not mean a home has never flooded. Insurers and lenders run their own models on the building itself; nothing here says whether a home can be insured or borrowed against, and these answers are not a substitute for an insurer's or lender's own check. A small number of the Environment Agency's flood-zone shapes do not state whether the flooding is from rivers, the sea or another source.";

// ------------------------------------------------------------------
// Live flood warnings (M6.22, decision D42)
// ------------------------------------------------------------------

// The EA's required attribution sentence, verbatim (the API
// reference's terms: "please acknowledge this with the
// following attribution statement"). It rides every warning
// block, in every state — the check itself is EA data.
export const FLOOD_WARNING_ATTRIBUTION =
  "this uses Environment Agency flood and river level data from the real-time data API (Beta)";

// The official service every block links: the EA states its
// API does not replace the channels by which it notifies the
// public, so the design answers structurally — the link is
// part of the block, not a footnote.
export const FLOOD_WARNING_LINK = {
  label: "the official Check for flooding service",
  url: "https://www.gov.uk/check-flooding",
} as const;

// The geo-filter reach: the API's `dist` is in KILOMETRES,
// measured to the flood area (the reference documentation's
// parameter table: "warnings applying to flood areas which
// are within r km of the given latitude/longitude… may be
// approximated by a bounding box"; pinned live at build —
// a point inside the River Leadon area matched at dist 0,
// and a point ~14.9 km east of the area's envelope matched
// only from dist 16, never at 14). 3.22 km is the product's
// one proximity radius — 2 miles (D22) — in the API's unit.
export const FLOOD_WARNING_DIST_KM = 3.22;

// D42's budget: one attempt, 2 seconds. Any failure —
// timeout, non-200, unparseable body — degrades to the
// filed answer plus the named failure line; the check never
// blocks and never fails because of the warnings feed.
export const FLOOD_WARNING_TIMEOUT_MS = 2000;

// At most this many warnings serve in the block; any beyond
// it are counted and named in the overflow line, never
// silently dropped.
export const FLOOD_WARNING_MAX_SHOWN = 5;

// The failed-fetch line (D42, verbatim).
export const FLOOD_WARNINGS_UNAVAILABLE_LINE = "Live flood warnings could not be checked just now";

// One warning as the EA publishes it — the parsed item the
// warning source returns. Every text field is the EA's
// verbatim words; nothing here is our prose.
export interface FloodWarningItem {
  // The EA's severity label ("Severe flood warning",
  // "Flood warning", "Flood alert", "Warning no longer in
  // force"), verbatim.
  severity: string;
  // The EA's severity level, 1 (most severe) to 4.
  severityLevel: number;
  // The EA's name for the warned area ("River Leadon
  // catchment"), verbatim.
  description: string;
  // The warned area's river or sea name, as published;
  // null where the area carries none.
  riverOrSea: string | null;
  // The EA's full current-situation message, verbatim.
  message: string;
  // The EA's raised timestamp, verbatim — a NAIVE
  // Europe/London local time with no offset
  // ("2026-11-15T16:35:59"). It is parsed as London local
  // components, never through a UTC conversion.
  timeRaised: string;
}

// The brain's read port over the EA's live feed — the same
// pattern as the sibling brains: tests drive a fake;
// createFloodWarningSource below is the only live
// implementation.
export interface FloodWarningSource {
  warningsNear(latitude: number, longitude: number): Promise<FloodWarningItem[]>;
}

// One warning as served: the EA's words, plus two composed
// lines of our own (the headline line and the raised line),
// both banned-wording-checked like all our prose. The
// verbatim fields are publisher text, marked as such by
// their names — wording scans quote them, never judge them
// as our claims.
export interface ServedFloodWarning {
  severityLevel: number;
  severity: string;
  areaDescription: string;
  riverOrSea: string | null;
  // The EA's message IN FULL (report depth). The short
  // bundle's headline form drops this field by construction.
  message: string;
  timeRaised: string;
  // "raised at 16:35 on 15 November 2026" — composed from
  // the EA's naive London timestamp's own components.
  raisedLine: string;
  // The never-truncated headline line: the EA's severity
  // label and area description, verbatim, joined.
  line: string;
}

// The live-warnings block, composed at serve time and
// attached to the served bundle only — it exists in no
// stored form (the cache stores this field as null).
export interface FloodLiveWarnings {
  // warnings: at least one live warning serves.
  // none: the fetch succeeded and nothing is in force.
  // unavailable: the fetch failed; the filed answer stands.
  state: "warnings" | "none" | "unavailable";
  // When the check ran, Europe/London ("16:35 on
  // 15 November 2026") — a report read later can never
  // mistake the block for a live one.
  checkedAt: string;
  // The named line for the none and unavailable states
  // (D42: both are named, never silent); null when warnings
  // serve — the warnings speak.
  line: string | null;
  // Most severe first (severity level ascending, then
  // earliest raised), capped at FLOOD_WARNING_MAX_SHOWN.
  warnings: ServedFloodWarning[];
  // How many live warnings sit beyond the cap, when any.
  overflowCount: number | null;
  overflowLine: string | null;
  attributionLine: string;
  link: { label: string; url: string };
}

export interface FloodBundleOptions {
  // The live-warnings source. Absent, the bundle serves
  // the filed answer alone (liveWarnings null): the plain
  // builder's form, and the cache's stored form.
  warningSource?: FloodWarningSource;
  // The serve instant the block's checked-at stamp and the
  // composition are made at. Injectable for tests.
  now?: Date;
}

const LONDON_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  day: "numeric",
  month: "long",
  year: "numeric",
});

// "16:35 on 15 November 2026" — the instant rendered in
// Europe/London, the product's one timezone for live facts.
function londonStamp(instant: Date): string {
  const parts = new Map(
    LONDON_FORMAT.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return `${parts.get("hour")}:${parts.get("minute")} on ${parts.get("day")} ${parts.get("month")} ${parts.get("year")}`;
}

// The EA's timestamps are naive Europe/London local time:
// their components ARE the London wall-clock reading, so the
// raised line is composed from the components directly. A
// Date parse would read them as UTC (or the host's zone)
// and shift the hour — the exact misread the M6.22 build
// proof pins against.
function raisedLineFor(timeRaised: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(timeRaised);
  if (!match) throw new Error(`unparseable flood warning timestamp: ${timeRaised}`);
  const [, , month, day, hour, minute] = match;
  return `raised at ${hour}:${minute} on ${Number(day)} ${MONTH_NAMES[Number(month) - 1]} ${match[1]}`;
}

function toServedWarning(item: FloodWarningItem): ServedFloodWarning {
  return {
    severityLevel: item.severityLevel,
    severity: item.severity,
    areaDescription: item.description,
    riverOrSea: item.riverOrSea,
    message: item.message,
    timeRaised: item.timeRaised,
    raisedLine: raisedLineFor(item.timeRaised),
    line: `${item.severity} — ${item.description}`,
  };
}

// Compose the block for one check. Never throws: any
// failure of the source — timeout, HTTP error, unparseable
// body — is the unavailable state, by design (D42).
export async function composeFloodLiveWarnings(
  source: FloodWarningSource,
  latitude: number,
  longitude: number,
  now: Date,
): Promise<FloodLiveWarnings> {
  const checkedAt = londonStamp(now);
  const base = {
    checkedAt,
    attributionLine: FLOOD_WARNING_ATTRIBUTION,
    link: { label: FLOOD_WARNING_LINK.label, url: FLOOD_WARNING_LINK.url },
  };
  let items: FloodWarningItem[];
  try {
    items = await source.warningsNear(latitude, longitude);
  } catch {
    return {
      ...base,
      state: "unavailable",
      line: FLOOD_WARNINGS_UNAVAILABLE_LINE,
      warnings: [],
      overflowCount: null,
      overflowLine: null,
    };
  }
  // Severity levels 1–3 only: level 4 ("Warning no longer
  // in force") never serves, however it arrived.
  const live = items
    .filter((item) => item.severityLevel >= 1 && item.severityLevel <= 3)
    .sort((a, b) => a.severityLevel - b.severityLevel || a.timeRaised.localeCompare(b.timeRaised));
  if (live.length === 0) {
    return {
      ...base,
      state: "none",
      line: `No flood warning in force for this area — checked at ${checkedAt}`,
      warnings: [],
      overflowCount: null,
      overflowLine: null,
    };
  }
  const shown = live.slice(0, FLOOD_WARNING_MAX_SHOWN);
  const overflow = live.length - shown.length;
  return {
    ...base,
    state: "warnings",
    line: null,
    warnings: shown.map(toServedWarning),
    overflowCount: overflow > 0 ? overflow : null,
    overflowLine:
      overflow > 0
        ? `${overflow} more flood ${overflow === 1 ? "warning is" : "warnings are"} in force for areas near this postcode — see the official Check for flooding service for the full list`
        : null,
  };
}

// Parse one /id/floods response body into warning items.
// Throws on any shape failure — the caller (the source)
// lets it propagate, and the composition degrades the whole
// fetch to the unavailable state rather than serving a
// half-read warning.
export function parseFloodWarningItems(body: unknown): FloodWarningItem[] {
  if (typeof body !== "object" || body === null)
    throw new Error("flood warnings response is not an object");
  const items = (body as { items?: unknown }).items;
  if (!Array.isArray(items)) throw new Error("flood warnings response has no items list");
  return items.map((raw, index) => {
    if (typeof raw !== "object" || raw === null)
      throw new Error(`flood warning ${index} is not an object`);
    const item = raw as Record<string, unknown>;
    const floodArea =
      typeof item.floodArea === "object" && item.floodArea !== null
        ? (item.floodArea as Record<string, unknown>)
        : {};
    const severity = item.severity;
    const severityLevel = item.severityLevel;
    const description = item.description;
    const message = item.message;
    const timeRaised = item.timeRaised;
    if (
      typeof severity !== "string" ||
      typeof severityLevel !== "number" ||
      typeof description !== "string" ||
      typeof message !== "string" ||
      typeof timeRaised !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(timeRaised)
    )
      throw new Error(`flood warning ${index} is missing a required field`);
    return {
      severity,
      severityLevel,
      description,
      riverOrSea: typeof floodArea.riverOrSea === "string" ? floodArea.riverOrSea : null,
      message,
      timeRaised,
    };
  });
}

const FLOOD_WARNINGS_URL = "https://environment.data.gov.uk/flood-monitoring/id/floods";

// The live warning source: one GET of the EA's geo-filtered
// floods list per call, one attempt, the D42 timeout. The
// request asks for min-severity=3 (the EA's documented
// common pattern) AND the composition filters levels 1–3
// again — the filter is ours, not delegated.
export function createFloodWarningSource(
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): FloodWarningSource {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? FLOOD_WARNING_TIMEOUT_MS;
  return {
    async warningsNear(latitude, longitude) {
      const url = `${FLOOD_WARNINGS_URL}?lat=${latitude}&long=${longitude}&dist=${FLOOD_WARNING_DIST_KM}&min-severity=3`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        if (!response.ok) throw new Error(`flood warnings request failed: HTTP ${response.status}`);
        return parseFloodWarningItems(await response.json());
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

// ------------------------------------------------------------------
// The publisher's definitions, as published (D25/Q7 — verified
// against the EA's own product pages at build: the Flood Zones
// product description and Planning Practice Guidance Table 1
// for the zones; the EA's published likelihood categories for
// the bands). Each label the answer serves carries its
// definition beside it.
// ------------------------------------------------------------------

export const FLOOD_ZONE_DEFINITIONS: Record<string, string> = {
  FZ3: "land having a 1 in 100 or greater annual probability of river flooding, or a 1 in 200 or greater annual probability of sea flooding",
  FZ2: "land having between a 1 in 100 and a 1 in 1,000 annual probability of river flooding, or between a 1 in 200 and a 1 in 1,000 annual probability of sea flooding",
};

// Zone 1 is not a filed label — it is the EA's name for all land
// outside Zones 2 and 3, reached by absence only.
export const FLOOD_ZONE_1_DEFINITION =
  "land having a less than 1 in 1,000 annual probability of river or sea flooding";

export const FLOOD_BAND_DEFINITIONS: Record<string, string> = {
  High: "a 1 in 30 or greater chance of flooding in any given year",
  Medium: "a chance of flooding in any given year between 1 in 100 and 1 in 30",
  Low: "a chance of flooding in any given year between 1 in 1,000 and 1 in 100",
  "Very low": "a chance of flooding in any given year of less than 1 in 1,000",
};

const ZONE_DISPLAY_LABELS: Record<string, string> = {
  FZ2: "Flood Zone 2",
  FZ3: "Flood Zone 3",
};

// ------------------------------------------------------------------
// Filed-data shapes
// ------------------------------------------------------------------

export type FloodLayerType = "flood_zone" | "rofrs" | "rofsw";

// The facts the brain reads for one layer at one point, all
// measured on the serving basis (PostGIS geography miles from
// the filed shapes). `covering` holds the filed shapes that
// cover the point (the filed products are dissolved per label
// and the labels are mutually exclusive, so at most one label
// appears); `nearestWithin` holds the nearest mapped edge per
// label among shapes inside the serving radius; `nearestBeyond`
// is the single nearest edge of any label in the layer, read
// only when nothing files within the radius. `filedCount` is
// the layer's filed shape count — absence is only ever computed
// against a proven filing (the loaders' L6 rule), so a layer
// with no filing serves its not-filed state, never an absence.
export interface FloodLayerFacts {
  filedCount: number;
  covering: { riskLabel: string; detail: string | null }[];
  nearestWithin: { riskLabel: string; detail: string | null; miles: number }[];
  nearestBeyond: { riskLabel: string; detail: string | null; miles: number } | null;
  sourceName: string | null;
  sourceDate: string | null;
}

// The brain's read port over the filed shapes — the same
// pattern as the sibling brains: tests drive a fake;
// createFloodSource below is the only database implementation.
export interface FloodDataSource {
  layerFacts(layer: FloodLayerType, latitude: number, longitude: number): Promise<FloodLayerFacts>;
}

// ------------------------------------------------------------------
// Served shapes
// ------------------------------------------------------------------

export interface ServedFloodLabel {
  // The filed label, verbatim ("FZ3", "Very low"); the Zone 1
  // remainder carries the synthetic label "FZ1" and is only
  // ever served as the named remainder, never as a finding
  // about a filed shape.
  label: string;
  displayLabel: string;
  definition: string;
  // The filed detail of the shape this entry describes: for a
  // zone, its flood source and origin as published ("river and
  // sea · modelled"); for the band products, the depth basis
  // (">0 m"). Null on the Zone 1 remainder, which has no shape.
  detail: string | null;
}

export type FloodPointState =
  "inside" | "zone-1" | "no-band-published" | "below-lowest-band" | "not-filed";

export interface ServedFloodLayer {
  layer: FloodLayerType;
  title: string;
  // The layer's own one-line basis: what this product is and
  // the convention it is drawn under. The three are never
  // shared or combined.
  basisLine: string;
  explainer: string;
  pointState: FloodPointState;
  // The primary sentence — always about the postcode point on
  // the published map, or the layer's named absence.
  line: string;
  // The label whose shape covers the point, when one does.
  covering: ServedFloodLabel | null;
  // Zones only, when the point is outside Zones 2 and 3: Zone 1
  // named as the EA's name for that remainder.
  remainder: ServedFloodLabel | null;
  // The nearest mapped edge per other label within the serving
  // radius, nearest first — part of every answer, so a band is
  // never served bare.
  proximity: (ServedFloodLabel & { miles: number })[];
  // When nothing in the layer maps within the radius and the
  // point is outside the layer: the single nearest mapped edge
  // beyond it, with its composed line (the M6.2 form).
  beyondNearest: { displayLabel: string; miles: number } | null;
  beyondLine: string | null;
  sourceName: string | null;
  // The layer's own edition date as filed ("2026-10-21").
  sourceDate: string | null;
  sourceLine: string | null;
}

export type FloodBundle =
  | {
      rung: 1 | 2;
      kind: "flood";
      postcode: string;
      flood: {
        state: "served";
        // The live-warnings block (M6.22, D42), composed at
        // serve time and served FIRST, ahead of the filed
        // layers. Null in exactly two forms: the plain
        // builder called without a warning source, and the
        // bundle cache's STORED form — a served bundle from
        // the wired path always carries the composed block.
        liveWarnings: FloodLiveWarnings | null;
        layers: ServedFloodLayer[];
        howWeCheck: string;
      };
    }
  | {
      rung: 1 | 2;
      kind: "not-covered";
      postcode: string;
      flood: { state: "not-covered"; reason: string };
    }
  | {
      rung: 3;
      kind: "wider-area";
      flood: { state: "unavailable"; reason: string };
    }
  | {
      rung: 4;
      kind: "no-location";
      flood: { state: "unavailable"; reason: string };
    };

// ------------------------------------------------------------------
// Layer specs — titles, basis lines and explainers per product.
// ------------------------------------------------------------------

interface LayerSpec {
  type: FloodLayerType;
  title: string;
  basisLine: string;
  explainer: string;
  // The absence point-state and its sentence stem, per layer —
  // the three absences are distinct by construction (D25).
  absenceState: FloodPointState;
}

const LAYER_SPECS: LayerSpec[] = [
  {
    type: "flood_zone",
    title: "Flood zones for planning",
    basisLine:
      "The Environment Agency's planning map for flooding from rivers and the sea — drawn as if flood defences were not there.",
    explainer:
      "Planning zones are the categories planning decisions use. They are drawn without the benefit of flood defences, so land behind defences can still fall inside Flood Zone 3.",
    absenceState: "zone-1",
  },
  {
    type: "rofrs",
    title: "Flooding from rivers and the sea",
    basisLine:
      "The Environment Agency's likelihood map for flooding from rivers and the sea — it takes flood defences and their condition into account.",
    explainer:
      "This is the likelihood the Environment Agency publishes for ground at the postcode point, counting the flood defences in place and their condition.",
    absenceState: "no-band-published",
  },
  {
    type: "rofsw",
    title: "Flooding from surface water",
    basisLine:
      "The Environment Agency's likelihood map for surface water — rainwater that does not drain away or soak in, but lies on or flows over the ground.",
    explainer:
      "Surface water flooding can happen streets away from any river. At this scale a few metres can change the mapped band, so the nearest mapped bands are always shown beside the point's own answer.",
    absenceState: "below-lowest-band",
  },
];

// ------------------------------------------------------------------
// Coverage — the EA products cover England only. The detector
// is the resolution's own filed fact: the first letter of the
// directory's area code (lsoa_code — E… England, W… Wales,
// S… Scotland data zones, N… Northern Ireland super output
// areas). Only the letter is read. Outward postcode letters
// are never used: SY and CH straddle
// the Welsh border, so they cannot separate England from
// Wales. A postcode whose filed code does not place it in
// England is not covered — the failure direction is always
// away from serving an absence as a finding.
// ------------------------------------------------------------------

type Nation = "england" | "wales" | "scotland" | "northern-ireland" | "unknown";

function nationOf(lsoaCode: string | null): Nation {
  switch ((lsoaCode ?? "").charAt(0)) {
    case "E":
      return "england";
    case "W":
      return "wales";
    case "S":
      return "scotland";
    case "N":
      return "northern-ireland";
    default:
      return "unknown";
  }
}

function notCoveredReason(nation: Nation): string {
  switch (nation) {
    case "wales":
      return "flood answers are not covered for Wales — the Environment Agency's flood maps cover England only, and flood maps for Wales are published by Natural Resources Wales";
    case "scotland":
      return "flood answers are not covered for Scotland — the Environment Agency's flood maps cover England only, and flood maps for Scotland are published by the Scottish Environment Protection Agency";
    case "northern-ireland":
      return "flood answers are not covered for Northern Ireland — the Environment Agency's flood maps cover England only";
    default:
      return "the Environment Agency's flood maps cover England only, and this postcode's filed area code does not place it in England";
  }
}

// ------------------------------------------------------------------
// Composition helpers
// ------------------------------------------------------------------

const MONTH_NAMES = [
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

// "2026-10-21" -> "21 October 2026" (the D9 source line's date).
function dateLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

function round3(miles: number): number {
  return Math.round(miles * 1000) / 1000;
}

function labelFor(
  layer: FloodLayerType,
  riskLabel: string,
  detail: string | null,
): ServedFloodLabel {
  if (layer === "flood_zone") {
    return {
      label: riskLabel,
      displayLabel: ZONE_DISPLAY_LABELS[riskLabel] ?? riskLabel,
      definition: FLOOD_ZONE_DEFINITIONS[riskLabel] ?? "",
      detail,
    };
  }
  return {
    label: riskLabel,
    displayLabel: riskLabel,
    definition: FLOOD_BAND_DEFINITIONS[riskLabel] ?? "",
    detail,
  };
}

// The primary sentence per layer and point state — always the
// postcode point on the published map, never the home.
function pointLine(spec: LayerSpec, covering: ServedFloodLabel | null): string {
  if (covering) {
    switch (spec.type) {
      case "flood_zone":
        return `the postcode point falls inside ${covering.displayLabel} on the Environment Agency's planning map`;
      case "rofrs":
        return `the postcode point falls in the ${covering.displayLabel} band on the Environment Agency's map of flooding from rivers and the sea`;
      case "rofsw":
        return `the postcode point falls in the ${covering.displayLabel} band on the Environment Agency's surface water map`;
    }
  }
  switch (spec.type) {
    case "flood_zone":
      return "the postcode point is not in Flood Zone 2 or Flood Zone 3 on the Environment Agency's planning map";
    case "rofrs":
      return "no likelihood band is published for this point on the Environment Agency's map of flooding from rivers and the sea";
    case "rofsw":
      return "no surface-water band reaches this point — below the lowest band this product publishes";
  }
}

function buildLayer(spec: LayerSpec, facts: FloodLayerFacts): ServedFloodLayer {
  const sourceLine =
    facts.sourceName && facts.sourceDate
      ? `${facts.sourceName} — data to ${dateLabel(facts.sourceDate)}`
      : null;
  const base: ServedFloodLayer = {
    layer: spec.type,
    title: spec.title,
    basisLine: spec.basisLine,
    explainer: spec.explainer,
    pointState: "not-filed",
    line: "",
    covering: null,
    remainder: null,
    proximity: [],
    beyondNearest: null,
    beyondLine: null,
    sourceName: facts.sourceName,
    sourceDate: facts.sourceDate,
    sourceLine,
  };

  // No filing, no answer: an empty layer can prove nothing, so
  // its absence wordings are never served from it.
  if (facts.filedCount <= 0) {
    return {
      ...base,
      line: "this flood map is not filed yet, so no answer can be given from it",
    };
  }

  const coveringRow = facts.covering[0] ?? null;
  const covering = coveringRow
    ? labelFor(spec.type, coveringRow.riskLabel, coveringRow.detail)
    : null;

  const proximity = facts.nearestWithin
    .filter((row) => !covering || row.riskLabel !== covering.label)
    .filter((row) => row.miles <= RADIUS_MILES)
    .map((row) => ({ ...labelFor(spec.type, row.riskLabel, row.detail), miles: round3(row.miles) }))
    .sort((a, b) => a.miles - b.miles || a.displayLabel.localeCompare(b.displayLabel));

  const layer: ServedFloodLayer = {
    ...base,
    pointState: covering ? "inside" : spec.absenceState,
    line: pointLine(spec, covering),
    covering,
    proximity,
  };

  if (!covering && spec.type === "flood_zone") {
    // Zone 1 is named only as the EA's name for the remainder —
    // it is not a filed shape and carries no detail.
    layer.remainder = {
      label: "FZ1",
      displayLabel: "Flood Zone 1",
      definition: FLOOD_ZONE_1_DEFINITION,
      detail: null,
    };
  }

  if (!covering && proximity.length === 0 && facts.nearestBeyond) {
    const beyond = facts.nearestBeyond;
    const displayLabel = labelFor(spec.type, beyond.riskLabel, beyond.detail).displayLabel;
    const miles = round3(beyond.miles);
    layer.beyondNearest = { displayLabel, miles };
    layer.beyondLine = `none within ${RADIUS_MILES} miles — the nearest mapped edge is ${displayLabel}, ${miles} miles away (${DISTANCE_BASIS_LABEL})`;
  }

  return layer;
}

// ------------------------------------------------------------------
// The bundle
// ------------------------------------------------------------------

export async function buildFloodBundle(
  resolution: AddressResolution,
  source: FloodDataSource,
  options: FloodBundleOptions = {},
): Promise<FloodBundle> {
  if (resolution.rung === 3)
    return {
      rung: 3,
      kind: "wider-area",
      flood: { state: "unavailable", reason: FLOOD_UNAVAILABLE_REASON },
    };
  if (resolution.rung === 4)
    return {
      rung: 4,
      kind: "no-location",
      flood: { state: "unavailable", reason: FLOOD_UNAVAILABLE_REASON },
    };

  const postcode = resolution.directory.postcode;
  const nation = nationOf(resolution.directory.lsoaCode);
  if (nation !== "england") {
    return {
      rung: resolution.rung,
      kind: "not-covered",
      postcode,
      flood: { state: "not-covered", reason: notCoveredReason(nation) },
    };
  }

  const { latitude, longitude } = resolution.directory;
  const layers: ServedFloodLayer[] = [];
  for (const spec of LAYER_SPECS) {
    layers.push(buildLayer(spec, await source.layerFacts(spec.type, latitude, longitude)));
  }
  // The live warnings compose only here — a served England
  // answer at rungs 1–2, where a point exists to check
  // against. The not-covered nations and the named rung
  // states never trigger a fetch (composition is England's,
  // and rung 3 stays figure-free by construction).
  const liveWarnings = options.warningSource
    ? await composeFloodLiveWarnings(
        options.warningSource,
        latitude,
        longitude,
        options.now ?? new Date(),
      )
    : null;
  return {
    rung: resolution.rung,
    kind: "flood",
    postcode,
    flood: { state: "served", liveWarnings, layers, howWeCheck: FLOOD_HOW_WE_CHECK },
  };
}

// ------------------------------------------------------------------
// The database source
// ------------------------------------------------------------------

const METRES_PER_MILE = 1609.344;

// The degree radius that makes a geometry-space ST_DWithin a
// guaranteed superset of the geography circle it prefilters: a
// shape within R metres differs in longitude by at most
// R / (111320 * cos(latitude)) degrees and in latitude by less,
// so the Euclidean degree distance is under sqrt(2) times that;
// 1.5 covers it with margin. The exact cut is always the
// geography distance the same query computes — the prefilter
// only bounds the work, and every query stays on
// flood_layers_geom_idx rather than sorting a layer.
function degreeRadius(metres: number, latitude: number): number {
  const cosLat = Math.max(Math.cos((latitude * Math.PI) / 180), 0.2);
  return (metres * 1.5) / (111_320 * cosLat);
}

// Beyond-radius steps, in miles: flood shapes follow every
// river valley, so an English point is rarely far from one —
// the steps stay small and each is index-bounded. A layer with
// nothing inside the widest step serves no beyond entry (the
// absence line stands on its own).
const BEYOND_STEPS_MILES = [5, 10, 20, 40];

interface NearestRow {
  riskLabel: string;
  detail: string | null;
  miles: number;
}

export function createFloodSource(db: AddressQueryable): FloodDataSource {
  const point = "ST_SetSRID(ST_MakePoint($2, $3), 4326)";

  async function nearestRows(
    layer: FloodLayerType,
    latitude: number,
    longitude: number,
    radiusMiles: number,
  ): Promise<NearestRow[]> {
    const metres = radiusMiles * METRES_PER_MILE;
    const { rows } = await db.query(
      `SELECT DISTINCT ON (risk_label) risk_label, detail,
              ST_Distance(geom::geography, ${point}::geography) / ${METRES_PER_MILE} AS miles
       FROM flood_layers
       WHERE layer_type = $1 AND ST_DWithin(geom, ${point}, $4)
       ORDER BY risk_label, ST_Distance(geom::geography, ${point}::geography)`,
      [layer, longitude, latitude, degreeRadius(metres, latitude)],
    );
    return rows.map((row) => ({
      riskLabel: row.risk_label as string,
      detail: (row.detail as string | null) ?? null,
      miles: Number(row.miles),
    }));
  }

  return {
    async layerFacts(layer, latitude, longitude) {
      const edition = await db.query(
        "SELECT source_name, source_date::text AS source_date FROM flood_layers WHERE layer_type = $1 LIMIT 1",
        [layer],
      );
      const { rows: countRows } = await db.query(
        "SELECT count(*)::int AS n FROM flood_layers WHERE layer_type = $1",
        [layer],
      );
      const filedCount = Number(countRows[0]?.n ?? 0);
      if (filedCount <= 0) {
        return {
          filedCount,
          covering: [],
          nearestWithin: [],
          nearestBeyond: null,
          sourceName: null,
          sourceDate: null,
        };
      }

      const { rows: coveringRows } = await db.query(
        `SELECT risk_label, detail FROM flood_layers
         WHERE layer_type = $1 AND ST_Covers(geom, ${point})
         ORDER BY risk_label`,
        [layer, longitude, latitude],
      );
      const covering = coveringRows.map((row) => ({
        riskLabel: row.risk_label as string,
        detail: (row.detail as string | null) ?? null,
      }));

      const within = await nearestRows(layer, latitude, longitude, RADIUS_MILES);
      const nearestWithin = within.filter((row) => row.miles <= RADIUS_MILES);

      let nearestBeyond: NearestRow | null = null;
      if (covering.length === 0 && nearestWithin.length === 0) {
        for (const step of BEYOND_STEPS_MILES) {
          const rows = await nearestRows(layer, latitude, longitude, step);
          const hits = rows.filter((row) => row.miles > RADIUS_MILES && row.miles <= step);
          if (hits.length > 0) {
            nearestBeyond = hits.sort((a, b) => a.miles - b.miles)[0];
            break;
          }
        }
      }

      return {
        filedCount,
        covering,
        nearestWithin,
        nearestBeyond,
        sourceName: (edition.rows[0]?.source_name as string | null) ?? null,
        sourceDate: (edition.rows[0]?.source_date as string | null) ?? null,
      };
    },
  };
}
