import type { AddressResolution } from "./address";
import { homeKeyOf } from "./bundle-cache";
import type { CategoryAnswer, NearbyBundle } from "./nearby";
import { floodBandOf, formatMiles, resultsScopeLabel } from "./results";
import type { ShortBundle, ShortCrime, ShortFlood } from "./short-bundle";
import {
  NOT_COVERED_LINE,
  shortlistCardId,
  type ComparisonRowKey,
  type ShortlistCard,
  type ShortlistCell,
} from "./shortlist";
import type { SoldPricesBundle } from "./sold-prices";

// Card assembly (plan step M7.5, fold-in 8): the
// server-rendered results page embeds the card record in
// the add control at render, assembled from exactly the
// derivation that rendered the page — the same bundles, no
// new brain call, no new API — so the snapshot a visitor
// saves is provably the facts they saw. This module is
// server-only (it reads the serve layer's bundles); the
// record it builds is lib/shortlist.ts's pinned shape.
//
// Assembly exists for rungs 1 and 3 only (ruling 4): rung 2
// has no home to shortlist, and the Scotland / NI
// not-covered page never calls this — its postcode-level
// page is a coverage answer, not a saveable card.

// The register's property-type and tenure codes, rendered
// as the register's own category names. The sold-prices
// brain serves the codes as filed; the card form (Final
// Design, Section 5) names the kind of home in words, so
// the translation lives here, at presentation. An
// unrecognised or absent code omits the segment — the line
// never invents a word for a filed value it cannot name.
const PROPERTY_TYPE_LABELS: Record<string, string> = {
  D: "Detached",
  S: "Semi-detached",
  T: "Terraced",
  F: "Flat or maisonette",
  O: "Other",
};

const TENURE_LABELS: Record<string, string> = {
  F: "Freehold",
  L: "Leasehold",
};

export interface ShortlistCardInput {
  resolution: AddressResolution;
  // Rung 1 reads the nearby and sold bundles (the same
  // derivation the page rendered); rung 3 reads only the
  // wider-area short bundle — its named states are the
  // whole of its facts — so the two are optional here and
  // a rung-1 call without them assembles nothing.
  nearby?: NearbyBundle;
  sold?: SoldPricesBundle;
  short: ShortBundle;
  // The identity the card's onward links carry, when it is
  // not the home key: a transient resolve token for a
  // Postio-only home (entry-point build, D72). The card's
  // links then work for the record's 24 hours, and for
  // ever after once promotion files the home locally.
  routeKey?: string | null;
}

function categoryOf(nearby: NearbyBundle, key: string): CategoryAnswer | undefined {
  if (nearby.kind !== "distances") return undefined;
  return nearby.categories.find((category) => category.category === key);
}

// The nearest a category serves: its first within-radius
// place, or the essential services' single beyond nearest —
// the same nearest the results page's own rows lead with.
function nearestOf(category: CategoryAnswer | undefined): { name: string; miles: number } | null {
  if (!category) return null;
  if (category.places.length > 0)
    return { name: category.places[0].name, miles: category.places[0].miles };
  return category.beyondNearest ?? null;
}

function distanceCell(category: CategoryAnswer | undefined): ShortlistCell {
  const nearest = nearestOf(category);
  if (nearest) return { kind: "distance", name: nearest.name, miles: nearest.miles };
  return { kind: "line", text: category?.line ?? NOT_COVERED_LINE };
}

// The flood cell (founder's ruling, 17 Nov 2026 — real
// comparable data replaces the pointer): both checks'
// bands in one line, each derived through the results
// layer's own mapping (floodBandOf in lib/results.ts), so
// the absence states — rofrs "no-band-published", rofsw
// "below-lowest-band" — mean Very low here exactly as they
// do on the results page (the CI #206 lesson: a second
// mapping would drift). Where the section is not covered,
// or a layer serves no band at all (its data not filed),
// the cell carries that layer's own named-state line —
// never an invented band.
function floodCell(flood: ShortFlood): ShortlistCell {
  if (flood.state === "not-covered") return { kind: "line", text: flood.reason };
  const riversSea = flood.layers.find((layer) => layer.layer === "rofrs");
  const surfaceWater = flood.layers.find((layer) => layer.layer === "rofsw");
  const riversSeaBand = riversSea ? floodBandOf(riversSea) : null;
  const surfaceWaterBand = surfaceWater ? floodBandOf(surfaceWater) : null;
  if (riversSeaBand !== null && surfaceWaterBand !== null)
    return {
      kind: "line",
      text: `Rivers & sea: ${riversSeaBand} · Surface water: ${surfaceWaterBand}`,
    };
  const bandless = [riversSea, surfaceWater].find(
    (layer) => layer !== undefined && floodBandOf(layer) === null,
  );
  return { kind: "line", text: bandless?.line ?? NOT_COVERED_LINE };
}

// The crime cell (the same ruling): the 12-month count as
// served, in the sample's form ("330 crimes"). The named
// states (not filed, not covered) carry the brain's own
// reason verbatim.
function crimeCell(crime: ShortCrime): ShortlistCell {
  if (crime.state !== "served") return { kind: "line", text: crime.reason };
  return { kind: "line", text: `${crime.total.toLocaleString("en-GB")} crimes` };
}

function rung1Card(input: ShortlistCardInput): ShortlistCard | null {
  const { resolution, nearby, sold, short } = input;
  if (resolution.rung !== 1 || short.kind !== "short-bundle" || !nearby || !sold) return null;

  // The cold-load degrade variant (Part A, 19 Nov
  // 2026) is kind "sold-prices" at rung 1 but carries
  // no ownHistory — the "ownHistory" guard keeps the
  // card's last sale empty for it instead of reading a
  // field that is not there.
  const own =
    sold.kind === "sold-prices" && sold.rung === 1 && "ownHistory" in sold
      ? sold.ownHistory[0]
      : undefined;
  const lastSale = own
    ? {
        price: own.price,
        date: own.date,
        typeLabel: own.propertyType ? (PROPERTY_TYPE_LABELS[own.propertyType] ?? null) : null,
        tenureLabel: own.tenure ? (TENURE_LABELS[own.tenure] ?? null) : null,
      }
    : null;

  // The card's facts line, in the design's card form: the
  // nearest primary in its category form ("Nearest primary
  // 0.1 mi"), then the nearest named everyday place
  // (station first, as the mock pairs them). Two facts at
  // most; the first two that serve.
  const factParts: string[] = [];
  const primary = nearestOf(categoryOf(nearby, "schools-primary"));
  if (primary) factParts.push(`Nearest primary ${formatMiles(primary.miles)} mi`);
  for (const key of ["station", "supermarket", "gp"] as const) {
    if (factParts.length >= 2) break;
    const nearest = nearestOf(categoryOf(nearby, key));
    if (nearest) factParts.push(`${nearest.name} ${formatMiles(nearest.miles)} mi`);
  }
  const factsLine = factParts.length > 0 ? factParts.join(" • ") : null;

  const tax = short.sections.councilTax;
  const councilTaxCell: ShortlistCell =
    tax.state === "served" && tax.bandDAverageLabel
      ? { kind: "line", text: `Band D averages ${tax.bandDAverageLabel} a year` }
      : { kind: "line", text: tax.line ?? NOT_COVERED_LINE };

  const secondary = categoryOf(nearby, "schools-secondary");
  const grammarCell: ShortlistCell = {
    kind: "line",
    text: secondary?.nearestSelectiveLine ?? secondary?.line ?? NOT_COVERED_LINE,
  };

  const comparison: Record<ComparisonRowKey, ShortlistCell> = {
    primary: distanceCell(categoryOf(nearby, "schools-primary")),
    secondary: distanceCell(secondary),
    grammar: grammarCell,
    nursery: distanceCell(categoryOf(nearby, "nurseries")),
    flood: floodCell(short.sections.flood),
    crime: crimeCell(short.sections.crime),
    gp: distanceCell(categoryOf(nearby, "gp")),
    ae: distanceCell(categoryOf(nearby, "ae")),
    station: distanceCell(categoryOf(nearby, "station")),
    vet: distanceCell(categoryOf(nearby, "vets")),
    councilTax: councilTaxCell,
  };

  const homeKey = input.routeKey ?? homeKeyOf(resolution);
  return {
    id: shortlistCardId(1, resolution.address.postcode, homeKey),
    postcode: resolution.address.postcode,
    homeKey,
    rung: 1,
    scopeLabel: resultsScopeLabel(resolution),
    addressLine: resultsScopeLabel(resolution),
    lastSale,
    factsLine,
    comparison,
    savedAt: "",
  };
}

function rung3Card(input: ShortlistCardInput): ShortlistCard | null {
  const { resolution, short } = input;
  if (resolution.rung !== 3 || short.kind !== "wider-area") return null;
  const reason = (key: keyof typeof short.sections): ShortlistCell => ({
    kind: "line",
    text: short.sections[key].reason,
  });
  // The wider-area card's facts are its named states (D44):
  // what homes sell for and the crime counts are the two
  // headline families a wider-area visitor came for, and
  // both are named states at this rung. The comparison
  // carries every row's own named state.
  const factsLine = [short.sections.soldPrices.reason, short.sections.crime.reason].join(" • ");
  return {
    id: shortlistCardId(3, resolution.outward, null),
    postcode: resolution.outward,
    homeKey: null,
    rung: 3,
    scopeLabel: resolution.label,
    addressLine: resolution.label,
    lastSale: null,
    factsLine,
    comparison: {
      primary: reason("nearby"),
      secondary: reason("nearby"),
      grammar: reason("nearby"),
      nursery: reason("nearby"),
      flood: reason("flood"),
      crime: reason("crime"),
      gp: reason("nearby"),
      ae: reason("nearby"),
      station: reason("nearby"),
      vet: reason("nearby"),
      councilTax: reason("councilTax"),
    },
    savedAt: "",
  };
}

// The card a results page offers, or null where the rung
// carries no add control (rung 2, rung 4 — ruling 4).
export function buildShortlistCard(input: ShortlistCardInput): ShortlistCard | null {
  if (input.resolution.rung === 1) return rung1Card(input);
  if (input.resolution.rung === 3) return rung3Card(input);
  return null;
}
