import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveAddressInput,
  type AddressDataSource,
  type AddressResolution,
  type DirectoryPostcode,
  type LoadedAddressParts,
} from "../lib/address";
import {
  MEDIAN_EXPLAINER,
  NO_SALE_RECORDED_LINE,
  buildSoldPricesBundle,
  createSoldPricesSource,
  type SoldPriceRow,
  type SoldPricesBundle,
  type SoldPricesDataSource,
} from "../lib/sold-prices";

// Sold prices in the brain (plan step M6.3, decision D23).
//
// The served median is the POSTCODE median over all category-A
// recorded sales, its counted number and date span named beside
// it; category-B sales never count toward a median but DO appear
// in the home's own history, unlabelled. The brain never computes
// a gap, a percentage or a comparative adjective between a home's
// price and any median, and nothing here is ever called a
// valuation. Locked figures (the M6.3 prep's Section 4) assert
// exactly; the full KT17 1FH set, CM1 6ER's count and E16 1EG's
// candidacy are fixed at first load in the rehearsal and recorded
// in tests/golden-matrix.md — the repo fixture files only two
// postcodes' sales (CM3 2JT, E16 1GN) plus the three Flat 4
// address rows, so the Minerva postcode and building figures are
// rehearsal-proved, not fixture-proved.

// --- the filed rows, re-derived from the loaders' fixtures ----
// The pipelines below re-derive the filed rows from the loader's
// own fixture with the loader's rules written out again — the
// transport/schools/OSM test pattern — so the brain is tested
// against filed truth, not against the loader itself.

const LOADER_SOURCE_NAME = "HM Land Registry Price Paid (full file + monthly update)";
// The fixture pp-complete.csv was published 28 Oct 2026 (its
// README); the fake files its rows under that edition.
const FIXTURE_EDITION = "2026-10-28";

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

// The loader's record rules (load-sold-prices.mjs): 16 fields,
// price a positive integer, date shaped YYYY-MM-DD; the rest as
// filed, empty strings to null. The fixture row carries the
// record status as well — the update merge needs it; the brain's
// row shape does not.
type FixtureRow = SoldPriceRow & { recordStatus?: string | null };

function toRow(f: string[]): FixtureRow | null {
  if (f.length !== 16) return null;
  const price = Number.parseInt(f[1], 10);
  if (!Number.isInteger(price) || price <= 0) return null;
  if (!/^\d{4}-\d{2}-\d{2}/.test(f[2])) return null;
  return {
    transactionId: f[0].replace(/[{}]/g, ""),
    price,
    saleDate: f[2].slice(0, 10),
    postcode: f[3],
    propertyType: f[4] || null,
    newBuild: f[5] === "Y" ? true : f[5] === "N" ? false : null,
    tenure: f[6] || null,
    paon: f[7] || null,
    saon: f[8] || null,
    street: f[9] || null,
    locality: f[10] || null,
    town: f[11] || null,
    category: f[14] || null,
    sourceName: LOADER_SOURCE_NAME,
    sourceDate: FIXTURE_EDITION,
    recordStatus: f[15] || null,
  };
}

function fixtureRows(): SoldPriceRow[] {
  const dir = join(process.cwd(), "tests/fixtures/land-registry");
  const read = (name: string) =>
    readFileSync(join(dir, name), "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => parsePpdLine(line))
      .map((f) => (f ? toRow(f) : null))
      .filter((r): r is FixtureRow => r !== null);
  const byGuid = new Map<string, FixtureRow>();
  for (const row of read("pp-complete.csv")) byGuid.set(row.transactionId as string, row);
  // The monthly update merges over the full file by transaction
  // id: A/C replace, D deletes (the loader's rule).
  for (const row of read("pp-monthly-update.csv")) {
    if (row.recordStatus === "D") byGuid.delete(row.transactionId as string);
    else byGuid.set(row.transactionId as string, row);
  }
  // The KT17 1FH address fixture carries the three Flat 4 rows in
  // the same Registry format; the Juno House row has no price or
  // date (an address, not a sale) and the loader's rules drop it.
  const kt = readFileSync(join(process.cwd(), "tests/fixtures/address/kt17-1fh.csv"), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => parsePpdLine(line))
    .map((f) => (f ? toRow(f) : null))
    .filter((r): r is FixtureRow => r !== null);
  const strip = (row: FixtureRow): SoldPriceRow => {
    const copy: FixtureRow = { ...row };
    delete copy.recordStatus;
    return copy;
  };
  return [...byGuid.values(), ...kt].map(strip);
}

const REGISTRY_ROWS = fixtureRows();

// --- the address resolutions the bundles hang off -------------
// The M6.1 fake, mirrored (the same fixture rows and directory
// facts the address and nearby suites use).

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

const ADDRESSES: LoadedAddressParts[] = [
  ...ppdAddresses(
    readFileSync(join(process.cwd(), "tests/fixtures/land-registry/pp-complete.csv"), "utf8"),
  ),
  ...ppdAddresses(readFileSync(join(process.cwd(), "tests/fixtures/address/kt17-1fh.csv"), "utf8")),
];

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
]);

const addressSource: AddressDataSource = {
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

// --- the sold-prices fake --------------------------------------
// The loader's contract, in memory: a postcode's set is filed
// only by a load (the on-demand path); rows present prove a load
// happened; the stamp (edition) proves a load that filed none.
// `events` records the call order so a test can prove an answer
// was never read from emptiness.

class FakeSoldPricesSource implements SoldPricesDataSource {
  registry = new Map<string, SoldPriceRow[]>();
  filed = new Map<string, SoldPriceRow[]>();
  stamps = new Map<string, string>();
  events: string[] = [];

  constructor(rows: SoldPriceRow[]) {
    for (const row of rows) {
      const list = this.registry.get(row.postcode) ?? [];
      list.push(row);
      this.registry.set(row.postcode, list);
    }
  }

  async salesInPostcode(postcode: string) {
    const rows = this.filed.get(postcode) ?? [];
    this.events.push(`read:${postcode}:${rows.length}`);
    return rows;
  }

  async loadEdition(postcode: string) {
    return this.stamps.get(postcode) ?? null;
  }

  async loadPostcode(postcode: string) {
    this.events.push(`load:${postcode}`);
    this.filed.set(postcode, this.registry.get(postcode) ?? []);
    this.stamps.set(postcode, FIXTURE_EDITION);
  }

  // Rows filed without the check's own load (the runner's refresh
  // warms postcodes this way): present rows, no check stamp.
  prefile(postcode: string) {
    this.filed.set(postcode, this.registry.get(postcode) ?? []);
  }

  loadCalls(): string[] {
    return this.events.filter((e) => e.startsWith("load:")).map((e) => e.slice(5));
  }
}

async function bundleFor(input: string, source: SoldPricesDataSource) {
  const resolution = await resolveAddressInput(input, addressSource);
  return buildSoldPricesBundle(resolution, source);
}

let syntheticSeq = 0;
function syntheticRow(partial: Partial<SoldPriceRow> & { price: number }): SoldPriceRow {
  syntheticSeq += 1;
  return {
    transactionId: `synthetic-${syntheticSeq}`,
    saleDate: "2020-06-01",
    propertyType: "T",
    newBuild: false,
    tenure: "F",
    paon: "1",
    saon: null,
    street: "SYNTHETIC STREET",
    locality: null,
    town: "TESTTOWN",
    category: "A",
    sourceName: LOADER_SOURCE_NAME,
    sourceDate: FIXTURE_EDITION,
    postcode: "XX1 1XX",
    ...partial,
  };
}

// A literal rung-2 resolution for a postcode no directory fake
// holds; latitude/longitude are inert for this check (the brain
// never reads them here).
function rung2Resolution(postcode: string): AddressResolution {
  return {
    rung: 2,
    kind: "address-list",
    directory: {
      postcode,
      latitude: 0,
      longitude: 0,
      council: null,
      ward: null,
      region: null,
      lsoaCode: null,
      msoaCode: null,
    },
    street: null,
    building: null,
    addresses: [],
  };
}

describe("sold prices — 19 Birkdale Rise, CM3 2JT", () => {
  it("loads a cold postcode through the loader path, then serves the locked figures", async () => {
    const source = new FakeSoldPricesSource(REGISTRY_ROWS);
    const bundle = await bundleFor("19 Birkdale Rise, CM3 2JT", source);
    if (bundle.kind !== "sold-prices" || bundle.rung !== 1)
      throw new Error(`expected a rung-1 sold-prices bundle, got ${bundle.kind}`);
    // The check loaded the postcode first — exactly once — and
    // the first read (which found nothing) was followed by the
    // load before any figure was served.
    expect(source.loadCalls()).toEqual(["CM3 2JT"]);
    expect(source.events[0]).toBe("read:CM3 2JT:0");
    expect(source.events[1]).toBe("load:CM3 2JT");
    expect(bundle.loadState).toBe("found");
    expect(bundle.postcode).toBe("CM3 2JT");
    expect(bundle.recordedCount).toBe(30);
    // The home's own history: exactly one recorded sale, as filed.
    expect(bundle.ownHistory).toEqual([
      {
        price: 588995,
        date: "2023-06-15",
        propertyType: "D",
        tenure: "F",
        newBuild: true,
        address: "19 Birkdale Rise",
      },
    ]);
    expect(bundle.ownLine).toBeNull();
    // The served median under D23's rule: category A only.
    expect(bundle.median.state).toBe("served");
    expect(bundle.median.value).toBe(588995);
    expect(bundle.median.counted).toBe(29);
    expect(bundle.median.spanFrom).toBe("1996-12-20");
    expect(bundle.median.spanTo).toBe("2026-07-20");
    expect(bundle.median.line).toBe("counted over 29 recorded sales, 1996-12-20 to 2026-07-20");
    expect(bundle.median.explainer).toBe(MEDIAN_EXPLAINER);
    // The recent list: the postcode's most recent category-A
    // sales, newest first — the street's one category-B sale
    // (No 32, 2022-12-29) is not among them.
    expect(bundle.recentSales).toHaveLength(10);
    expect(bundle.recentSales[0]).toMatchObject({
      price: 630000,
      date: "2026-07-20",
      address: "16 Birkdale Rise",
    });
    expect(bundle.recentSales[1]).toMatchObject({
      price: 628000,
      date: "2026-07-17",
      address: "8 Birkdale Rise",
    });
    expect(bundle.recentSales.map((s) => s.price)).not.toContain(651440);
    // A house has no building line.
    expect(bundle.building).toBeNull();
    // Every figure carries its source and edition (D9/D13).
    expect(bundle.sourceName).toBe(LOADER_SOURCE_NAME);
    expect(bundle.edition).toBe(FIXTURE_EDITION);
    expect(bundle.sourceLine).toContain("HM Land Registry Price Paid");
    expect(bundle.sourceLine).toContain(FIXTURE_EDITION);
  });

  it("does not load again once the postcode is filed", async () => {
    const source = new FakeSoldPricesSource(REGISTRY_ROWS);
    await bundleFor("19 Birkdale Rise, CM3 2JT", source);
    await bundleFor("19 Birkdale Rise, CM3 2JT", source);
    expect(source.loadCalls()).toEqual(["CM3 2JT"]);
  });

  it("serves a runner-warmed postcode without the check loading it", async () => {
    const source = new FakeSoldPricesSource(REGISTRY_ROWS);
    source.prefile("CM3 2JT");
    const bundle = await bundleFor("19 Birkdale Rise, CM3 2JT", source);
    if (bundle.kind !== "sold-prices") throw new Error("expected sold-prices");
    expect(source.loadCalls()).toEqual([]);
    expect(bundle.loadState).toBe("found");
    expect(bundle.median.value).toBe(588995);
  });
});

describe("sold prices — 6 Exeter Road, E16 1GN", () => {
  it("serves the home's only sale exactly as filed — flat-type, leasehold, new-build", async () => {
    const source = new FakeSoldPricesSource(REGISTRY_ROWS);
    const bundle = await bundleFor("6 Exeter Road, E16 1GN", source);
    if (bundle.kind !== "sold-prices" || bundle.rung !== 1)
      throw new Error("expected a rung-1 sold-prices bundle");
    // The golden home is a house; its only filed sale row is
    // type F. The answer serves the row as filed, never
    // "corrects" it.
    expect(bundle.ownHistory).toEqual([
      {
        price: 270000,
        date: "2014-01-17",
        propertyType: "F",
        tenure: "L",
        newBuild: true,
        address: "6 Exeter Road",
      },
    ]);
    expect(bundle.recordedCount).toBe(9);
  });

  it("serves the locked postcode median over all 9 sales, and the whole set as the recent list", async () => {
    const source = new FakeSoldPricesSource(REGISTRY_ROWS);
    const bundle = await bundleFor("6 Exeter Road, E16 1GN", source);
    if (bundle.kind !== "sold-prices") throw new Error("expected sold-prices");
    expect(bundle.median.state).toBe("served");
    expect(bundle.median.value).toBe(310000);
    expect(bundle.median.counted).toBe(9);
    expect(bundle.median.spanFrom).toBe("2013-09-20");
    expect(bundle.median.spanTo).toBe("2024-01-31");
    expect(bundle.recentSales.map((s) => [s.date, s.price, s.address])).toEqual([
      ["2024-01-31", 571000, "5 Exeter Road"],
      ["2023-02-24", 410000, "10 Exeter Road"],
      ["2022-05-13", 136500, "14 Exeter Road"],
      ["2014-01-17", 270000, "6 Exeter Road"],
      ["2013-12-18", 260000, "10 Exeter Road"],
      ["2013-09-20", 300000, "7 Exeter Road"],
      ["2013-09-20", 310000, "3 Exeter Road"],
      ["2013-09-20", 310999, "5 Exeter Road"],
      ["2013-09-20", 325000, "1 Exeter Road"],
    ]);
  });

  it("shows both of No 10's recorded sales in its own history, newest first", async () => {
    const source = new FakeSoldPricesSource(REGISTRY_ROWS);
    const bundle = await bundleFor("10 Exeter Road, E16 1GN", source);
    if (bundle.kind !== "sold-prices" || bundle.rung !== 1)
      throw new Error("expected a rung-1 sold-prices bundle");
    expect(bundle.ownHistory.map((s) => [s.date, s.price])).toEqual([
      ["2023-02-24", 410000],
      ["2013-12-18", 260000],
    ]);
  });
});

describe("sold prices — Flat 4, Minerva House, KT17 1FH", () => {
  it("keeps the three Flat 4s apart by the PAON + SAON pair, in both directions", async () => {
    const source = new FakeSoldPricesSource(REGISTRY_ROWS);
    const minerva = await bundleFor("Flat 4, Minerva House, KT17 1FH", source);
    if (minerva.kind !== "sold-prices" || minerva.rung !== 1)
      throw new Error("expected a rung-1 sold-prices bundle");
    expect(minerva.ownHistory).toEqual([
      {
        price: 420000,
        date: "2019-12-03",
        propertyType: "F",
        tenure: "L",
        newBuild: true,
        address: "Flat 4, Minerva House, 12 Ceres Crescent",
      },
    ]);
    const jupiter = await bundleFor("Flat 4, Jupiter House, KT17 1FH", source);
    if (jupiter.kind !== "sold-prices" || jupiter.rung !== 1)
      throw new Error("expected a rung-1 sold-prices bundle");
    expect(jupiter.ownHistory.map((s) => [s.date, s.price])).toEqual([["2019-09-10", 341000]]);
  });

  it("adds the building line for a flat — the building's own category-A sales", async () => {
    const source = new FakeSoldPricesSource(REGISTRY_ROWS);
    const bundle = await bundleFor("Flat 4, Minerva House, KT17 1FH", source);
    if (bundle.kind !== "sold-prices" || bundle.rung !== 1)
      throw new Error("expected a rung-1 sold-prices bundle");
    // The repo fixture files only the Flat 4 rows, so the
    // building's filed set here is the one Minerva sale; the
    // full building figures are fixed at first load in the
    // rehearsal (golden-matrix). Jupiter's sale must NOT leak
    // into Minerva's building line.
    expect(bundle.building?.building).toBe("Minerva House");
    expect(bundle.building?.sales.map((s) => [s.date, s.price])).toEqual([["2019-12-03", 420000]]);
    expect(bundle.building?.counted).toBe(1);
    expect(bundle.building?.median.state).toBe("too-few");
    expect(bundle.building?.median.line).toBe(
      "only 1 recorded sale in this building — too few for a median",
    );
    // The fixture's postcode set is two sales: too few for the
    // postcode median either (the served £399,999 over 27 is
    // rehearsal-proved on the full filed set).
    expect(bundle.median.state).toBe("too-few");
    expect(bundle.median.line).toBe(
      "only 2 recorded sales in this postcode — too few for a median",
    );
    expect(bundle.recentSales.map((s) => s.price)).toEqual([420000, 341000]);
  });
});

describe("sold prices — ladder rungs (M6.3)", () => {
  it("serves postcode figures at rung 2 with NO own-history payload, by construction", async () => {
    const source = new FakeSoldPricesSource(REGISTRY_ROWS);
    const bundle = await bundleFor("Birkdale Rise, CM3 2JT", source);
    if (bundle.kind !== "sold-prices" || bundle.rung !== 2)
      throw new Error("expected a rung-2 sold-prices bundle");
    expect(bundle.median.value).toBe(588995);
    expect(bundle.recentSales).toHaveLength(10);
    expect(bundle).not.toHaveProperty("ownHistory");
    expect(JSON.stringify(bundle)).not.toContain("ownHistory");
  });

  it("serves the building's sales at rung 2 when the list is narrowed to a building — still no own history", async () => {
    const source = new FakeSoldPricesSource(REGISTRY_ROWS);
    const bundle = await bundleFor("Minerva House, KT17 1FH", source);
    if (bundle.kind !== "sold-prices" || bundle.rung !== 2)
      throw new Error("expected a rung-2 sold-prices bundle");
    expect(bundle.building?.building).toBe("Minerva House");
    expect(bundle.building?.sales.map((s) => s.price)).toEqual([420000]);
    expect(bundle).not.toHaveProperty("ownHistory");
  });

  it("returns NO sold-price figures at rung 3 — the named state only, and no load is attempted", async () => {
    const source = new FakeSoldPricesSource(REGISTRY_ROWS);
    const resolution = await resolveAddressInput("CM3", addressSource);
    expect(resolution.rung).toBe(3);
    const bundle = await buildSoldPricesBundle(resolution, source);
    expect(bundle).toEqual({
      rung: 3,
      kind: "wider-area",
      soldPrices: { state: "unavailable", reason: "sold prices need an exact postcode" },
    });
    const serialised = JSON.stringify(bundle);
    expect(serialised).not.toContain("588995");
    expect(serialised).not.toContain("median");
    expect(serialised).not.toContain("recentSales");
    expect(source.loadCalls()).toEqual([]);
  });

  it("returns the no-location state at rung 4", async () => {
    const source = new FakeSoldPricesSource(REGISTRY_ROWS);
    const resolution = await resolveAddressInput("Birkdale Rise, Hatfield Peverel", addressSource);
    expect(resolution.rung).toBe(4);
    const bundle = await buildSoldPricesBundle(resolution, source);
    expect(bundle).toEqual({
      rung: 4,
      kind: "no-location",
      soldPrices: { state: "unavailable", reason: "sold prices need an exact postcode" },
    });
    expect(source.loadCalls()).toEqual([]);
  });
});

describe("sold prices — the three loaded states", () => {
  it("proves loaded-with-none: the zero-sales wording, served only after a load", async () => {
    const source = new FakeSoldPricesSource(REGISTRY_ROWS);
    // E16 1EG files nothing in the fake's registry — the
    // synthetic stand-in for a genuinely empty postcode; its
    // real count is fixed at first load in the rehearsal.
    const bundle = await buildSoldPricesBundle(rung2Resolution("E16 1EG"), source);
    if (bundle.kind !== "sold-prices") throw new Error("expected sold-prices");
    expect(source.loadCalls()).toEqual(["E16 1EG"]);
    expect(bundle.loadState).toBe("loaded-none");
    expect(bundle.recordedCount).toBe(0);
    expect(bundle.stateLine).toBe(NO_SALE_RECORDED_LINE);
    expect(bundle.median.state).toBe("none-recorded");
    expect(bundle.median.value).toBeNull();
    expect(bundle.median.line).toBe(NO_SALE_RECORDED_LINE);
    expect(bundle.recentSales).toEqual([]);
    expect(bundle.edition).toBe(FIXTURE_EDITION);
    expect(bundle.sourceLine).toContain(FIXTURE_EDITION);
  });

  it("never answers a cold postcode from emptiness: the load precedes every figure", async () => {
    const source = new FakeSoldPricesSource(REGISTRY_ROWS);
    await bundleFor("19 Birkdale Rise, CM3 2JT", source);
    const loadAt = source.events.indexOf("load:CM3 2JT");
    const firstFullRead = source.events.findIndex(
      (e) => e.startsWith("read:") && !e.endsWith(":0"),
    );
    expect(loadAt).toBeGreaterThanOrEqual(0);
    expect(firstFullRead).toBeGreaterThan(loadAt);
  });

  it("loads a cold postcode through the real loader path, postcodes after the separator", async () => {
    // The database source, driven against a stub loader that
    // records how it was invoked. The loader's argument filter
    // drops the slot its "--" separator occupies; without the
    // separator the only postcode would silently never load —
    // this pins the invocation, not just the outcome.
    const dir = mkdtempSync(join(tmpdir(), "m63-stub-loader-"));
    const argvFile = join(dir, "argv.json");
    const stub = join(dir, "load-sold-prices.mjs");
    writeFileSync(
      stub,
      [
        'import { writeFileSync } from "node:fs";',
        'writeFileSync(process.env.STUB_ARGV_PATH ?? "", JSON.stringify(process.argv.slice(2)));',
        'console.log("load-sold-prices · edition 2026-10-28 · ZZ9 9ZZ 0 sales · golden homes OK · 0s");',
        "",
      ].join("\n"),
    );
    process.env.STUB_ARGV_PATH = argvFile;
    let stamp: string | null = null;
    const db = {
      async query(text: string, params?: unknown[]) {
        if (text.includes("UPDATE postcode_cache")) {
          stamp = params?.[1] as string;
          return { rows: [{ postcode: params?.[0] as string }] };
        }
        if (text.includes("FROM price_paid")) return { rows: [] };
        if (text.includes("soldPricesLoad"))
          return {
            rows: [{ edition: stamp ? (JSON.parse(stamp).edition as string) : null }],
          };
        throw new Error(`unexpected query: ${text}`);
      },
    };
    const source = createSoldPricesSource(db, {
      loaderPath: stub,
      databaseUrl: "postgresql://stub.invalid/db",
    });
    const bundle = await buildSoldPricesBundle(rung2Resolution("ZZ9 9ZZ"), source);
    if (bundle.kind !== "sold-prices") throw new Error("expected sold-prices");
    expect(JSON.parse(readFileSync(argvFile, "utf8"))).toEqual(["--", "ZZ9 9ZZ"]);
    expect(bundle.loadState).toBe("loaded-none");
    expect(bundle.edition).toBe(FIXTURE_EDITION);
    expect(JSON.parse(stamp ?? "{}").edition).toBe(FIXTURE_EDITION);
  });
});

describe("sold prices — coverage", () => {
  it("gives a Scottish postcode the named not-covered state, without loading it", async () => {
    const source = new FakeSoldPricesSource(REGISTRY_ROWS);
    const resolution: AddressResolution = {
      rung: 1,
      kind: "home",
      directory: {
        postcode: "EH1 1YZ",
        latitude: 0,
        longitude: 0,
        council: null,
        ward: null,
        region: "Scotland",
        lsoaCode: null,
        msoaCode: null,
      },
      address: {
        postcode: "EH1 1YZ",
        paon: "1",
        saon: null,
        street: "PRINCES STREET",
        locality: null,
        town: "EDINBURGH",
        label: "1 Princes Street",
      },
    };
    const bundle = await buildSoldPricesBundle(resolution, source);
    expect(bundle.kind).toBe("not-covered");
    if (bundle.kind !== "not-covered") throw new Error("expected not-covered");
    expect(bundle.soldPrices.state).toBe("not-covered");
    expect(bundle.soldPrices.reason).toContain("Scotland");
    expect(source.loadCalls()).toEqual([]);
  });

  it("gives a Northern Ireland postcode the named not-covered state", async () => {
    const source = new FakeSoldPricesSource(REGISTRY_ROWS);
    const bundle = await buildSoldPricesBundle(rung2Resolution("BT1 1AA"), source);
    expect(bundle.kind).toBe("not-covered");
    if (bundle.kind !== "not-covered") throw new Error("expected not-covered");
    expect(bundle.soldPrices.reason).toContain("Northern Ireland");
    expect(source.loadCalls()).toEqual([]);
  });
});

describe("sold prices — small samples and the category rules (synthetic rows)", () => {
  it("lists the sales instead of a median below the floor of 5 counted sales", async () => {
    const rows = [
      syntheticRow({ price: 200000, saleDate: "2021-03-01", paon: "1" }),
      syntheticRow({ price: 210000, saleDate: "2022-03-01", paon: "2" }),
      syntheticRow({ price: 220000, saleDate: "2023-03-01", paon: "3" }),
      syntheticRow({ price: 999999, saleDate: "2023-06-01", paon: "4", category: "B" }),
    ];
    const source = new FakeSoldPricesSource(rows);
    const bundle = await buildSoldPricesBundle(rung2Resolution("XX1 1XX"), source);
    if (bundle.kind !== "sold-prices") throw new Error("expected sold-prices");
    expect(bundle.recordedCount).toBe(4);
    expect(bundle.median.state).toBe("too-few");
    expect(bundle.median.value).toBeNull();
    expect(bundle.median.counted).toBe(3);
    expect(bundle.median.line).toBe(
      "only 3 recorded sales in this postcode — too few for a median",
    );
    // The category-B row is not in the recent list either.
    expect(bundle.recentSales.map((s) => s.price)).toEqual([220000, 210000, 200000]);
  });

  it("averages the two middle sales for an even counted set", async () => {
    const prices = [100000, 200000, 250000, 300000, 400000, 500000];
    const rows = prices.map((price, i) =>
      syntheticRow({ price, saleDate: `2020-0${i + 1}-15`, paon: `${i + 1}` }),
    );
    const source = new FakeSoldPricesSource(rows);
    const bundle = await buildSoldPricesBundle(rung2Resolution("XX1 1XX"), source);
    if (bundle.kind !== "sold-prices") throw new Error("expected sold-prices");
    expect(bundle.median.state).toBe("served");
    expect(bundle.median.value).toBe(275000);
    expect(bundle.median.counted).toBe(6);
  });

  it("includes a category-B sale in the home's own history, never labelled", async () => {
    const rows = [
      syntheticRow({ price: 300000, saleDate: "2018-05-01", paon: "9", category: "A" }),
      syntheticRow({ price: 250000, saleDate: "2021-05-01", paon: "9", category: "B" }),
      syntheticRow({ price: 320000, saleDate: "2019-05-01", paon: "10", category: "A" }),
      syntheticRow({ price: 330000, saleDate: "2020-05-01", paon: "11", category: "A" }),
      syntheticRow({ price: 340000, saleDate: "2022-05-01", paon: "12", category: "A" }),
      syntheticRow({ price: 350000, saleDate: "2023-05-01", paon: "13", category: "A" }),
    ];
    const source = new FakeSoldPricesSource(rows);
    const resolution: AddressResolution = {
      rung: 1,
      kind: "home",
      directory: {
        postcode: "XX1 1XX",
        latitude: 0,
        longitude: 0,
        council: null,
        ward: null,
        region: null,
        lsoaCode: null,
        msoaCode: null,
      },
      address: {
        postcode: "XX1 1XX",
        paon: "9",
        saon: null,
        street: "SYNTHETIC STREET",
        locality: null,
        town: "TESTTOWN",
        label: "9 Synthetic Street",
      },
    };
    const bundle = await buildSoldPricesBundle(resolution, source);
    if (bundle.kind !== "sold-prices" || bundle.rung !== 1)
      throw new Error("expected a rung-1 sold-prices bundle");
    // Both of the home's sales — the category-B one included —
    // newest first, and the category appears nowhere in the
    // served bundle: no key, no label, no explanation.
    expect(bundle.ownHistory.map((s) => [s.date, s.price])).toEqual([
      ["2021-05-01", 250000],
      ["2018-05-01", 300000],
    ]);
    const serialised = JSON.stringify(bundle);
    expect(serialised).not.toContain("category");
    expect(serialised.toLowerCase()).not.toContain("additional entry");
  });
});

describe("sold prices — wording (D23's banned-wording scan)", () => {
  const BANNED = [
    "worth",
    "estimate",
    "bargain",
    "overpriced",
    "underpriced",
    "good price",
    "below the median",
    "above the median",
    "cheaper",
    "dearer",
  ];
  // The one ruled disclaimer: the median's explainer states the
  // figure "is not a valuation of this home" (D23, the prep's
  // Q6). The scan strips that exact sentence, then requires the
  // word "valuation" to appear nowhere else in any served copy.
  const DISCLAIMER = "It is not a valuation of this home.";

  function allStrings(value: unknown, out: string[] = []): string[] {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) for (const v of value) allStrings(v, out);
    else if (value && typeof value === "object")
      for (const v of Object.values(value)) allStrings(v, out);
    return out;
  }

  function allKeys(value: unknown, out: string[] = []): string[] {
    if (Array.isArray(value)) for (const v of value) allKeys(v, out);
    else if (value && typeof value === "object")
      for (const [k, v] of Object.entries(value)) {
        out.push(k);
        allKeys(v, out);
      }
    return out;
  }

  it("no served string carries a banned term, and no key computes a comparison", async () => {
    const source = new FakeSoldPricesSource(REGISTRY_ROWS);
    const bundles: SoldPricesBundle[] = [];
    bundles.push(await bundleFor("19 Birkdale Rise, CM3 2JT", source));
    bundles.push(await bundleFor("6 Exeter Road, E16 1GN", source));
    bundles.push(await bundleFor("Flat 4, Minerva House, KT17 1FH", source));
    bundles.push(await bundleFor("Birkdale Rise, CM3 2JT", source));
    bundles.push(await buildSoldPricesBundle(rung2Resolution("E16 1EG"), source));
    bundles.push(await buildSoldPricesBundle(rung2Resolution("BT1 1AA"), source));
    for (const bundle of bundles) {
      for (const text of allStrings(bundle)) {
        const stripped = text.split(DISCLAIMER).join("");
        expect(stripped.toLowerCase()).not.toContain("valuation");
        for (const term of BANNED) expect(text.toLowerCase()).not.toContain(term);
        expect(text).not.toContain("%");
      }
      for (const key of allKeys(bundle)) {
        expect(key).not.toMatch(/gap|percent|difference|compar|verdict|score/i);
      }
    }
  });
});
