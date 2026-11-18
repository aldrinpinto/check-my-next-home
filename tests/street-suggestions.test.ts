import { beforeEach, describe, expect, it } from "vitest";

import type { LoadedAddressParts } from "../lib/address";
import { setEntryLogSink } from "../lib/server/entry-log";
import {
  SUGGEST_PROPERTY_CAP,
  SUGGEST_STREET_CAP,
  suggestionsFor,
  type PropertyQuery,
  type StreetSuggestion,
  type SuggestionSource,
} from "../lib/server/suggestions";

// M7.15C — street suggestions, the three-group dropdown
// and the E161G fragment fix (founder rulings, 18 Nov
// 2026; the street prep adopted in full the same day).
//
// The world below is a fixture of the widened suggestion
// port, in the entry-point fixtures' style: a directory,
// a street table (the grain migration 0031 derives from
// the picking index: one row per street + postcode, with
// its town and home count) and the union's homes. Its
// fuzzy tier is SCRIPTED, exactly as the fake Postio
// scripts its world: the fixture's fuzzy truth is that
// "BUGDALE RISE" is near BIRKDALE RISE. The real pg_trgm
// values behind that scripting are witnessed separately
// (db/prove.mjs carries the pair against a real database:
// similarity 0.5000 against the pinned 0.4 threshold,
// unrelated names at 0.23 or below).

function norm(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

interface StreetRow {
  street: string;
  town: string | null;
  postcode: string;
  homes: number;
}

const E16_LETTERS = [
  "A",
  "B",
  "D",
  "E",
  "F",
  "G",
  "H",
  "J",
  "L",
  "N",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "W",
  "X",
  "Y",
  "Z",
];
const E16_1G = E16_LETTERS.map((letter) => `E16 1G${letter}`);

const DIRECTORY = [...E16_1G, "CM3 2JT", "CM3 2JU", "CM1 6ER", "EX1 1AA"];

const STREET_ROWS: StreetRow[] = [
  { street: "BIRKDALE RISE", town: "CHELMSFORD", postcode: "CM3 2JT", homes: 30 },
  { street: "BIRKDALE RISE", town: "CHELMSFORD", postcode: "CM3 2JU", homes: 3 },
  { street: "GEORGE HEARD CRESCENT", town: "CHELMSFORD", postcode: "CM1 6ER", homes: 49 },
  { street: "HIGH STREET", town: "EXETER", postcode: "EX1 1AA", homes: 4 },
  { street: "EXETER ROAD", town: "LONDON", postcode: "E16 1GN", homes: 10 },
];

function home(postcode: string, paon: string, street: string, town: string): LoadedAddressParts {
  return { postcode, paon, saon: null, street, locality: null, town };
}

const HOMES: LoadedAddressParts[] = [
  ...Array.from({ length: 30 }, (_, i) =>
    home("CM3 2JT", String(i + 1), "BIRKDALE RISE", "CHELMSFORD"),
  ),
  ...Array.from({ length: 3 }, (_, i) =>
    home("CM3 2JU", String(i + 31), "BIRKDALE RISE", "CHELMSFORD"),
  ),
  ...Array.from({ length: 10 }, (_, i) => home("E16 1GN", String(i + 1), "EXETER ROAD", "LONDON")),
  ...Array.from({ length: 49 }, (_, i) =>
    home("CM1 6ER", String(2 * i + 1), "GEORGE HEARD CRESCENT", "CHELMSFORD"),
  ),
  ...Array.from({ length: 4 }, (_, i) => home("EX1 1AA", String(i + 1), "HIGH STREET", "EXETER")),
];

function streetUnit(rows: StreetRow[]): StreetSuggestion {
  return {
    street: rows[0].street,
    town: rows[0].town,
    postcodes: rows.map((row) => row.postcode).sort(),
    homes: rows.reduce((sum, row) => sum + row.homes, 0),
  };
}

function units(): StreetSuggestion[] {
  const byKey = new Map<string, StreetRow[]>();
  for (const row of STREET_ROWS) {
    const key = `${norm(row.street)}|${norm(row.town ?? "")}`;
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }
  return [...byKey.values()].map(streetUnit);
}

function prefixMatch(words: string[], streetNorm: string): boolean {
  const tokens = streetNorm.split(" ");
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
      return units()
        .filter((unit) => prefixMatch(words, norm(unit.street)))
        .sort((a, b) => norm(a.street).localeCompare(norm(b.street)))
        .slice(0, limit);
    },
    async streetsByFuzzy(words, limit) {
      // The fixture's scripted fuzzy truth (see the
      // header): the misspelling is near the one street.
      if (words.join(" ") === "BUGDALE RISE") {
        return units()
          .filter((unit) => unit.street === "BIRKDALE RISE")
          .slice(0, limit);
      }
      return [];
    },
    async propertiesMatching(query: PropertyQuery, limit) {
      // Candidates inside the bound only — the word
      // filter, dedupe, order and cap are the read
      // model's own (suggestionsFor), as against the
      // real source.
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
    // This world's places (M7.15D): its towns stand in
    // the street rows' towns — Chelmsford (CM1/CM3
    // districts in this world's directory letters) and
    // Exeter (EX1). The place specs live in
    // tests/place-suggestions.test.ts; these reads keep
    // this world's source honest at the widened port.
    async placesByPrefix(words, limit) {
      const districtsByPlace = new Map<string, Set<string>>();
      for (const row of STREET_ROWS) {
        if (!row.town) continue;
        const outward = row.postcode.split(" ")[0];
        const districts = districtsByPlace.get(row.town) ?? new Set<string>();
        districts.add(outward);
        districtsByPlace.set(row.town, districts);
      }
      return [...districtsByPlace.entries()]
        .map(([place, districts]) => ({ place, districts: [...districts].sort() }))
        .filter((unit) => prefixMatch(words, norm(unit.place)))
        .slice(0, limit);
    },
    async placesByFuzzy() {
      return [];
    },
    async placeDistricts(placeNorm) {
      const districtsByPlace = new Map<string, Set<string>>();
      for (const row of STREET_ROWS) {
        if (!row.town) continue;
        const outward = row.postcode.split(" ")[0];
        const districts = districtsByPlace.get(row.town) ?? new Set<string>();
        districts.add(outward);
        districtsByPlace.set(row.town, districts);
      }
      for (const [place, districts] of districtsByPlace) {
        if (norm(place) === placeNorm) return [...districts].sort();
      }
      return [];
    },
  };
}

let lines: string[] = [];
beforeEach(() => {
  lines = [];
  setEntryLogSink((line) => lines.push(line));
});

describe("the E161G fix — a fragment serves its complete matching set", () => {
  it("all twenty E16 1G* postcodes are served, E16 1GN among them — no cut at 8", async () => {
    // The deploy-round finding (18 Nov 2026): against the
    // complete national directory, "E161G" matches twenty
    // live postcodes and the old fragment cap of 8 cut
    // E16 1GN out alphabetically — a typed fragment made a
    // real postcode unreachable. The fragment now rides
    // the D71 pattern: the complete set, scrollable.
    for (const raw of ["E161", "E161G"]) {
      const result = await suggestionsFor(raw, fakeSource(), "f1");
      const postcodes = result.groups.find((group) => group.label === "Postcodes");
      expect(postcodes).toBeDefined();
      expect(postcodes!.items).toHaveLength(20);
      expect(postcodes!.items.map((item) => item.label)).toEqual(E16_1G);
      expect(postcodes!.items.map((item) => item.label)).toContain("E16 1GN");
    }
  });
});

describe("street suggestions — pick from a list, never a guess", () => {
  it("a street name offers the street with its town; a street spanning postcodes goes to the choice", async () => {
    const result = await suggestionsFor("Birkdale Rise", fakeSource(), "s1");
    const streets = result.groups.find((group) => group.label === "Streets");
    expect(streets).toBeDefined();
    expect(streets!.items).toEqual([
      { label: "Birkdale Rise, Chelmsford", href: "/search?street=Birkdale+Rise&town=Chelmsford" },
    ]);
    // No postcode fragment was typed, so no Postcodes
    // group — and the group order is the ruling's:
    // Postcodes, Streets, Properties.
    expect(result.groups.map((group) => group.label)).toEqual(["Streets", "Properties"]);
  });

  it("a street in one postcode goes straight to that postcode's check, narrowed to the street", async () => {
    const result = await suggestionsFor("George Heard Crescent", fakeSource(), "s2");
    const streets = result.groups.find((group) => group.label === "Streets");
    expect(streets!.items).toEqual([
      {
        label: "George Heard Crescent, Chelmsford",
        href: "/search?postcode=CM1+6ER&street=GEORGE+HEARD+CRESCENT",
      },
    ]);
  });

  it("a part-typed street still prefix-matches ('Birkdale' finds Birkdale Rise)", async () => {
    const result = await suggestionsFor("Birkdale", fakeSource(), "s3");
    const streets = result.groups.find((group) => group.label === "Streets");
    expect(streets!.items.map((item) => item.label)).toEqual(["Birkdale Rise, Chelmsford"]);
  });

  it("street words survive an outward typed with them ('Birkdale Rise CM3')", async () => {
    const result = await suggestionsFor("Birkdale Rise CM3", fakeSource(), "s4");
    expect(result.groups.map((group) => group.label)).toEqual([
      "Postcodes",
      "Streets",
      "Properties",
    ]);
    const streets = result.groups.find((group) => group.label === "Streets");
    expect(streets!.items.map((item) => item.label)).toEqual(["Birkdale Rise, Chelmsford"]);
  });

  it("a misspelling is offered the real street as a choice — the typed text is never served back", async () => {
    const result = await suggestionsFor("Bugdale Rise", fakeSource(), "s5");
    const streets = result.groups.find((group) => group.label === "Streets");
    expect(streets).toBeDefined();
    expect(streets!.items).toEqual([
      { label: "Birkdale Rise, Chelmsford", href: "/search?street=Birkdale+Rise&town=Chelmsford" },
    ]);
    for (const group of result.groups) {
      for (const item of group.items) expect(item.label).not.toContain("Bugdale");
    }
  });

  it("fuzzy rows sit below exact rows, deduplicated, inside the group cap", async () => {
    const exact: StreetSuggestion = {
      street: "BIRKDALE RISE",
      town: "CHELMSFORD",
      postcodes: ["CM3 2JT"],
      homes: 30,
    };
    const near: StreetSuggestion = {
      street: "BROOKDALE RISE",
      town: "CHELMSFORD",
      postcodes: ["CM3 2JU"],
      homes: 3,
    };
    const source: SuggestionSource = {
      ...fakeSource(),
      async streetsByPrefix() {
        return [exact];
      },
      async streetsByFuzzy() {
        return [near, exact];
      },
    };
    const result = await suggestionsFor("Birkdale Rise", source, "s6");
    const streets = result.groups.find((group) => group.label === "Streets");
    expect(streets!.items.map((item) => item.label)).toEqual([
      "Birkdale Rise, Chelmsford",
      "Brookdale Rise, Chelmsford",
    ]);
  });

  it("the Streets group caps at five", async () => {
    const many: StreetSuggestion[] = Array.from({ length: 7 }, (_, i) => ({
      street: `BIRK${i} ROAD`,
      town: "CHELMSFORD",
      postcodes: ["CM3 2JT"],
      homes: 1,
    }));
    const source: SuggestionSource = {
      ...fakeSource(),
      async streetsByPrefix(_words, limit) {
        return many.slice(0, limit);
      },
      async streetsByFuzzy() {
        return [];
      },
    };
    const result = await suggestionsFor("Birk", source, "s7");
    const streets = result.groups.find((group) => group.label === "Streets");
    expect(streets!.items).toHaveLength(SUGGEST_STREET_CAP);
    expect(SUGGEST_STREET_CAP).toBe(5);
  });

  it("a street pick never lands on a home", async () => {
    for (const raw of ["Birkdale Rise", "George Heard Crescent", "Bugdale Rise"]) {
      const result = await suggestionsFor(raw, fakeSource(), "s8");
      const streets = result.groups.find((group) => group.label === "Streets");
      for (const item of streets!.items) {
        // A street item always carries its route (only a
        // Places item's href is null — M7.15D).
        expect(item.href).not.toBeNull();
        expect(item.href).not.toContain("home=");
        expect(item.href!.startsWith("/search?")).toBe(true);
      }
    }
  });

  it("a street we hold nothing on — a Scottish street name — serves the honest empty", async () => {
    const result = await suggestionsFor("Princes Street", fakeSource(), "s9");
    expect(result.groups).toEqual([]);
  });
});

describe("properties — the fragment's own homes", () => {
  it("by postcode prefix: the first homes of the matched postcodes, in the ruling's order", async () => {
    const result = await suggestionsFor("E161G", fakeSource(), "p1");
    const properties = result.groups.find((group) => group.label === "Properties");
    expect(properties).toBeDefined();
    expect(properties!.items.map((item) => item.label)).toEqual([
      "1 Exeter Road, London, E16 1GN",
      "2 Exeter Road, London, E16 1GN",
      "3 Exeter Road, London, E16 1GN",
      "4 Exeter Road, London, E16 1GN",
      "5 Exeter Road, London, E16 1GN",
    ]);
    expect(properties!.items[0].href).toBe("/search/home?postcode=E16+1GN&home=1%7C%7CEXETER+ROAD");
  });

  it("by address words: a number and a street name find the home itself", async () => {
    const result = await suggestionsFor("19 Birkdale Rise", fakeSource(), "p2");
    const properties = result.groups.find((group) => group.label === "Properties");
    expect(properties!.items).toEqual([
      {
        label: "19 Birkdale Rise, Chelmsford, CM3 2JT",
        href: "/search/home?postcode=CM3+2JT&home=19%7C%7CBIRKDALE+RISE",
      },
    ]);
  });

  it("the Properties group caps at five, ordered by postcode then natural address order", async () => {
    const result = await suggestionsFor("Birkdale Rise", fakeSource(), "p3");
    const properties = result.groups.find((group) => group.label === "Properties");
    expect(properties!.items).toHaveLength(SUGGEST_PROPERTY_CAP);
    expect(properties!.items.map((item) => item.label)).toEqual([
      "1 Birkdale Rise, Chelmsford, CM3 2JT",
      "2 Birkdale Rise, Chelmsford, CM3 2JT",
      "3 Birkdale Rise, Chelmsford, CM3 2JT",
      "4 Birkdale Rise, Chelmsford, CM3 2JT",
      "5 Birkdale Rise, Chelmsford, CM3 2JT",
    ]);
  });
});

describe("the shapes that do not change", () => {
  it("a full postcode still serves its complete Homes list, alone", async () => {
    const result = await suggestionsFor("CM3 2JT", fakeSource(), "u1");
    expect(result.groups.map((group) => group.label)).toEqual(["Homes"]);
    expect(result.groups[0].items).toHaveLength(30);
  });

  it("the served log counts all three fragment groups", async () => {
    await suggestionsFor("Birkdale Rise", fakeSource(), "u2");
    const served = lines.find((line) => line.includes("event=suggestions.served"));
    expect(served).toContain("streets=1");
    expect(served).toContain("homes=5");
    expect(served).toContain("shape=text");
  });
});
