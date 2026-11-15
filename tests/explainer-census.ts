// The explainer census register (plan step M6.18, decision
// D37, on D13 — "every figure explains itself").
//
// This register is a TEST artefact only (D37 ruling 1):
// the explainers themselves stay inside each section's
// served shape — there is no central registry serving
// text. The register is the M6.18 prep's census made
// executable: 67 figure families, each judged hard or
// self-explanatory, each naming where its beside-figure
// line lives. Its ids are stable and exportable: they are
// the anchor list M7's How-we-check page and M6.19's
// contract tests use (D37 ruling 3 — the pointer is the
// section key; these ids name the figures within it).
//
// The enforcement (tests/explainer-census.test.ts) runs
// in both directions, at both depths:
//   direction one — every HARD family's named line is
//     present and non-empty on real golden bundles;
//   direction two — no note field appears on a
//     self-explanatory figure's own object;
//   fail-closed — every numeric or labelled leaf of a
//     served bundle is either a census entry's figure
//     (FIGURE_PATH_PATTERNS) or on the explicit
//     not-a-figure allowlist below, so a future figure
//     shipping unregistered fails the suite naming its
//     path.
//
// One dependency is recorded here, not built (D37): the
// air section's D13 compliance is discharged by the
// How-we-check page carrying the statutory-limits
// material (prep row 46). The page is M7's; if M7 drops
// it, that row's compliance lapses — the register entry
// `area.air.concentrations` carries the dependency in its
// note so the page step inherits it as an obligation.

export type CensusHardness = "hard" | "self";

export type CensusLineWhere =
  | "explainer" // the section's / answer's explainer field
  | "line-embedded" // the figure's own composed line carries it
  | "definition" // a per-label definition field (flood)
  | "basis-label" // a basis label field (nearby distances)
  | "dedicated-field" // a field serving this figure's line alone
  | "none"; // self-explanatory: no line, by D13's second direction

export interface CensusEntry {
  // The prep census row number (1–67) — the register and
  // the prep table are the same list in two forms.
  row: number;
  id: string;
  bundle: "address" | "nearby" | "soldPrices" | "crime" | "flood" | "area" | "short";
  section: string;
  figure: string;
  hardness: CensusHardness;
  depths: ("full" | "short")[];
  lineWhere: CensusLineWhere;
  // Where the line lives, as a served-shape locator.
  linePath: string | null;
  note?: string;
}

const e = (
  row: number,
  id: string,
  bundle: CensusEntry["bundle"],
  section: string,
  figure: string,
  hardness: CensusHardness,
  depths: CensusEntry["depths"],
  lineWhere: CensusLineWhere,
  linePath: string | null,
  note?: string,
): CensusEntry => ({
  row,
  id,
  bundle,
  section,
  figure,
  hardness,
  depths,
  lineWhere,
  linePath,
  note,
});

export const EXPLAINER_CENSUS: CensusEntry[] = [
  // Address (prep 2.1)
  e(
    1,
    "address.rung3-postcode-count",
    "address",
    "address",
    "rung-3 postcodeCount",
    "self",
    ["full"],
    "none",
    null,
    "Internal shape; its one user-visible number reaches a reader only through M7's search UI, which must carry its own line there.",
  ),
  // Nearby (prep 2.2)
  e(
    2,
    "nearby.distance-miles",
    "nearby",
    "nearby",
    "distance in miles per named place",
    "self",
    ["full", "short"],
    "basis-label",
    "categories[].basisLabel",
  ),
  e(
    3,
    "nearby.count-within",
    "nearby",
    "nearby",
    "countWithin per category",
    "self",
    ["full", "short"],
    "line-embedded",
    "categories[].line",
  ),
  e(
    4,
    "nearby.nearest-selective",
    "nearby",
    "nearby",
    "nearest selective secondary school",
    "hard",
    ["full"],
    "dedicated-field",
    "categories[schools-secondary].nearestSelectiveLine",
    "FIXED at M6.18: the gloss — selective means admission by entrance test — serves in the dedicated line field.",
  ),
  e(
    5,
    "nearby.detail-facts",
    "nearby",
    "nearby",
    "detail facts beside names (EV access class, recorded religion)",
    "self",
    ["full"],
    "none",
    null,
  ),
  // Sold prices (prep 2.3)
  e(
    6,
    "sold.own-sale",
    "soldPrices",
    "soldPrices",
    "own sale price + date (history list)",
    "self",
    ["full"],
    "explainer",
    "ownExplainer",
  ),
  e(
    7,
    "sold.postcode-median",
    "soldPrices",
    "soldPrices",
    "postcode median",
    "hard",
    ["full", "short"],
    "explainer",
    "median.explainer",
  ),
  e(
    8,
    "sold.building-median",
    "soldPrices",
    "soldPrices",
    "building median (flats)",
    "hard",
    ["full", "short"],
    "explainer",
    "buildingMedian.explainer",
  ),
  e(
    9,
    "sold.counted-count-span",
    "soldPrices",
    "soldPrices",
    "counted count + date span",
    "self",
    ["full"],
    "line-embedded",
    "median line",
  ),
  e(
    10,
    "sold.recent-sales",
    "soldPrices",
    "soldPrices",
    "recent sales list (price + date + address)",
    "self",
    ["full"],
    "none",
    null,
  ),
  e(
    11,
    "sold.recorded-count",
    "soldPrices",
    "soldPrices",
    "recordedCount (all recorded sales, both categories)",
    "self",
    ["full"],
    "none",
    null,
    "WATCH from the prep: two counts with different bases sit in one shape; the median's own line names its base, so the reader is protected.",
  ),
  // Crime (prep 2.4)
  e(
    12,
    "crime.total",
    "crime",
    "crime",
    "12-month total",
    "hard",
    ["full", "short"],
    "explainer",
    "crime.explainer",
  ),
  e(
    13,
    "crime.category-counts",
    "crime",
    "crime",
    "category counts (14 publisher slugs)",
    "hard",
    ["full"],
    "explainer",
    "crime.explainer",
    "What is inside buckets like 'other crime' is derivation material for How-we-check (M7), not a beside-figure line.",
  ),
  e(
    14,
    "crime.monthly-counts",
    "crime",
    "crime",
    "12 monthly counts",
    "self",
    ["full"],
    "none",
    null,
  ),
  e(
    15,
    "crime.stale-line",
    "crime",
    "crime",
    "stale line",
    "self",
    ["full", "short"],
    "line-embedded",
    "crime.staleLine",
    "A line, not a figure (the prep's census marks its hardness '—'): its travel at both depths is asserted in the state matrix and the short-bundle suite.",
  ),
  // Flood, report depth (prep 2.5)
  e(
    16,
    "flood.label",
    "flood",
    "flood",
    "zone / band label (FZ3, High, Very low…)",
    "hard",
    ["full"],
    "definition",
    "flood.layers[].covering.definition",
  ),
  e(
    17,
    "flood.proximity-miles",
    "flood",
    "flood",
    "proximity / beyond miles per label",
    "self",
    ["full"],
    "definition",
    "flood.layers[].proximity[].definition",
  ),
  e(
    18,
    "flood.limits",
    "flood",
    "flood",
    "the bundle's limits (point-not-property; no past-flooding record; insurers' own models)",
    "hard",
    ["full"],
    "dedicated-field",
    "flood.howWeCheck",
  ),
  // Area — constraints, heritage, nature (prep 2.6)
  e(
    19,
    "area.constraints.inside-facts",
    "area",
    "constraints",
    "constraints inside facts + absence lines",
    "self",
    ["full", "short"],
    "explainer",
    "sections.constraints.explainer",
  ),
  e(
    20,
    "area.constraints.article4-rights",
    "area",
    "constraints",
    "Article 4 removed-rights codes",
    "hard",
    ["full"],
    "line-embedded",
    "sections.constraints.article4 rights translations",
  ),
  e(
    21,
    "area.polygon-miles",
    "area",
    "constraints",
    "polygon nearest / beyond miles",
    "self",
    ["full", "short"],
    "line-embedded",
    "beyond lines embed the distance basis",
  ),
  e(
    22,
    "area.heritage.listed-count",
    "area",
    "heritage",
    "heritage listed count + nearest 3",
    "self",
    ["full", "short"],
    "line-embedded",
    "sections.heritage.listed.line",
  ),
  e(
    23,
    "area.heritage.grade",
    "area",
    "heritage",
    "listed building grade (I, II*, II)",
    "hard",
    ["full", "short"],
    "explainer",
    "sections.heritage.explainer",
    "FIXED at M6.18: the grade gloss, in the publisher's terms, joins the heritage explainer.",
  ),
  e(
    24,
    "area.heritage.nhle-number",
    "area",
    "heritage",
    "NHLE entry number",
    "self",
    ["full", "short"],
    "line-embedded",
    "sections.heritage.atPoint.line",
  ),
  e(
    25,
    "area.nature.designation-labels",
    "area",
    "nature",
    "nature designation labels (SSSI, SAC, SPA, Ramsar)",
    "hard",
    ["full", "short"],
    "explainer",
    "sections.nature.explainer",
    "FIXED at M6.18: the four designations are expanded in the nature explainer — the expansion is filed once in the served data (D37); the website expands at first mention, the report carries the expansion in the line itself.",
  ),
  e(
    26,
    "area.nature.place-miles-count",
    "area",
    "nature",
    "nature place miles + placesWithinCount",
    "self",
    ["full", "short"],
    "line-embedded",
    "sections.nature.placesLine",
  ),
  e(
    27,
    "area.nature.ancient-woodland",
    "area",
    "nature",
    "ancient woodland inside / absence + the provisional-inventory caveat",
    "hard",
    ["full", "short"],
    "dedicated-field",
    "sections.nature.ancientWoodlandInventoryLine",
    "FIXED at M6.18: ANCIENT_WOODLAND_INVENTORY_LINE, written but previously served nowhere, is wired into the section's served shape.",
  ),
  e(
    28,
    "area.nature.priority-habitat",
    "area",
    "nature",
    "priority habitat nearest + types",
    "self",
    ["full", "short"],
    "line-embedded",
    "sections.nature.priorityHabitat.line",
  ),
  // Area — EPC (prep 2.7)
  e(
    29,
    "area.epc.band",
    "area",
    "epc",
    "band + potential band per certificate",
    "self",
    ["full", "short"],
    "line-embedded",
    "sections.epc.certificates[].assessmentLabel",
  ),
  e(
    30,
    "area.epc.rating",
    "area",
    "epc",
    "rating number",
    "hard",
    ["full"],
    "dedicated-field",
    "sections.epc.certificates[].ratingLine",
    "FIXED at M6.18: each certificate's rating gains its scale line — the register's score, from which the band derives.",
  ),
  e(31, "area.epc.floor-area", "area", "epc", "floor area (sq m)", "self", ["full"], "none", null),
  e(
    32,
    "area.epc.energy-costs",
    "area",
    "epc",
    "modelled energy costs (per certificate)",
    "hard",
    ["full"],
    "line-embedded",
    "sections.epc.certificates[].energyCosts.line",
  ),
  e(
    33,
    "area.epc.spread",
    "area",
    "epc",
    "spread percentages + counts per band, per assessment kind",
    "hard",
    ["full"],
    "line-embedded",
    "sections.epc.spread.rows[].line",
  ),
  e(
    34,
    "area.epc.certificate-count",
    "area",
    "epc",
    "certificateCountAtPostcode",
    "self",
    ["full"],
    "none",
    null,
  ),
  // Area — council tax (prep 2.8)
  e(
    35,
    "area.council-tax.band-d-average",
    "area",
    "councilTax",
    "Band D area average",
    "hard",
    ["full", "short"],
    "line-embedded",
    "sections.councilTax.line",
  ),
  e(
    36,
    "area.council-tax.components",
    "area",
    "councilTax",
    "component split + parish figure",
    "self",
    ["full"],
    "line-embedded",
    "sections.councilTax.parish.line",
  ),
  e(
    37,
    "area.council-tax.bands-table",
    "area",
    "councilTax",
    "per-band table (bands A–H/I, annual + monthly)",
    "hard",
    ["full"],
    "dedicated-field",
    "sections.councilTax.bandsLine",
    "FIXED at M6.18 (the prep's PARTIAL row): the served shape now states the derivation — the other bands are set from Band D by fixed statutory ratios, in ninths of Band D. The full derivation also belongs to How-we-check (M7).",
  ),
  e(
    38,
    "area.council-tax.monthly",
    "area",
    "councilTax",
    "monthly-equivalent line",
    "hard",
    ["full", "short"],
    "line-embedded",
    "sections.councilTax.monthlyLine",
  ),
  // Area — Census, IMD, air, noise, benefits, solar (prep 2.9)
  e(
    39,
    "area.census.table-counts",
    "area",
    "census",
    "Census table counts (6 tables)",
    "self",
    ["full"],
    "explainer",
    "sections.census.explainer",
  ),
  e(
    40,
    "area.census.table-percentages",
    "area",
    "census",
    "Census table percentages",
    "hard",
    ["full"],
    "explainer",
    "sections.census.explainer",
    "FIXED at M6.18: the own-total line joins the Census explainer — each table's percentages are of that table's own total, and the totals differ because of Census disclosure control.",
  ),
  e(
    41,
    "area.census.median-age",
    "area",
    "census",
    "median age",
    "hard",
    ["full"],
    "line-embedded",
    "sections.census.medianAge.line",
  ),
  e(
    42,
    "area.census.social-rented",
    "area",
    "census",
    "social-rented share",
    "hard",
    ["full"],
    "line-embedded",
    "sections.census.socialRented.line",
  ),
  e(
    43,
    "area.census.totals",
    "area",
    "census",
    "residentsTotal / householdsTotal",
    "self",
    ["full"],
    "none",
    null,
    "WATCH from the prep: bare totals whose source tables are not named in the served shape; renderers should take totals from the tables, which carry them.",
  ),
  e(
    44,
    "area.imd.decile",
    "area",
    "imd",
    "IMD decile + filed summary",
    "hard",
    ["full"],
    "explainer",
    "sections.imd.explainer",
  ),
  e(
    45,
    "area.imd.domain-deciles",
    "area",
    "imd",
    "IMD domain deciles (x7)",
    "hard",
    ["full"],
    "explainer",
    "sections.imd.explainer",
  ),
  e(
    46,
    "area.air.concentrations",
    "area",
    "air",
    "air NO2 / PM2.5 / PM10 (µg/m³)",
    "hard",
    ["full", "short"],
    "explainer",
    "sections.air.explainer",
    "POINTER-CRITICAL (prep PARTIAL): beside-figure compliance covers the modelled basis only. What the values mean against statutory limits is discharged ONLY by the How-we-check page carrying the limits material at M7 — recorded here as a dependency, not built at M6.18 (D37). If the page drops it, this row's compliance lapses.",
  ),
  e(
    47,
    "area.noise.bands",
    "area",
    "noise",
    "noise bands (day / night, per source)",
    "self",
    ["full", "short"],
    "explainer",
    "sections.noise.explainer",
  ),
  e(
    48,
    "area.benefits.series-counts",
    "area",
    "benefits",
    "benefits series counts (x3)",
    "hard",
    ["full"],
    "explainer",
    "sections.benefits.explainer",
  ),
  e(
    49,
    "area.benefits.claimant-pct",
    "area",
    "benefits",
    "Claimant Count percentage",
    "hard",
    ["full"],
    "dedicated-field",
    "sections.benefits.series[claimant_count].pctLine",
    "FIXED at M6.18: the base — of the working-age population — serves in the series' own pctLine, not only in a code comment.",
  ),
  e(
    50,
    "area.benefits.bases",
    "area",
    "benefits",
    "benefits bases (residents / households counts)",
    "hard",
    ["full"],
    "dedicated-field",
    "sections.benefits.basesLine",
    "FIXED at M6.18: the bases are labelled in the served shape — the small area's Census residents and households, filed as the series' context.",
  ),
  e(
    51,
    "area.solar.yield",
    "area",
    "solar",
    "solar yield (kWh per kWp per year)",
    "hard",
    ["full"],
    "line-embedded",
    "sections.solar.line + basisLine",
  ),
  e(
    52,
    "area.solar.irradiation",
    "area",
    "solar",
    "solar irradiation (kWh/m²)",
    "hard",
    ["full"],
    "line-embedded",
    "sections.solar.line",
  ),
  // Area — planning hand-off and company ownership (prep 2.10)
  e(
    53,
    "area.planning.handoff",
    "area",
    "planningApplications",
    "planning hand-off (no figures serve)",
    "self",
    ["full"],
    "explainer",
    "sections.planningApplications.explainer",
    "Recorded so a future filing step that adds figures fails closed until it adds rows here.",
  ),
  e(
    54,
    "area.company.facts",
    "area",
    "companyOwnership",
    "company: proprietor name, title number, tenure, dates, status",
    "self",
    ["full"],
    "explainer",
    "sections.companyOwnership.explainer",
  ),
  e(
    55,
    "area.company.sic-codes",
    "area",
    "companyOwnership",
    "company: SIC codes on the snapshot",
    "hard",
    ["full"],
    "dedicated-field",
    "sections.companyOwnership titles[].snapshot.sicCodesLine",
    "FIXED at M6.18 (the prep's latent row): the snapshot gains the SIC explainer inside the section's served shape. The section stays behind its flag — the flag's position does not change at this step.",
  ),
  // Headline depth — the short bundle's deltas (prep 2.11)
  e(
    56,
    "short.sold-median",
    "short",
    "soldPrices",
    "short sold-prices median / own last sale",
    "hard",
    ["short"],
    "explainer",
    "sections.soldPrices.explainer",
  ),
  e(
    57,
    "short.crime-total-asb",
    "short",
    "crime",
    "short crime total + ASB count",
    "hard",
    ["short"],
    "explainer",
    "sections.crime.explainer",
  ),
  e(
    58,
    "short.flood-labels",
    "short",
    "flood",
    "short flood zone / band labels",
    "hard",
    ["short"],
    "definition",
    "sections.flood.layers[].coveringDefinition",
    "FIXED at M6.18 (D37 ruling 2, a narrow amendment to D28): the COVERING label's EA definition is picked into the short bundle; proximity definitions stay at report depth.",
  ),
  e(
    59,
    "short.epc-headline-band",
    "short",
    "epc",
    "short EPC headline band",
    "self",
    ["short"],
    "line-embedded",
    "sections.epc.headlineAssessmentLabel",
    "FIXED at M6.18 (D37 ruling 2, restoring D7): the headline band carries the newest certificate's predicted/assessed label — the slimming had dropped it by omission.",
  ),
  e(
    60,
    "short.council-tax-line",
    "short",
    "councilTax",
    "short council-tax line",
    "hard",
    ["short"],
    "line-embedded",
    "sections.councilTax.line",
  ),
  e(
    61,
    "short.air-noise",
    "short",
    "air",
    "short air NO2 / short noise road day band",
    "hard",
    ["short"],
    "line-embedded",
    "sections.air.line / sections.noise.line",
  ),
  e(
    62,
    "short.whole-sections",
    "short",
    "constraints",
    "short constraints / heritage / nature / nearby",
    "self",
    ["short"],
    "explainer",
    "the sections travel whole or near-whole through the projection",
    "Inherits rows 19–28's verdicts at headline depth — including the grade and designation fixes, which are therefore explained at both depths.",
  ),
  // Prospective rows for the sections built at M6.16/M6.17
  // (prep 2.12) — RE-VERIFIED against the built shapes at
  // M6.18: no row is contradicted. Building safety's
  // explainer carries the two order types with their Act
  // sections, and each decision's kindLine glosses its own
  // kind; broadband's explainer states availability, never
  // a speed a home will get and never take-up, and the
  // unclassified share serves as its own named line;
  // mobile's every served line names the council and the
  // section explainer states the modelled basis.
  e(
    63,
    "area.building-safety.decision-counts",
    "area",
    "buildingSafety",
    "building safety: decision counts / dates per building",
    "self",
    ["full"],
    "line-embedded",
    "sections.buildingSafety.tribunal.line",
  ),
  e(
    64,
    "area.building-safety.order-types",
    "area",
    "buildingSafety",
    "building safety: order-type labels (remediation order, remediation contribution order, Section 123 / 124)",
    "hard",
    ["full"],
    "explainer",
    "sections.buildingSafety.explainer",
  ),
  e(
    65,
    "area.broadband.gigabit-pct",
    "area",
    "broadband",
    "broadband: gigabit-capable percentage",
    "hard",
    ["full", "short"],
    "explainer",
    "sections.broadband.explainer",
  ),
  e(
    66,
    "area.broadband.bands-unclassified",
    "area",
    "broadband",
    "broadband: speed-band shares + unclassified share",
    "hard",
    ["full"],
    "line-embedded",
    "sections.broadband.unclassifiedLine + bandsLine",
  ),
  e(
    67,
    "area.mobile.operator-pct",
    "area",
    "mobile",
    "mobile: at-least-one-operator percentage, per service",
    "hard",
    ["full"],
    "line-embedded",
    "sections.mobile.services[].line",
  ),
];

// ------------------------------------------------------------------
// The fail-closed leaf walk
// ------------------------------------------------------------------
//
// A leaf is any primitive (string, number, boolean) in a
// served bundle. Its path is normalised by replacing every
// array index with []. A leaf is REGISTERED when its
// normalised path matches a FIGURE_PATH_PATTERNS entry
// (each pattern names the census ids whose figure lives at
// those paths) or a NOT_A_FIGURE pattern (dates,
// identifiers, names, postcodes, coordinates, structural
// state labels and the like — values that are not figures
// at all). Anything else is returned by
// findUnregisteredLeaves, naming its concrete path.

export interface FigurePathPattern {
  pattern: RegExp;
  censusIds: string[];
}

const p = (pattern: string, ...censusIds: string[]): FigurePathPattern => ({
  pattern: new RegExp(`^${pattern}$`),
  censusIds,
});

// Patterns are matched against normalised paths rooted at
// the bundle kind: "address." / "nearby." / "soldPrices." /
// "crime." / "flood." / "area." / "short.".
export const FIGURE_PATH_PATTERNS: FigurePathPattern[] = [
  // Nearby figures
  p("nearby\\.categories\\[\\]\\.places\\[\\]\\.miles", "nearby.distance-miles"),
  p("nearby\\.categories\\[\\]\\.countWithin", "nearby.count-within"),
  p("nearby\\.categories\\[\\]\\.beyondNearest\\.miles", "nearby.distance-miles"),
  p("nearby\\.categories\\[\\]\\.nearestSelective\\.miles", "nearby.nearest-selective"),
  p("nearby\\.categories\\[\\]\\.nearestSelectiveLine", "nearby.nearest-selective"),
  // Sold prices figures
  p("soldPrices\\.ownHistory\\[\\]\\.price", "sold.own-sale"),
  p("soldPrices\\.median\\.value", "sold.postcode-median"),
  p("soldPrices\\.median\\.counted", "sold.counted-count-span"),
  p("soldPrices\\.building\\.median\\.value", "sold.building-median"),
  p("soldPrices\\.building\\.median\\.counted", "sold.counted-count-span"),
  p("soldPrices\\.building\\.sales\\[\\]\\.price", "sold.building-median"),
  p("soldPrices\\.recentSales\\[\\]\\.price", "sold.recent-sales"),
  p("soldPrices\\.recordedCount", "sold.recorded-count"),
  // Crime figures
  p("crime\\.crime\\.total", "crime.total"),
  p("crime\\.crime\\.categories\\[\\]\\.count", "crime.category-counts"),
  p("crime\\.crime\\.months\\[\\]\\.count", "crime.monthly-counts"),
  // Flood figures
  p("flood\\.flood\\.layers\\[\\]\\.proximity\\[\\]\\.miles", "flood.proximity-miles"),
  // Area figures — heritage / nature
  p("area\\.sections\\.heritage\\.listed\\.countWithin", "area.heritage.listed-count"),
  p("area\\.sections\\.heritage\\.listed\\.within\\[\\]\\.miles", "area.heritage.listed-count"),
  p("area\\.sections\\.heritage\\.listed\\.beyondNearest\\.miles", "area.heritage.listed-count"),
  p("area\\.sections\\.nature\\.places\\[\\]\\.miles", "area.nature.place-miles-count"),
  p(
    "area\\.sections\\.nature\\.places\\[\\]\\.designations\\[\\]\\.miles",
    "area.nature.place-miles-count",
  ),
  p("area\\.sections\\.nature\\.placesWithinCount", "area.nature.place-miles-count"),
  p("area\\.sections\\.nature\\.beyondPlace\\.miles", "area.nature.place-miles-count"),
  p(
    "area\\.sections\\.nature\\.beyondPlace\\.designations\\[\\]\\.miles",
    "area.nature.place-miles-count",
  ),
  p("soldPrices\\.building\\.sales\\[\\]\\.propertyType", "sold.own-sale"),
  p("soldPrices\\.building\\.sales\\[\\]\\.newBuild", "sold.own-sale"),
  p("soldPrices\\.building\\.counted", "sold.building-median"),
  p("area\\.sections\\.nature\\.ancientWoodland\\.nearest\\.miles", "area.nature.ancient-woodland"),
  p(
    "area\\.sections\\.nature\\.ancientWoodland\\.beyondNearest\\.miles",
    "area.nature.ancient-woodland",
  ),
  p("area\\.sections\\.nature\\.priorityHabitat\\.nearest\\.miles", "area.nature.priority-habitat"),
  // Area figures — EPC
  p("area\\.sections\\.epc\\.certificates\\[\\]\\.rating", "area.epc.rating"),
  p("area\\.sections\\.epc\\.certificates\\[\\]\\.assessmentLabel", "area.epc.band"),
  p("area\\.sections\\.epc\\.headlineBand", "area.epc.band"),
  p("area\\.sections\\.councilTax\\.bandDAverageLabel", "area.council-tax.band-d-average"),
  p("area\\.sections\\.epc\\.certificates\\[\\]\\.floorAreaSqM", "area.epc.floor-area"),
  p(
    "area\\.sections\\.epc\\.certificates\\[\\]\\.energyCosts\\.(current|potential)(Annual|Monthly)Pence",
    "area.epc.energy-costs",
  ),
  p("area\\.sections\\.epc\\.certificateCountAtPostcode", "area.epc.certificate-count"),
  p("area\\.sections\\.epc\\.spread\\.certificateCount", "area.epc.spread"),
  p("area\\.sections\\.epc\\.spread\\.rows\\[\\]\\.count", "area.epc.spread"),
  p("area\\.sections\\.epc\\.spread\\.rows\\[\\]\\.bands\\[\\]\\.count", "area.epc.spread"),
  p("area\\.sections\\.epc\\.spread\\.rows\\[\\]\\.bands\\[\\]\\.pct", "area.epc.spread"),
  // Area figures — council tax
  p("area\\.sections\\.councilTax\\.bandDAveragePence", "area.council-tax.band-d-average"),
  p("area\\.sections\\.councilTax\\.components\\[\\]\\.pence", "area.council-tax.components"),
  p("area\\.sections\\.councilTax\\.parish\\.pence", "area.council-tax.components"),
  p("area\\.sections\\.councilTax\\.bands\\[\\]\\.pence", "area.council-tax.bands-table"),
  p("area\\.sections\\.councilTax\\.bands\\[\\]\\.monthlyPence", "area.council-tax.bands-table"),
  p("area\\.sections\\.councilTax\\.bandDMonthlyPence", "area.council-tax.monthly"),
  // Area figures — Census / IMD / air / noise / benefits / solar
  p("area\\.sections\\.census\\.residentsTotal", "area.census.totals"),
  p("area\\.sections\\.census\\.householdsTotal", "area.census.totals"),
  p("area\\.sections\\.census\\.medianAge\\.value", "area.census.median-age"),
  p("area\\.sections\\.census\\.socialRented\\.(count|total|pct)", "area.census.social-rented"),
  p("area\\.sections\\.census\\.tables\\[\\]\\.total", "area.census.table-counts"),
  p("area\\.sections\\.census\\.tables\\[\\]\\.rows\\[\\]\\.count", "area.census.table-counts"),
  p("area\\.sections\\.census\\.tables\\[\\]\\.rows\\[\\]\\.pct", "area.census.table-percentages"),
  p("area\\.sections\\.census\\.tables\\[\\]\\.groups\\[\\]\\.count", "area.census.table-counts"),
  p(
    "area\\.sections\\.census\\.tables\\[\\]\\.groups\\[\\]\\.pct",
    "area.census.table-percentages",
  ),
  p("area\\.sections\\.imd\\.decile", "area.imd.decile"),
  p("area\\.sections\\.imd\\.domains\\[\\]\\.decile", "area.imd.domain-deciles"),
  p("area\\.sections\\.air\\.(no2|pm25|pm10)", "area.air.concentrations"),
  p("area\\.sections\\.air\\.headlineFigure\\.value", "area.air.concentrations"),
  p("area\\.sections\\.benefits\\.series\\[\\]\\.count", "area.benefits.series-counts"),
  p("area\\.sections\\.benefits\\.series\\[\\]\\.pct", "area.benefits.claimant-pct"),
  p("area\\.sections\\.benefits\\.bases\\.(residents|households)", "area.benefits.bases"),
  p("area\\.sections\\.solar\\.yieldKwhPerKwp", "area.solar.yield"),
  p("area\\.sections\\.solar\\.irradiationKwhM2", "area.solar.irradiation"),
  p(
    "area\\.sections\\.solar\\.basis\\.(peakPowerKwp|slopeDeg|azimuthDeg|systemLossPct|yearMin|yearMax)",
    "area.solar.yield",
  ),
  // Area figures — building safety / broadband / mobile
  p(
    "area\\.sections\\.buildingSafety\\.tribunal\\.decisionCount",
    "area.building-safety.decision-counts",
  ),
  p(
    "area\\.sections\\.broadband\\.(gigabitCapablePct|superfast30Pct|ultrafast100Pct|ultrafast300Pct)",
    "area.broadband.gigabit-pct",
  ),
  p("area\\.sections\\.broadband\\.bands\\[\\]\\.pct", "area.broadband.bands-unclassified"),
  p("area\\.sections\\.broadband\\.unclassifiedPct", "area.broadband.bands-unclassified"),
  p(
    "area\\.sections\\.mobile\\.services\\[\\]\\.(outdoor|indoor)\\.(atLeastOneOperatorPct|allOperatorsPct|noOperatorPct)",
    "area.mobile.operator-pct",
  ),
  // Short-bundle figures
  p("short\\.sections\\.soldPrices\\.ownLastSale\\.price", "sold.own-sale"),
  p("short\\.sections\\.soldPrices\\.median\\.value", "short.sold-median"),
  p("short\\.sections\\.soldPrices\\.median\\.counted", "sold.counted-count-span"),
  p("short\\.sections\\.soldPrices\\.buildingMedian\\.value", "short.sold-median"),
  p("short\\.sections\\.soldPrices\\.buildingMedian\\.counted", "sold.counted-count-span"),
  p("short\\.sections\\.crime\\.total", "short.crime-total-asb"),
  p("short\\.sections\\.crime\\.asb\\.count", "short.crime-total-asb"),
  p("short\\.sections\\.heritage\\.listed\\.countWithin", "area.heritage.listed-count"),
  p("short\\.sections\\.heritage\\.listed\\.nearest\\.miles", "area.heritage.listed-count"),
  p("short\\.sections\\.nature\\.placesWithinCount", "area.nature.place-miles-count"),
  p("short\\.sections\\.nature\\.nearestPlace\\.miles", "area.nature.place-miles-count"),
  p(
    "short\\.sections\\.nature\\.nearestPlace\\.designations\\[\\]\\.miles",
    "area.nature.place-miles-count",
  ),
  p(
    "short\\.sections\\.nature\\.priorityHabitat\\.typesWithin\\[\\]",
    "area.nature.priority-habitat",
  ),
  p(
    "area\\.sections\\.nature\\.priorityHabitat\\.typesWithin\\[\\]",
    "area.nature.priority-habitat",
  ),
  p("soldPrices\\.(recentSales|ownHistory)\\[\\]\\.propertyType", "sold.own-sale"),
  p("soldPrices\\.(recentSales|ownHistory)\\[\\]\\.newBuild", "sold.own-sale"),
  p("short\\.sections\\.flood\\.layers\\[\\]\\.coveringLabel", "short.flood-labels"),
  p("flood\\.flood\\.layers\\[\\]\\.(covering|remainder)\\.displayLabel", "flood.label"),
  p("flood\\.flood\\.layers\\[\\]\\.proximity\\[\\]\\.displayLabel", "flood.label"),
  p("short\\.sections\\.epc\\.headlineBand", "short.epc-headline-band"),
  p("short\\.sections\\.epc\\.headlineAssessmentLabel", "short.epc-headline-band"),
  p("short\\.sections\\.councilTax\\.bandDAverageLabel", "short.council-tax-line"),
  p(
    "short\\.sections\\.nature\\.ancientWoodland\\.nearest\\.miles",
    "area.nature.ancient-woodland",
  ),
  p(
    "short\\.sections\\.nature\\.ancientWoodland\\.beyondNearest\\.miles",
    "area.nature.ancient-woodland",
  ),
  p(
    "short\\.sections\\.nature\\.priorityHabitat\\.nearest\\.miles",
    "area.nature.priority-habitat",
  ),
  p("short\\.sections\\.air\\.headlineFigure\\.value", "short.air-noise"),
  p("short\\.sections\\.broadband\\.gigabitCapablePct", "area.broadband.gigabit-pct"),
  p("short\\.sections\\.nearby\\.categories\\[\\]\\.nearest\\.miles", "nearby.distance-miles"),
  p("short\\.sections\\.nearby\\.categories\\[\\]\\.countWithin", "nearby.count-within"),
  p("short\\.sections\\.constraints\\..*\\.nearest\\.miles", "area.polygon-miles"),
  p("short\\.sections\\.constraints\\..*\\.beyondNearest\\.miles", "area.polygon-miles"),
  p("area\\.sections\\.constraints\\..*\\.nearest\\.miles", "area.polygon-miles"),
  p("area\\.sections\\.constraints\\..*\\.beyondNearest\\.miles", "area.polygon-miles"),
  p("area\\.sections\\.heritage\\.monuments\\.nearest\\.miles", "area.polygon-miles"),
  p("area\\.sections\\.heritage\\.monuments\\.beyondNearest\\.miles", "area.polygon-miles"),
];

// Values that are not figures at all: dates, identifiers,
// names, postcodes, coordinates, structural labels (state /
// kind / rung / depth / grain), source attributions and
// lines that carry no figure of their own beyond the ones
// registered above. A path here is an explicit exemption,
// reviewed like a census entry — never a silent skip.
export const NOT_A_FIGURE_ALLOWLIST: RegExp[] = [
  // Structural scalars on every bundle
  /(^|\.)(rung|kind|state|depth|grain|pointState|pctState|numberState|calculated|predicted|additionalProprietor|parishAveraged|isSingleFlat|isHomeBuilding|allOperatorsPublished|councilPublishes|selective|partOf|inside|mounting|pvTechnology|radiationDb|monthlyLabelPence|bandDMonthlyLabel)$/,
  // Dates and date-like labels
  /(^|\.)(date|saleDate|registrationDate|incorporationDate|decisionDate|decisionDateLabel|sourceDate|loadedAt|month|monthLabel|windowFrom|windowTo|spanFrom|spanTo|taxYear|year|snapshot|edition|windowLine|spanLine|fromLabel|toLabel|loadState|pollutant)$/,
  // Identifiers and codes that name, not measure
  /(^|\.)(postcode|id|listEntryId|certificateNumber|titleNumber|companyNumber|caseRef|buildingKey|cellRef|lsoaCode|msoaCode|code|slug|category|layer|series|service|sourceKind|dataset|tenure|proprietorshipCategory|countryIncorporated|key)$/,
  // Names, labels and publisher wording (the words, not figures)
  /(^|\.)(name|label|title|band|potentialBand|grade|type|typeLabel|dwellingType|assessmentType|authority|council|msoaName|lsoaName|unit|building|habitat|detail|coveringDetail|dayBand|nightBand|summary|propertyText|companyName|proprietorName|status|kindLine|group|groups)$/,
  // Lines, explainers, definitions and source lines: the
  // census's own subject matter — their presence is what
  // direction one asserts; they are text, not figures.
  /(Line|line|explainer|definition|howWeCheck|basisLabel|sourceLine|sourceName|reason|rights|localListsLine|coverageLine|placesLine|designationsLine|grainLine|attributionLine|snapshotLine|windowLine|totalLine|staleLine|beyondLine|insideLine|ownExplainer|address|street|town|locality|labelPence|currentAnnualLabel|currentMonthlyLabel|potentialAnnualLabel|potentialMonthlyLabel|url|link|href|recentLabel|coveringDefinition)$/,
  // The crime bundle's filed basis string: the publisher's
  // artefact travelling verbatim (the prep's second-
  // direction clearance, section 3) — text, not a figure.
  /\.basis$/,
  // SIC codes: the filed codes themselves are identifiers
  // of a classification; their EXPLAINER is the census
  // figure-line (row 55), asserted in direction one.
  /\.sicCodes\[\]$/,
  // The resolution's own address parts and counts of
  // addresses (the census row 1 watch: not brain figures).
  /^address\./,
  /\.addresses\[\]\./,
];

function isLeaf(value: unknown): boolean {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

// Walk a served bundle and return the concrete paths of
// every leaf that is neither a registered figure nor on
// the not-a-figure allowlist. Null leaves carry no figure
// and are skipped (an absence is a named state, asserted
// elsewhere); every non-null primitive must be accounted
// for.
export function findUnregisteredLeaves(bundle: unknown, root: string): string[] {
  const unregistered: string[] = [];
  const walk = (value: unknown, concrete: string, normalised: string) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${concrete}[${index}]`, `${normalised}[]`));
      return;
    }
    if (typeof value === "object" && value !== null) {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        walk(child, `${concrete}.${key}`, `${normalised}.${key}`);
      }
      return;
    }
    if (!isLeaf(value) || value === null) return;
    if (FIGURE_PATH_PATTERNS.some(({ pattern }) => pattern.test(normalised))) return;
    if (NOT_A_FIGURE_ALLOWLIST.some((pattern) => pattern.test(normalised))) return;
    unregistered.push(concrete);
  };
  walk(bundle, root, root);
  return unregistered;
}
