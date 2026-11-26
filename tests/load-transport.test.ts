import { readFileSync } from "node:fs";
import { join } from "node:path";
import proj4 from "proj4";
import { describe, expect, it } from "vitest";
import { beginTransportFiling } from "../loaders/load-transport.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// Guards the transport loader (plan step M5.5) against the ten
// test-first items of the 13 Nov 2026 gap check, at fixture
// scale: the fixture is a radius-trimmed REAL capture from the
// NaPTAN national file of 13 Nov 2026 (rows around the three
// universal homes, Cardiff CF11 8AA, Hilgay CB6 1EH and High
// Laver CM5 0DR, plus the eleven grid-only Elizabeth line rail
// rows by ATCO code). The national-scale counts of item 1
// (435,812 read / 388,156 active / 381,640 filed) are proven by
// the loader's live verify-only run record, exactly as the
// nature fixture's candidate-SAC exclusion was proven live in
// M5.3; here the same rules are recomputed on the capture and
// must reconcile to the fixture's own counts. The loader's own
// golden checks run in both modes; the filing proof runs in CI
// against a real PostGIS.
//
// One wording correction against gap item 2, from the prep's
// own Section 4 and verified against the file: the nearest
// station-level point to 6 Exeter Road is Royal Victoria's
// (0.414 mi), not Custom House's — the step's check pins the
// Custom House station point itself (4900ZZDLCUS1, 0.440 mi),
// and that is what is asserted, as a presence-at-distance fact.

const loader = readFileSync(join(process.cwd(), "loaders/load-transport.mjs"), "utf8");
const canary = readFileSync(join(process.cwd(), "loaders/canary.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests/fixtures/transport");

proj4.defs(
  "EPSG:27700",
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 " +
    "+ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs",
);

// One line parser: the NaPTAN CSV carries no embedded newlines
// (the national file's line count equals its row count + 1, a
// prep-verified property the capture inherits).
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      fields.push(field);
      field = "";
    } else field += ch;
  }
  fields.push(field);
  return fields;
}

const fixtureText = readFileSync(join(fixtureDir, "naptan.csv"), "utf8");
const fixtureLines = fixtureText.split("\n").filter((l) => l.trim() !== "");
const header = splitCsvLine(fixtureLines[0]).map((h) => h.replace(/^﻿/, "").trim());
const raw = fixtureLines
  .slice(1)
  .map((l) => Object.fromEntries(header.map((h, i) => [h, (splitCsvLine(l)[i] ?? "").trim()])));

const FAMILIES = new Set(["BCT", "BCS", "BST", "RLY", "MET", "TMU", "FER", "FBT", "FTD"]);
const STATION = new Set(["RLY", "MET", "TMU"]);
const BUS = new Set(["BCT", "BCS", "BST"]);

type Filed = {
  atco: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  converted: boolean;
  source: Record<string, string>;
};

function positionOf(
  row: Record<string, string>,
): { lat: number; lng: number; converted: boolean } | null {
  if (row["Latitude"] !== "" && row["Longitude"] !== "") {
    return { lat: Number(row["Latitude"]), lng: Number(row["Longitude"]), converted: false };
  }
  if (row["Easting"] !== "" && row["Northing"] !== "") {
    const [lng, lat] = proj4("EPSG:27700", "EPSG:4326", [
      Number(row["Easting"]),
      Number(row["Northing"]),
    ]);
    return { lat, lng, converted: true };
  }
  return null;
}

const filed: Filed[] = [];
for (const row of raw) {
  if (row["Status"] !== "active") continue;
  if (!FAMILIES.has(row["StopType"])) continue;
  const pos = positionOf(row);
  if (!pos) continue;
  filed.push({
    atco: row["ATCOCode"],
    name: row["CommonName"],
    type: row["StopType"],
    lat: pos.lat,
    lng: pos.lng,
    converted: pos.converted,
    source: row,
  });
}
const byAtco = new Map(filed.map((f) => [f.atco, f]));
const rawByAtco = new Map(raw.map((r) => [r["ATCOCode"], r]));

const HOMES = {
  birkdale: { lat: 51.776176, lng: 0.60387 },
  exeter: { lat: 51.515224, lng: 0.021177 },
  epsom: { lat: 51.344571, lng: -0.247104 },
  cardiff: { lat: 51.467947, lng: -3.192837 },
  hilgay: { lat: 52.507481, lng: 0.33491 },
  highLaver: { lat: 51.749133, lng: 0.214797 },
};

function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 3956;
  const r = Math.PI / 180;
  const h =
    Math.sin(((bLat - aLat) * r) / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLng - aLng) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const milesFrom = (home: { lat: number; lng: number }, f: Filed) =>
  haversineMiles(home.lat, home.lng, f.lat, f.lng);
const near = (home: { lat: number; lng: number }, types: Set<string>, miles: number) =>
  filed
    .filter((f) => types.has(f.type) && milesFrom(home, f) <= miles)
    .sort((a, b) => milesFrom(home, a) - milesFrom(home, b));
const expectMiles = (actual: number, expected: number, tolerance: number) => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
};

describe("transport loader sources", () => {
  it("reads NaPTAN from the live DfT API, never the dead app host or BODS (L5, L6)", () => {
    expect(loader).toContain("naptan.api.dft.gov.uk/v1/access-nodes");
    expect(loader).toContain("dataFormat=CSV");
    expect(loader).not.toContain("naptan.app.dft.gov.uk");
    expect(loader).not.toContain("bus-data.dft.gov.uk");
    expect(loader).toContain("Open Government Licence v3.0");
  });

  it("files exactly the nine stop families and nothing else (L2)", () => {
    expect(loader).toContain('"BCT", "BCS", "BST", "RLY", "MET", "TMU", "FER", "FBT", "FTD"');
    expect(loader).toContain("transport_stops");
  });

  it("filters on Status, the currency field — not the Modification decoy (L4)", () => {
    expect(loader).toContain('row.Status !== "active"');
  });

  it("converts grid references with proj4 and counts the conversions in the log line (L1)", () => {
    expect(loader).toContain("EPSG:27700");
    expect(loader).toContain("grid references converted");
  });

  it("files stop-type codes verbatim and never translates them into a mode (L3)", () => {
    expect(loader).toContain("stop_type");
    expect(loader).toContain("filed verbatim");
  });
});

describe("fixture counts (gap item 1, at fixture scale)", () => {
  it("the capture reconciles: 1,706 rows in, exactly 1,481 filed — the count the practice workflow asserts", () => {
    expect(raw).toHaveLength(1706);
    expect(filed).toHaveLength(1481);
  });

  it("per-family filed counts match the capture", () => {
    const counts: Record<string, number> = {};
    for (const f of filed) counts[f.type] = (counts[f.type] ?? 0) + 1;
    expect(counts).toEqual({
      BCT: 1354,
      BCS: 13,
      RLY: 25,
      MET: 24,
      TMU: 45,
      FER: 8,
      FBT: 9,
      FTD: 3,
    });
  });

  it("no filed row carries a sub-point or out-of-scope type, and no ATCO code repeats", () => {
    for (const f of filed) expect(FAMILIES.has(f.type)).toBe(true);
    expect(new Set(filed.map((f) => f.atco)).size).toBe(filed.length);
    expect(new Set(raw.map((r) => r["ATCOCode"])).size).toBe(raw.length);
  });

  it("grid conversion is exercised, not theoretical: 97 filed rows were converted", () => {
    expect(filed.filter((f) => f.converted)).toHaveLength(97);
  });
});

describe("the step's check (gap item 2)", () => {
  it("the Custom House station point files at 0.440 mi from 6 Exeter Road", () => {
    const cus = byAtco.get("4900ZZDLCUS1");
    expect(cus?.type).toBe("TMU");
    expectMiles(milesFrom(HOMES.exeter, cus!), 0.44, 0.02);
  });

  it("Canning Town's Underground station point files at 0.564 mi", () => {
    const cgt = byAtco.get("9400ZZLUCGT");
    expect(cgt?.type).toBe("MET");
    expectMiles(milesFrom(HOMES.exeter, cgt!), 0.564, 0.02);
  });

  it("the honesty note: Royal Victoria's point (0.414) is nearer — the check pins Custom House itself, not 'nearest'", () => {
    const rv = byAtco.get("4900ZZDLRVC1");
    expect(rv).toBeDefined();
    expectMiles(milesFrom(HOMES.exeter, rv!), 0.414, 0.02);
    expect(near(HOMES.exeter, STATION, 0.5)[0].atco).toBe("4900ZZDLRVC1");
  });
});

describe("grid-conversion proof (gap item 3 — this step's Article-4-gate equivalent)", () => {
  it("the Hilgay pair is grid-only in the source and files at 0.044 mi once converted", () => {
    for (const atco of ["0500ELITP026", "0500ELITP036"]) {
      expect(rawByAtco.get(atco)?.["Latitude"]).toBe("");
      expect(rawByAtco.get(atco)?.["Easting"]).not.toBe("");
      const f = byAtco.get(atco);
      expect(f?.converted).toBe(true);
      expectMiles(milesFrom(HOMES.hilgay, f!), 0.044, 0.01);
    }
    expect(near(HOMES.hilgay, BUS, 0.1)[0].atco).toMatch(/^0500ELITP0(26|36)$/);
  });

  it("every one of the 7 bus stops within 2 miles of Hilgay is a grid-only row in the source", () => {
    const within = near(HOMES.hilgay, BUS, 2);
    expect(within).toHaveLength(7);
    for (const f of within) expect(f.source["Latitude"]).toBe("");
  });

  it("the eleven grid-only Elizabeth line rail rows all file, converted", () => {
    for (const atco of [
      "9100ABWDXR",
      "9100BONDST",
      "9100CANWHRF",
      "9100CUSTMHS",
      "9100FRNDXR",
      "9100LIVSTLL",
      "9100PADTLL",
      "9100TOTCTRD",
      "9100WCHAPXR",
      "9100WOLWXR",
      "9100BARKRIV",
    ]) {
      expect(rawByAtco.get(atco)?.["Latitude"]).toBe("");
      expect(byAtco.get(atco)?.converted).toBe(true);
    }
    expectMiles(milesFrom(HOMES.exeter, byAtco.get("9100CUSTMHS")!), 0.488, 0.02);
  });
});

describe("status proof (gap item 4)", () => {
  it("Canning Town's closed rail station is in the capture, inactive, and never filed", () => {
    expect(rawByAtco.get("9100CNTN")?.["Status"]).toBe("inactive");
    expect(byAtco.has("9100CNTN")).toBe(false);
  });

  it("West Ham's superseded row is excluded and its live replacement filed", () => {
    expect(rawByAtco.get("9100WHAM")?.["Status"]).toBe("inactive");
    expect(byAtco.has("9100WHAM")).toBe(false);
    expect(byAtco.get("9100WHAMHL")?.type).toBe("RLY");
  });

  it("every filed row's source status was active", () => {
    for (const f of filed) expect(f.source["Status"]).toBe("active");
  });
});

describe("universal goldens (gap item 5)", () => {
  it("Birkdale: Hatfield Peverel 0.563, the New Road pair at 0.124/0.126, 13 bus stops within half a mile", () => {
    expectMiles(milesFrom(HOMES.birkdale, byAtco.get("9100HFLPEVL")!), 0.563, 0.02);
    expectMiles(milesFrom(HOMES.birkdale, byAtco.get("150009005007")!), 0.124, 0.01);
    expectMiles(milesFrom(HOMES.birkdale, byAtco.get("150009005008")!), 0.126, 0.01);
    expect(near(HOMES.birkdale, BUS, 0.5)).toHaveLength(13);
  });

  it("Epsom: the flat's station is Ewell East 0.246 — not Epsom (1.170); Hazel Mead bus stop 0.128", () => {
    expectMiles(milesFrom(HOMES.epsom, byAtco.get("9100EWELLE")!), 0.246, 0.02);
    expectMiles(milesFrom(HOMES.epsom, byAtco.get("9100EWELW")!), 0.57, 0.02);
    expectMiles(milesFrom(HOMES.epsom, byAtco.get("9100EPSM")!), 1.17, 0.02);
    expect(near(HOMES.epsom, STATION, 0.3)[0].atco).toBe("9100EWELLE");
    expectMiles(milesFrom(HOMES.epsom, byAtco.get("40004406167B")!), 0.128, 0.01);
  });

  it("Exeter: nearest bus stop Canning Town Recreation Ground 0.172, its pair at 0.186", () => {
    expectMiles(milesFrom(HOMES.exeter, byAtco.get("490016788N")!), 0.172, 0.01);
    expectMiles(milesFrom(HOMES.exeter, byAtco.get("490011814S")!), 0.186, 0.01);
    expect(near(HOMES.exeter, BUS, 0.2)[0].atco).toBe("490016788N");
  });
});

describe("Wales proof (gap item 6)", () => {
  it("Cardiff files from the same capture: Grangetown 0.136, Penarth Road 0.077", () => {
    expectMiles(milesFrom(HOMES.cardiff, byAtco.get("9100GNTN")!), 0.136, 0.01);
    expectMiles(milesFrom(HOMES.cardiff, byAtco.get("5710AWA11589")!), 0.077, 0.01);
  });

  it("the loader fetches the whole-GB file — no area filter, no country filter", () => {
    expect(loader).not.toContain("atcoAreaCodes");
  });
});

describe("far answers are filed facts (gap item 7)", () => {
  it("Hilgay: Littleport station 3.208, 7 bus stops within 2 miles, 86 within 5", () => {
    expectMiles(milesFrom(HOMES.hilgay, byAtco.get("9100LTLPORT")!), 3.208, 0.03);
    expect(near(HOMES.hilgay, BUS, 2)).toHaveLength(7);
    expect(near(HOMES.hilgay, BUS, 5)).toHaveLength(86);
  });

  it("High Laver: Harlow Mill station 4.531 with Mill Lane bus stop at 0.243", () => {
    expectMiles(milesFrom(HOMES.highLaver, byAtco.get("9100HRLWMIL")!), 4.531, 0.03);
    expectMiles(milesFrom(HOMES.highLaver, byAtco.get("1500IM915")!), 0.243, 0.01);
  });
});

describe("name fidelity (gap item 8)", () => {
  it("filed names match the source byte-for-byte, qualifiers and all", () => {
    expect(byAtco.get("9400ZZDLCUS")?.name).toBe("Custom House (for ExCel) DLR Station");
    expect(byAtco.get("9100CUSTMHS")?.name).toBe("Custom House");
    expect(byAtco.get("9100GNTN")?.name).toBe("Grangetown (Cardiff) Rail Station");
    for (const f of filed) expect(f.name).toBe(f.source["CommonName"]);
  });
});

describe("canary design (gap item 9)", () => {
  it("probes one small ATCO area and reads freshness from the content's own edit dates", () => {
    expect(canary).toContain("naptan.api.dft.gov.uk/v1/access-nodes");
    expect(canary).toContain("atcoAreaCodes=571");
    expect(canary).toContain("ModificationDateTime");
    const probe = canary.slice(
      canary.indexOf("function probeNaptan"),
      canary.indexOf("function probeNaptan") + 3000,
    );
    expect(probe).not.toContain("last-modified");
    expect(probe).not.toContain("naptan.app.dft.gov.uk");
  });
});

// ------------------------------------------------------------------
// Progress logging (BUG-265): processFiles is not exported,
// so the wiring is pinned in its source — the end-to-end
// lines are pinned in tests/load-progress-bug265-d.test.ts.
// ------------------------------------------------------------------
describe("progress logging (BUG-265)", () => {
  it("creates one shared logger and logs the read, the staging tally and failures", () => {
    expect(loader).toContain('createProgressLogger({ name: "load-transport" })');
    expect(loader).toContain('progress.stage("reading the NaPTAN file")');
    expect(loader).toContain('progress?.count({ label: "read", done: stats.total, unit: "rows" })');
    expect(loader).toContain('label: "staging",');
    expect(loader).toContain("swap started — replacing the filed transport stops");
    expect(loader).toContain("progress.failed({");
  });
});

describe("resume (BUG-368)", () => {
  // A fake pg client: the staged rows, the live table and the
  // loader_checkpoint row as arrays, with just enough SQL to
  // run the filer.
  type StagedRow = {
    atco: string;
    name: string;
    type: string;
    lat: number;
    lng: number;
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
  const makeRows = (n: number): StagedRow[] =>
    Array.from({ length: n }, (_, i) => ({
      atco: `TEST${String(i).padStart(5, "0")}`,
      name: `Test stop ${i}`,
      type: "BCT",
      lat: 51.5 + i * 0.0001,
      lng: 0.01 + i * 0.0001,
      seq: -1,
    }));
  function createFakeClient() {
    let staged: StagedRow[] = [];
    let live: StagedRow[] = [];
    const checkpoints = new Map<string, CheckpointRow>();
    let insertCalls = 0;
    let failAfterInserts: number | null = null;
    let failSwap = false;
    let snapshot: {
      staged: StagedRow[];
      live: StagedRow[];
      checkpoints: Map<string, CheckpointRow>;
    } | null = null;
    const query = async (sql: string, params: unknown[] = []) => {
      const text = sql.replace(/\s+/g, " ");
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
      if (/CREATE TABLE IF NOT EXISTS transport_stage/.test(text)) return { rows: [] };
      if (/INSERT INTO transport_stage/.test(text)) {
        insertCalls += 1;
        if (failAfterInserts !== null && insertCalls > failAfterInserts)
          throw new Error("simulated kill: the database connection dropped mid-insert");
        for (let r = 0; r < params.length / 8; r++) {
          const b = r * 8;
          staged.push({
            atco: params[b] as string,
            name: params[b + 1] as string,
            type: params[b + 2] as string,
            lat: params[b + 3] as number,
            lng: params[b + 4] as number,
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
      if (/DELETE FROM transport_stage WHERE seq >=/.test(text)) {
        staged = staged.filter((r) => r.seq < (params[0] as number));
        return { rows: [], rowCount: 0 };
      }
      if (/DELETE FROM transport_stage/.test(text)) {
        staged = [];
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n FROM transport_stage/.test(text))
        return { rows: [{ n: staged.length }] };
      if (/DELETE FROM transport_stops/.test(text)) {
        if (failSwap) throw new Error("simulated kill: the database connection dropped mid-swap");
        live = [];
        return { rows: [] };
      }
      if (/INSERT INTO transport_stops/.test(text)) {
        live = [...staged];
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n FROM transport_stops/.test(text))
        return { rows: [{ n: live.length }] };
      throw new Error(`fake client: unhandled SQL: ${sql}`);
    };
    return {
      query,
      staged: () => staged,
      live: () => live,
      liveAtcos: () => live.map((r) => r.atco),
      checkpoints,
      setFailAfterInserts: (n: number | null) => {
        failAfterInserts = n;
      },
      setFailSwap: (b: boolean) => {
        failSwap = b;
      },
    };
  }
  type FakeClient = ReturnType<typeof createFakeClient>;
  const EDITION = "2026-11-13";
  async function runFiling(
    fake: FakeClient,
    rows: StagedRow[],
    { restart = false, lines = null as string[] | null } = {},
  ) {
    const captured: string[] = lines ?? [];
    const progress = createProgressLogger({
      name: "load-transport",
      log: (line: string) => captured.push(line),
    });
    const filer = await beginTransportFiling(progress, { client: fake as never, restart });
    await filer.prepareResume(EDITION, rows.length);
    await filer.stageRows(rows as never);
    return { filer, lines: captured };
  }

  it("kill mid-staging resumes and files every stop exactly once", async () => {
    const fake = createFakeClient();
    const rows = makeRows(2500);
    // Kill after two 1,000-row chunks: 2,000 rows staged, the
    // checkpoint at 2,000, the third chunk never landed.
    const killLines: string[] = [];
    fake.setFailAfterInserts(2);
    await expect(runFiling(fake, rows, { lines: killLines })).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(2000);
    expect(fake.checkpoints.get("load-transport")?.next_start_index).toBe(2000);
    expect(
      killLines.some((l) =>
        /checkpoint 2,000\/2,500 stops \(80%\) · staged 2,000 · resume from 2,000/.test(l),
      ),
    ).toBe(true);

    fake.setFailAfterInserts(null);
    const { filer, lines } = await runFiling(fake, rows);
    expect(filer.stagedCount()).toBe(2500);
    expect(
      lines.some((l) =>
        /resuming from checkpoint · 2,000 rows staged · edition 2026-11-13 · resume from 2,000/.test(
          l,
        ),
      ),
    ).toBe(true);
    await filer.finishFiling(rows.length);
    expect(fake.liveAtcos()).toEqual(rows.map((r) => r.atco));
    // The swap cleared staging and the checkpoint together.
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-transport")).toBeUndefined();
    expect(filer.resumeNote()).toBe("the start (nothing staged yet)");
  });

  it("kill during the swap resumes with staging complete and swaps cleanly", async () => {
    const fake = createFakeClient();
    const rows = makeRows(2500);
    // Stage the whole grid, then die inside the swap: the
    // swap transaction rolls back, so the live table still
    // holds the old grid and the staging + checkpoint stand.
    const { filer } = await runFiling(fake, rows);
    expect(filer.stagedCount()).toBe(2500);
    expect(fake.checkpoints.get("load-transport")?.next_start_index).toBe(2500);
    fake.setFailSwap(true);
    await expect(filer.finishFiling(rows.length)).rejects.toThrow(/simulated kill/);
    expect(fake.live().length).toBe(0);
    expect(fake.staged().length).toBe(2500);
    expect(fake.checkpoints.get("load-transport")?.next_start_index).toBe(2500);

    // The resumed run stages nothing — and its staging tally
    // must still finish at 3/3 chunks, not one short: the
    // last chunk was partial (500 of 1,000), so a floor seed
    // would have printed 2/3 here.
    fake.setFailSwap(false);
    const resumed = await runFiling(fake, rows);
    expect(resumed.filer.stagedCount()).toBe(2500);
    expect(
      resumed.lines.some((l) =>
        /progress · staging 3\/3 chunks \(100%\) · 2,500 stops staged/.test(l),
      ),
    ).toBe(true);
    await resumed.filer.finishFiling(rows.length);
    expect(fake.liveAtcos()).toEqual(rows.map((r) => r.atco));
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-transport")).toBeUndefined();
  });

  it("an edition change discards the staged rows and starts from zero", async () => {
    const fake = createFakeClient();
    const rows = makeRows(2500);
    fake.setFailAfterInserts(2);
    await expect(runFiling(fake, rows)).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(2000);

    const progress = createProgressLogger({ name: "load-transport", log: () => {} });
    const filer = await beginTransportFiling(progress, { client: fake as never });
    const prep = await filer.prepareResume("2099-01-01", rows.length);
    expect(prep.resumed).toBe(false);
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-transport")).toBeUndefined();
  });

  it("--restart discards the checkpoint and starts from zero", async () => {
    const fake = createFakeClient();
    const rows = makeRows(2500);
    fake.setFailAfterInserts(2);
    await expect(runFiling(fake, rows)).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(2000);

    fake.setFailAfterInserts(null);
    const { filer } = await runFiling(fake, rows, { restart: true });
    expect(filer.stagedCount()).toBe(2500);
    await filer.finishFiling(rows.length);
    expect(fake.liveAtcos()).toEqual(rows.map((r) => r.atco));
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-transport")).toBeUndefined();
  });
});
