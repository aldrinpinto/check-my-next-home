import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  displayText,
  flatKeyOf,
  parsePaon,
  type AddressQueryable,
  type AddressResolution,
  type ResolvedAddress,
} from "./address";
import { DISTANCE_BASIS_LABEL, RADIUS_MILES } from "./nearby";

// Constraints & area bundle (plan step M6.6, decision D26).
//
// The brain's bundle for every dataset filed across M5 that has
// no brain step of its own: planning constraints, heritage,
// nature, the home's EPC, council tax, Census 2021, the IMD,
// air, noise, DWP benefits and solar — served as ONE bundle of
// per-dataset sections off M6.1's AddressResolution, so M6.7's
// short version can be DERIVED from it later as a projection,
// never as a second read of the tables. This step also closes
// M6.11's area-bundle half.
//
// The bundle's honesty problem is its three grains, so every
// section names its grain in its words and carries it as a
// structural field: facts about the HOME (its own certificates;
// a listed point at its point), facts about the POSTCODE POINT
// (constraint and designation polygons, listed buildings
// nearby, the air square, the solar cell), and facts about an
// AREA the home sits in (the MSOA's census counts, the LSOA's
// IMD decile and benefits counts, the billing authority's
// council tax scale, the postcode's noise bands). An area
// statistic is never worded as a claim about the home, the
// street or the people who live there.
//
// Depth is encoded in the bundle, not remembered by later
// steps: IMD, Census and benefits are report-only sections;
// constraints, heritage, nature, the home's EPC band line and
// the council-tax authority figure are headline-eligible, plus
// at most one air figure (NO2, labelled modelled) and the
// road-noise day band. projectHeadline below is the only
// headline path, and it cannot carry a report-only payload.
//
// The ladder contract (M6.1/D6, D26): rung 3 serves NO figures
// from any M6.6 dataset — the wider-area resolution holds no
// area codes and no point, so every section is present only as
// its named state. Rung 2 serves point facts and area facts
// exactly as at rung 1; home facts (the EPC section, the
// at-the-point listed line) serve the named state asking for
// the exact home. Rung 4 serves nothing.
//
// Absence is eleven different facts in this bundle, and each
// dataset keeps its own named state: not-covered (a nation the
// dataset does not publish for), not-published (Article 4
// behind its publication gate; council tax for an unfiled
// authority), not-filed (a table with no filing yet — noise
// and priority habitats until their M12 operator passes, the
// solar grid until its first pass), filed-and-empty (E16 1EG's
// zero certificates), filed-and-below-range (noise's "Below
// 55 dB"), and sparse coverage (council-supplied Welsh
// planning rows). A globally empty table can never impersonate
// a local absence: the noise, priority-habitat and solar
// sections sit behind filed-count guards in the source facts.

export const AREA_UNAVAILABLE_REASON = "area answers need an exact postcode";

const NEEDS_EXACT_HOME_EPC = "choose the exact home to see its energy certificates";
const NEEDS_EXACT_HOME_LISTED =
  "choose the exact home to check a listed building recorded at its point";

// ------------------------------------------------------------------
// Shared section shape
// ------------------------------------------------------------------

export type SectionDepth = "headline" | "report";
export type SectionGrain = "home" | "postcode point" | "area";

export interface AreaSectionMeta {
  depth: SectionDepth;
  // The grain, named in the section's own words: every served
  // line's subject is this grain, never a neighbouring one.
  grain: SectionGrain;
  grainLine: string;
  explainer: string;
  sourceName: string | null;
  // The dataset's own edition date as filed ("2026-10-21").
  sourceDate: string | null;
  sourceLine: string | null;
}

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

// "2026-09-01" -> "September 2026" (a benefits reference month).
function monthLabel(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function sourceLineOf(sourceName: string | null, sourceDate: string | null): string | null {
  return sourceName && sourceDate ? `${sourceName} — data to ${dateLabel(sourceDate)}` : null;
}

function round3(miles: number): number {
  return Math.round(miles * 1000) / 1000;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function formatPounds(pence: number): string {
  const pounds = Math.floor(pence / 100);
  const rest = pence - pounds * 100;
  return `£${pounds.toLocaleString("en-GB")}.${String(rest).padStart(2, "0")}`;
}

// ------------------------------------------------------------------
// Coverage — read from the resolution's own filed fact, the
// first letter of the directory's area code (lsoa_code — E…
// England, W… Wales, S… Scotland, N… Northern Ireland), never
// from outward postcode letters (the flood brain's detector,
// D25: outward areas straddle the Welsh border).
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

function nationName(nation: Nation): string {
  switch (nation) {
    case "wales":
      return "Wales";
    case "scotland":
      return "Scotland";
    case "northern-ireland":
      return "Northern Ireland";
    case "england":
      return "England";
    default:
      return "this part of the UK";
  }
}

// ------------------------------------------------------------------
// Filed-data shapes — the brain's read port. Tests drive a
// fake; createAreaSource below is the only database
// implementation. Geometry facts are measured on the serving
// basis (PostGIS geography miles from the filed shapes), the
// M6.5 pattern: the loaders' planar pins are filing artefacts
// and divergences from them are named in the golden matrix.
// ------------------------------------------------------------------

export type PlanningLayerKind =
  | "conservation_area"
  | "article_4_area"
  | "green_belt"
  | "scheduled_monument"
  | "sssi"
  | "sac"
  | "spa"
  | "ramsar"
  | "ancient_woodland";

export interface PlanningShapeRow {
  id: number;
  name: string | null;
  // The layer's filed detail: for an Article 4 area, the
  // removed-rights codes as published ("1A;1C;1D;1F;2A;2B");
  // for ancient woodland, which provisional inventory the
  // shape came from. Null where the layer files none.
  detail: string | null;
}

export interface PlanningNearestRow extends PlanningShapeRow {
  miles: number;
}

export interface PlanningLayerFacts {
  // The layer's filed shape count — absence is only ever
  // computed against a proven filing, so a layer with no
  // filing serves its not-filed state, never an absence.
  filedCount: number;
  covering: PlanningShapeRow[];
  // The single nearest named area within the serving radius,
  // or empty. (Listed buildings are the bundle's one list
  // answer; polygon layers serve the M6.2 single-nearest form.)
  nearestWithin: PlanningNearestRow[];
  // The single nearest area beyond the radius, read only when
  // nothing files within it.
  nearestBeyond: PlanningNearestRow | null;
  sourceName: string | null;
  sourceDate: string | null;
}

export type DesignationKind = "sssi" | "sac" | "spa" | "ramsar";

export interface DesignationFacts {
  byType: Record<DesignationKind, PlanningLayerFacts>;
  // Pairs of candidate row ids (covering ∪ nearest, across the
  // four designation types) whose filed shapes intersect —
  // the evidence the brain groups designations into places on.
  overlaps: [number, number][];
}

export interface ListedRow {
  listEntryId: string;
  name: string | null;
  grade: string;
  miles: number;
}

export interface ListedFacts {
  filedCount: number;
  // Every filed point within the serving radius, nearest
  // first — the brain serves the nearest three and the count.
  within: ListedRow[];
  nearestBeyond: ListedRow | null;
  sourceName: string | null;
  sourceDate: string | null;
}

export interface PhiFacts {
  // The layer's filed patch count. PHI's first national pass
  // is an M12 operator job; until it lands the table holds
  // nothing (production) or fixture cuts (test filings), and
  // an unfiled table must never print a present habitat as
  // absent — Hilgay's nearest filed habitat is 0.123 miles.
  filedCount: number;
  nearest: { habitat: string; miles: number } | null;
  // The distinct habitat labels filed within the radius,
  // alphabetical. Patch counts are never served: they reflect
  // mapping granularity, not habitat.
  typesWithin: string[];
  sourceName: string | null;
  sourceDate: string | null;
}

// One certificate as filed in the postcode's cached answers
// (the M4.5 loader's minimised artefact). The artefact carries
// NO solar fields — the loader's minimisation drops the
// register's photovoltaic / solar-water-heating fields at
// load — so no EPC solar fact can serve from what is filed;
// the optional fields below exist so a future filing that
// keeps them serves without a brain change.
export interface EpcCertificate {
  certificateNumber: string;
  addressLine1: string | null;
  addressLine2: string | null;
  addressLine3: string | null;
  postTown: string | null;
  postcode: string;
  uprn: string | null;
  band: string | null;
  ratingCurrent: number | null;
  potentialBand: string | null;
  totalFloorArea: number | null;
  dwellingType: string | null;
  assessmentType: string | null;
  registrationDate: string | null;
  photovoltaicSupply?: string | null;
  hasSolarPanel?: boolean | null;
  solarWaterHeating?: string | null;
}

export interface EpcArtefact {
  certificates: EpcCertificate[];
  certificateCount: number;
  sourceName: string;
  sourceDate: string;
  loadedAt: string;
}

export interface CouncilTaxFacts {
  authorityName: string;
  nation: "england" | "wales";
  taxYear: string;
  bandDAreaAveragePence: number;
  parishAveraged: boolean;
  // The filed components, in the table's own order, nulls
  // already dropped by the source. Labels are the tier roles —
  // the filed data names no individual body beyond the
  // billing authority itself.
  components: { role: string; label: string; pence: number }[];
  sourceName: string | null;
  sourceDate: string | null;
}

export interface CensusFacts {
  msoaCode: string;
  msoaName: string;
  // The filed fragments, one per published table, integer
  // counts exactly as ONS published them. Narrowed by the
  // brain against the loader's fragment contract.
  stats: Record<string, unknown>;
  sourceName: string | null;
  sourceDate: string | null;
}

export interface ImdFacts {
  lsoaCode: string;
  lsoaName: string;
  decile: number;
  // The summary AS FILED — rendered once by the loader from
  // the decile in the Final Design's words. The brain serves
  // the filed string and never re-renders: one rendering of
  // the ruled words exists in the codebase, and a second
  // could drift from it. (Pinned by test against the loader's
  // own renderer for every decile.)
  summary: string;
  domains: Record<string, number>;
  sourceName: string | null;
  sourceDate: string | null;
  // The score and rank are filed data, not figures: the
  // source port does not carry them, so no served shape can.
}

export interface AirFacts {
  year: number;
  no2: number;
  pm25: number;
  pm10: number;
  sourceName: string | null;
  sourceDate: string | null;
}

export interface NoiseFacts {
  // The table's filed row count — the guard. Noise's first
  // national pass is an M12 operator job; until it lands the
  // table holds fixture rows only in test filings and nothing
  // in production, and "No modelled road noise" (a real filed
  // state) must never be printed from an unfiled table.
  filedCount: number;
  rows: { sourceKind: string; dayBand: string | null; nightBand: string | null }[];
  sourceName: string | null;
  sourceDate: string | null;
}

export interface BenefitsSeriesFacts {
  month: string;
  count: number;
  // The Claimant Count's published percentage of the working-
  // age population; null where Nomis suppresses it (the
  // underlying count is 1 or 2). Never back-calculated.
  pct: number | null;
  sourceName: string | null;
  sourceDate: string | null;
}

export interface BenefitsFacts {
  claimantCount: BenefitsSeriesFacts | null;
  ucPeople: BenefitsSeriesFacts | null;
  ucHouseholds: BenefitsSeriesFacts | null;
  bases: { residents: number; households: number } | null;
}

export interface SolarCellFacts {
  cellRef: string;
  yieldKwhPerKwp: number;
  irradiationKwhM2: number;
  peakPowerKwp: number;
  systemLossPct: number;
  slopeDeg: number;
  azimuthDeg: number;
  mounting: string;
  pvTechnology: string;
  radiationDb: string;
  yearMin: number;
  yearMax: number;
  sourceName: string | null;
  sourceDate: string | null;
}

export interface SolarFacts {
  // The grid's filed cell count — the guard. The grid files
  // at M12's first pass; an empty grid serves the not-filed
  // state, never a zero yield.
  gridFiledCount: number;
  cell: SolarCellFacts | null;
}

export interface AreaDataSource {
  planningLayerFacts(
    layer: PlanningLayerKind,
    latitude: number,
    longitude: number,
  ): Promise<PlanningLayerFacts>;
  designationFacts(latitude: number, longitude: number): Promise<DesignationFacts>;
  listedFacts(latitude: number, longitude: number): Promise<ListedFacts>;
  phiFacts(latitude: number, longitude: number): Promise<PhiFacts>;
  // Whether the postcode's council is positively recorded in
  // the Article 4 publication gate (migration 0007). "None
  // found" may be served only on a positive answer.
  article4Gate(council: string | null): Promise<boolean>;
  // The postcode's filed EPC artefact, or null when the check
  // has never loaded the postcode's certificates.
  epcArtefact(postcode: string): Promise<EpcArtefact | null>;
  // Load the postcode's certificates through the existing
  // loader path (loaders/load-epc.mjs), the D23 pattern.
  loadEpc(postcode: string): Promise<void>;
  // The latest filed tax year's row for the billing authority
  // the directory names, or null — an unfiled authority and a
  // name that joins to nothing both land here, and both serve
  // the named not-published state, never a borrowed figure.
  councilTaxRow(council: string | null): Promise<CouncilTaxFacts | null>;
  censusRow(msoaCode: string): Promise<CensusFacts | null>;
  imdRow(lsoaCode: string): Promise<ImdFacts | null>;
  airSquare(latitude: number, longitude: number): Promise<AirFacts | null>;
  noiseRows(postcode: string): Promise<NoiseFacts>;
  benefits(lsoaCode: string): Promise<BenefitsFacts>;
  solarCell(cellRef: string): Promise<SolarFacts>;
}

// ------------------------------------------------------------------
// Polygon layers — the shared serving shape for conservation
// areas, Article 4 areas, green belt and scheduled monuments:
// the inside fact when the point falls inside, else the single
// nearest named area within the serving radius, else the
// beyond form (the M6.2 pattern). What differs per layer is
// the absence: each dataset's absence is its own named fact,
// chosen by the caller, never one shared "none" line.
// ------------------------------------------------------------------

export type PolygonAbsence = "none-found" | "not-published" | "sparse-coverage";

export interface PolygonLayerAnswer {
  layer: PlanningLayerKind;
  label: string;
  state: "inside" | PolygonAbsence | "not-filed";
  // The primary sentence — always about the postcode point on
  // the published map, or the layer's named absence.
  line: string;
  insideName: string | null;
  insideDetail: string | null;
  nearest: { name: string | null; miles: number } | null;
  beyondNearest: { name: string | null; miles: number } | null;
  beyondLine: string | null;
  sourceName: string | null;
  sourceDate: string | null;
  sourceLine: string | null;
}

interface PolygonSpec {
  layer: PlanningLayerKind;
  label: string;
  // Display name for an unnamed filed shape of this layer.
  unnamedName: string;
  insideLine: (name: string) => string;
  absenceLine: (absence: PolygonAbsence, facts: PlanningLayerFacts) => string;
}

function shapeName(row: PlanningShapeRow, unnamedName: string): string {
  return row.name ?? unnamedName;
}

function buildPolygonLayer(
  spec: PolygonSpec,
  facts: PlanningLayerFacts,
  absence: PolygonAbsence,
): PolygonLayerAnswer {
  const base: PolygonLayerAnswer = {
    layer: spec.layer,
    label: spec.label,
    state: "not-filed",
    line: "",
    insideName: null,
    insideDetail: null,
    nearest: null,
    beyondNearest: null,
    beyondLine: null,
    sourceName: facts.sourceName,
    sourceDate: facts.sourceDate,
    sourceLine: sourceLineOf(facts.sourceName, facts.sourceDate),
  };

  // No filing, no answer: an empty layer can prove nothing,
  // so its absence wordings are never served from it.
  if (facts.filedCount <= 0) {
    return { ...base, line: `the ${spec.label.toLowerCase()} data is not filed yet` };
  }

  const covering = facts.covering[0] ?? null;
  if (covering) {
    const name = shapeName(covering, spec.unnamedName);
    return {
      ...base,
      state: "inside",
      line: spec.insideLine(name),
      insideName: name,
      insideDetail: covering.detail,
    };
  }

  const nearestRow = facts.nearestWithin[0] ?? null;
  const answer: PolygonLayerAnswer = {
    ...base,
    state: absence,
    line: spec.absenceLine(absence, facts),
    nearest: nearestRow
      ? { name: shapeName(nearestRow, spec.unnamedName), miles: round3(nearestRow.miles) }
      : null,
  };
  if (!nearestRow && facts.nearestBeyond) {
    const beyond = facts.nearestBeyond;
    const name = shapeName(beyond, spec.unnamedName);
    const miles = round3(beyond.miles);
    answer.beyondNearest = { name, miles };
    answer.beyondLine = `none within ${RADIUS_MILES} miles — the nearest is ${name}, ${miles} miles away (${DISTANCE_BASIS_LABEL})`;
  }
  return answer;
}

// ------------------------------------------------------------------
// Article 4 removed rights — the direction's codes are the
// publisher's shorthand for the permitted-development rights
// it removes (the GPDO Schedule 2 part and class). At report
// depth the codes are translated into plain words from this
// table; at headline depth the codes serve as filed. A code
// the table does not hold serves untranslated — a
// mistranslated right would be a wrong legal fact, so the
// table covers the dwellinghouse and minor-operations classes
// directions commonly remove, and nothing it cannot state
// plainly and correctly.
// ------------------------------------------------------------------

const ARTICLE4_PART_WORDS: Record<string, string> = {
  "1": "development within the curtilage of a dwellinghouse",
  "2": "minor operations",
  "3": "changes of use",
  "4": "temporary buildings and uses",
};

const ARTICLE4_CLASS_WORDS: Record<string, string> = {
  "1A": "extensions and other alterations to a house",
  "1B": "additions or alterations to a roof",
  "1C": "other alterations to a roof",
  "1D": "porches",
  "1E": "outbuildings and other structures in the garden",
  "1F": "hard surfaces, such as driveways and patios",
  "1G": "chimneys and flues",
  "1H": "satellite dishes",
  "2A": "gates, fences and walls",
  "2B": "a new or altered access to a road",
  "2C": "painting the outside of a building",
  "4A": "temporary buildings and structures",
  "4B": "the temporary use of land",
};

export interface Article4Right {
  code: string;
  // The plain words, or null when the table holds no
  // translation for this code — the code itself still serves.
  words: string | null;
}

export function translateArticle4Codes(detail: string | null): Article4Right[] {
  if (!detail) return [];
  return detail
    .split(";")
    .map((code) => code.trim())
    .filter(Boolean)
    .map((code) => {
      // Some directions file prose instead of codes (the
      // Kingston town-centre direction's detail is a whole
      // sentence). Prose is already plain words: it serves
      // as its own translation, never dressed up as a code
      // with a missing one.
      if (!/^\d+[A-Z]+$/.test(code)) return { code, words: code };
      const words = ARTICLE4_CLASS_WORDS[code];
      if (words) return { code, words };
      const part = /^(\d+)[A-Z]$/.exec(code)?.[1];
      const partWords = part ? ARTICLE4_PART_WORDS[part] : undefined;
      return {
        code,
        words:
          partWords && part ? `${partWords} (Part ${part} Class ${code.slice(part.length)})` : null,
      };
    });
}

// ------------------------------------------------------------------
// Constraints — conservation areas, Article 4 areas, green
// belt. One section, three datasets, three absences:
//   - Conservation areas are council-supplied and the
//     national file is incomplete (~9% of areas file no
//     geometry), so an English absence is worded as a finding
//     about the national data with its check date, and a
//     Welsh or Scottish absence is a coverage state, never a
//     proven none (Cardiff's empty 2 miles is sparse
//     coverage, not a finding).
//   - Article 4 absence is gated: "none found" only for a
//     council positively recorded in the publication gate;
//     everywhere else the state is "not published by the
//     council" — permanently for Newham, which has a
//     borough-wide direction in law the data cannot see.
//   - Green belt absence IS trustworthy (MHCLG compiles
//     every authority), so it serves as a plain none-found.
// ------------------------------------------------------------------

export interface Article4Answer extends PolygonLayerAnswer {
  // The removed-rights codes as filed, and their plain words
  // (report depth). Both null unless the point is inside.
  codes: string[] | null;
  rights: Article4Right[] | null;
  // Whether the postcode's council is positively recorded in
  // the publication gate — the evidence the absence state
  // rests on, served with the answer.
  councilPublishes: boolean;
}

export interface ConstraintsSection extends AreaSectionMeta {
  state: "served";
  conservationArea: PolygonLayerAnswer;
  article4: Article4Answer;
  greenBelt: PolygonLayerAnswer;
}

const CONSERVATION_AREA_SPEC: PolygonSpec = {
  layer: "conservation_area",
  label: "Conservation area",
  unnamedName: "an unnamed conservation area",
  insideLine: (name) => `the postcode point falls inside the ${name} conservation area`,
  absenceLine: (absence, facts) =>
    absence === "sparse-coverage"
      ? "no conservation area is filed near this point — conservation areas are supplied by councils and coverage here is sparse, so this is not a proven none"
      : `no conservation area found in the national data, checked ${facts.sourceDate ? dateLabel(facts.sourceDate) : "at the last filing"}`,
};

const ARTICLE4_SPEC: PolygonSpec = {
  layer: "article_4_area",
  label: "Article 4 direction area",
  unnamedName: "an unnamed Article 4 direction area",
  insideLine: (name) =>
    `the postcode point falls inside the ${name} Article 4 direction area — a direction that removes some permitted development rights`,
  absenceLine: (absence) =>
    absence === "not-published"
      ? "Article 4 directions are not published by this council to the national dataset, so no finding can be made from the data"
      : "no Article 4 direction area covers this postcode point in the national data",
};

const GREEN_BELT_SPEC: PolygonSpec = {
  layer: "green_belt",
  label: "Green belt",
  unnamedName: "an unnamed green belt",
  // The belt's own filed name ("London"), never the
  // district's — a district can hold several belts' edges.
  insideLine: (name) => `the postcode point falls inside the ${name} green belt`,
  absenceLine: (absence) =>
    absence === "sparse-coverage"
      ? "the green belt data filed covers England and Wales, and no green belt is filed near this point"
      : "the postcode point is not in a green belt in the national data",
};

function buildConstraints(
  resolution: Extract<AddressResolution, { rung: 1 | 2 }>,
  factsByLayer: Record<string, PlanningLayerFacts>,
  article4Publishes: boolean,
  nation: Nation,
): ConstraintsSection {
  const caAbsence: PolygonAbsence = nation === "england" ? "none-found" : "sparse-coverage";
  const conservationArea = buildPolygonLayer(
    CONSERVATION_AREA_SPEC,
    factsByLayer.conservation_area,
    caAbsence,
  );

  const a4Base = buildPolygonLayer(
    ARTICLE4_SPEC,
    factsByLayer.article_4_area,
    article4Publishes ? "none-found" : "not-published",
  );
  const inside = a4Base.state === "inside";
  const article4: Article4Answer = {
    ...a4Base,
    codes: inside
      ? (a4Base.insideDetail ?? "")
          .split(";")
          .map((c) => c.trim())
          .filter(Boolean)
      : null,
    rights: inside ? translateArticle4Codes(a4Base.insideDetail) : null,
    councilPublishes: article4Publishes,
  };

  const greenBelt = buildPolygonLayer(
    GREEN_BELT_SPEC,
    factsByLayer.green_belt,
    // The platform's green-belt dataset is England's; Wales
    // designates its own belts, which are not filed — so a
    // Welsh absence is sparse coverage, never a proven none.
    // (An English absence IS trustworthy: the belt dataset
    // is a single national designation layer.)
    nation === "england" ? "none-found" : "sparse-coverage",
  );

  return {
    depth: "headline",
    grain: "postcode point",
    grainLine: "facts about the postcode point on the published maps",
    explainer:
      "Planning designations are mapped against the postcode point, not the plot: at a boundary the point and the plot can fall either side, and the council's own map decides borderline cases.",
    sourceName: null,
    sourceDate: null,
    sourceLine: null,
    state: "served",
    conservationArea,
    article4,
    greenBelt,
  };
}

// ------------------------------------------------------------------
// Heritage — listed buildings as named, graded, distanced
// points (nearest three plus the count within the radius),
// and scheduled monuments as a polygon layer. No source
// publishes a listed building's address, so a building is
// identified by name, grade and NHLE number — and never as
// "your home is listed": a listed point AT the postcode point
// adds the check line at rung 1 only, because which building
// at the point is the home is a home fact.
// ------------------------------------------------------------------

export interface ListedPlace {
  listEntryId: string;
  name: string | null;
  grade: string;
  miles: number;
}

export type ListedAtPoint =
  | { state: "recorded"; place: ListedPlace; line: string }
  | { state: "none" }
  | { state: "needs-exact-home"; reason: string };

export interface HeritageSection extends AreaSectionMeta {
  state: "served";
  listed: {
    state: "served" | "not-filed" | "sparse-coverage";
    within: ListedPlace[];
    countWithin: number | null;
    beyondNearest: ListedPlace | null;
    beyondLine: string | null;
    line: string;
  };
  atPoint: ListedAtPoint;
  monuments: PolygonLayerAnswer;
  localListsLine: string;
}

// A listed point this close to the postcode point is recorded
// AT the point for the check line's purposes: C4's point is
// the listed Market House (0.000 miles) and C3's SAWYERS sits
// 0.008 miles (about 13 metres) away — both are matches to
// check against the NHLE entry, not verdicts.
export const LISTED_AT_POINT_MAX_MILES = 0.01;

const MONUMENT_SPEC: PolygonSpec = {
  layer: "scheduled_monument",
  label: "Scheduled monument",
  unnamedName: "an unnamed scheduled monument",
  insideLine: (name) => `the postcode point falls inside the ${name} scheduled monument`,
  absenceLine: (absence) =>
    absence === "sparse-coverage"
      ? "the scheduled monuments filed cover England, and none is filed near this point"
      : "no scheduled monument covers this postcode point in the national data",
};

function toListedPlace(row: ListedRow): ListedPlace {
  return {
    listEntryId: row.listEntryId,
    name: row.name,
    grade: row.grade,
    miles: round3(row.miles),
  };
}

function buildHeritage(
  resolution: Extract<AddressResolution, { rung: 1 | 2 }>,
  listed: ListedFacts,
  monumentFacts: PlanningLayerFacts,
  nation: Nation,
): HeritageSection {
  // The filed list is the National Heritage List for
  // England. Listed buildings elsewhere in the UK sit on
  // their own registers (Cadw, Historic Environment
  // Scotland), which are not filed — so for a non-English
  // point the section serves sparse coverage and NO count:
  // a Welsh "0 within 2 miles" would be a false figure.
  const covered = nation === "england";
  const within = covered ? listed.within.slice(0, 3).map(toListedPlace) : [];
  const countWithin: number | null = covered ? listed.within.length : null;
  let beyondNearest: ListedPlace | null = null;
  let beyondLine: string | null = null;
  if (covered && countWithin === 0 && listed.nearestBeyond) {
    beyondNearest = toListedPlace(listed.nearestBeyond);
    beyondLine = `none within ${RADIUS_MILES} miles — the nearest listed building is ${beyondNearest.name ?? "an unnamed listed building"} (grade ${beyondNearest.grade}), ${beyondNearest.miles} miles away (${DISTANCE_BASIS_LABEL})`;
  }

  let atPoint: ListedAtPoint;
  const nearest = covered ? (listed.within[0] ?? null) : null;
  if (resolution.rung === 2) {
    atPoint = { state: "needs-exact-home", reason: NEEDS_EXACT_HOME_LISTED };
  } else if (nearest && nearest.miles <= LISTED_AT_POINT_MAX_MILES) {
    const place = toListedPlace(nearest);
    atPoint = {
      state: "recorded",
      place,
      line: `a listed building is recorded at this postcode point: ${place.name ?? "an unnamed listed building"}, grade ${place.grade} (NHLE ${place.listEntryId}) — check the NHLE entry to confirm it is this building`,
    };
  } else {
    atPoint = { state: "none" };
  }

  return {
    depth: "headline",
    grain: "postcode point",
    grainLine: "listed buildings and monuments recorded around the postcode point",
    explainer:
      "Listed buildings are recorded as points with a name, a grade and an NHLE number — no source publishes a listed building's address, so a nearby point is a match to check, not a finding about a specific home.",
    sourceName: listed.sourceName,
    sourceDate: listed.sourceDate,
    sourceLine: sourceLineOf(listed.sourceName, listed.sourceDate),
    state: "served",
    listed: {
      state: listed.filedCount <= 0 ? "not-filed" : covered ? "served" : "sparse-coverage",
      within,
      countWithin,
      beyondNearest,
      beyondLine,
      line:
        listed.filedCount <= 0
          ? "the listed buildings data is not filed yet"
          : !covered
            ? `the listed buildings filed are England's National Heritage List — listed buildings in ${nationName(nation)} sit on their own register, which is not filed, so no count can be given for this point`
            : countWithin !== null && countWithin > 0
              ? `${countWithin} listed building${countWithin === 1 ? "" : "s"} within ${RADIUS_MILES} miles of the postcode point`
              : `no listed buildings within ${RADIUS_MILES} miles of the postcode point`,
    },
    atPoint,
    monuments: buildPolygonLayer(
      MONUMENT_SPEC,
      monumentFacts,
      nation === "england" ? "none-found" : "sparse-coverage",
    ),
    localListsLine:
      "buildings on councils' local lists are not included — local lists are held by each council and are not part of the national data",
  };
}

// ------------------------------------------------------------------
// Nature — the statutory designations grouped BY PLACE: one
// entry per site with its designations named together
// ("Blackwater Estuary — SSSI · SPA · Ramsar · part of Essex
// Estuaries SAC"), never stacked as if they were separate
// protections over the same ground. A place counts once per
// designation it actually holds. Grouping evidence is the
// filed shapes themselves: candidates (the covering shapes
// and each type's nearest) are unioned when their shapes
// intersect or they carry the same published name.
// Ancient woodland is two provisional inventories merged
// under Natural England's precedence — its absence is "no
// ancient woodland recorded in the inventory", never "there
// is none". SSSI condition is not filed and never served.
// Priority habitats serve aggregated behind their guard.
// ------------------------------------------------------------------

export interface NatureDesignation {
  type: DesignationKind;
  typeLabel: string;
  name: string | null;
  // True when this designation's published name differs from
  // the place's name — it renders as "part of <name> <type>".
  partOf: boolean;
  inside: boolean;
  miles: number;
}

export interface NaturePlace {
  name: string | null;
  inside: boolean;
  miles: number;
  designations: NatureDesignation[];
  line: string;
}

export type PriorityHabitatAnswer =
  | { state: "not-filed"; line: string }
  | {
      state: "served";
      nearest: { habitat: string; miles: number } | null;
      typesWithin: string[];
      line: string;
      sourceName: string | null;
      sourceDate: string | null;
      sourceLine: string | null;
    };

export interface NatureSection extends AreaSectionMeta {
  state: "served";
  // Set when the point is outside England: the designations
  // are GB-wide registers but the filed shapes come from
  // Natural England's England services, so an absence there
  // is a coverage fact, worded as one.
  coverageLine: string | null;
  places: NaturePlace[];
  placesWithinCount: number;
  beyondPlace: NaturePlace | null;
  beyondLine: string | null;
  placesLine: string;
  ancientWoodland: PolygonLayerAnswer;
  priorityHabitat: PriorityHabitatAnswer;
}

const DESIGNATION_LABELS: Record<DesignationKind, string> = {
  sssi: "SSSI",
  sac: "SAC",
  spa: "SPA",
  ramsar: "Ramsar",
};

const DESIGNATION_ORDER: DesignationKind[] = ["sssi", "sac", "spa", "ramsar"];

interface DesignationCandidate extends PlanningNearestRow {
  type: DesignationKind;
  inside: boolean;
}

function groupDesignations(facts: DesignationFacts): {
  within: NaturePlace[];
  beyond: NaturePlace | null;
} {
  const candidates: DesignationCandidate[] = [];
  (Object.keys(DESIGNATION_LABELS) as DesignationKind[]).forEach((type) => {
    const layer = facts.byType[type];
    for (const row of layer.covering) candidates.push({ ...row, miles: 0, type, inside: true });
    for (const row of layer.nearestWithin)
      if (!candidates.some((c) => c.id === row.id))
        candidates.push({ ...row, type, inside: false });
    const beyond = layer.nearestBeyond;
    if (beyond && !candidates.some((c) => c.id === beyond.id))
      candidates.push({ ...beyond, type, inside: false });
  });
  if (candidates.length === 0) return { within: [], beyond: null };

  // Union-find over shape intersection and shared names.
  const parent = new Map<number, number>(candidates.map((c) => [c.id, c.id]));
  const find = (id: number): number => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) as number;
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const [a, b] of facts.overlaps) if (parent.has(a) && parent.has(b)) union(a, b);
  for (let i = 0; i < candidates.length; i += 1)
    for (let j = i + 1; j < candidates.length; j += 1)
      if (candidates[i].name && candidates[i].name === candidates[j].name)
        union(candidates[i].id, candidates[j].id);

  const groups = new Map<number, DesignationCandidate[]>();
  for (const c of candidates) {
    const root = find(c.id);
    groups.set(root, [...(groups.get(root) ?? []), c]);
  }

  const places: NaturePlace[] = [...groups.values()].map((members) => {
    // The place's name: the name most of its designations
    // share; ties break to an SSSI's name, then the nearest
    // member's.
    const nameCounts = new Map<string, number>();
    for (const m of members) if (m.name) nameCounts.set(m.name, (nameCounts.get(m.name) ?? 0) + 1);
    const byName = [...nameCounts.entries()].sort((a, b) => b[1] - a[1]);
    let placeName: string | null = byName[0]?.[0] ?? null;
    if (byName.length > 1 && byName[0][1] === byName[1][1]) {
      const sssi = members.find((m) => m.type === "sssi" && m.name);
      if (sssi?.name) placeName = sssi.name;
    }
    const designations: NatureDesignation[] = members
      .map((m) => ({
        type: m.type,
        typeLabel: DESIGNATION_LABELS[m.type],
        name: m.name,
        partOf: m.name !== null && placeName !== null && m.name !== placeName,
        inside: m.inside,
        miles: round3(m.miles),
      }))
      // The place's own designations first, in register
      // order; a designation held under a different site's
      // name ("part of …") renders last — the prep's ruled
      // form: "Blackwater Estuary — SSSI · SPA · Ramsar ·
      // part of Essex Estuaries SAC".
      .sort(
        (a, b) =>
          Number(a.partOf) - Number(b.partOf) ||
          DESIGNATION_ORDER.indexOf(a.type) - DESIGNATION_ORDER.indexOf(b.type),
      );
    const inside = members.some((m) => m.inside);
    const miles = round3(Math.min(...members.map((m) => m.miles)));
    const rendered = designations
      .map((d) => {
        if (!d.partOf) return d.typeLabel;
        // A filed name may already carry its designation
        // ("Knight & Bessborough Reservoirs SSSI") — never
        // print the label twice.
        const name = d.name ?? "";
        return `part of ${name.endsWith(d.typeLabel) ? name : `${name} ${d.typeLabel}`}`;
      })
      .join(" · ");
    return {
      name: placeName,
      inside,
      miles,
      designations,
      line: `${placeName ?? "an unnamed site"} — ${rendered}`,
    };
  });

  places.sort(
    (a, b) =>
      Number(b.inside) - Number(a.inside) || a.miles - b.miles || a.line.localeCompare(b.line),
  );
  const within = places.filter((p) => p.inside || p.miles <= RADIUS_MILES);
  const beyond = within.length === 0 ? (places[0] ?? null) : null;
  return { within, beyond };
}

const ANCIENT_WOODLAND_SPEC: PolygonSpec = {
  layer: "ancient_woodland",
  label: "Ancient woodland",
  unnamedName: "Unnamed woodland (Ancient Woodland Inventory)",
  insideLine: (name) =>
    `the postcode point falls inside ${name}, recorded in the Ancient Woodland Inventory`,
  absenceLine: (absence) =>
    absence === "sparse-coverage"
      ? "the ancient woodland inventory filed covers England, and no woodland in it is filed near this point"
      : "no ancient woodland recorded in the inventory near this postcode point",
};

export const ANCIENT_WOODLAND_INVENTORY_LINE =
  "the Ancient Woodland Inventory is a provisional inventory, being revised county by county — small woods can be missing from it";

function buildNature(
  designationFacts: DesignationFacts,
  woodlandFacts: PlanningLayerFacts,
  phi: PhiFacts,
  nation: Nation,
): NatureSection {
  const { within, beyond } = groupDesignations(designationFacts);
  const coverageLine =
    nation === "england"
      ? null
      : `the nature designations filed come from Natural England's England services, so an absence in ${nationName(nation)} is a coverage fact, not a finding`;

  const priorityHabitat: PriorityHabitatAnswer =
    phi.filedCount <= 0
      ? {
          state: "not-filed",
          line: "priority habitat records are not yet filed, so no habitat answer can be given yet",
        }
      : {
          state: "served",
          nearest: phi.nearest
            ? { habitat: phi.nearest.habitat, miles: round3(phi.nearest.miles) }
            : null,
          typesWithin: phi.typesWithin,
          line: phi.nearest
            ? round3(phi.nearest.miles) === 0
              ? `priority habitat recorded at this postcode point: ${phi.nearest.habitat} (${DISTANCE_BASIS_LABEL})`
              : `nearest recorded priority habitat: ${phi.nearest.habitat}, ${round3(phi.nearest.miles)} miles away (${DISTANCE_BASIS_LABEL})`
            : "no priority habitat is recorded near this postcode point",
          sourceName: phi.sourceName,
          sourceDate: phi.sourceDate,
          sourceLine: sourceLineOf(phi.sourceName, phi.sourceDate),
        };

  const firstType = designationFacts.byType.sssi;
  return {
    depth: "headline",
    grain: "postcode point",
    grainLine: "designated sites and recorded habitats around the postcode point",
    explainer:
      "Designations are grouped by place: one site can carry several designations over the same ground, and they are named together so the stack reads as one place, not several.",
    sourceName: firstType.sourceName,
    sourceDate: firstType.sourceDate,
    sourceLine: sourceLineOf(firstType.sourceName, firstType.sourceDate),
    state: "served",
    coverageLine,
    places: within,
    placesWithinCount: within.length,
    beyondPlace: beyond,
    beyondLine: beyond
      ? `no designated site within ${RADIUS_MILES} miles — the nearest is ${beyond.line}, ${beyond.miles} miles away (${DISTANCE_BASIS_LABEL})`
      : null,
    placesLine:
      within.length > 0
        ? `${within.length} designated site${within.length === 1 ? "" : "s"} at or within ${RADIUS_MILES} miles of the postcode point`
        : `no designated site at or within ${RADIUS_MILES} miles of the postcode point`,
    ancientWoodland: buildPolygonLayer(
      ANCIENT_WOODLAND_SPEC,
      woodlandFacts,
      nation === "england" ? "none-found" : "sparse-coverage",
    ),
    priorityHabitat,
  };
}

// ------------------------------------------------------------------
// The home's EPC — every certificate the register holds for
// the home, newest first, disagreements served whole and
// unranked (6 Exeter Road holds two band B certificates,
// 71 sq m from 2013 and 91 sq m from 2023; the disagreement
// is itself the fact). Matching is address-text matching
// against the resolved address: the register's certificates
// carry address text, not address parts. A flat matches on
// building name + flat number TOGETHER (the M6.1 flat rule)
// — Flat 4 exists in Minerva House, Jupiter House and Juno
// House alike, and only the building separates them.
// SAP certificates are labelled predicted wherever they
// appear (D7) — a modelled rating for a new-build home,
// never a bare fact.
// ------------------------------------------------------------------

export interface ServedCertificate {
  certificateNumber: string;
  address: string;
  band: string | null;
  rating: number | null;
  potentialBand: string | null;
  floorAreaSqM: number | null;
  dwellingType: string | null;
  assessmentType: string | null;
  // A SAP assessment is a prediction made for a new-build
  // home; an RdSAP assessment measures an existing one.
  predicted: boolean;
  assessmentLabel: string;
  registrationDate: string | null;
  // Solar facts recorded on the certificate, in the
  // register's own terms. The filed artefact carries none
  // today (see EpcCertificate), so this serves empty.
  solarFacts: string[];
}

export interface EpcSection extends AreaSectionMeta {
  state: "served" | "not-filed" | "filed-zero" | "none-matching" | "needs-exact-home";
  line: string | null;
  certificates: ServedCertificate[];
  // How many certificates the register holds at the whole
  // postcode — context for the none-matching state. The
  // postcode-wide spread itself is M6.15's, not this step's.
  certificateCountAtPostcode: number | null;
  // The newest matched certificate's band — the headline line.
  headlineBand: string | null;
}

// Matching normal form — the house tool's own convention
// (lib/address.ts): upper case, punctuation becomes spaces.
function normText(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function textContains(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${phrase} `);
}

function certificateText(cert: EpcCertificate): string {
  return normText(
    [cert.addressLine1 ?? "", cert.addressLine2 ?? "", cert.addressLine3 ?? ""].join(" "),
  );
}

function certificateFlatKey(cert: EpcCertificate): string | null {
  const match = /\b(?:FLAT|APARTMENT|APT|UNIT) ([0-9]+[A-Z]?)\b/.exec(certificateText(cert));
  return match ? match[1] : null;
}

// Does this filed certificate belong to this resolved home?
export function certificateMatchesHome(cert: EpcCertificate, home: ResolvedAddress): boolean {
  const text = certificateText(cert);
  const homeFlat = flatKeyOf(home.saon);
  const certFlat = certificateFlatKey(cert);
  // A flat's certificate is never a house's, and a house's is
  // never a flat's — the flat keys must agree exactly.
  if ((homeFlat ?? null) !== (certFlat ?? null)) return false;

  const paon = parsePaon(home.paon);
  if (homeFlat) {
    // The flat rule: building + flat together. The register
    // addresses these flats "Flat 4 Minerva House" with the
    // street on the next line, so the building name must be
    // in the certificate's text; a building identified only
    // by its street number must show number + street.
    if (paon.name) return textContains(text, paon.name);
    if (paon.number && home.street)
      return textContains(text, paon.number) && textContains(text, normText(home.street));
    return false;
  }

  // Houses: the house's number (or name) on its street.
  if (paon.number && home.street)
    return textContains(text, paon.number) && textContains(text, normText(home.street));
  if (paon.name) return textContains(text, paon.name);
  return false;
}

function toServedCertificate(cert: EpcCertificate): ServedCertificate {
  const predicted = (cert.assessmentType ?? "").toUpperCase() === "SAP";
  const solarFacts: string[] = [];
  if (cert.hasSolarPanel === true) solarFacts.push("solar panels recorded on the certificate");
  if (cert.photovoltaicSupply)
    solarFacts.push(`photovoltaic supply recorded on the certificate: ${cert.photovoltaicSupply}`);
  if (cert.solarWaterHeating)
    solarFacts.push(`solar water heating recorded on the certificate: ${cert.solarWaterHeating}`);
  const address = [cert.addressLine1, cert.addressLine2]
    .filter((line): line is string => Boolean(line))
    .map((line) => displayText(line.replace(/,\s*$/, "")))
    .join(", ");
  return {
    certificateNumber: cert.certificateNumber,
    address,
    band: cert.band,
    rating: cert.ratingCurrent,
    potentialBand: cert.potentialBand,
    floorAreaSqM: cert.totalFloorArea,
    dwellingType: cert.dwellingType,
    assessmentType: cert.assessmentType,
    predicted,
    assessmentLabel: predicted
      ? "predicted — a SAP assessment, the assessor's model made for a new-build home"
      : "an assessment of the existing home",
    registrationDate: cert.registrationDate,
    solarFacts,
  };
}

async function buildEpc(
  resolution: Extract<AddressResolution, { rung: 1 | 2 }>,
  source: AreaDataSource,
): Promise<EpcSection> {
  const meta = {
    depth: "headline" as const,
    grain: "home" as const,
    grainLine: "this home's own energy certificates",
    explainer:
      "Every certificate the register holds for this home is served, newest first. Where two certificates disagree — on floor area, say — both are shown: the register's disagreement is itself a fact, and no winner is picked.",
  };

  if (resolution.rung === 2) {
    return {
      ...meta,
      sourceName: null,
      sourceDate: null,
      sourceLine: null,
      state: "needs-exact-home",
      line: NEEDS_EXACT_HOME_EPC,
      certificates: [],
      certificateCountAtPostcode: null,
      headlineBand: null,
    };
  }

  const postcode = resolution.directory.postcode;
  let artefact = await source.epcArtefact(postcode);
  if (artefact === null) {
    // A cold postcode: load its certificates through the
    // existing loader path before answering (the D23
    // pattern), so "not filed" means the load was attempted
    // and failed or is not possible — never "we never
    // looked".
    try {
      await source.loadEpc(postcode);
      artefact = await source.epcArtefact(postcode);
    } catch {
      artefact = null;
    }
  }

  if (artefact === null) {
    return {
      ...meta,
      sourceName: null,
      sourceDate: null,
      sourceLine: null,
      state: "not-filed",
      line: "energy certificates could not be loaded for this postcode, so no certificate answer can be given",
      certificates: [],
      certificateCountAtPostcode: null,
      headlineBand: null,
    };
  }

  const sourceMeta = {
    sourceName: artefact.sourceName,
    sourceDate: artefact.sourceDate,
    sourceLine: sourceLineOf(artefact.sourceName, artefact.sourceDate),
  };

  if (artefact.certificates.length === 0) {
    return {
      ...meta,
      ...sourceMeta,
      state: "filed-zero",
      line: "no energy certificate is recorded for this postcode",
      certificates: [],
      certificateCountAtPostcode: 0,
      headlineBand: null,
    };
  }

  const matched = artefact.certificates
    .filter((cert) => certificateMatchesHome(cert, resolution.address))
    .map(toServedCertificate)
    .sort((a, b) =>
      (b.registrationDate ?? "") < (a.registrationDate ?? "")
        ? -1
        : (b.registrationDate ?? "") > (a.registrationDate ?? "")
          ? 1
          : a.certificateNumber.localeCompare(b.certificateNumber),
    );

  if (matched.length === 0) {
    return {
      ...meta,
      ...sourceMeta,
      state: "none-matching",
      line: "certificates are recorded for this postcode; none is for this exact home",
      certificates: [],
      certificateCountAtPostcode: artefact.certificates.length,
      headlineBand: null,
    };
  }

  return {
    ...meta,
    ...sourceMeta,
    state: "served",
    line:
      matched.length > 1
        ? `the register holds ${matched.length} certificates for this home — all are shown, and where they disagree both figures stand`
        : null,
    certificates: matched,
    certificateCountAtPostcode: artefact.certificates.length,
    headlineBand: matched[0].band,
  };
}

// ------------------------------------------------------------------
// Council tax — the billing authority's SCALE, never the
// home's bill (D16). No per-home band is filed anywhere in
// this project, so the answer is the authority's area Band D
// average with its component split and parish line, plus the
// full band table derived at answer time from the statutory
// ratios, labelled the council's scale so the family reads
// their own band off it. Day one files 13 authorities
// penny-verified; the other parsed authorities honestly
// serve "not published" until the spring pass, and Scotland
// and Northern Ireland are named not-covered states.
// ------------------------------------------------------------------

export interface CouncilTaxSection extends AreaSectionMeta {
  state: "served" | "not-published" | "not-covered";
  line: string | null;
  authority: string | null;
  taxYear: string | null;
  bandDAveragePence: number | null;
  bandDAverageLabel: string | null;
  components: { label: string; pence: number; labelPence: string }[];
  parish: { pence: number; labelPence: string; line: string } | null;
  // The authority's scale: every band's charge derived from
  // the filed Band D average by the statutory ratios.
  bands: { band: string; pence: number; labelPence: string }[];
}

// The statutory ratios (Local Government Finance Act 1992
// Section 5 for England; the Welsh bands run A–I on 2003
// values): each band's charge is this many ninths of Band D.
// Constants of the tax, never filed.
const BAND_RATIOS: Record<"england" | "wales", [string, number][]> = {
  england: [
    ["A", 6],
    ["B", 7],
    ["C", 8],
    ["D", 9],
    ["E", 11],
    ["F", 13],
    ["G", 15],
    ["H", 18],
  ],
  wales: [
    ["A", 6],
    ["B", 7],
    ["C", 8],
    ["D", 9],
    ["E", 11],
    ["F", 13],
    ["G", 15],
    ["H", 18],
    ["I", 21],
  ],
};

function buildCouncilTax(facts: CouncilTaxFacts | null, nation: Nation): CouncilTaxSection {
  const meta = {
    depth: "headline" as const,
    grain: "area" as const,
    grainLine: "the billing authority's council tax scale for the area",
    explainer:
      "This is the council's average Band D charge and the scale the other bands are set from — not this home's bill. Your exact bill depends on your home's band and parish.",
  };
  if (nation === "scotland" || nation === "northern-ireland") {
    return {
      ...meta,
      sourceName: null,
      sourceDate: null,
      sourceLine: null,
      state: "not-covered",
      line: `council tax figures are not covered for ${nationName(nation)} — it runs a different system, and no comparable charge is filed`,
      authority: null,
      taxYear: null,
      bandDAveragePence: null,
      bandDAverageLabel: null,
      components: [],
      parish: null,
      bands: [],
    };
  }
  if (facts === null) {
    return {
      ...meta,
      sourceName: null,
      sourceDate: null,
      sourceLine: null,
      state: "not-published",
      line: "this council's council tax charges are not published in the data yet — most councils are filed in the spring pass, and until then no figure can be given",
      authority: null,
      taxYear: null,
      bandDAveragePence: null,
      bandDAverageLabel: null,
      components: [],
      parish: null,
      bands: [],
    };
  }

  const components = facts.components.map((c) => ({
    label: c.label,
    pence: c.pence,
    labelPence: formatPounds(c.pence),
  }));
  const componentTotal = facts.components.reduce((sum, c) => sum + c.pence, 0);
  const parishPence = facts.bandDAreaAveragePence - componentTotal;
  const parish =
    facts.parishAveraged && parishPence > 0
      ? {
          pence: parishPence,
          labelPence: formatPounds(parishPence),
          line:
            facts.nation === "wales"
              ? "the area figure includes an average community council charge"
              : "the area figure includes an average parish charge",
        }
      : null;

  return {
    ...meta,
    sourceName: facts.sourceName,
    sourceDate: facts.sourceDate,
    sourceLine: sourceLineOf(facts.sourceName, facts.sourceDate),
    state: "served",
    line: `${facts.authorityName}'s average Band D council tax for ${facts.taxYear} is ${formatPounds(facts.bandDAreaAveragePence)} — an area average, not this home's bill`,
    authority: facts.authorityName,
    taxYear: facts.taxYear,
    bandDAveragePence: facts.bandDAreaAveragePence,
    bandDAverageLabel: formatPounds(facts.bandDAreaAveragePence),
    components,
    parish,
    bands: BAND_RATIOS[facts.nation].map(([band, ninths]) => {
      const pence = Math.round((facts.bandDAreaAveragePence * ninths) / 9);
      return { band, pence, labelPence: formatPounds(pence) };
    }),
  };
}

// ------------------------------------------------------------------
// Census 2021 — the MSOA in numbers, report depth only.
// Percentages are computed at serve time from the filed
// counts, EACH TABLE ON ITS OWN TOTAL: the tables' totals
// deliberately differ (disclosure control), and no serving
// code may tidy them into one population figure. Categories
// serve in the Census's exact words, unmerged at this layer.
// The median age is computed from the single years and
// labelled calculated. Census Day, 21 March 2021, is the
// date stamp on every figure.
// ------------------------------------------------------------------

interface CensusFragment {
  total: number;
  bands?: Record<string, number>;
  years?: number[];
  groups?: Record<string, number>;
  categories?: Record<string, number>;
  social_rented?: number;
}

export interface CensusRowServed {
  label: string;
  count: number;
  pct: number;
}

export interface CensusTableServed {
  code: string;
  title: string;
  total: number;
  rows: CensusRowServed[];
  groups: CensusRowServed[] | null;
}

export interface CensusSection extends AreaSectionMeta {
  state: "served" | "not-covered" | "not-filed";
  line: string | null;
  msoaCode: string | null;
  msoaName: string | null;
  residentsTotal: number | null;
  householdsTotal: number | null;
  medianAge: { value: number; calculated: true; line: string } | null;
  socialRented: { count: number; total: number; pct: number; line: string } | null;
  tables: CensusTableServed[];
}

const CENSUS_TABLE_TITLES: Record<string, string> = {
  ts007a: "Age by five-year age bands",
  ts021: "Ethnic group",
  ts030: "Religion",
  ts044: "Accommodation type",
  ts052: "Occupancy rating for bedrooms",
  ts054: "Tenure",
};

function censusRows(counts: Record<string, number>, total: number): CensusRowServed[] {
  return Object.entries(counts).map(([label, count]) => ({
    label,
    count,
    pct: total > 0 ? round1((count / total) * 100) : 0,
  }));
}

// The loader's grouped-interpolation median over single-year
// counts (each age a is the interval [a, a+1); the median is
// where the cumulative count crosses N/2) — the same
// arithmetic, so the brain's calculated figure is the
// loader's locked one (Birkdale 46.5 at one decimal).
function medianAgeOf(years: number[]): number {
  const total = years.reduce((sum, n) => sum + n, 0);
  const half = total / 2;
  let cum = 0;
  for (let age = 0; age < years.length; age += 1) {
    const f = years[age] ?? 0;
    if (f > 0 && cum + f >= half) return age + (half - cum) / f;
    cum += f;
  }
  return years.length;
}

function buildCensus(facts: CensusFacts | null, msoaCode: string | null): CensusSection {
  const meta = {
    depth: "report" as const,
    grain: "area" as const,
    grainLine: "the wider area around this home, in Census 2021 numbers",
    explainer:
      "These figures describe the whole Census area this home sits in — thousands of residents — as they were on Census Day, 21 March 2021. They are the area in numbers, not a description of this street or of the people on it.",
  };
  if (msoaCode === null) {
    return {
      ...meta,
      sourceName: null,
      sourceDate: null,
      sourceLine: null,
      state: "not-covered",
      line: "Census 2021 figures are published for England and Wales — this postcode is outside that coverage",
      msoaCode: null,
      msoaName: null,
      residentsTotal: null,
      householdsTotal: null,
      medianAge: null,
      socialRented: null,
      tables: [],
    };
  }
  if (facts === null) {
    return {
      ...meta,
      sourceName: null,
      sourceDate: null,
      sourceLine: null,
      state: "not-filed",
      line: "Census 2021 figures are not filed for this area",
      msoaCode,
      msoaName: null,
      residentsTotal: null,
      householdsTotal: null,
      medianAge: null,
      socialRented: null,
      tables: [],
    };
  }

  const stats = facts.stats as Record<string, CensusFragment>;
  const tables: CensusTableServed[] = [];
  for (const code of Object.keys(CENSUS_TABLE_TITLES)) {
    const fragment = stats[code];
    if (!fragment) continue;
    const rowsSource = fragment.categories ?? fragment.bands ?? fragment.groups ?? {};
    tables.push({
      code,
      title: CENSUS_TABLE_TITLES[code],
      total: fragment.total,
      rows: censusRows(rowsSource, fragment.total),
      groups:
        fragment.groups && fragment.categories ? censusRows(fragment.groups, fragment.total) : null,
    });
  }

  const years = stats.ts007?.years;
  const medianAge =
    Array.isArray(years) && years.length > 0
      ? {
          value: round1(medianAgeOf(years)),
          calculated: true as const,
          line: `median age ${round1(medianAgeOf(years))} years (calculated from the Census's single years of age)`,
        }
      : null;

  const tenure = stats.ts054;
  const socialRented =
    tenure && typeof tenure.social_rented === "number"
      ? {
          count: tenure.social_rented,
          total: tenure.total,
          pct: round1((tenure.social_rented / tenure.total) * 100),
          line: `social rented homes: ${tenure.social_rented} of ${tenure.total} households in the area (${round1((tenure.social_rented / tenure.total) * 100)} percent)`,
        }
      : null;

  return {
    ...meta,
    sourceName: facts.sourceName,
    sourceDate: facts.sourceDate,
    sourceLine: sourceLineOf(facts.sourceName, facts.sourceDate),
    state: "served",
    line: `the ${facts.msoaName} area (the ${facts.msoaCode} area) in Census 2021 numbers`,
    msoaCode: facts.msoaCode,
    msoaName: facts.msoaName,
    residentsTotal: stats.ts007a?.total ?? null,
    householdsTotal: stats.ts044?.total ?? null,
    medianAge,
    socialRented,
    tables,
  };
}

// ------------------------------------------------------------------
// IMD — a decile in words at LSOA grain, England only,
// report depth only. The Welsh and Scottish indices are
// separate publications on their own scales, never filed
// here, so a Welsh or Scottish postcode serves the named
// not-covered state — never a blank and never a borrowed
// English figure. The score and rank are filed data, not
// figures: the source port never carries them, so no served
// shape can contain them.
// ------------------------------------------------------------------

export interface ImdSection extends AreaSectionMeta {
  state: "served" | "not-covered" | "not-filed";
  line: string | null;
  lsoaCode: string | null;
  lsoaName: string | null;
  decile: number | null;
  summary: string | null;
  domains: { key: string; name: string; decile: number }[];
}

const IMD_DOMAIN_NAMES: Record<string, string> = {
  income: "Income",
  employment: "Employment",
  education: "Education, skills and training",
  health: "Health deprivation and disability",
  crime: "Crime",
  barriers: "Barriers to Housing and Services",
  livingEnvironment: "Living environment",
};

const IMD_DOMAIN_ORDER = [
  "income",
  "employment",
  "education",
  "health",
  "crime",
  "barriers",
  "livingEnvironment",
];

function buildImd(facts: ImdFacts | null, lsoaCode: string | null, nation: Nation): ImdSection {
  const meta = {
    depth: "report" as const,
    grain: "area" as const,
    grainLine: "the small area around this home (about 1,700 residents), on the national scale",
    explainer:
      "The Indices of Deprivation place every small area in England into ten bands, from the tenth with the highest measured deprivation to the tenth with the lowest. The band is a fact about the area as a whole — it says nothing about any one home or street within it.",
  };
  if (nation !== "england") {
    return {
      ...meta,
      sourceName: null,
      sourceDate: null,
      sourceLine: null,
      state: "not-covered",
      line: `the English Indices of Deprivation do not cover ${nationName(nation)} — it publishes its own index on its own scale, which is not filed and is never compared with the English one`,
      lsoaCode,
      lsoaName: null,
      decile: null,
      summary: null,
      domains: [],
    };
  }
  if (facts === null) {
    return {
      ...meta,
      sourceName: null,
      sourceDate: null,
      sourceLine: null,
      state: "not-filed",
      line: "no deprivation index figure is filed for this area",
      lsoaCode,
      lsoaName: null,
      decile: null,
      summary: null,
      domains: [],
    };
  }
  return {
    ...meta,
    sourceName: facts.sourceName,
    sourceDate: facts.sourceDate,
    sourceLine: sourceLineOf(facts.sourceName, facts.sourceDate),
    state: "served",
    line: `${facts.summary} — the ${facts.lsoaName} area`,
    lsoaCode: facts.lsoaCode,
    lsoaName: facts.lsoaName,
    decile: facts.decile,
    summary: facts.summary,
    domains: IMD_DOMAIN_ORDER.filter((key) => typeof facts.domains[key] === "number").map(
      (key) => ({ key, name: IMD_DOMAIN_NAMES[key], decile: facts.domains[key] }),
    ),
  };
}

// ------------------------------------------------------------------
// Air — the three modelled concentrations for the 1 km
// square containing the postcode point, exactly as
// published, labelled modelled. There is NO comparison to
// statutory limits in the answer: a limit line beside a
// concentration is a pass/fail verdict wearing a reference
// line's clothes, and the limits belong in How-we-check.
// ------------------------------------------------------------------

export interface AirSection extends AreaSectionMeta {
  state: "served" | "not-filed";
  line: string | null;
  year: number | null;
  no2: number | null;
  pm25: number | null;
  pm10: number | null;
  unit: string;
  headlineFigure: { pollutant: "NO2"; value: number; line: string } | null;
}

function buildAir(facts: AirFacts | null): AirSection {
  const meta = {
    // Headline depth via headlineFigure only (the NO2
    // figure); the full three-pollutant table is report
    // material the projection does not carry.
    depth: "headline" as const,
    grain: "area" as const,
    grainLine: "the modelled background for the square kilometre containing the postcode point",
    explainer:
      "These are modelled background concentrations for the whole square kilometre, not a measurement at this home and not a roadside figure.",
  };
  if (facts === null) {
    return {
      ...meta,
      sourceName: null,
      sourceDate: null,
      sourceLine: null,
      state: "not-filed",
      line: "no modelled air quality square is filed for this point",
      year: null,
      no2: null,
      pm25: null,
      pm10: null,
      unit: "µg/m³",
      headlineFigure: null,
    };
  }
  return {
    ...meta,
    sourceName: facts.sourceName,
    sourceDate: facts.sourceDate,
    sourceLine: sourceLineOf(facts.sourceName, facts.sourceDate),
    state: "served",
    line: `modelled background air concentrations for this square kilometre (${facts.year} modelling)`,
    year: facts.year,
    no2: facts.no2,
    pm25: facts.pm25,
    pm10: facts.pm10,
    unit: "µg/m³",
    headlineFigure: {
      pollutant: "NO2",
      value: facts.no2,
      line: `modelled NO2 ${facts.no2} µg/m³ (annual mean, ${facts.year})`,
    },
  };
}

// ------------------------------------------------------------------
// Noise — the publisher's 5 dB band text verbatim per
// source, day and night, behind the filed-count guard.
// "Below 55 dB" (a real value under the first band) and "No
// modelled … noise" (no source at the point) are distinct
// filed states and never collapse; neither is ever rendered
// as "0 dB" or characterised in our own words. England only
// (Round 4 mapping): a Welsh or Scottish postcode serves
// not-covered once filing exists, and not-filed until it
// does — two states, in that order.
// ------------------------------------------------------------------

export interface NoiseBandServed {
  sourceKind: string;
  label: string;
  dayBand: string | null;
  nightBand: string | null;
  line: string;
}

export interface NoiseSection extends AreaSectionMeta {
  state: "served" | "not-filed" | "not-covered";
  line: string | null;
  bands: NoiseBandServed[];
  headlineBand: { sourceKind: "road"; dayBand: string } | null;
}

const NOISE_KIND_LABELS: Record<string, string> = {
  road: "road noise",
  rail: "rail noise",
  airport: "airport noise",
};

function buildNoise(facts: NoiseFacts, nation: Nation): NoiseSection {
  const meta = {
    // Headline depth via headlineBand only (the road day
    // band); the full per-source table is report material
    // the projection does not carry.
    depth: "headline" as const,
    grain: "postcode point" as const,
    grainLine: "modelled noise bands at the postcode point, in the publisher's own bands",
    explainer:
      "Noise is modelled, not measured: the bands are the publisher's 5 dB presentation ranges at the postcode point, day (07:00–23:00) and night (23:00–07:00).",
  };
  if (facts.filedCount <= 0) {
    return {
      ...meta,
      sourceName: null,
      sourceDate: null,
      sourceLine: null,
      state: "not-filed",
      line: "modelled noise bands are not yet filed, so no noise answer can be given yet",
      bands: [],
      headlineBand: null,
    };
  }
  if (nation !== "england") {
    return {
      ...meta,
      sourceName: facts.sourceName,
      sourceDate: facts.sourceDate,
      sourceLine: sourceLineOf(facts.sourceName, facts.sourceDate),
      state: "not-covered",
      line: `the modelled noise mapping filed covers England only — ${nationName(nation)} is not covered`,
      bands: [],
      headlineBand: null,
    };
  }
  const bands = facts.rows.map((row) => {
    const label = NOISE_KIND_LABELS[row.sourceKind] ?? `${row.sourceKind} noise`;
    return {
      sourceKind: row.sourceKind,
      label,
      dayBand: row.dayBand,
      nightBand: row.nightBand,
      line:
        row.dayBand && row.nightBand
          ? `${label}: ${row.dayBand} by day, ${row.nightBand} by night`
          : `no ${label} band is filed for this postcode`,
    };
  });
  const road = facts.rows.find((row) => row.sourceKind === "road");
  return {
    ...meta,
    sourceName: facts.sourceName,
    sourceDate: facts.sourceDate,
    sourceLine: sourceLineOf(facts.sourceName, facts.sourceDate),
    state: "served",
    line:
      bands.length > 0
        ? "modelled noise bands for this postcode, in the publisher's bands"
        : "no noise bands are filed for this postcode",
    bands,
    headlineBand: road?.dayBand ? { sourceKind: "road", dayBand: road.dayBand } : null,
  };
}

// ------------------------------------------------------------------
// Benefits — the three series served separately, exactly as
// filed, never merged (there is no published figure called
// "people on benefits" and this section cannot express one).
// The Claimant Count is never shortened to "unemployment".
// Universal Credit counts carry the Introduced Random Error
// caveat. Exeter's LSOA is absent from the Households cube
// (HOUSEHOLDS_MISSING_LSOAS in the loader): it serves the
// not-published-for-this-area state, never a zero.
// ------------------------------------------------------------------

export interface BenefitsSeriesServed {
  series: "claimant_count" | "uc_people" | "uc_households";
  label: string;
  state: "served" | "not-published-for-this-area" | "not-filed";
  month: string | null;
  monthLabel: string | null;
  count: number | null;
  pct: number | null;
  pctState: "published" | "not-published" | null;
  line: string | null;
}

export interface BenefitsSection extends AreaSectionMeta {
  state: "served" | "not-covered" | "not-filed";
  line: string | null;
  lsoaCode: string | null;
  series: BenefitsSeriesServed[];
  bases: { residents: number; households: number } | null;
}

function buildBenefits(
  facts: BenefitsFacts,
  lsoaCode: string | null,
  nation: Nation,
): BenefitsSection {
  const meta = {
    depth: "report" as const,
    grain: "area" as const,
    grainLine: "benefit counts for the small area around this home (about 1,700 residents)",
    explainer:
      "These are counts for the whole small area, published by the DWP — facts about the area's caseload, not about any street or household in it. Universal Credit counts are published with Introduced Random Error applied, so a count can differ slightly from the exact number of cases.",
  };
  if (nation === "scotland" || nation === "northern-ireland") {
    return {
      ...meta,
      sourceName: null,
      sourceDate: null,
      sourceLine: null,
      state: "not-covered",
      line: `these benefit series are filed for England and Wales areas — ${nationName(nation)} is not covered`,
      lsoaCode,
      series: [],
      bases: null,
    };
  }

  const serve = (
    series: BenefitsSeriesServed["series"],
    label: string,
    filed: BenefitsSeriesFacts | null,
    missingIsKnown: boolean,
  ): BenefitsSeriesServed => {
    if (filed === null) {
      return {
        series,
        label,
        state: missingIsKnown ? "not-published-for-this-area" : "not-filed",
        month: null,
        monthLabel: null,
        count: null,
        pct: null,
        pctState: null,
        line: missingIsKnown
          ? `${label} is not published for this area`
          : `${label} is not filed for this area`,
      };
    }
    return {
      series,
      label,
      state: "served",
      month: filed.month,
      monthLabel: monthLabel(filed.month),
      count: filed.count,
      pct: filed.pct,
      pctState:
        series === "claimant_count" ? (filed.pct === null ? "not-published" : "published") : null,
      line: `${label}: ${filed.count} in ${monthLabel(filed.month)}`,
    };
  };

  const series = [
    serve(
      "claimant_count",
      "the Claimant Count (the count of claimants of unemployment-related benefits)",
      facts.claimantCount,
      false,
    ),
    serve("uc_people", "people on Universal Credit", facts.ucPeople, false),
    serve("uc_households", "households on Universal Credit", facts.ucHouseholds, true),
  ];
  const anyFiled =
    facts.claimantCount !== null || facts.ucPeople !== null || facts.ucHouseholds !== null;
  return {
    ...meta,
    sourceName: null,
    sourceDate: null,
    sourceLine: null,
    state: anyFiled ? "served" : "not-filed",
    line: anyFiled ? null : "benefit counts are not filed for this area",
    lsoaCode,
    series,
    bases: facts.bases,
  };
}

// ------------------------------------------------------------------
// Solar — the LOCATION version (the founder's ruling on
// D26/Q11): PVGIS modelled yield for the postcode point on
// the filed standard basis, worded as a fact about the
// location, never as this home's roof or its yield — the
// modelling cannot see the actual roof: its shading, its
// orientation or its pitch. Plus, inside the EPC section,
// whatever solar facts a matched certificate records.
// Behind the same filed-count guard family: an empty grid
// serves the not-filed state, never a zero.
// ------------------------------------------------------------------

export interface SolarSection extends AreaSectionMeta {
  state: "served" | "not-filed";
  line: string | null;
  cellRef: string | null;
  yieldKwhPerKwp: number | null;
  irradiationKwhM2: number | null;
  basis: {
    peakPowerKwp: number;
    slopeDeg: number;
    azimuthDeg: number;
    systemLossPct: number;
    mounting: string;
    pvTechnology: string;
    radiationDb: string;
    yearMin: number;
    yearMax: number;
  } | null;
  basisLine: string | null;
}

// The PVGIS grid's cell for a point — the loader's own grain
// (load-pvgis.mjs): tenths of a degree; a point's cell is the
// 0.1° square containing it, named by its centre.
export function solarCellRef(latitude: number, longitude: number): string {
  const centreLat = (Math.floor(latitude * 10) + 0.5) / 10;
  const centreLng = (Math.floor(longitude * 10) + 0.5) / 10;
  return `${centreLat.toFixed(2)},${centreLng.toFixed(2)}`;
}

function buildSolar(facts: SolarFacts): SolarSection {
  const meta = {
    depth: "report" as const,
    grain: "postcode point" as const,
    grainLine: "modelled sunshine and solar yield for this location",
    explainer:
      "This is modelling for the location, not for this home's roof: it assumes an unshaded, south-facing roof at a standard pitch, and cannot see the actual roof — its shading, orientation or pitch.",
  };
  if (facts.gridFiledCount <= 0 || facts.cell === null) {
    return {
      ...meta,
      sourceName: null,
      sourceDate: null,
      sourceLine: null,
      state: "not-filed",
      line:
        facts.gridFiledCount <= 0
          ? "solar modelling is not yet filed, so no solar answer can be given yet"
          : "solar modelling is not filed for this area yet",
      cellRef: null,
      yieldKwhPerKwp: null,
      irradiationKwhM2: null,
      basis: null,
      basisLine: null,
    };
  }
  const cell = facts.cell;
  const basisLine = `modelling for this area assumes a ${cell.peakPowerKwp} kWp system on an unshaded, south-facing roof at ${cell.slopeDeg}°, with ${cell.systemLossPct}% system loss (${cell.radiationDb}, ${cell.yearMin}–${cell.yearMax})`;
  return {
    ...meta,
    sourceName: cell.sourceName,
    sourceDate: cell.sourceDate,
    sourceLine: sourceLineOf(cell.sourceName, cell.sourceDate),
    state: "served",
    line: `at this location, that standard system is modelled to generate about ${cell.yieldKwhPerKwp} kWh per kWp in a year, from ${cell.irradiationKwhM2} kWh/m² of sunshine`,
    cellRef: cell.cellRef,
    yieldKwhPerKwp: cell.yieldKwhPerKwp,
    irradiationKwhM2: cell.irradiationKwhM2,
    basis: {
      peakPowerKwp: cell.peakPowerKwp,
      slopeDeg: cell.slopeDeg,
      azimuthDeg: cell.azimuthDeg,
      systemLossPct: cell.systemLossPct,
      mounting: cell.mounting,
      pvTechnology: cell.pvTechnology,
      radiationDb: cell.radiationDb,
      yearMin: cell.yearMin,
      yearMax: cell.yearMax,
    },
    basisLine,
  };
}

// ------------------------------------------------------------------
// The bundle
// ------------------------------------------------------------------

export interface AreaSections {
  constraints: ConstraintsSection;
  heritage: HeritageSection;
  nature: NatureSection;
  epc: EpcSection;
  councilTax: CouncilTaxSection;
  census: CensusSection;
  imd: ImdSection;
  air: AirSection;
  noise: NoiseSection;
  benefits: BenefitsSection;
  solar: SolarSection;
}

export type AreaBundle =
  | {
      rung: 1 | 2;
      kind: "area-bundle";
      postcode: string;
      sections: AreaSections;
    }
  | {
      rung: 3;
      kind: "wider-area";
      area: {
        state: "unavailable";
        reason: string;
        // Every section present only as its named state — the
        // rung-3 result type carries no M6.6 payload by
        // construction.
        sections: Record<string, { state: "unavailable"; reason: string }>;
      };
    }
  | {
      rung: 4;
      kind: "no-location";
      area: { state: "unavailable"; reason: string };
    };

const RUNG3_SECTION_REASONS: Record<string, string> = {
  constraints: "planning constraints need an exact postcode",
  heritage: "heritage answers need an exact postcode",
  nature: "nature answers need an exact postcode",
  epc: "energy certificates need an exact postcode",
  councilTax: "council tax needs an exact postcode",
  census: "Census figures need an exact postcode",
  imd: "area statistics need an exact postcode",
  air: "air quality needs an exact postcode",
  noise: "noise bands need an exact postcode",
  benefits: "benefit counts need an exact postcode",
  solar: "solar modelling needs an exact postcode",
};

export async function buildAreaBundle(
  resolution: AddressResolution,
  source: AreaDataSource,
): Promise<AreaBundle> {
  if (resolution.rung === 3)
    return {
      rung: 3,
      kind: "wider-area",
      area: {
        state: "unavailable",
        reason: AREA_UNAVAILABLE_REASON,
        sections: Object.fromEntries(
          Object.entries(RUNG3_SECTION_REASONS).map(([key, reason]) => [
            key,
            { state: "unavailable" as const, reason },
          ]),
        ),
      },
    };
  if (resolution.rung === 4)
    return {
      rung: 4,
      kind: "no-location",
      area: { state: "unavailable", reason: AREA_UNAVAILABLE_REASON },
    };

  const { latitude, longitude, postcode } = resolution.directory;
  const nation = nationOf(resolution.directory.lsoaCode);

  const [
    conservationAreaFacts,
    article4Facts,
    greenBeltFacts,
    monumentFacts,
    woodlandFacts,
    designations,
    listed,
    phi,
    article4Publishes,
    councilTaxFacts,
    censusFacts,
    imdFacts,
    airFacts,
    noiseFacts,
    benefitsFacts,
    solarFacts,
  ] = await Promise.all([
    source.planningLayerFacts("conservation_area", latitude, longitude),
    source.planningLayerFacts("article_4_area", latitude, longitude),
    source.planningLayerFacts("green_belt", latitude, longitude),
    source.planningLayerFacts("scheduled_monument", latitude, longitude),
    source.planningLayerFacts("ancient_woodland", latitude, longitude),
    source.designationFacts(latitude, longitude),
    source.listedFacts(latitude, longitude),
    source.phiFacts(latitude, longitude),
    source.article4Gate(resolution.directory.council),
    source.councilTaxRow(resolution.directory.council),
    resolution.directory.msoaCode
      ? source.censusRow(resolution.directory.msoaCode)
      : Promise.resolve(null),
    resolution.directory.lsoaCode
      ? source.imdRow(resolution.directory.lsoaCode)
      : Promise.resolve(null),
    source.airSquare(latitude, longitude),
    source.noiseRows(postcode),
    resolution.directory.lsoaCode
      ? source.benefits(resolution.directory.lsoaCode)
      : Promise.resolve({ claimantCount: null, ucPeople: null, ucHouseholds: null, bases: null }),
    source.solarCell(solarCellRef(latitude, longitude)),
  ]);

  const epc = await buildEpc(resolution, source);

  return {
    rung: resolution.rung,
    kind: "area-bundle",
    postcode,
    sections: {
      constraints: buildConstraints(
        resolution,
        {
          conservation_area: conservationAreaFacts,
          article_4_area: article4Facts,
          green_belt: greenBeltFacts,
        },
        article4Publishes,
        nation,
      ),
      heritage: buildHeritage(resolution, listed, monumentFacts, nation),
      nature: buildNature(designations, woodlandFacts, phi, nation),
      epc,
      councilTax: buildCouncilTax(councilTaxFacts, nation),
      census: buildCensus(censusFacts, resolution.directory.msoaCode),
      imd: buildImd(imdFacts, resolution.directory.lsoaCode, nation),
      air: buildAir(airFacts),
      noise: buildNoise(noiseFacts, nation),
      benefits: buildBenefits(benefitsFacts, resolution.directory.lsoaCode, nation),
      solar: buildSolar(solarFacts),
    },
  };
}

// ------------------------------------------------------------------
// The headline projection — the ONLY headline path from the
// bundle (M6.7's short version derives the same way). It is
// a projection of the full bundle, never a second read of
// the tables, and it structurally cannot carry a report-only
// payload: IMD, Census and benefits have no key here.
// ------------------------------------------------------------------

export interface HeadlineProjection {
  postcode: string;
  constraints: ConstraintsSection;
  heritage: HeritageSection;
  nature: NatureSection;
  epc: { state: EpcSection["state"]; headlineBand: string | null };
  councilTax: {
    state: CouncilTaxSection["state"];
    authority: string | null;
    taxYear: string | null;
    bandDAverageLabel: string | null;
  };
  air: { state: AirSection["state"]; headlineFigure: AirSection["headlineFigure"] };
  noise: { state: NoiseSection["state"]; headlineBand: NoiseSection["headlineBand"] };
}

export function projectHeadline(bundle: AreaBundle): HeadlineProjection | null {
  if (bundle.kind !== "area-bundle") return null;
  const { sections } = bundle;
  return {
    postcode: bundle.postcode,
    constraints: sections.constraints,
    heritage: sections.heritage,
    nature: sections.nature,
    epc: { state: sections.epc.state, headlineBand: sections.epc.headlineBand },
    councilTax: {
      state: sections.councilTax.state,
      authority: sections.councilTax.authority,
      taxYear: sections.councilTax.taxYear,
      bandDAverageLabel: sections.councilTax.bandDAverageLabel,
    },
    air: { state: sections.air.state, headlineFigure: sections.air.headlineFigure },
    noise: { state: sections.noise.state, headlineBand: sections.noise.headlineBand },
  };
}

// ------------------------------------------------------------------
// The database source
// ------------------------------------------------------------------

const METRES_PER_MILE = 1609.344;

// The degree radius that makes a geometry-space ST_DWithin a
// guaranteed superset of the geography circle it prefilters
// (the flood brain's own helper, same reasoning): the exact
// cut is always the geography distance the same query
// computes — the prefilter only bounds the work, and every
// query stays on the GiST indexes rather than sorting a
// layer.
function degreeRadius(metres: number, latitude: number): number {
  const cosLat = Math.max(Math.cos((latitude * Math.PI) / 180), 0.2);
  return (metres * 1.5) / (111_320 * cosLat);
}

// Beyond-radius steps, in miles (the flood brain's steps):
// each is index-bounded, and a layer with nothing inside the
// widest step serves no beyond entry.
const BEYOND_STEPS_MILES = [5, 10, 20, 40];

const execFileAsync = promisify(execFile);

export interface AreaSourceOptions {
  databaseUrl?: string;
  epcLoaderPath?: string;
}

export function createAreaSource(
  db: AddressQueryable,
  options: AreaSourceOptions = {},
): AreaDataSource {
  const point = "ST_SetSRID(ST_MakePoint($2, $3), 4326)";
  // The same point for queries whose parameters run
  // [lng, lat, radius] (listed buildings, priority habitats,
  // air) instead of [layer, lng, lat, radius] (planning layers).
  const point12 = "ST_SetSRID(ST_MakePoint($1, $2), 4326)";

  async function layerFacts(
    layer: PlanningLayerKind,
    latitude: number,
    longitude: number,
  ): Promise<PlanningLayerFacts> {
    const edition = await db.query(
      "SELECT source_name, source_date::text AS source_date FROM planning_layers WHERE constraint_type = $1 LIMIT 1",
      [layer],
    );
    const { rows: countRows } = await db.query(
      "SELECT count(*)::int AS n FROM planning_layers WHERE constraint_type = $1",
      [layer],
    );
    const filedCount = Number(countRows[0]?.n ?? 0);
    const sourceName = (edition.rows[0]?.source_name as string | null) ?? null;
    const sourceDate = (edition.rows[0]?.source_date as string | null) ?? null;
    if (filedCount <= 0) {
      return {
        filedCount,
        covering: [],
        nearestWithin: [],
        nearestBeyond: null,
        sourceName,
        sourceDate,
      };
    }

    const { rows: coveringRows } = await db.query(
      `SELECT id, name, detail FROM planning_layers
       WHERE constraint_type = $1 AND ST_Covers(geom, ${point})
       ORDER BY name`,
      [layer, longitude, latitude],
    );
    const covering = coveringRows.map((row) => ({
      id: Number(row.id),
      name: (row.name as string | null) ?? null,
      detail: (row.detail as string | null) ?? null,
    }));

    const nearestWithinRadius = async (radiusMiles: number): Promise<PlanningNearestRow[]> => {
      const metres = radiusMiles * METRES_PER_MILE;
      const { rows } = await db.query(
        `SELECT id, name, detail,
                ST_Distance(geom::geography, ${point}::geography) / ${METRES_PER_MILE} AS miles
         FROM planning_layers
         WHERE constraint_type = $1 AND ST_DWithin(geom, ${point}, $4)
         ORDER BY ST_Distance(geom::geography, ${point}::geography)
         LIMIT 1`,
        [layer, longitude, latitude, degreeRadius(metres, latitude)],
      );
      return rows
        .map((row) => ({
          id: Number(row.id),
          name: (row.name as string | null) ?? null,
          detail: (row.detail as string | null) ?? null,
          miles: Number(row.miles),
        }))
        .filter((row) => row.miles <= radiusMiles);
    };

    const within = await nearestWithinRadius(RADIUS_MILES);
    const nearestWithin = covering.length > 0 ? [] : within;

    let nearestBeyond: PlanningNearestRow | null = null;
    if (covering.length === 0 && nearestWithin.length === 0) {
      for (const step of BEYOND_STEPS_MILES) {
        const rows = await nearestWithinRadius(step);
        if (rows.length > 0) {
          nearestBeyond = rows[0];
          break;
        }
      }
    }

    return { filedCount, covering, nearestWithin, nearestBeyond, sourceName, sourceDate };
  }

  return {
    planningLayerFacts: layerFacts,

    async designationFacts(latitude, longitude) {
      const types = Object.keys(DESIGNATION_LABELS) as DesignationKind[];
      const byType = {} as Record<DesignationKind, PlanningLayerFacts>;
      for (const type of types) byType[type] = await layerFacts(type, latitude, longitude);

      const candidateIds = new Set<number>();
      for (const type of types) {
        for (const row of byType[type].covering) candidateIds.add(row.id);
        for (const row of byType[type].nearestWithin) candidateIds.add(row.id);
        if (byType[type].nearestBeyond) candidateIds.add(byType[type].nearestBeyond.id);
      }
      let overlaps: [number, number][] = [];
      if (candidateIds.size > 1) {
        const ids = [...candidateIds];
        const { rows } = await db.query(
          `SELECT a.id AS a, b.id AS b FROM planning_layers a
           JOIN planning_layers b ON a.id < b.id AND ST_Intersects(a.geom, b.geom)
           WHERE a.id = ANY($1) AND b.id = ANY($1)`,
          [ids],
        );
        overlaps = rows.map((row) => [Number(row.a), Number(row.b)] as [number, number]);
      }
      return { byType, overlaps };
    },

    async listedFacts(latitude, longitude) {
      const edition = await db.query(
        "SELECT source_name, source_date::text AS source_date FROM listed_buildings LIMIT 1",
      );
      const { rows: countRows } = await db.query("SELECT count(*)::int AS n FROM listed_buildings");
      const filedCount = Number(countRows[0]?.n ?? 0);
      const sourceName = (edition.rows[0]?.source_name as string | null) ?? null;
      const sourceDate = (edition.rows[0]?.source_date as string | null) ?? null;
      if (filedCount <= 0) {
        return { filedCount, within: [], nearestBeyond: null, sourceName, sourceDate };
      }
      const metres = RADIUS_MILES * METRES_PER_MILE;
      const { rows } = await db.query(
        `SELECT list_entry_id, name, grade,
                ST_Distance(geom::geography, ${point12}::geography) / ${METRES_PER_MILE} AS miles
         FROM listed_buildings
         WHERE ST_DWithin(geom, ${point12}, $3)
         ORDER BY ST_Distance(geom::geography, ${point12}::geography)`,
        [longitude, latitude, degreeRadius(metres, latitude)],
      );
      const within = rows
        .map((row) => ({
          listEntryId: row.list_entry_id as string,
          name: (row.name as string | null) ?? null,
          grade: row.grade as string,
          miles: Number(row.miles),
        }))
        .filter((row) => row.miles <= RADIUS_MILES);

      let nearestBeyond: ListedRow | null = null;
      if (within.length === 0) {
        for (const step of BEYOND_STEPS_MILES) {
          const stepMetres = step * METRES_PER_MILE;
          const { rows: beyondRows } = await db.query(
            `SELECT list_entry_id, name, grade,
                    ST_Distance(geom::geography, ${point12}::geography) / ${METRES_PER_MILE} AS miles
             FROM listed_buildings
             WHERE ST_DWithin(geom, ${point12}, $3)
             ORDER BY ST_Distance(geom::geography, ${point12}::geography)
             LIMIT 1`,
            [longitude, latitude, degreeRadius(stepMetres, latitude)],
          );
          const hit = beyondRows[0];
          if (hit && Number(hit.miles) <= step) {
            nearestBeyond = {
              listEntryId: hit.list_entry_id as string,
              name: (hit.name as string | null) ?? null,
              grade: hit.grade as string,
              miles: Number(hit.miles),
            };
            break;
          }
        }
      }
      return { filedCount, within, nearestBeyond, sourceName, sourceDate };
    },

    async phiFacts(latitude, longitude) {
      const { rows: countRows } = await db.query(
        "SELECT count(*)::int AS n FROM planning_layers WHERE constraint_type = 'priority_habitat'",
      );
      const filedCount = Number(countRows[0]?.n ?? 0);
      if (filedCount <= 0) {
        return { filedCount, nearest: null, typesWithin: [], sourceName: null, sourceDate: null };
      }
      const edition = await db.query(
        "SELECT source_name, source_date::text AS source_date FROM planning_layers WHERE constraint_type = 'priority_habitat' LIMIT 1",
      );
      const nearestAt = async (radiusMiles: number) => {
        const metres = radiusMiles * METRES_PER_MILE;
        const { rows } = await db.query(
          `SELECT name,
                  ST_Distance(geom::geography, ${point12}::geography) / ${METRES_PER_MILE} AS miles
           FROM planning_layers
           WHERE constraint_type = 'priority_habitat' AND ST_DWithin(geom, ${point12}, $3)
           ORDER BY ST_Distance(geom::geography, ${point12}::geography)
           LIMIT 1`,
          [longitude, latitude, degreeRadius(metres, latitude)],
        );
        const hit = rows[0];
        return hit && Number(hit.miles) <= radiusMiles
          ? {
              habitat: (hit.name as string | null) ?? "an unnamed habitat",
              miles: Number(hit.miles),
            }
          : null;
      };
      let nearest = await nearestAt(RADIUS_MILES);
      if (!nearest) {
        for (const step of BEYOND_STEPS_MILES) {
          nearest = await nearestAt(step);
          if (nearest) break;
        }
      }
      const metres = RADIUS_MILES * METRES_PER_MILE;
      const { rows: typeRows } = await db.query(
        `SELECT DISTINCT name FROM planning_layers
         WHERE constraint_type = 'priority_habitat' AND ST_DWithin(geom, ${point12}, $3)
           AND ST_Distance(geom::geography, ${point12}::geography) <= ${metres}
         ORDER BY name`,
        [longitude, latitude, degreeRadius(metres, latitude)],
      );
      return {
        filedCount,
        nearest,
        typesWithin: typeRows
          .map((row) => (row.name as string | null) ?? null)
          .filter((name): name is string => name !== null),
        sourceName: (edition.rows[0]?.source_name as string | null) ?? null,
        sourceDate: (edition.rows[0]?.source_date as string | null) ?? null,
      };
    },

    async article4Gate() {
      // The gate is keyed by the platform's organisation
      // entity; the directory carries the council's NAME, and
      // no filed table bridges the two (the planning files
      // publish the entity number only — migration 0007's own
      // note). A positive identification therefore cannot be
      // made from filed data, and the gate fails safe: "none
      // found" is never served on an unproven licence, and
      // every absence serves "not published by the council"
      // until the bridge is filed (the platform's published
      // organisation register, an M5-class filing job). The
      // brain's none-found branch is proven by unit tests
      // against a gate that answers true.
      return false;
    },

    async epcArtefact(postcode) {
      const { rows } = await db.query(
        "SELECT answers -> 'epc' AS epc FROM postcode_cache WHERE postcode = $1",
        [postcode],
      );
      const epc = rows[0]?.epc as EpcArtefact | undefined;
      return epc ?? null;
    },

    async loadEpc(postcode) {
      const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
      if (!databaseUrl)
        throw new Error(
          "DATABASE_URL is not set (see .env.example, Key K6) — cannot load a postcode",
        );
      const loaderPath =
        options.epcLoaderPath ?? fileURLToPath(new URL("../loaders/load-epc.mjs", import.meta.url));
      // The loader takes its postcodes after a "--" separator
      // (its own usage line: load-epc -- "CM3 2JT"); its
      // argument filter drops the slot the separator occupies,
      // so without it the first — here the only — postcode is
      // silently never loaded. Pinned by a test, as in the
      // sold-prices brain.
      await execFileAsync(process.execPath, [loaderPath, "--", postcode], {
        env: { ...process.env, DATABASE_URL: databaseUrl },
        maxBuffer: 16 * 1024 * 1024,
      });
    },

    async councilTaxRow(council) {
      if (!council) return null;
      const { rows } = await db.query(
        `SELECT authority_name, nation, tax_year, band_d_area_average_pence,
                parish_averaged, billing_authority_component_pence,
                county_component_pence, police_component_pence,
                fire_component_pence, gla_component_pence,
                combined_authority_component_pence, source_name,
                source_date::text AS source_date
         FROM council_tax_charges WHERE authority_name = $1
         ORDER BY tax_year DESC LIMIT 1`,
        [council],
      );
      const row = rows[0];
      if (!row) return null;
      const authorityName = row.authority_name as string;
      const raw: { role: string; label: string; pence: number | null }[] = [
        {
          role: "billing_authority",
          label: authorityName,
          pence: row.billing_authority_component_pence as number | null,
        },
        {
          role: "county",
          label: "county council",
          pence: row.county_component_pence as number | null,
        },
        { role: "police", label: "police", pence: row.police_component_pence as number | null },
        {
          role: "fire",
          label: "fire and rescue",
          pence: row.fire_component_pence as number | null,
        },
        {
          role: "gla",
          label: "Greater London Authority",
          pence: row.gla_component_pence as number | null,
        },
        {
          role: "combined_authority",
          label: "combined authority",
          pence: row.combined_authority_component_pence as number | null,
        },
      ];
      return {
        authorityName,
        nation: row.nation as "england" | "wales",
        taxYear: row.tax_year as string,
        bandDAreaAveragePence: Number(row.band_d_area_average_pence),
        parishAveraged: Boolean(row.parish_averaged),
        components: raw.filter(
          (c): c is { role: string; label: string; pence: number } => c.pence !== null,
        ),
        sourceName: (row.source_name as string | null) ?? null,
        sourceDate: (row.source_date as string | null) ?? null,
      };
    },

    async censusRow(msoaCode) {
      const { rows } = await db.query(
        "SELECT msoa_code, msoa_name, stats, source_name, source_date::text AS source_date FROM census_stats WHERE msoa_code = $1",
        [msoaCode],
      );
      const row = rows[0];
      if (!row) return null;
      return {
        msoaCode: row.msoa_code as string,
        msoaName: row.msoa_name as string,
        stats: row.stats as Record<string, unknown>,
        sourceName: (row.source_name as string | null) ?? null,
        sourceDate: (row.source_date as string | null) ?? null,
      };
    },

    async imdRow(lsoaCode) {
      // stats->'domains' only: the score and rank inside
      // stats are never read into the port, so no served
      // shape can carry them.
      const { rows } = await db.query(
        `SELECT lsoa_code, lsoa_name, imd_decile, imd_summary,
                stats -> 'domains' AS domains, source_name,
                source_date::text AS source_date
         FROM neighbourhood_stats WHERE lsoa_code = $1`,
        [lsoaCode],
      );
      const row = rows[0];
      if (!row) return null;
      return {
        lsoaCode: row.lsoa_code as string,
        lsoaName: row.lsoa_name as string,
        decile: Number(row.imd_decile),
        summary: row.imd_summary as string,
        domains: (row.domains as Record<string, number>) ?? {},
        sourceName: (row.source_name as string | null) ?? null,
        sourceDate: (row.source_date as string | null) ?? null,
      };
    },

    async airSquare(latitude, longitude) {
      const { rows } = await db.query(
        `SELECT year, no2, pm25, pm10, source_name, source_date::text AS source_date
         FROM air_grid
         WHERE ST_DWithin(geom, ${point12}, $3)
           AND ST_Distance(geom::geography, ${point12}::geography) <= 1000
         ORDER BY ST_Distance(geom::geography, ${point12}::geography)
         LIMIT 1`,
        [longitude, latitude, degreeRadius(1000, latitude)],
      );
      const row = rows[0];
      if (!row) return null;
      return {
        year: Number(row.year),
        no2: Number(row.no2),
        pm25: Number(row.pm25),
        pm10: Number(row.pm10),
        sourceName: (row.source_name as string | null) ?? null,
        sourceDate: (row.source_date as string | null) ?? null,
      };
    },

    async noiseRows(postcode) {
      const { rows: countRows } = await db.query("SELECT count(*)::int AS n FROM noise_summary");
      const filedCount = Number(countRows[0]?.n ?? 0);
      if (filedCount <= 0) {
        return { filedCount, rows: [], sourceName: null, sourceDate: null };
      }
      const { rows } = await db.query(
        `SELECT source_kind, day_band, night_band, source_name,
                source_date::text AS source_date
         FROM noise_summary WHERE area_ref = $1 ORDER BY source_kind`,
        [postcode],
      );
      return {
        filedCount,
        rows: rows.map((row) => ({
          sourceKind: row.source_kind as string,
          dayBand: (row.day_band as string | null) ?? null,
          nightBand: (row.night_band as string | null) ?? null,
        })),
        sourceName: (rows[0]?.source_name as string | null) ?? null,
        sourceDate: (rows[0]?.source_date as string | null) ?? null,
      };
    },

    async benefits(lsoaCode) {
      const latest = async (series: string): Promise<BenefitsSeriesFacts | null> => {
        const { rows } = await db.query(
          `SELECT reference_month::text AS month, count, pct, source_name,
                  source_date::text AS source_date
           FROM benefits_stats WHERE lsoa_code = $1 AND series = $2
           ORDER BY reference_month DESC LIMIT 1`,
          [lsoaCode, series],
        );
        const row = rows[0];
        if (!row) return null;
        return {
          month: (row.month as string).slice(0, 10),
          count: Number(row.count),
          pct: row.pct === null || row.pct === undefined ? null : Number(row.pct),
          sourceName: (row.source_name as string | null) ?? null,
          sourceDate: (row.source_date as string | null) ?? null,
        };
      };
      const { rows: baseRows } = await db.query(
        "SELECT residents, households FROM lsoa_bases WHERE lsoa_code = $1",
        [lsoaCode],
      );
      const base = baseRows[0];
      return {
        claimantCount: await latest("claimant_count"),
        ucPeople: await latest("uc_people"),
        ucHouseholds: await latest("uc_households"),
        bases: base
          ? { residents: Number(base.residents), households: Number(base.households) }
          : null,
      };
    },

    async solarCell(cellRef) {
      const { rows: countRows } = await db.query("SELECT count(*)::int AS n FROM solar_grid");
      const gridFiledCount = Number(countRows[0]?.n ?? 0);
      if (gridFiledCount <= 0) return { gridFiledCount, cell: null };
      const { rows } = await db.query(
        `SELECT cell_ref, yield_kwh_per_kwp, irradiation_kwh_m2,
                peak_power_kwp, system_loss_pct, slope_deg, azimuth_deg,
                mounting, pv_technology, radiation_db, year_min, year_max,
                source_name, source_date::text AS source_date
         FROM solar_grid WHERE cell_ref = $1`,
        [cellRef],
      );
      const row = rows[0];
      if (!row) return { gridFiledCount, cell: null };
      return {
        gridFiledCount,
        cell: {
          cellRef: row.cell_ref as string,
          yieldKwhPerKwp: Number(row.yield_kwh_per_kwp),
          irradiationKwhM2: Number(row.irradiation_kwh_m2),
          peakPowerKwp: Number(row.peak_power_kwp),
          systemLossPct: Number(row.system_loss_pct),
          slopeDeg: Number(row.slope_deg),
          azimuthDeg: Number(row.azimuth_deg),
          mounting: row.mounting as string,
          pvTechnology: row.pv_technology as string,
          radiationDb: row.radiation_db as string,
          yearMin: Number(row.year_min),
          yearMax: Number(row.year_max),
          sourceName: (row.source_name as string | null) ?? null,
          sourceDate: (row.source_date as string | null) ?? null,
        },
      };
    },
  };
}
