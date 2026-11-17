import type { AddressResolution } from "./address";
import { homeKeyOf } from "./bundle-cache";
import type { CategoryAnswer, NearbyBundle } from "./nearby";
import { formatMiles, resultsScopeLabel } from "./results";
import type { ShortBundle } from "./short-bundle";
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

function rung1Card(input: ShortlistCardInput): ShortlistCard | null {
  const { resolution, nearby, sold, short } = input;
  if (resolution.rung !== 1 || short.kind !== "short-bundle" || !nearby || !sold) return null;

  const own = sold.kind === "sold-prices" && sold.rung === 1 ? sold.ownHistory[0] : undefined;
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
    flood: { kind: "pointer" },
    crime: { kind: "pointer" },
    gp: distanceCell(categoryOf(nearby, "gp")),
    ae: distanceCell(categoryOf(nearby, "ae")),
    station: distanceCell(categoryOf(nearby, "station")),
    vet: distanceCell(categoryOf(nearby, "vets")),
    councilTax: councilTaxCell,
  };

  const homeKey = homeKeyOf(resolution);
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
