import type { AddressResolution } from "./address";
import type { AreaBundle } from "./area-bundle";
import { homeKeyOf } from "./bundle-cache";
import type { CategoryAnswer, NearbyBundle } from "./nearby";
import {
  airPillBand,
  crimePillBand,
  crimePillFigure,
  floodBandOf,
  floodPillBand,
  formatMiles,
  resultsScopeLabel,
} from "./results";
import type { ShortBundle, ShortCrime, ShortFlood } from "./short-bundle";
import {
  NOT_COVERED_LINE,
  shortlistCardId,
  type ComparisonRowKey,
  type ShortlistCard,
  type ShortlistCell,
  type ShortlistSegment,
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
  // The full area bundle, for the Air quality cell
  // (BUG-164): the pill verdict derives from the full air
  // section's three modelled values, which the short
  // projection does not carry — so the cell reads the
  // same section the page's pill read. Optional so older
  // callers assemble as before; without it the air cell
  // falls back to the short projection's headline line.
  area?: AreaBundle;
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

// The Flood Zone the home sits inside, if any — the
// zone verdict floodPillBand hears (BUG-151 ruling 3),
// restated so the cell can NAME it (BUG-310): the
// planning zone the layers carry, "Flood Zone 3" or
// "Flood Zone 2", only where the point is inside it.
function floodZoneLabel(flood: ShortFlood): string | null {
  if (flood.state !== "served") return null;
  const zone = flood.layers.find((layer) => layer.layer === "flood_zone");
  if (!zone || zone.pointState !== "inside") return null;
  const label = zone.coveringLabel ?? null;
  return label === "Flood Zone 3" || label === "Flood Zone 2" ? label : null;
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
  if (riversSeaBand !== null && surfaceWaterBand !== null) {
    // BUG-163: the cell also carries the pill verdict's
    // band (floodPillBand — the likelihood verdict with
    // the planning zone heard, BUG-151 ruling 3), so the
    // table colours the value exactly as the pill colours
    // its figure. Null where the pill itself would not
    // speak, and the cell then stands plain. BUG-291
    // (founder's ruling, 25 Nov 2026): the band dresses
    // the two VALUES only — the labels stay plain — so
    // the cell is segments, not one banded line. The
    // band is the cell's one verdict band on both values
    // (a Flood Zone 3 home reads red on both, exactly as
    // the pill reads red for the zone); the concatenated
    // text is unchanged.
    const band = floodPillBand(flood);
    const segments: ShortlistSegment[] = [
      { text: "Rivers & sea: " },
      { text: riversSeaBand, ...(band ? { band } : {}) },
      { text: " · Surface water: " },
      { text: surfaceWaterBand, ...(band ? { band } : {}) },
    ];
    // BUG-310 (founder's ruling, 25 Nov 2026): the red
    // on a "Very low" pair is the Flood Zone verdict,
    // not the band's colour — so the zone is NAMED
    // beside the pills, as plain text, wherever the home
    // sits inside one. The pills themselves are not
    // recoloured: the zone verdict stands as Master v97
    // built it.
    const zone = floodZoneLabel(flood);
    if (zone) segments.push({ text: ` · ${zone}` });
    return { kind: "segments", segments };
  }
  // BUG-298: one layer served, the other unfiled — the
  // served band stands, with its pill band, beside the
  // other layer's own named-state line as plain text.
  // The old fall-through showed only the unfiled
  // layer's line and dropped the served band. A layer
  // absent from the bundle altogether carries no line
  // of its own, so the served band stands alone.
  const served =
    riversSeaBand !== null
      ? {
          label: "Rivers & sea: ",
          band: riversSeaBand,
          other: surfaceWater,
          otherLabel: "Surface water: ",
        }
      : surfaceWaterBand !== null
        ? {
            label: "Surface water: ",
            band: surfaceWaterBand,
            other: riversSea,
            otherLabel: "Rivers & sea: ",
          }
        : null;
  if (served) {
    const band = floodPillBand(flood);
    const segments: ShortlistSegment[] = [
      { text: served.label },
      { text: served.band, ...(band ? { band } : {}) },
    ];
    if (served.other) {
      segments.push({ text: ` · ${served.otherLabel}` }, { text: served.other.line });
    }
    const zone = floodZoneLabel(flood);
    if (zone) segments.push({ text: ` · ${zone}` });
    return { kind: "segments", segments };
  }
  const bandless = [riversSea, surfaceWater].find(
    (layer) => layer !== undefined && floodBandOf(layer) === null,
  );
  return { kind: "line", text: bandless?.line ?? NOT_COVERED_LINE };
}

// The crime cell (the same ruling): the 12-month count as
// served, in the sample's form ("330 crimes"). The named
// states (not filed, not covered) carry the brain's own
// reason verbatim. BUG-163: the cell also carries the
// pill verdict's band where the calibration pair honestly
// produces it (crimePillBand over the projected
// per1000 / englandPer1000). A pre-calibration snapshot
// carries no pair — the band is null and the cell stays
// plain; no threshold is ever faked on the raw count.
// BUG-292 (founder's ruling, 25 Nov 2026): the count
// alone says nothing, so the PILL carries the verdict
// (crimePillFigure — the results page pill's own words),
// and the count stands beside it as plain text. The row
// is "Crime — 12-month total", so the total stays in the
// cell; only the verdict is coloured.
function crimeCell(crime: ShortCrime): ShortlistCell {
  if (crime.state !== "served") return { kind: "line", text: crime.reason };
  const band = crimePillBand(crime.per1000, crime.englandPer1000);
  const verdict = crimePillFigure(crime.per1000, crime.englandPer1000);
  if (band === null || verdict === null) {
    // BUG-297 (BUG-292 residual): the pill stays silent
    // where the two rates are exactly equal — the D75
    // rule stands, so no band is invented here — but the
    // compare cell still speaks the verdict in plain
    // words beside the count, so the row never falls
    // back to a bare count when both figures are known.
    // A missing figure stays the bare count: no pair,
    // no verdict of any kind.
    if (
      crime.per1000 != null &&
      crime.englandPer1000 != null &&
      crime.per1000 === crime.englandPer1000
    ) {
      return {
        kind: "segments",
        segments: [
          { text: "At the England average" },
          { text: ` · ${crime.total.toLocaleString("en-GB")} crimes` },
        ],
      };
    }
    return { kind: "line", text: `${crime.total.toLocaleString("en-GB")} crimes` };
  }
  return {
    kind: "segments",
    segments: [
      { text: verdict, band },
      { text: ` · ${crime.total.toLocaleString("en-GB")} crimes` },
    ],
  };
}

// The Air quality cell (BUG-164): composed from the same
// air section the pill verdict derives from — the full
// area bundle's modelled values, in the product's own
// presentation (the results section's bullet forms,
// joined on one line) — and coloured by the pill's own
// band (airPillBand) wherever that verdict speaks. The
// band is the UK-limit-only rule (founder ruling,
// 25 Nov 2026): green under half the limits, orange
// within them at half or more, red over any of them —
// a served set always carries a band now, never plain;
// an unfiled section carries its own named line — the
// table's existing not-served treatment. BUG-361
// (founder ruling, 26 Nov 2026): the verdict words
// lead the figures now, so the row reads like the other
// rows instead of bare figures under a colour. Where no area
// bundle reaches assembly (an older caller), the cell
// falls back to the short projection's headline line,
// plain: the projection carries no values to compose
// from.
function airCell(input: ShortlistCardInput): ShortlistCell {
  const { area, short } = input;
  if (area && (area.rung === 1 || area.rung === 2)) {
    const air = area.sections.air;
    if (air.state === "served" && air.no2 !== null && air.pm25 !== null && air.pm10 !== null) {
      const band = airPillBand(air);
      const figures = `NO2 ${air.no2.toFixed(2)} µg/m³ a year · PM2.5 ${air.pm25.toFixed(2)} µg/m³ · PM10 ${air.pm10.toFixed(2)} µg/m³`;
      // BUG-361: the verdict words travel with the
      // figures, as on the results pill (lib/results.ts)
      // and the other rows — the band alone left the row
      // reading as bare figures. The three strings are
      // the pill's own, mirrored here; a bandless set
      // (unreachable on this branch) keeps the figures
      // alone rather than guessing a verdict.
      const verdict =
        band === "red"
          ? "Above a UK legal limit"
          : band === "orange"
            ? "Within UK legal limits"
            : band === "green"
              ? "Well within UK legal limits"
              : null;
      return {
        kind: "line",
        text: verdict === null ? figures : `${verdict} · ${figures}`,
        ...(band ? { band } : {}),
      };
    }
    return { kind: "line", text: air.line ?? NOT_COVERED_LINE };
  }
  if (short.kind === "short-bundle") {
    const air = short.sections.air;
    return { kind: "line", text: air?.headlineFigure?.line ?? air?.line ?? NOT_COVERED_LINE };
  }
  return { kind: "line", text: NOT_COVERED_LINE };
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
  // BUG-365 (founder ruling, 26 Nov 2026): the grammar
  // row takes the distance verdict like its neighbours —
  // the nearest selective school as a distance cell, so
  // the table colours its miles on the school bands
  // through the row's family (lib/shortlist.ts). The
  // Master's compare row (Samples 15/16) draws plain
  // miles with no pill and no "selective means admission
  // by entrance test" sentence anywhere in the row — the
  // founder's ruling is the verdict, and the Master
  // conform follows with the parent. Where no selective
  // school files, the category's own line stands, as
  // before.
  const selective = secondary?.nearestSelective ?? null;
  const grammarCell: ShortlistCell = selective
    ? { kind: "distance", name: selective.name, miles: selective.miles }
    : {
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
    air: airCell(input),
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
  // BUG-301: the nearby reason is stated ONCE, on the
  // first of its rows (Primary) — the other seven
  // nearby-governed rows carry an em-dash, which says
  // the same state applies without repeating the
  // sentence seven times down the column. No new wording
  // is invented.
  const dash: ShortlistCell = { kind: "line", text: "—" };
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
      secondary: dash,
      grammar: dash,
      nursery: dash,
      flood: reason("flood"),
      crime: reason("crime"),
      air: reason("air"),
      gp: dash,
      ae: dash,
      station: dash,
      vet: dash,
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
