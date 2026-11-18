// The picking index's EPC pass (plan step M7.15B): the
// strict witnessed-shape parser, the bulk-CSV reader,
// the Beaulieu + Minerva acceptance witnesses, the
// wrong-merge negatives, and the separability kill
// switch — over the fake picking database.
//
// The load-bearing pins:
//   - the parser files ONLY the witnessed shapes; every
//     ambiguous line set files nothing and is counted a
//     refusal, by reason; there is no fuzzy pass (a
//     source pin: no edit-distance machinery exists in
//     the loader);
//   - Beaulieu CM1 6ER: 49 certificates file 49 homes,
//     zero refusals, zero merges;
//   - KT17 1FH: 25 certificates file 25 homes — the
//     Juno/Minerva/Jupiter flats never merge;
//   - on collision the sales parts win and the EPC
//     provenance is retained;
//   - the kill switch removes every EPC-derived row,
//     sales rows byte-identical.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  loadEpcIndexFromCertificates,
  loadEpcIndexFromFile,
  parseArgs,
  parseEpcAddressLines,
  stageEpcIndex,
  streamCertificates,
  streamCsvRecords,
} from "../loaders/load-epc-index.mjs";
import { loadPickingIndexFromLines } from "../loaders/load-picking-index.mjs";
import { removeEpcFromIndex } from "../loaders/picking-index-filing.mjs";
import { FakePickingDb } from "./fixtures/picking-index";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, "..");
const loaderSource = readFileSync(path.join(repoRoot, "loaders/load-epc-index.mjs"), "utf8");
const fixtureCsv = readFileSync(
  path.join(repoRoot, "tests/fixtures/epc-index/certificates.csv"),
  "utf8",
);
const salesLines = readFileSync(
  path.join(repoRoot, "tests/fixtures/picking-index/pp-complete.csv"),
  "utf8",
)
  .split(/\r?\n/)
  .filter((line) => line.trim() !== "");

async function fixtureCertificates() {
  const certs: Record<string, string>[] = [];
  for await (const cert of streamCertificates(streamCsvRecords([fixtureCsv]))) {
    certs.push(cert as Record<string, string>);
  }
  return certs;
}

function cert(
  line1: string,
  line2 = "",
  line3 = "",
  postTown = "Chelmsford",
  postcode = "CM1 6ER",
) {
  return { line1, line2, line3, postTown, postcode };
}

describe("parseEpcAddressLines — the witnessed shapes", () => {
  it("S1: number + street on line 1", () => {
    expect(parseEpcAddressLines(cert("26 Birkdale Rise", "", "Hatfield Peverel"))).toEqual({
      parts: {
        postcode: "CM1 6ER",
        paon: "26",
        saon: null,
        street: "BIRKDALE RISE",
        town: "CHELMSFORD",
      },
    });
  });

  it("S2: number alone, street on line 2 (the Beaulieu shape)", () => {
    expect(parseEpcAddressLines(cert("49", "George Heard Crescent"))).toEqual({
      parts: {
        postcode: "CM1 6ER",
        paon: "49",
        saon: null,
        street: "GEORGE HEARD CRESCENT",
        town: "CHELMSFORD",
      },
    });
  });

  it("S3: flat + building on line 1, numbered street on line 2 (the Minerva shape)", () => {
    expect(
      parseEpcAddressLines(
        cert("Flat 8 Juno House", "16, Ceres Crescent", "", "EPSOM", "KT17 1FH"),
      ),
    ).toEqual({
      parts: {
        postcode: "KT17 1FH",
        paon: "JUNO HOUSE, 16",
        saon: "FLAT 8",
        street: "CERES CRESCENT",
        town: "EPSOM",
      },
    });
  });

  it("S4: flat alone on line 1, number + street on line 2", () => {
    expect(
      parseEpcAddressLines(cert("Flat 4", "12 Ceres Crescent", "", "EPSOM", "KT17 1FH")),
    ).toEqual({
      parts: {
        postcode: "KT17 1FH",
        paon: "12",
        saon: "FLAT 4",
        street: "CERES CRESCENT",
        town: "EPSOM",
      },
    });
  });

  it("S5: a named building in the register's PAON form", () => {
    expect(
      parseEpcAddressLines(cert("Minerva House, 12 Ceres Crescent", "", "", "EPSOM", "KT17 1FH")),
    ).toEqual({
      parts: {
        postcode: "KT17 1FH",
        paon: "MINERVA HOUSE, 12",
        saon: null,
        street: "CERES CRESCENT",
        town: "EPSOM",
      },
    });
  });

  it("S6: a named home with the street on line 2", () => {
    expect(parseEpcAddressLines(cert("Rose Cottage", "Church Lane"))).toEqual({
      parts: {
        postcode: "CM1 6ER",
        paon: "ROSE COTTAGE",
        saon: null,
        street: "CHURCH LANE",
        town: "CHELMSFORD",
      },
    });
  });

  it("files the town exactly as the register files it, uppercased", () => {
    const outcome = parseEpcAddressLines(
      cert("26 Birkdale Rise", "", "", "HATFIELD PEVEREL", "CM3 2JT"),
    );
    expect(outcome).toMatchObject({ parts: { town: "HATFIELD PEVEREL" } });
  });

  it("never treats line 3 (a locality) as a street", () => {
    // Number on line 1 with the street ALSO on line 1 is
    // S1; a number alone with only a locality after it
    // has no street and refuses.
    expect(parseEpcAddressLines(cert("26", "", "Hatfield Peverel"))).toEqual({
      refusal: "no-street",
    });
  });
});

describe("parseEpcAddressLines — ambiguity files nothing", () => {
  it("refuses a flat designator with no anchor", () => {
    expect(parseEpcAddressLines(cert("Flat 4"))).toEqual({ refusal: "no-anchor" });
    expect(parseEpcAddressLines(cert("Flat 4", "", "Ceres Crescent"))).toEqual({
      refusal: "no-anchor",
    });
  });

  it("refuses a number range — more than one home on one line", () => {
    expect(parseEpcAddressLines(cert("12-14 High Street"))).toEqual({
      refusal: "number-range",
    });
  });

  it("refuses two numbered lines — two homes, one certificate", () => {
    expect(parseEpcAddressLines(cert("26 Birkdale Rise", "28 Birkdale Rise"))).toEqual({
      refusal: "conflicting-numbers",
    });
    expect(parseEpcAddressLines(cert("26", "28 Birkdale Rise"))).toEqual({
      refusal: "conflicting-numbers",
    });
  });

  it("refuses a named building with no street anywhere", () => {
    expect(parseEpcAddressLines(cert("Minerva House"))).toEqual({
      refusal: "no-street",
    });
  });

  it("refuses empty lines and a missing postcode", () => {
    expect(parseEpcAddressLines(cert("", "", ""))).toEqual({ refusal: "empty" });
    expect(parseEpcAddressLines(cert("49", "George Heard Crescent", "", "Chelmsford", ""))).toEqual(
      {
        refusal: "no-postcode",
      },
    );
  });

  it("the loader carries no fuzzy-matching machinery (source pin)", () => {
    expect(loaderSource).not.toMatch(/levenshtein|editDistance/i);
    expect(loaderSource).not.toMatch(/INSERT INTO price_paid/);
  });
});

describe("the bulk CSV reader", () => {
  it("reads quoted fields, embedded commas and doubled quotes", async () => {
    const records: string[][] = [];
    for await (const record of streamCsvRecords(['A,B\r\n"Minerva House, 12","say ""hi"""\n1,2'])) {
      records.push(record as string[]);
    }
    expect(records).toEqual([
      ["A", "B"],
      ["Minerva House, 12", 'say "hi"'],
      ["1", "2"],
    ]);
  });

  it("maps columns by header name, not position", async () => {
    const certs: Record<string, string>[] = [];
    for await (const c of streamCertificates(
      streamCsvRecords([
        "POSTCODE,ADDRESS1,POST_TOWN,ADDRESS2,ADDRESS3\nCM1 6ER,49,Chelmsford,George Heard Crescent,",
      ]),
    )) {
      certs.push(c as Record<string, string>);
    }
    expect(certs).toEqual([
      {
        line1: "49",
        line2: "George Heard Crescent",
        line3: "",
        postTown: "Chelmsford",
        postcode: "CM1 6ER",
      },
    ]);
  });

  it("fails loudly on a file with no address columns", async () => {
    const read = async () => {
      for await (const c of streamCertificates(streamCsvRecords(["FOO,BAR\n1,2"]))) {
        void c;
      }
    };
    await expect(read()).rejects.toThrow(/not the register's domestic certificate file/);
  });
});

describe("the fixture pass — the acceptance witnesses", () => {
  it("files Beaulieu's 49 homes and KT17's 25 flats, no merges", async () => {
    const db = new FakePickingDb();
    const certs = await fixtureCertificates();
    expect(certs).toHaveLength(128);
    const stats = await stageEpcIndex(db as never, certs);
    expect(stats.certificatesRead).toBe(128);
    expect(stats.refusedTotal).toBe(0);

    const beaulieu = db.epcStage.filter((r) => r.postcode === "CM1 6ER");
    expect(new Set(beaulieu.map((r) => r.home_key)).size).toBe(49);
    const kt17 = db.epcStage.filter((r) => r.postcode === "KT17 1FH");
    expect(new Set(kt17.map((r) => r.home_key)).size).toBe(25);
    // The wrong-merge negative: two flats in one building
    // are two homes.
    const keys = new Set(kt17.map((r) => r.home_key));
    expect(keys.has("MINERVA HOUSE 12|FLAT 4|CERES CRESCENT")).toBe(true);
    expect(keys.has("MINERVA HOUSE 12|FLAT 5|CERES CRESCENT")).toBe(true);
    expect(keys.has("JUNO HOUSE 16|FLAT 8|CERES CRESCENT")).toBe(true);
  });

  it("drives the committed fixture directory through the --file path itself", async () => {
    const db = new FakePickingDb();
    await loadPickingIndexFromLines(db as never, salesLines, {
      edition: "fixture",
      log: () => {},
    });
    const { stats, counts } = await loadEpcIndexFromFile(
      db as never,
      path.join(repoRoot, "tests/fixtures/epc-index"),
      { log: () => {} },
    );
    expect(stats.certificatesRead).toBe(128);
    expect(stats.refusedTotal).toBe(0);
    if (!counts) throw new Error("unreachable: the pass files or throws");
    expect(counts.postcodes).toBe(4);
    expect(db.index.filter((r) => r.postcode === "CM1 6ER")).toHaveLength(49);
  });

  it("files the union: Beaulieu flips to EPC-covered, Minerva merges onto the sales key", async () => {
    const db = new FakePickingDb();
    // Sales first (the fixture slice: CM3 + E16 only).
    await loadPickingIndexFromLines(db as never, salesLines, {
      edition: "fixture",
      log: () => {},
    });
    const logs: string[] = [];
    const { counts } = await loadEpcIndexFromCertificates(
      db as never,
      await fixtureCertificates(),
      { edition: "2026-11-18", log: (line: string) => logs.push(line) },
    );
    expect(logs.join("\n")).toContain("128 certificates read, 0 refused");

    const beaulieu = db.index.filter((r) => r.postcode === "CM1 6ER");
    expect(beaulieu).toHaveLength(49);
    expect(beaulieu.every((r) => r.sources.includes("epc"))).toBe(true);
    expect(beaulieu.every((r) => !r.sources.includes("sales"))).toBe(true);

    // The EPC extract's own counts are the loader's proof.
    const epcEdition = db.editions.find((e) => e.source === "epc");
    expect(epcEdition?.edition).toBe("2026-11-18");
    expect(epcEdition?.postcodes).toBe(4);
    if (!counts) throw new Error("unreachable: the pass files or throws");
    expect(counts.homes).toBe(epcEdition?.homes);
    expect(counts.homes).toBeGreaterThan(49 + 25);
  });

  it("on collision the sales parts win and EPC provenance is retained", async () => {
    const db = new FakePickingDb();
    await loadPickingIndexFromLines(db as never, salesLines, {
      edition: "fixture",
      log: () => {},
    });
    await loadEpcIndexFromCertificates(db as never, await fixtureCertificates(), {
      edition: "2026-11-18",
      log: () => {},
    });
    // 19 Birkdale Rise is filed by BOTH sources in the
    // fixture world: one served row, the sales form, both
    // provenances.
    const rows = db.index.filter(
      (r) => r.postcode === "CM3 2JT" && r.home_key === "19||BIRKDALE RISE",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      paon: "19",
      street: "BIRKDALE RISE",
      town: "CHELMSFORD",
      sources: ["sales", "epc"],
      sales_edition: "fixture",
      epc_edition: "2026-11-18",
    });
  });
});

describe("the kill switch — EPC separability, tested", () => {
  it("removes every EPC-derived row; sales rows byte-identical", async () => {
    const db = new FakePickingDb();
    await loadPickingIndexFromLines(db as never, salesLines, {
      edition: "fixture",
      log: () => {},
    });
    const salesOnly = JSON.stringify(db.index.filter((r) => r.sources.includes("sales")));
    await loadEpcIndexFromCertificates(db as never, await fixtureCertificates(), {
      edition: "2026-11-18",
      log: () => {},
    });
    expect(db.index.some((r) => r.sources.includes("epc"))).toBe(true);

    await removeEpcFromIndex(db as never);

    // (i) EPC-only rows are gone.
    expect(db.index.filter((r) => r.postcode === "CM1 6ER")).toHaveLength(0);
    expect(db.index.filter((r) => r.postcode === "KT17 1FH")).toHaveLength(0);
    expect(db.index.every((r) => !r.sources.includes("epc"))).toBe(true);
    // (ii)+(iii): what remains is exactly the sales-only
    // index — merged rows keep their sales parts with the
    // EPC tag stripped (the sales-only snapshot's rows
    // carry epc_edition null, as the rebuilt rows do).
    expect(JSON.stringify(db.index)).toBe(salesOnly);
    // The EPC EXTRACT is retained: the switch governs
    // what serves, and a later EPC pass rebuilds the
    // union from it.
    expect(db.epcExtract.length).toBeGreaterThan(0);
  });
});

describe("load-epc-index — the CLI", () => {
  it("takes --file or --kill-switch, never postcodes", () => {
    expect(parseArgs(["--file", "drop"])).toEqual({
      fileDir: "drop",
      killSwitch: false,
    });
    expect(parseArgs(["--kill-switch"])).toEqual({
      fileDir: null,
      killSwitch: true,
    });
    expect(() => parseArgs(["CM1 6ER"])).toThrow(/takes no postcodes/);
    expect(() => parseArgs(["--file", "x", "--kill-switch"])).toThrow(/runs alone/);
  });
});
