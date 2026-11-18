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
// as a fourth group, Places; picking the place (or
// typing its full name) offers its postcode districts
// in the same list, and a district leads to that
// district's wider-area page. Places derive from held
// data only — the picking index's town-as-filed, with
// each district's standing read from the directory's
// LSOA letters, exactly the test the district bundle
// applies — and fuzzy matching is offered AS A CHOICE
// ONLY, as with streets: "Chlemsford" offers Chelmsford,
// never a silent substitution, and submitting without a
// pick never applies it.
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

describe("place search — the place, then its districts", () => {
  it("typing the town offers the place and its districts in the same list (view 25's state)", async () => {
    const result = await suggestionsFor("Chelmsford", fakeSource(), "pl1");
    // This world's Chelmsford Road is a street too, so
    // the Streets and Properties groups serve ahead of
    // the place groups — the same shape the live
    // directory produced for "Birkdale" (M7.15C's deploy
    // round). The place groups land after them, in the
    // order view 25 shows: the place, then its districts.
    expect(result.groups.map((group) => group.label)).toEqual([
      "Streets",
      "Properties",
      "Places",
      "Districts in Chelmsford",
    ]);
    const places = result.groups.find((group) => group.label === "Places")!;
    const districts = result.groups.find((group) => group.label === "Districts in Chelmsford")!;
    // The place row itself: it carries no navigation —
    // its pick expands the panel (the client sets the
    // field to the filed name), so href is null and the
    // filed name rides as the expansion.
    expect(places.items).toEqual([{ label: "Chelmsford", href: null, place: "Chelmsford" }]);
    // The districts, in the picker's list style: each is
    // the wider-area page's route, in district order.
    expect(districts.items).toEqual([
      { label: "CM1 — Chelmsford", href: "/search?outward=CM1" },
      { label: "CM2 — Chelmsford", href: "/search?outward=CM2" },
      { label: "CM3 — Chelmsford", href: "/search?outward=CM3" },
    ]);
  });

  it("a part-typed place offers the place but expands nothing — the districts wait for the full name", async () => {
    const result = await suggestionsFor("Chelms", fakeSource(), "pl2");
    // (Chelmsford Road's street serves on the part-word
    // too — its homes do not: the properties' whole-token
    // rule keeps a part-word from naming a home.)
    expect(result.groups.map((group) => group.label)).toEqual(["Streets", "Places"]);
    const places = result.groups.find((group) => group.label === "Places")!;
    expect(places.items.map((item) => item.label)).toEqual(["Chelmsford"]);
    expect(result.groups.find((group) => group.label.startsWith("Districts"))).toBeUndefined();
  });

  it("a place name typed with its district still expands ('Chelmsford CM3')", async () => {
    const result = await suggestionsFor("Chelmsford CM3", fakeSource(), "pl3");
    const districts = result.groups.find((group) => group.label === "Districts in Chelmsford");
    expect(districts).toBeDefined();
    expect(districts!.items.map((item) => item.label)).toEqual([
      "CM1 — Chelmsford",
      "CM2 — Chelmsford",
      "CM3 — Chelmsford",
    ]);
  });

  it("the named place expands even when a sibling place is served beside it", async () => {
    const result = await suggestionsFor("Chester", fakeSource(), "pl4");
    expect(result.groups.map((group) => group.label)).toEqual(["Places", "Districts in Chester"]);
    expect(result.groups[0].items.map((item) => item.label)).toEqual(["Chester", "Chesterfield"]);
    expect(result.groups[1].items.map((item) => item.label)).toEqual([
      "CH1 — Chester",
      "CH2 — Chester",
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

  it("a district pick leads to the wider-area page — a place pick never lands on a home", async () => {
    const result = await suggestionsFor("Chelmsford", fakeSource(), "pl6");
    const placeGroups = result.groups.filter(
      (group) => group.label === "Places" || group.label.startsWith("Districts"),
    );
    expect(placeGroups.map((group) => group.label)).toEqual(["Places", "Districts in Chelmsford"]);
    for (const group of placeGroups) {
      for (const item of group.items) {
        expect(item.href ?? "").not.toContain("home=");
        if (item.href !== null) expect(item.href.startsWith("/search?outward=")).toBe(true);
      }
    }
  });

  it("the served log counts the place groups", async () => {
    await suggestionsFor("Chelmsford", fakeSource(), "pl7");
    const served = lines.find((line) => line.includes("event=suggestions.served"));
    expect(served).toContain("places=1");
    expect(served).toContain("districts=3");
    expect(served).toContain("shape=text");
  });
});

describe("place search — fuzzy is a choice, never a substitution", () => {
  it("a misspelling is offered the real place as a choice — the typed text is never served back", async () => {
    const result = await suggestionsFor("Chlemsford", fakeSource(), "pf1");
    expect(result.groups.map((group) => group.label)).toEqual(["Places"]);
    expect(result.groups[0].items).toEqual([
      { label: "Chelmsford", href: null, place: "Chelmsford" },
    ]);
    for (const group of result.groups) {
      for (const item of group.items) expect(item.label).not.toContain("Chlemsford");
    }
  });

  it("a fuzzy place expands nothing — the districts wait for a pick, which files the real name", async () => {
    const result = await suggestionsFor("Chlemsford", fakeSource(), "pf2");
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
  it("Postcodes, Streets, Properties, Places, then the named place's districts", async () => {
    const result = await suggestionsFor("Chelmsford CM3", fakeSource(), "po1");
    expect(result.groups.map((group) => group.label)).toEqual([
      "Postcodes",
      "Streets",
      "Properties",
      "Places",
      "Districts in Chelmsford",
    ]);
  });
});

describe("place search — against the entry-point fixture's world", () => {
  it("Chelmsford serves with the districts that world actually holds (CM1 and CM3 — no CM2 is filed there)", async () => {
    const fixture = buildEntryFixture();
    const result = await suggestionsFor("Chelmsford", fixture.source, "pw1");
    expect(result.groups.map((group) => group.label)).toEqual([
      "Places",
      "Districts in Chelmsford",
    ]);
    expect(result.groups[1].items.map((item) => item.label)).toEqual([
      "CM1 — Chelmsford",
      "CM3 — Chelmsford",
    ]);
  });

  it("the fixture's scripted fuzzy offers Chelmsford for the transposition, as a choice", async () => {
    const fixture = buildEntryFixture();
    const result = await suggestionsFor("Chlemsford", fixture.source, "pw2");
    expect(result.groups.map((group) => group.label)).toEqual(["Places"]);
    expect(result.groups[0].items).toEqual([
      { label: "Chelmsford", href: null, place: "Chelmsford" },
    ]);
  });
});
