import {
  projectHeadline,
  type AreaBundle,
  type HeadlineProjection,
  type ListedAtPoint,
  type ListedPlace,
  type NaturePlace,
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

export type ShortFlood =
  { state: "not-covered"; reason: string } | { state: "served"; layers: ShortFloodLayer[] };

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

export interface ShortConstraints {
  state: "served";
  conservationArea: ShortPolygonLayer;
  article4: ShortPolygonLayer;
  greenBelt: ShortPolygonLayer;
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
// (D28/Q2). The other fourteen stay in the full check —
// twenty categories cannot fit a headline, and the cut
// belongs here, not in a renderer.
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
  return {
    state: "served",
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

  return { rung, kind: "short-bundle", postcode: postcodes[0], sections };
}
