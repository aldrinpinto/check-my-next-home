import { beforeEach, describe, expect, it } from "vitest";

import type { LoadedAddressParts } from "../lib/address";
import { setEntryLogSink } from "../lib/server/entry-log";
import {
  SUGGEST_PLACE_CAP,
  suggestionsFor,
  type PlaceSuggestion,
  type PropertyQuery,
  type StreetSuggestion,
  type SuggestionSource,
} from "../lib/server/suggestions";
import { buildEntryFixture } from "./fixtures/entry-point";

// M7.15D — place search (founder ruling, 18 Nov 2026):
// a town or place name offers the place in the dropdown
// as a fourth group, Places. Places derive from held
// data only — the picking index's town-as-filed, with
// each district's standing read from the directory's
// LSOA letters, exactly the test the district bundle
// applies — and fuzzy matching is offered AS A CHOICE
// ONLY, as with streets: "Chlemsford" offers Chelmsford,
// never a silent substitution, and submitting without a
// pick never applies it.
//
// The pick's behaviour (founder ruling, 19 Nov 2026,
// reversing the 18 Nov in-dropdown chooser): a place
// pick NAVIGATES, like a street pick — to the place
// page, which lists the place's districts in full; a
// place serving exactly one district routes straight
// to that district's wider-area page. No districts
// group rides the panel any more, typed in full or
// not: these specs pin the panel holding the place as
// a choice and nothing beneath it.
//
// The world below is a fixture of the widened suggestion
// port, in the street-suggestions fixtures' style: place
// rows at the derived table's grain (migration 0032:
// one row per place + district, with its held postcode
// count), a nation map standing for the directory's LSOA
// letters per district, one street and its homes for the
// group-order pin. Its fuzzy tier is SCRIPTED, exactly
// as the fake Postio scripts its world: the fixture's
// fuzzy truth is that "CHLEMSFORD" is near CHELMSFORD.
// The real pg_trgm values behind that scripting are
// witnessed separately (db/prove.mjs carries the pair
// against a real database: CHLEMSFORD ~ CHELMSFORD =
// 0.4667 against the pinned 0.4 threshold, the nearest
// unrelated real town CHELMSFORD ~ CHELTENHAM = 0.2222).

function norm(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

interface PlaceRow {
  place: string;
  outward: string;
  postcodes: number;
}

// The directory's nation letters per district, as the
// district bundle reads them from its filed postcodes'
// LSOA codes: E/W districts serve the district page;
// S/N districts keep the not-covered form, so the place
// flow never offers them (the plan's honesty rule: a
// place is offered only where we hold its districts).
const NATIONS: Record<string, string> = {
  CM1: "E",
  CM2: "E",
  CM3: "E",
  CM0: "E",
  E1: "E",
  LN1: "E",
  NW1: "E",
  GL51: "E",
  GL52: "E",
  CH1: "E",
  CH2: "E",
  S41: "E",
  EH1: "S",
  EH2: "S",
};

const PLACE_ROWS: PlaceRow[] = [
  { place: "CHELMSFORD", outward: "CM1", postcodes: 812 },
  { place: "CHELMSFORD", outward: "CM2", postcodes: 640 },
  { place: "CHELMSFORD", outward: "CM3", postcodes: 905 },
  // BUG-323: the same place filed twice — the bare town
  // and the town-with-county — for the merge pin below.
  { place: "CHELMSFORD, ESSEX", outward: "CM1", postcodes: 812 },
  { place: "CHELMSFORD, ESSEX", outward: "CM2", postcodes: 640 },
  { place: "CHELMSFORD, ESSEX", outward: "CM3", postcodes: 905 },
  // BUG-323: the same-word extension witnesses — a
  // place that extends the typed town in the same word,
  // and one that extends it across a word boundary.
  { place: "LONDON", outward: "E1", postcodes: 900 },
  { place: "LONDONTHORPE", outward: "LN1", postcodes: 40 },
  { place: "LONDON BOROUGH OF CAMDEN", outward: "NW1", postcodes: 300 },
  { place: "SOUTHMINSTER", outward: "CM0", postcodes: 210 },
  { place: "CHELTENHAM", outward: "GL51", postcodes: 402 },
  { place: "CHELTENHAM", outward: "GL52", postcodes: 388 },
  { place: "CHESTER", outward: "CH1", postcodes: 355 },
  { place: "CHESTER", outward: "CH2", postcodes: 290 },
  { place: "CHESTERFIELD", outward: "S41", postcodes: 433 },
  // A Scottish place, filed at the same grain: the
  // honesty rule's witness. Its districts are S-letter,
  // so it is never offered.
  { place: "EDINBURGH", outward: "EH1", postcodes: 720 },
  { place: "EDINBURGH", outward: "EH2", postcodes: 310 },
  // Seven one-district places under one prefix — the
  // cap's witnesses.
  ...["ASHBY", "ASHCOTT", "ASHDON", "ASHFIELD", "ASHFORD", "ASHGATE", "ASHWORTH"].map(
    (place, i) => ({ place, outward: `AS${i + 1}`, postcodes: 25 }),
  ),
];
for (let i = 1; i <= 7; i += 1) NATIONS[`AS${i}`] = "E";

const DIRECTORY = [
  ...PLACE_ROWS.flatMap((row) =>
    Array.from({ length: 3 }, (_, i) => `${row.outward} 1A${String.fromCharCode(65 + i)}`),
  ),
  "CM3 2JT",
];

const STREET_UNITS: StreetSuggestion[] = [
  { street: "CHELMSFORD ROAD", town: "CHELMSFORD", postcodes: ["CM3 2JT"], homes: 2 },
];

function home(postcode: string, paon: string, street: string, town: string): LoadedAddressParts {
  return { postcode, paon, saon: null, street, locality: null, town };
}

const HOMES: LoadedAddressParts[] = [
  home("CM3 2JT", "1", "CHELMSFORD ROAD", "CHELMSFORD"),
  home("CM3 2JT", "2", "CHELMSFORD ROAD", "CHELMSFORD"),
];

function servedDistricts(place: string): string[] {
  return PLACE_ROWS.filter((row) => row.place === place)
    .filter((row) => NATIONS[row.outward] === "E" || NATIONS[row.outward] === "W")
    .map((row) => row.outward)
    .sort();
}

function placeUnit(place: string): PlaceSuggestion {
  return { place, districts: servedDistricts(place) };
}

function allUnits(): PlaceSuggestion[] {
  return [...new Set(PLACE_ROWS.map((row) => row.place))]
    .map(placeUnit)
    .filter((unit) => unit.districts.length > 0)
    .sort((a, b) => norm(a.place).localeCompare(norm(b.place)));
}

function prefixMatch(words: string[], placeNorm: string): boolean {
  const tokens = placeNorm.split(" ");
  return words.length <= tokens.length && words.every((word, i) => tokens[i].startsWith(word));
}

function fakeSource(): SuggestionSource {
  return {
    async postcodesByPrefix(prefix, limit) {
      return DIRECTORY.filter((postcode) => postcode.startsWith(prefix))
        .sort()
        .slice(0, limit);
    },
    async addressesInPostcode(postcode) {
      return HOMES.filter((row) => row.postcode === postcode);
    },
    async streetsByPrefix(words, limit) {
      return STREET_UNITS.filter((unit) => prefixMatch(words, norm(unit.street))).slice(0, limit);
    },
    async streetsByFuzzy() {
      return [];
    },
    async propertiesMatching(query: PropertyQuery, limit) {
      return HOMES.filter((parts) => {
        const inPrefix =
          query.postcodePrefix !== null && parts.postcode.startsWith(query.postcodePrefix);
        const inStreet = query.streetPostcodes.some(
          (pair) =>
            pair.postcode === parts.postcode && pair.streetNorm === norm(parts.street ?? ""),
        );
        return inPrefix || inStreet;
      }).slice(0, limit);
    },
    async placesByPrefix(words, limit) {
      return allUnits()
        .filter((unit) => prefixMatch(words, norm(unit.place)))
        .slice(0, limit);
    },
    async placesByFuzzy(words, limit) {
      // The fixture's scripted fuzzy truth (see the
      // header): the transposition is near the one place.
      if (words.join(" ") === "CHLEMSFORD") {
        return allUnits()
          .filter((unit) => unit.place === "CHELMSFORD")
          .slice(0, limit);
      }
      return [];
    },
    async placeDistricts(placeNorm) {
      const unit = allUnits().find((candidate) => norm(candidate.place) === placeNorm);
      return unit ? unit.districts : [];
    },
  };
}

let lines: string[] = [];
beforeEach(() => {
  lines = [];
  setEntryLogSink((line) => lines.push(line));
});

describe("place search — the place pick navigates to the place page", () => {
  it("typing the town offers the place with the place page's route — and no districts group", async () => {
    const result = await suggestionsFor("Chelmsford", fakeSource(), "pl1");
    // This world's Chelmsford Road is a street too, so
    // the Streets and Properties groups serve ahead of
    // the Places group — the same shape the live
    // directory produced for "Birkdale" (M7.15C's deploy
    // round). Behind them the panel holds the place
    // alone: the districts are the place page's
    // business now, not the panel's.
    expect(result.groups.map((group) => group.label)).toEqual(["Streets", "Properties", "Places"]);
    const places = result.groups.find((group) => group.label === "Places")!;
    // The place row: it carries the place page's route
    // (the pick navigates), and the filed name rides in
    // `place` for the submit path's exact-name check.
    expect(places.items).toEqual([
      { label: "Chelmsford", href: "/search?place=Chelmsford", place: "Chelmsford" },
    ]);
    expect(result.groups.find((group) => group.label.startsWith("Districts"))).toBeUndefined();
  });

  it("a part-typed place offers the place — the panel holds the choice and nothing beneath it", async () => {
    const result = await suggestionsFor("Chelms", fakeSource(), "pl2");
    // (Chelmsford Road's street serves on the part-word
    // too — its homes do not: the properties' whole-token
    // rule keeps a part-word from naming a home.)
    expect(result.groups.map((group) => group.label)).toEqual(["Streets", "Places"]);
    const places = result.groups.find((group) => group.label === "Places")!;
    expect(places.items.map((item) => item.label)).toEqual(["Chelmsford"]);
    expect(result.groups.find((group) => group.label.startsWith("Districts"))).toBeUndefined();
  });

  it("a place name typed with its district still serves no districts group ('Chelmsford CM3')", async () => {
    const result = await suggestionsFor("Chelmsford CM3", fakeSource(), "pl3");
    expect(result.groups.find((group) => group.label.startsWith("Districts"))).toBeUndefined();
    const places = result.groups.find((group) => group.label === "Places")!;
    expect(places.items).toEqual([
      { label: "Chelmsford", href: "/search?place=Chelmsford", place: "Chelmsford" },
    ]);
  });

  it("sibling places ride beside the named one — a one-district place routes straight to its district", async () => {
    const result = await suggestionsFor("Chester", fakeSource(), "pl4");
    expect(result.groups.map((group) => group.label)).toEqual(["Places"]);
    // Chester serves two districts, so its pick goes to
    // the place page; Chesterfield serves one (S41), so
    // its pick goes straight to that district's
    // wider-area page — the street pick's one-postcode
    // rule, at district grain.
    expect(result.groups[0].items).toEqual([
      { label: "Chester", href: "/search?place=Chester", place: "Chester" },
      { label: "Chesterfield", href: "/search?outward=S41", place: "Chesterfield" },
    ]);
  });

  it("the Places group caps at five", async () => {
    const result = await suggestionsFor("Ash", fakeSource(), "pl5");
    const places = result.groups.find((group) => group.label === "Places");
    expect(places).toBeDefined();
    expect(places!.items).toHaveLength(SUGGEST_PLACE_CAP);
    expect(SUGGEST_PLACE_CAP).toBe(5);
    expect(places!.items.map((item) => item.label)).toEqual([
      "Ashby",
      "Ashcott",
      "Ashdon",
      "Ashfield",
      "Ashford",
    ]);
  });

  it("a place pick never lands on a home", async () => {
    const result = await suggestionsFor("Chelmsford", fakeSource(), "pl6");
    const places = result.groups.find((group) => group.label === "Places")!;
    for (const item of places.items) {
      expect(item.href ?? "").not.toContain("home=");
      expect(
        item.href!.startsWith("/search?place=") || item.href!.startsWith("/search?outward="),
      ).toBe(true);
    }
  });

  it("the served log counts the place group — and no districts, ever", async () => {
    await suggestionsFor("Chelmsford", fakeSource(), "pl7");
    const served = lines.find((line) => line.includes("event=suggestions.served"));
    expect(served).toContain("places=1");
    expect(served).toContain("districts=0");
    expect(served).toContain("shape=text");
  });
});

describe("place search — fuzzy is a choice, never a substitution", () => {
  it("a misspelling is offered the real place as a choice — the typed text is never served back", async () => {
    const result = await suggestionsFor("Chlemsford", fakeSource(), "pf1");
    expect(result.groups.map((group) => group.label)).toEqual(["Places"]);
    expect(result.groups[0].items).toEqual([
      { label: "Chelmsford", href: "/search?place=Chelmsford", place: "Chelmsford" },
    ]);
    for (const group of result.groups) {
      for (const item of group.items) expect(item.label).not.toContain("Chlemsford");
    }
  });

  it("a fuzzy place's panel holds the choice alone — nothing rides beneath an unpicked place", async () => {
    const result = await suggestionsFor("Chlemsford", fakeSource(), "pf2");
    expect(result.groups.map((group) => group.label)).toEqual(["Places"]);
    expect(result.groups.find((group) => group.label.startsWith("Districts"))).toBeUndefined();
  });
});

describe("place search — the Scotland / NI honesty rule", () => {
  it("a Scottish place is not offered: we hold its districts only in the not-covered form", async () => {
    for (const raw of ["Edinburgh", "Edinburg", "Edin"]) {
      const result = await suggestionsFor(raw, fakeSource(), "ps1");
      expect(result.groups.find((group) => group.label === "Places")).toBeUndefined();
      expect(result.groups.find((group) => group.label.startsWith("Districts"))).toBeUndefined();
    }
  });
});

describe("place search — the group order when every group serves", () => {
  it("Postcodes, Streets, Properties, Places", async () => {
    const result = await suggestionsFor("Chelmsford CM3", fakeSource(), "po1");
    expect(result.groups.map((group) => group.label)).toEqual([
      "Postcodes",
      "Streets",
      "Properties",
      "Places",
    ]);
  });
});

describe("place search — BUG-323: one row per place, no same-word noise", () => {
  it("the bare town and the town-with-county merge into one row, districts unioned", async () => {
    const result = await suggestionsFor("Chelmsford", fakeSource(), "p323a");
    const places = result.groups.find((group) => group.label === "Places")!;
    // The fixture now files Chelmsford twice (bare and
    // "CHELMSFORD, ESSEX", same three districts): the
    // panel names it once, on the bare name, and the
    // served log counts one place, not two.
    expect(places.items).toEqual([
      { label: "Chelmsford", href: "/search?place=Chelmsford", place: "Chelmsford" },
    ]);
    expect(lines.find((line) => line.includes("event=suggestions.served"))).toContain("places=1");
  });

  it("an exactly-typed town drops its same-word extension but keeps the word-boundary one", async () => {
    // BUG-323, Londonthorpe leg — OPEN, not implemented:
    // the blanket same-word rule that would drop
    // Londonthorpe here also drops Chesterfield when
    // "Chester" is typed, against the pinned sibling
    // test above. This test pins the current behaviour
    // (all three ride) so the conflict stays visible
    // until the founder rules on it.
    const result = await suggestionsFor("London", fakeSource(), "p323b");
    const places = result.groups.find((group) => group.label === "Places")!;
    expect(places.items.map((item) => item.label)).toEqual([
      "London",
      "London Borough Of Camden",
      "Londonthorpe",
    ]);
  });

  it("a part-typed town drops nothing — 'Londo' still offers Londonthorpe", async () => {
    const result = await suggestionsFor("Londo", fakeSource(), "p323c");
    const places = result.groups.find((group) => group.label === "Places")!;
    expect(places.items.map((item) => item.label)).toEqual([
      "London",
      "London Borough Of Camden",
      "Londonthorpe",
    ]);
  });
});

describe("place search — against the entry-point fixture's world", () => {
  it("Chelmsford serves as a place pick — its districts (CM1 and CM3 in that world) are the place page's, not the panel's", async () => {
    const fixture = buildEntryFixture();
    const result = await suggestionsFor("Chelmsford", fixture.source, "pw1");
    expect(result.groups.map((group) => group.label)).toEqual(["Places"]);
    expect(result.groups[0].items).toEqual([
      { label: "Chelmsford", href: "/search?place=Chelmsford", place: "Chelmsford" },
    ]);
  });

  it("the fixture's scripted fuzzy offers Chelmsford for the transposition, as a choice", async () => {
    const fixture = buildEntryFixture();
    const result = await suggestionsFor("Chlemsford", fixture.source, "pw2");
    expect(result.groups.map((group) => group.label)).toEqual(["Places"]);
    expect(result.groups[0].items).toEqual([
      { label: "Chelmsford", href: "/search?place=Chelmsford", place: "Chelmsford" },
    ]);
  });
});
