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
  it("serves filed rows first, then index-only rows, each home once", async () => {
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
