import { describe, expect, it } from "vitest";

import type { PlaceQueryable } from "../lib/server/places";
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
