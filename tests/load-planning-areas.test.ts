import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  beginFiling,
  planningAreasEdition,
  processPolygons,
  toLayer,
} from "../loaders/load-planning-areas.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// Guards the planning areas loader (plan step M5.2): conservation
// areas and Article 4 areas file as current entities only, the
// geometry-less rows are counted rather than silently dropped,
// the Article 4 publication gate is filed with the load, and the
// fixture (real rows captured 12 Nov 2026) reproduces the golden
// facts the prep and gap check established — above all that
// Newham's Article 4 answer state is "not published", never
// "none" (gap L1). The live proof runs in CI against a real
// PostGIS, and the loader's own golden checks run in both modes.

const loader = readFileSync(join(process.cwd(), "loaders/load-planning-areas.mjs"), "utf8");
const canary = readFileSync(join(process.cwd(), "loaders/canary.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests/fixtures/planning-areas");

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

const ca = parseCsv(readFileSync(join(fixtureDir, "conservation-area.csv"), "utf8"));
const a4 = parseCsv(readFileSync(join(fixtureDir, "article-4-direction-area.csv"), "utf8"));
const dirs = parseCsv(readFileSync(join(fixtureDir, "article-4-direction.csv"), "utf8"));
const current = (rows: Record<string, string>[]) => rows.filter((r) => r["end-date"] === "");

describe("planning areas loader sources", () => {
  it("reads the three planning.data.gov.uk bulk files", () => {
    expect(loader).toContain("files.planning.data.gov.uk/dataset");
    expect(loader).toContain("conservation-area");
    expect(loader).toContain("article-4-direction-area");
    expect(loader).toContain("article-4-direction");
  });

  it("files shapes through PostGIS with the M5.2 provenance columns", () => {
    expect(loader).toContain("ST_Multi(ST_GeomFromText");
    expect(loader).toContain("source_reference");
    expect(loader).toContain("organisation");
    expect(loader).toContain("quality");
    expect(loader).toContain("permitted-development-rights");
  });

  it("excludes ended rows and counts geometry-less rows in the log line", () => {
    expect(loader).toContain('"end-date"');
    expect(loader).toContain("without geometry counted");
    expect(loader).toContain("ended excluded");
  });

  it("files the Article 4 gate and states the not-published rule", () => {
    expect(loader).toContain("article4_publishers");
    expect(loader).toContain("not published by the council to the national dataset");
  });

  it("the canary probes every planning dataset", () => {
    expect(canary).toContain("PLANNING_DATASETS");
    for (const dataset of [
      "conservation-area",
      "article-4-direction-area",
      "green-belt",
      "listed-building",
      "scheduled-monument",
    ]) {
      expect(canary).toContain(`"${dataset}"`);
    }
  });
});

describe("fixture golden facts", () => {
  it("the empty-result proof basis: per-layer current counts are positive and exact", () => {
    // Test-first item 1: a "none found" answer is only provable
    // against a layer that demonstrably loaded — the fixture's
    // own current-row counts are what the loader's filed counts
    // must equal in CI (filed = current with geometry).
    expect(current(ca)).toHaveLength(119);
    expect(current(a4)).toHaveLength(310);
    expect(current(dirs)).toHaveLength(147);
    expect(current(ca).filter((r) => r["geometry"] !== "")).toHaveLength(116);
    expect(current(a4).filter((r) => r["geometry"] !== "")).toHaveLength(309);
  });

  it("geometry-less current conservation areas are in the file to be counted (L3)", () => {
    expect(current(ca).filter((r) => r["geometry"] === "")).toHaveLength(3);
  });

  it("the golden conservation areas are present by reference", () => {
    const refs = new Set(ca.map((r) => r["reference"]));
    expect(refs.has("4452")).toBe(true); // Chelmer and Blackwater Navigation — Birkdale's nearest
    expect(refs.has("TH-28-NRC")).toBe(true); // Naval Row — Exeter's nearest
    expect(refs.has("000008/CONARA")).toBe(true); // Ewell Village — Epsom's nearest
  });

  it("the gate: Epsom and Tower Hamlets publish Article 4 areas; Newham and Braintree do not (L1)", () => {
    const publishers = new Set(current(a4).map((r) => r["organisation-entity"]));
    expect(publishers.has("129")).toBe(true); // Epsom and Ewell
    expect(publishers.has("350")).toBe(true); // Tower Hamlets
    expect(publishers.has("246")).toBe(false); // Newham — "not published", never "none"
    expect(publishers.has("56")).toBe(false); // Braintree — likewise
  });

  it("the Ewell Village Article 4 area carries its removed-rights codes as published", () => {
    const ewell = a4.find((r) => r["reference"] === "11/00002/ART4");
    expect(ewell?.["permitted-development-rights"]).toBe("1A;1C;1D;1F;2A;2B");
  });

  it("a known ended Article 4 area is in the file, ended, to be excluded (L4)", () => {
    const ended = a4.find((r) => r["reference"] === "A4D-2015-RETAIL-TO-RESIDENTIAL-A17");
    expect(ended?.["end-date"]).toBe("2021-07-31");
  });
});

describe("progress — BUG-265", () => {
  // This loader's long phases live in main(), so the wiring
  // is pinned here in source and driven end-to-end in
  // tests/load-progress-bug265-c.test.ts.
  it("creates one logger and wires it through the reads, the staging loop and the gate", () => {
    expect(loader).toContain('createProgressLogger({ name: "load-planning-areas" })');
    expect(loader).toContain('label: "stage layers"');
    expect(loader).toContain('label: "stage gate"');
    expect(loader).toContain('label: "process conservation-area"');
    expect(loader).toContain("progress.failed({");
    expect(loader).toContain("swap started — filing");
  });
});

describe("resume (BUG-368)", () => {
  // A fake pg client: the staged rows, the live tables, the
  // gate staging and the loader_checkpoint row as arrays,
  // with just enough SQL to run the filer.
  type StagedRow = {
    constraintType: string;
    reference: string;
    organisation: string;
    seq: number;
  };
  type GateRow = { organisation_entity: string; current_areas: number };
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
    let staged: StagedRow[] = [];
    let gateStaged: GateRow[] = [];
    let live: StagedRow[] = [];
    let liveGate: GateRow[] = [];
    const checkpoints = new Map<string, CheckpointRow>();
    let insertCalls = 0;
    let failAfterInserts: number | null = null;
    let snapshot: {
      staged: StagedRow[];
      gateStaged: GateRow[];
      live: StagedRow[];
      liveGate: GateRow[];
      checkpoints: Map<string, CheckpointRow>;
    } | null = null;
    const query = async (sql: string, params: unknown[] = []) => {
      const text = sql.replace(/\s+/g, " ");
      if (text === "BEGIN") {
        snapshot = {
          staged: [...staged],
          gateStaged: [...gateStaged],
          live: [...live],
          liveGate: [...liveGate],
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
          staged = snapshot.staged;
          gateStaged = snapshot.gateStaged;
          live = snapshot.live;
          liveGate = snapshot.liveGate;
          checkpoints.clear();
          for (const [k, v] of snapshot.checkpoints) checkpoints.set(k, v);
        }
        snapshot = null;
        return { rows: [] };
      }
      if (/CREATE TABLE IF NOT EXISTS (planning_areas_stage|article4_gate_stage)/.test(text))
        return { rows: [] };
      if (/INSERT INTO planning_areas_stage/.test(text)) {
        insertCalls += 1;
        if (failAfterInserts !== null && insertCalls > failAfterInserts)
          throw new Error("simulated kill: the database connection dropped mid-insert");
        for (let r = 0; r < params.length / 10; r++) {
          const b = r * 10;
          staged.push({
            constraintType: params[b] as string,
            reference: params[b + 3] as string,
            organisation: params[b + 4] as string,
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
      if (/DELETE FROM planning_areas_stage WHERE seq >=/.test(text)) {
        staged = staged.filter((r) => r.seq < (params[0] as number));
        return { rows: [], rowCount: 0 };
      }
      if (/DELETE FROM planning_areas_stage/.test(text)) {
        staged = [];
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n FROM planning_areas_stage/.test(text))
        return { rows: [{ n: staged.length }] };
      if (/DELETE FROM article4_gate_stage/.test(text)) {
        gateStaged = [];
        return { rows: [] };
      }
      if (/INSERT INTO article4_gate_stage/.test(text)) {
        for (let r = 0; r < params.length / 5; r++) {
          const b = r * 5;
          gateStaged.push({
            organisation_entity: params[b] as string,
            current_areas: params[b + 1] as number,
          });
        }
        return { rows: [], rowCount: params.length / 5 };
      }
      if (/DELETE FROM planning_layers WHERE constraint_type IN/.test(text)) {
        live = [];
        return { rows: [] };
      }
      if (/INSERT INTO planning_layers/.test(text)) {
        live = [...staged];
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n FROM planning_layers/.test(text))
        return { rows: [{ n: live.length }] };
      if (/DELETE FROM article4_publishers/.test(text)) {
        liveGate = [];
        return { rows: [] };
      }
      if (/INSERT INTO article4_publishers/.test(text)) {
        liveGate = [...gateStaged];
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n FROM article4_publishers/.test(text))
        return { rows: [{ n: liveGate.length }] };
      throw new Error(`fake client: unhandled SQL: ${sql}`);
    };
    return {
      query,
      staged: () => staged,
      live: () => live,
      liveGate: () => liveGate,
      checkpoints,
      setFailAfterInserts: (n: number | null) => {
        insertCalls = 0;
        failAfterInserts = n;
      },
    };
  }
  type FakeClient = ReturnType<typeof createFakeClient>;
  const fixtureDir = join(process.cwd(), "tests/fixtures/planning-areas");
  const sourceDate = JSON.parse(readFileSync(join(fixtureDir, "fixture.json"), "utf8"))
    .captured as string;

  // The fixture's filed layers and gate, exactly as main()
  // builds them.
  function fixtureSets() {
    const caText = readFileSync(join(fixtureDir, "conservation-area.csv"), "utf8");
    const a4Text = readFileSync(join(fixtureDir, "article-4-direction-area.csv"), "utf8");
    const dirText = readFileSync(join(fixtureDir, "article-4-direction.csv"), "utf8");
    const ca = processPolygons(parseCsv(caText), "conservation-area");
    const a4 = processPolygons(parseCsv(a4Text), "article-4-direction-area");
    const a4Rows = parseCsv(a4Text);
    const publishers = new Map<string, { currentAreas: number; areasWithGeometry: number }>();
    for (const row of a4Rows) {
      if ((row["end-date"] ?? "") !== "") continue;
      const org = row["organisation-entity"] ?? "";
      if (org === "") continue;
      const entry = publishers.get(org) ?? { currentAreas: 0, areasWithGeometry: 0 };
      entry.currentAreas += 1;
      if ((row.geometry ?? "").trim() !== "") entry.areasWithGeometry += 1;
      publishers.set(org, entry);
    }
    const layers = [
      ...ca.filed.map((item) => toLayer(item, "conservation_area")),
      ...a4.filed.map((item) => toLayer(item, "article_4_area")),
    ];
    const edition = planningAreasEdition(sourceDate, [caText, a4Text, dirText]);
    return { layers, publishers, edition };
  }

  async function runLoad(
    fake: FakeClient,
    { restart = false, lines = null as string[] | null } = {},
  ) {
    const capturedLines: string[] = lines ?? [];
    const progress = createProgressLogger({
      name: "load-planning-areas",
      log: (line: string) => capturedLines.push(line),
    });
    const { layers, publishers, edition } = fixtureSets();
    const filer = await beginFiling(progress, { client: fake as never, restart });
    const prep = await filer.prepareResume(edition, layers.length);
    const startOffset = prep.resumed ? prep.checkpoint.next_start_index : 0;
    await filer.stageLayers(layers.slice(startOffset), sourceDate);
    await filer.finishFiling(layers.length, publishers, sourceDate);
    return { filer, layers, publishers, lines: capturedLines };
  }

  it(
    "kill mid-stage resumes from the last chunk and files every layer exactly once",
    { timeout: 60_000 },
    async () => {
      const fake = createFakeClient();
      // 425 layers in 25-row chunks: the first three chunks
      // land and checkpoint at 75; the fourth chunk (insert
      // 4) dies — 75 staged, the checkpoint at 75, the gate
      // untouched.
      const killLines: string[] = [];
      fake.setFailAfterInserts(3);
      await expect(runLoad(fake, { lines: killLines })).rejects.toThrow(/simulated kill/);
      expect(fake.staged().length).toBe(75);
      expect(fake.checkpoints.get("load-planning-areas")?.next_start_index).toBe(75);
      expect(fake.live().length).toBe(0);
      expect(fake.liveGate().length).toBe(0);
      expect(
        killLines.some((l) =>
          /checkpoint 75\/425 layers \(18%\) · staged 75 · resume from 75/.test(l),
        ),
      ).toBe(true);

      fake.setFailAfterInserts(null);
      const { filer, layers, publishers, lines } = await runLoad(fake);
      expect(
        lines.some((l) =>
          /resuming from checkpoint · 75 rows staged · edition 2026-11-12:[0-9a-f]{16} · resume from 75/.test(
            l,
          ),
        ),
      ).toBe(true);
      expect(fake.live().length).toBe(layers.length);
      expect(
        new Set(fake.live().map((r) => `${r.constraintType}|${r.reference}|${r.organisation}`))
          .size,
      ).toBe(layers.length);
      expect(fake.liveGate().length).toBe(publishers.size);
      expect(fake.staged().length).toBe(0);
      expect(fake.checkpoints.get("load-planning-areas")).toBeUndefined();
      expect(filer.resumeNote()).toBe("the start (nothing staged yet)");
    },
  );

  it(
    "an edition change discards the staged rows and starts from zero",
    { timeout: 60_000 },
    async () => {
      const fake = createFakeClient();
      fake.setFailAfterInserts(3);
      await expect(runLoad(fake)).rejects.toThrow(/simulated kill/);
      expect(fake.staged().length).toBe(75);

      const progress = createProgressLogger({ name: "load-planning-areas" });
      const filer = await beginFiling(progress, { client: fake as never });
      const prep = await filer.prepareResume("2099-01-01:deadbeefdeadbeef", 425);
      expect(prep.resumed).toBe(false);
      expect(fake.staged().length).toBe(0);
      expect(fake.checkpoints.get("load-planning-areas")).toBeUndefined();
    },
  );

  it("--restart discards the checkpoint and starts from zero", { timeout: 60_000 }, async () => {
    const fake = createFakeClient();
    fake.setFailAfterInserts(3);
    await expect(runLoad(fake)).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(75);

    fake.setFailAfterInserts(null);
    await runLoad(fake, { restart: true });
    expect(fake.live().length).toBe(425);
    expect(fake.checkpoints.get("load-planning-areas")).toBeUndefined();
  });
});
