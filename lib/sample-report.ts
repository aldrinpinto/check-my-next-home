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

import type { AddressResolution } from "./address";
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
  salePriceLabel: "£425,000",
  salePriceBare: "425,000",
  saleDateLong: "22 March 2022",
  saleDateShort: "22 Mar 2022",
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

const MONTHS_LONG = [
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
const MONTHS_SHORT = MONTHS_LONG.map((m) => m.slice(0, 3));

function dateForms(iso: string): { long: string; short: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const [, year, month, day] = match;
  const m = Number(month) - 1;
  const d = Number(day);
  if (m < 0 || m > 11 || d < 1 || d > 31) return null;
  return {
    long: `${d} ${MONTHS_LONG[m]} ${year}`,
    short: `${d} ${MONTHS_SHORT[m]} ${year}`,
  };
}

function poundsLabel(price: number): string {
  return `£${price.toLocaleString("en-GB")}`;
}

function bareLabel(price: number): string {
  return price.toLocaleString("en-GB");
}

// The ordered substitution set for a set of identities:
// longest first, so a full label is replaced before its
// street and a full postcode before any part of it.
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
    for (const sale of identity.ownSales) {
      push(poundsLabel(sale.price), SAMPLE_FICTION.salePriceLabel);
      push(bareLabel(sale.price), SAMPLE_FICTION.salePriceBare);
      const forms = dateForms(sale.dateIso);
      if (forms) {
        push(forms.long, SAMPLE_FICTION.saleDateLong);
        push(forms.short, SAMPLE_FICTION.saleDateShort);
      }
      push(sale.dateIso, SAMPLE_FICTION.saleDateIso);
    }
  }
  return subs.sort((a, b) => b.from.length - a.from.length);
}

// The anonymisation walk: a deep clone of the composed
// view with every identity string replaced and every
// own-sale price (where it stands as data, e.g. the
// price-dot model) replaced by the fiction price. The
// masthead's address line is set to the fiction line
// structurally — the composed line names the primary
// home's real locality and town, which no string
// substitution could turn into the fiction's.
export function anonymiseSampleView(
  view: ReportView,
  identities: SampleHomeIdentity[],
): ReportView {
  const subs = sampleSubstitutions(identities);
  const ownPrices = new Set(identities.flatMap((i) => i.ownSales.map((s) => s.price)));
  const applyText = (text: string): string => {
    let out = text;
    for (const { from, to } of subs) {
      if (out.includes(from)) out = out.split(from).join(to);
    }
    return out;
  };
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return applyText(value);
    if (typeof value === "number") return ownPrices.has(value) ? SAMPLE_FICTION.salePrice : value;
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
