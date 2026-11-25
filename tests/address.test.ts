import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  canonicalHomeKey,
  classifyAddressInput,
  createAddressSource,
  dedupeAddressParts,
  flatKeyOf,
  headingForHome,
  labelForAddressParts,
  normalisePostcode,
  parsePaon,
  resolveAddressInput,
  type AddressDataSource,
  type DirectoryPostcode,
  type LoadedAddressParts,
} from "../lib/address";

// Guards the brain's front door (plan steps M6.1 + the classifier half
// of M6.11; decisions D6 + D7, ruling D20): typed or pasted input is
// classified onto the four-rung address ladder and resolved against
// LOADED DATA ONLY — the postcode directory and the addresses the
// loaders have filed. Ambiguity always lands on the honest lower rung.
//
// The fake source below is built from the repo's real fixture rows:
// the Land Registry excerpt in tests/fixtures/land-registry (CM3 2JT +
// E16 1GN), the KT17 1FH rows in tests/fixtures/address, and the ONSPD
// excerpt rows for the directory. The live proof against a full-size
// database is the M6.1 rehearsal, not this file.

// ------------------------------------------------------------------
// Fixture plumbing
// ------------------------------------------------------------------

// Quote-aware split for one Price Paid line (every field is quoted; a
// doubled quote inside a field is an escaped quote) — the same shape
// the sold-prices loader parses.
function parsePpdLine(line: string): string[] | null {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] !== '"') return null;
    let value = "";
    i += 1;
    while (i < line.length) {
      if (line[i] === '"') {
        if (line[i + 1] === '"') {
          value += '"';
          i += 2;
        } else {
          i += 1;
          break;
        }
      } else {
        value += line[i];
        i += 1;
      }
    }
    fields.push(value);
    if (line[i] === ",") i += 1;
  }
  return fields;
}

function ppdAddresses(csv: string): LoadedAddressParts[] {
  const rows: LoadedAddressParts[] = [];
  for (const line of csv.split("\n")) {
    if (!line.trim()) continue;
    const f = parsePpdLine(line.replace(/\r$/, ""));
    if (!f || f.length !== 16) continue;
    rows.push({
      postcode: f[3],
      paon: f[7] || null,
      saon: f[8] || null,
      street: f[9] || null,
      locality: f[10] || null,
      town: f[11] || null,
    });
  }
  return rows;
}

function readFixture(...parts: string[]): string {
  return readFileSync(join(process.cwd(), "tests", "fixtures", ...parts), "utf8");
}

const ADDRESSES: LoadedAddressParts[] = [
  ...ppdAddresses(readFixture("land-registry", "pp-complete.csv")),
  ...ppdAddresses(readFixture("address", "kt17-1fh.csv")),
];

// Directory rows: golden facts as locked in tests/README.md and the
// postcode loader's own golden table.
const DIRECTORY = new Map<string, DirectoryPostcode>([
  [
    "CM3 2JT",
    {
      postcode: "CM3 2JT",
      latitude: 51.776176,
      longitude: 0.60387,
      council: "Braintree",
      ward: null,
      region: null,
      lsoaCode: "E01021395",
      msoaCode: "E02004463",
    },
  ],
  [
    "E16 1GN",
    {
      postcode: "E16 1GN",
      latitude: 51.515224,
      longitude: 0.021177,
      council: "Newham",
      ward: null,
      region: null,
      lsoaCode: "E01003511",
      msoaCode: "E02000749",
    },
  ],
  [
    "KT17 1FH",
    {
      postcode: "KT17 1FH",
      latitude: 51.344571,
      longitude: -0.247104,
      council: "Epsom and Ewell",
      ward: "Nonsuch",
      region: null,
      lsoaCode: "E01030396",
      msoaCode: "E02006837",
    },
  ],
  [
    "E1 0AA",
    {
      postcode: "E1 0AA",
      latitude: 51.512498,
      longitude: -0.052071,
      council: null,
      ward: null,
      region: null,
      lsoaCode: "E01004298",
      msoaCode: "E02000885",
    },
  ],
]);

const fakeSource: AddressDataSource = {
  async directoryPostcode(postcode) {
    return DIRECTORY.get(postcode) ?? null;
  },
  async addressesInPostcode(postcode) {
    return ADDRESSES.filter((a) => a.postcode === postcode);
  },
  async districtSummary(outward) {
    const keys = [...DIRECTORY.keys()].filter((pc) => pc.startsWith(`${outward} `));
    return keys.length > 0 ? { postcodeCount: keys.length } : null;
  },
};

// ------------------------------------------------------------------
// Postcode normalisation + the classifier (pure)
// ------------------------------------------------------------------

describe("normalisePostcode", () => {
  it("accepts the canonical form", () => {
    expect(normalisePostcode("CM3 2JT")).toBe("CM3 2JT");
    expect(normalisePostcode("E16 1GN")).toBe("E16 1GN");
    expect(normalisePostcode("KT17 1FH")).toBe("KT17 1FH");
  });

  it("is tolerant of case and spacing", () => {
    expect(normalisePostcode("cm3 2jt")).toBe("CM3 2JT");
    expect(normalisePostcode("CM32JT")).toBe("CM3 2JT");
    expect(normalisePostcode("  e16   1gn ")).toBe("E16 1GN");
    expect(normalisePostcode("kt171fh")).toBe("KT17 1FH");
  });

  it("rejects partials and non-postcodes", () => {
    expect(normalisePostcode("CM3")).toBeNull();
    expect(normalisePostcode("CM3 2")).toBeNull();
    expect(normalisePostcode("Birkdale Rise")).toBeNull();
    expect(normalisePostcode("")).toBeNull();
  });
});

describe("classifyAddressInput", () => {
  it("finds the postcode inside a pasted listing-style string", () => {
    const c = classifyAddressInput("19 Birkdale Rise, Hatfield Peverel, CM3 2JT");
    expect(c.postcode).toBe("CM3 2JT");
    expect(c.outward).toBe("CM3");
    expect(c.partialOnly).toBe(false);
    expect(c.flat).toBeNull();
  });

  it("pulls the flat out of a listing-style string", () => {
    const c = classifyAddressInput("Flat 4, Minerva House, 12 Ceres Crescent, Epsom KT17 1FH");
    expect(c.postcode).toBe("KT17 1FH");
    expect(c.flat).toBe("4");
  });

  it("handles a flat with a postcode and nothing else", () => {
    const c = classifyAddressInput("Flat 4, KT17 1FH");
    expect(c.postcode).toBe("KT17 1FH");
    expect(c.flat).toBe("4");
  });

  it("is tolerant of case and spacing in the postcode", () => {
    expect(classifyAddressInput("6 exeter road, london e161gn").postcode).toBe("E16 1GN");
    expect(classifyAddressInput("6 Exeter Road,  E16   1GN").postcode).toBe("E16 1GN");
  });

  it("reads a bare outward code as a partial postcode", () => {
    for (const raw of ["CM3", "e16", "kt17"]) {
      const c = classifyAddressInput(raw);
      expect(c.postcode).toBeNull();
      expect(c.partialOnly).toBe(true);
      expect(c.outward).toBe(raw.trim().toUpperCase());
    }
  });

  it("reads an outward code with a cut-off inward part as partial", () => {
    const c = classifyAddressInput("CM3 2");
    expect(c.postcode).toBeNull();
    expect(c.partialOnly).toBe(true);
    expect(c.outward).toBe("CM3");
  });

  it("reads a compact partial in a two-digit district, inward begun, as partial", () => {
    // The classifier half of the founder-found suggest
    // bug (18 Nov 2026): the outward token's trailing \b
    // could never match mid-token, so "E161" and "E161G"
    // classified as carrying no outward at all — and the
    // suggestions gate (prefix && input.outward) stayed
    // shut even for a correct prefix. The outward of a
    // compact partial is the district, however much of
    // the inward has been typed after it.
    for (const [raw, outward] of [
      ["E161", "E16"],
      ["E161G", "E16"],
      ["SW1A1", "SW1A"],
      ["e161g", "E16"],
    ] as const) {
      const c = classifyAddressInput(raw);
      expect(c.postcode).toBeNull();
      expect(c.partialOnly).toBe(true);
      expect(c.outward).toBe(outward);
    }
  });

  it("treats a street with no postcode as carrying no location", () => {
    const c = classifyAddressInput("Birkdale Rise, Hatfield Peverel");
    expect(c.postcode).toBeNull();
    expect(c.outward).toBeNull();
    expect(c.partialOnly).toBe(false);
  });

  it("treats empty and placeless input as no location", () => {
    for (const raw of ["", "   ", "a house near the sea"]) {
      const c = classifyAddressInput(raw);
      expect(c.postcode).toBeNull();
      expect(c.outward).toBeNull();
    }
  });
});

describe("address part parsing", () => {
  it("splits a building PAON into name and street number", () => {
    expect(parsePaon("MINERVA HOUSE, 12")).toEqual({ name: "MINERVA HOUSE", number: "12" });
    expect(parsePaon("JUPITER HOUSE, 10")).toEqual({ name: "JUPITER HOUSE", number: "10" });
  });

  it("reads a bare house number PAON", () => {
    expect(parsePaon("19")).toEqual({ name: null, number: "19" });
  });

  it("reads a house name PAON", () => {
    expect(parsePaon("ROSE COTTAGE")).toEqual({ name: "ROSE COTTAGE", number: null });
  });

  it("extracts the flat key from SAONs", () => {
    expect(flatKeyOf("FLAT 4")).toBe("4");
    expect(flatKeyOf("Flat 12A")).toBe("12A");
    expect(flatKeyOf("")).toBeNull();
    expect(flatKeyOf(null)).toBeNull();
  });
});

describe("headingForHome", () => {
  it("joins a label and a postcode with a comma", () => {
    expect(headingForHome("19 Birkdale Rise", "CM3 2JT")).toBe("19 Birkdale Rise, CM3 2JT");
  });

  it("falls back to the postcode alone when the label is empty", () => {
    expect(headingForHome("", "MK10 1AA")).toBe("MK10 1AA");
  });
});

// BUG-308: one home filed in two part-shapes is one
// home — the TR8 4LX picker listed the same home twice
// ("115, Manor Villas Atlantic Reach" beside "115
// Manor Villas", "148 Atlantic Reach Atlantic Reach"
// beside "148 Atlantic Reach").
describe("canonicalHomeKey + dedupeAddressParts — BUG-308", () => {
  function parts(partial: Partial<LoadedAddressParts>): LoadedAddressParts {
    return {
      postcode: "TR8 4LX",
      paon: null,
      saon: null,
      street: "ATLANTIC REACH",
      locality: null,
      town: "NEWQUAY",
      ...partial,
    };
  }

  it("the three part-shapes of 115 Manor Villas share one key", () => {
    const filed = parts({ paon: "MANOR VILLAS", saon: "115" });
    const together = parts({ paon: "115 MANOR VILLAS" });
    const numberAlone = parts({ paon: "115" });
    expect(canonicalHomeKey(filed)).toBe(canonicalHomeKey(together));
    expect(canonicalHomeKey(filed)).toBe(canonicalHomeKey(numberAlone));
    expect(dedupeAddressParts([filed, together, numberAlone])).toHaveLength(1);
  });

  it("a PAON that already carries the street collapses onto the bare number", () => {
    const doubled = parts({ paon: "148 ATLANTIC REACH" });
    const bare = parts({ paon: "148" });
    expect(canonicalHomeKey(doubled)).toBe(canonicalHomeKey(bare));
    expect(dedupeAddressParts([doubled, bare])).toHaveLength(1);
  });

  it("the two Golf Lodges shapes are one home, and a street-less twin absorbs into it", () => {
    const withStreet = parts({ paon: "GOLF LODGES", saon: "1" });
    const together = parts({ paon: "1 GOLF LODGES" });
    const streetless = parts({ paon: "1 GOLF LODGES", street: null });
    expect(dedupeAddressParts([withStreet, together, streetless])).toHaveLength(1);
  });

  it("distinct homes stay distinct — two unnumbered cottages, two flats, a house beside its flat", () => {
    const rose = parts({ paon: "ROSE COTTAGE", street: "HIGH STREET" });
    const ivy = parts({ paon: "IVY COTTAGE", street: "HIGH STREET" });
    const flat4 = parts({ paon: "MINERVA HOUSE, 12", saon: "FLAT 4", street: "CERES CRESCENT" });
    const flat5 = parts({ paon: "MINERVA HOUSE, 12", saon: "FLAT 5", street: "CERES CRESCENT" });
    const house15 = parts({ paon: "15", street: "HIGH STREET" });
    const flat15 = parts({ paon: "Y HOUSE, 20", saon: "FLAT 15", street: "HIGH STREET" });
    expect(dedupeAddressParts([rose, ivy, flat4, flat5, house15, flat15])).toHaveLength(6);
  });

  it("a street-less row stays where two streets both hold its number", () => {
    const oneA = parts({ paon: "1", street: "ATLANTIC REACH" });
    const oneB = parts({ paon: "1", street: "MANOR VILLAS" });
    const streetless = parts({ paon: "1", street: null });
    expect(dedupeAddressParts([oneA, oneB, streetless])).toHaveLength(3);
  });

  it("labels: a bare-number SAON takes no comma, and a street is never doubled", () => {
    expect(labelForAddressParts(parts({ paon: "MANOR VILLAS", saon: "115" }))).toBe(
      "115 Manor Villas Atlantic Reach",
    );
    expect(labelForAddressParts(parts({ paon: "148 ATLANTIC REACH" }))).toBe("148 Atlantic Reach");
    expect(labelForAddressParts(parts({ paon: "1 GOLF LODGES" }))).toBe(
      "1 Golf Lodges Atlantic Reach",
    );
    // A named SAON keeps its comma — the Minerva form.
    expect(
      labelForAddressParts(
        parts({ paon: "MINERVA HOUSE, 12", saon: "FLAT 4", street: "CERES CRESCENT" }),
      ),
    ).toBe("Flat 4, Minerva House, 12 Ceres Crescent");
  });
});

// ------------------------------------------------------------------
// Resolution — the step's own checks
// ------------------------------------------------------------------

describe("resolveAddressInput — golden checks (M6.1)", () => {
  it("CM3 2JT returns the Birkdale Rise addresses from loaded data", async () => {
    const r = await resolveAddressInput("CM3 2JT", fakeSource);
    expect(r.rung).toBe(2);
    if (r.rung !== 2) throw new Error("expected rung 2");
    expect(r.addresses.length).toBeGreaterThan(0);
    expect(r.addresses.every((a) => a.street === "BIRKDALE RISE")).toBe(true);
    expect(r.addresses.map((a) => a.label)).toContain("19 Birkdale Rise");
    // The fixture files 27 distinct Birkdale Rise addresses at the
    // postcode (31 sales rows); the list is addresses, not sales.
    expect(r.addresses).toHaveLength(27);
  });

  it("E16 1GN's address list includes Nos. 5, 6, 7 and 10 Exeter Road", async () => {
    const r = await resolveAddressInput("E16 1GN", fakeSource);
    expect(r.rung).toBe(2);
    if (r.rung !== 2) throw new Error("expected rung 2");
    const labels = r.addresses.map((a) => a.label);
    for (const n of ["5", "6", "7", "10"]) {
      expect(labels).toContain(`${n} Exeter Road`);
    }
  });

  it("KT17 1FH keeps Flat 4, Minerva House distinct from Flat 4, Jupiter House and Flat 4, Juno House", async () => {
    const minerva = await resolveAddressInput(
      "Flat 4, Minerva House, 12 Ceres Crescent, Epsom KT17 1FH",
      fakeSource,
    );
    const jupiter = await resolveAddressInput("Flat 4, Jupiter House, KT17 1FH", fakeSource);
    const juno = await resolveAddressInput("Flat 4, Juno House, KT17 1FH", fakeSource);
    for (const [r, building] of [
      [minerva, "MINERVA HOUSE, 12"],
      [jupiter, "JUPITER HOUSE, 10"],
      [juno, "JUNO HOUSE, 16"],
    ] as const) {
      expect(r.rung).toBe(1);
      if (r.rung !== 1) throw new Error("expected rung 1");
      expect(r.address.paon).toBe(building);
      expect(r.address.saon).toBe("FLAT 4");
    }
    if (minerva.rung !== 1 || jupiter.rung !== 1 || juno.rung !== 1)
      throw new Error("expected rung 1");
    expect(new Set([minerva.address.label, jupiter.address.label, juno.address.label]).size).toBe(
      3,
    );
    expect(minerva.address.label).toBe("Flat 4, Minerva House, 12 Ceres Crescent");
  });

  it("resolves the two golden houses to rung 1", async () => {
    const birkdale = await resolveAddressInput(
      "19 Birkdale Rise, Hatfield Peverel, CM3 2JT",
      fakeSource,
    );
    expect(birkdale.rung).toBe(1);
    if (birkdale.rung === 1) expect(birkdale.address.label).toBe("19 Birkdale Rise");

    const exeter = await resolveAddressInput("6 Exeter Road, London E16 1GN", fakeSource);
    expect(exeter.rung).toBe(1);
    if (exeter.rung === 1) expect(exeter.address.label).toBe("6 Exeter Road");
  });
});

// ------------------------------------------------------------------
// Resolution — the ladder's honesty rules
// ------------------------------------------------------------------

describe("resolveAddressInput — ladder honesty", () => {
  it("a flat number without a building name lands on rung 2, never rung 1", async () => {
    const r = await resolveAddressInput("Flat 4, KT17 1FH", fakeSource);
    expect(r.rung).toBe(2);
    if (r.rung !== 2) throw new Error("expected rung 2");
    expect(r.building).toBeNull();
    expect(r.addresses).toHaveLength(3);
  });

  it("a building name without a flat number narrows rung 2 to that building", async () => {
    const r = await resolveAddressInput("Minerva House, KT17 1FH", fakeSource);
    expect(r.rung).toBe(2);
    if (r.rung !== 2) throw new Error("expected rung 2");
    expect(r.building).toBe("Minerva House");
    expect(r.addresses).toHaveLength(1);
    expect(r.addresses[0].paon).toBe("MINERVA HOUSE, 12");
  });

  it("a flat can be matched by building street number + flat number together", async () => {
    const r = await resolveAddressInput("Flat 4, 12 Ceres Crescent, KT17 1FH", fakeSource);
    expect(r.rung).toBe(1);
    if (r.rung === 1) expect(r.address.paon).toBe("MINERVA HOUSE, 12");
  });

  it("a flat that is not loaded in a matched building falls to the building's list", async () => {
    const r = await resolveAddressInput("Flat 99, Minerva House, KT17 1FH", fakeSource);
    expect(r.rung).toBe(2);
    if (r.rung !== 2) throw new Error("expected rung 2");
    expect(r.building).toBe("Minerva House");
    expect(r.addresses.every((a) => a.paon === "MINERVA HOUSE, 12")).toBe(true);
  });

  it("a house number that is not loaded falls to the street's list", async () => {
    const r = await resolveAddressInput("99 Birkdale Rise, CM3 2JT", fakeSource);
    expect(r.rung).toBe(2);
    if (r.rung !== 2) throw new Error("expected rung 2");
    expect(r.street).toBe("BIRKDALE RISE");
    expect(r.addresses).toHaveLength(27);
  });

  it("a street with a postcode narrows rung 2 to that street", async () => {
    const r = await resolveAddressInput("Exeter Road, E16 1GN", fakeSource);
    expect(r.rung).toBe(2);
    if (r.rung !== 2) throw new Error("expected rung 2");
    expect(r.street).toBe("EXETER ROAD");
    expect(r.addresses.every((a) => a.street === "EXETER ROAD")).toBe(true);
  });

  it("a partial postcode lands on rung 3, labelled as a wider area", async () => {
    const r = await resolveAddressInput("CM3", fakeSource);
    expect(r.rung).toBe(3);
    if (r.rung !== 3) throw new Error("expected rung 3");
    expect(r.label).toBe("Wider area — CM3, not this exact home");
    expect(r.outward).toBe("CM3");
    expect(r.postcodeCount).toBeGreaterThan(0);
  });

  it("a rung 3 result carries no address-level payload, by construction", async () => {
    const r = await resolveAddressInput("E16", fakeSource);
    expect(r.rung).toBe(3);
    expect(r).not.toHaveProperty("addresses");
    expect(r).not.toHaveProperty("address");
    expect(Object.keys(r).sort()).toEqual(["kind", "label", "outward", "postcodeCount", "rung"]);
  });

  it("a street without a postcode lands on the no-location rung", async () => {
    const r = await resolveAddressInput("Exeter Road, London", fakeSource);
    expect(r.rung).toBe(4);
  });

  it("empty and placeless input lands on the no-location rung", async () => {
    expect((await resolveAddressInput("", fakeSource)).rung).toBe(4);
    expect((await resolveAddressInput("a house near the sea", fakeSource)).rung).toBe(4);
  });

  it("a postcode in the directory with no addresses loaded is rung 2 with an empty list", async () => {
    const r = await resolveAddressInput("E1 0AA", fakeSource);
    expect(r.rung).toBe(2);
    if (r.rung !== 2) throw new Error("expected rung 2");
    expect(r.addresses).toEqual([]);
  });

  it("a full postcode the directory does not hold degrades to its wider area, never a guess", async () => {
    // CM3 2AA is not in the fake directory, but CM3 is — the honest
    // landing is the wider-area rung for the district it names.
    const r = await resolveAddressInput("1 Some Street, CM3 2AA", fakeSource);
    expect(r.rung).toBe(3);
    if (r.rung === 3) expect(r.outward).toBe("CM3");
  });

  it("a postcode in a district we hold nothing for is no-location", async () => {
    const r = await resolveAddressInput("1 High Street, ZZ9 9ZZ", fakeSource);
    expect(r.rung).toBe(4);
  });
});

// ------------------------------------------------------------------
// The database-backed source: the SQL it issues
// ------------------------------------------------------------------

describe("createAddressSource", () => {
  it("reads the directory, the filed addresses and the district from loaded tables only", async () => {
    const calls: { text: string; params?: unknown[] }[] = [];
    const db = {
      async query(text: string, params?: unknown[]) {
        calls.push({ text, params });
        if (text.includes("postcode_cache") && text.includes("WHERE postcode =")) {
          return {
            rows: [
              {
                postcode: "CM3 2JT",
                latitude: 51.776176,
                longitude: 0.60387,
                council: "Braintree",
                ward: null,
                region: null,
                lsoa_code: "E01021395",
                msoa_code: "E02004463",
              },
            ],
          };
        }
        if (text.includes("price_paid")) {
          return {
            rows: [
              {
                postcode: "CM3 2JT",
                paon: "19",
                saon: null,
                street: "BIRKDALE RISE",
                locality: "HATFIELD PEVEREL",
                town: "CHELMSFORD",
              },
            ],
          };
        }
        if (text.includes("count(*)")) return { rows: [{ n: 1234 }] };
        throw new Error(`unexpected query: ${text}`);
      },
    };
    const source = createAddressSource(db);
    const dir = await source.directoryPostcode("CM3 2JT");
    expect(dir?.council).toBe("Braintree");
    expect(dir?.lsoaCode).toBe("E01021395");
    const addresses = await source.addressesInPostcode("CM3 2JT");
    expect(addresses).toHaveLength(1);
    expect(addresses[0].paon).toBe("19");
    const district = await source.districtSummary("CM3");
    expect(district?.postcodeCount).toBe(1234);
    // Loaded data only: the source may read the directory and the
    // filed sales addresses — nothing else, and nothing external.
    const tables = calls.map((c) => c.text).join("\n");
    expect(tables).toContain("postcode_cache");
    expect(tables).toContain("price_paid");
    expect(tables).not.toContain("company_titles");
  });
});
