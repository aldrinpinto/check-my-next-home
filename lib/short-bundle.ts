import {
  projectHeadline,
  type AreaBundle,
  type BrownfieldSite,
  type CompanyOwnershipSection,
  type HeadlineProjection,
  type ListedAtPoint,
  type ListedPlace,
  type NaturePlace,
  type PlanningApplicationsSection,
  type PlanningLayerKind,
  type PolygonLayerAnswer,
  type PriorityHabitatAnswer,
} from "./area-bundle";
import type { CrimeBundle } from "./crime";
import type { FloodBundle, FloodLayerType, FloodPointState } from "./flood";
import type { NearbyBundle, NearbyCategory } from "./nearby";
import type { MedianAnswer, SoldPricesBundle } from "./sold-prices";

// The short-version bundle (plan step M6.7, decision D28).
//
// The headline layer the website results and the future
// extension show free: ONE pure derivation over the five
// full bundles (M6.2 nearby, M6.3 sold prices, M6.4 crime,
// M6.5 flood, M6.6 area) — never a second read of the
// tables. The function takes no data source, no database
// handle and no clock: crime's staleness arrives already
// computed into its bundle, and every figure here is a pick
// from a served field. That signature is the purity proof.
//
// The five inputs must come from ONE resolution: the output
// rung is the inputs' shared rung, mixed rungs are refused,
// and at rungs 1–2 the five postcodes must agree. The ladder
// is inherited structurally — rung 2's sold-prices bundle
// carries no own-history payload, so the short shape has no
// own-sale keys at rung 2 either; rung 3 is a bundle of
// named states and nothing else; rung 4 the no-location
// state in the same section shape.
//
// Section order (D28): sold prices, flood, crime, EPC,
// council tax, constraints, heritage, nature, air, noise,
// nearby essentials. Broadband joins as the twelfth
// section (M6.17, decision D36), between noise and nearby,
// carrying the gigabit line only — the extension by one
// more projection this file's header promised from M6.7.
// The order is the short bundle's own, so both surfaces
// inherit it identically, and every list truncates HERE,
// in the derivation — never in a renderer.
//
// The area input is read through projectHeadline, the
// bundle's ONLY headline path (lib/area-bundle.ts); the
// slimming D28 rules beyond it — heritage and nature cut to
// their skim facts, Article 4 as its plain inside line only
// — happens here, over the projection's output. Article 4's
// filed codes and their plain-words translations stay at
// report depth: neither is picked, so neither can leak.
// (That settles the split the area bundle's own comment
// anticipated before any headline surface existed.)
//
// Depth is structural: IMD, Census, benefits, solar and
// mobile have no key in this shape, in any form — not even
// re-worded. Mobile never headlines (D36): a council-grain
// modelled figure does not sit beside the home's own
// facts. No asking price exists here (it is in no input
// bundle).
//
// One flag-gated exception (founder's ruling, 17 Nov
// 2026): company ownership. The area bundle serves its
// section only while COMPANY_OWNERSHIP_ENABLED is on
// (M5.13/D32), at report depth; the free page's one line —
// "Owned by a company: Yes/No" — needs the boolean at
// headline depth, so this derivation picks the section
// across WHENEVER the input bundle carries it. While the
// flag is off the input never carries it, so the key stays
// absent from every short bundle, exactly as before — the
// gating is inherited from the brain's own, never
// re-decided here. The section's detail (titles, snapshots,
// the explainer) stays at report depth: only the state,
// the boolean and the lead line cross.
//
// One unconditional sibling pick (M7.9, decision D31):
// the planning hand-off. The area bundle builds the
// section from the resolution alone, in every rung 1–2
// bundle, so this derivation picks it across always —
// the state, the council, the line and the link; the
// section's explainer and meta stay at report depth.
// It is a sibling pick, not a thirteenth D28 section:
// ShortSectionKey is unchanged, so rungs 3–4 (named
// states keyed by that union) carry no trace of it.
// buildResultsView reads the hand-off from here, so the
// website and the Phase 2 extension consume one
// derivation and show the same headline unchanged. The
// pick moved four short-bundle contract pins
// (short.rung1, short.rung2, short.scotland,
// short.flood-warnings), re-pinned deliberately on the
// founder's authorisation (18 Nov 2026 — the M6.34/D65
// precedent: re-pins are legitimate when the founder
// authorises them).
//
// M6.21 (decision D41) adds no section and no headline
// claim: the constraints section's two new sub-blocks are
// derived by the rules above (built-up areas through the
// polygon slimming, brownfield through a points skim in the
// listed buildings form), and the heritage section's four
// new layers take the scheduled monuments' place — present
// in the full bundle and its headline projection, absent
// from this skim, which carries listed buildings and the
// at-point line only. EPC improvement measures are report
// depth by construction: they live on served certificates,
// which this shape never carries.
//
// M8.10's registered parks & gardens layer follows the
// M6.21 rule exactly: present in the full bundle and its
// headline projection, absent from this skim.

// ------------------------------------------------------------------
// Served shapes
// ------------------------------------------------------------------

export type ShortSectionKey =
  | "soldPrices"
  | "flood"
  | "crime"
  | "epc"
  | "councilTax"
  | "constraints"
  | "heritage"
  | "nature"
  | "air"
  | "noise"
  | "broadband"
  | "nearby";

export interface ShortMedian {
  state: MedianAnswer["state"];
  value: number | null;
  counted: number;
  spanFrom: string | null;
  spanTo: string | null;
  line: string | null;
}

export interface ShortBuildingMedian extends ShortMedian {
  building: string;
  explainer: string;
}

export type ShortSoldPrices =
  | { state: "not-covered"; reason: string }
  | {
      // The cold-load degrade (Part A of the cold-check
      // fix, founder's authorisation, 19 Nov 2026): the
      // postcode's sold-prices load has not landed, so
      // the headline carries the brain's named state
      // alone — no figures, and never the loaded-none
      // sentence, which only a completed load may say.
      state: "unavailable";
      reason: string;
    }
  | {
      state: "served";
      // The loaded-none sentence ("No sale recorded for this
      // postcode since 1995") when the postcode was loaded
      // and filed none; null otherwise.
      stateLine: string | null;
      // Rung 1 only — the keys are ABSENT at rung 2, because
      // the rung-2 bundle carries no own-history payload to
      // pick from. The home's most recent recorded sale and
      // the postcode median are separate facts, presented
      // side by side, never compared.
      ownLastSale?: { price: number; date: string } | null;
      // The home's FULL recorded history, newest first
      // (parity fix batch, 18 Nov 2026): the results page's
      // four sold-history tiles — times sold, change since
      // the previous sale, held by the last owner, and the
      // property-type line — are composed from it. The
      // facts are the full bundle's own served sales,
      // projected whole: a home's recorded history is a
      // handful of sales, and a truncated pick could not
      // state the count honestly.
      ownSales?: {
        price: number;
        date: string;
        propertyType: string | null;
        tenure: string | null;
        newBuild: boolean | null;
      }[];
      ownLine?: string | null;
      median: ShortMedian;
      // The flat's building median (rung 1, flats); null for
      // houses and at rung 2, where the short version
      // carries postcode figures only.
      buildingMedian: ShortBuildingMedian | null;
      sourceLine: string;
      explainer: string;
    };

export interface ShortFloodLayer {
  layer: FloodLayerType;
  title: string;
  pointState: FloodPointState;
  // The layer's primary sentence — the covering label or
  // the absence wording, always about the postcode point.
  line: string;
  coveringLabel: string | null;
  // The COVERING label's EA definition, picked (M6.18,
  // decision D37 — a narrow amendment to D28): a headline
  // figure explains itself on the surface it is read on,
  // and the basis line explains the map's convention, not
  // what the zone or band means. Covering label only —
  // proximity definitions stay at report depth. Null
  // where no label covers the point.
  coveringDefinition: string | null;
  coveringDetail: string | null;
  basisLine: string;
  // Each layer keeps its OWN source line: the three
  // editions revise independently, so a merged flood
  // source line would falsify at least two of them.
  sourceLine: string | null;
}

// The live-warnings block at headline depth (M6.22,
// decision D42): the same serve-time composition as the
// full bundle's, projected — the severity line, the area,
// the raised time and the official link, NEVER the EA's
// message text (that is report depth). The block precedes
// the layer lines, as it precedes the layers in the full
// section. The named no-warning line does NOT travel to
// headline depth (the M6.22 prep's pin: it lives in the
// full answer and the report); the failure line DOES —
// silence in the headline during a flood would read as
// "no warning", the exact overclaim the named states
// exist to prevent.
export interface ShortFloodWarning {
  severityLevel: number;
  severity: string;
  areaDescription: string;
  riverOrSea: string | null;
  timeRaised: string;
  raisedLine: string;
  line: string;
}

export interface ShortFloodLiveWarnings {
  state: "warnings" | "none" | "unavailable";
  checkedAt: string;
  // The failure line only; null in the warnings and none
  // states (see the header above).
  line: string | null;
  warnings: ShortFloodWarning[];
  overflowCount: number | null;
  overflowLine: string | null;
  attributionLine: string;
  link: { label: string; url: string };
}

export type ShortFlood =
  | { state: "not-covered"; reason: string }
  | {
      state: "served";
      // Null where the full bundle was not composed (the
      // plain builder's form) — the wired path always
      // composes.
      liveWarnings: ShortFloodLiveWarnings | null;
      layers: ShortFloodLayer[];
    };

export type ShortCrime =
  | { state: "not-filed" | "not-covered"; reason: string }
  | {
      state: "served";
      total: number;
      totalLine: string;
      windowLine: string;
      // Anti-social behaviour as its own line (D24/D28):
      // the everyday-nuisance signal, inside the total AND
      // beside it. The full category breakdown stays at
      // report depth.
      asb: { count: number } | null;
      // The calibration lines at headline depth (M6.20,
      // decision D39 — both figures headline). Each is the
      // full answer's own line, picked verbatim; null
      // while the filed artefact carries no calibration
      // (a pre-M6.20 artefact, or a window whose England
      // total is not yet embedded).
      perHeadLine: string | null;
      englandLine: string | null;
      // The stale line travels verbatim when the filed
      // window is old — a headline total with no stale line
      // would present old data as current.
      staleLine: string | null;
      sourceLine: string;
      explainer: string;
    };

export type ShortEpc = HeadlineProjection["epc"];

export type ShortCouncilTax = HeadlineProjection["councilTax"] & {
  // The figure inside its correction (D28/Q10): portals
  // show the home's own band, so the authority's average
  // would be misread as this home's bill unless the line
  // itself prevents it. Composed here, from the
  // projection's own fields, when the section serves; in
  // the named states the section's own line travels
  // verbatim instead (M6.9, decision D30) — a state with
  // no sentence is not an answer.
  line: string | null;
};

// One planning polygon layer at headline depth: the state,
// the primary line, the inside name, the nearest named
// area and the beyond line. The filed detail is NOT
// picked — for Article 4 that detail IS the removed-
// rights codes, which stay at report depth with their
// translations (D28/Q4).
export interface ShortPolygonLayer {
  layer: PlanningLayerKind;
  label: string;
  state: PolygonLayerAnswer["state"];
  line: string;
  insideName: string | null;
  nearest: { name: string | null; miles: number } | null;
  beyondLine: string | null;
  sourceLine: string | null;
}

// Brownfield land at headline depth (M6.21, D41): the
// listed buildings skim applied to recorded sites — the
// state, the count line, the count, the single nearest site
// (or the nearest beyond the radius, with its line). The
// per-site register facts (hectares, permission status,
// dwellings) stay at report depth, as a listed building's
// grade detail does beyond its skim. No new headline CLAIM
// opens: this is D28's derivation applied to the section's
// new sub-block, in the section's existing headline.
export interface ShortBrownfield {
  state: "served" | "none-found" | "not-published" | "not-filed";
  line: string;
  countWithin: number | null;
  nearest: BrownfieldSite | null;
  beyondLine: string | null;
  sourceLine: string | null;
}

export interface ShortConstraints {
  state: "served";
  conservationArea: ShortPolygonLayer;
  article4: ShortPolygonLayer;
  greenBelt: ShortPolygonLayer;
  brownfield: ShortBrownfield;
  builtUpArea: ShortPolygonLayer;
}

export interface ShortHeritage {
  state: "served";
  listed: {
    state: "served" | "not-filed" | "sparse-coverage";
    // The count line, composed by the brain.
    line: string;
    // Null outside England — no count is served where the
    // filed list does not reach, never 0.
    countWithin: number | null;
    nearest: ListedPlace | null;
    beyondLine: string | null;
  };
  // The at-the-point line at rung 1; its needs-exact-home
  // state at rung 2. Carried as the brain serves it.
  atPoint: ListedAtPoint;
  sourceLine: string | null;
}

export interface ShortNature {
  state: "served";
  coverageLine: string | null;
  placesLine: string;
  // The designation guard's line (M6.9/D30), verbatim from
  // the full bundle — a type whose data is not filed names
  // itself here, at headline depth too.
  designationsLine: string | null;
  placesWithinCount: number;
  // The nearest place, its designations named together as
  // the full bundle composes them, inside flags on the
  // place and its designations. When nothing files within
  // the radius this is the single nearest beyond it, and
  // beyondLine says so.
  nearestPlace: NaturePlace | null;
  beyondLine: string | null;
  ancientWoodland: ShortPolygonLayer;
  priorityHabitat: PriorityHabitatAnswer;
  sourceLine: string | null;
}

export type ShortAir = HeadlineProjection["air"];

export type ShortNoise = HeadlineProjection["noise"];

// Broadband at headline depth is the projection's own
// pick (D36): the gigabit figure and the section's own
// line — served, or the not-filed sentence verbatim.
export type ShortBroadband = HeadlineProjection["broadband"];

// The six daily-life categories a family checks first
// (D28/Q2). The other sixteen stay in the full check —
// twenty-two categories cannot fit a headline, and the cut
// belongs here, not in a renderer. (M6.24 added maternity
// to the full check only, and M6.33 added sixth forms and
// colleges the same way; this list is deliberately
// unchanged, and the short bundle's shape with it.)
export const HEADLINE_NEARBY_CATEGORIES: NearbyCategory[] = [
  "schools-primary",
  "schools-secondary",
  "nurseries",
  "station",
  "gp",
  "supermarket",
];

export interface ShortNearbyCategory {
  category: NearbyCategory;
  label: string;
  state: string;
  // The nearest named place — within the radius, or the
  // category's single nearest beyond it for the essential
  // services (its composed line carries that in words).
  nearest: { name: string; miles: number } | null;
  countWithin: number;
  // The composed line for the non-"within" states, verbatim
  // — an empty-map line is a fact about the map, and must
  // never collapse into "none".
  line: string | null;
}

export interface ShortNearby {
  basisLabel: string;
  categories: ShortNearbyCategory[];
}

// Company ownership at headline depth: the area section's
// state, the free page's one boolean, and the section's
// own lead line. The boolean is true only where the
// section's own title matched this home ("served"), false
// only where both datasets were filed and no title matched
// ("not-company-owned"); in the named states (needs the
// exact home, not covered, not filed) no Yes/No exists to
// serve and the boolean is null — the line carries the
// state, as everywhere.
export interface ShortCompanyOwnership {
  state: CompanyOwnershipSection["state"];
  ownedByCompany: boolean | null;
  line: string | null;
}

// The D31 planning hand-off at headline depth (M7.9):
// the area section's state, the council as filed, its
// line and its link (null where the nation carries no
// link — Scotland, and Mid Ulster in Northern Ireland).
// Nothing else of the section crosses: the explainer
// (which the How we check page carries) and the meta
// stay at report depth on the area bundle.
export interface ShortPlanningApplications {
  state: PlanningApplicationsSection["state"];
  council: string | null;
  line: string;
  link: { label: string; url: string } | null;
}

export interface ShortSections {
  soldPrices: ShortSoldPrices;
  flood: ShortFlood;
  crime: ShortCrime;
  epc: ShortEpc;
  councilTax: ShortCouncilTax;
  constraints: ShortConstraints;
  heritage: ShortHeritage;
  nature: ShortNature;
  air: ShortAir;
  noise: ShortNoise;
  broadband: ShortBroadband;
  nearby: ShortNearby;
  // Present only while COMPANY_OWNERSHIP_ENABLED is on —
  // the key is ABSENT (not null) in every other bundle,
  // exactly as the area bundle's own key is.
  companyOwnership?: ShortCompanyOwnership;
  // The planning hand-off pick (M7.9): a sibling key
  // beside the twelve D28 sections, NOT a thirteenth
  // section — ShortSectionKey is unchanged. Present in
  // every rung 1–2 bundle buildShortBundle derives,
  // because the area bundle builds the section
  // unconditionally; the key is typed optional on the
  // company pick's pattern, so hand-built shapes and
  // partial fixtures need no placeholder for it.
  planningApplications?: ShortPlanningApplications;
}

export interface ShortNamedState {
  state: "unavailable";
  reason: string;
}

export type ShortNamedSections = Record<ShortSectionKey, ShortNamedState>;

export type ShortBundle =
  | { rung: 1 | 2; kind: "short-bundle"; postcode: string; sections: ShortSections }
  | { rung: 3; kind: "wider-area"; sections: ShortNamedSections }
  | { rung: 4; kind: "no-location"; sections: ShortNamedSections };

export interface ShortBundleInput {
  nearby: NearbyBundle;
  soldPrices: SoldPricesBundle;
  crime: CrimeBundle;
  flood: FloodBundle;
  area: AreaBundle;
}

// ------------------------------------------------------------------
// Picks
// ------------------------------------------------------------------

function shortMedian(median: MedianAnswer): ShortMedian {
  return {
    state: median.state,
    value: median.value,
    counted: median.counted,
    spanFrom: median.spanFrom,
    spanTo: median.spanTo,
    line: median.line,
  };
}

function shortPolygonLayer(answer: PolygonLayerAnswer): ShortPolygonLayer {
  return {
    layer: answer.layer,
    label: answer.label,
    state: answer.state,
    line: answer.line,
    insideName: answer.insideName,
    nearest: answer.nearest,
    beyondLine: answer.beyondLine,
    sourceLine: answer.sourceLine,
  };
}

function shortSoldPrices(bundle: Extract<SoldPricesBundle, { rung: 1 | 2 }>): ShortSoldPrices {
  if (bundle.kind === "not-covered")
    return { state: "not-covered", reason: bundle.soldPrices.reason };
  // The cold-load degrade variant (Part A, 19 Nov 2026):
  // kind "sold-prices" carrying the named state instead
  // of figures — the state crosses verbatim, as
  // not-covered's does.
  if ("soldPrices" in bundle) return { state: "unavailable", reason: bundle.soldPrices.reason };
  const base = {
    state: "served" as const,
    stateLine: bundle.stateLine,
    median: shortMedian(bundle.median),
    buildingMedian: null as ShortBuildingMedian | null,
    sourceLine: bundle.sourceLine,
    explainer: bundle.median.explainer,
  };
  if (bundle.rung === 2) return base;
  const own = bundle.ownHistory[0] ?? null;
  return {
    ...base,
    ownLastSale: own ? { price: own.price, date: own.date } : null,
    ownSales: bundle.ownHistory.map((sale) => ({
      price: sale.price,
      date: sale.date,
      propertyType: sale.propertyType,
      tenure: sale.tenure,
      newBuild: sale.newBuild,
    })),
    ownLine: bundle.ownLine,
    buildingMedian: bundle.building
      ? {
          building: bundle.building.building,
          ...shortMedian(bundle.building.median),
          explainer: bundle.building.median.explainer,
        }
      : null,
  };
}

function shortFlood(bundle: Extract<FloodBundle, { rung: 1 | 2 }>): ShortFlood {
  if (bundle.kind === "not-covered") return { state: "not-covered", reason: bundle.flood.reason };
  const live = bundle.flood.liveWarnings;
  return {
    state: "served",
    liveWarnings: live
      ? {
          state: live.state,
          checkedAt: live.checkedAt,
          line: live.state === "unavailable" ? live.line : null,
          warnings: live.warnings.map((warning) => ({
            severityLevel: warning.severityLevel,
            severity: warning.severity,
            areaDescription: warning.areaDescription,
            riverOrSea: warning.riverOrSea,
            timeRaised: warning.timeRaised,
            raisedLine: warning.raisedLine,
            line: warning.line,
          })),
          overflowCount: live.overflowCount,
          overflowLine: live.overflowLine,
          attributionLine: live.attributionLine,
          link: live.link,
        }
      : null,
    layers: bundle.flood.layers.map((layer) => ({
      layer: layer.layer,
      title: layer.title,
      pointState: layer.pointState,
      line: layer.line,
      coveringLabel: layer.covering?.displayLabel ?? null,
      coveringDefinition: layer.covering?.definition ?? null,
      coveringDetail: layer.covering?.detail ?? null,
      basisLine: layer.basisLine,
      sourceLine: layer.sourceLine,
    })),
  };
}

function shortCrime(bundle: Extract<CrimeBundle, { rung: 1 | 2 }>): ShortCrime {
  if (bundle.kind === "not-covered") return { state: "not-covered", reason: bundle.crime.reason };
  const crime = bundle.crime;
  if (crime.state !== "served") return { state: crime.state, reason: crime.reason };
  const asb = crime.categories.find((c) => c.slug === "anti-social-behaviour");
  return {
    state: "served",
    total: crime.total,
    totalLine: crime.totalLine,
    windowLine: crime.windowLine,
    asb: asb ? { count: asb.count } : null,
    perHeadLine: crime.perHead?.line ?? null,
    englandLine: crime.englandFigure?.line ?? null,
    staleLine: crime.staleLine,
    sourceLine: crime.sourceLine,
    explainer: crime.explainer,
  };
}

function shortNearby(bundle: Extract<NearbyBundle, { kind: "distances" }>): ShortNearby {
  return {
    basisLabel: bundle.basisLabel,
    categories: HEADLINE_NEARBY_CATEGORIES.map((category) => {
      const answer = bundle.categories.find((c) => c.category === category);
      if (!answer)
        throw new Error(`buildShortBundle: the nearby bundle carries no ${category} answer`);
      const nearest = answer.places[0] ?? answer.beyondNearest ?? null;
      return {
        category: answer.category,
        label: answer.label,
        state: answer.state,
        nearest: nearest ? { name: nearest.name, miles: nearest.miles } : null,
        countWithin: answer.countWithin,
        line: answer.line,
      };
    }),
  };
}

// ------------------------------------------------------------------
// The named-state shapes (rungs 3 and 4)
// ------------------------------------------------------------------

function named(state: { reason: string }): ShortNamedState {
  return { state: "unavailable", reason: state.reason };
}

function rung3Sections(input: ShortBundleInput): ShortNamedSections {
  const { soldPrices, flood, crime, nearby, area } = input;
  if (
    soldPrices.kind !== "wider-area" ||
    flood.kind !== "wider-area" ||
    crime.kind !== "wider-area" ||
    nearby.kind !== "wider-area" ||
    area.kind !== "wider-area"
  )
    throw new Error(
      "buildShortBundle: the five bundles must come from one resolution — kinds differ at rung 3",
    );
  const areaSections = area.area.sections;
  const fromArea = (key: string): ShortNamedState => named(areaSections[key] ?? area.area);
  return {
    soldPrices: named(soldPrices.soldPrices),
    flood: named(flood.flood),
    crime: named(crime.crime),
    epc: fromArea("epc"),
    councilTax: fromArea("councilTax"),
    constraints: fromArea("constraints"),
    heritage: fromArea("heritage"),
    nature: fromArea("nature"),
    air: fromArea("air"),
    noise: fromArea("noise"),
    broadband: fromArea("broadband"),
    nearby: named(nearby.distances),
  };
}

function rung4Sections(input: ShortBundleInput): ShortNamedSections {
  const { soldPrices, flood, crime, nearby, area } = input;
  if (
    soldPrices.kind !== "no-location" ||
    flood.kind !== "no-location" ||
    crime.kind !== "no-location" ||
    nearby.kind !== "no-location" ||
    area.kind !== "no-location"
  )
    throw new Error(
      "buildShortBundle: the five bundles must come from one resolution — kinds differ at rung 4",
    );
  // The rung-4 area bundle carries one named state for the
  // whole bundle; every area section inherits it.
  const areaNamed = (): ShortNamedState => ({ state: "unavailable", reason: area.area.reason });
  return {
    soldPrices: named(soldPrices.soldPrices),
    flood: named(flood.flood),
    crime: named(crime.crime),
    epc: areaNamed(),
    councilTax: areaNamed(),
    constraints: areaNamed(),
    heritage: areaNamed(),
    nature: areaNamed(),
    air: areaNamed(),
    noise: areaNamed(),
    broadband: areaNamed(),
    nearby: named(nearby.distances),
  };
}

// ------------------------------------------------------------------
// The derivation
// ------------------------------------------------------------------

export function buildShortBundle(input: ShortBundleInput): ShortBundle {
  const rungs = [
    input.nearby.rung,
    input.soldPrices.rung,
    input.crime.rung,
    input.flood.rung,
    input.area.rung,
  ];
  const rung = rungs[0];
  if (!rungs.every((r) => r === rung))
    throw new Error(
      `buildShortBundle: the five bundles must come from one resolution — rungs differ (${rungs.join(", ")})`,
    );

  if (rung === 3) return { rung: 3, kind: "wider-area", sections: rung3Sections(input) };
  if (rung === 4) return { rung: 4, kind: "no-location", sections: rung4Sections(input) };

  const { soldPrices, flood, crime, nearby, area } = input;
  if (
    (soldPrices.kind !== "sold-prices" && soldPrices.kind !== "not-covered") ||
    (flood.kind !== "flood" && flood.kind !== "not-covered") ||
    (crime.kind !== "crime" && crime.kind !== "not-covered") ||
    nearby.kind !== "distances" ||
    area.kind !== "area-bundle"
  )
    throw new Error(
      "buildShortBundle: the five bundles must come from one resolution — kinds differ at rungs 1–2",
    );

  const postcodes = [
    nearby.postcode,
    soldPrices.postcode,
    crime.postcode,
    flood.postcode,
    area.postcode,
  ];
  if (!postcodes.every((p) => p === postcodes[0]))
    throw new Error(
      `buildShortBundle: the five bundles must come from one postcode — got ${postcodes.join(", ")}`,
    );

  const headline = projectHeadline(input.area);
  if (!headline)
    throw new Error("buildShortBundle: the area bundle carries no headline projection");

  const councilTaxHeadline = headline.councilTax;
  const sections: ShortSections = {
    soldPrices: shortSoldPrices(soldPrices),
    flood: shortFlood(flood),
    crime: shortCrime(crime),
    epc: headline.epc,
    councilTax: {
      ...councilTaxHeadline,
      line:
        councilTaxHeadline.state === "served" &&
        councilTaxHeadline.authority &&
        councilTaxHeadline.bandDAverageLabel
          ? `Band D averages ${councilTaxHeadline.bandDAverageLabel} a year in ${councilTaxHeadline.authority} (the council's scale — not this home's bill)`
          : councilTaxHeadline.line,
    },
    constraints: {
      state: headline.constraints.state,
      conservationArea: shortPolygonLayer(headline.constraints.conservationArea),
      article4: shortPolygonLayer(headline.constraints.article4),
      greenBelt: shortPolygonLayer(headline.constraints.greenBelt),
      brownfield: {
        state: headline.constraints.brownfield.state,
        line: headline.constraints.brownfield.line,
        countWithin: headline.constraints.brownfield.countWithin,
        nearest:
          headline.constraints.brownfield.within[0] ??
          headline.constraints.brownfield.beyondNearest ??
          null,
        beyondLine: headline.constraints.brownfield.beyondLine,
        sourceLine: headline.constraints.brownfield.sourceLine,
      },
      builtUpArea: shortPolygonLayer(headline.constraints.builtUpArea),
    },
    heritage: {
      state: headline.heritage.state,
      listed: {
        state: headline.heritage.listed.state,
        line: headline.heritage.listed.line,
        countWithin: headline.heritage.listed.countWithin,
        nearest:
          headline.heritage.listed.within[0] ?? headline.heritage.listed.beyondNearest ?? null,
        beyondLine: headline.heritage.listed.beyondLine,
      },
      atPoint: headline.heritage.atPoint,
      sourceLine: headline.heritage.sourceLine,
    },
    nature: {
      state: headline.nature.state,
      coverageLine: headline.nature.coverageLine,
      placesLine: headline.nature.placesLine,
      designationsLine: headline.nature.designationsLine,
      placesWithinCount: headline.nature.placesWithinCount,
      nearestPlace: headline.nature.places[0] ?? headline.nature.beyondPlace ?? null,
      beyondLine: headline.nature.beyondLine,
      ancientWoodland: shortPolygonLayer(headline.nature.ancientWoodland),
      priorityHabitat: headline.nature.priorityHabitat,
      sourceLine: headline.nature.sourceLine,
    },
    air: headline.air,
    noise: headline.noise,
    broadband: headline.broadband,
    nearby: shortNearby(nearby),
  };

  // The planning hand-off pick (M7.9, see the header):
  // the area bundle builds the section unconditionally,
  // so the pick is present in every rung 1–2 bundle —
  // state, council, line and link cross; the explainer
  // and meta stay at report depth. It precedes the
  // flag-gated pick below, so the bundle's key order is
  // the twelve sections, the hand-off, then company
  // ownership where the flag carries it.
  const planningApplications = area.sections.planningApplications;
  sections.planningApplications = {
    state: planningApplications.state,
    council: planningApplications.council,
    line: planningApplications.line,
    link: planningApplications.link,
  };

  // The flag-gated pick (see the header): the area bundle
  // carries its company-ownership section only while the
  // flag is on, so the key appears here in exactly that
  // position and is absent otherwise. Report depth is
  // untouched — the full section stays on the area bundle.
  const companyOwnership = area.sections.companyOwnership;
  if (companyOwnership) {
    sections.companyOwnership = {
      state: companyOwnership.state,
      ownedByCompany:
        companyOwnership.state === "served"
          ? true
          : companyOwnership.state === "not-company-owned"
            ? false
            : null,
      line: companyOwnership.line,
    };
  }

  return { rung, kind: "short-bundle", postcode: postcodes[0], sections };
}
