// The picking index's sales pass (plan step M7.15B):
// the streaming loader, its SQL dedupe, the golden
// proof, the DISTINCT-count proof and the tolerance
// refusal — driven over the fake picking database
// (tests/fixtures/picking-index.ts), the charging-zones
// fake-pool pattern: the loader's exported functions
// against a recording, simulating client, no database.
//
// The load-bearing pins:
//   - the loader NEVER writes price_paid (source pin +
//     the fake holds no price_paid writes to make);
//   - streaming shape: the fixture file's 40 real
//     transactions file 34 distinct homes (repeat sales
//     dedupe in SQL, not in memory);
//   - two flats in one building never collapse into one
//     home (the wrong-merge negative), on a generated
//     district-sized slice;
//   - a re-extract whose distinct count moves beyond
//     tolerance is refused and files nothing;
//   - the edition swap is atomic: a failure mid-swap
//     leaves the previous edition serving.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  GOLDEN_PICKING_ROWS,
  loadPickingIndexFromFile,
  loadPickingIndexFromLines,
  parseArgs,
  partsFromRecord,
  stagePickingIndex,
  streamPickingParts,
  verifyGoldenPickingRows,
} from "../loaders/load-picking-index.mjs";
import { FakePickingDb } from "./fixtures/picking-index";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, "..");
const loaderSource = readFileSync(path.join(repoRoot, "loaders/load-picking-index.mjs"), "utf8");
const fixtureLines = readFileSync(
  path.join(repoRoot, "tests/fixtures/picking-index/pp-complete.csv"),
  "utf8",
)
  .split(/\r?\n/)
  .filter((line) => line.trim() !== "");

function ppdLine(fields: {
  id: string;
  postcode: string;
  paon: string;
  saon?: string;
  street: string;
  town?: string;
}): string {
  const values = [
    fields.id,
    "250000",
    "2024-05-01 00:00",
    fields.postcode,
    "T",
    "N",
    "F",
    fields.paon,
    fields.saon ?? "",
    fields.street,
    "",
    fields.town ?? "TESTTOWN",
    "TEST DISTRICT",
    "TEST COUNTY",
    "A",
    "A",
  ];
  return values.map((v) => `"${v}"`).join(",");
}

describe("load-picking-index — the CLI takes no postcodes, by design", () => {
  it("accepts the nation (no args) or one --file directory", () => {
    expect(parseArgs([])).toEqual({ fileDir: null });
    expect(parseArgs(["--file", "tests/fixtures/picking-index"])).toEqual({
      fileDir: "tests/fixtures/picking-index",
    });
  });

  it("errors on a postcode instead of silently dropping its slot", () => {
    expect(() => parseArgs(["CM3 2JT"])).toThrow(/takes no postcodes/);
    expect(() => parseArgs(["--", "CM3 2JT"])).toThrow(/takes no postcodes/);
    expect(() => parseArgs(["--file"])).toThrow(/--file needs a directory/);
  });
});

describe("load-picking-index — price_paid is never written", () => {
  it("the loader source contains no write to price_paid", () => {
    expect(loaderSource).not.toMatch(/INSERT INTO price_paid/);
    expect(loaderSource).not.toMatch(/UPDATE price_paid/);
    expect(loaderSource).not.toMatch(/DELETE FROM price_paid/);
    expect(loaderSource).not.toMatch(/TRUNCATE price_paid/);
  });

  it("carries the sold-prices loader's record logic as its own copy", () => {
    // load-sold-prices.mjs runs its main on import (no
    // import guard), so the parser is copied, not
    // imported — the comment in the loader says so.
    expect(loaderSource).toContain("runs its main on import");
    expect(loaderSource).not.toContain('from "./load-sold-prices.mjs"');
  });

  it("the copied parser reads the golden fixture to the golden figures", async () => {
    // Behavioural parity with load-sold-prices.mjs's own
    // golden check: 19 Birkdale Rise, £588,995, 15 Jun 2023.
    const { parsePpdLine, toRecord } = await import("../loaders/load-picking-index.mjs");
    const records = fixtureLines
      .map((line) => toRecord(parsePpdLine(line)))
      .filter((r) => r !== null);
    const golden = records.filter(
      (r) => r.postcode === "CM3 2JT" && r.paon === "19" && r.street === "BIRKDALE RISE",
    );
    expect(golden).toHaveLength(1);
    expect(golden[0].price).toBe(588995);
    expect(golden[0].saleDate).toBe("2023-06-15");
  });
});

describe("partsFromRecord", () => {
  it("keeps the parts and files empty strings as null", () => {
    expect(
      partsFromRecord({
        postcode: "CM3 2JT",
        paon: "19",
        saon: "",
        street: "BIRKDALE RISE",
        town: "CHELMSFORD",
      }),
    ).toEqual({
      postcode: "CM3 2JT",
      paon: "19",
      saon: null,
      street: "BIRKDALE RISE",
      town: "CHELMSFORD",
    });
  });

  it("refuses a row that cannot name a home", () => {
    expect(
      partsFromRecord({ postcode: "", paon: "19", saon: "", street: "X", town: "" }),
    ).toBeNull();
    expect(
      partsFromRecord({ postcode: "CM3 2JT", paon: "", saon: "", street: "", town: "" }),
    ).toBeNull();
  });
});

describe("the fixture pass — real rows, SQL dedupe", () => {
  it("streams 40 transactions into 40 staged rows, malformed counted", async () => {
    const batches: unknown[][] = [];
    const stats = await streamPickingParts(fixtureLines, async (batch: unknown[]) => {
      batches.push(batch);
    });
    expect(stats).toEqual({ rowsRead: 40, malformed: 0, unusable: 0 });
    expect(batches.flat()).toHaveLength(40);
  });

  it("files 34 distinct homes over 2 postcodes, golden proof green", async () => {
    const db = new FakePickingDb();
    const logs: string[] = [];
    const { counts } = await loadPickingIndexFromLines(db as never, fixtureLines, {
      edition: "fixture",
      log: (line: string) => logs.push(line),
    });
    expect(counts).toEqual({ postcodes: 2, homes: 34, streets: 2 });
    expect(logs.join("\n")).toContain("34 distinct homes");
    expect(logs.join("\n")).toContain("2 distinct postcodes");
    expect(logs.join("\n")).toContain("2 distinct streets-with-town");

    const birkdale = db.index.filter((r) => r.postcode === "CM3 2JT");
    expect(birkdale).toHaveLength(27);
    const golden = db.index.find((r) => r.home_key === "19||BIRKDALE RISE");
    expect(golden).toMatchObject({
      postcode: "CM3 2JT",
      paon: "19",
      street: "BIRKDALE RISE",
      town: "CHELMSFORD",
      sources: ["sales"],
      sales_edition: "fixture",
    });
    // The editions row carries the proof counts.
    const edition = db.editions.find((e) => e.source === "sales");
    expect(edition).toMatchObject({
      edition: "fixture",
      postcodes: 2,
      homes: 34,
      streets: 2,
      previous_homes: null,
    });
    // The derived street table (M7.15C, migration 0031)
    // rebuilt with the union: one row per (street,
    // postcode), its town and home count riding with it.
    expect(db.streets).toHaveLength(2);
    expect(db.streets).toContainEqual({
      street_norm: "BIRKDALE RISE",
      street_display: "BIRKDALE RISE",
      town: "CHELMSFORD",
      town_norm: "CHELMSFORD",
      postcode: "CM3 2JT",
      home_count: 27,
    });
    expect(db.streets).toContainEqual({
      street_norm: "EXETER ROAD",
      street_display: "EXETER ROAD",
      town: "LONDON",
      town_norm: "LONDON",
      postcode: "E16 1GN",
      home_count: 7,
    });
  });

  it("drives the committed fixture directory through the --file path itself", async () => {
    const db = new FakePickingDb();
    const { counts } = await loadPickingIndexFromFile(
      db as never,
      path.join(repoRoot, "tests/fixtures/picking-index"),
      { log: () => {} },
    );
    expect(counts).toEqual({ postcodes: 2, homes: 34, streets: 2 });
  });

  it("is idempotent: a second identical pass files the same index", async () => {
    const db = new FakePickingDb();
    await loadPickingIndexFromLines(db as never, fixtureLines, {
      edition: "fixture",
      log: () => {},
    });
    const first = JSON.stringify(db.index);
    const { counts } = await loadPickingIndexFromLines(db as never, fixtureLines, {
      edition: "fixture-2",
      log: () => {},
    });
    expect(counts).toEqual({ postcodes: 2, homes: 34, streets: 2 });
    expect(JSON.stringify(db.index)).toBe(first.replaceAll("fixture", "fixture-2"));
    const edition = db.editions.find((e) => e.source === "sales");
    expect(edition?.previous_homes).toBe(34);
  });
});

describe("the district-sized slice — flats never merge", () => {
  // 200 houses sold twice each + a 40-flat block in one
  // building + malformed and unusable lines, generated
  // in-test (a committed slice this size would be noise).
  function districtLines(): string[] {
    const lines: string[] = [];
    for (let n = 1; n <= 200; n += 1) {
      for (const id of [`h${n}a`, `h${n}b`]) {
        lines.push(
          ppdLine({
            id,
            postcode: "TS1 1AA",
            paon: String(n),
            street: "DISTRICT ROAD",
          }),
        );
      }
    }
    for (let f = 1; f <= 40; f += 1) {
      lines.push(
        ppdLine({
          id: `f${f}`,
          postcode: "TS1 1AA",
          paon: "DISTRICT HOUSE, 1",
          saon: `FLAT ${f}`,
          street: "DISTRICT ROAD",
        }),
      );
    }
    lines.push("this is not a ppd line");
    lines.push(ppdLine({ id: "nopc", postcode: "", paon: "1", street: "DISTRICT ROAD" }));
    return lines;
  }

  it("files 240 distinct homes; Flat 4 and Flat 5 stay separate homes", async () => {
    const db = new FakePickingDb();
    const stats = await stagePickingIndex(db as never, districtLines());
    expect(stats.rowsRead).toBe(442);
    expect(stats.malformed).toBe(1);
    expect(stats.unusable).toBe(1);
    expect(db.salesStage).toHaveLength(440);

    const { stagedCounts } = await import("../loaders/picking-index-filing.mjs");
    const staged = await stagedCounts(db as never, "sales");
    expect(staged).toEqual({ postcodes: 1, homes: 240 });

    const keys = new Set(db.salesStage.map((r) => r.home_key));
    expect(keys.has("DISTRICT HOUSE 1|FLAT 4|DISTRICT ROAD")).toBe(true);
    expect(keys.has("DISTRICT HOUSE 1|FLAT 5|DISTRICT ROAD")).toBe(true);
  });
});

describe("the tolerance refusal and the atomic swap", () => {
  it("refuses a re-extract that shrinks the nation beyond tolerance", async () => {
    const db = new FakePickingDb();
    await loadPickingIndexFromLines(db as never, fixtureLines, {
      edition: "fixture",
      log: () => {},
    });
    const before = JSON.stringify(db.index);
    const tiny = [
      ppdLine({ id: "x1", postcode: "TS1 1AA", paon: "1", street: "ONLY ROAD" }),
      ppdLine({ id: "x2", postcode: "TS1 1AA", paon: "2", street: "ONLY ROAD" }),
    ];
    await expect(
      loadPickingIndexFromLines(db as never, tiny, {
        edition: "truncated",
        log: () => {},
      }),
    ).rejects.toThrow(/refused/);
    // Nothing swapped; the refusal is on the record.
    expect(JSON.stringify(db.index)).toBe(before);
    const edition = db.editions.find((e) => e.source === "sales");
    expect(edition?.homes).toBe(34);
    expect(edition?.last_rejected_homes).toBe(2);
  });

  it("a failure mid-swap rolls the whole filing back", async () => {
    const db = new FakePickingDb();
    await loadPickingIndexFromLines(db as never, fixtureLines, {
      edition: "fixture",
      log: () => {},
    });
    const beforeIndex = JSON.stringify(db.index);
    const beforeEditions = JSON.stringify(db.editions);
    db.failOn = "INSERT INTO picking_index (postcode";
    await expect(
      loadPickingIndexFromLines(db as never, fixtureLines, {
        edition: "fixture-2",
        log: () => {},
      }),
    ).rejects.toThrow(/injected failure/);
    db.failOn = null;
    expect(JSON.stringify(db.index)).toBe(beforeIndex);
    expect(JSON.stringify(db.editions)).toBe(beforeEditions);
  });
});

describe("verifyGoldenPickingRows", () => {
  it("names the missing golden home", () => {
    expect(() => verifyGoldenPickingRows({})).toThrow(/19 BIRKDALE RISE/);
    const rows = {
      "CM3 2JT": [
        {
          home_key: GOLDEN_PICKING_ROWS[0].homeKey,
          paon: "19",
          saon: null,
          street: "BIRKDALE RISE",
          town: "CHELMSFORD",
        },
      ],
      "E16 1GN": [
        {
          home_key: GOLDEN_PICKING_ROWS[1].homeKey,
          paon: "6",
          saon: null,
          street: "EXETER ROAD",
          town: "LONDON",
        },
      ],
    };
    expect(() => verifyGoldenPickingRows(rows)).not.toThrow();
  });
});
