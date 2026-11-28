import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ShortlistButton from "../components/ShortlistButton";
import SiteHeader from "../components/SiteHeader";
import type { AddressResolution } from "../lib/address";
import type { AreaBundle } from "../lib/area-bundle";
import { homeKeyOf } from "../lib/bundle-cache";
import type { CategoryAnswer, NearbyBundle, NearbyCategory } from "../lib/nearby";
import {
  AIR_NOT_SAVED_LINE,
  COMPARISON_ROWS,
  NOISE_NOT_SAVED_LINE,
  NOT_COVERED_LINE,
  SEE_THIS_HOMES_CHECK,
  SHORTLIST_EMPTY_HEADING,
  SHORTLIST_EMPTY_LINE,
  SHORTLIST_FULL_LINE,
  SHORTLIST_LEAD_LINE,
  SHORTLIST_LIMIT,
  SHORTLIST_STORAGE_KEY,
  SHORTLIST_UNAVAILABLE_LINE,
  SHORTLIST_UPDATED_EVENT,
  addCardToRecord,
  buildComparison,
  cardLastSaleLine,
  comparisonCellBand,
  comparisonSaleLine,
  emptyShortlistRecord,
  isCardSaved,
  isStaleShortlistCard,
  loadShortlist,
  parseShortlistRecord,
  removeCardFromRecord,
  saveShortlist,
  serializeShortlistRecord,
  shortlistCardId,
  type ShortlistCard,
  type ShortlistCell,
  type StorageLike,
} from "../lib/shortlist";
import { buildShortlistCard } from "../lib/shortlist-card";
import type { ShortBundle } from "../lib/short-bundle";
import type { SoldPricesBundle } from "../lib/sold-prices";

// M7.5 — the shortlist: the storage contract pinned (key,
// record shape, the soft limit, order), the named lines
// verbatim, the comparison's construction from snapshots
// (per-rung cell states, the pill-priority row order, real
// flood and crime cells, no winner anywhere in the shape),
// and card assembly from the results derivation (fold-in
// 8 — the snapshot is the facts the page rendered). Client
// behaviour (toggle, the full message, badge, persistence
// across restart) is the E2E suite's proof
// (e2e/shortlist.e2e.ts); the storage access functions are
// driven here through fake Storage objects.

// ------------------------------------------------------------------
// Fabrications
// ------------------------------------------------------------------

function cell(text: string): ShortlistCell {
  return { kind: "line", text };
}

function makeCard(id: string, overrides: Partial<ShortlistCard> = {}): ShortlistCard {
  const comparison = Object.fromEntries(
    COMPARISON_ROWS.map((row) => [row.key, cell(`${id} ${row.key}`)]),
  ) as ShortlistCard["comparison"];
  return {
    id,
    postcode: "CM3 2JT",
    homeKey: "key",
    rung: 1,
    scopeLabel: "19 Birkdale Rise, CM3 2JT",
    addressLine: "19 Birkdale Rise, CM3 2JT",
    lastSale: { price: 588995, date: "2023-06-15", typeLabel: "Detached", tenureLabel: "Freehold" },
    factsLine: "Nearest primary 0.4 mi",
    comparison,
    savedAt: "2026-11-17T08:00:00.000Z",
    ...overrides,
  };
}

function fakeStorage(initial: Record<string, string> = {}): StorageLike & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const directory = {
  postcode: "CM3 2JT",
  latitude: 51.7,
  longitude: 0.6,
  council: null,
  ward: null,
  region: null,
  lsoaCode: "E01021395",
  msoaCode: null,
};

const birkdale: AddressResolution = {
  rung: 1,
  kind: "home",
  address: {
    postcode: "CM3 2JT",
    paon: "19",
    saon: null,
    street: "BIRKDALE RISE",
    locality: null,
    town: "CHELMSFORD",
    label: "19 Birkdale Rise",
  },
  directory,
};

function category(partial: Partial<CategoryAnswer> & { category: NearbyCategory }): CategoryAnswer {
  return {
    label: "places",
    basisLabel: "straight-line distance from the postcode point",
    state: "within",
    places: [],
    countWithin: 0,
    beyondNearest: null,
    line: null,
    ...partial,
  };
}

function nearbyWith(categories: CategoryAnswer[]): NearbyBundle {
  return {
    rung: 1,
    kind: "distances",
    postcode: "CM3 2JT",
    basisLabel: "straight-line distance from the postcode point",
    categories,
    schoolDeadlines: null,
  };
}

function soldWith(ownHistory: unknown[]): SoldPricesBundle {
  return {
    rung: 1,
    kind: "sold-prices",
    ownHistory,
    ownLine: ownHistory.length === 0 ? "no sale recorded for this home" : null,
  } as unknown as SoldPricesBundle;
}

function floodLayer(partial: Record<string, unknown>): Record<string, unknown> {
  return {
    title: "layer",
    line: "the layer's own line",
    coveringLabel: null,
    coveringDefinition: null,
    coveringDetail: null,
    basisLine: "basis",
    sourceLine: null,
    ...partial,
  };
}

// Birkdale's golden flood shape (the CI #206 states):
// rivers & sea publishes no band for the point, surface
// water sits below its lowest mapped band — both are the
// Very-low case through the results layer's mapping.
const FLOOD_BIRKDALE = {
  state: "served",
  liveWarnings: null,
  layers: [
    floodLayer({
      layer: "rofrs",
      pointState: "no-band-published",
      line: "the postcode point is below the lowest band the Environment Agency publishes on its map of flooding from rivers and the sea — Very low",
    }),
    floodLayer({
      layer: "rofsw",
      pointState: "below-lowest-band",
      line: "No surface-water band reaches this point — below the lowest band this product publishes",
    }),
  ],
};

const CRIME_330 = {
  state: "served",
  total: 330,
  totalLine: "330 recorded crimes within 1 mile of this postcode",
  windowLine: "October 2025 to September 2026",
  asb: { count: 96 },
  perHeadLine: null,
  englandLine: null,
  staleLine: null,
  sourceLine: "Police.uk",
  explainer: "explainer",
};

function shortWith(
  councilTax: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): ShortBundle {
  return {
    rung: 1,
    kind: "short-bundle",
    postcode: "CM3 2JT",
    sections: { councilTax, flood: FLOOD_BIRKDALE, crime: CRIME_330, ...extra },
  } as unknown as ShortBundle;
}

const TAX_SERVED = {
  state: "served",
  authority: "Braintree",
  taxYear: "2026/27",
  bandDAverageLabel: "£2,280.36",
  line: "Band D averages £2,280.36 a year in Braintree (the council's scale — not this home's bill)",
};

function birkdaleNearby(): NearbyBundle {
  return nearbyWith([
    category({
      category: "schools-primary",
      places: [
        {
          latitude: 51.7,
          longitude: 0.6,
          name: "Birkdale Primary School",
          miles: 0.42,
          detail: null,
        },
      ],
      countWithin: 1,
    }),
    category({
      category: "schools-secondary",
      places: [
        { latitude: 51.7, longitude: 0.6, name: "The Boswells School", miles: 1.1, detail: null },
      ],
      countWithin: 1,
      nearestSelective: null,
      nearestSelectiveLine: "No — none in Braintree",
    }),
    category({
      category: "nurseries",
      line: "No nursery within 2 miles of the postcode point in the childcare register we hold.",
      state: "empty",
    }),
    category({
      category: "gp",
      places: [],
      beyondNearest: { latitude: 51.7, longitude: 0.6, name: "Birkdale Surgery", miles: 1.9 },
      state: "none-within",
      line: "No GP surgery within 1 mile; the nearest is Birkdale Surgery, 1.9 miles away",
    }),
    category({
      category: "ae",
      places: [
        { latitude: 51.7, longitude: 0.6, name: "Broomfield Hospital", miles: 5.89, detail: null },
      ],
      countWithin: 1,
    }),
    category({
      category: "station",
      places: [{ latitude: 51.7, longitude: 0.6, name: "Chelmsford", miles: 2.31, detail: null }],
      countWithin: 1,
    }),
    category({
      category: "vets",
      places: [
        { latitude: 51.7, longitude: 0.6, name: "Birkdale Vets", miles: 0.87, detail: null },
      ],
      countWithin: 1,
    }),
  ]);
}

function areaWithNoise(
  bands: { sourceKind: string; label: string; dayBand: string | null; nightBand: string | null }[],
  state = "served",
  line: string | null = null,
): AreaBundle {
  return {
    rung: 1,
    kind: "area-bundle",
    postcode: "CM3 2JT",
    sections: {
      // The bundle carries its air section too — a real
      // bundle always does, and airCell reads it.
      air: { state: "served", line: null, year: 2024, no2: 8, pm25: 4, pm10: 12 },
      noise: {
        state,
        line,
        bands: bands.map((band) => ({
          ...band,
          line: `${band.label}: ${band.dayBand ?? "no band"} by day, ${band.nightBand ?? "no band"} by night`,
        })),
        headlineBand: null,
        sourceLine: null,
      },
    },
  } as unknown as AreaBundle;
}

const NOISE_BELOW_BAND = (sourceKind: string, label: string) => ({
  sourceKind,
  label,
  dayBand: "Below 55 dB",
  nightBand: "Below 50 dB",
});

const NOISE_QUIET_BANDS = [
  NOISE_BELOW_BAND("road", "road noise"),
  NOISE_BELOW_BAND("rail", "rail noise"),
  NOISE_BELOW_BAND("airport", "airport noise"),
];

const NOISE_LOUD_ROAD_BANDS = [
  { sourceKind: "road", label: "road noise", dayBand: "65–69 dB", nightBand: "55–59 dB" },
  NOISE_BELOW_BAND("rail", "rail noise"),
  NOISE_BELOW_BAND("airport", "airport noise"),
];

const NOISE_MID_BANDS = [
  { sourceKind: "road", label: "road noise", dayBand: "55–59 dB", nightBand: "Below 50 dB" },
  NOISE_BELOW_BAND("rail", "rail noise"),
  NOISE_BELOW_BAND("airport", "airport noise"),
];

const NOISE_JOINED_QUIET =
  "Road noise day below 55 dB and night below 50 dB; Rail noise day below 55 dB and night below 50 dB; Airport noise day below 55 dB and night below 50 dB";

// ------------------------------------------------------------------
// The contract pins
// ------------------------------------------------------------------

describe("the storage contract (fold-in 1)", () => {
  it("pins the versioned key, the limit and the update signal", () => {
    expect(SHORTLIST_STORAGE_KEY).toBe("cmnh-shortlist-v1");
    expect(SHORTLIST_LIMIT).toBe(3);
    expect(SHORTLIST_UPDATED_EVENT).toBe("cmnh:shortlist-updated");
  });

  it("pins the named lines verbatim", () => {
    expect(SHORTLIST_EMPTY_HEADING).toBe("Your shortlist is empty");
    expect(SHORTLIST_EMPTY_LINE).toBe(
      "No homes have been saved yet, so there is nothing to compare. Homes you save are kept only in this browser. Next step: check a postcode on the website, or open a listing and tap 'Shortlist this home' — saved homes will appear here.",
    );
    expect(SHORTLIST_UNAVAILABLE_LINE).toContain("not allowing storage right now");
    expect(SHORTLIST_FULL_LINE).toBe("Your shortlist is full — it holds 3 homes.");
    expect(SEE_THIS_HOMES_CHECK).toBe("See this home's check");
  });

  it("derives card identity from postcode + home key at rung 1, outward at rung 3", () => {
    expect(shortlistCardId(1, "CM3 2JT", "abc")).toBe("r1:CM3 2JT:abc");
    expect(shortlistCardId(3, "E16", null)).toBe("r3:E16");
  });
});

// ------------------------------------------------------------------
// Record logic — the soft limit
// ------------------------------------------------------------------

describe("record logic", () => {
  it("adds in saved order and preserves it", () => {
    let record = emptyShortlistRecord();
    record = addCardToRecord(record, makeCard("a")).record;
    record = addCardToRecord(record, makeCard("b")).record;
    record = addCardToRecord(record, makeCard("c")).record;
    expect(record.cards.map((card) => card.id)).toEqual(["a", "b", "c"]);
  });

  it("refuses a fourth card as full, leaving the record untouched", () => {
    let record = emptyShortlistRecord();
    for (const id of ["a", "b", "c"]) record = addCardToRecord(record, makeCard(id)).record;
    const attempt = addCardToRecord(record, makeCard("d"));
    expect(attempt.outcome).toBe("full");
    expect(attempt.record).toBe(record);
  });

  it("treats re-adding a saved home as already-saved, never a duplicate", () => {
    let record = emptyShortlistRecord();
    record = addCardToRecord(record, makeCard("a")).record;
    const attempt = addCardToRecord(record, makeCard("a"));
    expect(attempt.outcome).toBe("already-saved");
    expect(attempt.record.cards).toHaveLength(1);
  });

  it("removing frees the slot in place; removing an unknown id is a no-op", () => {
    let record = emptyShortlistRecord();
    for (const id of ["a", "b", "c"]) record = addCardToRecord(record, makeCard(id)).record;
    record = removeCardFromRecord(record, "b");
    expect(record.cards.map((card) => card.id)).toEqual(["a", "c"]);
    expect(addCardToRecord(record, makeCard("d")).outcome).toBe("added");
    expect(removeCardFromRecord(record, "zzz").cards).toHaveLength(2);
    expect(isCardSaved(record, "a")).toBe(true);
    expect(isCardSaved(record, "b")).toBe(false);
  });
});

// ------------------------------------------------------------------
// Serialisation
// ------------------------------------------------------------------

describe("serialisation", () => {
  it("round-trips a record exactly", () => {
    let record = emptyShortlistRecord();
    record = addCardToRecord(record, makeCard("a")).record;
    record = addCardToRecord(record, makeCard("b", { rung: 3, homeKey: null })).record;
    expect(parseShortlistRecord(serializeShortlistRecord(record))).toEqual(record);
  });

  it("reads absence, garbage and another version as the empty list", () => {
    expect(parseShortlistRecord(null)).toEqual({ v: 1, cards: [] });
    expect(parseShortlistRecord("not json")).toEqual({ v: 1, cards: [] });
    expect(parseShortlistRecord(JSON.stringify({ v: 2, cards: [makeCard("a")] }))).toEqual({
      v: 1,
      cards: [],
    });
  });

  it("drops a malformed card and keeps the well-formed ones", () => {
    const raw = JSON.stringify({
      v: 1,
      cards: [makeCard("a"), { id: "broken" }, makeCard("b")],
    });
    expect(parseShortlistRecord(raw).cards.map((card) => card.id)).toEqual(["a", "b"]);
  });

  it("reads a card saved before the Noise row existed — the missing noise cell is tolerated (BUG-403)", () => {
    // The Air quality cell is the BUG-164 precedent: a
    // card saved before the row existed holds no cell
    // for it, and the card survives — buildComparison
    // serves the not-saved line for that row instead.
    const card = JSON.parse(JSON.stringify(makeCard("a"))) as ShortlistCard;
    delete (card.comparison as Partial<Record<string, ShortlistCell>>).noise;
    expect(parseShortlistRecord(JSON.stringify({ v: 1, cards: [card] })).cards).toEqual([card]);
  });
});

// ------------------------------------------------------------------
// Storage access through fakes
// ------------------------------------------------------------------

describe("storage access", () => {
  it("loads what was saved, through the pinned key", () => {
    const storage = fakeStorage();
    const record = addCardToRecord(emptyShortlistRecord(), makeCard("a")).record;
    expect(saveShortlist(record, storage)).toBe(true);
    expect(storage.data.has(SHORTLIST_STORAGE_KEY)).toBe(true);
    expect(loadShortlist(storage)).toEqual({ status: "ok", record });
  });

  it("a store that refuses reads is the unavailable state, never a throw", () => {
    const refusing: StorageLike = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {},
    };
    expect(loadShortlist(refusing)).toEqual({ status: "unavailable" });
    expect(loadShortlist(null)).toEqual({ status: "unavailable" });
  });

  it("a store that refuses writes reports failure, never a throw", () => {
    const refusing: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(saveShortlist(emptyShortlistRecord(), refusing)).toBe(false);
    expect(saveShortlist(emptyShortlistRecord(), null)).toBe(false);
  });
});

// ------------------------------------------------------------------
// Display composition + the comparison's construction
// ------------------------------------------------------------------

describe("display composition from a snapshot", () => {
  it("composes the card's last-sale line in the design's form", () => {
    expect(cardLastSaleLine(makeCard("a"))).toBe(
      "£588,995 • Last sale, Jun 2023 • Detached, freehold",
    );
  });

  it("omits the type/tenure segment the filed sale does not carry", () => {
    const card = makeCard("a", {
      lastSale: { price: 270000, date: "2014-01-20", typeLabel: null, tenureLabel: null },
    });
    expect(cardLastSaleLine(card)).toBe("£270,000 • Last sale, Jan 2014");
    expect(cardLastSaleLine(makeCard("a", { lastSale: null }))).toBeNull();
  });

  it("composes the comparison header's sale line with the year only", () => {
    expect(comparisonSaleLine(makeCard("a"))).toBe("£588,995 — last sale 2023");
    expect(comparisonSaleLine(makeCard("a", { lastSale: null }))).toBeNull();
  });
});

describe("the comparison's construction", () => {
  it("transposes the snapshots into the pinned row set, in the D75 pill-priority order", () => {
    const view = buildComparison([makeCard("a"), makeCard("b")]);
    expect(view.rows.map((row) => row.label)).toEqual([
      "Flood",
      "Crime — 12-month total",
      "Air quality",
      "Noise",
      "Nearest primary",
      "Nearest secondary",
      "Selective schools",
      "Hospital with A&E",
      "GP",
      "Nearest vet",
      "Station",
      "Nursery",
      "Council tax",
    ]);
    expect(view.rows.find((row) => row.key === "primary")?.cells).toEqual([
      cell("a primary"),
      cell("b primary"),
    ]);
    expect(view.columns.map((card) => card.id)).toEqual(["a", "b"]);
  });

  it("carries no winner, score or ranking anywhere in its shape", () => {
    const view = buildComparison([makeCard("a")]);
    expect(Object.keys(view).sort()).toEqual(["columns", "rows"]);
    for (const row of view.rows)
      expect(Object.keys(row).sort()).toEqual(["cells", "family", "key", "label"]);
  });

  it("keeps a legacy pointer cell as a pointer — the stored shape is honoured, never dropped", () => {
    // Cards saved before the 17 Nov 2026 ruling hold pointer
    // flood/crime cells; parsing and transposing them must
    // leave the shape exactly as stored.
    const pointer: ShortlistCell = { kind: "pointer" };
    const card = makeCard("a", {
      comparison: { ...makeCard("a").comparison, flood: pointer, crime: pointer },
    });
    const view = buildComparison([card]);
    expect(view.rows.find((row) => row.key === "flood")?.cells[0]).toEqual({ kind: "pointer" });
    expect(view.rows.find((row) => row.key === "crime")?.cells[0]).toEqual({ kind: "pointer" });
    expect(parseShortlistRecord(serializeShortlistRecord({ v: 1, cards: [card] })).cards).toEqual([
      card,
    ]);
  });

  it("serves the not-saved line for a card saved before the Noise row (BUG-403)", () => {
    const card = JSON.parse(JSON.stringify(makeCard("a"))) as ShortlistCard;
    delete (card.comparison as Partial<Record<string, ShortlistCell>>).noise;
    const view = buildComparison([card]);
    expect(view.rows.find((row) => row.key === "noise")?.cells).toEqual([
      { kind: "line", text: NOISE_NOT_SAVED_LINE },
    ]);
  });
});

// ------------------------------------------------------------------
// Card assembly from the results derivation (fold-in 8)
// ------------------------------------------------------------------

describe("card assembly", () => {
  const birkdaleSold = soldWith([
    {
      price: 588995,
      date: "2023-06-15",
      propertyType: "D",
      tenure: "F",
      newBuild: false,
      address: "19 Birkdale Rise",
    },
    {
      price: 410000,
      date: "2015-03-02",
      propertyType: "D",
      tenure: "F",
      newBuild: false,
      address: "19 Birkdale Rise",
    },
  ]);

  it("assembles the rung-1 card from the same derivation the page rendered", () => {
    const card = buildShortlistCard({
      resolution: birkdale,
      nearby: birkdaleNearby(),
      sold: birkdaleSold,
      short: shortWith(TAX_SERVED),
    });
    expect(card).not.toBeNull();
    expect(card?.id).toBe(`r1:CM3 2JT:${homeKeyOf(birkdale)}`);
    expect(card?.homeKey).toBe(homeKeyOf(birkdale));
    expect(card?.addressLine).toBe("19 Birkdale Rise, CM3 2JT");
    expect(card?.scopeLabel).toBe("19 Birkdale Rise, CM3 2JT");
    // The newest sale is the snapshot's; the register's
    // codes render as its category names.
    expect(card?.lastSale).toEqual({
      price: 588995,
      date: "2023-06-15",
      typeLabel: "Detached",
      tenureLabel: "Freehold",
    });
    expect(card?.factsLine).toBe("Nearest primary 0.4 mi • Chelmsford 2.3 mi");
    expect(card?.comparison.primary).toEqual({
      kind: "distance",
      name: "Birkdale Primary School",
      miles: 0.42,
    });
    // The essential-services beyond nearest is the category's
    // nearest, exactly as the results page leads with it.
    expect(card?.comparison.gp).toEqual({ kind: "distance", name: "Birkdale Surgery", miles: 1.9 });
    expect(card?.comparison.grammar).toEqual({ kind: "line", text: "No — none in Braintree" });
    // BUG-392: the nursery register line never shows on
    // the shortlist — with no nursery filed within 25
    // miles there is nothing to name, so the cell is a
    // dash (the rung-3 card's BUG-301 form).
    expect(card?.comparison.nursery).toEqual({ kind: "line", text: "—" });
    // The real cells (founder's ruling, 17 Nov 2026): the
    // flood line derives both bands through the results
    // layer's mapping — the fabricated absence states
    // (rofrs "no-band-published", rofsw
    // "below-lowest-band") are the Very-low case, exactly
    // as on the results page; the crime line is the served
    // 12-month count. BUG-163: the flood cell also carries
    // the pill verdict's band — both layers Very low is
    // the pill's good, green. BUG-291: the band dresses
    // the two values only, labels plain — segments.
    expect(card?.comparison.flood).toEqual({
      kind: "segments",
      segments: [
        { text: "Rivers & sea: " },
        { text: "Very low", band: "green" },
        { text: " · Surface water: " },
        { text: "Very low", band: "green" },
      ],
    });
    expect(card?.comparison.crime).toEqual({ kind: "line", text: "330 crimes" });
    // BUG-403: no area bundle reaches assembly here, so
    // the Noise row falls back to the short projection —
    // which carries no noise line — and reads the
    // not-covered line, exactly as the Air quality cell
    // does without its bundle.
    expect(card?.comparison.noise).toEqual({ kind: "line", text: NOT_COVERED_LINE });
    expect(card?.comparison.councilTax).toEqual({
      kind: "line",
      text: "Band D averages £2,280.36 a year",
    });
  });

  it("assembles the grammar row as a distance cell where a selective school files (BUG-365)", () => {
    // A nearby carrying only the secondary category, with
    // a selective school in range: the grammar cell is
    // the nearest selective as a distance cell — name and
    // miles, the table's school band colours it at
    // display — not the composed sentence.
    const selectiveNearby = nearbyWith([
      category({
        category: "schools-secondary",
        places: [
          { latitude: 51.7, longitude: 0.6, name: "The Boswells School", miles: 1.1, detail: null },
        ],
        countWithin: 1,
        nearestSelective: { name: "King Edward VI Grammar School", miles: 6.1 },
        nearestSelectiveLine:
          "The nearest selective secondary school is King Edward VI Grammar School — selective means admission by entrance test",
      }),
    ]);
    const card = buildShortlistCard({
      resolution: birkdale,
      nearby: selectiveNearby,
      sold: birkdaleSold,
      short: shortWith(TAX_SERVED),
    });
    expect(card?.comparison.grammar).toEqual({
      kind: "distance",
      name: "King Edward VI Grammar School",
      miles: 6.1,
    });
  });

  it("assembles the nursery row as a distance cell where the shortlist nearest files (BUG-392/393)", () => {
    // The brain files the nearest nursery beyond the
    // radius as shortlistNearest (never beyondNearest, so
    // the free page and the report keep the register
    // line): the cell names it, and the school band colours
    // it red past 2 miles — the founder's "find the
    // nearest one and mark it red".
    const nurseryBeyond = nearbyWith([
      category({
        category: "nurseries",
        state: "empty",
        line: "No nursery within 2 miles of the postcode point in the childcare register we hold.",
        shortlistNearest: {
          name: "Far Away Nursery",
          miles: 4.4,
          latitude: 51.4,
          longitude: -0.2,
        },
      }),
    ]);
    const card = buildShortlistCard({
      resolution: birkdale,
      nearby: nurseryBeyond,
      sold: birkdaleSold,
      short: shortWith(TAX_SERVED),
    });
    expect(card?.comparison.nursery).toEqual({
      kind: "distance",
      name: "Far Away Nursery",
      miles: 4.4,
    });
    expect(comparisonCellBand("nursery", "school", card?.comparison.nursery as ShortlistCell)).toBe(
      "red",
    );
  });

  it("assembles the nursery row as a dash where no nursery files within 25 miles (BUG-392)", () => {
    // No shortlist nearest: the register line is banned
    // from this page, and there is nothing to name — the
    // cell is a dash, never the line.
    const nurseryEmpty = nearbyWith([
      category({
        category: "nurseries",
        state: "empty",
        line: "No nursery within 2 miles of the postcode point in the childcare register we hold.",
      }),
    ]);
    const card = buildShortlistCard({
      resolution: birkdale,
      nearby: nurseryEmpty,
      sold: birkdaleSold,
      short: shortWith(TAX_SERVED),
    });
    expect(card?.comparison.nursery).toEqual({ kind: "line", text: "—" });
  });

  it("assembles the nursery row's named state where the table is not filed (BUG-392)", () => {
    // The ban is on the register line only: a not-filed
    // nursery still shows its own named state, exactly as
    // the other rows show theirs.
    const nurseryUnfiled = nearbyWith([
      category({
        category: "nurseries",
        state: "not-filed",
        line: "The nurseries data is not filed yet, so no nurseries answer can be given yet",
      }),
    ]);
    const card = buildShortlistCard({
      resolution: birkdale,
      nearby: nurseryUnfiled,
      sold: birkdaleSold,
      short: shortWith(TAX_SERVED),
    });
    expect(card?.comparison.nursery).toEqual({
      kind: "line",
      text: "The nurseries data is not filed yet, so no nurseries answer can be given yet",
    });
  });

  it("assembles the rung-1 card while sold prices are still being gathered — no last sale, nothing read off the variant", () => {
    // Part A of the cold-check fix (19 Nov 2026): the
    // sold bundle is the unavailable variant — kind
    // "sold-prices" at rung 1 with no ownHistory. The
    // card still assembles (the rest of the check
    // rendered whole); its last sale is simply absent.
    const unavailable = {
      rung: 1,
      kind: "sold-prices",
      postcode: "CM3 2JT",
      soldPrices: {
        state: "unavailable",
        reason: "sold prices are still being gathered for this postcode — check again shortly",
      },
    } as unknown as SoldPricesBundle;
    const card = buildShortlistCard({
      resolution: birkdale,
      nearby: birkdaleNearby(),
      sold: unavailable,
      short: shortWith(TAX_SERVED),
    });
    expect(card).not.toBeNull();
    expect(card?.lastSale).toBeNull();
  });

  it("derives a Minerva-shaped flood cell: rivers Very low, surface water Low", () => {
    const card = buildShortlistCard({
      resolution: birkdale,
      nearby: birkdaleNearby(),
      sold: soldWith([]),
      short: shortWith(TAX_SERVED, {
        flood: {
          state: "served",
          liveWarnings: null,
          layers: [
            floodLayer({ layer: "rofrs", pointState: "no-band-published" }),
            floodLayer({
              layer: "rofsw",
              pointState: "inside",
              coveringLabel: "Low",
              line: "this point is covered by the Surface water Low band",
            }),
          ],
        },
        crime: { ...CRIME_330, total: 1956 },
      }),
    });
    // BUG-163: a Low layer is the pill's concerning at
    // orange — the cell carries that band. BUG-291: the
    // band dresses the two values only, labels plain.
    expect(card?.comparison.flood).toEqual({
      kind: "segments",
      segments: [
        { text: "Rivers & sea: " },
        { text: "Very low", band: "orange" },
        { text: " · Surface water: " },
        { text: "Low", band: "orange" },
      ],
    });
    expect(card?.comparison.crime).toEqual({ kind: "line", text: "1,956 crimes" });
  });

  it("carries the named states for flood and crime, never an invented figure", () => {
    const notCovered = buildShortlistCard({
      resolution: birkdale,
      nearby: birkdaleNearby(),
      sold: soldWith([]),
      short: shortWith(TAX_SERVED, {
        flood: { state: "not-covered", reason: NOT_COVERED_LINE },
        crime: { state: "not-filed", reason: "the crime data has not been filed yet" },
      }),
    });
    expect(notCovered?.comparison.flood).toEqual({ kind: "line", text: NOT_COVERED_LINE });
    expect(notCovered?.comparison.crime).toEqual({
      kind: "line",
      text: "the crime data has not been filed yet",
    });

    // A layer whose data is not filed serves no band — but
    // the other layer's served band still stands (BUG-298):
    // the cell carries the served "Very low" beside the
    // unfiled layer's own line, never only the line.
    const notFiledLayer = buildShortlistCard({
      resolution: birkdale,
      nearby: birkdaleNearby(),
      sold: soldWith([]),
      short: shortWith(TAX_SERVED, {
        flood: {
          state: "served",
          liveWarnings: null,
          layers: [
            floodLayer({ layer: "rofrs", pointState: "no-band-published" }),
            floodLayer({
              layer: "rofsw",
              pointState: "not-filed",
              line: "we have not yet filed the surface-water data for this postcode",
            }),
          ],
        },
      }),
    });
    expect(notFiledLayer?.comparison.flood).toEqual({
      kind: "segments",
      segments: [
        { text: "Rivers & sea: " },
        { text: "Very low" },
        { text: " · Surface water: " },
        { text: "we have not yet filed the surface-water data for this postcode" },
      ],
    });
  });

  it("a home with no recorded sale snapshots a null last sale, not an invented one", () => {
    const card = buildShortlistCard({
      resolution: birkdale,
      nearby: birkdaleNearby(),
      sold: soldWith([]),
      short: shortWith(TAX_SERVED),
    });
    expect(card?.lastSale).toBeNull();
  });

  it("an unrecognised register code omits its segment rather than inventing a word", () => {
    const card = buildShortlistCard({
      resolution: birkdale,
      nearby: birkdaleNearby(),
      sold: soldWith([
        {
          price: 100000,
          date: "2020-01-01",
          propertyType: "X",
          tenure: null,
          newBuild: null,
          address: "19 Birkdale Rise",
        },
      ]),
      short: shortWith(TAX_SERVED),
    });
    expect(card?.lastSale).toEqual({
      price: 100000,
      date: "2020-01-01",
      typeLabel: null,
      tenureLabel: null,
    });
  });

  it("a category the bundle does not carry renders its named state, never a borrowed figure", () => {
    const card = buildShortlistCard({
      resolution: birkdale,
      nearby: nearbyWith([]),
      sold: birkdaleSold,
      short: shortWith({
        state: "not-filed",
        authority: null,
        taxYear: null,
        bandDAverageLabel: null,
        line: "council tax is not filed for this council yet",
      }),
    });
    expect(card?.comparison.primary).toEqual({
      kind: "line",
      text: "This check is not covered for this postcode.",
    });
    expect(card?.comparison.councilTax).toEqual({
      kind: "line",
      text: "council tax is not filed for this council yet",
    });
    expect(card?.factsLine).toBeNull();
  });

  it("assembles nothing at rung 2 (ruling 4)", () => {
    const rung2: AddressResolution = {
      rung: 2,
      kind: "address-list",
      directory,
      street: null,
      building: null,
      addresses: [],
    };
    expect(
      buildShortlistCard({
        resolution: rung2,
        nearby: birkdaleNearby(),
        sold: birkdaleSold,
        short: shortWith(TAX_SERVED),
      }),
    ).toBeNull();
  });

  it("assembles the rung-3 card from the wider-area named states (D44)", () => {
    const resolution: AddressResolution = {
      rung: 3,
      kind: "wider-area",
      outward: "E16",
      label: "Wider area — E16, not this exact home",
      postcodeCount: 1234,
    };
    const short = {
      rung: 3,
      kind: "wider-area",
      sections: {
        soldPrices: { state: "unavailable", reason: "Sold prices need an exact postcode" },
        crime: { state: "unavailable", reason: "Crime counts need an exact postcode" },
        nearby: { state: "unavailable", reason: "distances need an exact postcode" },
        flood: { state: "unavailable", reason: "Flood answers need an exact postcode" },
        air: { state: "unavailable", reason: "Air quality needs an exact postcode" },
        noise: { state: "unavailable", reason: "Noise bands need an exact postcode" },
        councilTax: { state: "unavailable", reason: "Council tax needs an exact postcode" },
      },
    } as unknown as ShortBundle;
    const card = buildShortlistCard({ resolution, short });
    expect(card?.id).toBe("r3:E16");
    expect(card?.postcode).toBe("E16");
    expect(card?.homeKey).toBeNull();
    expect(card?.addressLine).toBe("Wider area — E16, not this exact home");
    expect(card?.lastSale).toBeNull();
    expect(card?.factsLine).toBe(
      "Sold prices need an exact postcode • Crime counts need an exact postcode",
    );
    expect(card?.comparison.station).toEqual({ kind: "line", text: "—" });
    // BUG-301: the nearby reason stands once, on
    // Primary — the other seven nearby-governed rows
    // carry the dash, not the repeated sentence.
    expect(card?.comparison.primary).toEqual({
      kind: "line",
      text: "distances need an exact postcode",
    });
    for (const key of ["secondary", "grammar", "nursery", "gp", "ae", "vet"] as const) {
      expect(card?.comparison[key]).toEqual({ kind: "line", text: "—" });
    }
    expect(card?.comparison.flood).toEqual({
      kind: "line",
      text: "Flood answers need an exact postcode",
    });
    expect(card?.comparison.air).toEqual({
      kind: "line",
      text: "Air quality needs an exact postcode",
    });
    // BUG-403: Noise carries its own section's reason
    // at rung 3, exactly as Air quality does — it is
    // not a nearby-governed dash row.
    expect(card?.comparison.noise).toEqual({
      kind: "line",
      text: "Noise bands need an exact postcode",
    });
    expect(card?.comparison.councilTax).toEqual({
      kind: "line",
      text: "Council tax needs an exact postcode",
    });
  });
  it("BUG-297: a crime rate exactly at the England average speaks the verdict in plain words, not a bare count", () => {
    const card = buildShortlistCard({
      resolution: birkdale,
      nearby: birkdaleNearby(),
      sold: soldWith([]),
      short: shortWith(TAX_SERVED, {
        crime: { ...CRIME_330, per1000: 51.7, englandPer1000: 51.7 },
      }),
    });
    expect(card?.comparison.crime).toEqual({
      kind: "segments",
      segments: [{ text: "At the England average" }, { text: " · 330 crimes" }],
    });
  });

  it("BUG-297: a missing calibration pair stays the bare count — no verdict is invented", () => {
    const card = buildShortlistCard({
      resolution: birkdale,
      nearby: birkdaleNearby(),
      sold: soldWith([]),
      short: shortWith(TAX_SERVED, {
        crime: { ...CRIME_330, per1000: null, englandPer1000: 97.4 },
      }),
    });
    expect(card?.comparison.crime).toEqual({ kind: "line", text: "330 crimes" });
  });

  it("BUG-298: one flood layer served High, the other unfiled — the served band stands in red beside the named state", () => {
    const card = buildShortlistCard({
      resolution: birkdale,
      nearby: birkdaleNearby(),
      sold: soldWith([]),
      short: shortWith(TAX_SERVED, {
        flood: {
          state: "served",
          liveWarnings: null,
          layers: [
            floodLayer({
              layer: "rofrs",
              pointState: "inside",
              coveringLabel: "High",
              line: "this point is covered by the Rivers & sea High band",
            }),
            floodLayer({
              layer: "rofsw",
              pointState: "not-filed",
              line: "This flood map is not filed yet, so no answer can be given from it",
            }),
          ],
        },
      }),
    });
    expect(card?.comparison.flood).toEqual({
      kind: "segments",
      segments: [
        { text: "Rivers & sea: " },
        { text: "High", band: "red" },
        { text: " · Surface water: " },
        { text: "This flood map is not filed yet, so no answer can be given from it" },
      ],
    });
  });

  it("BUG-310: a Very-low pair inside Flood Zone 3 names the zone beside the pills instead of recolouring them", () => {
    const card = buildShortlistCard({
      resolution: birkdale,
      nearby: birkdaleNearby(),
      sold: soldWith([]),
      short: shortWith(TAX_SERVED, {
        flood: {
          state: "served",
          liveWarnings: null,
          layers: [
            ...FLOOD_BIRKDALE.layers,
            floodLayer({
              layer: "flood_zone",
              pointState: "inside",
              coveringLabel: "Flood Zone 3",
              line: "this point is inside Flood Zone 3",
            }),
          ],
        },
      }),
    });
    // The pills stay the zone verdict's red (Master v97);
    // the zone itself is named as plain text after them.
    expect(card?.comparison.flood).toEqual({
      kind: "segments",
      segments: [
        { text: "Rivers & sea: " },
        { text: "Very low", band: "red" },
        { text: " · Surface water: " },
        { text: "Very low", band: "red" },
        { text: " · Flood Zone 3" },
      ],
    });
  });

  it("BUG-310: no zone, no zone label — a Very-low pair outside any zone reads as before", () => {
    const card = buildShortlistCard({
      resolution: birkdale,
      nearby: birkdaleNearby(),
      sold: soldWith([]),
      short: shortWith(TAX_SERVED),
    });
    expect(card?.comparison.flood).toEqual({
      kind: "segments",
      segments: [
        { text: "Rivers & sea: " },
        { text: "Very low", band: "green" },
        { text: " · Surface water: " },
        { text: "Very low", band: "green" },
      ],
    });
  });

  it("BUG-403: the Noise row carries the pill verdict ahead of the joined bands — Noisy in orange", () => {
    // A loud road band (day 65–69 dB) makes Noise
    // concerning under the D75 verdict, which the row
    // colours from the pill machinery — never a second
    // threshold set. The verdict word takes the pill's
    // dress (BUG-291/394: segments, not a banded line)
    // and the joined bands stand beside it as plain
    // text.
    const card = buildShortlistCard({
      resolution: birkdale,
      nearby: birkdaleNearby(),
      sold: birkdaleSold,
      area: areaWithNoise(NOISE_LOUD_ROAD_BANDS),
      short: shortWith(TAX_SERVED),
    });
    expect(card?.comparison.noise).toEqual({
      kind: "segments",
      segments: [
        { text: "Noisy", band: "orange" },
        {
          text: " · Road noise day 65–69 dB and night 55–59 dB; Rail noise day below 55 dB and night below 50 dB; Airport noise day below 55 dB and night below 50 dB",
        },
      ],
    });
  });

  it("BUG-403: the Noise row reads Quiet in green where road, rail and airport are all in the lowest bands", () => {
    const card = buildShortlistCard({
      resolution: birkdale,
      nearby: birkdaleNearby(),
      sold: birkdaleSold,
      area: areaWithNoise(NOISE_QUIET_BANDS),
      short: shortWith(TAX_SERVED),
    });
    expect(card?.comparison.noise).toEqual({
      kind: "segments",
      segments: [{ text: "Quiet", band: "green" }, { text: ` · ${NOISE_JOINED_QUIET}` }],
    });
  });

  it("BUG-403: a mid-band home takes no noise verdict — the row is the plain joined line", () => {
    // Road 55–59 dB by day is neither high (day ≥65)
    // nor low (below 55), so the D75 verdict is
    // "neither": no pill on the headline even at rank 4,
    // and the shortlist row carries no band either —
    // the row itself is what makes noise visible here.
    const card = buildShortlistCard({
      resolution: birkdale,
      nearby: birkdaleNearby(),
      sold: birkdaleSold,
      area: areaWithNoise(NOISE_MID_BANDS),
      short: shortWith(TAX_SERVED),
    });
    expect(card?.comparison.noise).toEqual({
      kind: "line",
      text: "Road noise day 55–59 dB and night below 50 dB; Rail noise day below 55 dB and night below 50 dB; Airport noise day below 55 dB and night below 50 dB",
    });
  });

  it("BUG-403: noise not filed carries the section's own named line, never an invented band", () => {
    const card = buildShortlistCard({
      resolution: birkdale,
      nearby: birkdaleNearby(),
      sold: birkdaleSold,
      area: areaWithNoise(
        [],
        "not-filed",
        "Modelled noise bands are not filed yet, so no noise answer can be given yet",
      ),
      short: shortWith(TAX_SERVED),
    });
    expect(card?.comparison.noise).toEqual({
      kind: "line",
      text: "Modelled noise bands are not filed yet, so no noise answer can be given yet",
    });
  });
});

describe("BUG-309: the staleness test for a saved snapshot", () => {
  function currentRung1Card(): ShortlistCard {
    const card = buildShortlistCard({
      resolution: birkdale,
      nearby: birkdaleNearby(),
      sold: soldWith([]),
      short: shortWith(TAX_SERVED),
    });
    if (!card) throw new Error("fixture card missing");
    return card;
  }

  function currentRung3Card(): ShortlistCard {
    const resolution: AddressResolution = {
      rung: 3,
      kind: "wider-area",
      outward: "E16",
      label: "Wider area — E16, not this exact home",
      postcodeCount: 1234,
    };
    const short = {
      rung: 3,
      kind: "wider-area",
      sections: {
        soldPrices: { state: "unavailable", reason: "Sold prices need an exact postcode" },
        crime: { state: "unavailable", reason: "Crime counts need an exact postcode" },
        nearby: { state: "unavailable", reason: "distances need an exact postcode" },
        flood: { state: "unavailable", reason: "Flood answers need an exact postcode" },
        air: { state: "unavailable", reason: "Air quality needs an exact postcode" },
        noise: { state: "unavailable", reason: "Noise bands need an exact postcode" },
        councilTax: { state: "unavailable", reason: "Council tax needs an exact postcode" },
      },
    } as unknown as ShortBundle;
    const card = buildShortlistCard({ resolution, short });
    if (!card) throw new Error("fixture card missing");
    return card;
  }

  it("a card the current assembly built is not stale", () => {
    expect(isStaleShortlistCard(currentRung1Card())).toBe(false);
    expect(isStaleShortlistCard(currentRung3Card())).toBe(false);
  });

  it("a plain-line crime cell alone is not stale — the missing pair is a current shape", () => {
    // The current rung-1 fixture carries exactly that:
    // "330 crimes" with no calibration pair.
    expect(currentRung1Card().comparison.crime).toEqual({ kind: "line", text: "330 crimes" });
    expect(isStaleShortlistCard(currentRung1Card())).toBe(false);
  });

  it("any pointer cell is stale", () => {
    const card = currentRung1Card();
    expect(
      isStaleShortlistCard({
        ...card,
        comparison: { ...card.comparison, flood: { kind: "pointer" } },
      }),
    ).toBe(true);
  });

  it("a flood line in the legacy two-band text is stale", () => {
    const card = currentRung1Card();
    expect(
      isStaleShortlistCard({
        ...card,
        comparison: {
          ...card.comparison,
          flood: { kind: "line", text: "Rivers & sea: Very low · Surface water: Very low" },
        },
      }),
    ).toBe(true);
  });

  it("a missing air cell is stale", () => {
    const card = JSON.parse(JSON.stringify(currentRung1Card())) as ShortlistCard;
    delete (card.comparison as Partial<Record<string, ShortlistCell>>).air;
    expect(isStaleShortlistCard(card)).toBe(true);
  });

  it("a missing noise cell is stale (BUG-403)", () => {
    // Saved before the Noise row existed: the snapshot
    // holds no noise fact, and a fresh derivation
    // restores it — the same treatment as the missing
    // air cell (BUG-164).
    const card = JSON.parse(JSON.stringify(currentRung1Card())) as ShortlistCard;
    delete (card.comparison as Partial<Record<string, ShortlistCell>>).noise;
    expect(isStaleShortlistCard(card)).toBe(true);
  });

  it("an air line in the figures-only text with a band is stale (BUG-361)", () => {
    const card = currentRung1Card();
    expect(
      isStaleShortlistCard({
        ...card,
        comparison: {
          ...card.comparison,
          air: {
            kind: "line",
            text: "NO2 8.15 µg/m³ a year · PM2.5 7.12 µg/m³ · PM10 12.55 µg/m³",
            band: "green",
          },
        },
      }),
    ).toBe(true);
  });

  it("an air line in the verdict-first text with a band is stale (BUG-394)", () => {
    // Saved after BUG-361 put the verdict words ahead
    // of the figures and before BUG-394 reshaped the
    // cell to segments: the whole "verdict · figures"
    // text would take the pill's colour, so a fresh
    // derivation restores the verdict-only colour.
    const card = currentRung1Card();
    expect(
      isStaleShortlistCard({
        ...card,
        comparison: {
          ...card.comparison,
          air: {
            kind: "line",
            text: "Within UK legal limits · NO2 21.71 µg/m³ a year · PM2.5 9.94 µg/m³ · PM10 16.97 µg/m³",
            band: "orange",
          },
        },
      }),
    ).toBe(true);
  });

  it("a nursery line carrying the register line is stale (BUG-392)", () => {
    // Saved before BUG-392/393: the shortlist carried the
    // register line as a line cell. Current assembly never
    // produces it — a nearest files as a distance cell, no
    // nearest files as a dash — so a fresh derivation
    // restores the named nearest or the dash. Both the
    // pre-BUG-395 lowercase form and the capitalised form
    // trip it (the two fixes land in one push, but a card
    // saved between them would carry the capitalised form).
    const card = currentRung1Card();
    for (const text of [
      "no nursery within 2 miles of the postcode point in the childcare register we hold.",
      "No nursery within 2 miles of the postcode point in the childcare register we hold.",
    ]) {
      expect(
        isStaleShortlistCard({
          ...card,
          comparison: { ...card.comparison, nursery: { kind: "line", text } },
        }),
      ).toBe(true);
    }
  });

  it("a nursery dash is not stale — no nearest within 25 miles is a current shape (BUG-392)", () => {
    const card = currentRung1Card();
    expect(
      isStaleShortlistCard({
        ...card,
        comparison: { ...card.comparison, nursery: { kind: "line", text: "—" } },
      }),
    ).toBe(false);
  });

  it("a bandless figures-only air line is not stale — no band to derive a verdict from (BUG-361)", () => {
    const card = currentRung1Card();
    expect(
      isStaleShortlistCard({
        ...card,
        comparison: {
          ...card.comparison,
          air: {
            kind: "line",
            text: "NO2 8.15 µg/m³ a year · PM2.5 7.12 µg/m³ · PM10 12.55 µg/m³",
          },
        },
      }),
    ).toBe(false);
  });

  it("a grammar line in the old lowercase form is stale", () => {
    const card = currentRung1Card();
    expect(
      isStaleShortlistCard({
        ...card,
        comparison: {
          ...card.comparison,
          grammar: {
            kind: "line",
            text: "the nearest selective secondary school is Grammar School — selective means admission by entrance test",
          },
        },
      }),
    ).toBe(true);
  });

  it("a grammar line in the capitalised selective sentence is stale (BUG-365)", () => {
    const card = currentRung1Card();
    expect(
      isStaleShortlistCard({
        ...card,
        comparison: {
          ...card.comparison,
          grammar: {
            kind: "line",
            text: "The nearest selective secondary school is Grammar School — selective means admission by entrance test",
          },
        },
      }),
    ).toBe(true);
  });

  it("a rung-3 card repeating the nearby reason is stale (BUG-301's signature)", () => {
    const card = currentRung3Card();
    const primary = card.comparison.primary;
    expect(
      isStaleShortlistCard({
        ...card,
        comparison: {
          ...card.comparison,
          secondary: primary,
          grammar: primary,
          nursery: primary,
          gp: primary,
          ae: primary,
          station: primary,
          vet: primary,
        },
      }),
    ).toBe(true);
  });
});

// ------------------------------------------------------------------
// The comparison's colour coding (BUG-163) and the Air
// quality row (BUG-164) — founder rulings, 22 Nov 2026
// ------------------------------------------------------------------

describe("the comparison's colour coding (BUG-163)", () => {
  const distance = (miles: number): ShortlistCell => ({ kind: "distance", name: "Place", miles });

  it("takes the pill family bands for the distance rows", () => {
    // Primary by the school band: 0.42 mi is inside the
    // green mile.
    expect(comparisonCellBand("primary", "school", distance(0.42))).toBe("green");
    // Station and vet by the everyday band: 0.6 mi and
    // 1.2 mi both stand past the green half-mile, inside
    // the orange mile-and-a-half.
    expect(comparisonCellBand("station", "everyday", distance(0.6))).toBe("orange");
    expect(comparisonCellBand("vet", "everyday", distance(1.2))).toBe("orange");
    // A&E by the hospital band: 5.9 mi is past the green
    // five miles, inside the orange ten.
    expect(comparisonCellBand("ae", "hospital", distance(5.9))).toBe("orange");
    // Nursery by the school band, past two miles: red.
    expect(comparisonCellBand("nursery", "school", distance(2.4))).toBe("red");
    // Grammar by the school band (BUG-365): 0.4 mi is
    // inside the green mile, 6.1 mi past two miles is red.
    expect(comparisonCellBand("grammar", "school", distance(0.4))).toBe("green");
    expect(comparisonCellBand("grammar", "school", distance(6.1))).toBe("red");
  });

  it("leaves the never-coloured facts plain", () => {
    // GP carries an everyday family in the row table, but
    // the product never colours a GP distance anywhere.
    expect(comparisonCellBand("gp", "everyday", distance(0.3))).toBeNull();
    // Council tax is a plain line, band or none.
    expect(
      comparisonCellBand("councilTax", null, cell("Band D averages £2,280.36 a year")),
    ).toBeNull();
    // A family-less distance cell never colours (no row
    // in the table is family-less and distance-bearing
    // since BUG-365 gave grammar the school family — the
    // pin stays at the function level, on flood's key).
    expect(comparisonCellBand("flood", null, distance(0.4))).toBeNull();
    // A legacy pointer never colours.
    expect(comparisonCellBand("flood", null, { kind: "pointer" })).toBeNull();
  });

  it("carries a line cell's verdict band through, and no band where assembly derived none", () => {
    expect(
      comparisonCellBand("crime", null, { kind: "line", text: "10,722 crimes", band: "red" }),
    ).toBe("red");
    expect(comparisonCellBand("crime", null, { kind: "line", text: "330 crimes" })).toBeNull();
  });

  it("derives a legacy flood cell's band at display time only where the stored words settle it (BUG-189)", () => {
    // A pre-BUG-163 card stores the flood pair with no
    // band. A Medium or High layer word makes the pill
    // red under every planning-zone state (the zone is
    // not in the snapshot and can only agree or stand
    // aside), so the table colours it red — the same
    // verdict the home's own pill carries.
    expect(
      comparisonCellBand("flood", null, {
        kind: "line",
        text: "Rivers & sea: Medium · Surface water: Very low",
      }),
    ).toBe("red");
    expect(
      comparisonCellBand("flood", null, {
        kind: "line",
        text: "Rivers & sea: Very low · Surface water: High",
      }),
    ).toBe("red");
    // A stored band always wins over the derivation.
    expect(
      comparisonCellBand("flood", null, {
        kind: "line",
        text: "Rivers & sea: Medium · Surface water: Very low",
        band: "orange",
      }),
    ).toBe("orange");
    // A Low worst word is orange or red by the unstored
    // zone, and a Very-low pair is green, orange or red
    // by it — the snapshot cannot settle either, so both
    // stay plain rather than guess.
    expect(
      comparisonCellBand("flood", null, {
        kind: "line",
        text: "Rivers & sea: Very low · Surface water: Low",
      }),
    ).toBeNull();
    expect(
      comparisonCellBand("flood", null, {
        kind: "line",
        text: "Rivers & sea: Very low · Surface water: Very low",
      }),
    ).toBeNull();
    // A bandless named-state line (a layer that served
    // no band) is not the pair form and never derives.
    expect(
      comparisonCellBand("flood", null, {
        kind: "line",
        text: "Flood answers need an exact postcode",
      }),
    ).toBeNull();
    // Crime's verdict needs the calibration pair, which
    // no snapshot stores — a legacy count stays plain,
    // and the derivation never reaches another row.
    expect(comparisonCellBand("air", null, { kind: "line", text: "1,956 crimes" })).toBeNull();
  });

  it("assembly puts the crime verdict in the pill for a home more than a quarter above the England rate", () => {
    const card = buildShortlistCard({
      resolution: birkdale,
      nearby: birkdaleNearby(),
      sold: soldWith([]),
      short: shortWith(TAX_SERVED, {
        crime: { ...CRIME_330, total: 10722, per1000: 122.5, englandPer1000: 94.5 },
      }),
    });
    // BUG-292: the pill carries the verdict (the results
    // page pill's own words), the count stands beside it
    // as plain text — the row is the 12-month total, so
    // the total stays in the cell.
    expect(card?.comparison.crime).toEqual({
      kind: "segments",
      segments: [{ text: "Well above England average", band: "red" }, { text: " · 10,722 crimes" }],
    });
  });

  it("assembly leaves the crime cell plain where the snapshot carries no calibration pair", () => {
    // CRIME_330 is the pre-calibration shape (its rate
    // lines are null): no verdict can honestly be
    // produced, so no band is set — never a threshold
    // faked on the raw count.
    const card = buildShortlistCard({
      resolution: birkdale,
      nearby: birkdaleNearby(),
      sold: soldWith([]),
      short: shortWith(TAX_SERVED),
    });
    expect(card?.comparison.crime).toEqual({ kind: "line", text: "330 crimes" });
  });
});

describe("the Air quality row (BUG-164)", () => {
  function areaWithAir(air: Record<string, unknown>): AreaBundle {
    return {
      rung: 1,
      kind: "area-bundle",
      postcode: "CM3 2JT",
      sections: { air },
    } as unknown as AreaBundle;
  }

  function cardWithAir(air: Record<string, unknown>) {
    return buildShortlistCard({
      resolution: birkdale,
      nearby: birkdaleNearby(),
      sold: soldWith([]),
      short: shortWith(TAX_SERVED),
      area: areaWithAir(air),
    });
  }

  it("composes the modelled values and bands the cell red for concerning air", () => {
    const card = cardWithAir({
      state: "served",
      line: null,
      year: 2024,
      no2: 45.2,
      pm25: 12,
      pm10: 20,
    });
    expect(card?.comparison.air).toEqual({
      kind: "segments",
      segments: [
        { text: "Above a UK legal limit", band: "red" },
        { text: " · NO2 45.20 µg/m³ a year · PM2.5 12.00 µg/m³ · PM10 20.00 µg/m³" },
      ],
    });
  });

  it("bands the cell green where all three values sit under half the UK legal limits", () => {
    const card = cardWithAir({
      state: "served",
      line: null,
      year: 2024,
      no2: 8,
      pm25: 4,
      pm10: 12,
    });
    expect(card?.comparison.air).toEqual({
      kind: "segments",
      segments: [
        { text: "Well within UK legal limits", band: "green" },
        { text: " · NO2 8.00 µg/m³ a year · PM2.5 4.00 µg/m³ · PM10 12.00 µg/m³" },
      ],
    });
  });

  it("bands the cell green where all three values sit under half the UK legal limits, even above the WHO guidelines", () => {
    // The old "between the yardsticks" set (NO2 8.15,
    // PM2.5 7.12, PM10 12.55) is above the WHO guidelines
    // yet under half the UK limits — green under the
    // UK-limit-only rule (founder ruling, 25 Nov 2026),
    // never plain.
    const card = cardWithAir({
      state: "served",
      line: null,
      year: 2024,
      no2: 8.15,
      pm25: 7.12,
      pm10: 12.55,
    });
    expect(card?.comparison.air).toEqual({
      kind: "segments",
      segments: [
        { text: "Well within UK legal limits", band: "green" },
        { text: " · NO2 8.15 µg/m³ a year · PM2.5 7.12 µg/m³ · PM10 12.55 µg/m³" },
      ],
    });
  });

  it("bands the cell orange where all three sit within the limits with one at half or more", () => {
    const card = cardWithAir({
      state: "served",
      line: null,
      year: 2024,
      no2: 25,
      pm25: 12,
      pm10: 22,
    });
    expect(card?.comparison.air).toEqual({
      kind: "segments",
      segments: [
        { text: "Within UK legal limits", band: "orange" },
        { text: " · NO2 25.00 µg/m³ a year · PM2.5 12.00 µg/m³ · PM10 22.00 µg/m³" },
      ],
    });
  });

  it("bands the cell orange at exactly half a limit and at exactly a limit", () => {
    const half = cardWithAir({
      state: "served",
      line: null,
      year: 2024,
      no2: 20,
      pm25: 4,
      pm10: 12,
    });
    expect(half?.comparison.air).toEqual({
      kind: "segments",
      segments: [
        { text: "Within UK legal limits", band: "orange" },
        { text: " · NO2 20.00 µg/m³ a year · PM2.5 4.00 µg/m³ · PM10 12.00 µg/m³" },
      ],
    });
    const atLimit = cardWithAir({
      state: "served",
      line: null,
      year: 2024,
      no2: 40,
      pm25: 20,
      pm10: 40,
    });
    expect(atLimit?.comparison.air).toEqual({
      kind: "segments",
      segments: [
        { text: "Within UK legal limits", band: "orange" },
        { text: " · NO2 40.00 µg/m³ a year · PM2.5 20.00 µg/m³ · PM10 40.00 µg/m³" },
      ],
    });
  });

  it("carries the section's own named line, plain, where no air square is filed", () => {
    const card = cardWithAir({
      state: "not-filed",
      line: "No modelled air quality square is filed for this point",
      year: null,
      no2: null,
      pm25: null,
      pm10: null,
    });
    expect(card?.comparison.air).toEqual({
      kind: "line",
      text: "No modelled air quality square is filed for this point",
    });
  });

  it("a card saved before the row existed survives parsing, and its air row serves the not-saved line", () => {
    const legacy = makeCard("legacy");
    delete (legacy.comparison as Record<string, unknown>).air;
    const parsed = parseShortlistRecord(serializeShortlistRecord({ v: 1, cards: [legacy] }));
    // The card is kept, and the stored record is not
    // rewritten — the gap stays a gap in the snapshot.
    expect(parsed.cards).toHaveLength(1);
    expect("air" in parsed.cards[0].comparison).toBe(false);
    const view = buildComparison(parsed.cards);
    expect(view.rows.find((row) => row.key === "air")?.cells).toEqual([
      { kind: "line", text: AIR_NOT_SAVED_LINE },
    ]);
  });
});

// ------------------------------------------------------------------
// The header island's server render
// ------------------------------------------------------------------

describe("the header wiring (fold-in 2)", () => {
  it("renders no badge in the server markup — the island reads storage on the client", () => {
    const header = renderToStaticMarkup(createElement(SiteHeader));
    expect(header).toContain('href="/shortlist"');
    expect(header).not.toContain("shortlist-count");
  });

  it("the add control's server render is the unsaved state, with no full message", () => {
    const markup = renderToStaticMarkup(createElement(ShortlistButton, { card: makeCard("a") }));
    expect(markup).toContain("Shortlist this home");
    expect(markup).not.toContain("Your shortlist is full");
    expect(markup).toContain('aria-pressed="false"');
  });
});

// ------------------------------------------------------------------
// The sample-parity pins (shortlist sample-parity fix,
// 18 Nov 2026): Final Sample Master views 14–16 against the
// product page. The island's states resolve client-side, so
// the per-state forms are pinned at the source and the
// stylesheet, and proven live in e2e/shortlist.e2e.ts.
// ------------------------------------------------------------------

describe("the sample-parity forms (views 14–16)", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
  const css = read("app/globals.css");
  const island = read("components/ShortlistPage.tsx");
  const shell = read("app/shortlist/page.tsx");

  it("pins the lead as the sample's one sentence, with no first sentence anywhere", () => {
    expect(SHORTLIST_LEAD_LINE).toBe(
      "Nothing about which homes you are considering is stored on any server.",
    );
    // The lead's old first sentence ("The homes you've
    // saved, side by side.") is gone from both files — the
    // shell's metadata line and the compare heading keep
    // their own "side by side" forms, neither of them the
    // lead's sentence.
    expect(island).not.toContain("side by side.");
    expect(shell).not.toContain("side by side.");
    expect(shell).not.toContain("Nothing about which homes");
  });

  it("keeps the lead out of the server shell — the island serves it per state", () => {
    expect(shell).not.toContain("shortlist-lead");
    expect(island).toContain("SHORTLIST_LEAD_LINE");
    expect(island).toContain("<ShortlistHead lead={false} />");
    expect(island).toContain("<ShortlistHead lead />");
  });

  it("frames the page on Cream, scoped to the shortlist surface", () => {
    const frame = css.match(/\.shortlist-page \{[^}]*\}/)?.[0] ?? "";
    expect(frame).toContain("background: var(--cmnh-cream)");
    expect(frame).toContain("border: 1px solid var(--colour-line-warm)");
    expect(frame).toContain("border-radius: 18px");
    expect(frame).toContain("box-shadow:");
    expect(frame).toContain("max-width: 1080px");
  });

  it("gives the empty state the sample's search card, and only the empty state", () => {
    expect(island).toContain('className="shortlist-search-card"');
    expect(island).toContain("<h2>Check a home</h2>");
    // Item 41 (parity fix batch) built the sample's
    // PLAIN form here; BUG-147 (founder finding,
    // 22 Nov 2026) retired it — the plain form
    // dead-ended on anything it could not resolve.
    // The card now carries the standard PostcodeBox.
    expect(island).toContain("<PostcodeBox bare />");
    expect(island).not.toContain("shortlist-search-form");
    expect(island).not.toContain('action="/search"');
    // The card sits in the empty branch: it is written
    // after the empty section opens and before the ready
    // return's head.
    const emptyAt = island.indexOf('data-shortlist-state="empty"');
    const cardAt = island.indexOf("shortlist-search-card");
    const readyAt = island.indexOf("<ShortlistHead lead />");
    expect(emptyAt).toBeGreaterThan(-1);
    expect(cardAt).toBeGreaterThan(emptyAt);
    expect(readyAt).toBeGreaterThan(cardAt);
    const card = css.match(/\.shortlist-search-card \{[^}]*\}/)?.[0] ?? "";
    expect(card).toContain("background: var(--cmnh-white)");
    expect(card).toContain("border: 1px solid var(--colour-line-warm)");
    expect(card).toContain("border-radius: 16px");
    expect(card).toContain("padding: 1.6rem 1.7rem");
    expect(card).toContain("max-width: 640px");
    expect(card).toContain("margin-top: 1.8rem");
    // The plain form's CSS rules retired with it.
    expect(css).not.toMatch(/\.shortlist-search-form \{/);
    expect(css).not.toMatch(/\.shortlist-search-form input/);
  });

  it("BUG-304: the tiles row is gone — no cards grid, no card rules anywhere", () => {
    // The founder's ruling, 25 Nov 2026: the tiles row
    // goes away and each home's card content moves into
    // its column's header cell, so the page has one grid
    // and alignment holds by construction. The assertion
    // names the tiles row's class, not the bare
    // substring: BUG-309's refresh fetches from
    // /api/shortlist-card, and the endpoint's name is
    // not a tiles row.
    expect(island).not.toContain('className="shortlist-card');
    expect(island).not.toContain("shortlist-card__");
    expect(css).not.toContain(".shortlist-card");
  });

  it("BUG-304: the header cell is the card — blank first cell, sale line and Remove in each column's header", () => {
    expect(island).toContain('<span className="visually-hidden">Check</span>');
    // The header carries the card's sale line and Remove:
    // the sale line's class stands in the island (the
    // shared CompareColumnHead) and its dress in the
    // stylesheet.
    expect(island).toContain("compare-table__sale");
    expect(island).toContain("CompareColumnHead");
    const sale = css.match(/\.compare-table__sale \{[^}]*\}/)?.[0] ?? "";
    expect(sale).toContain("font-weight: 600");
    // Item 45 (parity fix batch): the foot row opens with
    // a row header carrying the screen-reader-only
    // "Reports" label, as the sample's table does.
    expect(island).toContain('<th scope="row">');
    expect(island).toContain('<span className="visually-hidden">Reports</span>');
    // The cards are gone with the tiles row, and the
    // stacked blocks carry the sale line in kind.
    expect(island).not.toContain("shortlist-card__sale");
    expect(island).toContain("shortlist-compare__sale");
  });
});
