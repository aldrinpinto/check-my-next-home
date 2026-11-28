import type { AddressQueryable, AddressResolution } from "./address";
import { RADIUS_MILES } from "./nearby";

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
//     named state "Flood answers need an exact postcode" with
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
//     as the EA's name for that remainder); rivers & sea — the
//     point sits below the lowest band the Agency publishes,
//     which reads as Very low (BUG-343: the free pill reads
//     this absence as Very low, and the paid section must
//     never show less than the free page); surface
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
//
// Recorded flood defences (M6.27, decisions D49 and D54)
// join the answer as a SIBLING block, not a fourth layer:
// the Environment Agency's AIMS register of the defences it
// owns, manages or inspects, filed at migration 0024. The
// block is report depth only — the headline derivation picks
// named fields, so it never travels. Serving follows the
// register's own shape: the nearest defences within 2 miles,
// nearest first, each in full as filed (type, watercourse,
// maintainer category, condition grade, design and current
// standards of protection, each absence named), capped at
// DEFENCES_LIST_CAP with an overflow line carrying the true
// total. Two pinned sentences frame it: the structural
// caveat (defences reduce the chance of flooding; they do
// not remove it — and the register is the EA's record, not
// every defence that exists) and, where the rivers & sea
// layer is filed, the bridge line (that likelihood already
// counts these defences — the list is the record behind it,
// never a second reduction). The maintainer serves as its
// filed CATEGORY, verbatim — the loader's fail-closed
// vocabulary contract is what makes that safe — and the
// filed 'Unknown' serves as its named absence. No line in
// the block claims a defence protects this home: a defence
// on a different watercourse, or downstream, may do nothing
// for this point, and the block never says otherwise.
//
// Climate outlook (M6.28, decisions D49 and D55) joins the
// answer as a second sibling block: the Environment
// Agency's two Climate Change 1 scenario likelihoods, filed
// at migration 0025 into their own table
// (flood_climate_layers) so no scenario shape can ever be
// read as a present-day fact, or vice versa. The block
// serves the POINT STATE only — which band, if any, the
// scenario publishes at the point — with each source's
// scenario basis named every time, in its own halves'
// epochs (D55: rivers 2040–2069; the sea 2036–2065 with
// cumulative sea level rise to 2065; surface water
// 2040–2060). The EA service's blended span ("between 2036
// and 2069") merges two different allowance windows into
// one range and never serves. No proximity in the block,
// and never a present-day comparison: the block is composed
// from the climate facts alone, so the present-day layers
// cannot move it — Exeter's present-day Very low beside its
// scenario Low is two products' facts, never a computed
// change, and no served line ever sets them side by side.

export const FLOOD_UNAVAILABLE_REASON = "Flood answers need an exact postcode";

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

// D42's budget: one attempt, inside the checking
// envelope. The attempt's cap was 2 seconds at build;
// the fix batch (19 Nov 2026 — BUG-006) measured the
// EA API's real latency against it: the endpoint
// answers 200 for every request shape tried, but its
// first-hit latency runs 1.5–2.3 seconds (0.6–0.8s
// warm), so the 2-second cap aborted the lookup on
// effectively every first check of an area — the
// "could not be checked" line fired every time, a
// broken feature wearing a degradation's clothes. The
// cap is now 5 seconds: still one attempt, still well
// inside the founder's 10-second per-part bound
// (19 Nov 2026 ruling), and beyond the API's observed
// latency. Any failure — timeout, non-200, unparseable
// body — still degrades to the filed answer plus the
// named failure line; the check never blocks and never
// fails because of the warnings feed.
//
// Raised to the full bound (founder ruling, 22 Nov
// 2026): measured from the play server the same day,
// the EA endpoint's cold first hit ran 3.5 seconds and
// spiked past the 5-second cap — the service itself
// healthy, the cap the failure. The cap is now the
// D73 per-part bound itself, 10 seconds: still one
// attempt, no retry; a feed slower than the bound
// still degrades exactly as before.
export const FLOOD_WARNING_TIMEOUT_MS = 10000;

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

// One filed defence as the source reads it, at full filed
// precision; the brain composes the served form. The filed
// last_inspection_date is deliberately NOT on this port
// (D54: filed, not served).
export interface FloodDefenceRow {
  assetId: string;
  // As filed — the placeholder 'Not Available' included; the
  // brain maps it to its named absence.
  assetName: string | null;
  assetSubType: string | null;
  protectionType: string | null;
  // The filed category, verbatim (the loader files it
  // trimmed and vocabulary-checked).
  assetMaintainer: string | null;
  // The filed condition code: '0'–'5', '' (no grade
  // recorded — a state distinct from the recorded grade
  // '0'), or null.
  currentCondition: string | null;
  designSop: number | null;
  designSopDqf: string | null;
  currentSop: number | null;
  waterCourseName: string | null;
  miles: number;
}

export interface FloodDefencesFacts {
  // The whole-table filed count — the not-filed predicate.
  filedCount: number;
  // The true count within the serving radius (the D54
  // overflow line's total).
  totalWithin: number;
  sourceName: string | null;
  sourceDate: string | null;
  // The nearest defences within the radius, nearest first
  // (asset_id the tie-break), already cut at the list cap.
  defences: FloodDefenceRow[];
}

// The scenario layer types, as filed in flood_climate_layers
// (migration 0025) — a separate table from flood_layers, so
// the present-day guard's meaning is untouched and no query
// over the present-day products can ever reach a scenario
// shape.
export type FloodClimateLayerType = "rofrs_cc" | "rofsw_cc";

// The facts the brain reads for one climate source at one
// point: the covering query and the filed count only. No
// proximity is read — the block serves the point state, and
// nearest-scenario-edge distances would invite exactly the
// side-by-side present-vs-scenario reading the step fences
// against (prep R10). The bands are mutually exclusive at a
// point under the scenario (verified live at the prep), so
// the covering fact is a single label or none.
export interface FloodClimateFacts {
  filedCount: number;
  coveringLabel: string | null;
  sourceName: string | null;
  sourceDate: string | null;
}

// ------------------------------------------------------------------
// Flood-map geometry (M8.3, genuine flood maps)
// ------------------------------------------------------------------

// The picture frame: the postcode point centred, a mile
// in each direction (two miles across — the Section 5
// diagram's outer ring). The founder's ruling (20 Nov
// 2026) set the frame at about a mile; the step's own
// promise fixes the reading: on Birkdale the nearest
// filed flood-zone edge (the Chelmer) sits 0.84 miles
// from the home point (measured on the filed fixture
// shapes at this build), so a frame a mile across in
// total would draw an empty zones picture there and the
// promise — the shaded areas visible, held away from the
// street — could not be kept. A mile each way keeps it,
// with the shading standing clear of the centre.
export interface FloodMapFrame {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function floodMapFrame(latitude: number, longitude: number): FloodMapFrame {
  const halfMiles = 1.0;
  const latHalf = halfMiles / 69.0;
  const cosLat = Math.max(Math.cos((latitude * Math.PI) / 180), 0.2);
  const lonHalf = halfMiles / (69.0 * cosLat);
  return {
    west: longitude - lonHalf,
    south: latitude - latHalf,
    east: longitude + lonHalf,
    north: latitude + latHalf,
  };
}

// One filed shape clipped to the frame, as the source
// reads it: the filed label verbatim ("FZ3", "High") and
// its polygons — each polygon an array of rings, each
// ring an array of [longitude, latitude] points. The
// geometry may be simplified by the source; the report's
// promise assertions run against exactly this geometry,
// never against the unsimplified filing.
export interface FloodMapPolygonSet {
  label: string;
  polygons: [number, number][][][];
}

// One street line clipped to the frame: the filed name
// (null where the way is unnamed), the highway class
// verbatim, and its points as [longitude, latitude].
export interface FloodMapStreetLine {
  name: string | null;
  highway: string;
  points: [number, number][];
}

// The facts the brain reads for one layer's map: the
// layer's clipped shapes inside the frame, the street
// lines inside the same frame (identical whichever layer
// is asked — the builder reads them once, from the zones
// call), and the home's own street line where the
// resolution carries a street name and a filed way
// carries it.
export interface FloodMapFacts {
  polygons: FloodMapPolygonSet[];
  streets: FloodMapStreetLine[];
  homeStreet: FloodMapStreetLine | null;
}

// The served map data: a sibling of the layers on the
// served flood answer, report depth only. One shared
// frame and street set; per layer, the clipped shapes —
// or null where that layer files no shape inside the
// frame, or no street lines are filed for the frame
// (a picture is only ever drawn over street data we
// hold; the section's words stand alone otherwise).
export interface FloodMaps {
  frame: FloodMapFrame;
  streets: FloodMapStreetLine[];
  homeStreet: FloodMapStreetLine | null;
  zones: { polygons: FloodMapPolygonSet[] } | null;
  surfaceWater: { polygons: FloodMapPolygonSet[] } | null;
  // The wide street read's form (BUG-116): "banded" is
  // the only value this build serves — the read is
  // banded by distance so the Section 5 diagram's
  // street ground reaches the whole 2-mile frame. The
  // marker's presence is what the bundle cache's flood
  // shape rule requires: a bundle filed before the
  // banded read carries no marker, fails the shape
  // check, and is re-fetched instead of serving its
  // starved outer streets.
  streetRead: "banded";
}

// The brain's read port over the filed shapes — the same
// pattern as the sibling brains: tests drive a fake;
// createFloodSource below is the only database implementation.
export interface FloodDataSource {
  layerFacts(layer: FloodLayerType, latitude: number, longitude: number): Promise<FloodLayerFacts>;
  defencesNear(latitude: number, longitude: number): Promise<FloodDefencesFacts>;
  climateFacts(
    layer: FloodClimateLayerType,
    latitude: number,
    longitude: number,
  ): Promise<FloodClimateFacts>;
  mapFacts(
    layer: FloodLayerType,
    frame: FloodMapFrame,
    latitude: number,
    longitude: number,
    streetName: string | null,
    // The wide read (BUG-116): "wide" asks for the
    // banded street read over a doubled frame; absent
    // (the flood pictures' own calls), the plain
    // nearest-first read stands, byte-untouched.
    streetRead?: "wide",
  ): Promise<FloodMapFacts>;
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

// ------------------------------------------------------------------
// Recorded flood defences (M6.27, decisions D49 and D54)
// ------------------------------------------------------------------

// The D54 list cap: the nearest defences serve in full, and
// past the cap the overflow line carries the true total.
// The prep's recommended value, adopted with D54 — a named
// constant, reversible on the founder's word.
export const DEFENCES_LIST_CAP = 25;

export const FLOOD_DEFENCES_TITLE = "Recorded flood defences near this postcode point";

// The structural caveat (D49, pinned): it states what a
// defence does and the register's coverage limit in the
// same breath, and it travels with every served list — it
// is the block's framing, not an optional footnote.
export const FLOOD_DEFENCES_CAVEAT =
  "Flood defences reduce the chance of flooding; they do not remove it. Defences can be overtopped or fail, and this list is the Environment Agency's record of the defences it owns, manages or inspects — defences recorded by other bodies, and defences on smaller watercourses, are not in it.";

// The bridge to the rivers & sea layer (D49, pinned): that
// likelihood already counts these defences and their
// condition, so the list is the record behind the band —
// never a further reduction on top of it. Served only where
// the defences list serves AND the rivers & sea layer is
// filed (the prep's pinned predicate).
export const FLOOD_DEFENCES_BRIDGE =
  "The rivers and sea likelihood above already counts the flood defences in place and their condition. The list below is that record — the defences themselves, as the Environment Agency files them — not a further reduction on top of it.";

// The named absence (D49): the coverage limit travels with
// it, in the caveat's own terms, so an empty list can never
// read as "no defences exist".
export const FLOOD_DEFENCES_NONE_LINE =
  "No EA-recorded flood defence is mapped within 2 miles of this postcode point. The record covers the defences the Environment Agency owns, manages or inspects — defences recorded by other bodies, and defences on smaller watercourses, are not in it.";

export const FLOOD_DEFENCES_NOT_FILED_LINE =
  "Recorded flood defences are not filed yet, so no answer can be given from them";

// The condition grades in the Agency's own words, mapped
// from the filed TEXT codes (the FLOOD_ZONE_DEFINITIONS
// idiom — a pinned table, never free text). The filed ''
// and NULL are NOT grade 0: they are the absence of a grade,
// served by the named-absence line below.
export const DEFENCE_CONDITION_GRADES: Record<string, string> = {
  "0": "Unchecked",
  "1": "Very Good",
  "2": "Good",
  "3": "Fair",
  "4": "Poor",
  "5": "Very Poor",
};
export const DEFENCE_NO_CONDITION_LINE = "No condition is recorded for this defence";
export const DEFENCE_NO_MAINTAINER_LINE = "No maintainer is recorded for this defence";
export const DEFENCE_NO_DESIGN_SOP_LINE = "No design standard is recorded for this defence";
export const DEFENCE_NO_CURRENT_SOP_LINE = "No current standard is recorded for this defence";

// The D13 lines for the standards of protection: a bare
// "1 in 100" is meaningless, so each figure travels with
// its own explanation, pinned verbatim (D49).
export const DESIGN_SOP_EXPLAINER =
  "the design standard is the size of flood the defence was built to hold back, written as a yearly chance — '1 in 100' means a flood with a 1% chance of happening in any year.";
export const CURRENT_SOP_EXPLAINER =
  "the current standard is the size of flood this defence is currently recorded as holding back, written as a yearly chance — '1 in 100' means a flood with a 1% chance of happening in any year.";

export interface ServedFloodDefence {
  assetId: string;
  // The filed asset sub-type, verbatim ("Natural High
  // Ground", "Wall", …).
  type: string | null;
  // The filed name where the register carries one; the
  // placeholder 'Not Available' and the empty string serve
  // as null — the register names almost nothing.
  name: string | null;
  protectionType: string | null;
  watercourse: string | null;
  // The maintainer line that serves: the filed category
  // verbatim, or the named absence where the register
  // records 'Unknown' (or nothing).
  maintainer: string;
  maintainerRecorded: boolean;
  // The condition in the Agency's grade words, or null
  // where no grade is recorded.
  condition: string | null;
  conditionLine: string;
  designSop: number | null;
  designSopLine: string;
  designSopExplainer: string | null;
  // The Agency's quality flag on the design standard —
  // served only where a design standard itself is filed.
  designSopQuality: string | null;
  currentSop: number | null;
  currentSopLine: string;
  currentSopExplainer: string | null;
  miles: number;
}

export interface FloodDefencesBlock {
  state: "served" | "none-within-radius" | "not-filed";
  title: string;
  // The structural caveat — served state only.
  caveat: string | null;
  // The RoFRS bridge — served state, and only where the
  // rivers & sea layer is filed.
  bridgeLine: string | null;
  defences: ServedFloodDefence[];
  // The true count within 2 miles (null when not filed).
  totalWithin: number | null;
  // "and N more recorded defences within two miles" where
  // the cap is reached; the count is the true total less
  // the number served.
  overflowLine: string | null;
  // The named-absence / not-filed sentence; null when the
  // list serves.
  line: string | null;
  sourceName: string | null;
  sourceDate: string | null;
  sourceLine: string | null;
}

// ------------------------------------------------------------------
// Climate outlook (M6.28, decisions D49 and D55)
// ------------------------------------------------------------------

export const FLOOD_CLIMATE_HEADING = "Climate outlook";

// The fence (D49): the block is ONE published scenario —
// not a forecast, and not a prediction for this home. It
// travels with every served block, in every state.
export const FLOOD_CLIMATE_BASIS_LINE =
  "The Environment Agency also publishes flood likelihoods under one climate change scenario. This block gives that scenario's answer for the postcode point — a published scenario, not a forecast, and not a prediction about any home.";

// The EA caveats (D49), carried every time: flood
// likelihood is hard to predict, especially further into
// the future; the modelled likelihood could turn out
// bigger or smaller; the models cannot say when within
// the period.
export const FLOOD_CLIMATE_CAVEAT_LINE =
  "Flood likelihood is hard to predict, especially further into the future: the modelled likelihood could turn out bigger or smaller, and the models cannot say when within the period flooding might happen.";

// The scenario basis per source, named every time (D55):
// each half carries its OWN epoch bounds — rivers UKCP18 /
// RCP 8.5 / Central, 2040–2069; the sea Higher Central,
// 2036–2065 with cumulative sea level rise to 2065;
// surface water Central, 2040–2060. The blended span the
// EA service prints ("between 2036 and 2069") merges the
// two rivers-and-sea windows into one range and is never
// served.
export const ROFRS_CC_SCENARIO_LINE =
  "Scenario: UKCP18 projections under RCP 8.5 — the Central allowance for rivers, covering 2040–2069, and the Higher Central allowance for the sea, covering 2036–2065, allowing for cumulative sea level rise to 2065.";
export const ROFSW_CC_SCENARIO_LINE =
  "Scenario: UKCP18 projections under RCP 8.5 — the Central allowance for surface water, covering 2040–2060.";

export interface ServedClimateBand {
  // The filed label, verbatim ("Low", "Very low" — the
  // feature casing, never the notes' "Very Low").
  label: string;
  displayLabel: string;
  // The publisher's definition, from the same pinned table
  // the present-day bands serve (the thresholds are
  // identical under the scenario).
  definition: string;
}

export type ClimatePointState = "inside" | "no-band-published" | "not-filed";

export interface ServedClimateSource {
  source: "rivers-sea" | "surface-water";
  title: string;
  // This source's scenario basis — named every time, in
  // every state (D55).
  scenarioLine: string;
  pointState: ClimatePointState;
  band: ServedClimateBand | null;
  line: string;
  sourceName: string | null;
  sourceDate: string | null;
  sourceLine: string | null;
}

export interface ServedClimateOutlook {
  heading: string;
  basisLine: string;
  caveatLine: string;
  // Rivers and sea, then surface water — always both, each
  // in its own named state.
  sources: ServedClimateSource[];
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
        // The recorded-defences block (M6.27, D49/D54):
        // a sibling of the layers, report depth only. A
        // stored cache entry keeps it — it is filed data,
        // unlike the live warnings.
        defences: FloodDefencesBlock;
        // The climate outlook block (M6.28, D49/D55): a
        // sibling of the layers, report depth only, never
        // inside layers[] — the headline derivation reads
        // the layers, so the block cannot leak to headline
        // depth. A stored cache entry keeps it whole (it
        // is filed data, like the defences block).
        climate: ServedClimateOutlook;
        // The flood-map geometry (M8.3): a sibling of the
        // layers, report depth only — the filed shapes and
        // street lines clipped to the picture frame, from
        // which the report draws its two map pictures. A
        // stored cache entry keeps it whole (it is filed
        // data, like the defences block); the headline
        // derivation never sees it.
        maps: FloodMaps;
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
      return "Flood answers are not covered for Wales — the Environment Agency's flood maps cover England only, and flood maps for Wales are published by Natural Resources Wales";
    case "scotland":
      return "Flood answers are not covered for Scotland — the Environment Agency's flood maps cover England only, and flood maps for Scotland are published by the Scottish Environment Protection Agency";
    case "northern-ireland":
      return "Flood answers are not covered for Northern Ireland — the Environment Agency's flood maps cover England only";
    default:
      return "The Environment Agency's flood maps cover England only, and this postcode's filed area code does not place it in England";
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
      return "The postcode point is not in Flood Zone 2 or Flood Zone 3 on the Environment Agency's planning map";
    case "rofrs":
      // BUG-343 (25 Nov 2026): the free page's flood pill
      // reads this absence as "Very low" (lib/journey.ts's
      // floodBandOf maps the no-band-published state to
      // Very low, and lib/results.ts renders it as such),
      // so the paid section must carry the same band
      // instead of taking it away — the point sits below
      // the lowest band the Agency publishes, which is
      // the Very low case, and the line says so with its
      // source. The point state stays "no-band-published":
      // the three absences stay three distinct states, and
      // the free page's own rendering keys off it.
      return "the postcode point is below the lowest band the Environment Agency publishes on its map of flooding from rivers and the sea — Very low";
    case "rofsw":
      return "No surface-water band reaches this point — below the lowest band this product publishes";
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
      line: "This flood map is not filed yet, so no answer can be given from it",
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
    layer.beyondLine = `None within ${RADIUS_MILES} miles — the nearest mapped edge is ${displayLabel}, ${miles} miles away`;
  }

  return layer;
}

// One filed defence, served in full as filed (D49/D54):
// every absence is its own named line, never a borrowed
// value and never silence.
function serveDefence(row: FloodDefenceRow): ServedFloodDefence {
  const maintainerRecorded =
    row.assetMaintainer !== null && row.assetMaintainer !== "" && row.assetMaintainer !== "Unknown";
  const condition =
    row.currentCondition !== null && row.currentCondition !== ""
      ? (DEFENCE_CONDITION_GRADES[row.currentCondition] ?? null)
      : null;
  return {
    assetId: row.assetId,
    type: row.assetSubType,
    name: row.assetName && row.assetName !== "Not Available" ? row.assetName : null,
    protectionType: row.protectionType,
    watercourse: row.waterCourseName ? row.waterCourseName : null,
    maintainer: maintainerRecorded ? (row.assetMaintainer as string) : DEFENCE_NO_MAINTAINER_LINE,
    maintainerRecorded,
    condition,
    conditionLine: condition ? `condition: ${condition}` : DEFENCE_NO_CONDITION_LINE,
    designSop: row.designSop,
    designSopLine:
      row.designSop !== null
        ? `design standard: 1 in ${row.designSop}`
        : DEFENCE_NO_DESIGN_SOP_LINE,
    designSopExplainer: row.designSop !== null ? DESIGN_SOP_EXPLAINER : null,
    designSopQuality: row.designSop !== null ? row.designSopDqf : null,
    currentSop: row.currentSop,
    currentSopLine:
      row.currentSop !== null
        ? `current standard: 1 in ${row.currentSop}`
        : DEFENCE_NO_CURRENT_SOP_LINE,
    currentSopExplainer: row.currentSop !== null ? CURRENT_SOP_EXPLAINER : null,
    miles: round3(row.miles),
  };
}

// The defences block (M6.27). The bridge predicate is the
// prep's pinned one: the list serves AND the rivers & sea
// layer's facts are filed — where that layer serves an
// absence the bridge still holds (the likelihood exists and
// counts defences); where it is not filed there is no
// likelihood for the bridge to describe.
function buildDefencesBlock(
  facts: FloodDefencesFacts,
  rofrsFacts: FloodLayerFacts,
): FloodDefencesBlock {
  const sourceLine =
    facts.sourceName && facts.sourceDate
      ? `${facts.sourceName} — data to ${dateLabel(facts.sourceDate)}`
      : null;
  const base: FloodDefencesBlock = {
    state: "not-filed",
    title: FLOOD_DEFENCES_TITLE,
    caveat: null,
    bridgeLine: null,
    defences: [],
    totalWithin: null,
    overflowLine: null,
    line: null,
    sourceName: facts.sourceName,
    sourceDate: facts.sourceDate,
    sourceLine,
  };
  if (facts.filedCount <= 0) {
    return { ...base, line: FLOOD_DEFENCES_NOT_FILED_LINE, sourceLine: null };
  }
  if (facts.totalWithin <= 0) {
    return {
      ...base,
      state: "none-within-radius",
      totalWithin: 0,
      line: FLOOD_DEFENCES_NONE_LINE,
    };
  }
  const defences = facts.defences.map(serveDefence);
  const overflow = facts.totalWithin - defences.length;
  return {
    ...base,
    state: "served",
    caveat: FLOOD_DEFENCES_CAVEAT,
    bridgeLine: rofrsFacts.filedCount > 0 ? FLOOD_DEFENCES_BRIDGE : null,
    defences,
    totalWithin: facts.totalWithin,
    // BUG-344(c) (25 Nov 2026): the overflow line has a
    // singular form — one more defence, not defences.
    overflowLine:
      overflow === 1
        ? "and 1 more recorded defence within two miles"
        : overflow > 0
          ? `and ${overflow} more recorded defences within two miles`
          : null,
  };
}

// ------------------------------------------------------------------
// Climate composition (M6.28)
// ------------------------------------------------------------------

interface ClimateSpec {
  layer: FloodClimateLayerType;
  source: ServedClimateSource["source"];
  title: string;
  scenarioLine: string;
  // The map phrase the point lines are composed over.
  mapPhrase: string;
}

const CLIMATE_SPECS: ClimateSpec[] = [
  {
    layer: "rofrs_cc",
    source: "rivers-sea",
    title: "Flooding from rivers and the sea — climate scenario",
    scenarioLine: ROFRS_CC_SCENARIO_LINE,
    mapPhrase: "flooding from rivers and the sea",
  },
  {
    layer: "rofsw_cc",
    source: "surface-water",
    title: "Flooding from surface water — climate scenario",
    scenarioLine: ROFSW_CC_SCENARIO_LINE,
    mapPhrase: "flooding from surface water",
  },
];

// One climate source, served from its facts alone. The
// three states are the step's named states: inside (the
// band the scenario publishes at the point, with the
// publisher's definition); no-band-published (no polygon
// covers the point under the scenario — absence is not a
// band: no "Very low" inference for rivers and sea, and not
// the present-day surface-water "below-lowest-band" framing
// either — this one absence governs both scenario sources);
// not-filed (no filing yet — absence is never computed
// against an unproven filing, the brain's existing rule).
function buildClimateSource(spec: ClimateSpec, facts: FloodClimateFacts): ServedClimateSource {
  const sourceLine =
    facts.sourceName && facts.sourceDate
      ? `${facts.sourceName} — data to ${dateLabel(facts.sourceDate)}`
      : null;
  const base: ServedClimateSource = {
    source: spec.source,
    title: spec.title,
    scenarioLine: spec.scenarioLine,
    pointState: "not-filed",
    band: null,
    line: "",
    sourceName: facts.sourceName,
    sourceDate: facts.sourceDate,
    sourceLine,
  };
  if (facts.filedCount <= 0) {
    return {
      ...base,
      line: `The climate scenario map of ${spec.mapPhrase} is not filed yet, so no answer can be given from it`,
    };
  }
  if (facts.coveringLabel) {
    const band: ServedClimateBand = {
      label: facts.coveringLabel,
      displayLabel: facts.coveringLabel,
      definition: FLOOD_BAND_DEFINITIONS[facts.coveringLabel] ?? "",
    };
    return {
      ...base,
      pointState: "inside",
      band,
      line: `the postcode point falls in the ${band.displayLabel} band on the Environment Agency's climate scenario map of ${spec.mapPhrase}`,
    };
  }
  return {
    ...base,
    pointState: "no-band-published",
    line: `No likelihood band is published for this point under this scenario on the Environment Agency's climate scenario map of ${spec.mapPhrase}`,
  };
}

// The block: composed from the two sources' climate facts
// and nothing else — structural independence from the
// present-day layers is what keeps any present-vs-scenario
// comparison unservable, not a wording rule alone.
function buildClimateOutlook(factsByLayer: Map<FloodClimateLayerType, FloodClimateFacts>) {
  return {
    heading: FLOOD_CLIMATE_HEADING,
    basisLine: FLOOD_CLIMATE_BASIS_LINE,
    caveatLine: FLOOD_CLIMATE_CAVEAT_LINE,
    sources: CLIMATE_SPECS.map((spec) =>
      buildClimateSource(spec, factsByLayer.get(spec.layer) as FloodClimateFacts),
    ),
  };
}

// ------------------------------------------------------------------
// The bundle
// ------------------------------------------------------------------

// The served map data (M8.3): the two layers' clipped
// shapes over one shared street set. A layer's entry is
// null unless the layer files at least one shape inside
// the frame AND street lines are filed for the frame —
// the founder's ruling: a picture is emitted only where
// that layer's shapes are filed, drawn over street data
// we hold; otherwise the section's existing words stand
// alone. The street set and the home's street ride from
// the zones read (the source reads the same streets for
// either layer).
export function buildFloodMaps(
  frame: FloodMapFrame,
  zoneFacts: FloodMapFacts,
  surfaceWaterFacts: FloodMapFacts,
): FloodMaps {
  const streets = zoneFacts.streets;
  const drawable = streets.length > 0;
  return {
    frame,
    streets,
    homeStreet: zoneFacts.homeStreet,
    zones: drawable && zoneFacts.polygons.length > 0 ? { polygons: zoneFacts.polygons } : null,
    surfaceWater:
      drawable && surfaceWaterFacts.polygons.length > 0
        ? { polygons: surfaceWaterFacts.polygons }
        : null,
    streetRead: "banded",
  };
}

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
  const factsByLayer = new Map<FloodLayerType, FloodLayerFacts>();
  for (const spec of LAYER_SPECS) {
    const facts = await source.layerFacts(spec.type, latitude, longitude);
    factsByLayer.set(spec.type, facts);
    layers.push(buildLayer(spec, facts));
  }
  // The recorded defences (M6.27): composed here, for the
  // served England state at rungs 1–2 only — the not-covered
  // nations and the named rung states carry no defences
  // payload, and the headline derivation never sees it.
  const defences = buildDefencesBlock(
    await source.defencesNear(latitude, longitude),
    factsByLayer.get("rofrs") as FloodLayerFacts,
  );
  // The climate outlook (M6.28): composed here, for the
  // served England state at rungs 1–2 only — the
  // not-covered nations and the named rung states carry no
  // climate payload (the scenario products are
  // England-only like their parents), and the headline
  // derivation never sees the block.
  const climateFactsByLayer = new Map<FloodClimateLayerType, FloodClimateFacts>();
  for (const spec of CLIMATE_SPECS) {
    climateFactsByLayer.set(spec.layer, await source.climateFacts(spec.layer, latitude, longitude));
  }
  const climate = buildClimateOutlook(climateFactsByLayer);
  // The flood-map geometry (M8.3): composed here, for the
  // served England state at rungs 1–2 only, like the
  // defences and climate siblings — the not-covered
  // nations and the named rung states carry no map
  // payload, and the headline derivation never sees it.
  // The home's street name rides from the resolution
  // (rung 1's address, rung 2's narrowed street) so the
  // source can pick the home's own street line out of
  // the frame's streets.
  const frame = floodMapFrame(latitude, longitude);
  const streetName =
    resolution.rung === 1
      ? resolution.address.street
      : resolution.rung === 2
        ? resolution.street
        : null;
  const zoneFacts = await source.mapFacts("flood_zone", frame, latitude, longitude, streetName);
  // The Section 5 diagram's ground (second-pass batch,
  // BUG-080): the report's places diagram frames two
  // miles in each direction (its rings stand at 1 and 2
  // miles), and its street ground is drawn across that
  // whole frame — so the shared street set is read over
  // the wider frame too, and the wider read's streets
  // stand as the bundle's street set. The flood
  // pictures' own frame (above) is untouched: they
  // project the same set into their one-mile frame and
  // draw exactly what they drew, the wider lines simply
  // running off their edges. The wider read's shapes are
  // discarded — the pictures' geometry is the one-mile
  // read's, exactly as filed for them. The wide read is
  // BANDED (BUG-116): a single nearest-first read under
  // one cap starved the outer frame — at a dense point
  // the cap filled with inner streets and the diagram's
  // rim stood empty — so the wide read runs one capped
  // query per distance band and concatenates them in
  // band order, and every band's ground is present.
  const wideFrame: FloodMapFrame = {
    west: longitude - (longitude - frame.west) * 2,
    south: latitude - (latitude - frame.south) * 2,
    east: longitude + (frame.east - longitude) * 2,
    north: latitude + (frame.north - latitude) * 2,
  };
  const wideFacts = await source.mapFacts(
    "flood_zone",
    wideFrame,
    latitude,
    longitude,
    streetName,
    "wide",
  );
  const maps = buildFloodMaps(
    frame,
    {
      polygons: zoneFacts.polygons,
      streets: wideFacts.streets.length > 0 ? wideFacts.streets : zoneFacts.streets,
      homeStreet: wideFacts.homeStreet ?? zoneFacts.homeStreet,
    },
    await source.mapFacts("rofsw", frame, latitude, longitude, streetName),
  );
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
    flood: {
      state: "served",
      liveWarnings,
      layers,
      defences,
      climate,
      maps,
      howWeCheck: FLOOD_HOW_WE_CHECK,
    },
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

    // The recorded defences read (M6.27): the whole-table
    // count is the not-filed predicate; the within-radius
    // count is the true total the overflow line carries;
    // the rows are the nearest DEFENCES_LIST_CAP, cut by
    // the geography distance the same query computes (the
    // ST_DWithin prefilter only bounds the work, on
    // flood_defences_geom_idx). Ordering is distance then
    // asset_id — one wall files as many near-equidistant
    // segments, so the tie-break keeps the list stable
    // between reads.
    async defencesNear(latitude, longitude) {
      const edition = await db.query(
        "SELECT source_name, source_date::text AS source_date FROM flood_defences LIMIT 1",
      );
      const { rows: countRows } = await db.query("SELECT count(*)::int AS n FROM flood_defences");
      const filedCount = Number(countRows[0]?.n ?? 0);
      if (filedCount <= 0) {
        return { filedCount, totalWithin: 0, sourceName: null, sourceDate: null, defences: [] };
      }
      const metres = RADIUS_MILES * METRES_PER_MILE;
      const here = "ST_SetSRID(ST_MakePoint($1, $2), 4326)";
      const { rows: totalRows } = await db.query(
        `SELECT count(*)::int AS n FROM flood_defences
         WHERE ST_DWithin(geom, ${here}, $3)
           AND ST_Distance(geom::geography, ${here}::geography) <= $4`,
        [longitude, latitude, degreeRadius(metres, latitude), metres],
      );
      const { rows } = await db.query(
        `SELECT asset_id, asset_name, asset_sub_type, protection_type,
                asset_maintainer, current_condition, design_sop,
                design_sop_dqf, current_sop, water_course_name,
                ST_Distance(geom::geography, ${here}::geography) / ${METRES_PER_MILE} AS miles
         FROM flood_defences
         WHERE ST_DWithin(geom, ${here}, $3)
         ORDER BY miles, asset_id
         LIMIT $4`,
        [longitude, latitude, degreeRadius(metres, latitude), DEFENCES_LIST_CAP],
      );
      const defences = rows
        .map((row) => ({
          assetId: row.asset_id as string,
          assetName: (row.asset_name as string | null) ?? null,
          assetSubType: (row.asset_sub_type as string | null) ?? null,
          protectionType: (row.protection_type as string | null) ?? null,
          assetMaintainer: (row.asset_maintainer as string | null) ?? null,
          currentCondition: (row.current_condition as string | null) ?? null,
          designSop: (row.design_sop as number | null) ?? null,
          designSopDqf: (row.design_sop_dqf as string | null) ?? null,
          currentSop: (row.current_sop as number | null) ?? null,
          waterCourseName: (row.water_course_name as string | null) ?? null,
          miles: Number(row.miles),
        }))
        .filter((row) => row.miles <= RADIUS_MILES);
      return {
        filedCount,
        totalWithin: Number(totalRows[0]?.n ?? 0),
        sourceName: (edition.rows[0]?.source_name as string | null) ?? null,
        sourceDate: (edition.rows[0]?.source_date as string | null) ?? null,
        defences,
      };
    },

    // The climate read (M6.28): the covering query and the
    // filed count against flood_climate_layers, per scenario
    // layer type — no proximity, no beyond steps (the block
    // serves the point state only). The edition rides the
    // filing's own source stamp, per source, so the two
    // scenario products stay honest if the EA ever decouples
    // their cycles from the present-day builds.
    async climateFacts(layer, latitude, longitude) {
      const edition = await db.query(
        "SELECT source_name, source_date::text AS source_date FROM flood_climate_layers WHERE layer_type = $1 LIMIT 1",
        [layer],
      );
      const { rows: countRows } = await db.query(
        "SELECT count(*)::int AS n FROM flood_climate_layers WHERE layer_type = $1",
        [layer],
      );
      const filedCount = Number(countRows[0]?.n ?? 0);
      if (filedCount <= 0) {
        return { filedCount, coveringLabel: null, sourceName: null, sourceDate: null };
      }
      const { rows: coveringRows } = await db.query(
        `SELECT risk_label FROM flood_climate_layers
         WHERE layer_type = $1 AND ST_Covers(geom, ${point})
         ORDER BY risk_label`,
        [layer, longitude, latitude],
      );
      return {
        filedCount,
        coveringLabel: (coveringRows[0]?.risk_label as string | null) ?? null,
        sourceName: (edition.rows[0]?.source_name as string | null) ?? null,
        sourceDate: (edition.rows[0]?.source_date as string | null) ?? null,
      };
    },

    // The flood-map read (M8.3): the layer's shapes and
    // the frame's street lines, clipped to the frame in
    // the database and simplified there — the tolerances
    // (~1 metre for shapes, ~2 for streets) are far below
    // anything the picture or its promise assertions can
    // read, and the served geometry IS the asserted
    // geometry by construction. The shape tolerance is
    // set with the tightest golden in mind: Exeter's home
    // point sits 7 metres inside its Flood Zone 3 edge on
    // the filed shapes, so the drawn edge may move by at
    // most a seventh of that margin. Caps bound a pathological
    // frame, ordered so a cap can never drop the centre:
    // shapes largest first (the covering shape's class is
    // never the one silently lost), streets nearest the
    // point first (a two-mile frame in the densest centre
    // holds on the order of ten thousand lines — measured
    // 8,392 in the Exeter frame at this build — and any
    // truncation thins the corners, never the middle). A
    // missing street_lines table (a database predating
    // migration 0038) reads as no streets filed, so the
    // pictures degrade to their no-picture state rather
    // than failing the whole flood answer.
    async mapFacts(layer, frame, latitude, longitude, streetName, streetRead) {
      const envelope = "ST_MakeEnvelope($2, $3, $4, $5, 4326)";
      const roundPoint = (p: number[]): [number, number] => [
        Math.round(Number(p[0]) * 1e6) / 1e6,
        Math.round(Number(p[1]) * 1e6) / 1e6,
      ];
      const toPolygons = (geo: unknown): [number, number][][][] => {
        const g = geo as { type?: string; coordinates?: unknown } | null;
        if (!g || !g.coordinates) return [];
        if (g.type === "Polygon")
          return [(g.coordinates as number[][][]).map((ring) => ring.map(roundPoint))] as [
            number,
            number,
          ][][][];
        if (g.type === "MultiPolygon")
          return (g.coordinates as number[][][][]).map((polygon) =>
            polygon.map((ring) => ring.map(roundPoint)),
          ) as [number, number][][][];
        return [];
      };
      const toLines = (geo: unknown): [number, number][][] => {
        const g = geo as { type?: string; coordinates?: unknown } | null;
        if (!g || !g.coordinates) return [];
        if (g.type === "LineString")
          return [(g.coordinates as number[][]).map(roundPoint)] as [number, number][][];
        if (g.type === "MultiLineString")
          return (g.coordinates as number[][][]).map((line) => line.map(roundPoint)) as [
            number,
            number,
          ][][];
        return [];
      };
      // One dissolved shape per label: the surface-water
      // product files a fine grid of small cells, so a
      // two-mile frame holds on the order of seventeen
      // thousand of them at Birkdale (measured at this
      // build) — served per feature, the picture's model
      // would carry every cell. ST_Union over the clipped
      // shapes merges each label's cells into the areas
      // actually drawn; coverage is preserved exactly, so
      // the promise assertions (which run against the
      // drawn geometry) are unaffected.
      const { rows: shapeRows } = await db.query(
        `SELECT risk_label,
                ST_AsGeoJSON(ST_SimplifyPreserveTopology(
                  ST_Multi(ST_CollectionExtract(
                    ST_Union(ST_Intersection(geom, ${envelope})), 3)), 0.00001))::json AS geo
         FROM flood_layers
         WHERE layer_type = $1 AND geom && ${envelope} AND ST_Intersects(geom, ${envelope})
         GROUP BY risk_label`,
        [layer, frame.west, frame.south, frame.east, frame.north],
      );
      const polygons: FloodMapPolygonSet[] = [];
      for (const row of shapeRows) {
        const label = (row.risk_label as string | null) ?? null;
        if (label === null) continue;
        const shapes = toPolygons(row.geo);
        if (shapes.length === 0) continue;
        const existing = polygons.find((entry) => entry.label === label);
        if (existing) existing.polygons.push(...shapes);
        else polygons.push({ label, polygons: shapes });
      }
      let streets: FloodMapStreetLine[] = [];
      let homeStreet: FloodMapStreetLine | null = null;
      try {
        const streetEnvelope = "ST_MakeEnvelope($1, $2, $3, $4, 4326)";
        const streetSelect = `SELECT name, highway,
                  ST_AsGeoJSON(ST_Simplify(ST_Intersection(geom, ${streetEnvelope}), 0.00002))::json AS geo
           FROM street_lines
           WHERE geom && ${streetEnvelope} AND ST_Intersects(geom, ${streetEnvelope})`;
        const streetOrder = `ORDER BY ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography), osm_id`;
        // The wide read (BUG-116) runs banded: one capped
        // query per distance band (metres from the point),
        // concatenated in band order, so the outer bands
        // contribute their nearest streets instead of
        // being crowded out by the inner ground under a
        // single nearest-first cap. The plain read (the
        // flood pictures' own one-mile frame) is the
        // original single query, unchanged.
        const streetRowSets: Record<string, unknown>[][] = [];
        if (streetRead === "wide") {
          const bands: [number, number | null][] = [
            [0, 800],
            [800, 1600],
            [1600, 2400],
            [2400, 3200],
            [3200, null],
          ];
          for (const [lo, hi] of bands) {
            const { rows: bandRows } = await db.query(
              `${streetSelect}
           AND ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography) >= $7
           ${hi !== null ? "AND ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography) < $8" : ""}
           ${streetOrder}
           LIMIT 4000`,
              hi !== null
                ? [frame.west, frame.south, frame.east, frame.north, longitude, latitude, lo, hi]
                : [frame.west, frame.south, frame.east, frame.north, longitude, latitude, lo],
            );
            streetRowSets.push(bandRows as Record<string, unknown>[]);
          }
        } else {
          const { rows } = await db.query(
            `${streetSelect}
           ${streetOrder}
           LIMIT 12000`,
            [frame.west, frame.south, frame.east, frame.north, longitude, latitude],
          );
          streetRowSets.push(rows as Record<string, unknown>[]);
        }
        const streetRows = streetRowSets.flat();
        for (const row of streetRows) {
          for (const points of toLines(row.geo)) {
            if (points.length >= 2)
              streets.push({
                name: (row.name as string | null) ?? null,
                highway: row.highway as string,
                points,
              });
          }
        }
        if (streetName !== null) {
          // The home's own street line: the filed way
          // carrying the resolution's street name whose
          // nearest point lies closest to the point.
          let bestDistance = Infinity;
          for (const street of streets) {
            if (street.name === null || street.name.toLowerCase() !== streetName.toLowerCase())
              continue;
            for (const [lon, lat] of street.points) {
              const d = (lon - longitude) ** 2 + (lat - latitude) ** 2;
              if (d < bestDistance) {
                bestDistance = d;
                homeStreet = street;
              }
            }
          }
        }
      } catch {
        // street_lines is absent (pre-0038 database) or the
        // read failed: no streets filed is the honest
        // degrade — the pictures simply do not draw.
        streets = [];
        homeStreet = null;
      }
      return { polygons, streets, homeStreet };
    },
  };
}
