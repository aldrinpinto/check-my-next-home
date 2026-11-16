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
import { improvementName } from "./epc-improvements";
import { DISTANCE_BASIS_LABEL, RADIUS_MILES } from "./nearby";
import { COMPANY_OWNERSHIP_ENABLED } from "./site";

// Constraints & area bundle (plan step M6.6, decision D26).
//
// The brain's bundle for every dataset filed across M5 that has
// no brain step of its own: planning constraints, heritage,
// nature, the home's EPC, council tax, Census 2021, the IMD,
// air, noise, DWP benefits and solar — plus the planning
// applications hand-off (M6.12), the one section that files
// nothing at all, and company ownership (M6.13, decision
// D32), the one section gated behind a flag — served as ONE bundle of
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
// behind its publication gate — the publisher's gap, not
// ours), not-filed (a table with no filing yet — noise
// and priority habitats until their M12 operator passes, the
// solar grid until its first pass; council tax for an
// unfiled authority, renamed from not-published at M6.9/D30
// because MHCLG has published the charges and the gap is
// our spring filing backlog), filed-and-empty (E16 1EG's
// zero certificates), filed-and-below-range (noise's "Below
// 55 dB"), and sparse coverage (council-supplied Welsh
// planning rows). A globally empty table can never impersonate
// a local absence: the noise, priority-habitat and solar
// sections sit behind filed-count guards in the source facts.
// Planning applications add a twelfth shape that is not an
// absence at all: handed-off (M6.12) — the data exists and
// is public, and is deliberately not held, so the section
// is a pointer to the council's own register. Company
// ownership (M6.13) is the thirteenth section and the only
// flag-gated one: while COMPANY_OWNERSHIP_ENABLED is false
// the section is ABSENT from the bundle by construction —
// no key, no named state — and its tables are never read;
// behind the flag it answers the home's own title from the
// filed CCOD/OCOD titles, with the building's own title
// named separately where a flat's building is held on one.
//
// Monthly cost (M6.14, decision D33) adds NO section and NO
// total: it is two derived lines inside the sections that
// own the ingredients — a monthly equivalent of the
// council-tax scale inside the council-tax section, and the
// register's modelled energy costs inside the EPC section.
// A summed "monthly cost of this home" is barred by
// construction: the council-tax ingredient is the
// authority's scale, never this home's bill (D16), and the
// two lines' grains and bases never merge (D26) — so no
// served shape carries a total field for them, and the
// state matrix scans the two sections to prove it.
//
// Building safety (M6.16, decision D35) is the fourteenth
// section and the second hand-off: ONE section with two
// sub-blocks that keep separate states and source lines —
// the filed tribunal decisions (the published BSA/BSB
// remediation series, grouped by building, fail-open: the
// home's building group is labelled and served first,
// never used as a filter) and the Building Safety
// Regulator register hand-off (no building-level register
// data exists to file; the register is a postcode lookup
// by design). The halves correct each other: the
// tribunal's empty line is only ever read beside the
// register hand-off, and neither half's silence is a
// verdict about any building — the section carries no
// word that could make it one (D17).
//
// Broadband and mobile (M6.17, decision D36) are the
// fifteenth and sixteenth sections — TWO sections, never
// one combined "connections" section, because their
// grains differ: broadband is a fact about the postcode's
// premises, mobile a fact about the named council area.
// Both read answer keys the M5.9 Ofcom loaders filed into
// postcode_cache.answers (the crime/EPC pattern) — no
// table, no spatial query. Every figure is a share of
// premises where a service is AVAILABLE: never a speed a
// home will get, never take-up, never a claim about
// signal inside this home. Ofcom files no provider names,
// so none can serve. A mobile figure Ofcom does not
// publish files as null and serves as not published —
// never 0, never a silently missing row. Broadband joins
// the short bundle as its twelfth headline section,
// carrying the gigabit line only; mobile never headlines.
//
// The missing layers (M6.21, decision D41) join existing
// sections rather than opening new ones. The constraints
// section gains two sub-blocks: brownfield land — recorded
// sites as POINTS (the dataset publishes no boundaries), so
// the serving shape is the listed buildings' (nearest three
// plus the count within 2 miles), its absence gated on the
// council's supply exactly as Article 4's is — and built-up
// areas, the ONS December 2024 polygons, served in the
// green-belt shape with the filed area's own name. The
// heritage section gains four polygon layers — world
// heritage sites, battlefields, protected wreck sites and
// world heritage site buffer zones, the buffer zone its own
// sub-block because inside the buffer but outside the site
// is a distinct fact. And each served EPC certificate gains
// its suggested improvements at report depth: the register's
// modelled steps in register sequence, named from the
// register schema's published list — never advice, never
// summed. No new headline claim opens anywhere in the step
// (the D36 precedent): in the short bundle the new
// constraints sub-blocks follow D28's existing derivation
// (the polygon slimming for built-up areas, a points skim
// for brownfield, exactly as listed buildings are skimmed),
// and the heritage section's new layers follow the scheduled
// monuments' precedent — present in the headline projection,
// cut from the short skim, which carries listed buildings
// and the at-point line only.

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

// A monthly equivalent: an annual pence figure spread
// evenly over 12 months, rounded to the nearest penny
// (M6.14, decision D33). One derivation, used by both
// monthly lines — the council-tax scale's and the EPC
// model's — each computed at serve time from its filed
// annual figure, never filed itself (D16's pattern).
function monthlyPenceOf(annualPence: number): number {
  return Math.round(annualPence / 12);
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
  | "ancient_woodland"
  | "built_up_area"
  | "world_heritage_site"
  | "battlefield"
  | "protected_wreck_site"
  | "world_heritage_buffer_zone";

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

// One filed brownfield site (migration 0022), as the brain
// reads it: the register's own facts for the site — address
// label, hectares, the register's planning-permission
// status, the published dwelling range — and its distance
// from the point. The port deliberately does NOT carry the
// filed site-plan URL (filed, never served, D41) and there
// is no notes field anywhere in the filing to carry.
export interface BrownfieldRow {
  reference: string | null;
  siteAddress: string | null;
  hectares: number | null;
  planningPermissionStatus: string | null;
  minimumNetDwellings: number | null;
  maximumNetDwellings: number | null;
  miles: number;
}

export interface BrownfieldFacts {
  // The table's filed site count — absence is only ever
  // computed against a proven filing (the polygon layers'
  // rule), so an unfiled table serves not-filed.
  filedCount: number;
  // Every filed site within the serving radius, nearest
  // first — the brain serves the nearest three and the
  // count (the listed buildings shape).
  within: BrownfieldRow[];
  nearestBeyond: BrownfieldRow | null;
  sourceName: string | null;
  sourceDate: string | null;
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
// keeps them serves without a brain change. The modelled
// energy costs are the opposite case: the minimisation was
// widened to file them at M6.14 (decision D33). They are
// optional here because artefacts filed before the widening
// do not carry them — a certificate read from such an
// artefact serves exactly as it did before, with no cost
// line, until the postcode is re-filed.
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
  // The register's modelled annual energy costs, in pounds
  // as published: heating, hot water and lighting, current
  // and potential (the M6.14 widening of the minimisation).
  heatingCostCurrent?: number | null;
  hotWaterCostCurrent?: number | null;
  lightingCostCurrent?: number | null;
  heatingCostPotential?: number | null;
  hotWaterCostPotential?: number | null;
  lightingCostPotential?: number | null;
  // The certificate's suggested improvements, widened into
  // the minimisation at M6.21 (decision D41): the register's
  // modelled steps as filed, in register sequence. Optional
  // for the same reason as the costs — artefacts filed
  // before the widening do not carry the key, and a
  // certificate read from one serves exactly as it did
  // before, with no improvements block, until the postcode
  // is re-filed. Null (key present) is the register's own
  // no-measures state: the certificate publishes no steps.
  suggestedImprovements?: EpcImprovement[] | null;
  // The certificate's recorded construction descriptions,
  // widened into the minimisation at M6.26 (decision D48):
  // the register's own words for the seven element groups,
  // descriptions only — the groups' per-element 0–5
  // efficiency ratings are dropped by the loader at filing
  // and never held. Optional for the same reason as the
  // costs and the improvements — artefacts filed before
  // the widening do not carry the key, and a certificate
  // read from one serves exactly as it did before, with no
  // construction block, until the postcode is re-filed. A
  // group the register does not publish for the
  // certificate files null inside the object.
  construction?: EpcConstruction | null;
}

// One certificate's filed construction descriptions
// (M6.26, D48): the register's recorded description per
// element group, in register order. Walls, roofs, floors
// and main heating are lists on the register (a home can
// record more than one construction per group); windows,
// lighting and hot water are single descriptions. A null
// group is the register's own absence for that element —
// never a value borrowed from another certificate.
export interface EpcConstruction {
  walls: string[] | null;
  roofs: string[] | null;
  floors: string[] | null;
  windows: string | null;
  lighting: string | null;
  mainHeating: string[] | null;
  hotWater: string | null;
}

// One suggested improvement as filed by the EPC loader's
// minimisation: the register's own fields for the step. The
// category files here too — it is part of the filed record —
// but no served shape carries it (the group labels the codes
// carry differ across schema vintages, D41).
export interface EpcImprovement {
  sequence: number | null;
  improvementType: string | null;
  improvementNumber: number | null;
  improvementCategory: number | null;
  typicalSaving: number | null;
  indicativeCost: string | null;
  energyRatingAfter: number | null;
  environmentalRatingAfter: number | null;
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

// One filed Air Quality Management Area as the brain
// reads it (M6.30, decision D59): the published name,
// the declaring authority as published, and the filed
// pollutant codes (detail, semicolon-joined in register
// order). The read is dedicated — PlanningShapeRow
// carries no organisation, and no other layer serves an
// authority — so planning_layers' aqma rows are read
// through this port, with the layerFacts geometry
// predicates.
export interface AqmaRow {
  name: string | null;
  authority: string | null;
  // The pollutant codes as filed ("NO2; PM10"); the
  // brain composes the words.
  detail: string | null;
}

export interface AqmaNearestRow extends AqmaRow {
  miles: number;
}

export interface AqmaFacts {
  // The layer's filed area count — absence is only ever
  // computed against a proven filing, so an unfiled
  // layer serves its not-filed state, never an absence.
  filedCount: number;
  // Covering areas in the layerFacts covering order
  // (ORDER BY name); the brain serves the first only.
  covering: AqmaRow[];
  // The single nearest area within the serving radius,
  // read only when nothing covers the point. No beyond
  // read: the none state names no distance.
  nearestWithin: AqmaNearestRow | null;
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

// One filed company-ownership title (migration 0016), as the
// M5.13 loader files it. The register's address text is a
// MATCH KEY ONLY (licence clause 3.2): the matcher parses
// it, and no served shape carries it — the address on
// screen is always the buyer's own input. price_paid and
// date_proprietor_added are filed but deliberately NOT
// carried by this port: no served shape can hold them
// (decision D15's depth boundary, held at M6.13).
export interface CompanyTitleRow {
  titleNumber: string;
  dataset: "ccod" | "ocod";
  tenure: string;
  propertyAddress: string;
  proprietorName: string;
  companyNumber: string | null;
  proprietorshipCategory: string | null;
  countryIncorporated: string | null;
  additionalProprietor: boolean;
  sourceName: string | null;
  sourceDate: string | null;
}

// One Companies House snapshot row, keyed by the company
// number AS FILED on a title. The registered office is
// filed but not carried: it never serves (D15).
export interface CompanySnapshotRow {
  companyNumber: string;
  companyName: string;
  status: string | null;
  incorporationDate: string | null;
  sicCodes: string[];
  sourceName: string | null;
  sourceDate: string | null;
}

export interface CompanyOwnershipFacts {
  // Each dataset's filed total — the guard. A No may only
  // be computed over proven filings of BOTH datasets: a No
  // read over an unfiled OCOD would be a false No for every
  // overseas-held home.
  ccodFiledCount: number;
  ocodFiledCount: number;
  // Each dataset's edition stamp, read independently of the
  // slice — an empty slice still has an edition to date a
  // No by.
  editions: Record<"ccod" | "ocod", { sourceName: string | null; sourceDate: string | null }>;
  // The postcode's filed slice, both datasets together.
  titles: CompanyTitleRow[];
  // Snapshots keyed by the company number as filed on the
  // title. A filed number the Companies House product holds
  // no row under maps to null — the named
  // number-not-in-the-snapshot state — and is never
  // repaired by name-matching.
  snapshots: Record<string, CompanySnapshotRow | null>;
}

export type TribunalOrderKind =
  "remediation-order" | "remediation-contribution-order" | "other-building-safety";

// One filed tribunal decision (migration 0015), as the
// brain reads it: the header facts only — the decision's
// own Property line verbatim, its date, its kind, its case
// reference and the GOV.UK page it was filed from. Nothing
// from a decision's body is filed, so nothing from it can
// serve.
export interface TribunalDecisionRow {
  caseRef: string;
  // The decision's own date, ISO ("2026-04-10").
  decisionDate: string;
  orderKind: TribunalOrderKind;
  propertyText: string;
  // The normalised building stem the loader filed — the
  // grouping within the postcode (the postcode is the
  // join, this is the grouping).
  buildingKey: string;
  isSingleFlat: boolean;
  sourceUrl: string;
  sourceName: string | null;
  sourceDate: string | null;
}

export interface TribunalFacts {
  // The whole table's filed count — the guard. An empty
  // line may only be computed over a proven filing: an
  // unfiled table serves the not-filed state, never a
  // zero (the company-ownership rule, D32).
  filedCount: number;
  // The filing's currency: the latest retrieved_at across
  // the table, as an ISO instant. The stage-swap re-stamps
  // every row on each quarterly pass, so this is the pass
  // date — the "as at" of the coverage line, which
  // qualifies the index's currency, not the newest
  // decision (a latest-decision date would mislead whenever
  // the newest decision at a postcode is old but the
  // filing is fresh, which is the normal case).
  lastFiledAt: string | null;
  // The dataset's source name as filed (the loader's
  // constant), read independently of the slice — an empty
  // slice still has a source to name.
  sourceName: string | null;
  // The postcode's filed slice, decision date then case
  // reference. Rows whose Property printed no full
  // postcode file with a NULL postcode and are in no
  // slice: they can never be served for a postcode, which
  // is exactly why the coverage line is bounded to orders
  // "naming this postcode" and the explainer carries the
  // completeness caveat.
  rows: TribunalDecisionRow[];
}

// The filed Ofcom broadband answer for one postcode
// (loaders/load-broadband.mjs, the all-premises series),
// mapped to camelCase by the source. The port carries the
// whole filed answer; the builder chooses what serves —
// the NGA percentage and the unable-to-receive family are
// filed but never served (each is a headline figure read
// from the other end, or a legacy label that overlaps
// superfast without equalling it).
export interface BroadbandAnswerFacts {
  basis: string;
  snapshot: string;
  gigabitCapablePct: number;
  superfast30Pct: number;
  ultrafast100Pct: number;
  ultrafast300Pct: number;
  ngaPct: number;
  unable2Pct: number;
  unable5Pct: number;
  unable10Pct: number;
  unable30Pct: number;
  unableDecentFixedOrFwaPct: number;
  decentViaFwaPct: number;
  speedBandPct: {
    under_2: number;
    "2_to_5": number;
    "5_to_10": number;
    "10_to_30": number;
    "30_to_300": number;
    "300_plus": number;
  };
}

// One filed mobile coverage set: Ofcom's published pair
// (no operator / all four operators) plus its own
// sanctioned derivation (100 minus the no-operator
// figure). A figure is null only when its column is
// unpublished in the release — the 5G standalone
// all-operators columns are the standing case — and the
// set itself is null only when both are.
export interface MobileCoverageSetFacts {
  noOperatorPct: number | null;
  allOperatorsPct: number | null;
  atLeastOneOperatorPct: number | null;
}

export interface MobileServiceFacts {
  outdoor: MobileCoverageSetFacts | null;
  // Only 4G files an indoor set; every 5G variant is
  // outdoor-only in the published file.
  indoor?: MobileCoverageSetFacts | null;
}

// The filed Ofcom mobile answer for the postcode's own
// council area (loaders/load-mobile.mjs) — an area
// figure, filed onto every postcode in the authority,
// never a postcode measurement.
export interface MobileAnswerFacts {
  basis: string;
  snapshot: string;
  laua: string;
  lauaName: string;
  services: Record<string, MobileServiceFacts>;
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
  // The filed brownfield sites around the point (M6.21):
  // the register's recorded sites as points, in the listed
  // buildings read shape.
  brownfieldFacts(latitude: number, longitude: number): Promise<BrownfieldFacts>;
  // Whether the postcode's council is positively recorded
  // in the brownfield supplier gate (migration 0022).
  // "None found" may be served only on a positive answer —
  // the Article 4 rule, for the same reason.
  brownfieldGate(council: string | null): Promise<boolean>;
  // The postcode's filed EPC artefact, or null when the check
  // has never loaded the postcode's certificates.
  epcArtefact(postcode: string): Promise<EpcArtefact | null>;
  // Load the postcode's certificates through the existing
  // loader path (loaders/load-epc.mjs), the D23 pattern.
  loadEpc(postcode: string): Promise<void>;
  // The latest filed tax year's row for the billing authority
  // the directory names, or null — an unfiled authority and a
  // name that joins to nothing both land here, and both serve
  // the named not-filed state, never a borrowed figure.
  councilTaxRow(council: string | null): Promise<CouncilTaxFacts | null>;
  censusRow(msoaCode: string): Promise<CensusFacts | null>;
  imdRow(lsoaCode: string): Promise<ImdFacts | null>;
  airSquare(latitude: number, longitude: number): Promise<AirFacts | null>;
  // The filed Air Quality Management Areas around the
  // point (M6.30): a dedicated read of planning_layers'
  // aqma rows, carrying the declaring authority no other
  // layer serves. Independent of the PCM square — an air
  // not-filed section can still carry a served AQMA
  // block and vice versa.
  aqmaFacts(latitude: number, longitude: number): Promise<AqmaFacts>;
  noiseRows(postcode: string): Promise<NoiseFacts>;
  benefits(lsoaCode: string): Promise<BenefitsFacts>;
  solarCell(cellRef: string): Promise<SolarFacts>;
  // The postcode's company-ownership facts (M6.13). The
  // builder calls this ONLY when the company-ownership flag
  // is on: while COMPANY_OWNERSHIP_ENABLED is false, the
  // default path makes no read of these tables at all —
  // the flag's promise, kept structurally (D18/D32).
  companyOwnershipFacts(postcode: string): Promise<CompanyOwnershipFacts>;
  // The building-safety facts (M6.16): the tribunal
  // table's guard count and filing currency, plus the
  // postcode's filed decision slice. Read at rungs 1 and
  // 2 alike — the tribunal answer is a postcode fact.
  tribunalFacts(postcode: string): Promise<TribunalFacts>;
  // The postcode's filed Ofcom broadband answer, or null
  // when the filing carries no answer for it (M6.17) —
  // absence serves the named not-filed state, never a 0%
  // reading.
  broadbandAnswer(postcode: string): Promise<BroadbandAnswerFacts | null>;
  // The filed Ofcom mobile answer for the postcode's own
  // council area, or null when the postcode's council
  // matched no published authority at filing time.
  mobileAnswer(postcode: string): Promise<MobileAnswerFacts | null>;
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
  // so its absence wordings are never served from it. The
  // not-filed sentence is one two-part form across the
  // bundle (M6.9, decision D30): what is missing, then what
  // it costs the reader — the dataset's name kept in both
  // halves.
  if (facts.filedCount <= 0) {
    return {
      ...base,
      line: `the ${spec.label.toLowerCase()} data is not filed yet, so no ${spec.label.toLowerCase()} answer can be given yet`,
    };
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
  // Brownfield land and built-up areas (M6.21, D41) — two
  // more sub-blocks in this section, each with its own
  // absence rule (see their builders below).
  brownfield: BrownfieldAnswer;
  builtUpArea: PolygonLayerAnswer;
}

// One recorded brownfield site as served: the register's own
// facts for the site and its distance from the point. The
// label is the register's site address, verbatim — it names
// the site as the register names it, never a plot finding.
export interface BrownfieldSite {
  reference: string | null;
  label: string;
  miles: number;
  hectares: number | null;
  hectaresLine: string | null;
  planningPermissionStatus: string | null;
  statusLine: string | null;
  dwellingsLine: string | null;
  line: string;
}

// Brownfield land (M6.21, decision D41): recorded sites as
// points, served in the listed buildings shape — nearest
// three plus the count within 2 miles. The dataset
// publishes a representative point per site and no boundary,
// so no served form claims anything about this home's plot:
// the lines are about recorded sites near the point, and the
// section's explainer says the point is not a boundary.
// Absence is gated on supply, the Article 4 pattern: "none
// found" serves only for a council positively recorded in
// the supplier gate; elsewhere the state is not-published.
export interface BrownfieldAnswer {
  label: "Brownfield land";
  state: "served" | "none-found" | "not-published" | "not-filed";
  within: BrownfieldSite[];
  countWithin: number | null;
  beyondNearest: BrownfieldSite | null;
  beyondLine: string | null;
  line: string;
  // Whether the postcode's council is positively recorded
  // in the supplier gate — the evidence the absence state
  // rests on, served with the answer (the Article 4 form).
  councilPublishes: boolean;
  sourceName: string | null;
  sourceDate: string | null;
  sourceLine: string | null;
}

function toBrownfieldSite(row: BrownfieldRow): BrownfieldSite {
  const label = row.siteAddress ?? "an unnamed recorded site";
  const miles = round3(row.miles);
  const hectaresLine =
    row.hectares === null ? null : `the register records the site at ${row.hectares} hectares`;
  const statusLine =
    row.planningPermissionStatus === null
      ? null
      : `the register records its planning permission status as ${row.planningPermissionStatus}`;
  const dwellingsLine =
    row.minimumNetDwellings === null && row.maximumNetDwellings === null
      ? null
      : row.minimumNetDwellings !== null &&
          row.maximumNetDwellings !== null &&
          row.minimumNetDwellings !== row.maximumNetDwellings
        ? `the register publishes ${row.minimumNetDwellings} to ${row.maximumNetDwellings} net dwellings for the site`
        : `the register publishes ${(row.minimumNetDwellings ?? row.maximumNetDwellings) as number} net dwellings for the site`;
  return {
    reference: row.reference,
    label,
    miles,
    hectares: row.hectares,
    hectaresLine,
    planningPermissionStatus: row.planningPermissionStatus,
    statusLine,
    dwellingsLine,
    line: `${label} — ${miles} miles away (${DISTANCE_BASIS_LABEL})`,
  };
}

function buildBrownfield(
  facts: BrownfieldFacts,
  councilPublishes: boolean,
  nation: Nation,
): BrownfieldAnswer {
  const base = {
    label: "Brownfield land" as const,
    councilPublishes,
    sourceName: facts.sourceName,
    sourceDate: facts.sourceDate,
    sourceLine: sourceLineOf(facts.sourceName, facts.sourceDate),
  };
  if (facts.filedCount <= 0) {
    return {
      ...base,
      state: "not-filed",
      within: [],
      countWithin: null,
      beyondNearest: null,
      beyondLine: null,
      line: "the brownfield land data is not filed yet, so no brownfield answer can be given yet",
    };
  }
  // The register covers England: a point elsewhere serves
  // the not-published form with its coverage reason — the
  // filed sites are England's councils' registers, and a
  // Welsh or Scottish "none" from them would be a false
  // figure (the listed buildings rule).
  const covered = nation === "england";
  const within = covered ? facts.within.slice(0, 3).map(toBrownfieldSite) : [];
  const countWithin: number | null = covered ? facts.within.length : null;
  let beyondNearest: BrownfieldSite | null = null;
  let beyondLine: string | null = null;
  // The beyond line asserts "none within 2 miles", so it is
  // gated exactly as the none-found state is: for a council
  // that does not supply the register, the filed data cannot
  // prove the absence the line states.
  if (covered && councilPublishes && countWithin === 0 && facts.nearestBeyond) {
    beyondNearest = toBrownfieldSite(facts.nearestBeyond);
    beyondLine = `none within ${RADIUS_MILES} miles — the nearest recorded site is ${beyondNearest.label}, ${beyondNearest.miles} miles away (${DISTANCE_BASIS_LABEL})`;
  }
  if (!covered) {
    return {
      ...base,
      state: "not-published",
      within: [],
      countWithin: null,
      beyondNearest: null,
      beyondLine: null,
      line: `the brownfield register filed covers England — brownfield registers in ${nationName(nation)} are held by its own councils and are not filed, so no finding can be made from the data`,
    };
  }
  if (countWithin !== null && countWithin > 0) {
    return {
      ...base,
      state: "served",
      within,
      countWithin,
      beyondNearest: null,
      beyondLine: null,
      line: `${countWithin} recorded brownfield site${countWithin === 1 ? "" : "s"} within ${RADIUS_MILES} miles of the postcode point`,
    };
  }
  return {
    ...base,
    state: councilPublishes ? "none-found" : "not-published",
    within: [],
    // A proven none serves its 0; an unpublished absence
    // serves no count at all — a 0 beside "not published"
    // would read as the finding the gate exists to refuse.
    countWithin: councilPublishes ? 0 : null,
    beyondNearest,
    beyondLine,
    line: councilPublishes
      ? "no brownfield sites are recorded within 2 miles of the postcode point on the national register"
      : "this council does not supply the national brownfield register, so no finding can be made from the data — the council's own brownfield register is the record",
  };
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
      ? "Article 4 directions are not published by this council to the national dataset, so no finding can be made from the data — the answer lives on the council's own planning register"
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
      : "no green belt covers this postcode point in the national data",
};

// Built-up areas (M6.21, D41): the ONS December 2024
// polygons, served in the green-belt shape. The inside line
// names the filed area — within Greater London that name is
// the borough's, because the geography follows borough
// boundaries there; the served name is always the filed
// polygon's, never an invented settlement name. The dataset
// covers England and Wales (the December 2024 edition drops
// Scotland, which the previous edition covered), so a
// Scottish or Northern Irish point serves the not-covered
// form of the absence.
const BUILT_UP_AREA_SPEC: PolygonSpec = {
  layer: "built_up_area",
  label: "Built-up area",
  unnamedName: "an unnamed built-up area",
  insideLine: (name) => `the postcode point falls inside the ${name} built-up area`,
  absenceLine: (absence) =>
    absence === "sparse-coverage"
      ? "the built-up area data filed covers England and Wales, and no built-up area is filed near this point"
      : "no built-up area covers this postcode point in the data filed",
};

function buildConstraints(
  resolution: Extract<AddressResolution, { rung: 1 | 2 }>,
  factsByLayer: Record<string, PlanningLayerFacts>,
  article4Publishes: boolean,
  nation: Nation,
  brownfieldFactsValue: BrownfieldFacts,
  brownfieldPublishes: boolean,
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

  const builtUpArea = buildPolygonLayer(
    BUILT_UP_AREA_SPEC,
    factsByLayer.built_up_area,
    // England and Wales are the dataset's coverage, so an
    // absence there is a proven none; Scotland and Northern
    // Ireland are outside the December 2024 edition, and
    // their absence is the coverage state, never a finding.
    nation === "england" || nation === "wales" ? "none-found" : "sparse-coverage",
  );

  return {
    depth: "headline",
    grain: "postcode point",
    grainLine: "facts about the postcode point on the published maps",
    explainer:
      "Planning designations are mapped against the postcode point, not the plot: at a boundary the point and the plot can fall either side, and the council's own map decides borderline cases. Brownfield sites are recorded as a point for each site, not a boundary — a site near the point is a recorded site nearby, never a finding about this home's plot.",
    sourceName: null,
    sourceDate: null,
    sourceLine: null,
    state: "served",
    conservationArea,
    article4,
    greenBelt,
    brownfield: buildBrownfield(brownfieldFactsValue, brownfieldPublishes, nation),
    builtUpArea,
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
  // The M6.21 layers (decision D41): four more NHLE polygon
  // datasets in the monument shape. The buffer zone is its
  // own sub-block, never folded into the site's answer — a
  // home inside a buffer zone but outside the site is a
  // distinct fact, and the two lines say different things.
  worldHeritageSites: PolygonLayerAnswer;
  battlefields: PolygonLayerAnswer;
  protectedWrecks: PolygonLayerAnswer;
  worldHeritageBufferZones: PolygonLayerAnswer;
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

// The M6.21 heritage layers' specs: the monument shape with
// each dataset's own words. All four are NHLE (England)
// datasets, so a non-English absence is the coverage state.
const WORLD_HERITAGE_SITE_SPEC: PolygonSpec = {
  layer: "world_heritage_site",
  label: "World heritage site",
  unnamedName: "an unnamed world heritage site",
  insideLine: (name) => `the postcode point falls inside the ${name} world heritage site`,
  absenceLine: (absence) =>
    absence === "sparse-coverage"
      ? "the world heritage sites filed cover England, and none is filed near this point"
      : "no world heritage site covers this postcode point in the national data",
};

const BATTLEFIELD_SPEC: PolygonSpec = {
  layer: "battlefield",
  label: "Registered battlefield",
  unnamedName: "an unnamed registered battlefield",
  insideLine: (name) => `the postcode point falls inside the ${name} registered battlefield`,
  absenceLine: (absence) =>
    absence === "sparse-coverage"
      ? "the registered battlefields filed cover England, and none is filed near this point"
      : "no registered battlefield covers this postcode point in the national data",
};

const PROTECTED_WRECK_SPEC: PolygonSpec = {
  layer: "protected_wreck_site",
  label: "Protected wreck site",
  unnamedName: "an unnamed protected wreck site",
  insideLine: (name) => `the postcode point falls inside the ${name} protected wreck site`,
  absenceLine: (absence) =>
    absence === "sparse-coverage"
      ? "the protected wreck sites filed cover England, and none is filed near this point"
      : "no protected wreck site covers this postcode point in the national data",
};

const WORLD_HERITAGE_BUFFER_SPEC: PolygonSpec = {
  layer: "world_heritage_buffer_zone",
  label: "World heritage site buffer zone",
  unnamedName: "an unnamed world heritage site buffer zone",
  insideLine: (name) =>
    `the postcode point falls inside the buffer zone of the ${name} world heritage site`,
  absenceLine: (absence) =>
    absence === "sparse-coverage"
      ? "the world heritage site buffer zones filed cover England, and none is filed near this point"
      : "no world heritage site buffer zone covers this postcode point in the national data",
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
  heritageLayers: Record<string, PlanningLayerFacts>,
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
      "Listed buildings are recorded as points with a name, a grade and an NHLE number — no source publishes a listed building's address, so a nearby point is a match to check, not a finding about a specific home. The grades are the list's ranking of significance: Grade I buildings are of exceptional interest, Grade II* buildings are particularly important buildings of more than special interest, and Grade II buildings are of special interest.",
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
          ? "the listed buildings data is not filed yet, so no listed buildings answer can be given yet"
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
    worldHeritageSites: buildPolygonLayer(
      WORLD_HERITAGE_SITE_SPEC,
      heritageLayers.world_heritage_site,
      nation === "england" ? "none-found" : "sparse-coverage",
    ),
    battlefields: buildPolygonLayer(
      BATTLEFIELD_SPEC,
      heritageLayers.battlefield,
      nation === "england" ? "none-found" : "sparse-coverage",
    ),
    protectedWrecks: buildPolygonLayer(
      PROTECTED_WRECK_SPEC,
      heritageLayers.protected_wreck_site,
      nation === "england" ? "none-found" : "sparse-coverage",
    ),
    worldHeritageBufferZones: buildPolygonLayer(
      WORLD_HERITAGE_BUFFER_SPEC,
      heritageLayers.world_heritage_buffer_zone,
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
  // The filed-count guard's line (M6.9, decision D30): one
  // sentence per designation type whose table holds no
  // filing, joined — that type's absence is withheld, the
  // filed types still answer. Null when all four are filed.
  // When all four are unfiled, placesLine itself carries
  // the section's not-filed form and this line still names
  // each type.
  designationsLine: string | null;
  ancientWoodland: PolygonLayerAnswer;
  // The Ancient Woodland Inventory's own caveat, served
  // with the section (M6.18, decision D37): the inventory
  // is provisional, so its absence line is a statement
  // about the inventory, and this line is what keeps it
  // one. (The constant existed unserved before this step.)
  ancientWoodlandInventoryLine: string;
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
  // The filed-count guard (M6.9, decision D30 — the flood
  // form, applied per designation type): a type whose
  // table holds no filing is removed from the grouping
  // input entirely, so neither its absence NOR any stray
  // row filed under it can be served as a finding, and it
  // names itself in designationsLine instead. The filed
  // types answer exactly as before.
  const unfiledTypes = DESIGNATION_ORDER.filter(
    (type) => designationFacts.byType[type].filedCount <= 0,
  );
  const guardedFacts: DesignationFacts =
    unfiledTypes.length === 0
      ? designationFacts
      : {
          byType: Object.fromEntries(
            DESIGNATION_ORDER.map((type) => [
              type,
              unfiledTypes.includes(type)
                ? {
                    ...designationFacts.byType[type],
                    covering: [],
                    nearestWithin: [],
                    nearestBeyond: null,
                  }
                : designationFacts.byType[type],
            ]),
          ) as DesignationFacts["byType"],
          overlaps: designationFacts.overlaps,
        };
  const designationsLine =
    unfiledTypes.length === 0
      ? null
      : unfiledTypes
          .map(
            (type) =>
              `the ${DESIGNATION_LABELS[type]} designation data is not filed yet, so no ${DESIGNATION_LABELS[type]} answer can be given yet`,
          )
          .join("; ");
  const { within, beyond } = groupDesignations(guardedFacts);
  const coverageLine =
    nation === "england"
      ? null
      : `the nature designations filed come from Natural England's England services, so an absence in ${nationName(nation)} is a coverage fact, not a finding`;

  const priorityHabitat: PriorityHabitatAnswer =
    phi.filedCount <= 0
      ? {
          state: "not-filed",
          line: "priority habitat records are not filed yet, so no habitat answer can be given yet",
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
      "Designations are grouped by place: one site can carry several designations over the same ground, and they are named together so the stack reads as one place, not several. The designations are: SSSI is a Site of Special Scientific Interest, SAC is a Special Area of Conservation, SPA is a Special Protection Area, and a Ramsar site is a wetland of international importance under the Ramsar Convention.",
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
      unfiledTypes.length === DESIGNATION_ORDER.length
        ? "nature designations are not filed yet, so no designation answer can be given yet"
        : within.length > 0
          ? `${within.length} designated site${within.length === 1 ? "" : "s"} at or within ${RADIUS_MILES} miles of the postcode point`
          : `no designated site at or within ${RADIUS_MILES} miles of the postcode point`,
    designationsLine,
    ancientWoodland: buildPolygonLayer(
      ANCIENT_WOODLAND_SPEC,
      woodlandFacts,
      nation === "england" ? "none-found" : "sparse-coverage",
    ),
    ancientWoodlandInventoryLine: ANCIENT_WOODLAND_INVENTORY_LINE,
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
// never a bare fact. The register's modelled energy costs
// serve per certificate on the same discipline (M6.14,
// D33): as filed, with the assessment date carried by the
// certificate itself, disagreements whole and unranked —
// 6 Exeter Road's two certificates model £92.00 and £29.25
// a month, and both stand.
// ------------------------------------------------------------------

// The register's modelled energy costs for one certificate
// (M6.14, decision D33): the filed annual figures summed
// over heating, hot water and lighting, with the monthly
// equivalents derived at serve time (the annual figure
// spread over 12). Current is the home as assessed;
// potential is the same model with the certificate's
// recommended improvements in place. Both are the
// register's own model — standard occupancy and heating
// pattern, fuel prices at the assessment date — served per
// certificate, disagreements whole and unranked, never
// summed with anything else.
export interface ServedEnergyCosts {
  currentAnnualPence: number;
  currentAnnualLabel: string;
  currentMonthlyPence: number;
  currentMonthlyLabel: string;
  potentialAnnualPence: number | null;
  potentialAnnualLabel: string | null;
  potentialMonthlyPence: number | null;
  potentialMonthlyLabel: string | null;
  line: string;
  potentialLine: string | null;
}

// One suggested improvement as served (M6.21, D41): the
// register's modelled step, its name resolved from the
// register schema's published improvement list — null where
// the list holds no name for the filed number, in which case
// the step serves its figures with no name and no code: a
// bare code or an invented name never reaches a reader.
export interface ServedImprovementStep {
  sequence: number | null;
  name: string | null;
  typicalSavingPence: number | null;
  typicalSavingLabel: string | null;
  indicativeCost: string | null;
  energyRatingAfter: number | null;
  environmentalRatingAfter: number | null;
  line: string;
}

// A certificate's suggested improvements as served: the
// register's modelled facts, in register sequence, named as
// the certificate's own suggestions — never advice, never
// summed into a headline (the savings stay per-step; the
// closing line carries only the final step's cumulative
// ratings). Report depth: the block exists only on a served
// certificate, which exists only at rung 1, and the headline
// projection never picks it.
export interface ServedImprovements {
  state: "served" | "none-published";
  line: string;
  steps: ServedImprovementStep[];
  closingLine: string | null;
}

// One element group of a certificate's construction block
// as served (M6.26, D48): the register's recorded
// descriptions for the group, verbatim and in filed order,
// with the group's composed line. An absent group serves
// no descriptions and the named not-recorded line — never
// a value borrowed from another certificate or group.
export interface ServedConstructionGroup {
  key: "walls" | "roofs" | "floors" | "windows" | "lighting" | "mainHeating" | "hotWater";
  label: string;
  descriptions: string[];
  line: string;
}

// A certificate's construction block as served (M6.26,
// decision D48): the certificate's own recorded
// descriptions of how the home is built, per element
// group, at report depth — the block exists only on a
// served certificate, which exists only at rung 1, and
// the headline projection never picks it. The block's
// line is the pinned basis line (D13): what these
// descriptions are and what an "(assumed)" marker means.
// The U-value line serves only where a description
// carries a transmittance figure: a U-value appears
// solely as text inside a new-build SAP description,
// never extracted, computed or converted — there is no
// numeric U-value field anywhere in this shape.
export interface ServedConstruction {
  line: string;
  uValueLine: string | null;
  groups: ServedConstructionGroup[];
}

export interface ServedCertificate {
  certificateNumber: string;
  address: string;
  band: string | null;
  rating: number | null;
  // The rating's scale line (M6.18, decision D37): the
  // rating is a bare number without it — nothing else in
  // the served shape states what the number is a score
  // of, or that the band derives from it. Null where the
  // register filed no rating: no figure, no line.
  ratingLine: string | null;
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
  // The register's modelled energy costs for THIS
  // certificate, or null where the filed artefact predates
  // the M6.14 widening (or the register published no
  // complete cost set for it): the certificate then serves
  // exactly as it did before the widening, no cost line.
  energyCosts: ServedEnergyCosts | null;
  // The certificate's suggested improvements (M6.21), or
  // null where the filed artefact predates the M6.21
  // widening — the certificate then serves exactly as it
  // did before, with no improvements block, until the
  // postcode is re-filed. A present block in its
  // none-published state is the register's own fact: the
  // certificate publishes no steps.
  improvements: ServedImprovements | null;
  // The certificate's recorded construction descriptions
  // (M6.26, D48), or null where the filed artefact
  // predates the M6.26 widening — the certificate then
  // serves exactly as it did before, with no construction
  // block, until the postcode is re-filed.
  construction: ServedConstruction | null;
}

// One band's share of one spread row: how many of the
// row's filed certificates sit at this band, and that count
// as a percentage of the row's own base, computed at serve
// time from the filed counts (the Census pattern — counts
// first, the base always named in the row's line).
export interface EpcSpreadBand {
  // The register's band letter, or null where the register
  // recorded no band for the certificate. Such a certificate
  // still counts in the row's base and serves in this
  // absence form — never dropped, never folded into a
  // neighbouring band.
  band: string | null;
  count: number;
  pct: number;
}

// One row of the spread: the filed certificates of ONE
// assessment kind at the postcode, on their own base.
// Predicted (SAP) and assessed (RdSAP) certificates are
// never combined into one distribution (D34): at Birkdale
// the combined figure would read 90.5 percent band B while
// every B is a new-build prediction and all four assessed
// homes rate C or D.
export interface EpcSpreadRow {
  kind: "predicted" | "assessed";
  // The row's base: the filed certificates of this kind.
  count: number;
  // Bands in A–G order, the no-band form last; a band with
  // no certificates does not appear.
  bands: EpcSpreadBand[];
  line: string;
}

// The postcode's EPC spread (M6.15, decision D34): how the
// certificates the register holds at the whole postcode
// spread across bands. A postcode-grain sub-block inside
// this home-grain section, under its own grain line. The
// counting unit is certificates, never homes — a homes
// count would need a latest-per-home pick, and picking a
// winner among a home's disagreeing certificates is the
// ranking D26 forbids (10 Exeter Road holds a predicted
// band B from 2013 and an assessed band C from 2025; both
// stand in this count). The block is a pure function of
// the filed artefact: it references the checked home's own
// certificates not at all, and no comparison between the
// home's band and the spread is computed or phrased (the
// D23 sold-prices rule, applied to bands).
export interface EpcSpread {
  // The sub-block's own grain, named in its words — the
  // section's grain stays "home".
  grainLine: "the postcode's recorded certificates";
  certificateCount: number;
  explainer: string;
  // One row per assessment kind present at the postcode,
  // predicted first; a kind with no certificates serves no
  // row (Beaulieu and Minerva serve the predicted row
  // alone).
  rows: EpcSpreadRow[];
}

export interface EpcSection extends AreaSectionMeta {
  state: "served" | "not-filed" | "filed-zero" | "none-matching" | "needs-exact-home";
  line: string | null;
  certificates: ServedCertificate[];
  // How many certificates the register holds at the whole
  // postcode — context for the none-matching state, and
  // the spread's base.
  certificateCountAtPostcode: number | null;
  // The newest matched certificate's band — the headline line.
  headlineBand: string | null;
  // The postcode's spread of recorded certificates (see
  // EpcSpread). Null where the postcode's artefact holds
  // no certificates (filed-zero) or could not be loaded
  // (not-filed): one artefact, one zero, one line — the
  // section's own state line already says it. Report
  // depth: the headline projection does not carry it.
  spread: EpcSpread | null;
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

// One side (current or potential) of the register's
// modelled costs, summed over heating, hot water and
// lighting into annual pence. Null unless all three
// components are filed numbers: a partial cost set is not
// a figure, and a certificate filed before the widening
// carries none of them.
function annualCostPence(parts: (number | null | undefined)[]): number | null {
  if (parts.some((p) => typeof p !== "number" || !Number.isFinite(p))) return null;
  return Math.round((parts as number[]).reduce((sum, p) => sum + p, 0) * 100);
}

// A certificate's filed improvements as served: register
// sequence (the loader files them sorted; the sort here is
// the serve-time guarantee), names resolved from the
// published list, savings never summed — the block's only
// aggregate-shaped element is its closing line, which
// carries the FINAL step's cumulative ratings and nothing
// else (D41).
function toServedImprovements(cert: EpcCertificate): ServedImprovements | null {
  if (cert.suggestedImprovements === undefined) return null;
  if (cert.suggestedImprovements === null || cert.suggestedImprovements.length === 0) {
    return {
      state: "none-published",
      line: "the certificate publishes no suggested improvements",
      steps: [],
      closingLine: null,
    };
  }
  const steps: ServedImprovementStep[] = [...cert.suggestedImprovements]
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    .map((step) => {
      const name = improvementName(step.improvementNumber);
      const typicalSavingPence =
        step.typicalSaving === null ? null : Math.round(step.typicalSaving * 100);
      const typicalSavingLabel =
        typicalSavingPence === null ? null : formatPounds(typicalSavingPence);
      const fragments: string[] = [];
      if (name) fragments.push(name);
      if (typicalSavingLabel) fragments.push(`typical saving ${typicalSavingLabel} a year`);
      if (step.indicativeCost) fragments.push(`indicative cost ${step.indicativeCost}`);
      if (step.energyRatingAfter !== null)
        fragments.push(`energy rating after this step ${step.energyRatingAfter}`);
      if (step.environmentalRatingAfter !== null)
        fragments.push(`environmental rating after this step ${step.environmentalRatingAfter}`);
      return {
        sequence: step.sequence,
        name,
        typicalSavingPence,
        typicalSavingLabel,
        indicativeCost: step.indicativeCost,
        energyRatingAfter: step.energyRatingAfter,
        environmentalRatingAfter: step.environmentalRatingAfter,
        line: fragments.join(" · "),
      };
    });
  const last = steps[steps.length - 1];
  const closingFragments: string[] = [];
  if (last.energyRatingAfter !== null)
    closingFragments.push(`an energy rating of ${last.energyRatingAfter}`);
  if (last.environmentalRatingAfter !== null)
    closingFragments.push(`an environmental rating of ${last.environmentalRatingAfter}`);
  return {
    state: "served",
    line: "the certificate's suggested improvements, in the register's order — the register's modelled steps for this home, not advice",
    steps,
    closingLine:
      closingFragments.length > 0
        ? `after all ${steps.length} step${steps.length === 1 ? "" : "s"}, the register's model gives ${closingFragments.join(" and ")}`
        : null,
  };
}

// The construction block's pinned basis line (M6.26,
// decision D48, on D13): what the descriptions are, and
// what an "(assumed)" marker on an existing-home (RdSAP)
// certificate means. Served on every construction block.
const CONSTRUCTION_BASIS_LINE =
  "the certificate's own description of this home's construction, recorded at the assessment; on an existing-home (RdSAP) certificate '(assumed)' means the assessor could not inspect that part and recorded the standard assumption for a home of its kind.";

// The U-value line (M6.26, D48, on D13), pinned: served
// only where a description carries a transmittance
// figure — the register's new-build SAP wording. The
// figure itself stays text inside the description; this
// line says what the measure is, and no numeric U-value
// is ever extracted from the text.
const CONSTRUCTION_U_VALUE_LINE =
  "the U-value in a description is the register's measure of how fast heat passes through that part of the home, in watts per square metre for each degree of temperature difference — lower lets less heat escape.";

// The register's element groups in register order, with
// their served labels (M6.26, D48).
const CONSTRUCTION_GROUPS: {
  key: ServedConstructionGroup["key"];
  label: string;
  filed: (construction: EpcConstruction) => string[] | null;
}[] = [
  { key: "walls", label: "Walls", filed: (c) => c.walls },
  { key: "roofs", label: "Roofs", filed: (c) => c.roofs },
  { key: "floors", label: "Floors", filed: (c) => c.floors },
  { key: "windows", label: "Windows", filed: (c) => (c.windows === null ? null : [c.windows]) },
  { key: "lighting", label: "Lighting", filed: (c) => (c.lighting === null ? null : [c.lighting]) },
  {
    key: "mainHeating",
    label: "Main heating",
    filed: (c) => c.mainHeating,
  },
  {
    key: "hotWater",
    label: "Hot water",
    filed: (c) => (c.hotWater === null ? null : [c.hotWater]),
  },
];

// A certificate's filed construction descriptions as
// served: register order, descriptions verbatim — the
// register's own words, "(assumed)" markers and
// ampersands included, disagreements between a home's
// certificates standing whole because each certificate
// serves its own block. Null where the filed artefact
// predates the M6.26 widening.
function toServedConstruction(cert: EpcCertificate): ServedConstruction | null {
  if (cert.construction === undefined || cert.construction === null) return null;
  const filed = cert.construction;
  const groups: ServedConstructionGroup[] = CONSTRUCTION_GROUPS.map(
    ({ key, label, filed: pick }) => {
      const descriptions = pick(filed) ?? [];
      return {
        key,
        label,
        descriptions,
        line:
          descriptions.length > 0
            ? `${label}: ${descriptions.join("; ")}`
            : `${label}: not recorded on this certificate`,
      };
    },
  );
  const hasTransmittance = groups.some((group) =>
    group.descriptions.some((description) => /transmittance|u-value/i.test(description)),
  );
  return {
    line: CONSTRUCTION_BASIS_LINE,
    uValueLine: hasTransmittance ? CONSTRUCTION_U_VALUE_LINE : null,
    groups,
  };
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

  const currentAnnualPence = annualCostPence([
    cert.heatingCostCurrent,
    cert.hotWaterCostCurrent,
    cert.lightingCostCurrent,
  ]);
  const potentialAnnualPence = annualCostPence([
    cert.heatingCostPotential,
    cert.hotWaterCostPotential,
    cert.lightingCostPotential,
  ]);
  const energyCosts: ServedEnergyCosts | null =
    currentAnnualPence === null
      ? null
      : {
          currentAnnualPence,
          currentAnnualLabel: formatPounds(currentAnnualPence),
          currentMonthlyPence: monthlyPenceOf(currentAnnualPence),
          currentMonthlyLabel: formatPounds(monthlyPenceOf(currentAnnualPence)),
          potentialAnnualPence,
          potentialAnnualLabel:
            potentialAnnualPence === null ? null : formatPounds(potentialAnnualPence),
          potentialMonthlyPence:
            potentialAnnualPence === null ? null : monthlyPenceOf(potentialAnnualPence),
          potentialMonthlyLabel:
            potentialAnnualPence === null
              ? null
              : formatPounds(monthlyPenceOf(potentialAnnualPence)),
          line: `the register models this home's energy costs at ${formatPounds(monthlyPenceOf(currentAnnualPence))} a month (${formatPounds(currentAnnualPence)} a year) on a standard occupancy pattern, priced at the assessment date — a model, not a bill`,
          potentialLine:
            potentialAnnualPence === null
              ? null
              : `with the improvements this certificate recommends, the same model gives ${formatPounds(monthlyPenceOf(potentialAnnualPence))} a month (${formatPounds(potentialAnnualPence)} a year)`,
        };

  return {
    certificateNumber: cert.certificateNumber,
    address,
    band: cert.band,
    rating: cert.ratingCurrent,
    ratingLine:
      cert.ratingCurrent === null
        ? null
        : "this number is the register's energy-efficiency measure for this home — the certificate's band derives from it",
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
    energyCosts,
    improvements: toServedImprovements(cert),
    construction: toServedConstruction(cert),
  };
}

// ------------------------------------------------------------------
// The postcode's EPC spread (M6.15, decision D34) — computed
// from the same artefact read as the home's own answer, so
// it inherits the read, the source line, the cold-load path
// and the D29 artefact-hash cache guard unchanged. It is a
// postcode fact: it serves at rungs 1 and 2 alike, including
// beside the none-matching and needs-exact-home states,
// whose subjects are the home, not the postcode.
// ------------------------------------------------------------------

const EPC_BAND_ORDER = ["A", "B", "C", "D", "E", "F", "G"];

function joinFragments(fragments: string[]): string {
  if (fragments.length <= 1) return fragments.join("");
  return `${fragments.slice(0, -1).join(", ")} and ${fragments[fragments.length - 1]}`;
}

function spreadRow(
  kind: EpcSpreadRow["kind"],
  certificates: EpcCertificate[],
): EpcSpreadRow | null {
  if (certificates.length === 0) return null;
  const counts = new Map<string | null, number>();
  for (const cert of certificates) counts.set(cert.band, (counts.get(cert.band) ?? 0) + 1);
  const known = EPC_BAND_ORDER.filter((band) => counts.has(band));
  const other = [...counts.keys()].filter(
    (band): band is string => band !== null && !EPC_BAND_ORDER.includes(band),
  );
  const ordered: (string | null)[] = [...known, ...other, ...(counts.has(null) ? [null] : [])];
  const bands: EpcSpreadBand[] = ordered.map((band) => {
    const count = counts.get(band) ?? 0;
    return { band, count, pct: round1((count / certificates.length) * 100) };
  });
  const fragments = bands.map(({ band, count, pct }) =>
    band === null
      ? `${count} ${count === 1 ? "has" : "have"} no band recorded (${pct} percent)`
      : `${count} ${count === 1 ? "is" : "are"} band ${band} (${pct} percent)`,
  );
  const base =
    kind === "predicted"
      ? `of the ${certificates.length} predicted (SAP) certificate${certificates.length === 1 ? "" : "s"} recorded for this postcode`
      : `of the ${certificates.length} assessment${certificates.length === 1 ? "" : "s"} of existing homes (RdSAP) recorded for this postcode`;
  return { kind, count: certificates.length, bands, line: `${base}, ${joinFragments(fragments)}` };
}

function epcSpreadOf(certificates: EpcCertificate[]): EpcSpread | null {
  if (certificates.length === 0) return null;
  // The section's own convention (see toServedCertificate):
  // SAP is predicted; anything else is an assessment of the
  // existing home. The register files SAP or RdSAP.
  const predicted = certificates.filter(
    (cert) => (cert.assessmentType ?? "").toUpperCase() === "SAP",
  );
  const assessed = certificates.filter(
    (cert) => (cert.assessmentType ?? "").toUpperCase() !== "SAP",
  );
  const rows = [spreadRow("predicted", predicted), spreadRow("assessed", assessed)].filter(
    (row): row is EpcSpreadRow => row !== null,
  );
  return {
    grainLine: "the postcode's recorded certificates",
    certificateCount: certificates.length,
    explainer:
      "The spread counts certificates, not homes: a home assessed more than once appears more than once, and most homes in a postcode have no certificate at all — a certificate exists only where a home was built, sold or let since the register began. It describes what the register holds for the postcode, and says nothing about any one home.",
    rows,
  };
}

// The postcode's filed EPC artefact, loading it through
// the existing loader path first when the check has never
// loaded the postcode (the D23 pattern), so "not filed"
// means the load was attempted and failed or is not
// possible — never "we never looked". Null when no
// artefact can be had.
async function loadEpcArtefact(
  source: AreaDataSource,
  postcode: string,
): Promise<EpcArtefact | null> {
  let artefact = await source.epcArtefact(postcode);
  if (artefact === null) {
    try {
      await source.loadEpc(postcode);
      artefact = await source.epcArtefact(postcode);
    } catch {
      artefact = null;
    }
  }
  return artefact;
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

  const postcode = resolution.directory.postcode;
  const artefact = await loadEpcArtefact(source, postcode);
  const sourceMeta =
    artefact === null
      ? { sourceName: null, sourceDate: null, sourceLine: null }
      : {
          sourceName: artefact.sourceName,
          sourceDate: artefact.sourceDate,
          sourceLine: sourceLineOf(artefact.sourceName, artefact.sourceDate),
        };
  // The spread is a postcode fact with its own state,
  // independent of the section's home-grain state: it
  // serves wherever the artefact holds certificates, at
  // either rung, and is null exactly where the artefact
  // holds none or could not be loaded.
  const spread = artefact === null ? null : epcSpreadOf(artefact.certificates);

  if (resolution.rung === 2) {
    return {
      ...meta,
      ...sourceMeta,
      state: "needs-exact-home",
      line: NEEDS_EXACT_HOME_EPC,
      certificates: [],
      certificateCountAtPostcode: null,
      headlineBand: null,
      spread,
    };
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
      spread: null,
    };
  }

  if (artefact.certificates.length === 0) {
    return {
      ...meta,
      ...sourceMeta,
      state: "filed-zero",
      line: "no energy certificate is recorded for this postcode",
      certificates: [],
      certificateCountAtPostcode: 0,
      headlineBand: null,
      spread: null,
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
      spread,
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
    spread,
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
// serve the not-filed state until the spring pass (renamed
// at M6.9/D30 from "not published": MHCLG has published
// their charges — the gap is our filing backlog, and the
// line says so), and Scotland and Northern Ireland are
// named not-covered states. The monthly line (M6.14, D33)
// is a derivation of the same scale — the Band D average
// spread evenly over 12 months, its correction inside the
// line — and exists only inside the served state.
// ------------------------------------------------------------------

export interface CouncilTaxSection extends AreaSectionMeta {
  state: "served" | "not-filed" | "not-covered";
  line: string | null;
  authority: string | null;
  taxYear: string | null;
  bandDAveragePence: number | null;
  bandDAverageLabel: string | null;
  components: { label: string; pence: number; labelPence: string }[];
  parish: { pence: number; labelPence: string; line: string } | null;
  // The authority's scale: every band's charge derived from
  // the filed Band D average by the statutory ratios, each
  // with its monthly equivalent (the annual charge spread
  // evenly over 12 months — M6.14, decision D33).
  bands: {
    band: string;
    pence: number;
    labelPence: string;
    monthlyPence: number;
    monthlyLabelPence: string;
  }[];
  // The band table's derivation, in the served shape
  // (M6.18, decision D37): before this step the statutory
  // ratios lived only in code comments and the schema
  // doc, and the explainer said only that Band D is "the
  // scale the other bands are set from". Null in the
  // not-filed and not-covered states, where no table
  // serves.
  bandsLine: string | null;
  // The monthly line (M6.14): the Band D average spread
  // evenly over 12 months, carrying D16's correction inside
  // itself — the council's scale, not this home's bill.
  // Null in the not-filed and not-covered states: no monthly
  // figure exists where no annual figure does.
  monthlyLine: string | null;
  bandDMonthlyPence: number | null;
  bandDMonthlyLabel: string | null;
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
      "This is the council's average Band D charge and the scale the other bands are set from — not this home's bill. Your exact bill depends on your home's band and parish. The monthly figure spreads the annual charge evenly over 12 months; most councils bill over 10 monthly instalments, so each instalment is higher than the spread figure.",
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
      bandsLine: null,
      monthlyLine: null,
      bandDMonthlyPence: null,
      bandDMonthlyLabel: null,
    };
  }
  if (facts === null) {
    return {
      ...meta,
      sourceName: null,
      sourceDate: null,
      sourceLine: null,
      state: "not-filed",
      line: "this council's council tax charges are not filed yet — most councils are filed in the spring pass, and until then no figure can be given",
      authority: null,
      taxYear: null,
      bandDAveragePence: null,
      bandDAverageLabel: null,
      components: [],
      parish: null,
      bands: [],
      bandsLine: null,
      monthlyLine: null,
      bandDMonthlyPence: null,
      bandDMonthlyLabel: null,
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

  const bandDMonthlyPence = monthlyPenceOf(facts.bandDAreaAveragePence);
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
      const monthlyPence = monthlyPenceOf(pence);
      return {
        band,
        pence,
        labelPence: formatPounds(pence),
        monthlyPence,
        monthlyLabelPence: formatPounds(monthlyPence),
      };
    }),
    bandsLine:
      "the other bands are set from Band D by fixed statutory ratios — each band's charge is a set number of ninths of the Band D charge",
    monthlyLine: `${facts.authorityName}'s average Band D council tax spread evenly over 12 months is ${formatPounds(bandDMonthlyPence)} a month — the council's scale, not this home's bill`,
    bandDMonthlyPence,
    bandDMonthlyLabel: formatPounds(bandDMonthlyPence),
  };
}

// ------------------------------------------------------------------
// Planning applications — the hand-off (M6.12, decision
// D31, on D14's ruling). V1 files NO planning-applications
// data: the official national dataset (planning.data.gov.uk's
// planning-application dataset) is a specification with no
// data behind it, council registers publish no feed we may
// take, and no register is scraped, framed, embedded or
// fetched — outbound hyperlinks only. The section is a
// pointer, permanently, until a filing step ever replaces
// it: the state is handed-off, the family the M6.9 census
// did not have, because it is not an absence — it asserts
// nothing about how many applications exist.
//
// The council is named from the resolution's filed
// directory council — the same string the council-tax
// section joins on. No second naming source exists: the
// directory files no LPA code (the postcodes loader looks
// the name up and discards the code). One honest limit
// rides with the name: the directory names the council,
// not always the planning authority — inside a national
// park the register is the park authority's, and two
// London development corporations are the LPA for their
// areas. The mitigation is in the link, not the name: the
// official signpost resolves the correct authority from
// the postcode the family types, and the line never claims
// the council decides every application type.
//
// Planning is devolved, and the hand-off's shape follows:
// every nation has planning registers, so no nation serves
// not-covered here — what varies is the link, because the
// services genuinely differ. England and Wales share
// GOV.UK's signpost (D14 named a Planning Portal postcode
// search; the Portal runs no applications search at all —
// it is the submission service — so GOV.UK's "Search the
// register of planning decisions", which covers both
// nations, is the signpost). Scotland has no national
// public search to link to: viewing is per-council, so the
// section names the council and carries no link. Northern
// Ireland is the one nation with a real national register,
// and carries its link — except Mid Ulster, the one NI
// council that runs its own portal and is not on it.
//
// Every link is a plain landing page: no deep-link pattern
// is verified for any of these form-driven services, and
// the postcode never appears in a URL we emit. The section
// derives from the resolution alone — no source read — so
// under the M6.8 cache it rides inside the area bundle, and
// the version vector's directory guard (which carries the
// council and area-code strings) busts any entry a
// re-filed directory row would stale. It carries no
// load-failure state, so the cache write-skip rule is
// untouched.
// ------------------------------------------------------------------

export interface PlanningApplicationsSection extends AreaSectionMeta {
  state: "handed-off";
  // The council as filed in the directory, or null where
  // the directory row carries no council name — the section
  // then serves its unnamed form rather than guessing.
  council: string | null;
  line: string;
  link: { label: string; url: string } | null;
}

const PLANNING_SEARCH_GOVUK = {
  label: "Search the register of planning decisions (GOV.UK)",
  url: "https://www.gov.uk/search-register-planning-decisions",
};

const PLANNING_REGISTER_NI = {
  label: "Northern Ireland Public Register",
  url: "https://planningregister.planningsystemni.gov.uk/simple-search",
};

// The one Northern Ireland council not on the national
// register, matched on its filed directory name.
const MID_ULSTER_COUNCIL = "Mid Ulster";

function buildPlanningApplications(
  council: string | null,
  nation: Nation,
): PlanningApplicationsSection {
  const meta = {
    depth: "report" as const,
    grain: "area" as const,
    grainLine: "the council's planning register for this area",
    // The section's explainer is also the text the How we
    // check page carries for planning: why no copy is held,
    // and D14's guardrail (an application is a proposal,
    // not a decision, and permission is not a building)
    // carried in the section itself.
    explainer:
      "Planning applications are published by the council on its own planning register. We do not hold a copy of any council's register, so this check names the council and points you to the official search instead of summarising applications it has not seen. An application is a proposal, not a decision: being published does not mean it was permitted, and permission does not mean anything has been built.",
    sourceName: null,
    sourceDate: null,
    sourceLine: null,
  };
  const base = { ...meta, state: "handed-off" as const, council };

  if (nation === "northern-ireland") {
    if (council === MID_ULSTER_COUNCIL) {
      return {
        ...base,
        line: "planning applications for this area are published by Mid Ulster District Council on its own planning portal — it is the one Northern Ireland council not on the national register; we do not hold a copy, so no applications are listed here",
        link: null,
      };
    }
    return {
      ...base,
      line: "planning applications for this area are published on the Northern Ireland Public Register — we do not hold a copy, so no applications are listed here; the link below takes you to the register, where you can search by postcode",
      link: { ...PLANNING_REGISTER_NI },
    };
  }

  if (nation === "scotland") {
    return {
      ...base,
      line: council
        ? `planning applications for this area are published by ${council} on its own website — we do not hold a copy, so no applications are listed here, and there is no single Scottish register to link to`
        : "planning applications are published by the local council on its planning register — we do not hold a copy, so no applications are listed here",
      link: null,
    };
  }

  // England and Wales carry the GOV.UK signpost. The
  // unknown nation carries no link — the link is the only
  // part of the hand-off that is nation-shaped — so the
  // line's link clause is served only where a link is.
  const link = nation === "england" || nation === "wales" ? { ...PLANNING_SEARCH_GOVUK } : null;
  return {
    ...base,
    line: council
      ? `planning applications for this area are published on the planning register kept by ${council} — we do not hold a copy, so no applications are listed here${link ? "; the link below takes you to the official search, where you enter the postcode" : ""}`
      : "planning applications are published by the local council on its planning register — we do not hold a copy, so no applications are listed here",
    link,
  };
}

// ------------------------------------------------------------------
// Company ownership — the home's own title (M6.13, decision
// D32, on D15/D18). Whether a company is a registered
// proprietor of this home's title, answered from HM Land
// Registry's two company-ownership datasets (CCOD for UK
// companies, OCOD for overseas companies) and the Companies
// House snapshots the titles key to — all filed at M5.13
// behind COMPANY_OWNERSHIP_ENABLED, which stays false in
// the shipped code: this section EXISTS only when the flag
// is on, as an absent key while it is off (not null, not a
// named state), and the builder below is never called on
// the default path, so the flag-off bundle makes no read
// of the company tables at all. Exposure still waits on
// both gates: HMLR Data Services' written clause-3.2
// answer, and the founder's go.
//
// The match is two-stage, in the EPC pattern: the
// postcode's filed slice first (one indexed read), then
// free-text parsing of the register's address text — the
// datasets file no structured address parts. The title's
// FORM decides what a match means, never its tenure:
//   - single-home form ("3 Juno House", "Flat 2, Juno
//     House", one house number on its street) — the home's
//     OWN title;
//   - range form ("Flats 1-9 Minerva House", "Flats 1 To 8
//     (inclusive), Juno House") and bare-building form
//     ("Jupiter House, 10 Ceres Crescent") — the BUILDING's
//     title, a separate labelled line, because a flat's own
//     leasehold title and its building's freehold are
//     different titles with different proprietors;
//   - multi-house form ("39, 41 and, 49 Birkdale Rise";
//     "35, 37, 43, 45, 47 And 32 To 44 (inclusive),
//     Birkdale Rise") — one title over many houses; a
//     house matches as its OWN title when its number is a
//     member of the enumerated set or falls in a stated
//     range. Membership is NUMERIC, never substring: 19
//     matches neither Birkdale title, and a naive text
//     search would put house 4 inside "41", "44" and "49",
//     and Flat 4 inside "Flats 1-9" as an own title.
// `multiple_address_indicator` cannot help — it is N on
// every filed row, including both multi-house titles — so
// the parse does the work alone. Text that parses into no
// form is simply not a match: ambiguity fails toward the
// named states, never toward a guess. Multiple own-title
// matches serve whole, unranked (39 Birkdale Rise sits in
// both SAGE titles), the EPC disagreement rule.
//
// Two limits ride with the answer, named rather than
// hidden: the match is POSTCODE-KEYED — a title the
// register files under a neighbouring postcode for the
// same building is invisible to this check (6 Exeter
// Road's No is provable at building level only by a
// street search of the full files, which no servable
// equivalent exists for, or should); and the No claims
// only what the lookup proved, with its three holes
// (charities excluded by category, unregistered land
// invisible, the registration lag) carried in the
// explainer every time it serves.
// ------------------------------------------------------------------

export interface CompanySnapshotServed {
  companyName: string;
  status: string | null;
  incorporationDate: string | null;
  sicCodes: string[];
  // What the SIC codes ARE, in the served shape (M6.18,
  // decision D37 — the census's latent row): the codes
  // serve as filed numbers, and without this line they
  // are meaningless to a reader unaided. Null where the
  // snapshot files no codes: no figure, no line. The
  // section stays behind its flag either way.
  sicCodesLine: string | null;
  sourceName: string | null;
  sourceDate: string | null;
  sourceLine: string | null;
}

export interface CompanyTitleServed {
  titleNumber: string;
  dataset: "ccod" | "ocod";
  tenure: string;
  proprietorName: string;
  companyNumber: string | null;
  // The number's own named state: recorded (with its
  // snapshot), no-number-recorded (the register records
  // none — most overseas proprietors), or
  // number-not-in-the-snapshot (a number is filed but the
  // Companies House product holds no row under it — the
  // filed number serves as filed, never repaired).
  numberState: "recorded" | "no-number-recorded" | "number-not-in-the-snapshot";
  proprietorshipCategory: string | null;
  countryIncorporated: string | null;
  // The register's own flag for further proprietors
  // sitting alongside this one. The served sentence is
  // true with the flag either way — "a registered
  // proprietor of this title is a company", never "the
  // owner is a company".
  additionalProprietor: boolean;
  line: string;
  // The named sentence for the two missing-snapshot
  // states; null where a snapshot is held and speaks for
  // itself.
  snapshotLine: string | null;
  snapshot: CompanySnapshotServed | null;
  attributionLine: string | null;
  sourceName: string | null;
  sourceDate: string | null;
  sourceLine: string | null;
}

export interface CompanyOwnershipSection extends AreaSectionMeta {
  state: "served" | "not-company-owned" | "needs-exact-home" | "not-covered" | "not-filed";
  // The section's lead answer: the home's OWN title
  // (decision D15's "headline" — the section's internal
  // lead, at report depth; the D28 short bundle is
  // untouched by this section in either flag position).
  line: string | null;
  ownTitles: CompanyTitleServed[];
  // The building line: present whenever a building-covering
  // title matches this home's building, whether or not the
  // own title also matched — and worded so it can never
  // stand for the home's own title.
  buildingLine: string | null;
  buildingTitles: CompanyTitleServed[];
  // The licence's attribution, its year bound to the
  // edition year of the dataset the answer rests on.
  attributionLine: string | null;
}

const NEEDS_EXACT_HOME_COMPANY =
  "choose the exact home to see whether a company is a registered proprietor of its title";

const COMPANY_EXPLAINER =
  "This check answers one question: is a company a registered proprietor of this home's own title? It reads HM Land Registry's two company-ownership datasets — one for UK companies, one for overseas companies — and matches this home against the titles filed at its postcode. A flat's own title and its building's title are different titles with different proprietors, so where the building is held on its own title that is named separately, never as this home's answer. The datasets' address text is used only to make the match — it is never shown; the address you see is the one you gave. A 'not company-owned' answer has three holes, and they matter: charities are excluded from both datasets by category, so a charity-owned home returns the same answer; roughly a tenth of land in England and Wales is unregistered, so no title exists for the datasets to hold; and a sale still being registered has not reached the data yet. The answer is only as current as the dataset month it names. For everything deeper — the full register entry, and anything about the company beyond the facts shown — the hand-off is HM Land Registry's title register for the title number shown.";

const COMPANY_ATTRIBUTION = "Information produced by HM Land Registry © Crown copyright";

function companyAttributionLine(sourceDate: string | null): string | null {
  return sourceDate ? `${COMPANY_ATTRIBUTION} ${sourceDate.slice(0, 4)}` : null;
}

// A flat key's ordering value ("4" < "4A" < "5"), for
// range membership — numeric, never substring.
function flatKeyValue(key: string): number {
  const match = /^([0-9]+)([A-Z]?)$/.exec(key);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[1]) * 100 + (match[2] ? match[2].charCodeAt(0) - 64 : 0);
}

function keyWithin(key: string, low: string, high: string): boolean {
  const value = flatKeyValue(key);
  return flatKeyValue(low) <= value && value <= flatKeyValue(high);
}

// The range form, read off the RAW register text: "Flats
// 1-9" (a hyphen) or "Flats 1 To 8" (the word To). The
// normalised text cannot tell "Flats 1-9" from a single
// flat at a numbered building ("Flat 4, 12 Ceres
// Crescent"), so the hyphen and the To are the evidence —
// a form with neither is not a range.
function titleFlatRange(propertyAddress: string): { low: string; high: string } | null {
  const match = /\bFLATS?\s+([0-9]+[A-Z]?)\s*(?:[-–—]|\bTO\b)\s*([0-9]+[A-Z]?)\b/.exec(
    propertyAddress.toUpperCase(),
  );
  return match ? { low: match[1], high: match[2] } : null;
}

// The single flat a title names, if it names exactly one:
// the keyword form ("Flat 2", "Apartment 7") or the bare
// number directly before the building's name ("3 Juno
// House"). A bare building form ("Jupiter House, 10 Ceres
// Crescent") names none — its number FOLLOWS the name, as
// the building's street number.
function titleFlatKey(text: string, buildingName: string | null): string | null {
  const keyed = /\b(?:FLAT|APARTMENT|APT|UNIT) ([0-9]+[A-Z]?)\b/.exec(text);
  if (keyed) return keyed[1];
  if (buildingName) {
    const padded = ` ${text} `;
    const idx = padded.indexOf(` ${buildingName} `);
    if (idx > 0) {
      const before = padded.slice(0, idx).trim().split(" ").pop() ?? "";
      if (/^[0-9]+[A-Z]?$/.test(before)) return before;
    }
  }
  return null;
}

// Does the title's text name this home's building — by its
// name, or (a building known only by its street number) by
// number + street together, the EPC matcher's own rule.
function titleNamesBuilding(text: string, home: ResolvedAddress): boolean {
  const paon = parsePaon(home.paon);
  if (paon.name) return textContains(text, paon.name);
  if (paon.number && home.street)
    return textContains(text, paon.number) && textContains(text, normText(home.street));
  return false;
}

// The house numbers a title enumerates before the home's
// street name: the singletons as a set, the "32 To 44"
// spans as ranges. Null when the street is not named —
// the title cannot be placed on this street at all.
function houseNumbersIn(
  text: string,
  streetNorm: string,
): { singles: Set<string>; ranges: { low: string; high: string }[] } | null {
  const padded = ` ${text} `;
  const idx = padded.indexOf(` ${streetNorm} `);
  if (idx === -1) return null;
  const ranges: { low: string; high: string }[] = [];
  const rest = padded
    .slice(0, idx)
    .replace(/\b([0-9]+[A-Z]?)\s+TO\s+([0-9]+[A-Z]?)\b/g, (_span, low: string, high: string) => {
      ranges.push({ low, high });
      return " ";
    });
  const singles = new Set<string>();
  for (const token of rest.split(" ")) if (/^[0-9]+[A-Z]?$/.test(token)) singles.add(token);
  return { singles, ranges };
}

// What is this filed title to this resolved home: its OWN
// title, its BUILDING's title, or not a match at all. The
// title's form decides — see the section header.
export function companyTitleMatch(
  row: CompanyTitleRow,
  home: ResolvedAddress,
): "own" | "building" | null {
  const text = normText(row.propertyAddress);
  const homeFlat = flatKeyOf(home.saon);

  if (homeFlat !== null) {
    if (!titleNamesBuilding(text, home)) return null;
    const range = titleFlatRange(row.propertyAddress);
    if (range) return keyWithin(homeFlat, range.low, range.high) ? "building" : null;
    const key = titleFlatKey(text, parsePaon(home.paon).name);
    if (key !== null) return key === homeFlat ? "own" : null;
    return "building";
  }

  // Houses. A flats-form title — a flat range, or one
  // named flat — is never a house's own title.
  if (titleFlatRange(row.propertyAddress) !== null) return null;
  if (/\b(?:FLAT|APARTMENT|APT|UNIT) [0-9]+[A-Z]?\b/.test(text)) return null;
  const paon = parsePaon(home.paon);
  if (paon.name && !paon.number) {
    // A named house: its own title carries its name, on
    // its street where the home has one.
    if (!textContains(text, paon.name)) return null;
    return !home.street || textContains(text, normText(home.street)) ? "own" : null;
  }
  if (!paon.number || !home.street) return null;
  const found = houseNumbersIn(text, normText(home.street));
  if (!found) return null;
  if (found.singles.has(paon.number)) return "own";
  return found.ranges.some((range) => keyWithin(paon.number as string, range.low, range.high))
    ? "own"
    : null;
}

function toServedCompanyTitle(
  row: CompanyTitleRow,
  facts: CompanyOwnershipFacts,
  kind: "own" | "building",
): CompanyTitleServed {
  const snapshot = row.companyNumber !== null ? (facts.snapshots[row.companyNumber] ?? null) : null;
  const numberState: CompanyTitleServed["numberState"] =
    row.companyNumber === null
      ? "no-number-recorded"
      : snapshot
        ? "recorded"
        : "number-not-in-the-snapshot";
  return {
    titleNumber: row.titleNumber,
    dataset: row.dataset,
    tenure: row.tenure,
    proprietorName: row.proprietorName,
    companyNumber: row.companyNumber,
    numberState,
    proprietorshipCategory: row.proprietorshipCategory,
    countryIncorporated: row.countryIncorporated,
    additionalProprietor: row.additionalProprietor,
    line:
      kind === "own"
        ? "a registered proprietor of this title is a company"
        : "a registered proprietor of this building's title is a company",
    snapshotLine:
      numberState === "no-number-recorded"
        ? "the register records no company number for this proprietor"
        : numberState === "number-not-in-the-snapshot"
          ? `no Companies House snapshot is held under company number ${row.companyNumber} as filed`
          : null,
    snapshot: snapshot
      ? {
          companyName: snapshot.companyName,
          status: snapshot.status,
          incorporationDate: snapshot.incorporationDate,
          sicCodes: snapshot.sicCodes,
          sicCodesLine:
            snapshot.sicCodes.length > 0
              ? "the SIC codes are Companies House's standard industrial classification codes for the company's activities, served as filed"
              : null,
          sourceName: snapshot.sourceName,
          sourceDate: snapshot.sourceDate,
          sourceLine: sourceLineOf(snapshot.sourceName, snapshot.sourceDate),
        }
      : null,
    attributionLine: companyAttributionLine(row.sourceDate),
    sourceName: row.sourceName,
    sourceDate: row.sourceDate,
    sourceLine: sourceLineOf(row.sourceName, row.sourceDate),
  };
}

function buildCompanyOwnership(
  resolution: Extract<AddressResolution, { rung: 1 | 2 }>,
  facts: CompanyOwnershipFacts | null,
  nation: Nation,
): CompanyOwnershipSection {
  const meta = {
    depth: "report" as const,
    grain: "home" as const,
    grainLine: "this home's own title, in HM Land Registry's company-ownership data",
    explainer: COMPANY_EXPLAINER,
  };
  const noFacts = {
    sourceName: null,
    sourceDate: null,
    sourceLine: null,
    ownTitles: [] as CompanyTitleServed[],
    buildingLine: null,
    buildingTitles: [] as CompanyTitleServed[],
    attributionLine: null,
  };

  // The ladder first (D26): the own-title answer is a home
  // fact, so rung 2 asks for the exact home and nothing
  // else serves — no postcode-level company statistic is
  // invented from data filed to answer a different
  // question. (The builder is not even called with facts
  // at rung 2: no read of the tables is made.)
  if (resolution.rung === 2) {
    return { ...meta, ...noFacts, state: "needs-exact-home", line: NEEDS_EXACT_HOME_COMPANY };
  }

  // The datasets cover England and Wales; Scotland and
  // Northern Ireland are never a No — the line names the
  // nation's own register as where title information
  // lives (the D30 publisher-naming rule).
  if (nation === "scotland" || nation === "northern-ireland") {
    const register = nation === "scotland" ? "Registers of Scotland" : "Land & Property Services";
    return {
      ...meta,
      ...noFacts,
      state: "not-covered",
      line: `the company-ownership datasets cover England and Wales only — title information for ${nationName(nation)} is held by ${register}`,
    };
  }
  if (nation === "unknown") {
    return {
      ...meta,
      ...noFacts,
      state: "not-covered",
      line: "the company-ownership datasets cover England and Wales only, so no company-ownership answer can be given for this home",
    };
  }

  // The guard: absence is only ever served against a
  // proven filing of BOTH datasets (the M6.9/D30 rule, in
  // the flood form).
  if (facts === null || facts.ccodFiledCount <= 0 || facts.ocodFiledCount <= 0) {
    return {
      ...meta,
      ...noFacts,
      state: "not-filed",
      line: "the company-ownership data is not filed yet, so no company-ownership answer can be given yet",
    };
  }

  const ownTitles: CompanyTitleServed[] = [];
  const buildingTitles: CompanyTitleServed[] = [];
  for (const row of facts.titles) {
    const match = companyTitleMatch(row, resolution.address);
    if (match === "own") ownTitles.push(toServedCompanyTitle(row, facts, "own"));
    else if (match === "building")
      buildingTitles.push(toServedCompanyTitle(row, facts, "building"));
  }
  const byTitleNumber = (a: CompanyTitleServed, b: CompanyTitleServed) =>
    a.titleNumber.localeCompare(b.titleNumber);
  ownTitles.sort(byTitleNumber);
  buildingTitles.sort(byTitleNumber);

  const buildingLine =
    buildingTitles.length > 0
      ? "this home's building is held on a separate title from this home's own title, and a company is a registered proprietor of that building title"
      : null;

  if (ownTitles.length > 0) {
    const lead = ownTitles[0];
    return {
      ...meta,
      sourceName: lead.sourceName,
      sourceDate: lead.sourceDate,
      sourceLine: lead.sourceLine,
      state: "served",
      line: "a registered proprietor of this home's title is a company",
      ownTitles,
      buildingLine,
      buildingTitles,
      attributionLine: lead.attributionLine,
    };
  }

  // The No. It is dated by the EARLIER of the two dataset
  // editions: the lookup is only as complete as its least
  // current dataset, and the licence's rule is that data
  // never present as more current than it is.
  const editions = [facts.editions.ccod, facts.editions.ocod].filter(
    (edition) => edition.sourceDate !== null,
  );
  const asAt =
    editions.length > 0
      ? editions.reduce((a, b) => ((a.sourceDate as string) <= (b.sourceDate as string) ? a : b))
      : null;
  return {
    ...meta,
    sourceName: asAt?.sourceName ?? null,
    sourceDate: asAt?.sourceDate ?? null,
    sourceLine: sourceLineOf(asAt?.sourceName ?? null, asAt?.sourceDate ?? null),
    state: "not-company-owned",
    line: asAt
      ? `this home's title is not in HM Land Registry's company-ownership data as at ${monthLabel(asAt.sourceDate as string)}`
      : "this home's title is not in HM Land Registry's company-ownership data",
    ownTitles,
    buildingLine,
    buildingTitles,
    attributionLine: companyAttributionLine(asAt?.sourceDate ?? null),
  };
}

// ------------------------------------------------------------------
// Building safety — the tribunal decisions and the
// register hand-off (M6.16, decision D35, on D17). ONE
// section with two sub-blocks, because the halves correct
// each other: the tribunal's empty line is only safe to
// read standing beside the register hand-off, and the
// register's silence is never a finding either. Each
// sub-block keeps its own state, its own grain line and
// its own source line — the tribunal half has a filed
// source with a filing date; the register half files
// nothing and carries none (the planning precedent).
//
// The tribunal half serves the published BSA/BSB slice
// filed at M5.14 (migration 0015): remediation orders
// (section 123) and remediation contribution orders
// (section 124) under the Building Safety Act 2022, plus
// the honest remainder of decisions in the series that
// are neither. The match unit is the BUILDING (D17), and
// the serving is fail-open group-and-label: every
// block-level decision filed for the postcode serves,
// grouped by the loader's building stem; the checked
// home's group is labelled and served first where its
// stem matches — and nothing is ever filtered out, so a
// building-name mismatch between the directory and the
// tribunal's printed name can never print a false empty
// answer. Over-narrowing is the unsafe direction here.
// A decision naming specific flats (is_single_flat)
// serves only at those flats' own rung-1 answers — never
// as a block headline at rung 2, and never at a sibling
// flat. The coverage line is the locked form —
// "published building-safety orders naming this
// postcode, as at [filing date]" — with the prep's one
// honest correction: decisions that are not orders are
// never called orders, so a postcode whose rows are all
// of the other kind counts "decisions", and a mixed
// postcode counts "decisions and orders".
//
// The register half is a hand-off (D17): no published
// list of registered high-rise residential buildings
// exists — the Building Safety Regulator's register is
// reachable only through its own postcode search
// service, expressly designed so the register is never
// released as data — so the answer names the register
// and links the official search (the very URL the
// bsr-register canary probes monthly), or, for a clear
// single house at rung 1, serves the scope line: the
// register covers high-rise residential buildings, and
// a house is outside what the register is for. The
// scope line's trigger is deliberately conservative:
// the filed data can prove a flat (a SAON) but can
// never prove a house, so it fires only where the SAON
// is absent AND the PAON parses to a bare house number
// with no building name; every other home, and every
// rung-2 answer, takes the neutral hand-off, which is
// true for houses too. No council is named for the
// register — it is a single national service, and
// naming the directory council would falsely imply it
// holds the record. Scotland names its Cladding
// Assurance Register WITHOUT a link (no verified search
// landing exists in the record; D31's rule — a link
// only where it lands on the real search); Wales names
// the Welsh Government's route; Northern Ireland has
// no equivalent register.
// ------------------------------------------------------------------

export interface TribunalDecisionServed {
  caseRef: string;
  kind: TribunalOrderKind;
  // The kind in plain words, with its section of the Act.
  kindLine: string;
  // The building as the decision names it — the
  // tribunal's own words, verbatim.
  propertyText: string;
  decisionDate: string;
  decisionDateLabel: string;
  // The GOV.UK page of the document the row was filed
  // from — the hand-off within the filed half: the
  // decision itself, for the reader who needs more than
  // its header facts.
  sourceUrl: string;
  isSingleFlat: boolean;
  line: string;
}

export interface TribunalBuildingGroup {
  buildingKey: string;
  // The group's heading: the tribunal's own words for
  // the building, from the group's first decision.
  buildingName: string;
  // True where this group is the checked home's building
  // — a label, never a filter: every group serves
  // either way.
  isHomeBuilding: boolean;
  decisions: TribunalDecisionServed[];
}

export interface TribunalBlock {
  state: "served" | "none-filed" | "not-filed" | "not-covered";
  grain: "postcode point";
  grainLine: string;
  line: string | null;
  // The decisions this answer serves — the count the
  // line counts. Single-flat decisions count only where
  // they serve: at their own flats' rung-1 answers.
  decisionCount: number;
  groups: TribunalBuildingGroup[];
  sourceName: string | null;
  sourceDate: string | null;
  sourceLine: string | null;
}

export interface RegisterBlock {
  state: "handed-off" | "out-of-scope" | "not-covered";
  grain: "home";
  grainLine: string;
  line: string;
  link: { label: string; url: string } | null;
  // No dataset is filed for this half, so no source line
  // exists to carry (the planning hand-off's precedent).
  sourceName: null;
  sourceDate: null;
  sourceLine: null;
}

export interface BuildingSafetySection extends AreaSectionMeta {
  tribunal: TribunalBlock;
  register: RegisterBlock;
}

// The register search service — the canary's own probe
// target (loaders/canary-bsr-register.mjs,
// REGISTER_SEARCH_URL), so the hand-off link is the
// project's monitored contract, not an invented URL.
// Like planning's links (D31): a plain landing page, no
// postcode in the URL; the line instructs the reader to
// enter the postcode there.
const BSR_REGISTER_SEARCH = {
  label: "Search the register of high-rise residential buildings (GOV.UK)",
  url: "https://www.register-high-rise-building.service.gov.uk/public-register/search",
};

const BUILDING_SAFETY_EXPLAINER =
  "This section brings together the two official records that speak to a building of this kind, and they answer different questions. The tribunal index holds the building-safety decisions the First-tier Tribunal (Property Chamber) has published in the remediation series — remediation orders and remediation contribution orders under the Building Safety Act 2022. Publication is selective: the tribunal publishes only some of its decisions, cases in other series are not in this index, a small number of published documents cannot be read by the filing process (their text is scanned or encoded so it cannot be extracted) and so file nothing, and some published decisions name no full postcode in their header, so they cannot be matched to any postcode here. An empty tribunal answer means only that no published, readable decision in the filed index names this postcode. The register is a separate record, kept by the Building Safety Regulator for high-rise residential buildings in England. If a building is not found on it, that can mean the building is outside the register's scope, that it is unregistered, or that it is registered under a different postcode — the search result is the reader's to interpret, and this check draws no conclusion from it. The register covers buildings of 18 metres or 7 storeys and above, while the tribunal's remediation orders reach buildings of 11 metres and above, so a building can sit inside the tribunal's world and outside the register's. EWS1 forms have no public register. Whether a building has cladding is a question neither record answers here.";

const TRIBUNAL_KIND_LINES: Record<TribunalOrderKind, string> = {
  "remediation-order": "remediation order (section 123 of the Building Safety Act 2022)",
  "remediation-contribution-order":
    "remediation contribution order (section 124 of the Building Safety Act 2022)",
  // The honest remainder (a Regulation 3 appeal is the
  // filed example): never let "other" read as an order.
  "other-building-safety":
    "a published decision in the building-safety series that is not a remediation order or a remediation contribution order",
};

function toServedTribunalDecision(row: TribunalDecisionRow): TribunalDecisionServed {
  const kindLine = TRIBUNAL_KIND_LINES[row.orderKind];
  return {
    caseRef: row.caseRef,
    kind: row.orderKind,
    kindLine,
    propertyText: row.propertyText,
    decisionDate: row.decisionDate,
    decisionDateLabel: dateLabel(row.decisionDate),
    sourceUrl: row.sourceUrl,
    isSingleFlat: row.isSingleFlat,
    line: `${kindLine} for ${row.propertyText} — ${row.caseRef}, ${dateLabel(row.decisionDate)}`,
  };
}

// The flat keys a single-flat decision's Property line
// names, parsed from its leading flat list — the same
// leading list the loader's isSingleFlat flag was
// computed from ("Flat 5, …", "Flats 5, 15 & 29 …").
function singleFlatKeysOf(propertyText: string): Set<string> {
  const match =
    /^\s*(?:flat|flats|unit|apartment|apartments)\s+([0-9]+[a-z]?(?:\s*(?:,|&|and)\s*[0-9]+[a-z]?)*)/i.exec(
      propertyText,
    );
  if (!match) return new Set();
  return new Set(
    match[1]
      .toUpperCase()
      .split(/\s*(?:,|&|AND)\s*/)
      .filter(Boolean),
  );
}

// The checked home's building stem, in the loader's
// buildingKey normal form (lower-cased, punctuation
// removed), from the address parts in the Property
// line's own order — building, street, town. A
// best-effort LABEL key only: a mismatch never filters
// anything out (the fail-open rule).
function homeBuildingKey(home: ResolvedAddress): string | null {
  const parts = [home.paon, home.street, home.town].filter(
    (part): part is string => part !== null && part.trim() !== "",
  );
  if (parts.length === 0) return null;
  return parts
    .join(" ")
    .toLowerCase()
    .replace(/[.,'"()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// A single-flat decision serves at a home only where
// BOTH hold: the decision's building stem is the home's
// building, and its leading flat list names the home's
// own flat. Anything less is a different flat's answer.
function singleFlatMatchesHome(row: TribunalDecisionRow, home: ResolvedAddress): boolean {
  const flat = flatKeyOf(home.saon);
  if (flat === null) return false;
  if (!singleFlatKeysOf(row.propertyText).has(flat)) return false;
  const key = homeBuildingKey(home);
  return key !== null && key === row.buildingKey;
}

// The register scope line's trigger (D35): rung 1 only,
// and only for a clear single house — no SAON (a filed
// SAON proves a flat) and a PAON that parses to a bare
// house number with no building name. The loaded data
// can prove a flat; it can never prove a house, so
// every doubtful shape takes the neutral hand-off
// instead — guessing the scope line for a flat in a
// converted house would be the unsafe error.
function isClearSingleHouse(resolution: Extract<AddressResolution, { rung: 1 }>): boolean {
  const home = resolution.address;
  if (home.saon !== null) return false;
  const paon = parsePaon(home.paon);
  return paon.name === null && paon.number !== null;
}

// The coverage line's noun, honestly: orders where the
// served rows are orders; decisions where they are all
// of the other kind (an appeal is not an order); the
// pair where they mix.
function tribunalCountLine(servedCount: number, otherCount: number, asAt: string): string {
  if (otherCount === 0)
    return `${servedCount} published building-safety ${servedCount === 1 ? "order" : "orders"} naming this postcode${asAt}`;
  if (otherCount === servedCount)
    return `${servedCount} published building-safety ${servedCount === 1 ? "decision" : "decisions"} naming this postcode${asAt}`;
  return `${servedCount} published building-safety decisions and orders naming this postcode${asAt}`;
}

function buildTribunalBlock(
  resolution: Extract<AddressResolution, { rung: 1 | 2 }>,
  facts: TribunalFacts,
  nation: Nation,
): TribunalBlock {
  const grainLine = "published decisions naming this postcode";
  const base = { grain: "postcode point" as const, grainLine, decisionCount: 0, groups: [] };
  const noSource = { sourceName: null, sourceDate: null, sourceLine: null };

  // Jurisdiction is a coverage fact, not an absence: the
  // Property Chamber's building-safety decisions are
  // England's, and a Welsh or Scottish postcode never
  // serves an English empty line.
  if (nation === "scotland" || nation === "wales" || nation === "northern-ireland") {
    const line =
      nation === "scotland"
        ? "the building-safety tribunal decisions filed here are for England — Scotland's own route is the Cladding Assurance Register, the Scottish Government's register of buildings assessed for cladding"
        : nation === "wales"
          ? "the building-safety tribunal decisions filed here are for England — Wales's route is the Welsh Government's building safety route for high-rise residential buildings"
          : "the building-safety tribunal decisions filed here are for England — Northern Ireland is outside the tribunal's building-safety jurisdiction and has no equivalent register";
    return { ...base, ...noSource, state: "not-covered", line };
  }
  if (nation === "unknown") {
    return {
      ...base,
      ...noSource,
      state: "not-covered",
      line: "the building-safety tribunal decisions filed here are for England, and this postcode's filed area code does not place it in England",
    };
  }

  // The guard: an absence is only ever computed over a
  // proven filing (the company-ownership rule, D32). An
  // empty table misread as "no orders" is precisely the
  // dangerous inference this section exists to prevent.
  if (facts.filedCount <= 0) {
    return {
      ...base,
      ...noSource,
      state: "not-filed",
      line: "the building-safety decisions data is not filed yet, so no building-safety answer can be given yet",
    };
  }

  const filedDate = facts.lastFiledAt ? facts.lastFiledAt.slice(0, 10) : null;
  const asAt = filedDate ? `, as at ${dateLabel(filedDate)}` : "";
  const source = {
    sourceName: facts.sourceName,
    sourceDate: filedDate,
    sourceLine: sourceLineOf(facts.sourceName, filedDate),
  };

  // Which rows serve: every block-level row at the
  // postcode, plus — at rung 1 only — the single-flat
  // rows naming this home's own flat. Nothing else is
  // ever filtered out.
  const home = resolution.rung === 1 ? resolution.address : null;
  const served = facts.rows.filter(
    (row) => !row.isSingleFlat || (home !== null && singleFlatMatchesHome(row, home)),
  );

  if (served.length === 0) {
    return {
      ...base,
      ...source,
      state: "none-filed",
      // The locked form (D17): one true, bounded claim.
      // Everything it does NOT mean lives in the
      // explainer — selective publication, the unreadable
      // documents, the decisions naming no postcode.
      line: `no published building-safety orders naming this postcode${asAt}`,
    };
  }

  // Group by the filed building stem. The label key is
  // the home's own derived stem at rung 1, or — where
  // rung 2 is narrowed to one building — the stem of
  // that building's own first address in the list.
  const labelHome: ResolvedAddress | null =
    resolution.rung === 1
      ? resolution.address
      : resolution.building !== null && resolution.addresses.length > 0
        ? resolution.addresses[0]
        : null;
  const homeKey = labelHome ? homeBuildingKey(labelHome) : null;

  const byKey = new Map<string, TribunalDecisionRow[]>();
  for (const row of served) {
    const rows = byKey.get(row.buildingKey) ?? [];
    rows.push(row);
    byKey.set(row.buildingKey, rows);
  }
  const groups: TribunalBuildingGroup[] = [...byKey.entries()].map(([buildingKey, rows]) => ({
    buildingKey,
    buildingName: rows[0].propertyText,
    isHomeBuilding: homeKey !== null && buildingKey === homeKey,
    decisions: rows.map(toServedTribunalDecision),
  }));
  // The home's group first; the rest keep filing order
  // (the sort is stable). Labelling only — every group
  // serves either way.
  groups.sort((a, b) => Number(b.isHomeBuilding) - Number(a.isHomeBuilding));

  const otherCount = served.filter((row) => row.orderKind === "other-building-safety").length;
  return {
    ...base,
    ...source,
    state: "served",
    line: tribunalCountLine(served.length, otherCount, asAt),
    decisionCount: served.length,
    groups,
  };
}

function buildRegisterBlock(
  resolution: Extract<AddressResolution, { rung: 1 | 2 }>,
  nation: Nation,
): RegisterBlock {
  const base = {
    grain: "home" as const,
    grainLine: "this building, in the Building Safety Regulator's register",
    sourceName: null,
    sourceDate: null,
    sourceLine: null,
  };

  if (nation === "scotland") {
    return {
      ...base,
      state: "not-covered",
      // Named WITHOUT a link: no verified search landing
      // for the register exists in the record, and D31's
      // rule is a link only where it lands on the real
      // search.
      line: "Scotland's buildings are not on the Building Safety Regulator's register — Scotland's own route is the Cladding Assurance Register, the Scottish Government's register of buildings assessed for cladding",
      link: null,
    };
  }
  if (nation === "wales") {
    return {
      ...base,
      state: "not-covered",
      line: "Wales's buildings are not on the Building Safety Regulator's register — the Welsh Government runs its own building safety route for high-rise residential buildings",
      link: null,
    };
  }
  if (nation === "northern-ireland") {
    return {
      ...base,
      state: "not-covered",
      line: "Northern Ireland's buildings are not on the Building Safety Regulator's register — Northern Ireland has no equivalent register",
      link: null,
    };
  }
  if (nation === "unknown") {
    return {
      ...base,
      state: "not-covered",
      line: "the Building Safety Regulator's register covers England, and this postcode's filed area code does not place it in England, so no register hand-off can be given",
      link: null,
    };
  }

  // The scope line: scope, not a finding about the
  // house — and no link under it, because a link would
  // invite the reader to treat a "not found" as
  // confirmation of the scope.
  if (resolution.rung === 1 && isClearSingleHouse(resolution)) {
    return {
      ...base,
      state: "out-of-scope",
      line: "the Building Safety Regulator's register covers high-rise residential buildings — buildings of 7 or more storeys or 18 metres or more, with 2 or more residential units; a house is outside what the register is for",
      link: null,
    };
  }

  // The hand-off. It asserts nothing about the building —
  // only where the register is checked — so it is true
  // for every England home that is not a clear single
  // house, flats and doubtful shapes alike.
  return {
    ...base,
    state: "handed-off",
    line: "whether this building is on the Building Safety Regulator's register of high-rise residential buildings can only be checked on the register's own search service — we do not hold a copy of the register, so no register answer is given here; the link below takes you to the official search, where you enter the postcode",
    link: { ...BSR_REGISTER_SEARCH },
  };
}

function buildBuildingSafety(
  resolution: Extract<AddressResolution, { rung: 1 | 2 }>,
  facts: TribunalFacts,
  nation: Nation,
): BuildingSafetySection {
  const tribunal = buildTribunalBlock(resolution, facts, nation);
  return {
    depth: "report",
    grain: "postcode point",
    // The section's two grains, named in its words
    // (D26): the tribunal half is a postcode fact, the
    // register half is about this building.
    grainLine:
      "published tribunal decisions naming this postcode, and the national register for this building",
    explainer: BUILDING_SAFETY_EXPLAINER,
    // The section's source fields are the tribunal
    // half's — the only filed dataset in the section.
    // The register sub-block carries its own nulls.
    sourceName: tribunal.sourceName,
    sourceDate: tribunal.sourceDate,
    sourceLine: tribunal.sourceLine,
    tribunal,
    register: buildRegisterBlock(resolution, nation),
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

function buildCensus(
  facts: CensusFacts | null,
  msoaCode: string | null,
  nation: Nation,
): CensusSection {
  const meta = {
    depth: "report" as const,
    grain: "area" as const,
    grainLine: "the wider area around this home, in Census 2021 numbers",
    explainer:
      "These figures describe the whole Census area this home sits in — thousands of residents — as they were on Census Day, 21 March 2021. They are the area in numbers, not a description of this street or of the people on it. Each table's percentages are of that table's own total — the tables' totals differ because the Census applies disclosure control, so a percentage from one table is not a share of another table's total.",
  };
  if (msoaCode === null || nation === "scotland" || nation === "northern-ireland") {
    return {
      ...meta,
      sourceName: null,
      sourceDate: null,
      sourceLine: null,
      state: "not-covered",
      // The nation is named where the detector knows it
      // (M6.9, decision D30 — the IMD form); a postcode
      // whose filed codes place it nowhere keeps the
      // boundary form.
      line:
        nation === "scotland" || nation === "northern-ireland"
          ? `Census 2021 figures are published for England and Wales — ${nationName(nation)} is outside that coverage`
          : "Census 2021 figures are published for England and Wales — this postcode is outside that coverage",
      msoaCode,
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
// published, labelled modelled. At report depth each
// figure also carries its yardstick lines (D50, amending
// D26): the figure's position against the UK legal limit
// and the WHO 2021 guideline, both named with owner and
// statistic. The position is a scale for reading the
// figure, never a compliance finding — whether a legal
// limit is met is decided for whole zones from monitoring
// and modelling together, not from one square's modelled
// figure and never for an individual home; the block's
// basis line says so and travels with it. The headline
// figure stays bare: NO2 only, no yardstick content.
// ------------------------------------------------------------------

// The six yardsticks (D50/D57) — constants served at
// answer time, never filed (the D16 pattern). UK legal
// limits, annual mean: the Air Quality Standards
// Regulations 2010 (SI 2010/1001), Schedule 2 as amended
// — PM2.5's 20 is the stage-2 limit value in force since
// 1 January 2020 (the made text's 25 was stage 1;
// Schedule 3's 25 is a target value, not a limit; and
// the 10-by-2040 target under the Environmental Targets
// (Fine Particulate Matter) (England) Regulations 2023
// is never a yardstick). WHO guidelines, annual mean:
// the World Health Organization's global air quality
// guidelines (2021) — WHO's own term is "guideline",
// never a limit. The limit values are the operative
// values UK-wide, and both yardsticks are annual-mean
// statistics, matching the filed PCM annual-mean
// background figures exactly.
export const AIR_YARDSTICKS = {
  basisLine:
    "A figure's position against these yardsticks is a scale for reading the figure. Whether a legal limit is met is decided for whole zones from monitoring and modelling together — not from one square's modelled background figure, and never for an individual home.",
  pollutants: [
    { pollutant: "NO2", ukLimit: 40, whoGuideline: 10 },
    { pollutant: "PM2.5", ukLimit: 20, whoGuideline: 5 },
    { pollutant: "PM10", ukLimit: 40, whoGuideline: 15 },
  ],
} as const;

export type AirYardstickPosition = "below-both" | "between" | "above-uk-limit";

export interface AirYardstickPollutant {
  pollutant: "NO2" | "PM2.5" | "PM10";
  value: number;
  ukLimit: number;
  whoGuideline: number;
  position: AirYardstickPosition;
  yardstickLine: string;
  summaryLine: string;
}

export interface AirYardsticks {
  basisLine: string;
  pollutants: AirYardstickPollutant[];
}

// The yardstick block for one served square: a pure
// function of the filed figures and the constants.
// Case logic on the figure as filed, full precision
// (D57): above the limit, else above the guideline,
// else below both. A figure exactly AT the limit has
// not exceeded it, so it reads "within"; a figure
// exactly AT the guideline takes the below family's
// "at" form. The figure itself is never embedded in
// the yardstick prose — the section's table carries it.
function buildAirYardsticks(facts: AirFacts): AirYardsticks {
  const valueOf = (pollutant: "NO2" | "PM2.5" | "PM10"): number =>
    pollutant === "NO2" ? facts.no2 : pollutant === "PM2.5" ? facts.pm25 : facts.pm10;
  return {
    basisLine: AIR_YARDSTICKS.basisLine,
    pollutants: AIR_YARDSTICKS.pollutants.map((entry) => {
      const value = valueOf(entry.pollutant);
      let position: AirYardstickPosition;
      let summaryLine: string;
      if (value > entry.ukLimit) {
        position = "above-uk-limit";
        summaryLine = "above the UK legal limit, and above the stricter WHO guideline";
      } else if (value > entry.whoGuideline) {
        position = "between";
        summaryLine = "within the UK legal limit, but above the stricter WHO guideline";
      } else if (value === entry.whoGuideline) {
        position = "below-both";
        summaryLine = "within the UK legal limit, and at the stricter WHO guideline";
      } else {
        position = "below-both";
        summaryLine = "within the UK legal limit, and below the stricter WHO guideline";
      }
      return {
        pollutant: entry.pollutant,
        value,
        ukLimit: entry.ukLimit,
        whoGuideline: entry.whoGuideline,
        position,
        yardstickLine: `${entry.pollutant} yardsticks: the UK legal limit is ${entry.ukLimit} µg/m³ as an annual mean (the Air Quality Standards Regulations 2010), and the World Health Organization's 2021 guideline is ${entry.whoGuideline} µg/m³ as an annual mean.`,
        summaryLine,
      };
    }),
  };
}

export interface AirSection extends AreaSectionMeta {
  state: "served" | "not-filed";
  line: string | null;
  year: number | null;
  no2: number | null;
  pm25: number | null;
  pm10: number | null;
  unit: string;
  headlineFigure: { pollutant: "NO2"; value: number; line: string } | null;
  // Report depth only (D50): present always — the block
  // on a served section, null in the not-filed state.
  // The headline projection never picks it (Section 4
  // of the M6.29 prep; identity-proven in the short
  // suite).
  yardsticks: AirYardsticks | null;
  // Report depth only (M6.30, decision D59): present
  // always, in both arms — the AQMA facts are
  // independent of the PCM square, so the block is
  // composed from its own facts read and attached
  // whether or not the air section itself is filed.
  // The headline projection never picks it, exactly as
  // with the yardsticks (identity-proven in the short
  // suite).
  aqma: AirAqmaBlock;
}

// ------------------------------------------------------------------
// Air Quality Management Areas — the declared-area fact
// for the postcode point, from the filed UK-wide set
// (M6.30, decision D59). The boundaries file carries
// no per-area dates, so the block carries the DATASET
// EDITION date; the register pages that hold per-area
// dates are never read (the house files published
// downloads). Distances are boundary distances on the
// bundle's existing basis: PostGIS geography distance
// from the point to the polygon IS the distance to its
// nearest boundary point, and the nearest line says so
// in words and carries the D22 label.
// ------------------------------------------------------------------

export interface AirAqmaBlock {
  state: "inside" | "nearest" | "none" | "not-filed";
  // The state line (the not-filed state: the D30
  // two-part line).
  line: string;
  // The D13 designation line; null when not-filed.
  basisLine: string | null;
  name: string | null;
  authority: string | null;
  // The pollutant words, composed in the brain from
  // the filed codes.
  pollutants: string[] | null;
  // Nearest only, 2dp — the boundary distance.
  miles: number | null;
  filedCount: number | null;
  sourceName: string | null;
  sourceDate: string | null;
}

const AQMA_BASIS_LINE =
  "An Air Quality Management Area is an area a council has declared because the national air quality objectives are not being met there, or are not likely to be met. The council must publish an action plan for improving air quality in the area. It is a management designation for the area: it is not a measurement of the air at this home, and it does not say what the air at this home is like.";

const AQMA_POLLUTANT_WORDS: Record<string, string> = {
  NO2: "nitrogen dioxide (NO2)",
  PM10: "particulate matter (PM10)",
  SO2: "sulphur dioxide (SO2)",
  BENZENE: "benzene (C6H6)",
};

const AQMA_MONTH_NAMES = [
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

function aqmaEditionInWords(sourceDate: string | null): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sourceDate ?? "");
  if (!match) return sourceDate ?? "";
  return `${Number(match[3])} ${AQMA_MONTH_NAMES[Number(match[2]) - 1]} ${match[1]}`;
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  if (words.length === 2) return `${words[0]} and ${words[1]}`;
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

function aqmaPollutantWords(detail: string | null): string[] {
  if (!detail) return [];
  return detail
    .split(";")
    .map((code) => code.trim())
    .filter((code) => code !== "")
    .map((code) => AQMA_POLLUTANT_WORDS[code] ?? code);
}

function buildAqma(facts: AqmaFacts): AirAqmaBlock {
  const base: AirAqmaBlock = {
    state: "not-filed",
    line: "",
    basisLine: null,
    name: null,
    authority: null,
    pollutants: null,
    miles: null,
    filedCount: null,
    sourceName: null,
    sourceDate: null,
  };
  // No filing, no answer: an empty layer can prove
  // nothing, so its absence wordings are never served
  // from it. The not-filed sentence is the bundle's one
  // two-part form (M6.9, decision D30).
  if (facts.filedCount <= 0) {
    return {
      ...base,
      line: "Air Quality Management Area — the Air Quality Management Area data is not filed yet, so no Air Quality Management Area answer can be given yet",
    };
  }
  const filed = {
    ...base,
    basisLine: AQMA_BASIS_LINE,
    filedCount: facts.filedCount,
    sourceName: facts.sourceName,
    sourceDate: facts.sourceDate,
  };
  const covering = facts.covering[0] ?? null;
  if (covering) {
    const pollutants = aqmaPollutantWords(covering.detail);
    return {
      ...filed,
      state: "inside",
      line: `This postcode point falls inside the ${covering.name}, declared by ${covering.authority} for ${joinWords(pollutants)}.`,
      name: covering.name,
      authority: covering.authority,
      pollutants,
    };
  }
  if (facts.nearestWithin) {
    const nearest = facts.nearestWithin;
    const pollutants = aqmaPollutantWords(nearest.detail);
    const miles = Math.round(nearest.miles * 100) / 100;
    return {
      ...filed,
      state: "nearest",
      line: `This postcode point is not inside an Air Quality Management Area. The nearest is the ${nearest.name} (${nearest.authority}), declared for ${joinWords(pollutants)}: its nearest boundary is ${miles.toFixed(2)} miles from the postcode point (straight-line distance from the postcode point).`,
      name: nearest.name,
      authority: nearest.authority,
      pollutants,
      miles,
    };
  }
  return {
    ...filed,
    state: "none",
    line: `No Air Quality Management Area covers this postcode point, and none comes within 2 miles of it. This was checked against the complete filed set of ${facts.filedCount} declared areas (Defra UK-AIR, edition ${aqmaEditionInWords(facts.sourceDate)}).`,
  };
}

function buildAir(facts: AirFacts | null, aqmaFacts: AqmaFacts): AirSection {
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
      yardsticks: null,
      aqma: buildAqma(aqmaFacts),
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
    yardsticks: buildAirYardsticks(facts),
    aqma: buildAqma(aqmaFacts),
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
      line: "modelled noise bands are not filed yet, so no noise answer can be given yet",
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
  // The Claimant Count percentage's base, in the served
  // shape (M6.18, decision D37): the percentage is of the
  // working-age population — before this step that base
  // existed only in a code comment on the filed-data
  // interface, and the served shape carried a bare number.
  // Null for the UC series (they file no percentage) and
  // where the percentage itself is not published.
  pctLine: string | null;
  line: string | null;
}

export interface BenefitsSection extends AreaSectionMeta {
  state: "served" | "not-covered" | "not-filed";
  line: string | null;
  lsoaCode: string | null;
  series: BenefitsSeriesServed[];
  bases: { residents: number; households: number } | null;
  // What the base counts ARE, in the served shape (M6.18,
  // decision D37): the small area's Census residents and
  // households, filed as the series' context. Null where
  // no bases are filed.
  basesLine: string | null;
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
      basesLine: null,
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
        pctLine: null,
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
      pctLine:
        series === "claimant_count" && filed.pct !== null
          ? `${filed.pct} percent of the working-age population`
          : null,
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
    basesLine: facts.bases
      ? `the counts are read against the small area's Census 2021 population, filed as the series' context: ${facts.bases.residents} residents and ${facts.bases.households} households`
      : null,
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
          ? "solar modelling is not filed yet, so no solar answer can be given yet"
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
// Broadband — Ofcom Connected Nations fixed coverage, a
// share of the postcode's premises per figure (M6.17,
// decision D36). Availability only: a figure says a
// service can be ordered at that share of premises, from
// providers' returns — never the speed a home will get,
// never take-up, never a per-address prediction. Ofcom
// publishes percentages only at this level, and no
// full-fibre percentage, so no served shape separates
// full fibre from the other gigabit-capable technologies.
// The speed bands may sum below 100: the shortfall is the
// unclassified share (premises Ofcom could not match to a
// provider record with a predicted speed), derived here
// at serve time and named — never silently absorbed.
// ------------------------------------------------------------------

const BROADBAND_SOURCE_NAME = "Ofcom Connected Nations — fixed broadband coverage";

export interface BroadbandBandServed {
  key: string;
  label: string;
  pct: number;
}

export interface BroadbandSection extends AreaSectionMeta {
  state: "served" | "not-filed";
  // The gigabit line — the section's primary sentence,
  // and the only broadband sentence the short bundle
  // carries (D36).
  line: string | null;
  snapshot: string | null;
  gigabitCapablePct: number | null;
  superfast30Pct: number | null;
  superfastLine: string | null;
  ultrafast100Pct: number | null;
  ultrafast100Line: string | null;
  ultrafast300Pct: number | null;
  ultrafast300Line: string | null;
  bands: BroadbandBandServed[];
  bandsLine: string | null;
  // The derived unclassified share; null when the bands
  // cover the postcode's premises within rounding.
  unclassifiedPct: number | null;
  unclassifiedLine: string | null;
}

const BROADBAND_BANDS: { key: keyof BroadbandAnswerFacts["speedBandPct"]; label: string }[] = [
  { key: "under_2", label: "under 2 Mbit/s" },
  { key: "2_to_5", label: "2 to 5 Mbit/s" },
  { key: "5_to_10", label: "5 to 10 Mbit/s" },
  { key: "10_to_30", label: "10 to 30 Mbit/s" },
  { key: "30_to_300", label: "30 to 300 Mbit/s" },
  { key: "300_plus", label: "300 Mbit/s or more" },
];

// A filed percentage, printed as published: at most two
// decimal places, no trailing zeros (100, 99.29, 97.9).
function fmtPct(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function buildBroadband(facts: BroadbandAnswerFacts | null): BroadbandSection {
  const meta = {
    // Headline depth via the projection's gigabit pick
    // only (D36); the category lines and the band
    // distribution are report material.
    depth: "headline" as const,
    grain: "postcode point" as const,
    grainLine: "the premises in this postcode",
    explainer:
      "These are Ofcom's figures for the services available to order at premises in this postcode, from providers' returns. They describe availability, not the speed any one home will get, and not what anyone has bought. Ofcom publishes percentages only at postcode level, and no full-fibre percentage: gigabit-capable services include cable and other technologies as well as full fibre, and the data does not separate them.",
  };
  if (facts === null) {
    return {
      ...meta,
      sourceName: null,
      sourceDate: null,
      sourceLine: null,
      state: "not-filed",
      line: "broadband coverage is not filed for this postcode yet",
      snapshot: null,
      gigabitCapablePct: null,
      superfast30Pct: null,
      superfastLine: null,
      ultrafast100Pct: null,
      ultrafast100Line: null,
      ultrafast300Pct: null,
      ultrafast300Line: null,
      bands: [],
      bandsLine: null,
      unclassifiedPct: null,
      unclassifiedLine: null,
    };
  }
  const sourceDate = `${facts.snapshot}-01`;
  const bands = BROADBAND_BANDS.map(({ key, label }) => ({
    key,
    label,
    pct: facts.speedBandPct[key],
  }));
  const bandSum = bands.reduce((total, band) => total + band.pct, 0);
  const unclassified = round1(100 - bandSum);
  const unclassifiedPct = unclassified > 0 ? unclassified : null;
  return {
    ...meta,
    sourceName: BROADBAND_SOURCE_NAME,
    sourceDate,
    sourceLine: `${BROADBAND_SOURCE_NAME} — data to ${monthLabel(sourceDate)}`,
    state: "served",
    line: `gigabit-capable broadband (at least 1 Gbit/s) is available to ${fmtPct(facts.gigabitCapablePct)}% of premises in this postcode`,
    snapshot: facts.snapshot,
    gigabitCapablePct: facts.gigabitCapablePct,
    superfast30Pct: facts.superfast30Pct,
    superfastLine: `superfast broadband (at least 30 Mbit/s) is available to ${fmtPct(facts.superfast30Pct)}% of premises in this postcode`,
    ultrafast100Pct: facts.ultrafast100Pct,
    ultrafast100Line: `ultrafast broadband (at least 100 Mbit/s) is available to ${fmtPct(facts.ultrafast100Pct)}% of premises in this postcode`,
    ultrafast300Pct: facts.ultrafast300Pct,
    ultrafast300Line: `broadband at 300 Mbit/s or more is available to ${fmtPct(facts.ultrafast300Pct)}% of premises in this postcode`,
    bands,
    bandsLine:
      "each band is the share of premises in this postcode whose maximum predicted download speed falls in that range",
    unclassifiedPct,
    unclassifiedLine:
      unclassifiedPct !== null
        ? `${fmtPct(unclassifiedPct)}% of premises in this postcode could not be matched to a provider record with a predicted speed, so they appear in no speed band`
        : null,
  };
}

// ------------------------------------------------------------------
// Mobile — Ofcom Connected Nations mobile coverage, at
// LOCAL AUTHORITY grain (M6.17, decision D36): Ofcom
// publishes no postcode-level mobile file, so the answer
// is the postcode's own council area's figures, with the
// council named in every line. Each service leads with
// ONE figure — the at-least-one-operator share, the only
// member of Ofcom's filed triple that answers whether a
// network covers the area at all. The all-operators
// figure serves beside it as the choice figure; the
// no-operator figure is the lead's mirror and never
// leads. A figure whose column is unpublished in the
// release files as null (the 5G standalone all-operators
// columns, every council, this release) and serves as
// not published — never 0, never a missing row.
// ------------------------------------------------------------------

const MOBILE_SOURCE_NAME = "Ofcom Connected Nations — mobile coverage (local authority level)";

export type MobileServiceKey =
  | "voice"
  | "4g"
  | "5g_high_confidence"
  | "5g_very_high_confidence"
  | "5g_sa_high_confidence"
  | "5g_sa_very_high_confidence";

const MOBILE_SERVICES: { key: MobileServiceKey; label: string }[] = [
  { key: "voice", label: "Voice" },
  { key: "4g", label: "4G" },
  { key: "5g_high_confidence", label: "5G (high confidence)" },
  { key: "5g_very_high_confidence", label: "5G (very high confidence)" },
  { key: "5g_sa_high_confidence", label: "5G standalone (high confidence)" },
  { key: "5g_sa_very_high_confidence", label: "5G standalone (very high confidence)" },
];

export interface MobileSetServed {
  atLeastOneOperatorPct: number | null;
  allOperatorsPct: number | null;
  // False where Ofcom does not publish the all-operators
  // figure for this service in this release — its line
  // then says so, in words.
  allOperatorsPublished: boolean;
  noOperatorPct: number | null;
  line: string;
  allOperatorsLine: string;
}

export interface MobileServiceServed {
  service: MobileServiceKey;
  label: string;
  state: "served" | "not-published";
  // The service's lead sentence — its outdoor lead line,
  // or its not-published sentence where the whole filed
  // set is unpublished.
  line: string;
  outdoor: MobileSetServed | null;
  // Only 4G carries an indoor set; null for every other
  // service, by the filing's shape, not by absence.
  indoor: MobileSetServed | null;
}

export interface MobileSection extends AreaSectionMeta {
  state: "served" | "not-filed";
  line: string | null;
  // The council the figures belong to, as filed — every
  // served line names it, because the grain is the whole
  // authority, never this postcode.
  council: string | null;
  snapshot: string | null;
  services: MobileServiceServed[];
}

function toServedMobileSet(
  set: MobileCoverageSetFacts,
  place: "outdoor" | "indoor",
  council: string,
): MobileSetServed {
  const placeWord = place === "outdoor" ? "outdoor" : "indoor";
  const allPublished = set.allOperatorsPct !== null;
  return {
    atLeastOneOperatorPct: set.atLeastOneOperatorPct,
    allOperatorsPct: set.allOperatorsPct,
    allOperatorsPublished: allPublished,
    noOperatorPct: set.noOperatorPct,
    line:
      set.atLeastOneOperatorPct !== null
        ? `at least one mobile network is modelled to have ${placeWord} coverage at ${fmtPct(set.atLeastOneOperatorPct)}% of premises in ${council}`
        : `the share of premises in ${council} where at least one mobile network has ${placeWord} coverage is not published for this service`,
    allOperatorsLine: allPublished
      ? `all four mobile networks are modelled to have ${placeWord} coverage at ${fmtPct(set.allOperatorsPct as number)}% of premises in ${council}`
      : `the share of premises in ${council} where all four mobile networks have ${placeWord} coverage is not published for this service`,
  };
}

function buildMobile(facts: MobileAnswerFacts | null): MobileSection {
  const meta = {
    // Report depth only (D36): a council-grain modelled
    // figure with a not-published discipline never
    // headlines beside the home's own facts.
    depth: "report" as const,
    grain: "area" as const,
    grainLine: "the council area this postcode sits in",
    explainer:
      "Ofcom publishes mobile coverage for the whole council area, modelled at premises — it is not a measurement at this home, and not a promise of signal indoors. Only 4G has a published indoor figure; every 5G service is published for outdoor coverage only. A figure Ofcom does not publish is named as not published, never shown as 0. Ofcom's figures name no network, so no network can be recommended from them.",
  };
  if (facts === null) {
    return {
      ...meta,
      sourceName: null,
      sourceDate: null,
      sourceLine: null,
      state: "not-filed",
      line: "mobile coverage is not filed for this postcode's council area yet",
      council: null,
      snapshot: null,
      services: [],
    };
  }
  const council = facts.lauaName;
  const sourceDate = `${facts.snapshot}-01`;
  const services: MobileServiceServed[] = MOBILE_SERVICES.map(({ key, label }) => {
    const filed = facts.services[key];
    if (!filed || filed.outdoor === null) {
      return {
        service: key,
        label,
        state: "not-published" as const,
        line: `${label} coverage is not published by Ofcom in this release`,
        outdoor: null,
        indoor: null,
      };
    }
    const outdoor = toServedMobileSet(filed.outdoor, "outdoor", council);
    return {
      service: key,
      label,
      state: "served" as const,
      line: outdoor.line,
      outdoor,
      indoor: filed.indoor ? toServedMobileSet(filed.indoor, "indoor", council) : null,
    };
  });
  return {
    ...meta,
    sourceName: MOBILE_SOURCE_NAME,
    sourceDate,
    sourceLine: `${MOBILE_SOURCE_NAME} — data to ${monthLabel(sourceDate)}`,
    state: "served",
    line: `modelled mobile coverage for the ${council} council area`,
    council,
    snapshot: facts.snapshot,
    services,
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
  planningApplications: PlanningApplicationsSection;
  // Building safety (M6.16) is unconditional — the
  // fourteenth section, present in every bundle.
  buildingSafety: BuildingSafetySection;
  census: CensusSection;
  imd: ImdSection;
  air: AirSection;
  noise: NoiseSection;
  benefits: BenefitsSection;
  solar: SolarSection;
  // Broadband and mobile (M6.17) are unconditional —
  // the fifteenth and sixteenth sections, present in
  // every bundle.
  broadband: BroadbandSection;
  mobile: MobileSection;
  // Company ownership (M6.13) is OPTIONAL in the type and
  // ABSENT in the object while its flag is off: the key
  // does not exist in the serialised bundle — not null,
  // not a named state — in the full bundle, in the
  // headline projection and in every derived shape.
  companyOwnership?: CompanyOwnershipSection;
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
  planningApplications: "planning applications need an exact postcode",
  buildingSafety: "building safety answers need an exact postcode",
  census: "Census figures need an exact postcode",
  imd: "area statistics need an exact postcode",
  air: "air quality needs an exact postcode",
  noise: "noise bands need an exact postcode",
  benefits: "benefit counts need an exact postcode",
  solar: "solar modelling needs an exact postcode",
  broadband: "broadband answers need an exact postcode",
  mobile: "mobile answers need an exact postcode",
};

// The company-ownership rung-3 reason joins the record
// ONLY when the flag is on: absence is uniform while it
// is off, in every rung's shape (M6.13).
const RUNG3_COMPANY_REASON = "company ownership needs an exact postcode";

export interface AreaBundleOptions {
  // The test seam for the company-ownership flag, in the
  // house pattern (lib/site.ts's showTestBanner): the real
  // value as a defaulted option. Shipped call sites pass
  // nothing, so the checked-in constant governs; tests pass
  // true explicitly to build the on-state. No shipped code
  // path passes true, and no test flips the constant.
  companyOwnershipEnabled?: boolean;
}

export async function buildAreaBundle(
  resolution: AddressResolution,
  source: AreaDataSource,
  options: AreaBundleOptions = {},
): Promise<AreaBundle> {
  const companyEnabled = options.companyOwnershipEnabled ?? COMPANY_OWNERSHIP_ENABLED;
  if (resolution.rung === 3)
    return {
      rung: 3,
      kind: "wider-area",
      area: {
        state: "unavailable",
        reason: AREA_UNAVAILABLE_REASON,
        sections: Object.fromEntries(
          Object.entries(
            companyEnabled
              ? { ...RUNG3_SECTION_REASONS, companyOwnership: RUNG3_COMPANY_REASON }
              : RUNG3_SECTION_REASONS,
          ).map(([key, reason]) => [key, { state: "unavailable" as const, reason }]),
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
    builtUpAreaFacts,
    worldHeritageFacts,
    battlefieldFacts,
    protectedWreckFacts,
    bufferZoneFacts,
    designations,
    listed,
    phi,
    article4Publishes,
    brownfieldFactsValue,
    brownfieldPublishes,
    councilTaxFacts,
    censusFacts,
    imdFacts,
    airFacts,
    aqmaFactsValue,
    noiseFacts,
    benefitsFacts,
    solarFacts,
    tribunalFactsValue,
    broadbandFacts,
    mobileFacts,
  ] = await Promise.all([
    source.planningLayerFacts("conservation_area", latitude, longitude),
    source.planningLayerFacts("article_4_area", latitude, longitude),
    source.planningLayerFacts("green_belt", latitude, longitude),
    source.planningLayerFacts("scheduled_monument", latitude, longitude),
    source.planningLayerFacts("ancient_woodland", latitude, longitude),
    source.planningLayerFacts("built_up_area", latitude, longitude),
    source.planningLayerFacts("world_heritage_site", latitude, longitude),
    source.planningLayerFacts("battlefield", latitude, longitude),
    source.planningLayerFacts("protected_wreck_site", latitude, longitude),
    source.planningLayerFacts("world_heritage_buffer_zone", latitude, longitude),
    source.designationFacts(latitude, longitude),
    source.listedFacts(latitude, longitude),
    source.phiFacts(latitude, longitude),
    source.article4Gate(resolution.directory.council),
    source.brownfieldFacts(latitude, longitude),
    source.brownfieldGate(resolution.directory.council),
    source.councilTaxRow(resolution.directory.council),
    resolution.directory.msoaCode
      ? source.censusRow(resolution.directory.msoaCode)
      : Promise.resolve(null),
    resolution.directory.lsoaCode
      ? source.imdRow(resolution.directory.lsoaCode)
      : Promise.resolve(null),
    source.airSquare(latitude, longitude),
    source.aqmaFacts(latitude, longitude),
    source.noiseRows(postcode),
    resolution.directory.lsoaCode
      ? source.benefits(resolution.directory.lsoaCode)
      : Promise.resolve({ claimantCount: null, ucPeople: null, ucHouseholds: null, bases: null }),
    source.solarCell(solarCellRef(latitude, longitude)),
    source.tribunalFacts(postcode),
    source.broadbandAnswer(postcode),
    source.mobileAnswer(postcode),
  ]);

  const epc = await buildEpc(resolution, source);

  // Company ownership, behind its flag (M6.13): while the
  // flag is off the section is absent and the source is
  // never asked — no read of the company tables happens on
  // the default path at all. At rung 2 the section is the
  // needs-exact-home state, which needs no facts either,
  // so the one read happens only for a rung-1 answer.
  let companyOwnership: CompanyOwnershipSection | undefined;
  if (companyEnabled) {
    companyOwnership =
      resolution.rung === 2
        ? buildCompanyOwnership(resolution, null, nation)
        : buildCompanyOwnership(resolution, await source.companyOwnershipFacts(postcode), nation);
  }

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
          built_up_area: builtUpAreaFacts,
        },
        article4Publishes,
        nation,
        brownfieldFactsValue,
        brownfieldPublishes,
      ),
      heritage: buildHeritage(resolution, listed, monumentFacts, nation, {
        world_heritage_site: worldHeritageFacts,
        battlefield: battlefieldFacts,
        protected_wreck_site: protectedWreckFacts,
        world_heritage_buffer_zone: bufferZoneFacts,
      }),
      nature: buildNature(designations, woodlandFacts, phi, nation),
      epc,
      councilTax: buildCouncilTax(councilTaxFacts, nation),
      // The hand-off reads no source: it derives from the
      // resolution's directory row and nation alone.
      planningApplications: buildPlanningApplications(resolution.directory.council, nation),
      buildingSafety: buildBuildingSafety(resolution, tribunalFactsValue, nation),
      census: buildCensus(censusFacts, resolution.directory.msoaCode, nation),
      imd: buildImd(imdFacts, resolution.directory.lsoaCode, nation),
      air: buildAir(airFacts, aqmaFactsValue),
      noise: buildNoise(noiseFacts, nation),
      benefits: buildBenefits(benefitsFacts, resolution.directory.lsoaCode, nation),
      solar: buildSolar(solarFacts),
      broadband: buildBroadband(broadbandFacts),
      mobile: buildMobile(mobileFacts),
      ...(companyOwnership ? { companyOwnership } : {}),
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
  // The four slimmed sections carry their section's own
  // line beside the headline facts (M6.9, decision D30):
  // in a named state the line IS the section's answer, and
  // a headline that dropped it would serve a state with
  // no sentence — the other seven sections already travel
  // whole or with their lines.
  epc: {
    state: EpcSection["state"];
    headlineBand: string | null;
    // The headline band's predicted/assessed label (M6.18,
    // decision D37, restoring D7): the newest matched
    // certificate's assessmentLabel, picked beside the
    // band — D7 rules a predicted band is labelled
    // predicted wherever it appears, and the slimming had
    // dropped the label by omission. Null where no
    // certificate serves.
    headlineAssessmentLabel: string | null;
    line: string | null;
  };
  councilTax: {
    state: CouncilTaxSection["state"];
    authority: string | null;
    taxYear: string | null;
    bandDAverageLabel: string | null;
    line: string | null;
  };
  air: {
    state: AirSection["state"];
    headlineFigure: AirSection["headlineFigure"];
    line: string | null;
  };
  noise: {
    state: NoiseSection["state"];
    headlineBand: NoiseSection["headlineBand"];
    line: string | null;
  };
  // Broadband headlines as the gigabit line only (D36):
  // the pick carries the section's own line, so a named
  // state's sentence travels verbatim (the D30 rule).
  // Mobile has NO key here — it never headlines, in any
  // form.
  broadband: {
    state: BroadbandSection["state"];
    gigabitCapablePct: number | null;
    line: string | null;
  };
}

export function projectHeadline(bundle: AreaBundle): HeadlineProjection | null {
  if (bundle.kind !== "area-bundle") return null;
  const { sections } = bundle;
  return {
    postcode: bundle.postcode,
    constraints: sections.constraints,
    heritage: sections.heritage,
    nature: sections.nature,
    epc: {
      state: sections.epc.state,
      headlineBand: sections.epc.headlineBand,
      headlineAssessmentLabel: sections.epc.certificates[0]?.assessmentLabel ?? null,
      line: sections.epc.line,
    },
    councilTax: {
      state: sections.councilTax.state,
      authority: sections.councilTax.authority,
      taxYear: sections.councilTax.taxYear,
      bandDAverageLabel: sections.councilTax.bandDAverageLabel,
      line: sections.councilTax.line,
    },
    air: {
      state: sections.air.state,
      headlineFigure: sections.air.headlineFigure,
      line: sections.air.line,
    },
    noise: {
      state: sections.noise.state,
      headlineBand: sections.noise.headlineBand,
      line: sections.noise.line,
    },
    broadband: {
      state: sections.broadband.state,
      gigabitCapablePct: sections.broadband.gigabitCapablePct,
      line: sections.broadband.line,
    },
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

    // The AQMA read (M6.30): the layerFacts predicates
    // over planning_layers' aqma rows, selecting the
    // declaring authority (organisation) no other layer
    // serves. No beyond-radius read — the none state
    // names no distance, so nothing beyond 2 miles is
    // ever measured.
    async aqmaFacts(latitude, longitude) {
      const edition = await db.query(
        "SELECT source_name, source_date::text AS source_date FROM planning_layers WHERE constraint_type = 'aqma' LIMIT 1",
      );
      const { rows: countRows } = await db.query(
        "SELECT count(*)::int AS n FROM planning_layers WHERE constraint_type = 'aqma'",
      );
      const filedCount = Number(countRows[0]?.n ?? 0);
      const sourceName = (edition.rows[0]?.source_name as string | null) ?? null;
      const sourceDate = (edition.rows[0]?.source_date as string | null) ?? null;
      if (filedCount <= 0) {
        return { filedCount, covering: [], nearestWithin: null, sourceName, sourceDate };
      }
      const { rows: coveringRows } = await db.query(
        `SELECT name, organisation, detail FROM planning_layers
         WHERE constraint_type = 'aqma' AND ST_Covers(geom, ${point12})
         ORDER BY name`,
        [longitude, latitude],
      );
      const covering = coveringRows.map((row) => ({
        name: (row.name as string | null) ?? null,
        authority: (row.organisation as string | null) ?? null,
        detail: (row.detail as string | null) ?? null,
      }));
      let nearestWithin: AqmaNearestRow | null = null;
      if (covering.length === 0) {
        const metres = RADIUS_MILES * METRES_PER_MILE;
        const { rows } = await db.query(
          `SELECT name, organisation, detail,
                  ST_Distance(geom::geography, ${point12}::geography) / ${METRES_PER_MILE} AS miles
           FROM planning_layers
           WHERE constraint_type = 'aqma' AND ST_DWithin(geom, ${point12}, $3)
           ORDER BY ST_Distance(geom::geography, ${point12}::geography)
           LIMIT 1`,
          [longitude, latitude, degreeRadius(metres, latitude)],
        );
        const row = rows[0];
        if (row && Number(row.miles) <= RADIUS_MILES) {
          nearestWithin = {
            name: (row.name as string | null) ?? null,
            authority: (row.organisation as string | null) ?? null,
            detail: (row.detail as string | null) ?? null,
            miles: Number(row.miles),
          };
        }
      }
      return { filedCount, covering, nearestWithin, sourceName, sourceDate };
    },

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

    async brownfieldFacts(latitude, longitude) {
      const edition = await db.query(
        "SELECT source_name, source_date::text AS source_date FROM brownfield_sites LIMIT 1",
      );
      const { rows: countRows } = await db.query("SELECT count(*)::int AS n FROM brownfield_sites");
      const filedCount = Number(countRows[0]?.n ?? 0);
      const sourceName = (edition.rows[0]?.source_name as string | null) ?? null;
      const sourceDate = (edition.rows[0]?.source_date as string | null) ?? null;
      if (filedCount <= 0) {
        return { filedCount, within: [], nearestBeyond: null, sourceName, sourceDate };
      }
      const siteColumns = `reference, site_address, hectares, planning_permission_status,
                minimum_net_dwellings, maximum_net_dwellings`;
      const toRow = (row: Record<string, unknown>): BrownfieldRow => ({
        reference: (row.reference as string | null) ?? null,
        siteAddress: (row.site_address as string | null) ?? null,
        hectares: row.hectares === null ? null : Number(row.hectares),
        planningPermissionStatus: (row.planning_permission_status as string | null) ?? null,
        minimumNetDwellings:
          row.minimum_net_dwellings === null ? null : Number(row.minimum_net_dwellings),
        maximumNetDwellings:
          row.maximum_net_dwellings === null ? null : Number(row.maximum_net_dwellings),
        miles: Number(row.miles),
      });
      const metres = RADIUS_MILES * METRES_PER_MILE;
      const { rows } = await db.query(
        `SELECT ${siteColumns},
                ST_Distance(geom::geography, ${point12}::geography) / ${METRES_PER_MILE} AS miles
         FROM brownfield_sites
         WHERE ST_DWithin(geom, ${point12}, $3)
         ORDER BY ST_Distance(geom::geography, ${point12}::geography)`,
        [longitude, latitude, degreeRadius(metres, latitude)],
      );
      const within = rows.map(toRow).filter((row) => row.miles <= RADIUS_MILES);

      let nearestBeyond: BrownfieldRow | null = null;
      if (within.length === 0) {
        for (const step of BEYOND_STEPS_MILES) {
          const stepMetres = step * METRES_PER_MILE;
          const { rows: beyondRows } = await db.query(
            `SELECT ${siteColumns},
                    ST_Distance(geom::geography, ${point12}::geography) / ${METRES_PER_MILE} AS miles
             FROM brownfield_sites
             WHERE ST_DWithin(geom, ${point12}, $3)
             ORDER BY ST_Distance(geom::geography, ${point12}::geography)
             LIMIT 1`,
            [longitude, latitude, degreeRadius(stepMetres, latitude)],
          );
          const hit = beyondRows[0];
          if (hit && Number(hit.miles) <= step) {
            nearestBeyond = toRow(hit);
            break;
          }
        }
      }
      return { filedCount, within, nearestBeyond, sourceName, sourceDate };
    },

    async brownfieldGate() {
      // The same shape as the Article 4 gate, for the same
      // reason: brownfield_publishers is keyed by the
      // platform's organisation entity, the directory carries
      // the council's NAME, and no filed table bridges the
      // two. The gate fails safe — "none found" is never
      // served on an unproven licence, and every absence
      // serves "not published" until the bridge is filed
      // (the platform's organisation register, M12.10(b) —
      // the same filing job the Article 4 gate waits on).
      // The brain's none-found branch is proven by unit tests
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

    async companyOwnershipFacts(postcode) {
      // The guard counts and the edition stamps are read
      // per dataset, independently of the slice: an empty
      // slice still has editions to date its No by, and an
      // unfiled dataset must read as unfiled, never as an
      // empty slice.
      const { rows: countRows } = await db.query(
        "SELECT dataset, count(*)::int AS n FROM company_titles GROUP BY dataset",
      );
      const counts = new Map(countRows.map((row) => [row.dataset as string, Number(row.n)]));
      const editionOf = async (dataset: string) => {
        const { rows } = await db.query(
          "SELECT source_name, source_date::text AS source_date FROM company_titles WHERE dataset = $1 LIMIT 1",
          [dataset],
        );
        return {
          sourceName: (rows[0]?.source_name as string | null) ?? null,
          sourceDate: (rows[0]?.source_date as string | null) ?? null,
        };
      };
      const { rows } = await db.query(
        `SELECT title_number, dataset, tenure, property_address, proprietor_name,
                company_number, proprietorship_category, country_incorporated,
                additional_proprietor_indicator, source_name,
                source_date::text AS source_date
         FROM company_titles WHERE postcode = $1 ORDER BY title_number`,
        [postcode],
      );
      const titles: CompanyTitleRow[] = rows.map((row) => ({
        titleNumber: row.title_number as string,
        dataset: row.dataset as "ccod" | "ocod",
        tenure: row.tenure as string,
        propertyAddress: row.property_address as string,
        proprietorName: row.proprietor_name as string,
        companyNumber: (row.company_number as string | null) ?? null,
        proprietorshipCategory: (row.proprietorship_category as string | null) ?? null,
        countryIncorporated: (row.country_incorporated as string | null) ?? null,
        additionalProprietor: Boolean(row.additional_proprietor_indicator),
        sourceName: (row.source_name as string | null) ?? null,
        sourceDate: (row.source_date as string | null) ?? null,
      }));
      // The snapshots for exactly the numbers the slice
      // carries, keyed by the number as filed; a number
      // with no product row stays null — the named
      // missing-snapshot state, never name-matched.
      const numbers = [
        ...new Set(
          titles.map((title) => title.companyNumber).filter((n): n is string => n !== null),
        ),
      ];
      const snapshots: Record<string, CompanySnapshotRow | null> = {};
      for (const number of numbers) snapshots[number] = null;
      if (numbers.length > 0) {
        const { rows: snapshotRows } = await db.query(
          `SELECT company_number, company_name, status,
                  incorporation_date::text AS incorporation_date, sic_codes,
                  source_name, source_date::text AS source_date
           FROM company_snapshots WHERE company_number = ANY($1)`,
          [numbers],
        );
        for (const row of snapshotRows) {
          snapshots[row.company_number as string] = {
            companyNumber: row.company_number as string,
            companyName: row.company_name as string,
            status: (row.status as string | null) ?? null,
            incorporationDate: (row.incorporation_date as string | null) ?? null,
            sicCodes: (row.sic_codes as string[]) ?? [],
            sourceName: (row.source_name as string | null) ?? null,
            sourceDate: (row.source_date as string | null) ?? null,
          };
        }
      }
      return {
        ccodFiledCount: counts.get("ccod") ?? 0,
        ocodFiledCount: counts.get("ocod") ?? 0,
        editions: { ccod: await editionOf("ccod"), ocod: await editionOf("ocod") },
        titles,
        snapshots,
      };
    },

    async tribunalFacts(postcode) {
      // The guard count, the filing currency and the
      // source name are read across the whole table,
      // independently of the slice: an empty slice still
      // has a currency to date its line by, and an
      // unfiled table must read as unfiled, never as an
      // empty slice (the guard).
      const { rows: guardRows } = await db.query(
        `SELECT count(*)::int AS n, max(retrieved_at) AS last_filed,
                (SELECT source_name FROM tribunal_building_safety_decisions LIMIT 1) AS source_name
         FROM tribunal_building_safety_decisions`,
      );
      const lastFiled = guardRows[0]?.last_filed as Date | string | null | undefined;
      const { rows } = await db.query(
        `SELECT case_ref, decision_date::text AS decision_date, order_kind,
                property_text, building_key, is_single_flat, source_url,
                source_name, source_date::text AS source_date
         FROM tribunal_building_safety_decisions
         WHERE postcode = $1
         ORDER BY decision_date, case_ref`,
        [postcode],
      );
      return {
        filedCount: Number(guardRows[0]?.n ?? 0),
        lastFiledAt: lastFiled ? new Date(lastFiled as string).toISOString() : null,
        sourceName: (guardRows[0]?.source_name as string | null) ?? null,
        rows: rows.map((row) => ({
          caseRef: row.case_ref as string,
          decisionDate: row.decision_date as string,
          orderKind: row.order_kind as TribunalOrderKind,
          propertyText: row.property_text as string,
          buildingKey: row.building_key as string,
          isSingleFlat: Boolean(row.is_single_flat),
          sourceUrl: row.source_url as string,
          sourceName: (row.source_name as string | null) ?? null,
          sourceDate: (row.source_date as string | null) ?? null,
        })),
      };
    },

    async broadbandAnswer(postcode) {
      // The filed answer (load-broadband.mjs) mapped from
      // its filed snake_case shape; absent key, absent
      // postcode — both read as unfiled.
      const { rows } = await db.query(
        "SELECT answers -> 'broadband' AS broadband FROM postcode_cache WHERE postcode = $1",
        [postcode],
      );
      const filed = rows[0]?.broadband as
        | {
            basis: string;
            snapshot: string;
            gigabit_capable_pct: number;
            superfast_30_pct: number;
            ultrafast_100_pct: number;
            ultrafast_300_pct: number;
            nga_pct: number;
            unable_2_pct: number;
            unable_5_pct: number;
            unable_10_pct: number;
            unable_30_pct: number;
            unable_decent_fixed_or_fwa_pct: number;
            decent_via_fwa_pct: number;
            speed_band_pct: BroadbandAnswerFacts["speedBandPct"];
          }
        | null
        | undefined;
      if (!filed) return null;
      return {
        basis: filed.basis,
        snapshot: filed.snapshot,
        gigabitCapablePct: filed.gigabit_capable_pct,
        superfast30Pct: filed.superfast_30_pct,
        ultrafast100Pct: filed.ultrafast_100_pct,
        ultrafast300Pct: filed.ultrafast_300_pct,
        ngaPct: filed.nga_pct,
        unable2Pct: filed.unable_2_pct,
        unable5Pct: filed.unable_5_pct,
        unable10Pct: filed.unable_10_pct,
        unable30Pct: filed.unable_30_pct,
        unableDecentFixedOrFwaPct: filed.unable_decent_fixed_or_fwa_pct,
        decentViaFwaPct: filed.decent_via_fwa_pct,
        speedBandPct: filed.speed_band_pct,
      };
    },

    async mobileAnswer(postcode) {
      const { rows } = await db.query(
        "SELECT answers -> 'mobile' AS mobile FROM postcode_cache WHERE postcode = $1",
        [postcode],
      );
      const filed = rows[0]?.mobile as
        | {
            basis: string;
            snapshot: string;
            laua: string;
            laua_name: string;
            services: Record<
              string,
              {
                outdoor: {
                  no_operator_pct: number | null;
                  all_operators_pct: number | null;
                  at_least_one_operator_pct: number | null;
                } | null;
                indoor?: {
                  no_operator_pct: number | null;
                  all_operators_pct: number | null;
                  at_least_one_operator_pct: number | null;
                } | null;
              }
            >;
          }
        | null
        | undefined;
      if (!filed) return null;
      const mapSet = (
        set: {
          no_operator_pct: number | null;
          all_operators_pct: number | null;
          at_least_one_operator_pct: number | null;
        } | null,
      ): MobileCoverageSetFacts | null =>
        set === null
          ? null
          : {
              noOperatorPct: set.no_operator_pct,
              allOperatorsPct: set.all_operators_pct,
              atLeastOneOperatorPct: set.at_least_one_operator_pct,
            };
      const services: Record<string, MobileServiceFacts> = {};
      for (const [key, service] of Object.entries(filed.services)) {
        services[key] = {
          outdoor: mapSet(service.outdoor),
          ...(service.indoor !== undefined ? { indoor: mapSet(service.indoor) } : {}),
        };
      }
      return {
        basis: filed.basis,
        snapshot: filed.snapshot,
        laua: filed.laua,
        lauaName: filed.laua_name,
        services,
      };
    },
  };
}
