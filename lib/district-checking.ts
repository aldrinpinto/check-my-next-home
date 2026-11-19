// The wider-area checking derivation (founder ruling,
// 19 Nov 2026 — Sample 3, "The Recommendation, Combined",
// of the wider-area checking samples, drawn as Final
// Sample Master view 31).
//
// The district bundle in, the four groups' completion
// lines out — the exact twin of the home check's
// derivation in lib/journey.ts, on the district page's
// own groups: the four D76 tabs the district results
// serve (Family Checks, The Neighbourhood, Home, Costs &
// Risks, What's Nearby), in tab order. A group outcome
// carries the same three states as the home check's
// (lib/journey.ts's CheckingGroupResult): "done" — the
// line is a finding composed from the served facts;
// "unavailable" — a section served a named state (not
// filed, not covered) and the line carries that state in
// the bundle's own words; "failed" — reserved for the
// payload request itself failing, assembled client-side.
//
// Composition rules are the home derivation's, unchanged:
// segments joined "; "; the first segment carries the
// group's lead prefix unless it carries its own; a
// segment flagged named is a bundle's own named-state
// line, served verbatim, and makes its group unavailable;
// a non-lead dataset contributes a segment only when it
// serves a named state — a named state never passes
// silently, and a served one is the results page's to
// carry. The lead facts are the drawn finding's (Master
// view 31): schools counts and the grammar position for
// Family Checks; residents and crime for The
// Neighbourhood; the median, council tax and the flood
// share for Home, Costs & Risks; the everyday counts and
// stations for What's Nearby.
//
// The named-state sentences the district sections do not
// carry as fields are the district results view's own
// words for the same states (lib/results.ts's district
// section builders) — the derivation repeats them here
// rather than inventing new ones, and each is marked at
// its constant below.

import type { DistrictBundle, DistrictFloodSection } from "./district";
import {
  formatPounds,
  groupResult,
  rowFailureLine,
  type CheckingGroupResult,
  type CheckingSegment,
} from "./journey";

type DistrictServed = Extract<DistrictBundle, { kind: "district" }>;

// ------------------------------------------------------------------
// The screen's pinned copy
// ------------------------------------------------------------------

// The live line's forms: the starting sentence, the
// settled sentence it lands on when the last group
// completes, the closing line under the feed, and the
// live-region announcement of the final beat (the wider-
// area samples' own words; the settled and closing lines
// are Master view 31's drawn forms).
export const DISTRICT_CHECKING_START_LINE = "Starting your area check…";
export const DISTRICT_CHECKING_READY_TICKER =
  "Your area picture is ready — four groups, every figure sourced.";
export const DISTRICT_CHECKING_FINAL_LINE =
  "Your area picture is ready — four groups, every figure sourced, district stamp landed.";
export const DISTRICT_CHECKING_READY_ANNOUNCEMENT =
  "Your area picture is ready. Four of four groups complete.";

// The step line's completed sentence (the running and
// waiting words are the home screen's own constants —
// CHECKING_STEP_RUNNING and CHECKING_WAITING_LINE in
// lib/journey.ts — shared so the two screens speak once).
export const DISTRICT_CHECKING_STEP_DONE = "All four groups checked";

// The caption under the sweep (Master view 31, verbatim):
// it holds at every beat, not just the completed one.
export const DISTRICT_CHECKING_SWEEP_CAPTION =
  "A sketch of the district, not a map — the shapes fill in as each group lands.";

// The four groups, in feed order (the D76 tab order).
// Each carries the source line its row always shows
// (Master view 31's feed sources), the doing line it
// carries while it is the group in flight, and the
// ticker sentence the live line rotates to while it is
// in flight (the wider-area samples' own sentences,
// which name only what the product's group really
// holds — the samples' family sentence named nurseries
// and crime, which sit in other groups here, so the
// product's family doing line names schools alone).
export const DISTRICT_CHECKING_ROWS = [
  {
    key: "family",
    label: "Family Checks",
    source: "DfE Get Information About Schools · Ofsted",
    doing: "Checking schools across the district…",
    ticker: (outward: string) => `Now checking family checks across ${outward}…`,
  },
  {
    key: "neighbourhood",
    label: "The Neighbourhood",
    source: "ONS · Census 2021 · Police.uk",
    doing: "Reading the census picture & deprivation for every neighbourhood…",
    ticker: (outward: string) => `Now reading the neighbourhood picture for ${outward}…`,
  },
  {
    key: "home",
    label: "Home, Costs & Risks",
    source: "HM Land Registry · Councils · Environment Agency",
    doing: "Checking sold prices, council tax, flood maps & broadband across the district…",
    ticker: (outward: string) => `Now checking home, costs & risks across ${outward}…`,
  },
  {
    key: "nearby",
    label: "What's Nearby",
    source: "NHS service finder · OSM places",
    doing: "Counting GP practices, dentists, pharmacies & stations across the district…",
    ticker: (outward: string) => `Now checking what's nearby in ${outward}…`,
  },
] as const;

export type DistrictCheckingRowKey = (typeof DISTRICT_CHECKING_ROWS)[number]["key"];

// ------------------------------------------------------------------
// The named-state sentences the sections do not carry
// (the district results view's own words for the states)
// ------------------------------------------------------------------

const SCHOOLS_NOT_FILED_LINE = "Schools are not filed for this district yet.";
const CRIME_NOT_FILED_LINE = "Crime is not filed for this district yet.";
const DEPRIVATION_NOT_FILED_LINE = "Deprivation is not filed for this district's small areas yet.";
const AIR_NOT_FILED_LINE = "Modelled air quality is not filed for this district's postcodes yet.";
const SOLD_NOT_FILED_LINE = "No sales are filed for this district's postcodes yet.";
const COUNCIL_TAX_NOT_FILED_LINE = "Council tax is not filed for this district's councils yet.";
const BROADBAND_NOT_FILED_LINE =
  "Broadband answers are not filed for this district's postcodes yet.";
const FLOOD_NOT_FILED_LINE = "Flood answers are not filed for this district yet.";
const EVERYDAY_NOT_FILED_LINE = "Everyday counts are not filed for this district yet.";

// ------------------------------------------------------------------
// Small formatters (the district results view's own forms)
// ------------------------------------------------------------------

function count(value: number): string {
  return value.toLocaleString("en-GB");
}

function plural(value: number, singular: string, pluralForm: string): string {
  return value === 1 ? singular : pluralForm;
}

// Council tax as the district page serves it: the filed
// pence-exact figure (lib/results.ts's districtPence —
// a district average is filed to the penny, so the feed
// states it to the penny rather than rounding it away).
function formatDistrictPence(pence: number): string {
  return `£${(pence / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ------------------------------------------------------------------
// Family Checks — the schools section alone.
// ------------------------------------------------------------------

function familyGroupResult(bundle: DistrictServed): CheckingGroupResult {
  const schools = bundle.sections.schools;
  if (schools.state !== "served") return { state: "unavailable", line: SCHOOLS_NOT_FILED_LINE };
  if (schools.primary + schools.secondary === 0) {
    // The drawn lead facts are absent but the section
    // serves: its own headline sentence stands for the
    // group, verbatim as the results page composes it —
    // a filed zero included (a recorded zero is a fact).
    return {
      state: "done",
      line: `${count(schools.counted)} schools are filed inside ${bundle.outward}.`,
    };
  }
  const text =
    `${count(schools.primary)} primary ${plural(schools.primary, "school", "schools")} and ` +
    `${count(schools.secondary)} secondary ${plural(schools.secondary, "school", "schools")} ` +
    `found across ${bundle.outward}` +
    (schools.grammar === 0
      ? " — and no grammar school filed in the district"
      : ` — including ${count(schools.grammar)} grammar ${plural(schools.grammar, "school", "schools")}`);
  return groupResult("DfE & Ofsted", [{ text, named: false }]);
}

// ------------------------------------------------------------------
// The Neighbourhood — the district itself, census, crime,
// deprivation, air (the tab's own section order).
// ------------------------------------------------------------------

function neighbourhoodGroupResult(bundle: DistrictServed): CheckingGroupResult {
  const { sections, head } = bundle;
  const segments: CheckingSegment[] = [];

  // The lead segment: the residents the district page's
  // own head tiles serve (the district section's figure,
  // falling back to the census sum), across the
  // district's small areas.
  const residents = sections.district.residents ?? sections.census.residentsTotal;
  if (residents != null) {
    segments.push({
      text: `${count(residents)} residents across ${count(head.lsoaCount)} small areas`,
      named: false,
    });
  }
  if (sections.census.state !== "served" && sections.census.line) {
    segments.push({ text: sections.census.line, named: true });
  }

  // Crime: the drawn finding where a district total is
  // filed (the served form stands ready in the brain);
  // on today's filings the source files no district
  // total at all — the circles would double-count — so
  // the section's own honest line names the state.
  const crime = sections.crime;
  if (crime.state === "served" && crime.total != null && crime.per1000 != null) {
    segments.push({
      text:
        `${count(crime.total)} recorded crimes in the last 12 months, ` +
        `${crime.per1000.toFixed(1)} per 1,000 residents` +
        (crime.england ? ` against England's ${crime.england.englandPer1000.toFixed(1)}` : ""),
      prefix: "Police.uk",
      named: false,
    });
  } else {
    segments.push({
      text: crime.line ?? CRIME_NOT_FILED_LINE,
      prefix: "Police.uk",
      named: true,
    });
  }

  // Deprivation and air are non-lead here: a served
  // answer is the results page's to carry; a named
  // state never passes silently.
  const deprivation = sections.deprivation;
  if (deprivation.state !== "served") {
    const line =
      deprivation.line ?? (deprivation.state === "not-filed" ? DEPRIVATION_NOT_FILED_LINE : null);
    if (line) segments.push({ text: line, named: true });
  }
  if (sections.air.state !== "served") {
    segments.push({ text: AIR_NOT_FILED_LINE, prefix: "Defra", named: true });
  }

  if (segments.length === 0) return { state: "failed", line: rowFailureLine("The Neighbourhood") };
  return groupResult("ONS & Police.uk", segments);
}

// ------------------------------------------------------------------
// Home, Costs & Risks — sold prices, council tax,
// connectivity, flood (the tab's own section order).
// ------------------------------------------------------------------

function floodSegments(flood: DistrictFloodSection): CheckingSegment[] {
  if (flood.state !== "served") {
    // Not filed, or not covered (Wales — the section's
    // own line names the boundary): the brain's words,
    // verbatim.
    return [{ text: flood.line ?? FLOOD_NOT_FILED_LINE, named: true }];
  }
  const segments: CheckingSegment[] = [];
  // Live warnings lead the flood half (decision D42):
  // a warning in force outranks the filed maps.
  if (flood.warnings.state === "warnings") {
    segments.push({ text: flood.warnings.line, named: false });
  }
  // The drawn flood fact: the share of counted postcodes
  // outside the mapped river & sea flood bands, read
  // from the section's own planning-zone shares (Zones
  // 3 and 2 are the mapped zones; the rest sit outside
  // them). The counted unit is postcodes — the section
  // counts postcodes, so the feed names postcodes.
  if (flood.zones != null) {
    const outside = Number((100 - flood.zones.zone3Pct - flood.zones.zone2Pct).toFixed(1));
    segments.push({
      text: `${outside}% of postcodes outside the mapped river & sea flood bands`,
      named: false,
    });
  } else if (flood.riversSea) {
    segments.push({
      text: `rivers & sea flood risk counted across ${count(flood.riversSea.counted)} postcodes`,
      named: false,
    });
  } else if (flood.surfaceWater) {
    segments.push({
      text: `surface water flood risk counted across ${count(flood.surfaceWater.counted)} postcodes`,
      named: false,
    });
  }
  // A layer filed somewhere but not covering this
  // district names itself in its block's place.
  if (!flood.riversSea && flood.riversSeaNotCoveredLine) {
    segments.push({ text: flood.riversSeaNotCoveredLine, named: true });
  }
  if (!flood.surfaceWater && flood.surfaceWaterNotCoveredLine) {
    segments.push({ text: flood.surfaceWaterNotCoveredLine, named: true });
  }
  // A live feed that could not answer carries its line
  // after the filed answer — the filed answer stands.
  if (flood.warnings.state === "unavailable" && flood.warnings.line) {
    segments.push({ text: flood.warnings.line, named: false });
  }
  return segments;
}

function homeGroupResult(bundle: DistrictServed): CheckingGroupResult {
  const { sections } = bundle;
  const outward = bundle.outward;
  const segments: CheckingSegment[] = [];

  const sold = sections.soldPrices;
  if (sold.state !== "served") {
    segments.push({ text: SOLD_NOT_FILED_LINE, named: true });
  } else if (sold.median != null) {
    segments.push({
      text: `median sold price ${formatPounds(sold.median)} across ${count(sold.count)} ${plural(sold.count, "sale", "sales")}`,
      named: false,
    });
  } else if (sold.count > 0) {
    segments.push({
      text: `${count(sold.count)} recorded ${plural(sold.count, "sale", "sales")} across ${outward} — too few for a district median`,
      named: false,
    });
  } else {
    segments.push({ text: `no recorded sales across ${outward}`, named: false });
  }

  const tax = sections.councilTax;
  if (tax.councils.length > 0) {
    const parts = tax.councils.map(
      (council, index) =>
        `${index === 0 ? "council tax Band D " : ""}${formatDistrictPence(council.bandDAreaAveragePence)} in ${council.authorityName}`,
    );
    const joined =
      parts.length === 1
        ? parts[0]
        : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
    segments.push({ text: joined, named: false });
  }
  for (const name of tax.unfiledCouncils) {
    segments.push({ text: `${name} — its council tax charges are not filed yet.`, named: true });
  }
  if (tax.councils.length === 0 && tax.unfiledCouncils.length === 0) {
    segments.push({ text: COUNCIL_TAX_NOT_FILED_LINE, named: true });
  }

  // Connectivity is non-lead in the drawn finding: a
  // served answer is the results page's to carry; the
  // section's not-filed state names itself.
  const connectivity = sections.connectivity;
  if (connectivity.state !== "served" || connectivity.broadband == null) {
    segments.push({ text: BROADBAND_NOT_FILED_LINE, named: true });
  }

  segments.push(...floodSegments(sections.flood));

  if (segments.length === 0)
    return { state: "failed", line: rowFailureLine("Home, Costs & Risks") };
  return groupResult("HM Land Registry", segments);
}

// ------------------------------------------------------------------
// What's Nearby — the everyday section alone.
// ------------------------------------------------------------------

function nearbyGroupResult(bundle: DistrictServed): CheckingGroupResult {
  const everyday = bundle.sections.everyday;
  if (everyday.state !== "served") return { state: "unavailable", line: EVERYDAY_NOT_FILED_LINE };
  const segments: CheckingSegment[] = [
    {
      text:
        `${count(everyday.gp)} GP ${plural(everyday.gp, "practice", "practices")}, ` +
        `${count(everyday.dentists)} ${plural(everyday.dentists, "dentist", "dentists")} and ` +
        `${count(everyday.pharmacies)} ${plural(everyday.pharmacies, "pharmacy", "pharmacies")} ` +
        `across ${bundle.outward}`,
      named: false,
    },
  ];
  if (everyday.stations.length === 1) {
    segments.push({ text: `1 rail station, ${everyday.stations[0]}`, named: false });
  } else if (everyday.stations.length > 1) {
    segments.push({
      text:
        `${count(everyday.stations.length)} rail stations, from ${everyday.stations[0]} ` +
        `to ${everyday.stations[everyday.stations.length - 1]}`,
      named: false,
    });
  }
  return groupResult("NHS & local data", segments);
}

// ------------------------------------------------------------------
// The payload — the district bundle in, the checking
// screen's answer out. The API route serves this; the
// bundle itself never ships to the browser.
// ------------------------------------------------------------------

export type DistrictCheckingPayload =
  | {
      kind: "district";
      outward: string;
      // The stamp's place and the intro line's place:
      // the district head's own filed post town, and its
      // county where the district sits in exactly one.
      postTown: string | null;
      county: string | null;
      groups: Record<DistrictCheckingRowKey, CheckingGroupResult>;
    }
  | {
      kind: "not-covered";
      outward: string;
      nation: "scotland" | "northern-ireland";
    };

export function districtCheckingPayload(bundle: DistrictBundle): DistrictCheckingPayload {
  if (bundle.kind === "not-covered") {
    return { kind: "not-covered", outward: bundle.outward, nation: bundle.nation };
  }
  return {
    kind: "district",
    outward: bundle.outward,
    postTown: bundle.head.postTown,
    county: bundle.head.counties.length === 1 ? bundle.head.counties[0] : null,
    groups: {
      family: familyGroupResult(bundle),
      neighbourhood: neighbourhoodGroupResult(bundle),
      home: homeGroupResult(bundle),
      nearby: nearbyGroupResult(bundle),
    },
  };
}

// The outcomes when the payload request itself fails:
// every group completes failed with its named failure
// line, and the results still open (the home assembly's
// pattern, D44(5)(ii)).
export function districtCheckingFailureOutcomes(): Record<
  DistrictCheckingRowKey,
  CheckingGroupResult
> {
  return {
    family: { state: "failed", line: rowFailureLine("Family Checks") },
    neighbourhood: { state: "failed", line: rowFailureLine("The Neighbourhood") },
    home: { state: "failed", line: rowFailureLine("Home, Costs & Risks") },
    nearby: { state: "failed", line: rowFailureLine("What's Nearby") },
  };
}
