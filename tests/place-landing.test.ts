import { describe, expect, it } from "vitest";

import type { PlaceQueryable } from "../lib/server/places";
import { placeLandingUrl } from "../lib/server/serve";

// The bare-place-name landing route (founder fix batch,
// 19 Nov 2026; Regression run 44535680408 follow-up).
//
// placeLandingUrl answers the serve layer's question —
// "is this unplaceable input exactly a known place?" —
// with the landing URL that files the place. The route
// it builds (lib/journey.ts's placeLandingRoute) is
// contracted for the place's DISPLAY form, the form the
// dropdown files into the field ("Chelmsford"); the
// place read model files the name as-filed
// ("CHELMSFORD"). The composition originally passed the
// filed form through, so the redirect carried
// "?place=CHELMSFORD" and the landing's field stood in
// the raw register casing — the failure
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

describe("placeLandingUrl — the display form reaches the route", () => {
  it("a bare place name lands on /?place= with the display casing", async () => {
    const db = chelmsfordDb();
    await expect(placeLandingUrl("Chelmsford", db as unknown as PlaceQueryable)).resolves.toBe(
      "/?place=Chelmsford",
    );
    // The read is exact-norm equality on the filed form.
    expect(db.queries).toHaveLength(1);
    expect(db.queries[0].params).toEqual(["CHELMSFORD"]);
  });

  it("the typed casing does not matter — the filed place's display form answers", async () => {
    const db = chelmsfordDb();
    await expect(placeLandingUrl("chelmsford", db as unknown as PlaceQueryable)).resolves.toBe(
      "/?place=Chelmsford",
    );
  });

  it("an unknown name answers null", async () => {
    const db = new FakePlacesDb();
    await expect(placeLandingUrl("Nowheresville", db as unknown as PlaceQueryable)).resolves.toBe(
      null,
    );
  });

  it("a place whose districts are all not-covered answers null", async () => {
    const db = new FakePlacesDb();
    db.rows = [{ place_norm: "EDINBURGH", place_display: "EDINBURGH", districts: [] }];
    await expect(placeLandingUrl("Edinburgh", db as unknown as PlaceQueryable)).resolves.toBe(null);
  });

  it("an input carrying a postcode is never a place landing — and is never read as one", async () => {
    const db = chelmsfordDb();
    await expect(placeLandingUrl("CM3 2JT", db as unknown as PlaceQueryable)).resolves.toBe(null);
    expect(db.queries).toHaveLength(0);
  });
});
