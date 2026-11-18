// The picking union read model + the M7.15B invariant
// (plan step M7.15B): the suggestions/picker read path
// serves filed price_paid + picking_index deduped by
// the home key, price_paid winning — and a golden home's
// served sold-prices bundle is BYTE-IDENTICAL with the
// index present vs absent, because no brain ever reads
// the index.
//
// The invariant is asserted two ways: the canonical
// (key-sorted) bundle strings are equal, and the bundle
// build's recorded statements never touch picking_index.

import { describe, expect, it } from "vitest";

import type { AddressResolution } from "../lib/address";
import { labelForAddressParts } from "../lib/address";
import { homeKeyOf } from "../lib/bundle-cache";
import { createPickingIndexSource } from "../lib/server/picking-index";
import { buildSoldPricesBundle, createSoldPricesSource } from "../lib/sold-prices";
import { FakePickingDb, type PickingIndexRow } from "./fixtures/picking-index";

function saleRow(partial: Record<string, unknown>): Record<string, unknown> {
  return {
    transaction_id: "t",
    price: 500000,
    sale_date: "2023-06-15",
    postcode: "CM3 2JT",
    property_type: "D",
    new_build: false,
    tenure: "F",
    paon: "19",
    saon: null,
    street: "BIRKDALE RISE",
    locality: null,
    town: "CHELMSFORD",
    ppd_category: "A",
    source_name: "HM Land Registry Price Paid Data",
    source_date: "2026-10-30",
    ...partial,
  };
}

function indexRow(partial: Partial<PickingIndexRow>): PickingIndexRow {
  return {
    postcode: "CM3 2JT",
    paon: "19",
    saon: null,
    street: "BIRKDALE RISE",
    town: "CHELMSFORD",
    home_key: "19||BIRKDALE RISE",
    sources: ["sales"],
    sales_edition: "fixture",
    epc_edition: null,
    ...partial,
  };
}

function seededDb(): FakePickingDb {
  const db = new FakePickingDb();
  db.pricePaid = [
    saleRow({ transaction_id: "t19", paon: "19", price: 588995, locality: "HATFIELD PEVEREL" }),
    saleRow({ transaction_id: "t21", paon: "21" }),
    saleRow({ transaction_id: "t21b", paon: "21", price: 450000, sale_date: "2019-03-01" }),
  ];
  db.index = [
    // The golden home, in the index with a DIFFERENT
    // town spelling (an EPC variant): the union must
    // serve the filed form, once.
    indexRow({ town: "HATFIELD PEVEREL", sources: ["sales", "epc"], epc_edition: "2026-11-18" }),
    indexRow({ paon: "21", home_key: "21||BIRKDALE RISE" }),
    // An index-only neighbour.
    indexRow({
      paon: "23",
      home_key: "23||BIRKDALE RISE",
      sources: ["epc"],
      sales_edition: null,
      epc_edition: "2026-11-18",
    }),
    // Beaulieu: index-only postcode.
    indexRow({
      postcode: "CM1 6ER",
      paon: "49",
      street: "GEORGE HEARD CRESCENT",
      home_key: "49||GEORGE HEARD CRESCENT",
      sources: ["epc"],
      sales_edition: null,
      epc_edition: "2026-11-18",
    }),
  ];
  db.cacheAnswers = { "CM3 2JT": { soldPricesLoad: { edition: "fixture edition" } } };
  return db;
}

describe("the union read model", () => {
  it("serves each home once — the filed form winning collisions — in natural address order", async () => {
    const db = seededDb();
    const union = await createPickingIndexSource(db as never).unionAddressesInPostcode("CM3 2JT");
    expect(union.map((p) => p.paon)).toEqual(["19", "21", "23"]);
    // The filed form wins the collision: locality and
    // town are price_paid's, not the index variant's.
    expect(union[0]).toEqual({
      postcode: "CM3 2JT",
      paon: "19",
      saon: null,
      street: "BIRKDALE RISE",
      locality: "HATFIELD PEVEREL",
      town: "CHELMSFORD",
    });
    // The index-only row arrives in the picker's shape:
    // locality null, the label falls back to the town.
    expect(union[2]).toEqual({
      postcode: "CM3 2JT",
      paon: "23",
      saon: null,
      street: "BIRKDALE RISE",
      locality: null,
      town: "CHELMSFORD",
    });
    expect(labelForAddressParts(union[2])).toBe("23 Birkdale Rise");
  });

  it("an index-only postcode serves its homes from the index alone", async () => {
    const db = seededDb();
    const source = createPickingIndexSource(db as never);
    const union = await source.unionAddressesInPostcode("CM1 6ER");
    expect(union).toHaveLength(1);
    expect(union[0].paon).toBe("49");
    const only = await source.indexOnlyAddressesInPostcode("CM1 6ER");
    expect(only).toHaveLength(1);
  });

  it("a durable home key derives from index parts exactly as from filed parts", async () => {
    const db = seededDb();
    const union = await createPickingIndexSource(db as never).unionAddressesInPostcode("CM3 2JT");
    const directory = {
      postcode: "CM3 2JT",
      latitude: 0,
      longitude: 0,
      council: null,
      ward: null,
      region: null,
      lsoaCode: null,
      msoaCode: null,
    };
    const keys = union.map((parts) =>
      homeKeyOf({
        rung: 1,
        kind: "home",
        address: { ...parts, label: labelForAddressParts(parts) },
        directory,
      }),
    );
    expect(keys).toEqual(["19||BIRKDALE RISE", "21||BIRKDALE RISE", "23||BIRKDALE RISE"]);
  });

  it("degrades to the filed rows when the index table is absent", async () => {
    const db = seededDb();
    const throwingDb = {
      query: async (text: string, params?: unknown[]) => {
        if (text.includes("picking_index")) {
          throw new Error('relation "picking_index" does not exist');
        }
        return db.query(text, params);
      },
    };
    const union = await createPickingIndexSource(throwingDb as never).unionAddressesInPostcode(
      "CM3 2JT",
    );
    expect(union.map((p) => p.paon)).toEqual(["19", "21"]);
  });
});

// Natural address order (founder fix, 18 Nov 2026): the
// founder's own play-server test found the E16 1GN homes
// listed 1, 10, 14, 3, 5, 6, 7 — string order — where
// Royal Mail's address finder lists the same street
// naturally. The union serves ONE merged list in natural
// order (compareAddressParts), whatever layer each home
// came from; these pins seed the rows in the string
// order the underlying queries serve and assert the
// merged reading. Refinement (same day, the founder's
// E16 1GF screenshots): a named building that carries a
// street number interleaves at that number — Royal Mail
// lists the Tilly Court flats at 29 Hastings Road
// between 27 and 31 — instead of sitting after every
// numbered house on the street.
describe("natural address order — the founder fix (18 Nov 2026)", () => {
  it("Exeter E16 1GN: filed and index rows merge into one numeric order", async () => {
    const db = new FakePickingDb();
    // The filed rows in the order the filed query's own
    // ORDER BY serves them (string order: 1, 10, 14).
    db.pricePaid = ["1", "10", "14"].map((paon) =>
      saleRow({ postcode: "E16 1GN", paon, street: "EXETER ROAD", town: "LONDON" }),
    );
    db.index = ["7", "3", "6", "5"].map((paon) =>
      indexRow({
        postcode: "E16 1GN",
        paon,
        street: "EXETER ROAD",
        town: "LONDON",
        home_key: `${paon}||EXETER ROAD`,
      }),
    );
    const union = await createPickingIndexSource(db as never).unionAddressesInPostcode("E16 1GN");
    expect(union.map((p) => p.paon)).toEqual(["1", "3", "5", "6", "7", "10", "14"]);
  });

  it("Beaulieu CM1 6ER: the 49 odd numbers read 1, 3, 5 … 97, not 1, 11, 13 …", async () => {
    const db = new FakePickingDb();
    const odds: string[] = [];
    for (let n = 1; n <= 97; n += 2) odds.push(String(n));
    // Seeded in string order — the order the index's own
    // ORDER BY serves (1, 11, 13, …, 19, 21, …, 3, 31, …).
    db.index = [...odds].sort().map((paon) =>
      indexRow({
        postcode: "CM1 6ER",
        paon,
        street: "GEORGE HEARD CRESCENT",
        home_key: `${paon}||GEORGE HEARD CRESCENT`,
        sources: ["epc"],
        sales_edition: null,
        epc_edition: "2026-11-18",
      }),
    );
    const union = await createPickingIndexSource(db as never).unionAddressesInPostcode("CM1 6ER");
    expect(union.map((p) => Number(p.paon))).toEqual(odds.map(Number));
  });

  it("Minerva KT17 1FH: the flats read Flat 1 … Flat 12 in numeric order", async () => {
    // The witnessed Minerva House holds Flats 1–9;
    // Flats 10–12 are added so the pin discriminates
    // natural order from string order (where FLAT 10
    // would sit between FLAT 1 and FLAT 2). Half the
    // flats are filed, half index-only: the merged list
    // is one order regardless of source.
    const db = new FakePickingDb();
    const flats = Array.from({ length: 12 }, (_, i) => `FLAT ${i + 1}`);
    const stringOrder = [...flats].sort();
    db.pricePaid = stringOrder
      .filter((_, i) => i % 2 === 0)
      .map((saon) =>
        saleRow({
          postcode: "KT17 1FH",
          paon: "MINERVA HOUSE, 12",
          saon,
          street: "CERES CRESCENT",
          town: "EPSOM",
        }),
      );
    db.index = stringOrder
      .filter((_, i) => i % 2 === 1)
      .map((saon) =>
        indexRow({
          postcode: "KT17 1FH",
          paon: "MINERVA HOUSE, 12",
          saon,
          street: "CERES CRESCENT",
          town: "EPSOM",
          home_key: `MINERVA HOUSE 12|${saon}|CERES CRESCENT`,
        }),
      );
    const union = await createPickingIndexSource(db as never).unionAddressesInPostcode("KT17 1FH");
    expect(union.map((p) => p.saon)).toEqual(flats);
  });

  it("a suffix sits with its number, a numbered named building interleaves at its number, and a numberless named home follows the numbered run", async () => {
    const db = new FakePickingDb();
    db.pricePaid = [
      saleRow({ postcode: "EX1 1AA", paon: "536", street: "HIGH STREET", town: "EXETER" }),
      saleRow({ postcode: "EX1 1AA", paon: "14", street: "HIGH STREET", town: "EXETER" }),
      saleRow({ postcode: "EX1 1AA", paon: "ROSE COTTAGE", street: "HIGH STREET", town: "EXETER" }),
    ];
    db.index = [
      indexRow({
        postcode: "EX1 1AA",
        paon: "535A",
        street: "HIGH STREET",
        town: "EXETER",
        home_key: "535A||HIGH STREET",
      }),
      indexRow({
        postcode: "EX1 1AA",
        paon: "535",
        street: "HIGH STREET",
        town: "EXETER",
        home_key: "535||HIGH STREET",
      }),
      indexRow({
        postcode: "EX1 1AA",
        paon: "10",
        street: "HIGH STREET",
        town: "EXETER",
        home_key: "10||HIGH STREET",
      }),
      indexRow({
        postcode: "EX1 1AA",
        paon: "MINERVA HOUSE, 12",
        street: "HIGH STREET",
        town: "EXETER",
        home_key: "MINERVA HOUSE 12||HIGH STREET",
      }),
    ];
    const union = await createPickingIndexSource(db as never).unionAddressesInPostcode("EX1 1AA");
    // MINERVA HOUSE, 12 carries street number 12, so it
    // interleaves between 10 and 14 — the pin
    // discriminates: under the pre-refinement rule the
    // named building sat after 536. ROSE COTTAGE carries
    // no number at all, so it still follows the whole
    // numbered run.
    expect(union.map((p) => p.paon)).toEqual([
      "10",
      "MINERVA HOUSE, 12",
      "14",
      "535",
      "535A",
      "536",
      "ROSE COTTAGE",
    ]);
  });

  it("Tilly Court E16 1GF: a named building's flats interleave at its street number (the founder's Royal Mail screenshots)", async () => {
    // Royal Mail's finder for E16 1GF lists "1, Tilly
    // Court, 29 Hastings Road" and "2, Tilly Court, 29
    // Hastings Road" between 27 and 31 Hastings Road.
    // The filed parts carry the number after the comma
    // (paon "TILLY COURT, 29", saon "1"/"2") — the
    // number is the building's street number, so the
    // flats sit at 29 in the street's run, in flat
    // order, not after 47 at the street's end.
    const db = new FakePickingDb();
    db.pricePaid = [
      saleRow({ postcode: "E16 1GF", paon: "31", street: "HASTINGS ROAD", town: "LONDON" }),
      saleRow({
        postcode: "E16 1GF",
        paon: "TILLY COURT, 29",
        saon: "2",
        street: "HASTINGS ROAD",
        town: "LONDON",
      }),
    ];
    db.index = [
      indexRow({
        postcode: "E16 1GF",
        paon: "27",
        street: "HASTINGS ROAD",
        town: "LONDON",
        home_key: "27||HASTINGS ROAD",
      }),
      indexRow({
        postcode: "E16 1GF",
        paon: "TILLY COURT, 29",
        saon: "1",
        street: "HASTINGS ROAD",
        town: "LONDON",
        home_key: "TILLY COURT 29|1|HASTINGS ROAD",
      }),
    ];
    const union = await createPickingIndexSource(db as never).unionAddressesInPostcode("E16 1GF");
    expect(union.map((p) => [p.paon, p.saon])).toEqual([
      ["27", null],
      ["TILLY COURT, 29", "1"],
      ["TILLY COURT, 29", "2"],
      ["31", null],
    ]);
  });
});

// Canonical (key-sorted) stringify: the JSONB key-order
// rule — comparisons never depend on key order.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

describe("the invariant — the index never reaches a brain", () => {
  const resolution: AddressResolution = {
    rung: 1,
    kind: "home",
    address: {
      postcode: "CM3 2JT",
      paon: "19",
      saon: null,
      street: "BIRKDALE RISE",
      locality: "HATFIELD PEVEREL",
      town: "CHELMSFORD",
      label: "19 Birkdale Rise",
    },
    directory: {
      postcode: "CM3 2JT",
      latitude: 51.7762,
      longitude: 0.6039,
      council: "Braintree",
      ward: null,
      region: "East of England",
      lsoaCode: "E01021395",
      msoaCode: "E02004581",
    },
  };

  it("19 Birkdale Rise's sold-prices bundle is byte-identical with the index present vs absent", async () => {
    const absent = seededDb();
    absent.index = [];
    const bundleAbsent = await buildSoldPricesBundle(
      resolution,
      createSoldPricesSource(absent as never),
    );

    const present = seededDb();
    const statements: string[] = [];
    const recordingDb = {
      query: async (text: string, params?: unknown[]) => {
        statements.push(text);
        return present.query(text, params);
      },
    };
    const bundlePresent = await buildSoldPricesBundle(
      resolution,
      createSoldPricesSource(recordingDb as never),
    );

    expect(canonical(bundlePresent)).toBe(canonical(bundleAbsent));
    expect(statements.some((s) => s.includes("picking_index"))).toBe(false);
    // And the bundle is the golden home's real bundle,
    // not an error shape: its own sale is in it.
    expect(JSON.stringify(bundlePresent)).toContain("588995");
  });
});
