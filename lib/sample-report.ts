// BUG-159: the sample report is the REAL generated report,
// assembled per section from the golden homes' served
// bundles and anonymised at the presentation layer. This
// module is the pure machinery: the per-section merge over
// candidate homes' bundles (assemble at the bundle layer,
// then compose through the normal report builder — no
// composed output is ever hand-edited) and the
// anonymisation walk over the composed view. The server
// seam (lib/server/sample-report.ts) resolves the candidate
// homes through the real pipeline and caches the result.
//
// The merge is PER SECTION, never per line: each of the
// report's sections is taken WHOLE from the home that
// serves it fullest, so a section's figures stay mutually
// consistent. The first candidate is the primary (Birkdale)
// and wins every tie — it is the sample's anchor home: its
// resolution, its sold-prices bundle (Sections 1, 2 and the
// mortgage facts in Section 7) and, on ties, everything
// else.

import { displayText, type AddressResolution } from "./address";
import type { AreaBundle, AreaSections } from "./area-bundle";
import type { CrimeBundle } from "./crime";
import type { FloodBundle } from "./flood";
import { emptyAnswerForm, servingRadiusMiles } from "./nearby";
import type { CategoryAnswer, NearbyBundle, NearbyCategory } from "./nearby";
import type { ReportInput, ReportView } from "./report";
import type { SoldPricesBundle } from "./sold-prices";

// ------------------------------------------------------------------
// The sample's standing fiction (the identity the anonymised
// report wears — the same fiction the hand-built sample
// carried, and the PDF cover in lib/report-pdf.ts).
// ------------------------------------------------------------------

export const SAMPLE_FICTION = {
  title: "12 Willow Close",
  street: "Willow Close",
  addressLine: "Millbrook, Kingsford, Kent MB3 4QX",
  postcode: "MB3 4QX",
  certificateNumber: "0000-0000-0000-0000-0000",
  salePrice: 425000,
  saleDateIso: "2022-03-22",
} as const;

// ------------------------------------------------------------------
// Candidates and the merge
// ------------------------------------------------------------------

export interface SampleCandidate {
  id: string;
  resolution: AddressResolution;
  bundles: {
    nearby: NearbyBundle;
    flood: FloodBundle;
    area: AreaBundle;
    sold: SoldPricesBundle;
    crime: CrimeBundle;
  };
}

// The report sections' bundle parts, as merge groups. Each
// group is taken whole from one candidate.
export type SampleSectionGroup =
  | "schools" // Section 3: nearby school/nursery categories
  | "health" // Section 4: nearby health categories
  | "everyday" // Section 5: the remaining nearby categories
  | "crime" // Section 4: the crime bundle
  | "environment" // Section 4: area air / noise / charging zones
  | "neighbourhood" // Section 6: area census / imd / benefits
  | "home" // Section 7: the remaining area sections
  | "flood"; // Section 8: the flood bundle

const SCHOOL_CATEGORIES: NearbyCategory[] = [
  "schools-primary",
  "schools-secondary",
  "sixth-forms",
  "nurseries",
];
const HEALTH_CATEGORIES: NearbyCategory[] = ["gp", "dentist", "pharmacy", "ae", "maternity"];
const ENVIRONMENT_SECTIONS = ["air", "noise", "chargingZones"] as const;
const NEIGHBOURHOOD_SECTIONS = ["census", "imd", "benefits"] as const;

function categoryScore(bundle: NearbyBundle, key: NearbyCategory): number {
  if (bundle.kind !== "distances") return 0;
  const answer = bundle.categories.find((c) => c.category === key);
  if (!answer) return 0;
  if (answer.state === "within") return 100 + Math.min(answer.places.length, 10);
  if (answer.state === "none-within") return answer.beyondNearest ? 45 : 20;
  return answer.line ? 5 : 0;
}

function categoriesScore(bundle: NearbyBundle, keys: NearbyCategory[]): number {
  return keys.reduce((total, key) => total + categoryScore(bundle, key), 0);
}

function everydayCategories(bundle: NearbyBundle): NearbyCategory[] {
  if (bundle.kind !== "distances") return [];
  const named = new Set<NearbyCategory>([...SCHOOL_CATEGORIES, ...HEALTH_CATEGORIES]);
  return bundle.categories.map((c) => c.category).filter((key) => !named.has(key));
}

function areaSectionsOf(bundle: AreaBundle): AreaSections | null {
  return bundle.kind === "area-bundle" ? bundle.sections : null;
}

function areaSectionScore(bundle: AreaBundle, key: string): number {
  const sections = areaSectionsOf(bundle);
  if (!sections) return 0;
  const section = (sections as unknown as Record<string, { state?: string }>)[key];
  if (!section) return 0;
  if (section.state === "served") {
    let score = 100;
    const rich = section as unknown as {
      certificates?: unknown[];
      tables?: unknown[];
      categories?: unknown[];
    };
    if (Array.isArray(rich.certificates)) score += rich.certificates.length;
    if (Array.isArray(rich.tables)) score += rich.tables.length;
    if (Array.isArray(rich.categories)) score += rich.categories.length;
    return score;
  }
  // A named non-served state (not filed, not available)
  // still speaks in the section; an absent section is
  // silent.
  return section.state ? 15 : 0;
}

function areaGroupScore(bundle: AreaBundle, keys: readonly string[]): number {
  return keys.reduce((total, key) => total + areaSectionScore(bundle, key), 0);
}

function homeSectionsOf(bundle: AreaBundle): string[] {
  const sections = areaSectionsOf(bundle);
  if (!sections) return [];
  const named = new Set<string>([...ENVIRONMENT_SECTIONS, ...NEIGHBOURHOOD_SECTIONS]);
  return Object.keys(sections).filter((key) => !named.has(key));
}

function crimeScore(bundle: CrimeBundle): number {
  if (bundle.kind !== "crime") return 0;
  if (bundle.crime.state !== "served") return bundle.crime.state ? 10 : 0;
  const served = bundle.crime;
  return 100 + (served.englandFigure ? 10 : 0) + Math.min(served.categories?.length ?? 0, 10);
}

function floodScore(bundle: FloodBundle): number {
  if (bundle.kind !== "flood") return 0;
  const flood = bundle.flood;
  if (flood.state !== "served") return 10;
  let score = 100;
  for (const layer of flood.layers) {
    // A layer whose point is covered by a mapped shape —
    // above all the planning layer's Flood Zone 3 — is
    // the fullest flood content the report serves.
    if (layer.covering && layer.covering.label !== "FZ1") score += 40;
    else if (layer.pointState === "inside") score += 15;
    else if (layer.line) score += 5;
  }
  if (flood.defences && flood.defences.state === "served") score += 10;
  if (flood.liveWarnings && flood.liveWarnings.state === "warnings") score += 5;
  return score;
}

function pickWinner<T>(
  candidates: SampleCandidate[],
  score: (candidate: SampleCandidate) => T,
  compare: (a: T, b: T) => number,
): number {
  let best = 0;
  let bestScore = score(candidates[0]);
  for (let i = 1; i < candidates.length; i++) {
    const value = score(candidates[i]);
    // Strictly greater replaces: the primary (index 0)
    // wins every tie.
    if (compare(value, bestScore) > 0) {
      best = i;
      bestScore = value;
    }
  }
  return best;
}

const byNumber = (a: number, b: number) => a - b;

export interface MergedSampleBundles {
  bundles: SampleCandidate["bundles"];
  // Which candidate each section group was taken from —
  // the founder-facing record of the combination.
  sources: Record<SampleSectionGroup, string>;
}

// Assemble the sample's bundles: the primary candidate's
// shells, with each section group replaced whole by the
// fullest-serving candidate's part.
export function mergeSampleBundles(candidates: SampleCandidate[]): MergedSampleBundles {
  if (candidates.length === 0) throw new Error("sample report: no candidate homes");
  const primary = candidates[0];
  const sources = {} as Record<SampleSectionGroup, string>;

  // Nearby: per-group category replacement inside the
  // primary's bundle shell.
  const nearbyGroups: { group: "schools" | "health" | "everyday"; keys: NearbyCategory[] }[] = [
    { group: "schools", keys: SCHOOL_CATEGORIES },
    { group: "health", keys: HEALTH_CATEGORIES },
    {
      group: "everyday",
      keys: candidates
        .map((c) => everydayCategories(c.bundles.nearby))
        .reduce<NearbyCategory[]>((all, keys) => [...new Set([...all, ...keys])], []),
    },
  ];
  let nearby = primary.bundles.nearby;
  if (nearby.kind === "distances") {
    const categories = [...nearby.categories];
    for (const { group, keys } of nearbyGroups) {
      const winner =
        candidates[
          pickWinner(candidates, (c) => categoriesScore(c.bundles.nearby, keys), byNumber)
        ];
      sources[group] = winner.id;
      if (winner.bundles.nearby.kind !== "distances") continue;
      for (const key of keys) {
        const answer = winner.bundles.nearby.categories.find((c) => c.category === key);
        if (!answer) continue;
        const at = categories.findIndex((c) => c.category === key);
        if (at >= 0) categories[at] = answer;
        else categories.push(answer);
      }
      // The schools winner's application-deadlines line
      // rides with its schools (the report's Section 10
      // disclaimer reads the bundle's line).
      if (group === "schools" && winner.bundles.nearby.kind === "distances") {
        nearby = { ...nearby, schoolDeadlines: winner.bundles.nearby.schoolDeadlines };
      }
    }
    nearby = { ...nearby, categories };
  } else {
    sources.schools = primary.id;
    sources.health = primary.id;
    sources.everyday = primary.id;
  }

  // Area: per-group section replacement inside the
  // primary's sections.
  let area = primary.bundles.area;
  const areaGroups: { group: "environment" | "neighbourhood" | "home"; keys: readonly string[] }[] =
    [
      { group: "environment", keys: ENVIRONMENT_SECTIONS },
      { group: "neighbourhood", keys: NEIGHBOURHOOD_SECTIONS },
      {
        group: "home",
        keys: candidates
          .map((c) => homeSectionsOf(c.bundles.area))
          .reduce<string[]>((all, keys) => [...new Set([...all, ...keys])], []),
      },
    ];
  if (area.kind === "area-bundle") {
    const sections = { ...area.sections } as unknown as Record<string, unknown>;
    for (const { group, keys } of areaGroups) {
      const winner =
        candidates[pickWinner(candidates, (c) => areaGroupScore(c.bundles.area, keys), byNumber)];
      sources[group] = winner.id;
      const winnerSections = areaSectionsOf(winner.bundles.area);
      if (!winnerSections) continue;
      for (const key of keys) {
        const section = (winnerSections as unknown as Record<string, unknown>)[key];
        if (section !== undefined) sections[key] = section;
      }
    }
    // The EPC section stays the primary's while it
    // serves: the report builder matches the home's
    // certificate against the primary's resolution
    // (Section 1's facts and the BUG-158 chart hang on
    // that match), and the brief names EPC a
    // primary-source topic.
    const primarySections = areaSectionsOf(primary.bundles.area);
    if (primarySections && areaSectionScore(primary.bundles.area, "epc") >= 100) {
      sections.epc = primarySections.epc;
    }
    area = { ...area, sections: sections as unknown as AreaSections };
  } else {
    sources.environment = primary.id;
    sources.neighbourhood = primary.id;
    sources.home = primary.id;
  }

  const crimeWinner =
    candidates[pickWinner(candidates, (c) => crimeScore(c.bundles.crime), byNumber)];
  sources.crime = crimeWinner.id;
  const floodWinner =
    candidates[pickWinner(candidates, (c) => floodScore(c.bundles.flood), byNumber)];
  sources.flood = floodWinner.id;

  return {
    bundles: {
      nearby,
      flood: floodWinner.bundles.flood,
      area,
      // Sold prices are the primary's throughout (the
      // brief's ruling: Birkdale is the primary source for
      // sold prices, and Sections 1/2 and Section 7's
      // mortgage facts must agree with each other).
      sold: primary.bundles.sold,
      crime: crimeWinner.bundles.crime,
    },
    sources,
  };
}

// ------------------------------------------------------------------
// Name suppression (founder ruling, 22 Nov 2026 — the
// BUG-159 carve-out is closed)
// ------------------------------------------------------------------

// The anonymisation below substitutes a contributing
// home's identity-bearing FORMS (its label, its street,
// its postcode). Its bare street NAME could still survive
// inside a genuine place name the pipeline serves as area
// data — "Birkdale Dental", a dentist 0.4 miles from the
// primary home. The founder rules: the name appears
// NOWHERE in the sample, in any case form. A place is
// never renamed to achieve that (a renamed business is a
// fabricated fact); instead, any served entry whose name
// carries a banned name is DROPPED from the sample's
// lists at the bundle layer, before composition — absent,
// as if unfiled — so the composition's own counting
// (countWithin, the truncation lines) stays truthful over
// what remains.

// Thoroughfare suffixes: a street's identifying name is
// what stands before them ("Birkdale" in "Birkdale Rise",
// "Exeter" in "Exeter Road").
const NAME_SUFFIXES = new Set([
  "rise",
  "road",
  "close",
  "street",
  "avenue",
  "drive",
  "lane",
  "way",
  "gardens",
  "garden",
  "crescent",
  "place",
  "court",
  "terrace",
  "hill",
  "hills",
  "park",
  "square",
  "walk",
  "row",
  "gateway",
  "green",
  "common",
  "parade",
  "grove",
  "mews",
  "vale",
  "croft",
  "dell",
  "mount",
  "field",
  "fields",
  "end",
  "side",
  "approach",
  "circus",
  "embankment",
  "boulevard",
  "quay",
  "wharf",
  "yard",
  "bridge",
  "cross",
  "corner",
  "heights",
  "point",
  "view",
  "wood",
  "woods",
  "path",
  "esplanade",
  "promenade",
  "broadway",
  "highway",
  "chase",
  "glade",
  "brook",
  "ford",
  "moor",
  "heath",
  "down",
  "downs",
  "cliff",
  "shore",
  "haven",
  "gate",
  "gates",
  "alley",
  "passage",
]);

// Single-word heads that cannot identify a home: they
// head countless street names and appear in place names
// everywhere ("High Street", "Victoria Park"), so a place
// carrying one says nothing about any contributing home.
const GENERIC_NAME_HEADS = new Set([
  "high",
  "church",
  "station",
  "market",
  "mill",
  "london",
  "victoria",
  "albert",
  "king",
  "queen",
  "prince",
  "princess",
  "north",
  "south",
  "east",
  "west",
  "great",
  "little",
  "new",
  "old",
  "upper",
  "lower",
  "central",
  "castle",
  "abbey",
  "bridge",
  "saint",
  "st",
  "park",
  "green",
  "common",
  "town",
  "city",
  "village",
  "wood",
  "forest",
  "field",
  "water",
  "stone",
  "beach",
  "port",
  "ferry",
  "cross",
]);

function wordsOf(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0);
}

// The identifying name inside a street, as a word
// sequence: the street's words minus their trailing
// suffixes. Null where nothing identifying stands (a
// street of suffixes alone, or a generic head).
function streetNameWords(street: string): string[] | null {
  const words = wordsOf(street);
  while (words.length > 0 && NAME_SUFFIXES.has(words[words.length - 1])) words.pop();
  if (words.length === 0) return null;
  if (words.length === 1 && GENERIC_NAME_HEADS.has(words[0])) return null;
  return words;
}

// Every banned name the identities carry, as word
// sequences — derived from the identities, never
// hand-listed, so a new golden home joins the guard by
// joining the candidate list.
export function sampleBannedNames(identities: SampleHomeIdentity[]): string[][] {
  const seen = new Set<string>();
  const banned: string[][] = [];
  for (const identity of identities) {
    if (!identity.street) continue;
    const words = streetNameWords(identity.street);
    if (!words) continue;
    const key = words.join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    banned.push(words);
  }
  return banned;
}

function carriesBannedName(name: string, banned: string[][]): boolean {
  const words = wordsOf(name);
  return banned.some(
    (sequence) =>
      sequence.length <= words.length &&
      words.some(
        (_, at) =>
          at + sequence.length <= words.length &&
          sequence.every((word, offset) => words[at + offset] === word),
      ),
  );
}

// Drop every banned-named entry from the merged bundles'
// nearby lists: the listed places, a category's
// beyond-nearest, and the secondary category's selective
// list. A dropped within-radius place leaves the count
// with it (countWithin decrements), so no count line can
// promise a place the list no longer serves; a category
// the drop empties serves the builder's own empty-answer
// form for the reduced filing (lib/nearby.ts's
// emptyAnswerForm). Nothing is renamed and no other
// figure is adjusted. Pure: the input bundles are never
// mutated.
export function suppressSampleNames(
  bundles: SampleCandidate["bundles"],
  identities: SampleHomeIdentity[],
): SampleCandidate["bundles"] {
  const banned = sampleBannedNames(identities);
  if (banned.length === 0 || bundles.nearby.kind !== "distances") return bundles;
  let changed = false;
  const categories = bundles.nearby.categories.map((answer) => {
    let next: CategoryAnswer = answer;
    const keptPlaces = answer.places.filter((place) => !carriesBannedName(place.name, banned));
    if (keptPlaces.length !== answer.places.length) {
      changed = true;
      const radius = servingRadiusMiles(answer.category);
      const droppedCounted = answer.places.filter(
        (place) => carriesBannedName(place.name, banned) && place.miles <= radius,
      ).length;
      next = {
        ...next,
        places: keptPlaces,
        countWithin: Math.max(0, answer.countWithin - droppedCounted),
      };
    }
    if (next.beyondNearest && carriesBannedName(next.beyondNearest.name, banned)) {
      changed = true;
      next = { ...next, beyondNearest: null };
      // The none-within line names the dropped nearest;
      // the category falls to the builder's own
      // no-named-nearest form for its line.
      if (next.state === "none-within") {
        next = { ...next, line: emptyAnswerForm(next.category, next.countWithin).line };
      }
    }
    if (answer.category === "schools-secondary") {
      const list = next.selectiveSchools;
      const keptList = list ? list.filter((s) => !carriesBannedName(s.name, banned)) : undefined;
      const nearestDropped = next.nearestSelective
        ? carriesBannedName(next.nearestSelective.name, banned)
        : false;
      if ((keptList && list && keptList.length !== list.length) || nearestDropped) {
        changed = true;
        const best = keptList
          ? (keptList[0] ?? null)
          : nearestDropped
            ? null
            : next.nearestSelective;
        next = {
          ...next,
          ...(keptList ? { selectiveSchools: keptList } : {}),
          nearestSelective: best,
          nearestSelectiveLine: best
            ? `the nearest selective secondary school is ${best.name} — selective means admission by entrance test`
            : null,
        };
      }
    }
    if (answer.places.length > 0 && next.places.length === 0 && next.state === "within") {
      // The drop emptied the category: it serves the
      // builder's own empty-answer form for the reduced
      // filing, never a bare "within" with nothing in it.
      const form = emptyAnswerForm(next.category, next.countWithin);
      next = { ...next, state: form.state, line: form.line };
    }
    return next;
  });
  if (!changed) return bundles;
  return { ...bundles, nearby: { ...bundles.nearby, categories } };
}

// ------------------------------------------------------------------
// The fiction own sale (BUG-234/235/236, 24 Nov 2026 —
// and the median corruption found with them, proposed
// BUG-241)
// ------------------------------------------------------------------

// The sample's standing fiction wears ONE sale — the
// fiction price on the fiction date — but the primary's
// real own sale (Birkdale: £588,995, 15 June 2023) used
// to reach the report builder untouched, and the
// anonymisation walk then patched its PRICE and DATE as
// strings wherever they stood. That patched the labels
// and left the arithmetic: Section 7's loan, deposit
// and stamp duty were computed from the real price
// (£441,746 loan, £147,249 deposit, £19,450 duty —
// against a £425,000 price label), the dot plot's brass
// dot sat on the real price, and the first-sale year
// read 2023 against a 22 March 2022 sale date. Worse,
// the walk's global "£588,995"→"£425,000" substitution
// also rewrote the POSTCODE MEDIAN wherever it stood,
// because the median equals the own-sale price
// (£588,995 over 29 counted) — the live sample's
// median read £425,000.
//
// The rewrite happens here, at the BUNDLE layer, before
// composition — the same layer the name suppression
// stands on — so the builder computes every figure from
// the fiction sale itself: the last sale's price and
// date become the fiction's, and the recent-sales row
// that IS the home's own sale (matched on its original
// price AND date, so a neighbour's sale at the same
// price is never touched) becomes the fiction sale too.
// The median and the counted set are left exactly as
// filed: the median stays the real £588,995, the
// counted set keeps the home's real sale as an
// unlabelled grey dot at £588,995, and the brass dot
// moves to £425,000. Pure: the input bundles are never
// mutated. The walk below no longer substitutes prices
// or dates at all — there is nothing left for it to
// patch, and no string it could corrupt.
export function fictioniseSampleOwnSale(
  bundles: SampleCandidate["bundles"],
  identities: SampleHomeIdentity[],
): SampleCandidate["bundles"] {
  if (bundles.sold.kind !== "sold-prices" || !("ownHistory" in bundles.sold)) return bundles;
  const original = identities[0]?.ownSales[0];
  const ownHistory = bundles.sold.ownHistory;
  if (!original || ownHistory.length === 0) return bundles;
  const first = ownHistory[0];
  if (first.price !== original.price || first.date !== original.dateIso) return bundles;
  return {
    ...bundles,
    sold: {
      ...bundles.sold,
      ownHistory: [
        { ...first, price: SAMPLE_FICTION.salePrice, date: SAMPLE_FICTION.saleDateIso },
        ...ownHistory.slice(1),
      ],
      recentSales: bundles.sold.recentSales.map((sale) =>
        sale.price === original.price && sale.date === original.dateIso
          ? { ...sale, price: SAMPLE_FICTION.salePrice, date: SAMPLE_FICTION.saleDateIso }
          : sale,
      ),
    },
  };
}

// ------------------------------------------------------------------
// Anonymisation
// ------------------------------------------------------------------

// One contributing home's identity-bearing facts, derived
// from its own resolution and bundles by the server seam —
// never hand-listed, so a new golden home joins the guard
// by joining the candidate list.
export interface SampleHomeIdentity {
  // The resolved address label ("19 Birkdale Rise").
  label: string | null;
  // The street in display form ("Birkdale Rise").
  street: string | null;
  postcode: string;
  certificateNumbers: string[];
  ownSales: { price: number; dateIso: string }[];
}

interface Substitution {
  from: string;
  to: string;
}

// The ordered substitution set for a set of identities:
// longest first, so a full label is replaced before its
// street and a full postcode before any part of it.
// Labels, streets, postcodes and certificate numbers
// only: the own sale's price and date are NOT
// substituted here — the fiction rewrite above puts the
// fiction sale into the bundles before composition, so
// the builder composes the fiction price and date
// itself, and a string substitution of the real price
// would also rewrite the postcode median wherever the
// two coincide (BUG-241: the median equals the
// own-sale price, £588,995).
export function sampleSubstitutions(identities: SampleHomeIdentity[]): Substitution[] {
  const subs: Substitution[] = [];
  const push = (from: string | null | undefined, to: string) => {
    if (from && from !== to) subs.push({ from, to });
  };
  for (const identity of identities) {
    push(identity.label, SAMPLE_FICTION.title);
    if (identity.street) {
      push(identity.street, SAMPLE_FICTION.street);
      push(identity.street.toUpperCase(), SAMPLE_FICTION.street.toUpperCase());
    }
    push(identity.postcode, SAMPLE_FICTION.postcode);
    for (const number of identity.certificateNumbers) {
      push(number, SAMPLE_FICTION.certificateNumber);
    }
  }
  return subs.sort((a, b) => b.from.length - a.from.length);
}

// ------------------------------------------------------------------
// The fiction area (BUG-235, 24 Nov 2026 — the place half)
// ------------------------------------------------------------------

// The sample's standing fiction geography — the
// Millbrook / Kingsford / Kent of SAMPLE_FICTION's
// address line ("Millbrook, Kingsford, Kent MB3 4QX").
// Keep in step with that line: the locality is the
// fiction village, the town the fiction town, the
// county the fiction county, the region the region
// Kent sits in (South East).
export const SAMPLE_FICTION_AREA = {
  locality: "Millbrook",
  town: "Kingsford",
  county: "Kent",
  region: "South East",
} as const;

// The ordered substitution set for the sample's real
// area geography: longest first, like sampleSubstitutions
// above, so a full small-area name is replaced before
// its bare council ("Braintree 018" before "Braintree").
//
// WHY THE WALK, NOT THE BUNDLE LAYER: the names surface
// in pre-composed lines as well as in fields — the
// census line, the council-tax line, the planning line,
// the mobile note, the Section 10 source lines — so a
// bundle-layer rewrite would have to chase every line
// template in area-bundle.ts, nearby.ts and report.ts,
// and miss one and the name leaks. The walk is the one
// place that covers every surface, present and future.
// (The fiction own sale, by contrast, had to be bundle
// layer: the price feeds arithmetic the walk cannot fix.)
//
// WHAT IT COVERS (audited 24 Nov 2026 against the
// generated sample, fixture + live DB): the council
// everywhere it is named (council tax, mobile, planning,
// the area-facts line); the ward; the region; the census
// MSOA and deprivation LSOA names; the postal town; the
// village and county in the filed industrial-site
// address. The ward-part and town mappings also cover
// the names those labels leak into — the station name,
// the certificate address, the sixth-form name.
//
// DERIVED, NEVER HAND-LISTED (the sampleBannedNames
// principle): every name comes from the primary's
// resolution or the merged bundles at generation time,
// so a new golden home joins the guard by joining the
// candidate list. Two exceptions, both properties of
// the standing primary (Birkdale, Essex) and its
// standing fiction, neither carried by any structured
// field: the county ("Essex" — the directory holds the
// region, not the county) and the village in the filed
// industrial-site address ("Ulting" — the Pollution
// Inventory address is one comma-less string, BUG-250
// item 7c). If the filed industrial site changes, that
// pair needs its new village; the live sample audit
// after a re-file is the catch for that.
export function sampleAreaSubstitutions(
  resolution: AddressResolution,
  area: AreaBundle,
): Substitution[] {
  const { locality, town, county, region } = SAMPLE_FICTION_AREA;
  const subs: Substitution[] = [];
  const push = (from: string | null | undefined, to: string) => {
    if (from && from !== to) subs.push({ from, to });
  };
  // A name in both its filed form and its rendered
  // (displayText) form — the directory's town arrives
  // upper-case, the region in sentence case, and the
  // report renders both title-cased.
  const pushCased = (from: string | null | undefined, to: string) => {
    if (!from) return;
    push(from, from === from.toUpperCase() ? to.toUpperCase() : to);
    push(displayText(from), to);
  };

  // The small-area names (census MSOA, deprivation
  // LSOA): a code form — "<place> <number>" — keeps its
  // number and takes the fiction locality for its place
  // ("Braintree 018" -> "Millbrook 018"); a plain place
  // name takes the fiction locality whole.
  const smallArea = (name: string | null | undefined) => {
    if (!name) return;
    const coded = /^(.+?)\s+(\d+[A-Z]?)$/.exec(name);
    if (coded) push(name, `${locality} ${coded[2]}`);
    else push(name, locality);
  };
  const sections = area.kind === "area-bundle" ? area.sections : null;
  if (sections) {
    smallArea(sections.census.msoaName);
    smallArea(sections.imd.lsoaName);
    // Every council the merged sections name — the
    // mobile grain, the council-tax authority, the
    // planning hand-off — is the fiction town.
    push(sections.mobile.council, town);
    push(sections.councilTax.authority, town);
    push(sections.planningApplications.council, town);
  }

  // The directory's own labels. The council is the
  // fiction town; the ward takes the fiction ward form
  // below; the region is the fiction region.
  const directory = "directory" in resolution ? resolution.directory : null;
  if (directory) {
    push(directory.council, town);
    pushCased(directory.region, region);
    // The ward: a small area, so its fiction form is
    // the fiction locality first and the fiction town
    // after — "Hatfield Peverel & Terling" -> "Millbrook
    // & Kingsford"; a single-part ward takes the
    // locality whole. Each part is also substituted
    // bare, so the village name is covered wherever
    // else it stands (the station name, the certificate
    // address, the deprivation line).
    const ward = directory.ward;
    if (ward) {
      const separator = ward.includes(" & ") ? " & " : ward.includes(" and ") ? " and " : null;
      const parts = separator ? ward.split(separator) : [ward];
      push(ward, parts.map((_, at) => (at === 0 ? locality : town)).join(separator ?? ""));
      parts.forEach((part, at) => push(part, at === 0 ? locality : town));
    }
  }

  // The postal town the resolution carries.
  const addressTown = resolution.rung === 1 ? resolution.address.town : null;
  pushCased(addressTown, town);

  // The standing constants (see the note above).
  push("Essex", county);
  push("Ulting", locality);

  // Longest first, like sampleSubstitutions — and a
  // name mapped twice keeps its first mapping.
  const seen = new Set<string>();
  return subs
    .sort((a, b) => b.from.length - a.from.length)
    .filter((sub) => {
      if (seen.has(sub.from)) return false;
      seen.add(sub.from);
      return true;
    });
}

// The anonymisation walk: a deep clone of the composed
// view with every identity string replaced. Strings
// only: the fiction rewrite above already puts the
// fiction sale into the bundles, so no price or date
// needs patching here — and a number-for-number
// replacement of the real own-sale price would rewrite
// any data number that coincides with it (BUG-241: the
// postcode median). The masthead's address line is set
// to the fiction line structurally — the composed line
// names the primary home's real locality and town,
// which no string substitution could turn into the
// fiction's.
export function anonymiseSampleView(
  view: ReportView,
  identities: SampleHomeIdentity[],
  areaSubs: Substitution[] = [],
): ReportView {
  const subs = sampleSubstitutions(identities);
  const applyText = (text: string): string => {
    let out = text;
    for (const { from, to } of subs) {
      if (out.includes(from)) out = out.split(from).join(to);
    }
    // The fiction area (BUG-235): applied after the
    // identity substitutions, so a composed address the
    // identity walk has already fictionised ("12 Willow
    // Close, Hatfield Peverel") has its real town
    // fictionised too ("12 Willow Close, Millbrook").
    for (const { from, to } of areaSubs) {
      if (out.includes(from)) out = out.split(from).join(to);
    }
    return out;
  };
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return applyText(value);
    if (Array.isArray(value)) return value.map(walk);
    if (value !== null && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value)) out[key] = walk(entry);
      return out;
    }
    return value;
  };
  const anonymised = walk(view) as ReportView;
  anonymised.masthead.addressLine = SAMPLE_FICTION.addressLine;
  return anonymised;
}

// The merged input the report builder composes from.
export function sampleReportInput(
  primary: SampleCandidate,
  merged: MergedSampleBundles,
  now: Date,
): ReportInput {
  return {
    resolution: primary.resolution,
    nearby: merged.bundles.nearby,
    flood: merged.bundles.flood,
    area: merged.bundles.area,
    sold: merged.bundles.sold,
    crime: merged.bundles.crime,
    now,
  };
}

// The sample's "now" — the moment its Report date (the
// masthead strip and Section 10's checked-on line) is
// composed from. The real generation serves the current
// moment. The override is a test seam (the
// soldPricesLoadWaitMsFromEnv pattern): the server-config
// env SAMPLE_REPORT_NOW, when it carries a parseable
// date, replaces the moment at generation — the E2E
// harness pins it to the visual guard's baseline capture
// day, so the sample-report photographs hold on any
// calendar day (CI #308: unpinned, the masthead date is
// the serving day and the photograph rots daily).
// TEST-ONLY: production never sets it, and an unset or
// unparsable value leaves the real moment standing.
export function sampleReportNowFromEnv(env: Record<string, string | undefined>): Date {
  const raw = env.SAMPLE_REPORT_NOW;
  if (raw === undefined) return new Date();
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
