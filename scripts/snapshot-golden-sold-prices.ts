// The golden sold-prices snapshot tool (Price Paid national
// step, adopted prep — "the golden proof"): it captures the
// SERVED sold-prices figures for the five golden postcodes
// exactly as the report's brain composes them today, so a
// national pass can be proved lossless by diffing the
// snapshot taken after it against the one taken before. The
// figures come from lib/sold-prices.ts's own bundle builder —
// the same composition the report serves — never from a
// re-derivation here.
//
// The entry shape is the worker runner's
// (scripts/fulfil-reports.ts): the work lives inside main(),
// the module runs it ONLY when executed directly (BUG-107's
// discipline), and the server machinery is imported
// dynamically inside main(), so importing this module is
// side-effect-free.
//
// Usage:
//   npm run snapshot:golden-sold-prices -- before.json
//   npm run snapshot:golden-sold-prices -- --diff before.json after.json
// The diff form prints every differing path and exits 1 when
// any figure moved (the snapshot's own timestamp aside).
// Environment: the server's own .env.local (DATABASE_URL).
// Run it only against a register where the five postcodes
// are already filed — a postcode with no filed rows refuses,
// rather than triggering the brain's cold load.

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  AddressQueryable,
  AddressResolution,
  DirectoryPostcode,
  ResolvedAddress,
} from "../lib/address";
import { buildSoldPricesBundle, createSoldPricesSource } from "../lib/sold-prices";

// The five golden postcodes (the loader's own golden set):
// the Birkdale street, the Capital East street and building,
// Minerva House, and the TR8 village.
export const GOLDEN_SOLD_POSTCODES = [
  "CM3 2JT",
  "E16 1GN",
  "KT17 1FH",
  "E16 1AS",
  "TR8 4LX",
] as const;

// The three golden homes whose rung-1 own-history figures are
// part of the proof (the prep names all three; their filed
// address parts are the loader's golden facts).
const GOLDEN_HOMES: Record<string, { paon: string; saon: string | null; street: string }> = {
  "CM3 2JT": { paon: "19", saon: null, street: "BIRKDALE RISE" },
  "E16 1GN": { paon: "6", saon: null, street: "EXETER ROAD" },
  "KT17 1FH": { paon: "MINERVA HOUSE, 12", saon: "FLAT 4", street: "CERES CRESCENT" },
};

export interface GoldenSoldSnapshot {
  takenAt: string;
  postcodes: Record<string, unknown>;
}

function directoryPostcode(postcode: string): DirectoryPostcode {
  return {
    postcode,
    latitude: 0,
    longitude: 0,
    council: null,
    ward: null,
    region: null,
    lsoaCode: null,
    msoaCode: null,
  };
}

function rung2Resolution(postcode: string): AddressResolution {
  return {
    rung: 2,
    kind: "address-list",
    directory: directoryPostcode(postcode),
    street: null,
    building: null,
    addresses: [],
  };
}

function rung1Resolution(
  postcode: string,
  home: { paon: string; saon: string | null; street: string },
): AddressResolution {
  const address: ResolvedAddress = {
    postcode,
    paon: home.paon,
    saon: home.saon,
    street: home.street,
    locality: null,
    town: null,
    label: "",
  };
  return { rung: 1, kind: "home", address, directory: directoryPostcode(postcode) };
}

function buildingResolution(
  postcode: string,
  paon: string,
  addresses: ResolvedAddress[],
): AddressResolution {
  return {
    rung: 2,
    kind: "address-list",
    directory: directoryPostcode(postcode),
    street: null,
    // The gate only: the served building name is derived by
    // the brain from the filed PAON itself.
    building: paon,
    addresses,
  };
}

// The bundle is plain served data; a JSON round-trip pins the
// snapshot to exactly what would be served, nothing live.
function servedFigure(bundle: unknown): unknown {
  return JSON.parse(JSON.stringify(bundle)) as unknown;
}

// Captures one postcode's served figures: the rung-2 bundle,
// the rung-1 bundle for its golden home where one is named, a
// building-narrowed rung-2 bundle over the postcode's modal
// filed building (the Capital East / TR8 building figures),
// and the sorted list of filed transaction ids — the
// register's own identity for the postcode, so a pass that
// swapped one sale for another of the same price still diffs.
export async function snapshotPostcode(
  db: AddressQueryable,
  postcode: string,
): Promise<Record<string, unknown>> {
  const source = createSoldPricesSource(db);
  const rows = await source.salesInPostcode(postcode);
  if (rows.length === 0) {
    throw new Error(
      `${postcode} has no filed sold prices — the snapshot proves a filed register; file it first (a cold postcode would make the brain load, which a proof tool must never trigger)`,
    );
  }
  const rung2 = await buildSoldPricesBundle(rung2Resolution(postcode), source);
  const home = GOLDEN_HOMES[postcode];
  const rung1 = home ? await buildSoldPricesBundle(rung1Resolution(postcode, home), source) : null;

  const byPaon = new Map<string, typeof rows>();
  for (const row of rows) {
    if (row.paon === null) continue;
    const group = byPaon.get(row.paon) ?? [];
    group.push(row);
    byPaon.set(row.paon, group);
  }
  const modal = [...byPaon.entries()].sort(
    (a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1),
  )[0];
  let building: Record<string, unknown> | null = null;
  if (modal) {
    const [paon, group] = modal;
    const addresses: ResolvedAddress[] = group.map((row) => ({
      postcode,
      paon: row.paon,
      saon: row.saon,
      street: row.street,
      locality: row.locality,
      town: row.town,
      label: "",
    }));
    const bundle = await buildSoldPricesBundle(
      buildingResolution(postcode, paon, addresses),
      source,
    );
    building = { paon, rung2: servedFigure(bundle) };
  }

  return {
    filedRows: rows.length,
    transactionIds: rows
      .map((row) => row.transactionId)
      .filter((id): id is string => id !== null)
      .sort(),
    rung2: servedFigure(rung2),
    rung1: rung1 ? servedFigure(rung1) : null,
    building,
  };
}

export async function snapshotGoldenSoldPrices(db: AddressQueryable): Promise<GoldenSoldSnapshot> {
  const postcodes: Record<string, unknown> = {};
  for (const postcode of GOLDEN_SOLD_POSTCODES) {
    postcodes[postcode] = await snapshotPostcode(db, postcode);
  }
  return { takenAt: new Date().toISOString(), postcodes };
}

// The before/after comparison: every path whose value moved,
// as "path: before → after". The snapshot's own timestamp is
// the one field allowed to differ.
export function diffSnapshots(before: unknown, after: unknown, path = ""): string[] {
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    return keys.flatMap((key) => {
      if (path === "" && key === "takenAt") return [];
      return diffSnapshots(before[key], after[key], path === "" ? key : `${path}.${key}`);
    });
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length !== after.length) {
      return [`${path}: ${before.length} entries → ${after.length} entries`];
    }
    return before.flatMap((value, index) =>
      diffSnapshots(value, after[index], `${path}[${index}]`),
    );
  }
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  return [`${path}: ${JSON.stringify(before)} → ${JSON.stringify(after)}`];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  if (argv[0] === "--diff") {
    const [, beforePath, afterPath] = argv;
    if (!beforePath || !afterPath) {
      throw new Error("usage: snapshot-golden-sold-prices --diff <before.json> <after.json>");
    }
    const before = JSON.parse(await readFile(beforePath, "utf8")) as unknown;
    const after = JSON.parse(await readFile(afterPath, "utf8")) as unknown;
    const diffs = diffSnapshots(before, after);
    if (diffs.length === 0) {
      console.log(
        "snapshot-golden-sold-prices: no differences — the served figures are identical.",
      );
      return 0;
    }
    console.log(`snapshot-golden-sold-prices: ${diffs.length} difference(s):`);
    for (const diff of diffs) console.log(`  ${diff}`);
    return 1;
  }
  const outPath = argv[0];
  if (!outPath) {
    throw new Error(
      "usage: snapshot-golden-sold-prices <out.json> | --diff <before.json> <after.json>",
    );
  }
  const { getDbPool } = await import("../lib/server/db");
  const pool = getDbPool();
  const db: AddressQueryable = {
    query: (text, params) => pool.query(text, params ? [...params] : undefined),
  };
  const snapshot = await snapshotGoldenSoldPrices(db);
  await writeFile(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  const counts = Object.entries(snapshot.postcodes)
    .map(([postcode, record]) => `${postcode} ${(record as { filedRows: number }).filedRows}`)
    .join(" · ");
  console.log(`snapshot-golden-sold-prices: wrote ${outPath} (${counts}).`);
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(
        `snapshot-golden-sold-prices FAILED: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exitCode = 1;
    });
}
