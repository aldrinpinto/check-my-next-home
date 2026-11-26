import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  GOLDEN,
  collectSnapshots,
  collectTitles,
  fileSnapshots,
  fileTitles,
  goldenChecks,
  loadCompanyOwnership,
  normalisePostcode,
  openCsvStream,
  parseTitleRow,
  resolveFileSources,
} from "../loaders/load-company-ownership.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// Company ownership loader (plan step M5.13; decisions
// D15 + D18), tested against the fixture in
// tests/fixtures/company-ownership — REAL extracts pulled
// live at the build (14 Nov 2026) from the November 2026
// CCOD/OCOD full files and the 1 Nov 2026 Companies House
// bulk snapshot: the three golden postcodes' complete
// slices. What is pinned: the golden sample-check record
// exactly (the No's proven against non-empty slices, the
// Minerva House building freehold, both snapshot states),
// the header contract, the reject-by-name discipline,
// the filer's statement order and full-replacement shape,
// and the missing-snapshot classification. Live national
// filing is proven by the build's rehearsal, not here.

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/company-ownership");
const ccodText = () => readFileSync(join(FIXTURE_DIR, "ccod.csv"), "utf8");

type TitleRow = {
  titleNumber: string;
  dataset: string;
  tenure: string;
  propertyAddress: string;
  postcode: string | null;
  proprietorName: string;
  companyNumber: string | null;
  countryIncorporated: string | null;
  pricePaid: number | null;
  dateProprietorAdded: string | null;
};

async function fixtureTitles() {
  const ccod = await collectTitles(openCsvStream(join(FIXTURE_DIR, "ccod.csv")), "ccod", null);
  const ocod = await collectTitles(openCsvStream(join(FIXTURE_DIR, "ocod.csv")), "ocod", null);
  const ccodRows: TitleRow[] = [];
  const ocodRows: TitleRow[] = [];
  await collectTitles(openCsvStream(join(FIXTURE_DIR, "ccod.csv")), "ccod", async (r: TitleRow) =>
    ccodRows.push(r),
  );
  await collectTitles(openCsvStream(join(FIXTURE_DIR, "ocod.csv")), "ocod", async (r: TitleRow) =>
    ocodRows.push(r),
  );
  return { ccod, ocod, ccodRows, ocodRows };
}

async function fixtureSnapshots(numbers: Set<string>) {
  const { found } = await collectSnapshots(
    openCsvStream(join(FIXTURE_DIR, "companies-house.csv")),
    numbers,
  );
  return found;
}

describe("the fixture load — the locked golden record, exactly", () => {
  it("files the golden slices with the measured counts and snapshot states", async () => {
    const { totals } = await loadCompanyOwnership(resolveFileSources(FIXTURE_DIR), {
      verifyOnly: true,
    });
    expect(totals.ccod).toBe(8);
    expect(totals.ocod).toBe(3);
    expect(totals.snapshots).toBe(2);
    expect(totals.numbersWanted).toBe(3);
    // The society's filed number is the one missing
    // snapshot; the three Adriatic titles carry no number.
    expect(totals.missingByNumber).toEqual(["7686"]);
    expect(totals.noNumber).toBe(3);
    expect(totals.rejects.every((r) => r.count === 0)).toBe(true);
  });

  it("Birkdale: the street's company titles are Sage Homes', and 19 Birkdale Rise is absent", async () => {
    const { ccodRows } = await fixtureTitles();
    const birkdale = ccodRows.filter((r) => r.postcode === "CM3 2JT");
    expect(birkdale.map((r) => r.titleNumber).sort()).toEqual(["AA53500", "AA53502"]);
    for (const row of birkdale) {
      expect(row.proprietorName).toBe("SAGE HOMES RP LIMITED");
      expect(row.companyNumber).toBe("11217910");
    }
    expect(ccodRows.find((r) => r.titleNumber === "AA53500")).toMatchObject({
      tenure: "Freehold",
      pricePaid: 153243,
      dateProprietorAdded: "2024-04-03",
    });
    expect(ccodRows.some((r) => r.propertyAddress.includes("19 Birkdale Rise"))).toBe(false);
  });

  it("Exeter Road: no rows at the postcode in either dataset", async () => {
    const { ccodRows, ocodRows } = await fixtureTitles();
    expect([...ccodRows, ...ocodRows].filter((r) => r.postcode === "E16 1GN")).toEqual([]);
  });

  it("Minerva House: no own-title row for Flat 4; the building freehold is Adriatic Land 11 (Guernsey, no number)", async () => {
    const { ocodRows, ccodRows } = await fixtureTitles();
    const freehold = ocodRows.find((r) => r.titleNumber === "SY876459");
    expect(freehold).toMatchObject({
      tenure: "Freehold",
      propertyAddress: "Flats 1-9 Minerva House, 12 Ceres Crescent, Epsom (KT17 1FH)",
      proprietorName: "ADRIATIC LAND 11 LIMITED",
      companyNumber: null,
      countryIncorporated: "GUERNSEY",
    });
    const all = [...ccodRows, ...ocodRows];
    expect(all.some((r) => /FLAT 4,?\s+MINERVA HOUSE/i.test(r.propertyAddress))).toBe(false);
    // The Juno House "4 Juno House" title is a different
    // building's flat — present in the slice, and not a
    // Minerva fact.
    expect(ccodRows.find((r) => r.titleNumber === "SY857898")?.propertyAddress).toBe(
      "4 Juno House, 16 Ceres Crescent, Epsom (KT17 1FH)",
    );
  });

  it("snapshots: Sage and Somy exactly as Companies House publishes; the society's number absent", async () => {
    const found = await fixtureSnapshots(new Set(["11217910", "13678133", "7686"]));
    expect(found.get("11217910")).toMatchObject({
      companyName: "SAGE HOMES RP LIMITED",
      status: "Active",
      incorporationDate: "2018-02-21",
    });
    expect(found.get("11217910")?.sicCodes).toContain(
      "68201 - Renting and operating of Housing Association real estate",
    );
    expect(found.get("13678133")).toMatchObject({
      companyName: "SOMY RESIDENTIAL LIMITED",
      status: "Active",
      incorporationDate: "2021-10-13",
    });
    expect(found.has("7686")).toBe(false);
  });

  it("golden checks pass on the fixture, and bite on tampering", async () => {
    const { ccod, ocod } = await fixtureTitles();
    const snapshots = await fixtureSnapshots(new Set(["11217910", "13678133", "7686"]));
    const base = {
      ccodGolden: ccod.goldenRows as TitleRow[],
      ocodGolden: ocod.goldenRows as TitleRow[],
      snapshots,
      edition: "2026-11",
    };
    expect(goldenChecks(base as never)).toEqual([]);

    const wrongNumber = base.ccodGolden.map((r) =>
      r.titleNumber === "AA53500" ? { ...r, companyNumber: "99999999" } : r,
    );
    expect(goldenChecks({ ...base, ccodGolden: wrongNumber } as never).join(" ")).toMatch(
      /AA53500.*company number/,
    );

    const with19 = [
      ...base.ccodGolden,
      {
        ...base.ccodGolden[0],
        titleNumber: "XX999",
        propertyAddress: "19 Birkdale Rise, Hatfield Peverel, Chelmsford (CM3 2JT)",
      },
    ];
    expect(goldenChecks({ ...base, ccodGolden: with19 } as never).join(" ")).toMatch(
      /negative control/,
    );

    const withSociety = new Map(snapshots);
    withSociety.set("7686", { companyName: "CLARION HOUSING ASSOCIATION LIMITED" } as never);
    expect(goldenChecks({ ...base, snapshots: withSociety } as never).join(" ")).toMatch(/7686/);

    const noFreehold = base.ocodGolden.filter((r) => r.titleNumber !== "SY876459");
    expect(goldenChecks({ ...base, ocodGolden: noFreehold } as never).join(" ")).toMatch(
      /SY876459/,
    );
    expect(GOLDEN.edition).toBe("2026-11");
  });
});

describe("the parse contract", () => {
  it("a renamed consumed column fails the load, naming the column", async () => {
    const renamed = ccodText().replace(",Tenure,", ",Tenure Type,");
    await expect(collectTitles(Readable.from([renamed]), "ccod", null)).rejects.toThrow(/Tenure/);
  });

  it("a short row is rejected by name and files nothing, while the rest of the file loads", async () => {
    const lines = ccodText().trimEnd().split("\n");
    const tampered = [...lines, '"XX12345","Freehold"'].join("\n");
    const rows: TitleRow[] = [];
    const stats = await collectTitles(Readable.from([tampered]), "ccod", async (r: TitleRow) =>
      rows.push(r),
    );
    expect(stats.rejectCount).toBe(1);
    expect(stats.rejects[0]).toContain("XX12345");
    expect(rows.map((r) => r.titleNumber)).not.toContain("XX12345");
    expect(stats.filed).toBe(8);
  });

  it("postcode normalisation: case and spacing repaired; a non-UK form files as no-postcode", () => {
    expect(normalisePostcode("cm3  2jt")).toEqual({ postcode: "CM3 2JT", dropped: false });
    expect(normalisePostcode("")).toEqual({ postcode: null, dropped: false });
    expect(normalisePostcode("NOT A POSTCODE")).toEqual({ postcode: null, dropped: true });
  });

  it("row validation: bad tenure, a non-numeric price and an impossible date each throw", () => {
    // A positional row in the CCOD layout (35 fields):
    // slots 2–4 and the proprietor addresses are blank.
    const baseRow = [
      "AA53500",
      "Freehold",
      "39 Birkdale Rise",
      "BRAINTREE",
      "ESSEX",
      "EAST",
      "CM3 2JT",
      "N",
      "153243",
      "SAGE HOMES RP LIMITED",
      "11217910",
      "Limited Company or Public Limited Company",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "03-04-2024",
      "N",
    ];
    const atMap: Record<string, number> = {
      "Title Number": 0,
      Tenure: 1,
      "Property Address": 2,
      District: 3,
      County: 4,
      Region: 5,
      Postcode: 6,
      "Multiple Address Indicator": 7,
      "Price Paid": 8,
      "Proprietor Name (1)": 9,
      "Company Registration No. (1)": 10,
      "Proprietorship Category (1)": 11,
      "Date Proprietor Added": 33,
      "Additional Proprietor Indicator": 34,
    };
    const idx = (patch: Record<number, string>) => {
      const copy = [...baseRow];
      for (const [k, v] of Object.entries(patch)) copy[Number(k)] = v;
      return copy;
    };
    expect(() => parseTitleRow(idx({}) as never, atMap as never, "ccod")).not.toThrow();
    expect(() =>
      parseTitleRow(idx({ 1: "Leasehold " }) as never, atMap as never, "ccod"),
    ).not.toThrow();
    expect(() => parseTitleRow(idx({ 1: "Commonhold" }) as never, atMap as never, "ccod")).toThrow(
      /Tenure/,
    );
    expect(() => parseTitleRow(idx({ 8: "153,243" }) as never, atMap as never, "ccod")).toThrow(
      /Price Paid/,
    );
    expect(() => parseTitleRow(idx({ 33: "31-02-2024" }) as never, atMap as never, "ccod")).toThrow(
      /real date/,
    );
  });
});

describe("the filer — statement order and full replacement", () => {
  function fakePool() {
    const queries: string[] = [];
    let stagedTitles = 0;
    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        queries.push(sql.replace(/\s+/g, " ").trim());
        if (/INSERT INTO company_titles_stage/.test(sql)) stagedTitles += params.length / 20;
        if (/SELECT count\(\*\)::int AS n FROM company_titles_stage/.test(sql))
          return { rows: [{ n: stagedTitles }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      },
      release: () => {},
    };
    return { pool: { connect: async () => client }, queries };
  }

  it("stages into a persistent table and swaps in its own transaction", async () => {
    const { pool, queries } = fakePool();
    await fileTitles(
      pool as never,
      "ccod",
      join(FIXTURE_DIR, "ccod.csv"),
      { sourceName: "test", sourceDate: "2026-11-01" },
      "2026-11-14T00:00:00Z",
    );
    // BUG-368: the stage is persistent now — the CREATE
    // TABLE IF NOT EXISTS opens the run (no BEGIN before
    // it: staging commits per flush), and the swap runs in
    // its own transaction after the staging.
    const create = queries.findIndex((q) =>
      q.includes("CREATE TABLE IF NOT EXISTS company_titles_stage"),
    );
    expect(create).toBe(0);
    const insertStage = queries.find((q) => q.startsWith("INSERT INTO company_titles_stage"));
    expect(insertStage).toContain("proprietor_name");
    expect(insertStage).toContain("country_incorporated");
    const begin = queries.findIndex((q) => q === "BEGIN");
    expect(begin).toBeGreaterThan(create);
    const del = queries.findIndex((q) => q.startsWith("DELETE FROM company_titles WHERE dataset"));
    const swap = queries.findIndex((q) => q.startsWith("INSERT INTO company_titles ("));
    expect(del).toBeGreaterThan(begin);
    expect(swap).toBeGreaterThan(del);
    expect(queries.at(-1)).toBe("COMMIT");
  });

  it("a second pass has the same full-replacement shape — no append path exists", async () => {
    const first = fakePool();
    await fileTitles(
      first.pool as never,
      "ocod",
      join(FIXTURE_DIR, "ocod.csv"),
      {
        sourceName: "test",
        sourceDate: "2026-11-01",
      },
      "2026-11-14T00:00:00Z",
    );
    const second = fakePool();
    await fileTitles(
      second.pool as never,
      "ocod",
      join(FIXTURE_DIR, "ocod.csv"),
      {
        sourceName: "test",
        sourceDate: "2026-11-01",
      },
      "2026-12-14T00:00:00Z",
    );
    expect(second.queries).toEqual(first.queries);
  });
});

describe("BUG-265 progress logging", () => {
  const collect = () => {
    const lines: string[] = [];
    return { lines, log: (line: string) => lines.push(line) };
  };

  it("logs a closing line per validation pass, with no percentage (no total is known mid-file)", async () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-company-ownership", log });
    await collectTitles(openCsvStream(join(FIXTURE_DIR, "ccod.csv")), "ccod", null, { progress });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/load-company-ownership progress · validate ccod 8 rows$/);
    expect(lines[0]).not.toMatch(/%/);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });

  it("logs a closing line for the snapshot scan", async () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-company-ownership", log });
    const stats = await collectTitles(openCsvStream(join(FIXTURE_DIR, "ccod.csv")), "ccod", null);
    await collectSnapshots(openCsvStream(join(FIXTURE_DIR, "companies-house.csv")), stats.numbers, {
      progress,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/load-company-ownership progress · scan snapshots \d+ rows$/);
  });
});

describe("resume (BUG-368)", () => {
  // A fake pg client shared by both filing passes: the
  // staged rows per table, the live tables and the
  // loader_checkpoint rows as arrays, with just enough SQL
  // to run the filers. The titles and snapshots filers
  // each carry their own checkpoint key.
  type StagedTitle = { titleNumber: string; dataset: string; seq: number };
  type StagedSnapshot = { companyNumber: string; seq: number };
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
    let stagedTitles: StagedTitle[] = [];
    let stagedSnapshots: StagedSnapshot[] = [];
    let liveTitles: StagedTitle[] = [];
    let liveSnapshots: StagedSnapshot[] = [];
    const checkpoints = new Map<string, CheckpointRow>();
    let insertCalls = 0;
    let failAfterInserts: number | null = null;
    let snapshot: {
      stagedTitles: StagedTitle[];
      stagedSnapshots: StagedSnapshot[];
      liveTitles: StagedTitle[];
      liveSnapshots: StagedSnapshot[];
    } | null = null;
    const query = async (sql: string, params: unknown[] = []) => {
      const text = sql.replace(/\s+/g, " ");
      if (text === "BEGIN") {
        snapshot = {
          stagedTitles: [...stagedTitles],
          stagedSnapshots: [...stagedSnapshots],
          liveTitles: [...liveTitles],
          liveSnapshots: [...liveSnapshots],
        };
        return { rows: [] };
      }
      if (text === "COMMIT") {
        snapshot = null;
        return { rows: [] };
      }
      if (text === "ROLLBACK") {
        if (snapshot) {
          stagedTitles = snapshot.stagedTitles;
          stagedSnapshots = snapshot.stagedSnapshots;
          liveTitles = snapshot.liveTitles;
          liveSnapshots = snapshot.liveSnapshots;
        }
        snapshot = null;
        return { rows: [] };
      }
      if (/CREATE TABLE IF NOT EXISTS company_(titles|snapshots)_stage/.test(text))
        return { rows: [] };
      if (/INSERT INTO company_titles_stage/.test(text)) {
        insertCalls += 1;
        if (failAfterInserts !== null && insertCalls > failAfterInserts)
          throw new Error("simulated kill: the database connection dropped mid-insert");
        for (let r = 0; r < params.length / 20; r++)
          stagedTitles.push({
            titleNumber: params[r * 20] as string,
            dataset: params[r * 20 + 1] as string,
            seq: params[r * 20 + 19] as number,
          });
        return { rows: [], rowCount: params.length / 20 };
      }
      if (/INSERT INTO company_snapshots_stage/.test(text)) {
        insertCalls += 1;
        if (failAfterInserts !== null && insertCalls > failAfterInserts)
          throw new Error("simulated kill: the database connection dropped mid-insert");
        for (let r = 0; r < params.length / 10; r++)
          stagedSnapshots.push({
            companyNumber: params[r * 10] as string,
            seq: params[r * 10 + 9] as number,
          });
        return { rows: [], rowCount: params.length / 10 };
      }
      if (/SELECT loader, edition, expected, next_start_index/.test(text)) {
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
        const rows =
          text.includes("company_titles_stage") && params[0]
            ? stagedTitles.filter((r) => r.dataset === (params[0] as string))
            : text.includes("company_titles_stage")
              ? stagedTitles
              : stagedSnapshots;
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
      if (/DELETE FROM company_titles_stage WHERE seq >=/.test(text)) {
        stagedTitles = stagedTitles.filter(
          (r) => !(r.seq >= (params[0] as number) && r.dataset === (params[1] as string)),
        );
        return { rows: [], rowCount: 0 };
      }
      if (/DELETE FROM company_titles_stage/.test(text)) {
        stagedTitles = stagedTitles.filter((r) => r.dataset !== (params[0] as string));
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n FROM company_titles_stage/.test(text))
        return {
          rows: [{ n: stagedTitles.filter((r) => r.dataset === (params[0] as string)).length }],
        };
      if (/DELETE FROM company_snapshots_stage WHERE seq >=/.test(text)) {
        stagedSnapshots = stagedSnapshots.filter((r) => r.seq < (params[0] as number));
        return { rows: [], rowCount: 0 };
      }
      if (/DELETE FROM company_snapshots_stage/.test(text)) {
        stagedSnapshots = [];
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n FROM company_snapshots_stage/.test(text))
        return { rows: [{ n: stagedSnapshots.length }] };
      if (/DELETE FROM company_titles WHERE dataset/.test(text)) {
        liveTitles = liveTitles.filter((r) => r.dataset !== (params[0] as string));
        return { rows: [] };
      }
      if (/INSERT INTO company_titles \(/.test(text)) {
        liveTitles = [
          ...liveTitles,
          ...stagedTitles.filter((r) => r.dataset === (params[0] as string)),
        ];
        return { rows: [] };
      }
      if (/DELETE FROM company_snapshots/.test(text)) {
        liveSnapshots = [];
        return { rows: [] };
      }
      if (/INSERT INTO company_snapshots \(/.test(text)) {
        liveSnapshots = [...stagedSnapshots];
        return { rows: [] };
      }
      throw new Error(`fake client: unhandled SQL: ${sql}`);
    };
    const client = { query, release: () => {} };
    return {
      pool: { connect: async () => client },
      stagedTitles: () => stagedTitles,
      stagedSnapshots: () => stagedSnapshots,
      liveTitles: () => liveTitles,
      liveSnapshots: () => liveSnapshots,
      checkpoints,
      setFailAfterInserts: (n: number | null) => {
        insertCalls = 0;
        failAfterInserts = n;
      },
    };
  }
  // A 2,500-row CCOD file: the fixture's first data row
  // repeated with distinct title numbers, so the filing
  // pass flushes three 1,000-row chunks.
  function titlesCsv(rows: number) {
    const lines = ccodText().trimEnd().split("\n");
    const dir = mkdtempSync(join(tmpdir(), "cmnh-company-titles-"));
    const path = join(dir, "ccod.csv");
    const body = Array.from({ length: rows }, (_, i) =>
      lines[1].replace(/^[^,]+/, `T${String(i + 1).padStart(7, "0")}`),
    );
    writeFileSync(path, [lines[0], ...body].join("\n"));
    return path;
  }
  // A 2,500-row Companies House file: the fixture's data
  // rows repeated with distinct company numbers.
  function snapshotsCsv(rows: number) {
    const text = readFileSync(join(FIXTURE_DIR, "companies-house.csv"), "utf8");
    const lines = text.trimEnd().split("\n");
    const dir = mkdtempSync(join(tmpdir(), "cmnh-company-snapshots-"));
    const path = join(dir, "companies-house.csv");
    const wanted = new Set<string>();
    const body = Array.from({ length: rows }, (_, i) => {
      const num = String(10000000 + i);
      wanted.add(num);
      return lines[1 + (i % 2)].replace(/,(\d{8}),/, `,${num},`);
    });
    writeFileSync(path, [lines[0], ...body].join("\n"));
    return { path, wanted };
  }
  const meta = { sourceName: "test", sourceDate: "2026-11-01", edition: "2026-11" };

  it("kill mid-filing resumes the titles pass and files every title exactly once", async () => {
    const fake = createFakeClient();
    const path = titlesCsv(2500);
    fake.setFailAfterInserts(1);
    await expect(
      fileTitles(fake.pool as never, "ccod", path, meta, "2026-11-14T00:00:00Z", {
        edition: "2026-11",
        expected: 2500,
      }),
    ).rejects.toThrow(/simulated kill/);
    // One 1,000-row flush staged and checkpointed; the
    // second flush never landed.
    expect(fake.stagedTitles().length).toBe(1000);
    expect(fake.checkpoints.get("load-company-ownership:ccod")?.next_start_index).toBe(1000);

    fake.setFailAfterInserts(null);
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-company-ownership",
      log: (...args: unknown[]) => lines.push(args.join(" ")),
    });
    const { filed } = await fileTitles(
      fake.pool as never,
      "ccod",
      path,
      meta,
      "2026-11-14T00:00:00Z",
      {
        edition: "2026-11",
        expected: 2500,
        progress,
      },
    );
    expect(filed).toBe(2500);
    expect(
      lines.some((l) =>
        /resuming from checkpoint · 1,000 rows staged · edition 2026-11 · resume from 1,000/.test(
          l,
        ),
      ),
    ).toBe(true);
    expect(fake.liveTitles().length).toBe(2500);
    expect(new Set(fake.liveTitles().map((r) => r.titleNumber)).size).toBe(2500);
    expect(fake.stagedTitles().length).toBe(0);
    expect(fake.checkpoints.get("load-company-ownership:ccod")).toBeUndefined();
  });

  it("an edition change discards the staged titles and starts from zero", async () => {
    const fake = createFakeClient();
    const path = titlesCsv(2500);
    fake.setFailAfterInserts(1);
    await expect(
      fileTitles(fake.pool as never, "ccod", path, meta, "2026-11-14T00:00:00Z", {
        edition: "2026-11",
        expected: 2500,
      }),
    ).rejects.toThrow(/simulated kill/);
    expect(fake.stagedTitles().length).toBe(1000);
    fake.setFailAfterInserts(null);
    await fileTitles(fake.pool as never, "ccod", path, meta, "2026-11-14T00:00:00Z", {
      edition: "2026-12",
      expected: 2500,
    });
    expect(fake.liveTitles().length).toBe(2500);
    expect(fake.stagedTitles().length).toBe(0);
    expect(fake.checkpoints.get("load-company-ownership:ccod")).toBeUndefined();
  });

  it("--restart discards the staged titles and starts from zero", async () => {
    const fake = createFakeClient();
    const path = titlesCsv(2500);
    fake.setFailAfterInserts(1);
    await expect(
      fileTitles(fake.pool as never, "ccod", path, meta, "2026-11-14T00:00:00Z", {
        edition: "2026-11",
        expected: 2500,
      }),
    ).rejects.toThrow(/simulated kill/);
    expect(fake.stagedTitles().length).toBe(1000);
    fake.setFailAfterInserts(null);
    await fileTitles(fake.pool as never, "ccod", path, meta, "2026-11-14T00:00:00Z", {
      edition: "2026-11",
      expected: 2500,
      restart: true,
    });
    expect(fake.liveTitles().length).toBe(2500);
    expect(new Set(fake.liveTitles().map((r) => r.titleNumber)).size).toBe(2500);
    expect(fake.stagedTitles().length).toBe(0);
  });

  it("kill mid-filing resumes the snapshots pass and files every snapshot exactly once", async () => {
    const fake = createFakeClient();
    const { path, wanted } = snapshotsCsv(2500);
    fake.setFailAfterInserts(1);
    await expect(
      fileSnapshots(fake.pool as never, path, wanted, meta, "2026-11-14T00:00:00Z", {
        edition: "2026-11",
        expected: 2500,
      }),
    ).rejects.toThrow(/simulated kill/);
    expect(fake.stagedSnapshots().length).toBe(1000);
    expect(fake.checkpoints.get("load-company-ownership:snapshots")?.next_start_index).toBe(1000);

    fake.setFailAfterInserts(null);
    const { filed } = await fileSnapshots(
      fake.pool as never,
      path,
      wanted,
      meta,
      "2026-11-14T00:00:00Z",
      {
        edition: "2026-11",
        expected: 2500,
      },
    );
    expect(filed).toBe(2500);
    expect(fake.liveSnapshots().length).toBe(2500);
    expect(new Set(fake.liveSnapshots().map((r) => r.companyNumber)).size).toBe(2500);
    expect(fake.stagedSnapshots().length).toBe(0);
    expect(fake.checkpoints.get("load-company-ownership:snapshots")).toBeUndefined();
  });
});
