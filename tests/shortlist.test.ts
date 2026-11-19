import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ShortlistButton from "../components/ShortlistButton";
import SiteHeader from "../components/SiteHeader";
import type { AddressResolution } from "../lib/address";
import { homeKeyOf } from "../lib/bundle-cache";
import type { CategoryAnswer, NearbyBundle, NearbyCategory } from "../lib/nearby";
import {
  COMPARISON_ROWS,
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
  comparisonSaleLine,
  emptyShortlistRecord,
  isCardSaved,
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
      line: "no likelihood band is published for this point on the Environment Agency's map of flooding from rivers and the sea",
    }),
    floodLayer({
      layer: "rofsw",
      pointState: "below-lowest-band",
      line: "no surface-water band reaches this point — below the lowest band this product publishes",
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
      places: [{ name: "Birkdale Primary School", miles: 0.42, detail: null }],
      countWithin: 1,
    }),
    category({
      category: "schools-secondary",
      places: [{ name: "The Boswells School", miles: 1.1, detail: null }],
      countWithin: 1,
      nearestSelective: null,
      nearestSelectiveLine: "No — none in Braintree",
    }),
    category({ category: "nurseries", line: "no nursery filed near", state: "empty" }),
    category({
      category: "gp",
      places: [],
      beyondNearest: { name: "Birkdale Surgery", miles: 1.9 },
      state: "none-within",
      line: "no GP surgery within 1 mile; the nearest is Birkdale Surgery, 1.9 miles away",
    }),
    category({
      category: "ae",
      places: [{ name: "Broomfield Hospital", miles: 5.89, detail: null }],
      countWithin: 1,
    }),
    category({
      category: "station",
      places: [{ name: "Chelmsford", miles: 2.31, detail: null }],
      countWithin: 1,
    }),
    category({
      category: "vets",
      places: [{ name: "Birkdale Vets", miles: 0.87, detail: null }],
      countWithin: 1,
    }),
  ]);
}

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
      "Nearest primary",
      "Nearest secondary",
      "Grammar school nearby",
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
    expect(card?.comparison.nursery).toEqual({ kind: "line", text: "no nursery filed near" });
    // The real cells (founder's ruling, 17 Nov 2026): the
    // flood line derives both bands through the results
    // layer's mapping — the fabricated absence states
    // (rofrs "no-band-published", rofsw
    // "below-lowest-band") are the Very-low case, exactly
    // as on the results page; the crime line is the served
    // 12-month count.
    expect(card?.comparison.flood).toEqual({
      kind: "line",
      text: "Rivers & sea: Very low · Surface water: Very low",
    });
    expect(card?.comparison.crime).toEqual({ kind: "line", text: "330 crimes" });
    expect(card?.comparison.councilTax).toEqual({
      kind: "line",
      text: "Band D averages £2,280.36 a year",
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
    expect(card?.comparison.flood).toEqual({
      kind: "line",
      text: "Rivers & sea: Very low · Surface water: Low",
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

    // A layer whose data is not filed serves no band: the
    // cell carries that layer's own line, not a band.
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
      kind: "line",
      text: "we have not yet filed the surface-water data for this postcode",
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
        soldPrices: { state: "unavailable", reason: "sold prices need an exact postcode" },
        crime: { state: "unavailable", reason: "crime counts need an exact postcode" },
        nearby: { state: "unavailable", reason: "distances need an exact postcode" },
        flood: { state: "unavailable", reason: "flood answers need an exact postcode" },
        councilTax: { state: "unavailable", reason: "council tax needs an exact postcode" },
      },
    } as unknown as ShortBundle;
    const card = buildShortlistCard({ resolution, short });
    expect(card?.id).toBe("r3:E16");
    expect(card?.postcode).toBe("E16");
    expect(card?.homeKey).toBeNull();
    expect(card?.addressLine).toBe("Wider area — E16, not this exact home");
    expect(card?.lastSale).toBeNull();
    expect(card?.factsLine).toBe(
      "sold prices need an exact postcode • crime counts need an exact postcode",
    );
    expect(card?.comparison.station).toEqual({
      kind: "line",
      text: "distances need an exact postcode",
    });
    expect(card?.comparison.flood).toEqual({
      kind: "line",
      text: "flood answers need an exact postcode",
    });
    expect(card?.comparison.councilTax).toEqual({
      kind: "line",
      text: "council tax needs an exact postcode",
    });
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
    // Item 41 (parity fix batch): the card's form is the
    // sample's PLAIN form — a text input and a brass submit,
    // no PostcodeBox (no suggestions, no picker behaviour).
    expect(island).toContain('className="shortlist-search-form"');
    expect(island).toContain('action="/search"');
    expect(island).toContain('name="postcode"');
    // The field carries the one shared placeholder
    // constant (founder ruling, 19 Nov 2026); its text is
    // pinned in tests/home-page.test.ts.
    expect(island).toContain("placeholder={POSTCODE_BOX_PLACEHOLDER}");
    expect(island).toContain("Check this home");
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
    // The sample's row measures, inside this card only.
    expect(css).toMatch(/\.shortlist-search-form input \{[^}]*min-height: 52px/);
    expect(css).toMatch(/\.shortlist-search-form input \{[^}]*border-radius: 10px/);
    expect(css).toMatch(/\.shortlist-search-form__button \{[^}]*min-height: 52px/);
  });

  it("runs the three-across cards at the frame's full width", () => {
    const three = css.match(/\.shortlist-cards--three \{[^}]*\}/)?.[0] ?? "";
    expect(three).toContain("max-width: none");
    // The one/two-across column cap stands.
    const base = css.match(/\.shortlist-cards \{[^}]*\}/)?.[0] ?? "";
    expect(base).toContain("max-width: 820px");
  });

  it("blanks the compare table's first header cell and drops the header sale line", () => {
    expect(island).toContain('<span className="visually-hidden">Check</span>');
    expect(island).not.toContain("compare-table__sale");
    expect(css).not.toContain(".compare-table__sale");
    // Item 45 (parity fix batch): the foot row opens with
    // a row header carrying the screen-reader-only
    // "Reports" label, as the sample's table does.
    expect(island).toContain('<th scope="row">');
    expect(island).toContain('<span className="visually-hidden">Reports</span>');
    // The cards keep their sale line; item 44 drops the
    // phone (stacked) form's extra sale line — the wide
    // table already omitted it.
    expect(island).toContain("shortlist-card__sale");
    expect(island).not.toContain("shortlist-compare__sale");
  });
});
