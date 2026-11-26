import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  beginFiling,
  computeBasisResidents,
  countPostcodeAnswer,
  englandResidents,
  nationalForWindow,
  windowMonths,
} from "../loaders/load-crime.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// Guards the crime loader (plan step M4.3): it must anchor to the
// latest published Police.uk month, apply the freshness guard, count
// over the rolling 12-month window, and file into the postcode's
// cached answers without disturbing other answer keys. The fixture
// holds the REAL API responses captured on 12 Nov 2026; its totals
// must reproduce the approved reports exactly (330 / 10,722). The
// live proof against a real database runs in CI.

const loader = readFileSync(join(process.cwd(), "loaders", "load-crime.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests", "fixtures", "police-uk");
const fixture = JSON.parse(readFileSync(join(fixtureDir, "fixture.json"), "utf8"));

function monthIndex(yyyyMm: string): number {
  const [y, m] = yyyyMm.split("-").map(Number);
  return y * 12 + (m - 1);
}

describe("crime loader", () => {
  it("anchors to the availability endpoint and carries the freshness guard", () => {
    expect(loader).toContain("https://data.police.uk/api/crimes-street-dates");
    expect(loader).toContain("https://data.police.uk/api/crimes-street/all-crime");
    expect(loader).toContain("MAX_LAG_MONTHS = 3");
    expect(loader).toContain("freshness guard");
  });

  it("files by merging the crime key into the cached answers only", () => {
    expect(loader).toContain("answers = answers || $1::jsonb");
    expect(loader).toContain("Police.uk street-level crime");
  });

  it("fixture reproduces the approved totals over the latest 12 published months", () => {
    const dates = JSON.parse(readFileSync(join(fixtureDir, fixture.datesFile), "utf8")) as {
      date: string;
    }[];
    const latest = dates
      .map((d) => d.date)
      .sort()
      .at(-1);
    expect(latest).toBe("2026-09");
    // The freshness guard's maths on the fixture's pinned "today".
    expect(monthIndex(fixture.today.slice(0, 7)) - monthIndex(latest!)).toBe(2);

    const expected: Record<string, number> = { "CM3 2JT": 330, "E16 1GN": 10722 };
    for (const [pc, point] of Object.entries<{ prefix: string }>(fixture.points)) {
      let total = 0;
      for (let back = 11; back >= 0; back -= 1) {
        const idx = monthIndex(latest!) - back;
        const month = `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
        const records = JSON.parse(
          readFileSync(join(fixtureDir, `${point.prefix}-${month}.json`), "utf8"),
        ) as unknown[];
        total += records.length;
      }
      expect(total, `${pc} 12-month total`).toBe(expected[pc]);
    }
  });

  // M6.20 (decision D39): the fixture pins the Basis B
  // populations — the values measured at the step's prep on
  // the full filed directory. The loader's fixture mode
  // files the pin verbatim and never computes (the trap:
  // CI's lsoa_bases fixture holds only the three golden
  // rows, so a computation there would silently return the
  // own-LSOA population — basis A — while the count
  // goldens above still passed).
  it("fixture pins the measured Basis B populations (M6.20)", () => {
    expect(fixture.basisResidents).toEqual({ "CM3 2JT": 6380, "E16 1GN": 87519 });
    expect(loader).toContain("fixture.basisResidents");
    expect(loader).toContain("computeBasisResidents");
  });
});

// The loader's live basis path, driven through a fake pool
// (the loader-contracts gold standard): the SQL's candidate
// box is applied by the fake, the haversine cut and the
// whole-LSOA sum are the loader's own.
describe("crime loader — Basis B computation (M6.20)", () => {
  const POINT = { lat: 51.0, lng: 0.0 };
  // A synthetic directory around the point: LSOA A holds the
  // point and a neighbour 0.35 miles north; B's only
  // postcode sits 0.69 miles north (inside — B counts
  // WHOLE); C's only postcode sits 1.11 miles north
  // (outside — C is missed, the basis's named bias).
  const DIRECTORY = [
    { lsoa_code: "E01000001", latitude: 51.0, longitude: 0.0 },
    { lsoa_code: "E01000001", latitude: 51.005, longitude: 0.0 },
    { lsoa_code: "E01000002", latitude: 51.01, longitude: 0.0 },
    { lsoa_code: "E01000003", latitude: 51.016, longitude: 0.0 },
    { lsoa_code: null, latitude: 51.002, longitude: 0.0 },
  ];
  const BASES: Record<string, number> = { E01000001: 1000, E01000002: 2000, E01000003: 4000 };

  function fakeClient(bases: Record<string, number>) {
    return {
      async query(text: string, params?: readonly unknown[]) {
        if (text.includes("FROM postcode_cache")) {
          const [latLo, latHi, lngLo, lngHi] = params as number[];
          return {
            rows: DIRECTORY.filter(
              (r) =>
                // The loader's SQL filters lsoa_code IS NOT
                // NULL (directory rows with no LSOA — the
                // null row above — never reach the set).
                r.lsoa_code !== null &&
                r.latitude >= latLo &&
                r.latitude <= latHi &&
                r.longitude >= lngLo &&
                r.longitude <= lngHi,
            ),
          };
        }
        if (text.includes("FROM lsoa_bases WHERE lsoa_code = ANY")) {
          const codes = (params as unknown[][])[0] as string[];
          return {
            rows: codes
              .filter((c) => c in bases)
              .map((c) => ({ lsoa_code: c, residents: bases[c] })),
          };
        }
        throw new Error(`unexpected query: ${text}`);
      },
    };
  }

  it("sums the LSOAs of the in-mile postcodes, counted whole", async () => {
    // A (1,000) + B (2,000); C's 4,000 is outside the mile.
    expect(await computeBasisResidents(fakeClient(BASES) as never, POINT)).toBe(3000);
  });

  it("returns null when any in-set LSOA has no bases row — a partial sum is never filed", async () => {
    const partial = { E01000001: 1000, E01000003: 4000 };
    expect(await computeBasisResidents(fakeClient(partial) as never, POINT)).toBeNull();
  });

  it("pins the degradation the fixture mode must never fall into: own-LSOA alone is not the basis", async () => {
    // Basis A would file 1,000 here. The computed basis is
    // the multi-LSOA sum — if the loader's set logic ever
    // collapses to the point's own LSOA, this fails.
    const basis = await computeBasisResidents(fakeClient(BASES) as never, POINT);
    expect(basis).not.toBe(BASES.E01000001);
    expect(basis).toBe(3000);
  });
});

describe("crime loader — the England embedding (M6.20)", () => {
  const MONTHS = [
    "2025-10",
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08",
    "2026-09",
  ];

  function fakeClient(filedMonths: string[], basesAreas: number, basesSum: number) {
    return {
      async query(text: string, params?: readonly unknown[]) {
        if (text.includes("FROM crime_national_months")) {
          const wanted = (params as unknown[][])[0];
          return {
            rows: wanted
              .filter((m) => filedMonths.includes(m as string))
              .map((m) => ({ month: m, england_total: 100 })),
          };
        }
        if (text.includes("FROM lsoa_bases")) {
          return { rows: [{ residents: basesSum, areas: basesAreas }] };
        }
        throw new Error(`unexpected query: ${text}`);
      },
    };
  }

  it("embeds the window figure when all 12 months are filed", async () => {
    const national = await nationalForWindow(fakeClient(MONTHS, 33755, 56490108) as never, MONTHS);
    expect(national).toEqual({ total: 1200, residents: 56490108 });
  });

  it("embeds nothing while any month of the window is uncounted", async () => {
    const national = await nationalForWindow(
      fakeClient(MONTHS.slice(0, 11), 33755, 56490108) as never,
      MONTHS,
    );
    expect(national).toBeNull();
  });

  it("the denominator is the filed E01 sum — and null while the bases are unfiled", async () => {
    expect(await englandResidents(fakeClient([], 33755, 56490108) as never)).toBe(56490108);
    expect(await englandResidents(fakeClient([], 0, 0) as never)).toBeNull();
  });
});

describe("resume (BUG-368)", () => {
  // A fake pg client: the staged answers, the postcode
  // cache's live answers and the loader_checkpoint row as
  // arrays, with just enough SQL to run the filer. The
  // national-months lookup answers empty (no month filed),
  // so counted answers carry national: null, as a run
  // before the national loader has ever filed would.
  type StagedRow = { postcode: string; answer: string; seq: number };
  type CheckpointRow = {
    loader: string;
    edition: string;
    expected: number | null;
    next_start_index: number;
    read_count: number;
    filed_count: number;
    state: Record<string, unknown> | null;
  };
  const POSTCODES = ["CM3 2JT", "E16 1GN"];
  const LATEST = "2026-09";
  const MONTHS = windowMonths(LATEST);
  const APPROVED: Record<string, number> = { "CM3 2JT": 330, "E16 1GN": 10722 };
  function createFakeClient() {
    let staged: StagedRow[] = [];
    const cache = new Map<string, { crime?: Record<string, unknown> }>(
      POSTCODES.map((pc) => [pc, {}]),
    );
    const checkpoints = new Map<string, CheckpointRow>();
    let insertCalls = 0;
    let failAfterInserts: number | null = null;
    let snapshot: {
      staged: StagedRow[];
      cache: Map<string, { crime?: Record<string, unknown> }>;
      checkpoints: Map<string, CheckpointRow>;
    } | null = null;
    const query = async (sql: string, params: unknown[] = []) => {
      const text = sql.replace(/\s+/g, " ");
      if (text === "BEGIN") {
        snapshot = {
          staged: [...staged],
          cache: new Map([...cache].map(([k, v]) => [k, { ...v }])),
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
          cache.clear();
          for (const [k, v] of snapshot.cache) cache.set(k, v);
          checkpoints.clear();
          for (const [k, v] of snapshot.checkpoints) checkpoints.set(k, v);
        }
        snapshot = null;
        return { rows: [] };
      }
      if (/CREATE TABLE IF NOT EXISTS crime_stage/.test(text)) return { rows: [] };
      if (/INSERT INTO crime_stage/.test(text)) {
        insertCalls += 1;
        if (failAfterInserts !== null && insertCalls > failAfterInserts)
          throw new Error("simulated kill: the database connection dropped mid-insert");
        staged.push({
          postcode: params[0] as string,
          answer: params[1] as string,
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
      if (/DELETE FROM crime_stage WHERE seq >=/.test(text)) {
        staged = staged.filter((r) => r.seq < (params[0] as number));
        return { rows: [], rowCount: 0 };
      }
      if (/DELETE FROM crime_stage/.test(text)) {
        staged = [];
        return { rows: [] };
      }
      if (/SELECT postcode, answer FROM crime_stage ORDER BY seq/.test(text)) {
        return { rows: staged.map((r) => ({ ...r })) };
      }
      if (/SELECT month, england_total FROM crime_national_months/.test(text)) {
        return { rows: [] };
      }
      if (/UPDATE postcode_cache SET answers = answers \|\|/.test(text)) {
        const pc = params[1] as string;
        const row = cache.get(pc);
        if (!row) return { rows: [], rowCount: 0 };
        row.crime = JSON.parse(params[0] as string).crime as Record<string, unknown>;
        return { rows: [], rowCount: 1 };
      }
      if (/SELECT answers->'crime' AS crime FROM postcode_cache/.test(text)) {
        const row = cache.get(params[0] as string);
        return { rows: row?.crime ? [{ crime: row.crime }] : [] };
      }
      throw new Error(`fake client: unhandled SQL: ${sql}`);
    };
    return {
      query,
      staged: () => staged,
      cacheCrime: (pc: string) => cache.get(pc)?.crime,
      checkpoints,
      setFailAfterInserts: (n: number | null) => {
        failAfterInserts = n;
      },
    };
  }
  type FakeClient = ReturnType<typeof createFakeClient>;
  async function runCrime(
    fake: FakeClient,
    { restart = false, lines = null as string[] | null } = {},
  ) {
    const captured: string[] = lines ?? [];
    const progress = createProgressLogger({
      name: "load-crime",
      log: (line: string) => captured.push(line),
    });
    const filer = await beginFiling(progress, { client: fake as never, restart });
    await filer.prepareResume(LATEST, POSTCODES.length);
    const answers = new Map<string, Record<string, unknown>>();
    for (const { postcode, answer } of filer.stagedAnswers())
      answers.set(postcode, answer as Record<string, unknown>);
    for (const pc of POSTCODES) {
      if (answers.has(pc)) continue;
      const answer = await countPostcodeAnswer({
        client: fake as never,
        fixture,
        fileDir: fixtureDir,
        pc,
        months: MONTHS,
        latest: LATEST,
      });
      answers.set(pc, answer as Record<string, unknown>);
      await filer.stageAnswer(pc, answer);
    }
    await filer.finishFiling(POSTCODES, answers, LATEST);
    return { filer, answers, lines: captured };
  }

  it("kill mid-count resumes and files every postcode exactly once", async () => {
    const fake = createFakeClient();
    // Kill after the first postcode is staged: the checkpoint
    // at 1, the second postcode never counted.
    const killLines: string[] = [];
    fake.setFailAfterInserts(1);
    await expect(runCrime(fake, { lines: killLines })).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(1);
    expect(fake.checkpoints.get("load-crime")?.next_start_index).toBe(1);
    expect(
      killLines.some((l) => /checkpoint 1\/2 postcodes \(50%\) · staged 1 · resume from 1/.test(l)),
    ).toBe(true);

    fake.setFailAfterInserts(null);
    const { filer, answers, lines } = await runCrime(fake);
    expect(answers.size).toBe(2);
    expect(
      lines.some((l) =>
        /resuming from checkpoint · 1 rows staged · edition 2026-09 · resume from 1/.test(l),
      ),
    ).toBe(true);
    // Every postcode filed once, with the approved totals.
    for (const pc of POSTCODES) {
      const filed = fake.cacheCrime(pc) as { total: number; basisResidents: number } | undefined;
      expect(filed?.total).toBe(APPROVED[pc]);
      expect(filed?.total).toBe((answers.get(pc) as { total: number }).total);
      expect(filed?.basisResidents).toBe(fixture.basisResidents[pc]);
    }
    // The merge cleared staging and the checkpoint together.
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-crime")).toBeUndefined();
    expect(filer.resumeNote()).toBe("the start (nothing staged yet)");
  });

  it("a new latest month discards the staged answers and starts from zero", async () => {
    const fake = createFakeClient();
    fake.setFailAfterInserts(1);
    await expect(runCrime(fake)).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(1);

    const progress = createProgressLogger({ name: "load-crime", log: () => {} });
    const filer = await beginFiling(progress, { client: fake as never });
    const prep = await filer.prepareResume("2026-10", POSTCODES.length);
    expect(prep.resumed).toBe(false);
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-crime")).toBeUndefined();
  });

  it("--restart discards the checkpoint and starts from zero", async () => {
    const fake = createFakeClient();
    fake.setFailAfterInserts(1);
    await expect(runCrime(fake)).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(1);

    fake.setFailAfterInserts(null);
    const { answers } = await runCrime(fake, { restart: true });
    expect(answers.size).toBe(2);
    for (const pc of POSTCODES) {
      const filed = fake.cacheCrime(pc) as { total: number } | undefined;
      expect(filed?.total).toBe(APPROVED[pc]);
    }
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-crime")).toBeUndefined();
  });
});
