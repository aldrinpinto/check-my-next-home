// The picking union's build-and-rename swap (BUG-202,
// the loader staging audit's slimming of the two
// picking passes' shared filing machinery): the union
// is constructed under its build name
// (picking_index_build), indexed once on the finished
// copy, and swapped into the served name by rename —
// never deleted and re-inserted beside its own old
// rows. Driven over the fake picking database, which
// records every statement issued, so the shape itself
// is pinned, not just its outcome.
//
// The load-bearing pins:
//   - the swap's statement shape, in order: build
//     under the build name, indexes on the finished
//     copy, two renames, the retired copy dropped, the
//     build's indexes renamed to the served names —
//     and no DELETE FROM picking_index anywhere;
//   - both passes (sales and EPC) drive the identical
//     shape through the one shared path, and the kill
//     switch rebuilds through it too, from the sales
//     extract alone;
//   - a failure at the swap — or after it, in the
//     street rebuild — rolls the whole filing back:
//     the old union serves on, and no build or retired
//     copy is left behind.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  loadEpcIndexFromCertificates,
  streamCertificates,
  streamCsvRecords,
} from "../loaders/load-epc-index.mjs";
import { loadPickingIndexFromLines } from "../loaders/load-picking-index.mjs";
import { removeEpcFromIndex } from "../loaders/picking-index-filing.mjs";
import { FakePickingDb } from "./fixtures/picking-index";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, "..");
const salesLines = readFileSync(
  path.join(repoRoot, "tests/fixtures/picking-index/pp-complete.csv"),
  "utf8",
)
  .split(/\r?\n/)
  .filter((line) => line.trim() !== "");
const fixtureCsv = readFileSync(
  path.join(repoRoot, "tests/fixtures/epc-index/certificates.csv"),
  "utf8",
);

async function fixtureCertificates() {
  const certs: Record<string, string>[] = [];
  for await (const cert of streamCertificates(streamCsvRecords([fixtureCsv]))) {
    certs.push(cert as Record<string, string>);
  }
  return certs;
}

// The swap's statements, in issue order, each reduced
// to its tag — the filing's other statements (staging,
// counts, the extract swap, the editions row) are not
// the swap and are filtered out.
const SWAP_TAGS: [string, string][] = [
  ["DROP TABLE IF EXISTS picking_index_build", "clear-stale-build"],
  ["DROP TABLE IF EXISTS picking_index_retired", "clear-stale-retired"],
  ["CREATE TABLE picking_index_build", "create-build"],
  ["INSERT INTO picking_index_build", "fill-build"],
  ["ALTER TABLE picking_index_build ADD PRIMARY KEY", "build-primary-key"],
  ["CREATE INDEX picking_index_build_postcode_idx", "build-postcode-index"],
  ["CREATE INDEX picking_index_build_postcode_prefix_idx", "build-prefix-index"],
  ["ALTER TABLE picking_index RENAME TO picking_index_retired", "retire-served"],
  ["ALTER TABLE picking_index_build RENAME TO picking_index", "promote-build"],
  ["DROP TABLE picking_index_retired", "drop-retired"],
  ["ALTER INDEX picking_index_build_pkey RENAME TO picking_index_pkey", "rename-pkey"],
  [
    "ALTER INDEX picking_index_build_postcode_idx RENAME TO picking_index_postcode_idx",
    "rename-postcode-index",
  ],
  [
    "ALTER INDEX picking_index_build_postcode_prefix_idx RENAME TO picking_index_postcode_prefix_idx",
    "rename-prefix-index",
  ],
];

const EXPECTED_SWAP_SHAPE = SWAP_TAGS.map(([, tag]) => tag);

function swapShape(statements: string[]): string[] {
  const shape: string[] = [];
  for (const sql of statements) {
    const hit = SWAP_TAGS.find(([prefix]) => sql.startsWith(prefix));
    if (hit) shape.push(hit[1]);
  }
  return shape;
}

async function fileSalesPass(db: FakePickingDb, edition = "fixture") {
  await loadPickingIndexFromLines(db as never, salesLines, {
    edition,
    log: () => {},
  });
}

async function fileEpcPass(db: FakePickingDb) {
  await loadEpcIndexFromCertificates(db as never, await fixtureCertificates(), {
    edition: "2026-11-18",
    log: () => {},
  });
}

describe("the union rebuild — build under a fresh name, swap by rename", () => {
  it("the sales pass drives the full swap shape, and never deletes the served table", async () => {
    const db = new FakePickingDb();
    await fileSalesPass(db);
    expect(swapShape(db.statements)).toEqual(EXPECTED_SWAP_SHAPE);
    expect(db.statements).not.toContain("DELETE FROM picking_index");
    expect(db.statements.some((sql) => sql.startsWith("INSERT INTO picking_index (postcode"))).toBe(
      false,
    );
    // The filed union serves, and the swap left no
    // build or retired copy behind.
    expect(db.index).toHaveLength(34);
    expect(db.indexBuild).toBeNull();
    expect(db.indexRetired).toBeNull();
  });

  it("the EPC pass drives the identical shape through the shared machinery", async () => {
    const db = new FakePickingDb();
    await fileSalesPass(db);
    db.statements.length = 0;
    await fileEpcPass(db);
    expect(swapShape(db.statements)).toEqual(EXPECTED_SWAP_SHAPE);
    expect(db.statements).not.toContain("DELETE FROM picking_index");
    // The union the swap promoted is the merged one.
    expect(db.index.filter((r) => r.postcode === "CM1 6ER")).toHaveLength(49);
    expect(db.index.some((r) => r.sources.includes("epc"))).toBe(true);
    expect(db.indexBuild).toBeNull();
    expect(db.indexRetired).toBeNull();
  });

  it("a failure at the swap leaves the old union serving and nothing behind", async () => {
    const db = new FakePickingDb();
    await fileSalesPass(db);
    const beforeIndex = JSON.stringify(db.index);
    const beforeEditions = JSON.stringify(db.editions);
    db.failOn = "ALTER TABLE picking_index_build RENAME TO picking_index";
    await expect(fileSalesPass(db, "fixture-2")).rejects.toThrow(/injected failure/);
    db.failOn = null;
    expect(JSON.stringify(db.index)).toBe(beforeIndex);
    expect(JSON.stringify(db.editions)).toBe(beforeEditions);
    expect(db.indexBuild).toBeNull();
    expect(db.indexRetired).toBeNull();
  });

  it("a failure after the swap, in the street rebuild, still rolls the filing back whole", async () => {
    const db = new FakePickingDb();
    await fileSalesPass(db);
    const beforeIndex = JSON.stringify(db.index);
    const beforeStreets = JSON.stringify(db.streets);
    const beforeEditions = JSON.stringify(db.editions);
    db.failOn = "DELETE FROM picking_streets";
    await expect(fileSalesPass(db, "fixture-2")).rejects.toThrow(/injected failure/);
    db.failOn = null;
    // The renames happened before the failure — and
    // the rollback undid them with everything else.
    expect(JSON.stringify(db.index)).toBe(beforeIndex);
    expect(JSON.stringify(db.streets)).toBe(beforeStreets);
    expect(JSON.stringify(db.editions)).toBe(beforeEditions);
    expect(db.indexBuild).toBeNull();
    expect(db.indexRetired).toBeNull();
  });

  it("the kill switch rebuilds through the same swap, from the sales extract alone", async () => {
    const db = new FakePickingDb();
    await fileSalesPass(db);
    await fileEpcPass(db);
    db.statements.length = 0;
    await removeEpcFromIndex(db as never);
    expect(swapShape(db.statements)).toEqual(EXPECTED_SWAP_SHAPE);
    const fill = db.statements.find((sql) => sql.startsWith("INSERT INTO picking_index_build"));
    expect(fill).toBeDefined();
    expect(fill).not.toContain("FULL OUTER JOIN");
    expect(db.index.every((r) => !r.sources.includes("epc"))).toBe(true);
    expect(db.index.filter((r) => r.postcode === "CM1 6ER")).toHaveLength(0);
    expect(db.indexBuild).toBeNull();
    expect(db.indexRetired).toBeNull();
  });
});
