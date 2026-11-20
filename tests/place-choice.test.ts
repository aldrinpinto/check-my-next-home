import { describe, expect, it } from "vitest";

import { createPlaceSource, type PlaceQueryable } from "../lib/server/places";
import { placeChoiceUrl } from "../lib/server/serve";

// The bare-place-name route (founder fix batch, 19 Nov
// 2026; Regression run 44535680408 follow-up; the
// destination ruled again the same day).
//
// placeChoiceUrl answers the serve layer's question —
// "is this unplaceable input exactly a known place?" —
// with the place page's URL. As built in the fix batch
// the destination was the landing page carrying the
// place's name (the box filed it and its panel opened
// on the districts); the founder's later ruling of
// 19 Nov 2026 — places behave like streets — moved it
// to the place page (lib/journey.ts's placeChoiceRoute),
// and the function was renamed with its destination.
// The route is contracted for the place's DISPLAY form,
// the form the dropdown names the pick by
// ("Chelmsford"); the place read model files the name
// as-filed ("CHELMSFORD"). The composition originally
// passed the filed form through, so the redirect
// carried "?place=CHELMSFORD" and the raw register
// casing stood in front of the visitor — the failure
// e2e/suggest.e2e.ts's bare-name spec caught. This test
// pins the composition at the serve layer, against a
// capturing fake of the place source's port in the
// district-source tests' style.

interface PlaceUnitRow {
  place_norm: string;
  place_display: string;
  districts: string[];
}

class FakePlacesDb {
  queries: { text: string; params: readonly unknown[] }[] = [];
  rows: PlaceUnitRow[] = [];

  async query(text: string, params: readonly unknown[] = []) {
    this.queries.push({ text, params });
    if (text.includes("FROM picking_places")) return { rows: this.rows };
    throw new Error(`FakePlacesDb: unhandled SQL: ${text}`);
  }

  async connect(): Promise<never> {
    throw new Error("FakePlacesDb: the exact-name read never opens a transaction");
  }
}

function chelmsfordDb(): FakePlacesDb {
  const db = new FakePlacesDb();
  db.rows = [{ place_norm: "CHELMSFORD", place_display: "CHELMSFORD", districts: ["CM1", "CM3"] }];
  return db;
}

describe("placeChoiceUrl — the display form reaches the route", () => {
  it("a bare place name lands on /search?place= with the display casing", async () => {
    const db = chelmsfordDb();
    await expect(placeChoiceUrl("Chelmsford", db as unknown as PlaceQueryable)).resolves.toBe(
      "/search?place=Chelmsford",
    );
    // The read is exact-norm equality on the filed form.
    expect(db.queries).toHaveLength(1);
    expect(db.queries[0].params).toEqual(["CHELMSFORD"]);
  });

  it("the typed casing does not matter — the filed place's display form answers", async () => {
    const db = chelmsfordDb();
    await expect(placeChoiceUrl("chelmsford", db as unknown as PlaceQueryable)).resolves.toBe(
      "/search?place=Chelmsford",
    );
  });

  it("an unknown name answers null", async () => {
    const db = new FakePlacesDb();
    await expect(placeChoiceUrl("Nowheresville", db as unknown as PlaceQueryable)).resolves.toBe(
      null,
    );
  });

  it("a place whose districts are all not-covered answers null", async () => {
    const db = new FakePlacesDb();
    db.rows = [{ place_norm: "EDINBURGH", place_display: "EDINBURGH", districts: [] }];
    await expect(placeChoiceUrl("Edinburgh", db as unknown as PlaceQueryable)).resolves.toBe(null);
  });

  it("an input carrying a postcode is never a place pick — and is never read as one", async () => {
    const db = chelmsfordDb();
    await expect(placeChoiceUrl("CM3 2JT", db as unknown as PlaceQueryable)).resolves.toBe(null);
    expect(db.queries).toHaveLength(0);
  });
});

describe("districtAreas — the place page's per-district area facts (BUG-026/BUG-027)", () => {
  // The read composes, per district, the cleaned
  // settlements the district page itself would name
  // (localities first, towns as the fallback — the
  // district bundle's own rule) and one filed postcode
  // in the district for the bridge line's example. The
  // fake answers the read's counted queries by their
  // shapes.
  class FakeAreasDb {
    localityRows: { outward: string; locality: string; filings: number }[] = [];
    townRows: { outward: string; town: string; filings: number }[] = [];
    indexRows: { outward: string; town: string; filings: number }[] = [];
    countyRows: { outward: string; county: string }[] = [];
    nationalCountyRows: { county: string }[] = [];
    exampleRows: { outward: string; postcode: string }[] = [];

    async query(text: string) {
      if (text.includes("min(postcode)")) return { rows: this.exampleRows };
      // The read's two county queries: the districts'
      // own (keyed by outward, through split_part) and
      // the register-wide set (no outward in it).
      if (text.includes("county")) {
        return { rows: text.includes("split_part") ? this.countyRows : this.nationalCountyRows };
      }
      if (text.includes("FROM picking_index")) return { rows: this.indexRows };
      if (text.includes("locality")) return { rows: this.localityRows };
      if (text.includes("FROM price_paid")) return { rows: this.townRows };
      throw new Error(`FakeAreasDb: unhandled SQL: ${text}`);
    }

    async connect(): Promise<never> {
      throw new Error("FakeAreasDb: the areas read never opens a transaction");
    }
  }

  it("cleans and sorts each district's settlements, localities before towns", async () => {
    const db = new FakeAreasDb();
    db.localityRows = [
      { outward: "CM3", locality: "HATFIELD PEVEREL", filings: 5 },
      { outward: "CM3", locality: "DANBURY", filings: 3 },
    ];
    db.townRows = [
      { outward: "CM3", town: "CHELMSFORD", filings: 8 },
      { outward: "CM1", town: "CHELMSFORD", filings: 6 },
    ];
    db.indexRows = [{ outward: "CM1", town: "CHELMSFORD", filings: 4 }];
    db.exampleRows = [{ outward: "CM3", postcode: "CM3 2JT" }];
    const areas = await createPlaceSource(db as unknown as PlaceQueryable).districtAreas([
      "CM1",
      "CM3",
    ]);
    expect(areas).toEqual([
      // No localities filed: the towns stand (the
      // district bundle's fallback), display-cased.
      { outward: "CM1", settlements: ["Chelmsford"], examplePostcode: null },
      {
        outward: "CM3",
        settlements: ["Danbury", "Hatfield Peverel"],
        examplePostcode: "CM3 2JT",
      },
    ]);
  });

  it("cleans the register's spelling variants and county forms (BUG-034)", async () => {
    // The parity re-check's CM1 witness through this
    // read: the county and its fragment drop, the
    // misspelling collapses into the most-filed form.
    const db = new FakeAreasDb();
    db.localityRows = [
      { outward: "CM1", locality: "CHELMSFORD", filings: 900 },
      { outward: "CM1", locality: "CHEMLSFORD", filings: 2 },
      { outward: "CM1", locality: "ESS", filings: 1 },
      { outward: "CM1", locality: "ESSEX", filings: 3 },
      { outward: "CM1", locality: "SPRINGFIELD", filings: 60 },
    ];
    db.countyRows = [{ outward: "CM1", county: "ESSEX" }];
    db.exampleRows = [{ outward: "CM1", postcode: "CM1 1AA" }];
    const areas = await createPlaceSource(db as unknown as PlaceQueryable).districtAreas(["CM1"]);
    expect(areas).toEqual([
      { outward: "CM1", settlements: ["Chelmsford", "Springfield"], examplePostcode: "CM1 1AA" },
    ]);
  });

  it("drops the county where the district files none of its own (BUG-034 residual)", async () => {
    // The live CM11 shape (20 Nov 2026): the picking
    // index files ESSEX as a town, upper case, and the
    // district's own county rows are EMPTY — the drop
    // has to come from the register-wide county set,
    // which files the name in title case.
    const db = new FakeAreasDb();
    db.indexRows = [
      { outward: "CM11", town: "BILLERICAY", filings: 700 },
      { outward: "CM11", town: "CHELMSFORD", filings: 200 },
      { outward: "CM11", town: "DOWNHAM", filings: 40 },
      { outward: "CM11", town: "ESSEX", filings: 24 },
    ];
    db.nationalCountyRows = [{ county: "Essex" }];
    const areas = await createPlaceSource(db as unknown as PlaceQueryable).districtAreas(["CM11"]);
    expect(areas).toEqual([
      {
        outward: "CM11",
        settlements: ["Billericay", "Chelmsford", "Downham"],
        examplePostcode: null,
      },
    ]);
  });

  it("an empty district set reads nothing and answers nothing", async () => {
    const db = new FakeAreasDb();
    await expect(
      createPlaceSource(db as unknown as PlaceQueryable).districtAreas([]),
    ).resolves.toEqual([]);
  });
});
