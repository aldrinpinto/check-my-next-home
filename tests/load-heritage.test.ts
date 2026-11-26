import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  beginFiling,
  heritageEdition,
  parseCsv as loaderParseCsv,
  processBuildings,
  processPolygons,
} from "../loaders/load-heritage.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// Guards the heritage loader (plan step M5.2): listed buildings
// file as NHLE-keyed points with grades validated against the
// published vocabulary (gap L6), scheduled monuments file as
// shapes, ended rows are excluded, and the fixture (real rows
// captured 12 Nov 2026) reproduces the locked golden counts —
// 102 / 215 / 315 buildings within 2 miles — on the prep's
// haversine basis (earth radius 3956 miles; at E16 1GN one
// building sits at 2.000–2.001 miles, so the basis decides the
// count). The loader's own golden checks run in both modes; the
// filing proof runs in CI against a real PostGIS.

const loader = readFileSync(join(process.cwd(), "loaders/load-heritage.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests/fixtures/heritage");

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const push = () => {
    row.push(field);
    field = "";
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") push();
    else if (ch === "\n") {
      push();
      rows.push(row);
      row = [];
    } else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length > 0) {
    push();
    rows.push(row);
  }
  const header = rows[0].map((h) => h.replace(/^﻿/, "").trim());
  return rows
    .slice(1)
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const HOMES = {
  birkdale: { lat: 51.776176, lng: 0.60387 },
  exeter: { lat: 51.515224, lng: 0.021177 },
  epsom: { lat: 51.344571, lng: -0.247104 },
};
const GRADES = new Set(["I", "II*", "II"]);

function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 3956;
  const r = Math.PI / 180;
  const h =
    Math.sin(((bLat - aLat) * r) / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLng - aLng) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function parsePoint(text: string): { lng: number; lat: number } | null {
  const s = (text ?? "").trim();
  if (!s.startsWith("POINT")) return null;
  const inner = s.slice(s.indexOf("(") + 1, s.lastIndexOf(")"));
  const parts = inner.replace(",", " ").split(/\s+/).filter(Boolean).map(Number);
  if (parts.length !== 2 || !parts.every(Number.isFinite)) return null;
  return { lng: parts[0], lat: parts[1] };
}

const lb = parseCsv(readFileSync(join(fixtureDir, "listed-building.csv"), "utf8"));
const sm = parseCsv(readFileSync(join(fixtureDir, "scheduled-monument.csv"), "utf8"));
const filed = lb.filter((r) => {
  if (r["end-date"] !== "") return false;
  if (!GRADES.has(r["listed-building-grade"])) return false;
  return parsePoint(r["point"]) !== null;
});

describe("heritage loader sources", () => {
  it("stamps Historic England's NHLE as the source of record", () => {
    expect(loader).toContain("National Heritage List for England");
    expect(loader).toContain("files.planning.data.gov.uk/dataset");
  });

  it("validates grades against the published vocabulary and quarantines the rest (L6)", () => {
    expect(loader).toContain('new Set(["I", "II*", "II"])');
    expect(loader).toContain("outside the grade vocabulary quarantined");
  });

  it("files monuments as shapes into planning_layers, never as points", () => {
    expect(loader).toContain("scheduled_monument");
    expect(loader).toContain("ST_Multi(ST_GeomFromText");
  });

  it("counts point-less and ended buildings instead of dropping them silently", () => {
    expect(loader).toContain("without a point counted");
    expect(loader).toContain("ended excluded");
  });
});

describe("fixture golden facts", () => {
  it("the locked counts within 2 miles reproduce on the prep's basis", () => {
    const counts = Object.values(HOMES).map(
      (home) =>
        filed.filter((r) => {
          const p = parsePoint(r["point"])!;
          return haversineMiles(home.lat, home.lng, p.lat, p.lng) <= 2.0;
        }).length,
    );
    expect(counts).toEqual([102, 215, 315]);
  });

  it("the nearest buildings are the locked ones", () => {
    const nearestRef = (home: { lat: number; lng: number }) =>
      filed
        .map((r) => {
          const p = parsePoint(r["point"])!;
          return { ref: r["reference"], miles: haversineMiles(home.lat, home.lng, p.lat, p.lng) };
        })
        .sort((a, b) => a.miles - b.miles)[0].ref;
    expect(nearestRef(HOMES.birkdale)).toBe("1123430"); // White Hart Cottage, II
    expect(nearestRef(HOMES.exeter)).toBe("1406622"); // Chapel of St George and St Helena, II
    expect(nearestRef(HOMES.epsom)).toBe("1214537"); // Pit House, II
  });

  it("the anomalous 'NL' row is in the file, current, to be quarantined", () => {
    const nl = lb.find((r) => r["reference"] === "1495697");
    expect(nl?.["listed-building-grade"]).toBe("NL");
    expect(nl?.["end-date"]).toBe("");
    expect(filed.some((r) => r["reference"] === "1495697")).toBe(false);
  });

  it("a known delisted building is in the file, ended, to be excluded (L4)", () => {
    const ended = lb.find((r) => r["reference"] === "1338507");
    expect(ended?.["end-date"]).toBe("2023-07-27");
    expect(filed.some((r) => r["reference"] === "1338507")).toBe(false);
  });

  it("the golden monuments are present by NHLE reference, with one ended row to exclude", () => {
    const refs = new Set(sm.map((r) => r["reference"]));
    for (const ref of ["1002150", "1003473", "1003721", "1017998"]) {
      expect(refs.has(ref)).toBe(true);
    }
    expect(sm.filter((r) => r["end-date"] !== "")).toHaveLength(1);
    expect(sm.find((r) => r["end-date"] !== "")?.["reference"]).toBe("1002166");
  });
});

// The M6.21 layers (decision D41): four more NHLE polygon
// datasets through the same path. Their published files
// double every site — a geometry row and a nameless,
// geometry-less stub entity sharing the reference — so the
// filed count is the GEOMETRY rows after the ended
// exclusion, never the row count. The cuts below were made
// from the live files on 16 Nov 2026 (the heritage
// fixture's README records the refs chosen).

const NEW_DATASETS = [
  {
    file: "world-heritage-site.csv",
    type: "world_heritage_site",
    rows: 8,
    current: 6,
    filed: 3,
    stubbed: true,
  },
  { file: "battlefield.csv", type: "battlefield", rows: 6, current: 6, filed: 3, stubbed: true },
  {
    file: "protected-wreck-site.csv",
    type: "protected_wreck_site",
    rows: 3,
    current: 2,
    filed: 2,
    stubbed: false,
  },
  {
    file: "world-heritage-site-buffer-zone.csv",
    type: "world_heritage_buffer_zone",
    rows: 3,
    current: 3,
    filed: 3,
    stubbed: false,
  },
] as const;

describe("heritage loader — the M6.21 layers", () => {
  it("carries the four datasets with their constraint types and live bands", () => {
    for (const dataset of NEW_DATASETS) {
      expect(loader).toContain(dataset.file.replace(".csv", ""));
      expect(loader).toContain(dataset.type);
    }
    expect(loader).toContain("NEW_LAYER_DATASETS");
  });

  it("the cuts hold the expected rows, and the filed counts are the geometry rows", () => {
    for (const dataset of NEW_DATASETS) {
      const rows = parseCsv(readFileSync(join(fixtureDir, dataset.file), "utf8"));
      expect(rows, dataset.file).toHaveLength(dataset.rows);
      const current = rows.filter((r) => r["end-date"] === "");
      expect(current, dataset.file).toHaveLength(dataset.current);
      const withGeometry = current.filter((r) => (r["geometry"] ?? "").trim() !== "");
      expect(withGeometry, dataset.file).toHaveLength(dataset.filed);
      // The doubling, where the dataset doubles (world
      // heritage sites and battlefields in these cuts):
      // every geometry row's reference also appears on a
      // nameless stub with no geometry, which the filing
      // counts as geometry-less and dedupes away.
      if (dataset.stubbed) {
        for (const geo of withGeometry) {
          const stubs = current.filter(
            (r) => r["reference"] === geo["reference"] && (r["geometry"] ?? "").trim() === "",
          );
          expect(stubs.length, `${dataset.file} ${geo["reference"]}`).toBeGreaterThanOrEqual(1);
          expect(stubs[0]["name"]).toBe("");
        }
      }
    }
  });

  it("registered parks & gardens (M8.10): the sixth dataset rides the same path, outside the absence-checked list", () => {
    // The platform dataset is "park-and-garden" (its
    // published title is "Historic parks and gardens"),
    // filing as registered_park_and_garden with the live
    // band the platform's own count supports (1,723
    // parks and gardens on its dataset page, 21 Nov
    // 2026).
    expect(loader).toContain("park-and-garden");
    expect(loader).toContain("registered_park_and_garden");
    expect(loader).toContain("PARK_AND_GARDEN_DATASET");
    expect(loader).toContain("band: [1600, 1850]");
    // It does NOT join NEW_LAYER_DATASETS: that list's
    // golden check asserts absence at all three homes,
    // and Nonsuch Park stands about half a mile from the
    // Epsom flat. Its own block must not list it.
    const newLayerBlock = loader.slice(
      loader.indexOf("const NEW_LAYER_DATASETS"),
      loader.indexOf("];", loader.indexOf("const NEW_LAYER_DATASETS")),
    );
    expect(newLayerBlock).not.toContain("park-and-garden");
    // No fixture cut is held yet (the capture rides with
    // the national filing), and the fixture README says
    // so — a fixture run skips the dataset by name.
    const readme = readFileSync(join(fixtureDir, "README.md"), "utf8");
    expect(readme).toContain("park-and-garden");
    expect(loader).toContain("no fixture captured");
  });

  it("the Bath witness rows are in the world heritage cut (City of Bath, 1000103)", () => {
    const whs = parseCsv(readFileSync(join(fixtureDir, "world-heritage-site.csv"), "utf8"));
    const bath = whs.find((r) => r["reference"] === "1000103" && (r["geometry"] ?? "") !== "");
    expect(bath?.["name"]).toBe("City of Bath");
    expect(bath?.["end-date"]).toBe("");
    // The delisted Liverpool rows ride along as the ended
    // witnesses: both entries for 1000104 carry end dates.
    const liverpool = whs.filter((r) => r["reference"] === "1000104");
    expect(liverpool).toHaveLength(2);
    expect(liverpool.every((r) => r["end-date"] !== "")).toBe(true);
  });
});

describe("progress — BUG-265", () => {
  // This loader's long phases live in main(), so the wiring
  // is pinned here in source and driven end-to-end in
  // tests/load-progress-bug265-c.test.ts.
  it("creates one logger and wires it through the reads and both staging loops", () => {
    expect(loader).toContain('createProgressLogger({ name: "load-heritage" })');
    expect(loader).toContain('label: "stage listed buildings"');
    expect(loader).toContain('label: "stage polygons"');
    expect(loader).toContain('label: "process listed-building"');
    expect(loader).toContain("progress.failed({");
    expect(loader).toContain("swap started — filing");
  });
});

describe("resume (BUG-368)", () => {
  // A fake pg client: the staged rows, the live tables and
  // the loader_checkpoint rows as arrays, with just enough
  // SQL to run the filer.
  type ListedRow = { listEntryId: string; name: string; seq: number };
  type PolygonRow = {
    constraintType: string;
    name: string;
    reference: string;
    seq: number;
  };
  type CheckpointRow = {
    loader: string;
    edition: string;
    expected: number | null;
    next_start_index: number;
    read_count: number;
    filed_count: number;
    state: Record<string, unknown> | null;
  };
  function createFakeClient() {
    let stagedListed: ListedRow[] = [];
    let stagedPolygons: PolygonRow[] = [];
    let liveListed: ListedRow[] = [];
    let livePolygons: PolygonRow[] = [];
    const checkpoints = new Map<string, CheckpointRow>();
    let insertCalls = 0;
    let failAfterInserts: number | null = null;
    let snapshot: {
      stagedListed: ListedRow[];
      stagedPolygons: PolygonRow[];
      liveListed: ListedRow[];
      livePolygons: PolygonRow[];
      checkpoints: Map<string, CheckpointRow>;
    } | null = null;
    const query = async (sql: string, params: unknown[] = []) => {
      const text = sql.replace(/\s+/g, " ");
      if (text === "BEGIN") {
        snapshot = {
          stagedListed: [...stagedListed],
          stagedPolygons: [...stagedPolygons],
          liveListed: [...liveListed],
          livePolygons: [...livePolygons],
          checkpoints: new Map(checkpoints),
        };
        return { rows: [] };
      }
      if (text === "COMMIT") {
        snapshot = null;
        return { rows: [] };
      }
      if (text === "ROLLBACK") {
        if (snapshot) {
          stagedListed = snapshot.stagedListed;
          stagedPolygons = snapshot.stagedPolygons;
          liveListed = snapshot.liveListed;
          livePolygons = snapshot.livePolygons;
          checkpoints.clear();
          for (const [k, v] of snapshot.checkpoints) checkpoints.set(k, v);
        }
        snapshot = null;
        return { rows: [] };
      }
      if (/CREATE TABLE IF NOT EXISTS heritage_(listed|polygon)_stage/.test(text))
        return { rows: [] };
      if (/INSERT INTO heritage_listed_stage/.test(text)) {
        insertCalls += 1;
        if (failAfterInserts !== null && insertCalls > failAfterInserts)
          throw new Error("simulated kill: the database connection dropped mid-insert");
        for (let r = 0; r < params.length / 10; r++) {
          const b = r * 10;
          stagedListed.push({
            listEntryId: params[b] as string,
            name: params[b + 1] as string,
            seq: params[b + 9] as number,
          });
        }
        return { rows: [], rowCount: params.length / 10 };
      }
      if (/INSERT INTO heritage_polygon_stage/.test(text)) {
        insertCalls += 1;
        if (failAfterInserts !== null && insertCalls > failAfterInserts)
          throw new Error("simulated kill: the database connection dropped mid-insert");
        for (let r = 0; r < params.length / 10; r++) {
          const b = r * 10;
          stagedPolygons.push({
            constraintType: params[b] as string,
            name: params[b + 1] as string,
            reference: params[b + 3] as string,
            seq: params[b + 9] as number,
          });
        }
        return { rows: [], rowCount: params.length / 10 };
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
        const rows = /FROM heritage_listed_stage/.test(text) ? stagedListed : stagedPolygons;
        return {
          rows: [
            {
              n: rows.length,
              s: rows.reduce((a, r) => a + r.seq, 0),
              m: rows.length ? Math.max(...rows.map((r) => r.seq)) : 0,
            },
          ],
        };
      }
      if (/DELETE FROM heritage_listed_stage WHERE seq >=/.test(text)) {
        stagedListed = stagedListed.filter((r) => r.seq < (params[0] as number));
        return { rows: [], rowCount: 0 };
      }
      if (/DELETE FROM heritage_polygon_stage WHERE seq >=/.test(text)) {
        stagedPolygons = stagedPolygons.filter((r) => r.seq < (params[0] as number));
        return { rows: [], rowCount: 0 };
      }
      if (/DELETE FROM heritage_listed_stage/.test(text)) {
        stagedListed = [];
        return { rows: [] };
      }
      if (/DELETE FROM heritage_polygon_stage/.test(text)) {
        stagedPolygons = [];
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n FROM heritage_listed_stage/.test(text))
        return { rows: [{ n: stagedListed.length }] };
      if (/SELECT count\(\*\)::int AS n FROM heritage_polygon_stage/.test(text))
        return { rows: [{ n: stagedPolygons.length }] };
      if (/DELETE FROM listed_buildings/.test(text)) {
        liveListed = [];
        return { rows: [] };
      }
      if (/INSERT INTO listed_buildings/.test(text)) {
        liveListed = [...stagedListed];
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n FROM listed_buildings/.test(text))
        return { rows: [{ n: liveListed.length }] };
      if (/DELETE FROM planning_layers WHERE constraint_type =/.test(text)) {
        livePolygons = livePolygons.filter((r) => r.constraintType !== (params[0] as string));
        return { rows: [] };
      }
      if (/INSERT INTO planning_layers/.test(text)) {
        livePolygons = [...stagedPolygons];
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n FROM planning_layers WHERE constraint_type =/.test(text))
        return {
          rows: [
            { n: livePolygons.filter((r) => r.constraintType === (params[0] as string)).length },
          ],
        };
      throw new Error(`fake client: unhandled SQL: ${sql}`);
    };
    return {
      query,
      stagedListed: () => stagedListed,
      stagedPolygons: () => stagedPolygons,
      liveListed: () => liveListed,
      livePolygons: () => livePolygons,
      checkpoints,
      setFailAfterInserts: (n: number | null) => {
        failAfterInserts = n;
      },
    };
  }
  type FakeClient = ReturnType<typeof createFakeClient>;
  const sourceDate = JSON.parse(readFileSync(join(fixtureDir, "fixture.json"), "utf8"))
    .captured as string;

  // The fixture's filed sets, exactly as main() builds them.
  function fixtureSets() {
    const lbText = readFileSync(join(fixtureDir, "listed-building.csv"), "utf8");
    const smText = readFileSync(join(fixtureDir, "scheduled-monument.csv"), "utf8");
    const lb = processBuildings(loaderParseCsv(lbText));
    const sm = processPolygons(loaderParseCsv(smText), "scheduled-monument");
    const newLayerTexts: string[] = [];
    const newLayers = [
      { dataset: "world-heritage-site", constraintType: "world_heritage_site" },
      { dataset: "battlefield", constraintType: "battlefield" },
      { dataset: "protected-wreck-site", constraintType: "protected_wreck_site" },
      { dataset: "world-heritage-site-buffer-zone", constraintType: "world_heritage_buffer_zone" },
    ].map((spec) => {
      const text = readFileSync(join(fixtureDir, `${spec.dataset}.csv`), "utf8");
      newLayerTexts.push(text);
      return { ...spec, processed: processPolygons(loaderParseCsv(text), spec.dataset) };
    });
    const polygonSets = [
      { constraintType: "scheduled_monument", filed: sm.filed },
      ...newLayers.map((layer) => ({
        constraintType: layer.constraintType,
        filed: layer.processed.filed,
      })),
    ];
    const polygonRows = polygonSets.flatMap((set) =>
      set.filed.map((item) => ({ constraintType: set.constraintType, item })),
    );
    const edition = heritageEdition(sourceDate, [lbText, smText, ...newLayerTexts, ""]);
    return { lb, polygonSets, polygonRows, edition };
  }

  async function runLoad(
    fake: FakeClient,
    { restart = false, lines = null as string[] | null } = {},
  ) {
    const capturedLines: string[] = lines ?? [];
    const progress = createProgressLogger({
      name: "load-heritage",
      log: (line: string) => capturedLines.push(line),
    });
    const { lb, polygonSets, polygonRows, edition } = fixtureSets();
    const expectedPolygons = polygonSets.reduce((sum, set) => sum + set.filed.length, 0);
    const filer = await beginFiling(progress, { client: fake as never, restart });
    const prep = await filer.prepareResume(edition, lb.filed.length, expectedPolygons);
    const listedStart = prep.listed.resumed ? prep.listed.checkpoint.next_start_index : 0;
    const polygonStart = prep.polygons.resumed ? prep.polygons.checkpoint.next_start_index : 0;
    await filer.stageListed(lb.filed.slice(listedStart), sourceDate);
    await filer.stagePolygons(polygonRows.slice(polygonStart), sourceDate);
    await filer.finishFiling(lb.filed.length, expectedPolygons, polygonSets);
    return { filer, lb, polygonSets, expectedPolygons, lines: capturedLines };
  }

  it(
    "kill mid-polygons resumes the listed stream and files everything exactly once",
    { timeout: 60_000 },
    async () => {
      const fake = createFakeClient();
      // The 652 listed buildings stage in one chunk (insert
      // 1) and checkpoint at 652; the first 25-polygon chunk
      // (insert 2) dies — listed staged, polygons empty.
      const killLines: string[] = [];
      fake.setFailAfterInserts(1);
      await expect(runLoad(fake, { lines: killLines })).rejects.toThrow(/simulated kill/);
      expect(fake.stagedListed().length).toBe(652);
      expect(fake.stagedPolygons().length).toBe(0);
      expect(fake.checkpoints.get("load-heritage")?.next_start_index).toBe(652);
      expect(fake.checkpoints.get("load-heritage-polygons")).toBeUndefined();
      expect(
        killLines.some((l) =>
          /checkpoint 652\/652 rows \(100%\) · staged 652 · resume from 652/.test(l),
        ),
      ).toBe(true);

      fake.setFailAfterInserts(null);
      const { filer, lb, polygonSets, expectedPolygons, lines } = await runLoad(fake);
      expect(filer.filedSoFar()).toBe(lb.filed.length + expectedPolygons);
      expect(
        lines.some((l) =>
          /resuming from checkpoint · 652 rows staged · edition 2026-11-12:[0-9a-f]{16} · resume from 652/.test(
            l,
          ),
        ),
      ).toBe(true);
      const expectedListed = lb.filed.map((b) => b.row.reference);
      expect(
        fake
          .liveListed()
          .map((r) => r.listEntryId)
          .sort(),
      ).toEqual(expectedListed.sort());
      expect(fake.livePolygons().length).toBe(expectedPolygons);
      expect(
        new Set(fake.livePolygons().map((r) => `${r.constraintType}|${r.reference}`)).size,
      ).toBe(expectedPolygons);
      for (const set of polygonSets)
        expect(
          fake.livePolygons().filter((r) => r.constraintType === set.constraintType).length,
        ).toBe(set.filed.length);
      expect(fake.stagedListed().length).toBe(0);
      expect(fake.stagedPolygons().length).toBe(0);
      expect(fake.checkpoints.size).toBe(0);
      expect(filer.resumeNote()).toBe("the start (nothing staged yet)");
    },
  );

  it(
    "an edition change discards the staged rows and starts from zero",
    { timeout: 60_000 },
    async () => {
      const fake = createFakeClient();
      fake.setFailAfterInserts(1);
      await expect(runLoad(fake)).rejects.toThrow(/simulated kill/);
      expect(fake.stagedListed().length).toBe(652);

      const progress = createProgressLogger({ name: "load-heritage" });
      const filer = await beginFiling(progress, { client: fake as never });
      const prep = await filer.prepareResume("2099-01-01:deadbeefdeadbeef", 652, 50);
      expect(prep.listed.resumed).toBe(false);
      expect(prep.polygons.resumed).toBe(false);
      expect(fake.stagedListed().length).toBe(0);
      expect(fake.checkpoints.get("load-heritage")).toBeUndefined();
    },
  );

  it("--restart discards the checkpoints and starts from zero", { timeout: 60_000 }, async () => {
    const fake = createFakeClient();
    fake.setFailAfterInserts(1);
    await expect(runLoad(fake)).rejects.toThrow(/simulated kill/);
    expect(fake.stagedListed().length).toBe(652);

    fake.setFailAfterInserts(null);
    const { lb, expectedPolygons } = await runLoad(fake, { restart: true });
    expect(fake.liveListed().length).toBe(lb.filed.length);
    expect(fake.livePolygons().length).toBe(expectedPolygons);
  });
});
