import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPoints, beginFiling, editionOf } from "../loaders/load-health.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// Guards the health loader (plan step M4.7): the register recipes
// (ACTIVE + RO76 practices, dated branch filtering, the reviewed
// exclusion list), the three-state emergency flag, the exact-code
// ratings join under both identifiers, and the golden facts —
// including the user's Sidney House correction: a practice's
// distance is the distance to its nearest site. The live proof
// runs in CI against a real PostGIS.

const loader = readFileSync(join(process.cwd(), "loaders/load-health.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests/fixtures/health");
const readReport = (name: string) =>
  readFileSync(join(fixtureDir, `${name}.csv`), "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.split(","));
const epraccur = readReport("epraccur");
const ebranchs = readReport("ebranchs");

describe("health loader sources", () => {
  it("uses the DSE reports and discovers the CQC files from the Using CQC data page", () => {
    expect(loader).toContain("odsdatasearchandexport.nhs.uk/api/getReport");
    expect(loader).toContain("using-cqc-data");
    expect(loader).toContain("_CQC_directory");
    expect(loader).toContain("_Latest_ratings");
  });

  it("keeps the reviewed exclusion list in the open, with its reason", () => {
    expect(loader).toContain("EXCLUDED_PRACTICES");
    expect(loader).toContain("F84750");
    expect(loader).toContain("Community Dermatology Clinic");
  });

  it("files branches by date with a COVID-name filter, and the parent code on the row", () => {
    expect(loader).toContain("gp_branch_surgery");
    expect(loader).toContain("COVID|VACCINATION");
    expect(loader).toContain("parentOdsCode");
  });

  it("joins ratings under both identifiers and keeps the flag three-state", () => {
    expect(loader).toContain("locationByOdsCode");
    expect(loader).toContain("hasEmergencyDepartment");
    expect(loader).toContain("urgent and emergency services");
  });

  it("files the ratings population groups on hospital points only (M6.24)", () => {
    expect(loader).toContain("cqcPopulationGroups");
    expect(loader).toContain("cqc_population_groups");
    // "Overall" is the rating's own marker in that column and
    // never files as a group.
    expect(loader).toContain('group !== "overall"');
  });
});

describe("fixture register facts", () => {
  it("the trap clinic is in the raw file — and the defunct practice is not", () => {
    expect(epraccur.some((r) => r[0] === "F84750")).toBe(true);
    expect(epraccur.some((r) => r[0] === "F84020")).toBe(false);
  });

  it("St Luke's and Sidney House exist only as branches, with their parents", () => {
    const stLukes = ebranchs.find((r) => r[0] === "F84749002");
    expect(stLukes?.[14]).toBe("F84749");
    const sidney = ebranchs.find((r) => r[0] === "F81149002");
    expect(sidney?.[14]).toBe("F81149");
    expect(sidney?.[9]).toBe("CM3 2HB");
  });
});

describe("the maternity signal (M6.24)", () => {
  // The step's founding fact, pinned at the fixture: the CQC
  // directory's vocabulary carries no maternity value at all —
  // the word does not appear in the file — while the ratings
  // file's "Service / Population Group" column (cell 17, the
  // column the loader's ratings aggregator reads) names
  // Maternity for exactly four locations.
  const directoryText = readFileSync(join(fixtureDir, "cqc-directory.csv"), "utf8");
  const ratings = readReport("cqc-ratings");

  it("the directory fixture never mentions maternity", () => {
    expect(directoryText).not.toContain("Maternity");
  });

  it("the ratings fixture carries the Maternity group for exactly the four units", () => {
    const locations = new Set(ratings.filter((r) => r[17] === "Maternity").map((r) => r[0]));
    expect([...locations].sort()).toEqual(["R1HNH", "RAJ32", "RVR05", "RVR50"]);
  });
});

// BUG-265: the point build carries the shared progress
// logger — a tally every 5,000 points built, and a closing
// line, with no total (points built is not the rows read).
describe("progress logging (BUG-265)", () => {
  const practiceRow = (code: string): string[] => {
    const row = new Array<string>(27).fill("");
    row[0] = code;
    row[1] = `Practice ${code}`;
    row[9] = "CM3 2JT";
    row[12] = "ACTIVE";
    row[25] = "RO76";
    return row;
  };
  const epraccur = Array.from({ length: 5001 }, (_, i) =>
    practiceRow(`F${String(i).padStart(5, "0")}`),
  );
  const buildArgs = (progress?: ReturnType<typeof createProgressLogger>) => ({
    epraccur,
    ebranchs: [],
    edispensary: [],
    egdpprac: [],
    directoryRows: [],
    positionOf: () => ({ lat: 51.776176, lng: 0.60387 }),
    today: new Date("2026-11-25T00:00:00Z"),
    progress: progress ?? null,
  });

  it("emits a tally line every 5,000 points and a closing line", () => {
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-health",
      log: (...args: unknown[]) => lines.push(args.join(" ")),
    });
    const { points } = buildPoints(buildArgs(progress));
    expect(points).toHaveLength(5001);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/progress · build 5,000 points$/);
    expect(lines[1]).toMatch(/progress · build 5,001 points$/);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });

  it("builds the same points without a logger", () => {
    const { points } = buildPoints(buildArgs());
    expect(points).toHaveLength(5001);
  });
});

// BUG-368: the filing resumes instead of restarting — the
// build re-runs whole and deterministic, the staging loop
// skips the points the checkpoint already covers.
describe("resume (BUG-368)", () => {
  // 2,501 synthetic practice points: past two 1,000-point
  // checkpoints, with a tail. Two carry ratings — the first
  // (staged by the killed run) and the last (the resumed
  // run's tail) — so the swap's ratings inserts are proved
  // from both halves, exactly once.
  const practiceRow = (code: string): string[] => {
    const row = new Array<string>(27).fill("");
    row[0] = code;
    row[1] = `Practice ${code}`;
    row[9] = "CM3 2JT";
    row[12] = "ACTIVE";
    row[25] = "RO76";
    return row;
  };
  const { points } = buildPoints({
    epraccur: Array.from({ length: 2501 }, (_, i) => practiceRow(`F${String(i).padStart(5, "0")}`)),
    ebranchs: [],
    edispensary: [],
    egdpprac: [],
    directoryRows: [],
    positionOf: () => ({ lat: 51.776176, lng: 0.60387 }),
    today: new Date("2026-11-25T00:00:00Z"),
  });
  points[0].rating = {
    cqcLocationId: "1-123",
    rating: "Good",
    ratingDate: "2026-08-26",
    reportUrl: "http://www.cqc.org.uk/location/1-123",
  };
  points[2500].rating = {
    cqcLocationId: "1-456",
    rating: "Requires improvement",
    ratingDate: "2026-07-17",
    reportUrl: "http://www.cqc.org.uk/location/1-456",
  };
  const EDITION = editionOf({
    odsDateStamp: "2026-11-12",
    directoryProducedOn: "2026-11-04",
    ratingsAsAt: "2026-11-02",
  });
  const STAGE_ARGS = { directoryProducedOn: "2026-11-04", odsDateStamp: "2026-11-12" };

  it("the edition combines the three source stamps", () => {
    expect(EDITION).toBe("2026-11-12|2026-11-04|2026-11-02");
  });

  // A fake pg client: the staged rows, the live tables and
  // the loader_checkpoint row as arrays, with just enough SQL
  // to run the filer.
  type StagedRow = { odsCode: string; seq: number };
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
    let ratings: Record<string, unknown>[] = [];
    const checkpoints = new Map<string, CheckpointRow>();
    let insertCalls = 0;
    let failAfterInserts: number | null = null;
    let snapshot: {
      staged: StagedRow[];
      live: StagedRow[];
      ratings: Record<string, unknown>[];
      checkpoints: Map<string, CheckpointRow>;
    } | null = null;
    const query = async (sql: string, params: unknown[] = []) => {
      const text = sql.replace(/\s+/g, " ");
      if (text === "BEGIN") {
        snapshot = {
          staged: [...staged],
          live: [...live],
          ratings: [...ratings],
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
          live = snapshot.live;
          ratings = snapshot.ratings;
          checkpoints.clear();
          for (const [k, v] of snapshot.checkpoints) checkpoints.set(k, v);
        }
        snapshot = null;
        return { rows: [] };
      }
      if (/CREATE TABLE IF NOT EXISTS health_stage/.test(text)) return { rows: [] };
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
      if (
        /SELECT loader, edition, expected, next_start_index, read_count, filed_count, state, updated_at/.test(
          text,
        )
      ) {
        const row = checkpoints.get(params[0] as string);
        return { rows: row ? [row] : [] };
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
      if (/DELETE FROM health_stage WHERE seq >=/.test(text)) {
        const before = staged.length;
        staged = staged.filter((r) => r.seq < (params[0] as number));
        return { rows: [], rowCount: before - staged.length };
      }
      if (text === "DELETE FROM health_stage") {
        staged = [];
        return { rows: [] };
      }
      if (/INSERT INTO health_stage/.test(text)) {
        insertCalls += 1;
        if (failAfterInserts !== null && insertCalls > failAfterInserts)
          throw new Error("simulated kill: the database connection dropped mid-insert");
        staged.push({ odsCode: params[0] as string, seq: params[14] as number });
        return { rows: [], rowCount: 1 };
      }
      if (/SELECT count\(\*\)::int AS n FROM health_stage/.test(text))
        return { rows: [{ n: staged.length }] };
      if (/DELETE FROM cqc_ratings/.test(text)) {
        ratings = [];
        return { rows: [] };
      }
      if (/DELETE FROM health_points/.test(text)) {
        live = [];
        return { rows: [] };
      }
      if (/INSERT INTO health_points/.test(text)) {
        live = [...staged].sort((a, b) => a.seq - b.seq);
        return {
          rows: live.map((r, i) => ({ id: i + 1, ods_code: r.odsCode })),
        };
      }
      if (/INSERT INTO cqc_ratings/.test(text)) {
        ratings.push({
          health_point_id: params[0],
          cqc_location_id: params[1],
          rating: params[2],
          rating_date: params[3],
          report_url: params[4],
        });
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n FROM health_points/.test(text))
        return { rows: [{ n: live.length }] };
      throw new Error(`fake client: unhandled SQL: ${sql}`);
    };
    return {
      query,
      staged: () => staged,
      liveCodes: () => live.map((r) => r.odsCode),
      ratings: () => ratings,
      checkpoints,
      setFailAfterInserts: (n: number | null) => {
        insertCalls = 0;
        failAfterInserts = n;
      },
    };
  }
  type FakeClient = ReturnType<typeof createFakeClient>;
  async function runLoad(
    fake: FakeClient,
    {
      restart = false,
      lines = null as string[] | null,
    }: { restart?: boolean; lines?: string[] | null } = {},
  ) {
    const captured: string[] = lines ?? [];
    const progress = createProgressLogger({
      name: "load-health",
      log: (line: string) => captured.push(line),
    });
    const filer = await beginFiling(progress, { client: fake as never, restart });
    await filer.prepareResume(EDITION, points.length);
    await filer.stagePoints(points, STAGE_ARGS);
    return { filer, lines: captured };
  }

  it(
    "kill mid-filing resumes and files every point exactly once",
    { timeout: 30_000 },
    async () => {
      const fake = createFakeClient();
      // Kill after 1,500 inserts: 1,500 rows staged, the
      // checkpoint at 1,000, the second chunk's tail unflushed
      // past it.
      const killLines: string[] = [];
      fake.setFailAfterInserts(1500);
      await expect(runLoad(fake, { lines: killLines })).rejects.toThrow(/simulated kill/);
      expect(fake.staged().length).toBe(1500);
      expect(fake.checkpoints.get("load-health")?.next_start_index).toBe(1000);
      expect(
        killLines.some((l) =>
          /checkpoint 1,000\/2,501 points \(40%\) · staged 1,000 · resume from 1,000/.test(l),
        ),
      ).toBe(true);

      fake.setFailAfterInserts(null);
      const { filer, lines } = await runLoad(fake);
      expect(
        lines.some((l) =>
          /resuming from checkpoint · 1,000 rows staged · edition 2026-11-12\|2026-11-04\|2026-11-02 · resume from 1,000/.test(
            l,
          ),
        ),
      ).toBe(true);
      expect(
        lines.some((l) =>
          /checkpoint 2,501\/2,501 points \(100%\) · staged 2,501 · resume from 2,501/.test(l),
        ),
      ).toBe(true);
      await filer.finishFiling(points, { ratingsAsAt: "2026-11-02" });
      expect(fake.liveCodes()).toHaveLength(2501);
      expect(new Set(fake.liveCodes()).size).toBe(2501);
      expect(fake.liveCodes().sort()).toEqual(points.map((p) => p.odsCode).sort());
      // Both ratings filed once, against the right points: the
      // first point (id 1) and the last (id 2,501).
      expect(fake.ratings()).toHaveLength(2);
      expect(
        fake
          .ratings()
          .map((r) => r.health_point_id)
          .sort(),
      ).toEqual([1, 2501]);
      expect(
        fake
          .ratings()
          .map((r) => r.cqc_location_id)
          .sort(),
      ).toEqual(["1-123", "1-456"]);
      // The swap cleared staging and the checkpoint together.
      expect(fake.staged().length).toBe(0);
      expect(fake.checkpoints.get("load-health")).toBeUndefined();
      expect(filer.resumeNote()).toBe("the start (nothing staged yet)");
    },
  );

  it(
    "an edition change discards the staged rows and starts from zero",
    { timeout: 30_000 },
    async () => {
      const fake = createFakeClient();
      fake.setFailAfterInserts(1500);
      await expect(runLoad(fake)).rejects.toThrow(/simulated kill/);
      expect(fake.staged().length).toBe(1500);

      const progress = createProgressLogger({ name: "load-health", log: () => {} });
      const filer = await beginFiling(progress, { client: fake as never });
      const prep = await filer.prepareResume("2026-11-13|2026-11-04|2026-11-02", points.length);
      expect(prep.resumed).toBe(false);
      expect(fake.staged().length).toBe(0);
      expect(fake.checkpoints.get("load-health")).toBeUndefined();
      // The fresh start files the whole read.
      fake.setFailAfterInserts(null);
      await filer.stagePoints(points, STAGE_ARGS);
      await filer.finishFiling(points, { ratingsAsAt: "2026-11-02" });
      expect(fake.liveCodes()).toHaveLength(2501);
      expect(new Set(fake.liveCodes()).size).toBe(2501);
    },
  );

  it("--restart discards the checkpoint and starts from zero", { timeout: 30_000 }, async () => {
    const fake = createFakeClient();
    fake.setFailAfterInserts(1500);
    await expect(runLoad(fake)).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(1500);

    fake.setFailAfterInserts(null);
    const { filer, lines } = await runLoad(fake, { restart: true });
    expect(lines.some((l) => /restart requested — discarding checkpoint and staging/.test(l))).toBe(
      true,
    );
    await filer.finishFiling(points, { ratingsAsAt: "2026-11-02" });
    expect(fake.liveCodes()).toHaveLength(2501);
    expect(new Set(fake.liveCodes()).size).toBe(2501);
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-health")).toBeUndefined();
  });
});
