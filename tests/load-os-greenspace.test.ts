import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FILED_FUNCTIONS,
  SOURCE_NAME,
  decideGreenspaceAction,
  fileGreenspace,
  gbGeoPackageEntry,
  goldenChecks,
  haversineMiles,
  parseFiledStamp,
  parseGpkgGeometry,
  polygonAreaCentroid,
  productVersion,
  readGreenspaceFile,
  versionDate,
} from "../loaders/load-os-greenspace.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// OS Open Greenspace loader (plan step M5.6), tested against
// the radius-trimmed fixture in tests/fixtures/os-greenspace —
// a subset of the verified 2026-10 edition (GB GeoPackage md5
// 3d0c0c5e92c5dbf1d23d71b18530c962, the listing's own hash),
// cut from the same GeoPackage the live proof read, plus the
// captured product record and downloads listing. The golden
// figures are the M5.6 prep's verified reads
// (golden-reads.json, structured blocks).

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/os-greenspace");
const loaderSource = readFileSync(join(process.cwd(), "loaders/load-os-greenspace.mjs"), "utf8");

// The fixture GeoPackage travels base64-encoded (the repo's
// push channel is text-only; the loader decodes it the same
// way in fixture mode). The test decodes its own copy so the
// reads below use the real GeoPackage bytes.
const GPKG_PATH = join(mkdtempSync(join(tmpdir(), "cmnh-gs-test-")), "opgrsp_gb.gpkg");
writeFileSync(
  GPKG_PATH,
  Buffer.from(
    readFileSync(join(FIXTURE_DIR, "opgrsp_gb.gpkg.b64"), "utf8").replace(/\s+/g, ""),
    "base64",
  ),
);

const HOMES = {
  birkdale: { lat: 51.776176, lon: 0.60387 },
  exeter: { lat: 51.515224, lon: 0.021177 },
  cardiff: { lat: 51.467947, lon: -3.192837 },
};

describe("T2 — the listing oracle and the edition decision", () => {
  it("reads the GB GeoPackage entry out of the captured listing", () => {
    const downloads = JSON.parse(readFileSync(join(FIXTURE_DIR, "downloads.json"), "utf8"));
    const entry = gbGeoPackageEntry(downloads);
    expect(entry.md5).toBe("3d0c0c5e92c5dbf1d23d71b18530c962");
    expect(entry.size).toBe(58957224);
    expect(entry.fileName).toBe("opgrsp_gpkg_gb.zip");
  });

  it("reads the version from the captured product record", () => {
    const product = JSON.parse(readFileSync(join(FIXTURE_DIR, "product.json"), "utf8"));
    expect(productVersion(product)).toBe("2026-10");
    expect(versionDate("2026-10")).toBe("2026-10-01");
    expect(() => productVersion({})).toThrow();
    expect(() => versionDate("October 2026")).toThrow();
  });

  it("decides all three arms: unchanged is a healthy no-op, a changed md5 inside a version is a conflict, a new version files", () => {
    const filed = { version: "2026-10", md5: "3d0c0c5e92c5dbf1d23d71b18530c962" };
    expect(
      decideGreenspaceAction(
        { version: "2026-10", md5: "3d0c0c5e92c5dbf1d23d71b18530c962" },
        filed,
      ),
    ).toBe("noop");
    expect(decideGreenspaceAction({ version: "2026-10", md5: "a".repeat(32) }, filed)).toBe(
      "conflict",
    );
    expect(decideGreenspaceAction({ version: "2027-04", md5: "b".repeat(32) }, filed)).toBe("file");
    expect(decideGreenspaceAction({ version: "2026-10", md5: filed.md5 }, null)).toBe("file");
  });

  it("recovers the filed stamp from the loader's own summary lines", () => {
    expect(
      parseFiledStamp(
        "load-os-greenspace · 317730 points filed (89280 centres · 228450 access; Public Park Or Garden 22176 · Playing Field 21844 · Play Space 45260; version 2026-10 · md5 3d0c0c5e92c5dbf1d23d71b18530c962) — golden homes OK",
      ),
    ).toEqual({ version: "2026-10", md5: "3d0c0c5e92c5dbf1d23d71b18530c962" });
    expect(
      parseFiledStamp(
        "load-os-greenspace · OS Open Greenspace edition 2026-10 is unchanged (version 2026-10 · md5 3d0c0c5e92c5dbf1d23d71b18530c962) — the filed data is current, nothing to file — golden homes OK",
      ),
    ).toEqual({ version: "2026-10", md5: "3d0c0c5e92c5dbf1d23d71b18530c962" });
    expect(parseFiledStamp("some other line")).toBeNull();
    expect(parseFiledStamp(null)).toBeNull();
  });

  it("the loader refuses a same-version md5 change and an unverified download in its source", () => {
    expect(loaderSource).toContain("changed under its own version number");
    expect(loaderSource).toContain("refusing to file an unverified download");
    expect(loaderSource).toContain("decideGreenspaceAction");
  });
});

describe("geometry — the GeoPackage reader and the area centroid", () => {
  it("parses a point blob and rejects an unsupported type", () => {
    // GeoPackage header (magic GP, version 0, flags 0, srs 27700)
    // + little-endian WKB point (277000.5, 178000.25).
    const blob = new Uint8Array(8 + 5 + 16);
    blob.set([0x47, 0x50, 0x00, 0x00], 0);
    const view = new DataView(blob.buffer);
    view.setInt32(4, 27700, true);
    view.setUint8(8, 1);
    view.setUint32(9, 1, true);
    view.setFloat64(13, 277000.5, true);
    view.setFloat64(21, 178000.25, true);
    expect(parseGpkgGeometry(blob)).toEqual({
      type: "Point",
      coordinates: [277000.5, 178000.25],
    });
    const bad = new Uint8Array(blob);
    new DataView(bad.buffer).setUint32(9, 2, true); // a LineString — not a shape this loader files
    expect(() => parseGpkgGeometry(bad)).toThrow(/unsupported WKB/);
  });

  it("weights multipolygon parts by absolute area, so opposite windings cannot cancel", () => {
    // Two equal squares, the second wound in the opposite
    // direction: the centroid is the midpoint of the pair.
    // (The signed-area version of this computation put a real
    // ground's centre in the wrong place — see the loader.)
    const geometry = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ],
        ],
        [
          [
            [20, 0],
            [20, 10],
            [30, 10],
            [30, 0],
            [20, 0],
          ],
        ],
      ],
    };
    expect(polygonAreaCentroid(geometry)).toEqual([15, 5]);
    expect(
      polygonAreaCentroid({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [4, 0],
            [4, 4],
            [0, 4],
            [0, 0],
          ],
        ],
      }),
    ).toEqual([2, 2]);
  });
});

describe("the fixture read — reconciliation and the golden figures (T3)", () => {
  const read = readGreenspaceFile(GPKG_PATH, "2026-10-01");
  const centres = read.rows.filter((r) => r.pointRole === "centre");
  const access = read.rows.filter((r) => r.pointRole === "access");
  const dist = (home: keyof typeof HOMES, row: { lat: number; lon: number }) =>
    haversineMiles(HOMES[home].lat, HOMES[home].lon, row.lat, row.lon);
  const nearestNamed = (home: keyof typeof HOMES, rows: typeof read.rows) =>
    rows
      .filter((r) => r.name !== null)
      .map((r) => ({ row: r, d: dist(home, r) }))
      .sort((a, b) => a.d - b.d)[0];

  it("reconciles with an independent count of the subset GeoPackage", () => {
    const db = new DatabaseSync(GPKG_PATH, { readOnly: true });
    const siteCount = (
      db
        .prepare(
          `SELECT count(*) AS n FROM greenspace_site WHERE function IN (${FILED_FUNCTIONS.map(() => "?").join(",")})`,
        )
        .get(...FILED_FUNCTIONS) as { n: number }
    ).n;
    const keptIds = new Set(
      (
        db
          .prepare(
            `SELECT id FROM greenspace_site WHERE function IN (${FILED_FUNCTIONS.map(() => "?").join(",")})`,
          )
          .all(...FILED_FUNCTIONS) as { id: string }[]
      ).map((r) => r.id),
    );
    const accessCount = (
      db.prepare("SELECT ref_to_greenspace_site AS ref FROM access_point").all() as {
        ref: string;
      }[]
    ).filter((r) => keptIds.has(r.ref)).length;
    db.close();
    expect(read.sitesRead).toBe(siteCount);
    expect(centres.length).toBe(siteCount);
    expect(read.accessFiled).toBe(accessCount);
    expect(access.length).toBe(accessCount);
    expect(read.rows.length).toBe(siteCount + accessCount);
    expect(read.centresDropped).toBe(0);
  });

  it("stamps every row with the source, the edition date and a NULL osm_id (T12's Greenspace half)", () => {
    for (const row of read.rows) {
      expect(row.sourceName).toBe(SOURCE_NAME);
      expect(row.sourceName).toContain("© Crown Copyright");
      expect(row.sourceDate).toBe("2026-10-01");
      expect(row.osmId).toBeNull();
    }
    expect(SOURCE_NAME).toContain("OS Open Greenspace");
  });

  it("passes the loader's own golden checks on the fixture", () => {
    expect(goldenChecks(read.rows, read.functionCounts, { full: false })).toEqual([]);
  });

  it("Exeter: Canning Town Recreation Ground centre 0.316, its access points at 0.18, Fisher Street the nearest named park-or-garden at 0.275", () => {
    const ctrg = centres
      .filter((r) => r.name === "Canning Town Recreation Ground")
      .map((r) => ({ row: r, d: dist("exeter", r) }))
      .sort((a, b) => a.d - b.d)[0];
    expect(ctrg.row.fn).toBe("Playing Field");
    expect(ctrg.d).toBeCloseTo(0.316, 1);
    const ctrgAccess = access
      .filter((r) => r.name === "Canning Town Recreation Ground")
      .map((r) => dist("exeter", r))
      .sort((a, b) => a - b)[0];
    expect(ctrgAccess).toBeCloseTo(0.18, 1);
    const fisher = nearestNamed(
      "exeter",
      centres.filter((r) => r.fn === "Public Park Or Garden"),
    );
    expect(fisher.row.name).toBe("Fisher Street Open Space");
    expect(fisher.d).toBeCloseTo(0.275, 1);
  });

  it("an unnamed centre files nearer than any named one at Exeter — filed and counted, never served as a name (L3)", () => {
    const unnamed = centres
      .filter((r) => r.name === null)
      .map((r) => dist("exeter", r))
      .sort((a, b) => a - b)[0];
    expect(unnamed).toBeLessThan(0.1);
    expect(unnamed).toBeLessThan(nearestNamed("exeter", centres).d);
  });

  it("Keir Hardie Park is absent from this source (it is OSM-only — the merged serving needs both loaders)", () => {
    expect(read.rows.some((r) => r.name === "Keir Hardie Park")).toBe(false);
  });

  it("Birkdale and Cardiff: Strutt Memorial 0.219 and Sevenoaks Park 0.099 are the nearest named centres", () => {
    const strutt = nearestNamed("birkdale", centres);
    expect(strutt.row.name).toBe("Strutt Memorial Recreation Ground");
    expect(strutt.d).toBeCloseTo(0.219, 1);
    const sevenoaks = nearestNamed("cardiff", centres);
    expect(sevenoaks.row.name).toBe("Sevenoaks Park");
    expect(sevenoaks.d).toBeCloseTo(0.099, 1);
  });

  it("files through a stage-table swap, so a failed load leaves the last good data serving", () => {
    expect(loaderSource).toContain("CREATE TABLE IF NOT EXISTS greenspace_stage");
    expect(loaderSource).toContain("DELETE FROM greenspace_points");
    // BUG-368: the stage table is persistent now, not a
    // TEMP table dropped on commit — staging survives a
    // killed run as its resume point.
    expect(loaderSource).not.toContain("CREATE TEMP TABLE greenspace_stage");
    expect(loaderSource).not.toContain("ON COMMIT DROP");
  });
});

describe("filing — the stage-table transaction", () => {
  // The same CI run 98 failure as the places loader:
  // fileGreenspace created the ON COMMIT DROP stage BEFORE
  // its BEGIN, so in autocommit the stage was dropped again
  // by the end of its own CREATE statement and the first
  // staged insert failed with "relation greenspace_stage
  // does not exist" — a line the runner's log then hid
  // behind Node 22's ExperimentalWarning for node:sqlite,
  // which is why that failure looked like a sqlite problem.
  // BUG-368 changed the shape: the stage table is
  // persistent now and staging rides OUTSIDE any
  // transaction, so a killed run's staging survives as its
  // resume point; only the swap itself is a transaction,
  // opened in finishFiling. The order contract is pinned
  // against a recording fake pool (no Postgres in the
  // sandbox; CI is the proof).
  function recordingPool(failOn?: string) {
    const statements: string[] = [];
    let released = false;
    const client = {
      async query(sql: string) {
        const head = sql.trim().replace(/\s+/g, " ");
        statements.push(head);
        if (failOn && head.startsWith(failOn)) throw new Error(`forced failure: ${failOn}`);
        return { rows: [], rowCount: 0 };
      },
      release() {
        released = true;
      },
    };
    return { statements, released: () => released, pool: { connect: async () => client } };
  }

  const rows = [
    {
      osmId: null,
      name: "A Park",
      pointRole: "centre",
      lat: 51.5,
      lon: 0.02,
      sourceName: SOURCE_NAME,
      sourceDate: "2026-10-01",
    },
    {
      osmId: null,
      name: "A Park",
      pointRole: "access",
      lat: 51.51,
      lon: 0.005,
      sourceName: SOURCE_NAME,
      sourceDate: "2026-10-01",
    },
  ];

  it("stages outside the swap transaction — stage create first, BEGIN before the swap, COMMIT last", async () => {
    const rec = recordingPool();
    await fileGreenspace(rec.pool as never, rows as never, "2026-11-13T00:00:00Z");
    const at = (prefix: string) => rec.statements.findIndex((s) => s.startsWith(prefix));
    expect(rec.statements[0].startsWith("CREATE TABLE IF NOT EXISTS greenspace_stage")).toBe(true);
    expect(at("INSERT INTO greenspace_stage")).toBeGreaterThan(0);
    // The swap's BEGIN comes after the staging, before the
    // DELETE; the clear's DELETEs come after the swap's
    // COMMIT, and the clear's COMMIT is the last statement.
    expect(at("BEGIN")).toBeGreaterThan(at("INSERT INTO greenspace_stage"));
    expect(at("DELETE FROM greenspace_points")).toBeGreaterThan(at("BEGIN"));
    expect(at("INSERT INTO greenspace_points")).toBeGreaterThan(
      at("DELETE FROM greenspace_points"),
    );
    // The clear's DELETE (the last one — prepare() also
    // clears any orphan staging before the first insert)
    // comes after the swap's COMMIT.
    const lastAt = (prefix: string) => rec.statements.findLastIndex((s) => s.startsWith(prefix));
    expect(lastAt("DELETE FROM greenspace_stage")).toBeGreaterThan(
      at("INSERT INTO greenspace_points"),
    );
    expect(rec.statements.at(-1)).toBe("COMMIT");
    expect(rec.released()).toBe(true);
  });

  it("a failure mid-staging leaves the staged rows in place and still releases the client", async () => {
    const rec = recordingPool("INSERT INTO greenspace_stage");
    await expect(
      fileGreenspace(rec.pool as never, rows as never, "2026-11-13T00:00:00Z"),
    ).rejects.toThrow("forced failure");
    // No transaction is open during staging (BUG-368), so
    // there is nothing to roll back and nothing to commit:
    // the staging stays as the next run's resume point.
    expect(rec.statements).not.toContain("ROLLBACK");
    expect(rec.statements).not.toContain("COMMIT");
    expect(rec.released()).toBe(true);
  });
});

describe("filing — the schema contract", () => {
  // The same defect CI run 99 exposed in the places filer's
  // final INSERT ("column lat of relation osm_points does
  // not exist") was sitting in this filer's INSERT too —
  // lat/lon, the row objects' property names, where migration
  // 0001 defines latitude/longitude. This filer's copy of the
  // error never reached a log (the runner's summary showed
  // Node 22's node:sqlite ExperimentalWarning instead), so
  // the DDL cross-check is what finds it: the live table's
  // columns are parsed from the migration files themselves
  // and every column the filer issues is checked against
  // them. No Postgres needed.
  function liveTableColumns(table: string): Set<string> {
    const dir = join(process.cwd(), "db", "migrations");
    const cols = new Set<string>();
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith(".sql")) continue;
      const sql = readFileSync(join(dir, file), "utf8");
      const create = new RegExp(`CREATE TABLE ${table} \\(`).exec(sql);
      if (create) {
        // Walk to the matching close paren, then split the
        // body on top-level commas only — column definitions
        // carry their own parens (geometry(Point, 4326), the
        // generated geom CASE).
        let depth = 0;
        let end = -1;
        for (let i = create.index; i < sql.length; i++) {
          if (sql[i] === "(") depth++;
          else if (sql[i] === ")") {
            depth--;
            if (depth === 0) {
              end = i;
              break;
            }
          }
        }
        const body = sql.slice(sql.indexOf("(", create.index) + 1, end);
        const parts: string[] = [];
        let d = 0;
        let cur = "";
        for (const ch of body) {
          if (ch === "(") d++;
          else if (ch === ")") d--;
          if (ch === "," && d === 0) {
            parts.push(cur);
            cur = "";
          } else cur += ch;
        }
        if (cur.trim() !== "") parts.push(cur);
        for (const part of parts) {
          const name = part.trim().split(/\s+/)[0];
          if (name && !/^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN)$/i.test(name)) cols.add(name);
        }
      }
      for (const alter of sql.matchAll(
        new RegExp(`ALTER TABLE ${table}\\s+ADD COLUMN (\\w+)`, "g"),
      )) {
        cols.add(alter[1]);
      }
    }
    return cols;
  }

  function recordingPool() {
    const statements: string[] = [];
    const client = {
      async query(sql: string) {
        statements.push(sql.trim().replace(/\s+/g, " "));
        return { rows: [], rowCount: 0 };
      },
      release() {},
    };
    return { statements, pool: { connect: async () => client } };
  }

  const rows = [
    {
      osmId: null,
      name: "A Park",
      pointRole: "centre",
      lat: 51.5,
      lon: 0.02,
      sourceName: SOURCE_NAME,
      sourceDate: "2026-10-01",
    },
  ];

  function firstParenList(statement: string): string[] {
    const m = /\(([^)]+)\)/.exec(statement);
    return m ? m[1].split(",").map((c) => c.trim()) : [];
  }

  it("every column the filer inserts into greenspace_points exists in the migration DDL", async () => {
    const rec = recordingPool();
    await fileGreenspace(rec.pool as never, rows as never, "2026-11-13T00:00:00Z");
    const live = liveTableColumns("greenspace_points");
    // Sanity: the parser found the real contract, not nothing.
    expect(live.has("latitude")).toBe(true);
    expect(live.has("longitude")).toBe(true);
    expect(live.has("point_role")).toBe(true);
    const finalInsert = rec.statements.find((s) =>
      s.startsWith("INSERT INTO greenspace_points ("),
    )!;
    const target = firstParenList(finalInsert);
    expect(target.length).toBeGreaterThan(0);
    for (const col of target) expect(live.has(col)).toBe(true);
    // The identity and generated columns are the database's own.
    expect(target).not.toContain("id");
    expect(target).not.toContain("geom");
  });

  it("the stage table, the staged insert and the final SELECT agree with each other", async () => {
    const rec = recordingPool();
    await fileGreenspace(rec.pool as never, rows as never, "2026-11-13T00:00:00Z");
    const stageCreate = rec.statements.find((s) =>
      s.startsWith("CREATE TABLE IF NOT EXISTS greenspace_stage"),
    )!;
    const stageDefs = /\((.+)\)/.exec(stageCreate)![1];
    const stageCols = stageDefs.split(",").map((def) => def.trim().split(/\s+/)[0]);
    const stagedInsert = rec.statements.find((s) =>
      s.startsWith("INSERT INTO greenspace_stage ("),
    )!;
    for (const col of firstParenList(stagedInsert)) expect(stageCols).toContain(col);
    const finalInsert = rec.statements.find((s) =>
      s.startsWith("INSERT INTO greenspace_points ("),
    )!;
    const selectList = /SELECT (.+) FROM greenspace_stage/
      .exec(finalInsert)![1]
      .split(",")
      .map((c) => c.trim());
    // Position for position: the target list and the SELECT
    // list are the same length, and every named SELECT item is
    // a stage column (the $1 loaded_at parameter aside).
    expect(selectList.length).toBe(firstParenList(finalInsert).length);
    for (const item of selectList) {
      if (/^[a-z_][a-z0-9_]*$/.test(item)) expect(stageCols).toContain(item);
    }
  });
});

describe("progress — BUG-265", () => {
  const collect = () => {
    const lines: string[] = [];
    return { lines, log: (line: string) => lines.push(line) };
  };

  function recordingPool(failOn?: string) {
    const statements: string[] = [];
    let released = false;
    const client = {
      async query(sql: string) {
        const head = sql.trim().replace(/\s+/g, " ");
        statements.push(head);
        if (failOn && head.startsWith(failOn)) throw new Error(`forced failure: ${failOn}`);
        return { rows: [], rowCount: 0 };
      },
      release() {
        released = true;
      },
    };
    return { statements, released: () => released, pool: { connect: async () => client } };
  }

  const rows = [
    {
      osmId: null,
      name: "A Park",
      pointRole: "centre",
      lat: 51.5,
      lon: 0.02,
      sourceName: SOURCE_NAME,
      sourceDate: "2026-10-01",
    },
    {
      osmId: null,
      name: "A Park",
      pointRole: "access",
      lat: 51.51,
      lon: 0.005,
      sourceName: SOURCE_NAME,
      sourceDate: "2026-10-01",
    },
  ];

  it("logs the filed points with a real percentage", async () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-os-greenspace", log });
    const rec = recordingPool();
    await fileGreenspace(rec.pool as never, rows as never, "2026-11-13T00:00:00Z", { progress });
    expect(lines.some((l) => /progress · file 2\/2 points \(100%\)$/.test(l))).toBe(true);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
    expect(rec.statements.at(-1)).toBe("COMMIT");
  });

  it("names a filing failure with the staged count and the resume point", async () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-os-greenspace", log });
    const rec = recordingPool("INSERT INTO greenspace_stage");
    await expect(
      fileGreenspace(rec.pool as never, rows as never, "2026-11-13T00:00:00Z", { progress }),
    ).rejects.toThrow("forced failure");
    expect(
      lines.some((l) =>
        /failed · file · filed 0 of 2 · forced failure: INSERT INTO greenspace_stage · resume from the start \(nothing staged yet\)/.test(
          l,
        ),
      ),
    ).toBe(true);
  });
});

describe("resume (BUG-368)", () => {
  // A fake pool whose client tracks the staged rows, the
  // live table and the loader_checkpoint row, with just
  // enough SQL to run the filer.
  type StagedRow = { name: string; pointRole: string; seq: number };
  type CheckpointRow = {
    loader: string;
    edition: string;
    expected: number | null;
    next_start_index: number;
    read_count: number;
    filed_count: number;
    state: Record<string, unknown> | null;
  };
  function createFakePool() {
    let staged: StagedRow[] = [];
    let live: StagedRow[] = [];
    const checkpoints = new Map<string, CheckpointRow>();
    let insertCalls = 0;
    let failAfterInserts: number | null = null;
    let snapshot: {
      staged: StagedRow[];
      live: StagedRow[];
      checkpoints: Map<string, CheckpointRow>;
    } | null = null;
    const statements: string[] = [];
    const client = {
      async query(sql: string, params: unknown[] = []) {
        const text = sql.replace(/\s+/g, " ");
        statements.push(text);
        if (text === "BEGIN") {
          snapshot = { staged: [...staged], live: [...live], checkpoints: new Map(checkpoints) };
          return { rows: [] };
        }
        if (text === "COMMIT") {
          snapshot = null;
          return { rows: [] };
        }
        if (text === "ROLLBACK") {
          if (snapshot) {
            staged = snapshot.staged;
            live = snapshot.live;
            checkpoints.clear();
            for (const [k, v] of snapshot.checkpoints) checkpoints.set(k, v);
          }
          snapshot = null;
          return { rows: [] };
        }
        if (/CREATE TABLE IF NOT EXISTS greenspace_stage/.test(text)) return { rows: [] };
        if (/INSERT INTO greenspace_stage/.test(text)) {
          insertCalls += 1;
          if (failAfterInserts !== null && insertCalls > failAfterInserts)
            throw new Error("simulated kill: the database connection dropped mid-insert");
          for (let r = 0; r < params.length / 8; r++) {
            const b = r * 8;
            staged.push({
              name: params[b + 1] as string,
              pointRole: params[b + 2] as string,
              seq: params[b + 7] as number,
            });
          }
          return { rows: [], rowCount: params.length / 8 };
        }
        if (
          /SELECT loader, edition, expected, next_start_index, read_count, filed_count, state, updated_at/.test(
            text,
          )
        ) {
          const row = checkpoints.get(params[0] as string);
          return { rows: row ? [row] : [] };
        }
        if (/INSERT INTO loader_checkpoint/.test(text)) {
          checkpoints.set(params[0] as string, {
            loader: params[0] as string,
            edition: params[1] as string,
            expected: params[2] as number | null,
            next_start_index: params[3] as number,
            read_count: params[4] as number,
            filed_count: params[5] as number,
            state: JSON.parse(params[6] as string) as Record<string, unknown>,
          });
          return { rows: [] };
        }
        if (/DELETE FROM loader_checkpoint WHERE loader =/.test(text)) {
          checkpoints.delete(params[0] as string);
          return { rows: [] };
        }
        if (/SELECT count\(\*\)::int AS n, coalesce\(sum\(seq\)/.test(text)) {
          return {
            rows: [
              {
                n: staged.length,
                s: staged.reduce((a, r) => a + r.seq, 0),
                m: staged.length ? Math.max(...staged.map((r) => r.seq)) : 0,
              },
            ],
          };
        }
        if (/DELETE FROM greenspace_stage WHERE seq >=/.test(text)) {
          staged = staged.filter((r) => r.seq < (params[0] as number));
          return { rows: [], rowCount: 0 };
        }
        if (/DELETE FROM greenspace_stage/.test(text)) {
          staged = [];
          return { rows: [] };
        }
        if (/SELECT count\(\*\)::int AS n FROM greenspace_stage/.test(text))
          return { rows: [{ n: staged.length }] };
        if (/DELETE FROM greenspace_points/.test(text)) {
          live = [];
          return { rows: [] };
        }
        if (/INSERT INTO greenspace_points/.test(text)) {
          live = [...staged];
          return { rows: [] };
        }
        throw new Error(`fake client: unhandled SQL: ${sql}`);
      },
      release() {},
    };
    return {
      pool: { connect: async () => client },
      staged: () => staged,
      live: () => live,
      checkpoints,
      setFailAfterInserts: (n: number | null) => {
        insertCalls = 0;
        failAfterInserts = n;
      },
    };
  }
  type FakePool = ReturnType<typeof createFakePool>;
  const EDITION = "2026-10:3d0c0c5e92c5dbf1d23d71b18530c962";
  const makeRows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      osmId: null,
      name: `Park ${i}`,
      pointRole: i % 3 === 0 ? "access" : "centre",
      lat: 51.5 + i * 0.0001,
      lon: 0.02,
      sourceName: SOURCE_NAME,
      sourceDate: "2026-10-01",
    }));

  it(
    "kill mid-file resumes from the last flushed chunk and files every point exactly once",
    { timeout: 60_000 },
    async () => {
      const fake = createFakePool();
      const rows = makeRows(1200);
      // The first 500-row flush lands and checkpoints at
      // 500; the second flush (insert 2) dies — 500 staged,
      // the checkpoint at 500.
      const killLines: string[] = [];
      const killProgress = createProgressLogger({
        name: "load-os-greenspace",
        log: (line: string) => killLines.push(line),
      });
      fake.setFailAfterInserts(1);
      await expect(
        fileGreenspace(fake.pool as never, rows as never, "2026-11-13T00:00:00Z", {
          progress: killProgress,
          edition: EDITION,
        }),
      ).rejects.toThrow(/simulated kill/);
      expect(fake.staged().length).toBe(500);
      expect(fake.checkpoints.get("load-os-greenspace")?.next_start_index).toBe(500);
      expect(
        killLines.some((l) => /checkpoint 500 rows · staged 500 · resume from 500/.test(l)),
      ).toBe(true);

      fake.setFailAfterInserts(null);
      const lines: string[] = [];
      const progress = createProgressLogger({
        name: "load-os-greenspace",
        log: (line: string) => lines.push(line),
      });
      await fileGreenspace(fake.pool as never, rows as never, "2026-11-13T00:00:00Z", {
        progress,
        edition: EDITION,
      });
      expect(
        lines.some((l) =>
          /resuming from checkpoint · 500 rows staged · edition 2026-10:3d0c0c5e92c5dbf1d23d71b18530c962 · resume from 500/.test(
            l,
          ),
        ),
      ).toBe(true);
      expect(fake.live().length).toBe(1200);
      expect(new Set(fake.live().map((r) => r.name)).size).toBe(1200);
      expect(fake.staged().length).toBe(0);
      expect(fake.checkpoints.get("load-os-greenspace")).toBeUndefined();
    },
  );

  it(
    "an edition change discards the staged rows and starts from zero",
    { timeout: 60_000 },
    async () => {
      const fake = createFakePool();
      fake.setFailAfterInserts(1);
      await expect(
        fileGreenspace(fake.pool as never, makeRows(1200) as never, "2026-11-13T00:00:00Z", {
          edition: EDITION,
        }),
      ).rejects.toThrow(/simulated kill/);
      expect(fake.staged().length).toBe(500);

      fake.setFailAfterInserts(null);
      await fileGreenspace(fake.pool as never, makeRows(1200) as never, "2026-11-13T00:00:00Z", {
        edition: "2027-04:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      });
      expect(fake.live().length).toBe(1200);
      expect(fake.checkpoints.get("load-os-greenspace")).toBeUndefined();
    },
  );

  it("--restart discards the checkpoint and starts from zero", { timeout: 60_000 }, async () => {
    const fake = createFakePool();
    fake.setFailAfterInserts(1);
    await expect(
      fileGreenspace(fake.pool as never, makeRows(1200) as never, "2026-11-13T00:00:00Z", {
        edition: EDITION,
      }),
    ).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(500);

    fake.setFailAfterInserts(null);
    await fileGreenspace(fake.pool as never, makeRows(1200) as never, "2026-11-13T00:00:00Z", {
      edition: EDITION,
      restart: true,
    });
    expect(fake.live().length).toBe(1200);
    expect(fake.checkpoints.get("load-os-greenspace")).toBeUndefined();
  });
});
