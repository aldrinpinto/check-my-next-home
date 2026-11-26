import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { beginFiling, greenBeltEdition, processPieces } from "../loaders/load-green-belt.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// Guards the green belt loader (plan step M5.2): the filed name
// is the belt itself (green-belt-core), never the compiling
// district (gap L5), and the fixture (real rows captured 12 Nov
// 2026) holds the golden geography — no Braintree piece exists,
// and the Epsom and Ewell piece belongs to the London belt whose
// edge sits 0.101 miles from the flat.

const loader = readFileSync(join(process.cwd(), "loaders/load-green-belt.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests/fixtures/green-belt");

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

const gb = parseCsv(readFileSync(join(fixtureDir, "green-belt.csv"), "utf8"));

describe("green belt loader sources", () => {
  it("reads the planning.data.gov.uk green-belt file and files shapes via PostGIS", () => {
    expect(loader).toContain("files.planning.data.gov.uk/dataset/green-belt.csv");
    expect(loader).toContain("ST_Multi(ST_GeomFromText");
    expect(loader).toContain("green_belt");
  });

  it("names pieces by the belt, never by district (L5)", () => {
    expect(loader).toContain('item.row["green-belt-core"]');
    expect(loader).toContain("never by district");
  });

  it("counts ended and geometry-less rows in the log line", () => {
    expect(loader).toContain("without geometry counted");
    expect(loader).toContain("ended excluded");
  });
});

describe("fixture golden facts", () => {
  it("holds the golden districts' pieces plus two other belts", () => {
    expect(gb).toHaveLength(6);
    const cores = new Set(gb.map((r) => r["green-belt-core"]));
    expect(cores.has("London")).toBe(true);
    expect(cores.size).toBeGreaterThan(1);
  });

  it("the Epsom and Ewell piece belongs to the London belt", () => {
    const epsom = gb.find((r) => r["local-authority-district"] === "E07000208");
    expect(epsom?.["green-belt-core"]).toBe("London");
    expect(epsom?.["name"]).toBe("Epsom and Ewell"); // the district name the loader must NOT serve
  });

  it("no piece exists for Braintree district — absence is genuine (MHCLG compiles all)", () => {
    expect(gb.some((r) => r["local-authority-district"] === "E07000067")).toBe(false);
  });
});

describe("resume (BUG-368)", () => {
  // A fake pg client: the staged rows, the live table and
  // the loader_checkpoint row as arrays, with just enough
  // SQL to run the filer.
  type StagedRow = { name: string; reference: string; seq: number };
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
    let live: StagedRow[] = [];
    const checkpoints = new Map<string, CheckpointRow>();
    let insertCalls = 0;
    let failAfterInserts: number | null = null;
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
      if (/CREATE TABLE IF NOT EXISTS green_belt_stage/.test(text)) return { rows: [] };
      if (/INSERT INTO green_belt_stage/.test(text)) {
        insertCalls += 1;
        if (failAfterInserts !== null && insertCalls > failAfterInserts)
          throw new Error("simulated kill: the database connection dropped mid-insert");
        for (let r = 0; r < params.length / 10; r++) {
          const b = r * 10;
          staged.push({
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
      if (/DELETE FROM green_belt_stage WHERE seq >=/.test(text)) {
        staged = staged.filter((r) => r.seq < (params[0] as number));
        return { rows: [], rowCount: 0 };
      }
      if (/DELETE FROM green_belt_stage/.test(text)) {
        staged = [];
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n FROM green_belt_stage/.test(text))
        return { rows: [{ n: staged.length }] };
      if (/DELETE FROM planning_layers WHERE constraint_type = 'green_belt'/.test(text)) {
        live = [];
        return { rows: [] };
      }
      if (/INSERT INTO planning_layers/.test(text)) {
        live = [...staged];
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n FROM planning_layers/.test(text))
        return { rows: [{ n: live.length }] };
      throw new Error(`fake client: unhandled SQL: ${sql}`);
    };
    return {
      query,
      staged: () => staged,
      live: () => live,
      checkpoints,
      setFailAfterInserts: (n: number | null) => {
        insertCalls = 0;
        failAfterInserts = n;
      },
    };
  }
  type FakeClient = ReturnType<typeof createFakeClient>;
  const fixtureDir = join(process.cwd(), "tests/fixtures/green-belt");
  const sourceDate = JSON.parse(readFileSync(join(fixtureDir, "fixture.json"), "utf8"))
    .captured as string;

  // The fixture's filed pieces, exactly as main() builds them.
  function fixtureSets() {
    const text = readFileSync(join(fixtureDir, "green-belt.csv"), "utf8");
    const processed = processPieces(parseCsv(text));
    const edition = greenBeltEdition(sourceDate, text);
    return { filed: processed.filed, edition };
  }

  async function runLoad(
    fake: FakeClient,
    { restart = false, lines = null as string[] | null } = {},
  ) {
    const capturedLines: string[] = lines ?? [];
    const progress = createProgressLogger({
      name: "load-green-belt",
      log: (line: string) => capturedLines.push(line),
    });
    const { filed, edition } = fixtureSets();
    const filer = await beginFiling(progress, { client: fake as never, restart });
    const prep = await filer.prepareResume(edition, filed.length);
    const startOffset = prep.resumed ? prep.checkpoint.next_start_index : 0;
    await filer.stagePieces(filed.slice(startOffset), sourceDate);
    await filer.finishFiling(filed.length);
    return { filer, filed, lines: capturedLines };
  }

  it(
    "kill mid-stage resumes from the last chunk and files every piece exactly once",
    { timeout: 60_000 },
    async () => {
      const fake = createFakeClient();
      // 6 pieces in 5-row chunks: the first chunk lands and
      // checkpoints at 5; the second chunk (insert 2) dies —
      // 5 staged, the checkpoint at 5.
      const killLines: string[] = [];
      fake.setFailAfterInserts(1);
      await expect(runLoad(fake, { lines: killLines })).rejects.toThrow(/simulated kill/);
      expect(fake.staged().length).toBe(5);
      expect(fake.checkpoints.get("load-green-belt")?.next_start_index).toBe(5);
      expect(fake.live().length).toBe(0);
      expect(
        killLines.some((l) => /checkpoint 5\/6 pieces \(83%\) · staged 5 · resume from 5/.test(l)),
      ).toBe(true);

      fake.setFailAfterInserts(null);
      const { filer, filed, lines } = await runLoad(fake);
      expect(
        lines.some((l) =>
          /resuming from checkpoint · 5 rows staged · edition 2026-11-12:[0-9a-f]{16} · resume from 5/.test(
            l,
          ),
        ),
      ).toBe(true);
      expect(fake.live().length).toBe(filed.length);
      expect(new Set(fake.live().map((r) => r.reference)).size).toBe(filed.length);
      expect(fake.staged().length).toBe(0);
      expect(fake.checkpoints.get("load-green-belt")).toBeUndefined();
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
      expect(fake.staged().length).toBe(5);

      const progress = createProgressLogger({ name: "load-green-belt" });
      const filer = await beginFiling(progress, { client: fake as never });
      const prep = await filer.prepareResume("2099-01-01:deadbeefdeadbeef", 6);
      expect(prep.resumed).toBe(false);
      expect(fake.staged().length).toBe(0);
      expect(fake.checkpoints.get("load-green-belt")).toBeUndefined();
    },
  );

  it("--restart discards the checkpoint and starts from zero", { timeout: 60_000 }, async () => {
    const fake = createFakeClient();
    fake.setFailAfterInserts(1);
    await expect(runLoad(fake)).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(5);

    fake.setFailAfterInserts(null);
    await runLoad(fake, { restart: true });
    expect(fake.live().length).toBe(6);
    expect(fake.checkpoints.get("load-green-belt")).toBeUndefined();
  });
});
