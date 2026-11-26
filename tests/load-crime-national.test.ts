import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { join } from "node:path";
import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  countArchiveEnglandTotal,
  countEnglandRecords,
  csvRecords,
  runCountAndEmbed,
} from "../loaders/load-crime-national.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// Plan step M6.20 (decision D39): the England numerator's
// counting core. The loader stream-counts Police.uk's
// monthly archives on the E01 LSOA prefix — these tests pin
// the counter itself (the header is the contract, quoted
// fields cannot shift a count, non-England codes never
// count). The archive walk and the filing are proven by
// the rehearsal and the backfill; no England total is
// asserted here — the real figure is pinned by the
// backfill and recorded in the golden matrix.

const loader = readFileSync(join(process.cwd(), "loaders/load-crime-national.mjs"), "utf8");

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

describe("load-crime-national — the CSV reader", () => {
  it("honours quoted fields: commas, doubled quotes and newlines inside quotes", async () => {
    const csv = 'a,b,c\n"x,y","say ""hi""","line one\nline two"\n1,2,3\n';
    const records = await collect(csvRecords(Readable.from([csv])));
    expect(records).toEqual([
      ["a", "b", "c"],
      ["x,y", 'say "hi"', "line one\nline two"],
      ["1", "2", "3"],
    ]);
  });

  it("handles CRLF line endings and a final record with no trailing newline", async () => {
    const records = await collect(csvRecords(Readable.from(["a,b\r\n1,2"])));
    expect(records).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("load-crime-national — the England count", () => {
  const HEADER =
    "Crime ID,Month,Reported by,Falls within,Longitude,Latitude,Location,LSOA code,LSOA name,Crime type,Last outcome category,Context";

  function csvOf(rows: string[]): Readable {
    return Readable.from([[HEADER, ...rows].join("\n") + "\n"]);
  }

  it("counts exactly the E01 rows — Wales, Scotland and blank codes never count", async () => {
    const count = await countEnglandRecords(
      csvOf([
        "id1,2026-09,A,B,-0.1,51.5,On or near High Street,E01000001,City 001A,Violence,,",
        "id2,2026-09,A,B,-0.1,51.5,On or near High Street,W01000001,Welsh 001A,Violence,,",
        "id3,2026-09,A,B,-0.1,51.5,On or near High Street,S01000001,Scots 001A,Violence,,",
        "id4,2026-09,A,B,-0.1,51.5,On or near High Street,,Unknown,Violence,,",
        'id5,2026-09,A,B,-0.1,51.5,"On or near High Street, North",E01021395,Braintree 018C,Burglary,,"a, quoted, context"',
        "short,row",
      ]),
    );
    expect(count).toBe(2);
  });

  it("fails loudly when the header carries no LSOA code column — never counts the wrong field as zero", async () => {
    await expect(countEnglandRecords(Readable.from(["A,B,C\n1,2,3\n"]))).rejects.toThrow(
      'no "LSOA code" column',
    );
  });

  it("fails loudly on an empty file", async () => {
    await expect(countEnglandRecords(Readable.from([""]))).rejects.toThrow("was empty");
  });
});

// A minimal stored (uncompressed) zip, built by hand —
// enough for yauzl to read: local headers, central
// directory, end record, with real CRCs.
function buildZip(entries: { name: string; content: string }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.content, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = centrals.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

describe("load-crime-national — counting one month inside the cumulative archive", () => {
  const HEADER = "Crime ID,Month,LSOA code,Crime type";
  function streetCsv(e01Rows: number): string {
    const rows = [HEADER];
    for (let i = 0; i < e01Rows; i += 1) rows.push(`id,2026-09,E0100000${i},Burglary`);
    rows.push("id,2026-09,W01000001,Burglary");
    return rows.join("\n") + "\n";
  }

  function archiveWithTwoMonths(): string {
    const zip = buildZip([
      { name: "2026-08/2026-08-metropolitan-street.csv", content: streetCsv(3) },
      { name: "2026-08/2026-08-metropolitan-outcomes.csv", content: streetCsv(9) },
      { name: "2026-09/2026-09-metropolitan-street.csv", content: streetCsv(5) },
      { name: "2026-09/2026-09-wiltshire-street.csv", content: streetCsv(2) },
    ]);
    const path = join(mkdtempSync(join(tmpdir(), "cmnh-zip-")), "archive.zip");
    writeFileSync(path, zip);
    return path;
  }

  it("counts ONLY the named month's folder — never the whole cumulative zip", async () => {
    const path = archiveWithTwoMonths();
    // September: 5 + 2 E01 rows across its two forces; the
    // other month's 3 and the outcomes files' rows (which
    // describe the same records) never count. Counting the
    // whole zip — the bug the first backfill attempt hit —
    // would return 19 here, and 16,220,417 on the real
    // 37-month archive.
    expect(await countArchiveEnglandTotal(path, "2026-09")).toBe(7);
    expect(await countArchiveEnglandTotal(path, "2026-08")).toBe(3);
  });

  it("resolves null for a month the archive's window does not reach", async () => {
    expect(await countArchiveEnglandTotal(archiveWithTwoMonths(), "2025-01")).toBeNull();
  });
});

describe("load-crime-national — the loader's shape", () => {
  it("counts the published monthly archives, resumably, and embeds through jsonb_set", () => {
    expect(loader).toContain("https://data.police.uk/data/archive/${month}.zip");
    expect(loader).toContain("ON CONFLICT (month) DO NOTHING");
    expect(loader).toContain("jsonb_set");
    // Only street files count; the outcomes files describe
    // the same records and would double the month.
    expect(loader).toContain("-street\\.csv$");
    // The freshness guard is the crime family's shared one.
    expect(loader).toContain("crimes-street-dates");
    expect(loader).toContain("MAX_LAG_MONTHS = 3");
    // The embed refresh skips an artefact whose figure is
    // already the computed one (the practice break-crime
    // proof diffs crime answers across a scenario run).
    expect(loader).toContain("current.total === national.total");
  });

  it("the practice fixture carries a full synthetic 12-month window", () => {
    const fixture = JSON.parse(
      readFileSync(join(process.cwd(), "tests/fixtures/police-uk-national/fixture.json"), "utf8"),
    ) as { dates: { date: string }[]; months: Record<string, number>; today: string };
    const months = Object.keys(fixture.months).sort();
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2025-10");
    expect(months[11]).toBe("2026-09");
    expect(fixture.dates.at(-1)?.date).toBe("2026-09");
    // Synthetic fixture values — their sum is asserted only
    // as fixture arithmetic, never as an England figure.
    expect(Object.values(fixture.months).reduce((a, b) => a + b, 0)).toBe(5503997);
  });
});

describe("resume (BUG-368)", () => {
  // A fake pg client: the live months, the witness stage, the
  // postcode cache's crime artefacts and the loader_checkpoint
  // row as maps/arrays, with just enough SQL to run the
  // counter. The LSOA bases answer a full England denominator,
  // so the window figure embeds.
  type StagedRow = { month: string; england_total: number; seq: number };
  type CheckpointRow = {
    loader: string;
    edition: string;
    expected: number | null;
    next_start_index: number;
    read_count: number;
    filed_count: number;
    state: Record<string, unknown> | null;
  };
  const MONTHS = ["2026-07", "2026-08", "2026-09"];
  const LATEST = "2026-09";
  const TOTALS: Record<string, number> = { "2026-07": 100, "2026-08": 200, "2026-09": 300 };
  const RESIDENTS = 57_000_000;
  function createFakeClient() {
    const live = new Map<string, number>();
    let staged: StagedRow[] = [];
    const cache = new Map<string, { crime: Record<string, unknown> }>([
      [
        "CM3 2JT",
        {
          crime: {
            total: 330,
            windowFrom: "2026-07",
            windowTo: "2026-09",
            months: MONTHS.map((month) => ({ month, count: 0 })),
            national: null,
          },
        },
      ],
    ]);
    const checkpoints = new Map<string, CheckpointRow>();
    let stageInserts = 0;
    let failAfterStageInserts: number | null = null;
    let snapshot: {
      live: Map<string, number>;
      staged: StagedRow[];
      cache: Map<string, { crime: Record<string, unknown> }>;
      checkpoints: Map<string, CheckpointRow>;
    } | null = null;
    const query = async (sql: string, params: unknown[] = []) => {
      const text = sql.replace(/\s+/g, " ");
      if (text === "BEGIN") {
        snapshot = {
          live: new Map(live),
          staged: [...staged],
          cache: new Map([...cache].map(([k, v]) => [k, { crime: { ...v.crime } }])),
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
          live.clear();
          for (const [k, v] of snapshot.live) live.set(k, v);
          staged = snapshot.staged;
          cache.clear();
          for (const [k, v] of snapshot.cache) cache.set(k, v);
          checkpoints.clear();
          for (const [k, v] of snapshot.checkpoints) checkpoints.set(k, v);
        }
        snapshot = null;
        return { rows: [] };
      }
      if (/CREATE TABLE IF NOT EXISTS crime_national_stage/.test(text)) return { rows: [] };
      if (/INSERT INTO crime_national_months/.test(text)) {
        const month = params[0] as string;
        if (!live.has(month)) live.set(month, params[1] as number);
        return { rows: [], rowCount: 1 };
      }
      if (/INSERT INTO crime_national_stage/.test(text)) {
        stageInserts += 1;
        if (failAfterStageInserts !== null && stageInserts > failAfterStageInserts)
          throw new Error("simulated kill: the database connection dropped mid-insert");
        staged.push({
          month: params[0] as string,
          england_total: params[1] as number,
          seq: params[2] as number,
        });
        return { rows: [], rowCount: 1 };
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
      if (/DELETE FROM crime_national_stage WHERE seq >=/.test(text)) {
        staged = staged.filter((r) => r.seq < (params[0] as number));
        return { rows: [], rowCount: 0 };
      }
      if (/DELETE FROM crime_national_stage/.test(text)) {
        staged = [];
        return { rows: [] };
      }
      if (/SELECT month FROM crime_national_months/.test(text)) {
        return { rows: [...live.keys()].map((month) => ({ month })) };
      }
      if (/SELECT month, england_total FROM crime_national_months/.test(text)) {
        const wanted = params[0] as string[];
        return {
          rows: wanted
            .filter((m) => live.has(m))
            .map((m) => ({ month: m, england_total: live.get(m) })),
        };
      }
      if (/FROM lsoa_bases WHERE lsoa_code LIKE 'E01%'/.test(text)) {
        return { rows: [{ residents: RESIDENTS, areas: 33000 }] };
      }
      if (/SELECT postcode, answers -> 'crime' AS crime FROM postcode_cache/.test(text)) {
        return {
          rows: [...cache.entries()].map(([postcode, { crime }]) => ({ postcode, crime })),
        };
      }
      if (/UPDATE postcode_cache SET answers = jsonb_set/.test(text)) {
        const row = cache.get(params[1] as string);
        if (row) row.crime.national = JSON.parse(params[0] as string);
        return { rows: [], rowCount: row ? 1 : 0 };
      }
      throw new Error(`fake client: unhandled SQL: ${sql}`);
    };
    return {
      query,
      live: () => new Map(live),
      staged: () => staged,
      cacheCrime: (pc: string) => cache.get(pc)?.crime,
      checkpoints,
      setFailAfterStageInserts: (n: number | null) => {
        failAfterStageInserts = n;
      },
    };
  }
  type FakeClient = ReturnType<typeof createFakeClient>;
  async function runNational(
    fake: FakeClient,
    {
      restart = false,
      months = MONTHS,
      latest = LATEST,
      lines = null as string[] | null,
      counted = null as string[] | null,
    } = {},
  ) {
    const captured: string[] = lines ?? [];
    const progress = createProgressLogger({
      name: "load-crime-national",
      log: (line: string) => captured.push(line),
    });
    const result = await runCountAndEmbed(fake as never, {
      months,
      latest,
      countMonth: async (month: string) => {
        counted?.push(month);
        return TOTALS[month] ?? 0;
      },
      progress,
      restart,
    });
    return { result, lines: captured };
  }

  it("kill mid-count resumes without recounting a filed month", async () => {
    const fake = createFakeClient();
    // Kill after the first month is witnessed: the live table
    // already holds July, the checkpoint sits at 1, and the
    // August stage insert never lands.
    const killLines: string[] = [];
    const killedCounted: string[] = [];
    fake.setFailAfterStageInserts(1);
    await expect(runNational(fake, { lines: killLines, counted: killedCounted })).rejects.toThrow(
      /simulated kill/,
    );
    expect(fake.live().get("2026-07")).toBe(100);
    // August was counted and live-filed before its witness
    // insert threw — the live table is the resume state.
    expect(fake.live().get("2026-08")).toBe(200);
    expect(fake.staged().length).toBe(1);
    expect(fake.checkpoints.get("load-crime-national")?.next_start_index).toBe(1);
    expect(killLines.some((l) => /checkpoint 1 months · staged 1 · resume from 1/.test(l))).toBe(
      true,
    );

    fake.setFailAfterStageInserts(null);
    const counted: string[] = [];
    const { result, lines } = await runNational(fake, { counted });
    // Only September is counted on the resumed run — July
    // and August are skipped from the live table, never
    // recounted.
    expect(counted).toEqual(["2026-09"]);
    expect(killedCounted).toEqual(["2026-07", "2026-08"]);
    expect(result.newlyCounted).toBe(1);
    expect(result.windowTotal).toBe(600);
    expect(result.filedMonths).toBe(3);
    expect(
      lines.some((l) =>
        /resuming from checkpoint · 1 rows staged · edition 2026-09 · resume from 1/.test(l),
      ),
    ).toBe(true);
    // The embed landed on the filed artefact.
    expect(fake.cacheCrime("CM3 2JT")?.national).toEqual({ total: 600, residents: RESIDENTS });
    // The witness stage + checkpoint are cleared on success.
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-crime-national")).toBeUndefined();
    expect(result.resumeNote()).toBe("the start (nothing staged yet)");
  });

  it("an edition change discards the witness stage and starts from zero", async () => {
    const fake = createFakeClient();
    fake.setFailAfterStageInserts(1);
    await expect(runNational(fake)).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(1);

    fake.setFailAfterStageInserts(null);
    const lines: string[] = [];
    const counted: string[] = [];
    const { result } = await runNational(fake, {
      months: ["2026-08", "2026-09", "2026-10"],
      latest: "2026-10",
      lines,
      counted,
    });
    expect(result.resumePrep.resumed).toBe(false);
    expect(
      lines.some((l) =>
        /discarding stale checkpoint · edition changed \(2026-09 → 2026-10\)/.test(l),
      ),
    ).toBe(true);
    // August stays filed (the live table is the authority),
    // so only September and October are counted.
    expect(counted).toEqual(["2026-09", "2026-10"]);
    expect(fake.live().get("2026-10")).toBe(0);
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-crime-national")).toBeUndefined();
  });

  it("--restart discards the checkpoint and starts from zero", async () => {
    const fake = createFakeClient();
    fake.setFailAfterStageInserts(1);
    await expect(runNational(fake)).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(1);

    fake.setFailAfterStageInserts(null);
    const lines: string[] = [];
    const counted: string[] = [];
    const { result } = await runNational(fake, { restart: true, lines, counted });
    expect(result.resumePrep.resumed).toBe(false);
    expect(
      lines.some((l) =>
        /restart requested — discarding checkpoint and staging · starting from 0/.test(l),
      ),
    ).toBe(true);
    // The filed months still skip the recount — the restart
    // discards the witness, never the filed months.
    expect(counted).toEqual(["2026-09"]);
    expect(result.windowTotal).toBe(600);
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-crime-national")).toBeUndefined();
  });
});
