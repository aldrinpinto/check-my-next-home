import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decideUpdateAction,
  isCoveredPostcode,
  nationalFileSources,
  parseAllRecords,
  parseModeArgs,
  runNational,
  runUpdate,
  writeRunStamp,
} from "../loaders/load-sold-prices.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// Guards the sold-prices loader's NATIONAL mode and monthly
// UPDATE mode (Price Paid national step, adopted prep gaps
// 1–7): one pass files the whole register through a staging
// table and an atomic swap; the update mode merges one monthly
// file by transaction id under an edition gate; both modes'
// argument parsing is by name, never by slot. The filing
// functions are driven against an in-memory fake of the pg
// client that pattern-matches the loader's fixed SQL shapes —
// the live proof against a real database runs in CI.

const fixtureDir = join(process.cwd(), "tests", "fixtures", "land-registry");
const fullLines = readFileSync(join(fixtureDir, "pp-complete.csv"), "utf8").split(/\r?\n/);
const updateLines = readFileSync(join(fixtureDir, "pp-monthly-update.csv"), "utf8").split(/\r?\n/);

const COLUMNS = [
  "transaction_id",
  "postcode",
  "price",
  "sale_date",
  "property_type",
  "new_build",
  "tenure",
  "paon",
  "saon",
  "street",
  "locality",
  "town",
  "county",
  "ppd_category",
  "record_status",
  "source_name",
  "source_date",
] as const;

type Row = Record<string, unknown> & { seq?: number };

function valuesToRow(values: unknown[]): Row {
  const row: Row = {};
  COLUMNS.forEach((column, i) => {
    row[column] = values[i] ?? null;
  });
  return row;
}

// An in-memory stand-in for the loader's pg client. BEGIN
// snapshots the live register; ROLLBACK restores it — the
// swap-atomicity pins lean on exactly that.
class FakeClient {
  stage: Row[] | null = null;
  live: Row[] = [];
  statements: { sql: string; params: unknown[] }[] = [];
  cache = new Map<string, { answers: Record<string, unknown> }>();
  runs: Row[] = [];
  items: Row[] = [];
  failOnSwapInsert = false;
  failOnMergeInsert = false;
  failStamp = false;
  checkpoints = new Map<string, Record<string, unknown>>();
  #seq = 0;
  #mergeDeleteSeen = false;
  #snapshot: {
    live: Row[];
    stage: Row[] | null;
    checkpoints: Map<string, Record<string, unknown>>;
  } | null = null;

  seedCache(postcodes: string[]) {
    for (const postcode of postcodes) this.cache.set(postcode, { answers: {} });
  }

  async query(text: string, params: unknown[] = []): Promise<{ rows: Row[]; rowCount?: number }> {
    const sql = text.replace(/\s+/g, " ").trim();
    this.statements.push({ sql, params });
    if (sql === "BEGIN") {
      this.#snapshot = {
        live: structuredClone(this.live),
        stage: this.stage === null ? null : structuredClone(this.stage),
        checkpoints: new Map(
          [...this.checkpoints.entries()].map(([k, v]) => [k, structuredClone(v)]),
        ),
      };
      return { rows: [] };
    }
    if (sql === "COMMIT") {
      this.#snapshot = null;
      return { rows: [] };
    }
    if (sql === "ROLLBACK") {
      if (this.#snapshot) {
        this.live = this.#snapshot.live;
        this.stage = this.#snapshot.stage;
        this.checkpoints = this.#snapshot.checkpoints;
      }
      this.#snapshot = null;
      return { rows: [] };
    }
    if (sql.startsWith("DROP TABLE IF EXISTS price_paid_stage")) {
      this.stage = null;
      return { rows: [] };
    }
    if (sql.startsWith("CREATE TABLE IF NOT EXISTS price_paid_stage")) {
      if (this.stage === null) this.stage = [];
      return { rows: [] };
    }
    if (sql.startsWith("INSERT INTO loader_checkpoint")) {
      this.checkpoints.set(params[0] as string, {
        loader: params[0],
        edition: params[1],
        expected: params[2],
        next_start_index: params[3],
        read_count: params[4],
        filed_count: params[5],
        state: JSON.parse(params[6] as string),
      });
      return { rows: [] };
    }
    if (
      sql.startsWith("SELECT loader, edition, expected, next_start_index") &&
      sql.includes("FROM loader_checkpoint")
    ) {
      const row = this.checkpoints.get(params[0] as string);
      return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
    }
    if (sql.startsWith("DELETE FROM loader_checkpoint")) {
      const had = this.checkpoints.delete(params[0] as string);
      return { rows: [], rowCount: had ? 1 : 0 };
    }
    if (sql.startsWith("SELECT count(*)::int AS n, coalesce(sum(seq)")) {
      const rows = this.stage as Row[];
      return {
        rows: [
          {
            n: rows.length,
            s: rows.reduce((a, r) => a + (r.seq ?? 0), 0),
            m: rows.reduce((a, r) => Math.max(a, r.seq ?? 0), 0),
          },
        ] as Row[],
      };
    }
    if (sql.startsWith("DELETE FROM price_paid_stage WHERE seq >=")) {
      const before = (this.stage as Row[]).length;
      this.stage = (this.stage as Row[]).filter((r) => (r.seq ?? 0) < (params[0] as number));
      return { rows: [], rowCount: before - (this.stage as Row[]).length };
    }
    if (sql === "DELETE FROM price_paid_stage") {
      const n = (this.stage as Row[]).length;
      this.stage = [];
      return { rows: [], rowCount: n };
    }
    if (sql.startsWith("INSERT INTO price_paid_stage")) {
      // BUG-378: a kill between the merge's delete and its
      // inserts — the staged set is half-merged when the run
      // dies. The flag arms only once the merge's delete has
      // run, so the intake inserts are never caught by it.
      if (this.failOnMergeInsert && this.#mergeDeleteSeen)
        throw new Error("simulated kill mid-merge");
      const width = COLUMNS.length;
      for (let at = 0; at < params.length; at += width) {
        const row = valuesToRow(params.slice(at, at + width));
        row.seq = this.#seq += 1;
        (this.stage as Row[]).push(row);
      }
      return { rows: [] };
    }
    if (sql.startsWith("DELETE FROM price_paid_stage a USING")) {
      const stage = this.stage as Row[];
      const best = new Map<unknown, number>();
      for (const row of stage) {
        const seq = row.seq ?? 0;
        if (seq > (best.get(row.transaction_id) ?? -1)) best.set(row.transaction_id, seq);
      }
      const before = stage.length;
      this.stage = stage.filter((row) => (row.seq ?? 0) === best.get(row.transaction_id));
      return { rows: [], rowCount: before - this.stage.length };
    }
    if (sql.startsWith("DELETE FROM price_paid_stage WHERE transaction_id = ANY")) {
      this.#mergeDeleteSeen = true;
      const guids = new Set(params[0] as string[]);
      this.stage = (this.stage as Row[]).filter((r) => !guids.has(r.transaction_id as string));
      return { rows: [] };
    }
    if (sql.startsWith("SELECT max(sale_date)::text AS newest FROM price_paid_stage")) {
      const dates = (this.stage as Row[]).map((r) => r.sale_date as string).sort();
      return { rows: [{ newest: dates[dates.length - 1] ?? null }] as Row[] };
    }
    if (sql.includes("FROM price_paid_stage") && sql.includes("regexp_replace")) {
      const areas = new Set(params[0] as string[]);
      const n = (this.stage as Row[]).filter((r) =>
        areas.has(/^[A-Z]+/.exec((r.postcode as string).split(" ")[0])?.[0] ?? ""),
      ).length;
      return { rows: [{ n }] as Row[] };
    }
    if (
      sql.startsWith("SELECT count(*)::int AS n FROM price_paid_stage WHERE transaction_id = ANY")
    ) {
      const guids = new Set(params[0] as string[]);
      const n = (this.stage as Row[]).filter((r) => guids.has(r.transaction_id as string)).length;
      return { rows: [{ n }] as Row[] };
    }
    if (sql.startsWith("SELECT count(*)::int AS n FROM price_paid_stage")) {
      return { rows: [{ n: (this.stage as Row[]).length }] as Row[] };
    }
    if (sql.includes("FROM price_paid_stage WHERE postcode = $1")) {
      return { rows: this.#filedRows(this.stage as Row[], params[0] as string) };
    }
    if (sql === "TRUNCATE price_paid") {
      this.live = [];
      return { rows: [] };
    }
    if (sql.startsWith("INSERT INTO price_paid") && sql.includes("SELECT")) {
      if (this.failOnSwapInsert) throw new Error("armed failure on the swap insert");
      // The live table's unique transaction index (migration
      // 0003) speaks at the swap: a duplicate id surviving the
      // dedupe fails the insert and the transaction rolls back
      // (BUG-201 — the staging builds no index of its own).
      const ids = (this.stage as Row[]).map((r) => r.transaction_id).filter((id) => id !== null);
      if (new Set(ids).size !== ids.length)
        throw new Error("duplicate key value violates unique constraint");
      // The swap writes the pass's source name and edition from
      // its parameters — the staging never stored either.
      this.live = (this.stage as Row[]).map((row) => {
        const { seq, ...rest } = row;
        void seq; // the staging seq never files into the live register
        return { ...rest, source_name: params[0], source_date: params[1] };
      });
      return { rows: [], rowCount: this.live.length };
    }
    if (sql.startsWith("INSERT INTO price_paid")) {
      const width = COLUMNS.length;
      for (let at = 0; at < params.length; at += width) {
        this.live.push(valuesToRow(params.slice(at, at + width)));
      }
      return { rows: [] };
    }
    if (sql.startsWith("DELETE FROM price_paid WHERE transaction_id = ANY")) {
      const guids = new Set(params[0] as string[]);
      this.live = this.live.filter((r) => !guids.has(r.transaction_id as string));
      return { rows: [] };
    }
    if (sql.includes("FROM price_paid WHERE postcode = $1")) {
      return { rows: this.#filedRows(this.live, params[0] as string) };
    }
    if (sql.startsWith("SELECT postcode FROM postcode_cache")) {
      const last = params[0] as string;
      const limit = params[1] as number;
      const withSales = new Set(this.live.map((r) => r.postcode as string));
      const rows = [...this.cache.keys()]
        .sort()
        .filter((pc) => pc > last && !withSales.has(pc))
        .slice(0, limit)
        .map((postcode) => ({ postcode }) as Row);
      return { rows };
    }
    if (sql.startsWith("UPDATE postcode_cache")) {
      const stamp = JSON.parse(params[0] as string) as unknown;
      for (const postcode of params[1] as string[]) {
        const entry = this.cache.get(postcode);
        if (entry) entry.answers = { ...entry.answers, soldPricesLoad: stamp };
      }
      return { rows: [] };
    }
    if (sql.startsWith("SELECT max(source_date)::text AS edition FROM loader_run_items")) {
      const editions = this.items
        .filter((i) => i.item === "load-sold-prices" && i.status === "succeeded" && i.source_date)
        .map((i) => i.source_date as string)
        .sort();
      return { rows: [{ edition: editions[editions.length - 1] ?? null }] as Row[] };
    }
    if (sql.startsWith("INSERT INTO loader_runs")) {
      if (this.failStamp) throw new Error("armed stamp failure");
      const [id, kind, environment, trigger_source, status, started_at, finished_at, summary] =
        params;
      this.runs.push({
        id,
        kind,
        environment,
        trigger_source,
        status,
        started_at,
        finished_at,
        summary,
      });
      return { rows: [] };
    }
    if (sql.startsWith("INSERT INTO loader_run_items")) {
      const [
        run_id,
        item,
        mode,
        status,
        started_at,
        finished_at,
        duration_ms,
        source_name,
        source_date,
        log_line,
        error_message,
        exit_code,
      ] = params;
      this.items.push({
        run_id,
        item,
        mode,
        status,
        started_at,
        finished_at,
        duration_ms,
        source_name,
        source_date,
        log_line,
        error_message,
        exit_code,
      });
      return { rows: [] };
    }
    throw new Error(`FakeClient: unhandled SQL: ${sql}`);
  }

  #filedRows(rows: Row[], postcode: string): Row[] {
    return rows
      .filter((r) => r.postcode === postcode)
      .map((r) => ({
        transactionId: r.transaction_id,
        price: r.price,
        saleDate: r.sale_date,
        paon: r.paon,
        street: r.street,
      }));
  }
}

interface LineParts {
  transactionId: string;
  price: number;
  saleDate: string;
  postcode: string;
  propertyType?: string;
  newBuild?: boolean | null;
  tenure?: string;
  paon?: string;
  saon?: string;
  street?: string;
  locality?: string;
  town?: string;
  county?: string;
  ppdCategory?: string;
  recordStatus?: string;
}

// Serialises one Price Paid line in the Registry's field order
// (the district slot, which the loader never files, rides empty).
function ppdLine(p: LineParts): string {
  const fields = [
    `{${p.transactionId}}`,
    String(p.price),
    `${p.saleDate} 00:00`,
    p.postcode,
    p.propertyType ?? "D",
    p.newBuild === null || p.newBuild === undefined ? "" : p.newBuild ? "Y" : "N",
    p.tenure ?? "F",
    p.paon ?? "",
    p.saon ?? "",
    p.street ?? "",
    p.locality ?? "",
    p.town ?? "",
    "",
    p.county ?? "",
    p.ppdCategory ?? "A",
    p.recordStatus ?? "A",
  ];
  return fields.map((v) => `"${v}"`).join(",");
}

const EDITION = "2026-10-28";

async function nationalClient() {
  const client = new FakeClient();
  client.seedCache(["CM3 2JT", "CM3 2AA", "E16 1GN", "EH1 1AA", "BT1 1AA"]);
  const result = await runNational(client as never, {
    fullLines,
    updateLines,
    edition: EDITION,
  });
  return { client, result };
}

describe("parseModeArgs — named flags, never slots (gap 3)", () => {
  it("honours a mode flag in slot 0 — the legacy filter's dropped slot", () => {
    expect(parseModeArgs(["--national"]).mode).toBe("national");
    expect(parseModeArgs(["--update"]).mode).toBe("update");
  });

  it("never lets a --file value eat the flag after it", () => {
    const parsed = parseModeArgs(["--file", "tests/fixtures/land-registry", "--update"]);
    expect(parsed.mode).toBe("update");
    expect(parsed.fileDir).toBe("tests/fixtures/land-registry");
  });

  it("reads --edition and --verify-only by name in any position", () => {
    const parsed = parseModeArgs(["--verify-only", "--edition", "2026-11-25", "--update"]);
    expect(parsed).toMatchObject({ mode: "update", edition: "2026-11-25", verifyOnly: true });
  });

  it("refuses two modes and unknown flags", () => {
    expect(() => parseModeArgs(["--national", "--update"])).toThrow(/exactly one/);
    expect(() => parseModeArgs(["--bogus"])).toThrow(/unknown flag/);
  });

  it("collects positionals as rest (the modes themselves refuse them)", () => {
    expect(parseModeArgs(["--national", "CM3 2JT"]).rest).toEqual(["CM3 2JT"]);
    expect(parseModeArgs(["CM3 2JT"]).mode).toBeNull();
  });
});

describe("the edition gate (gap 5)", () => {
  it("applies with no baseline, and inside one monthly cycle", () => {
    expect(decideUpdateAction(null, EDITION).action).toBe("apply");
    expect(decideUpdateAction("2026-10-28", "2026-11-25").action).toBe("apply");
    expect(decideUpdateAction("2026-10-28", "2026-12-12").action).toBe("apply"); // exactly 45 days
  });

  it("stands down on the same edition and refuses older ones", () => {
    expect(decideUpdateAction("2026-11-25", "2026-11-25").action).toBe("noop");
    const older = decideUpdateAction("2026-11-25", "2026-10-28");
    expect(older.action).toBe("refuse");
    expect(older.reason).toMatch(/older than the last applied edition/);
  });

  it("refuses a missed month and names the --national remedy", () => {
    const gap = decideUpdateAction("2026-10-28", "2026-12-13");
    expect(gap.action).toBe("refuse");
    expect(gap.reason).toMatch(/a month has been missed/);
    expect(gap.reason).toMatch(/--national/);
  });
});

describe("coverage and the record reader (gaps 2 and 7)", () => {
  it("covers England and Wales postcodes only", () => {
    expect(isCoveredPostcode("CM3 2JT")).toBe(true);
    expect(isCoveredPostcode("CF10 1AA")).toBe(true);
    expect(isCoveredPostcode("EH1 1AA")).toBe(false);
    expect(isCoveredPostcode("G1 1AA")).toBe(false);
    expect(isCoveredPostcode("BT9 5AA")).toBe(false);
  });

  it("skips and counts empty-postcode rows instead of filing them", () => {
    const stats = { malformed: 0, emptyPostcode: 0 };
    const records = parseAllRecords(
      [
        ppdLine({ transactionId: "T-1", price: 100000, saleDate: "2026-01-01", postcode: "" }),
        ppdLine({
          transactionId: "T-2",
          price: 100000,
          saleDate: "2026-01-01",
          postcode: "CM3 2JT",
        }),
        "not a price paid line",
      ],
      stats,
    );
    expect(records.map((r) => r.transactionId)).toEqual(["T-2"]);
    expect(stats.emptyPostcode).toBe(1);
    expect(stats.malformed).toBe(1);
  });

  it("skips and counts uncovered-area rows per area (BUG-184)", () => {
    const stats = { malformed: 0, emptyPostcode: 0, uncovered: {} as Record<string, number> };
    const records = parseAllRecords(
      [
        ppdLine({
          transactionId: "T-1",
          price: 100000,
          saleDate: "2026-01-01",
          postcode: "TD15 2AB",
        }),
        ppdLine({
          transactionId: "T-2",
          price: 100000,
          saleDate: "2026-01-01",
          postcode: "TD9 1AA",
        }),
        ppdLine({
          transactionId: "T-3",
          price: 100000,
          saleDate: "2026-01-01",
          postcode: "DG1 2AA",
        }),
        ppdLine({
          transactionId: "T-4",
          price: 100000,
          saleDate: "2026-01-01",
          postcode: "CM3 2JT",
        }),
      ],
      stats,
    );
    expect(records.map((r) => r.transactionId)).toEqual(["T-4"]);
    expect(stats.uncovered).toEqual({ DG: 1, TD: 2 });
  });
});

describe("runNational — the whole register in one pass", () => {
  it("files the merged register: both categories, the update applied, one edition throughout", async () => {
    const { client, result } = await nationalClient();
    expect(result.total).toBe(39);
    expect(result.updateRows).toBe(2);
    expect(client.live).toHaveLength(39);
    const cm = client.live.filter((r) => r.postcode === "CM3 2JT");
    const e16 = client.live.filter((r) => r.postcode === "E16 1GN");
    expect(cm).toHaveLength(30);
    expect(e16).toHaveLength(9);
    // Category-B rows are filed, not filtered: the fixture's
    // only two are Nos. 32 and 39 — the update deletes No. 39
    // and amends No. 32 within its category, leaving exactly
    // the one. A serving-style category filter would leave none.
    const bRows = client.live.filter((r) => r.ppd_category === "B");
    expect(bRows).toHaveLength(1);
    expect(bRows[0].paon).toBe("32");
    // The update merge landed: No. 32 amended, No. 39 deleted.
    expect(cm.find((r) => r.paon === "32")?.price).toBe(651440);
    expect(cm.find((r) => r.paon === "39")).toBeUndefined();
    // One edition stamps the whole pass, the merged rows included.
    expect(new Set(client.live.map((r) => r.source_date))).toEqual(new Set([EDITION]));
    expect(result.logLine).toContain(
      `load-sold-prices · edition ${EDITION} · national pass · 39 sales filed`,
    );
  });

  it("emits progress lines through the pass and the summary line is unchanged (BUG-204)", async () => {
    const client = new FakeClient();
    client.seedCache(["CM3 2JT", "CM3 2AA", "E16 1GN", "EH1 1AA", "BT1 1AA"]);
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-sold-prices",
      log: (line: string) => lines.push(line),
    });
    const result = await runNational(client as never, {
      fullLines,
      updateLines,
      edition: EDITION,
      progress,
    });
    // The fixture is small, so the intake count (every 2M
    // lines) never fires — but the stage markers and the
    // stamp's closing line do, in order.
    expect(
      lines.some((l) => /progress · intake complete — \d+ lines read, \d+ records staged/.test(l)),
    ).toBe(true);
    expect(lines.some((l) => /progress · update merged — \d+ upserted, \d+ deleted/.test(l))).toBe(
      true,
    );
    expect(
      lines.some((l) =>
        /progress · swap started — filing 39 staged rows into the live register/.test(l),
      ),
    ).toBe(true);
    expect(lines.some((l) => /progress · stamping 1 no-sale postcodes$/.test(l))).toBe(true);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
    // The filed outcome and the summary line are exactly
    // as the pass without a logger produces them.
    expect(result.total).toBe(39);
    expect(result.stamped).toBe(1);
    expect(result.logLine).toContain(
      `load-sold-prices · edition ${EDITION} · national pass · 39 sales filed`,
    );
  });

  it("bulk-stamps covered no-sale postcodes and leaves the rest alone (gap 2)", async () => {
    const { client, result } = await nationalClient();
    expect(result.stamped).toBe(1);
    const stamp = client.cache.get("CM3 2AA")?.answers.soldPricesLoad as { edition: string };
    expect(stamp.edition).toBe(EDITION);
    expect(client.cache.get("CM3 2JT")?.answers.soldPricesLoad).toBeUndefined();
    expect(client.cache.get("EH1 1AA")?.answers.soldPricesLoad).toBeUndefined();
    expect(client.cache.get("BT1 1AA")?.answers.soldPricesLoad).toBeUndefined();
  });

  it("collapses a duplicated transaction id to the last row filed", async () => {
    const client = new FakeClient();
    const result = await runNational(client as never, {
      fullLines: [...fullLines, fullLines.find((l) => l.includes("CM3 2JT")) as string],
      updateLines,
      edition: EDITION,
    });
    expect(result.stats.duplicates).toBe(1);
    expect(result.total).toBe(39);
    expect(client.live).toHaveLength(39);
  });

  it("files the three BUG-188 sales verbatim through the national path", async () => {
    // The exact source lines (pp-complete.csv, edition
    // 2026-10-28) the first national pass lost: TR8 4LX's whole
    // 1995 presence at Atlantic Reach, Newquay. The file's own
    // GUID-to-sale pairing governs.
    const lost = [
      '"{6CA09ECE-6846-462D-810E-8EAC6D723DC7}","14000","1995-07-28 00:00","TR8 4LX","T","N","L","MANOR VILLAS","115","ATLANTIC REACH","NEWQUAY","NEWQUAY","RESTORMEL","CORNWALL","A","A"',
      '"{3A73C0E3-33E1-43B3-8A20-3DACB09A244D}","65000","1995-09-22 00:00","TR8 4LX","T","N","F","COACHMANS COTTAGE","","","NEWQUAY","NEWQUAY","RESTORMEL","CORNWALL","A","A"',
      '"{93C07D1B-0EFB-4A6F-BCA5-12B65FB9F9D2}","50000","1995-10-30 00:00","TR8 4LX","T","Y","F","OLD STABLES","","","NEWQUAY","NEWQUAY","RESTORMEL","CORNWALL","A","A"',
    ];
    const client = new FakeClient();
    const result = await runNational(client as never, {
      fullLines: [...fullLines, ...lost],
      updateLines,
      edition: EDITION,
    });
    expect(result.total).toBe(42);
    const tr8 = client.live.filter((r) => r.postcode === "TR8 4LX");
    expect(tr8).toHaveLength(3);
    const byId = new Map(tr8.map((r) => [r.transaction_id, r]));
    expect(byId.get("6CA09ECE-6846-462D-810E-8EAC6D723DC7")).toMatchObject({
      price: 14000,
      sale_date: "1995-07-28",
    });
    expect(byId.get("3A73C0E3-33E1-43B3-8A20-3DACB09A244D")).toMatchObject({
      price: 65000,
      sale_date: "1995-09-22",
    });
    expect(byId.get("93C07D1B-0EFB-4A6F-BCA5-12B65FB9F9D2")).toMatchObject({
      price: 50000,
      sale_date: "1995-10-30",
    });
  });

  it("refuses a full file that under-delivers against its declared size, and files nothing (BUG-188)", async () => {
    // The class test for the BUG-188 drop: the source declares
    // more bytes than the line stream delivers — the shape of
    // the live failure, in which a short stream quietly became
    // the register. The pass must refuse and leave the standing
    // register untouched.
    const delivered = fullLines.filter((l) => l);
    const lfBytes = delivered.reduce((n, l) => n + Buffer.byteLength(l) + 1, 0);
    const client = new FakeClient();
    client.live = [{ transaction_id: "STANDING-ROW", postcode: "CM3 2JT" } as Row];
    await expect(
      runNational(client as never, {
        fullLines,
        updateLines,
        edition: EDITION,
        expectedFullBytes: lfBytes + 500_000,
      }),
    ).rejects.toThrow(/under-delivered/);
    expect(client.live).toEqual([{ transaction_id: "STANDING-ROW", postcode: "CM3 2JT" }]);
  });

  it("accepts a declared size that honestly accounts for the lines read, LF or CRLF (BUG-188)", async () => {
    const delivered = fullLines.filter((l) => l);
    const lineBytes = delivered.reduce((n, l) => n + Buffer.byteLength(l), 0);
    for (const expectedFullBytes of [
      lineBytes + delivered.length, // LF, final newline present
      lineBytes + delivered.length - 1, // LF, no final newline
      lineBytes + 2 * delivered.length, // CRLF, final newline present
      lineBytes + 2 * delivered.length - 2, // CRLF, no final newline
    ]) {
      const client = new FakeClient();
      const result = await runNational(client as never, {
        fullLines,
        updateLines,
        edition: EDITION,
        expectedFullBytes,
      });
      expect(result.total).toBe(39);
      expect(result.linesRead).toBe(delivered.length);
      expect(result.logLine).toContain(`${delivered.length} full-file lines read`);
    }
  });

  it("skips and counts an empty-postcode row without losing a sale", async () => {
    const client = new FakeClient();
    const ghost = ppdLine({
      transactionId: "AAAAAAAA-0000-4000-8000-000000000001",
      price: 123456,
      saleDate: "2026-01-05",
      postcode: "",
      paon: "1",
      street: "NOWHERE",
    });
    const result = await runNational(client as never, {
      fullLines: [...fullLines, ghost],
      updateLines,
      edition: EDITION,
    });
    expect(result.stats.emptyPostcode).toBe(1);
    expect(result.total).toBe(39);
  });

  it("skips and counts a Scotland row at intake and files none of it (BUG-184)", async () => {
    const client = new FakeClient();
    const scot = ppdLine({
      transactionId: "AAAAAAAA-0000-4000-8000-000000000002",
      price: 123456,
      saleDate: "2026-01-05",
      postcode: "EH1 1AA",
      paon: "1",
      street: "ROYAL MILE",
    });
    const result = await runNational(client as never, {
      fullLines: [...fullLines, scot],
      updateLines,
      edition: EDITION,
    });
    expect(result.stats.uncovered).toEqual({ EH: 1 });
    expect(result.total).toBe(39);
    expect(client.live).toHaveLength(39);
    expect(client.live.filter((r) => r.postcode === "EH1 1AA")).toHaveLength(0);
    expect(result.logLine).toContain("1 uncovered-area rows skipped (EH 1)");
  });

  it("skips TD rows from BOTH source files, reports per-area counts, and files zero uncovered rows (BUG-184)", async () => {
    const client = new FakeClient();
    const tdFull = ppdLine({
      transactionId: "AAAAAAAA-0000-4000-8000-000000000003",
      price: 200000,
      saleDate: "2026-01-05",
      postcode: "TD15 2AB",
      paon: "1",
      street: "CASTLEGATE",
    });
    const tdUpdate = ppdLine({
      transactionId: "AAAAAAAA-0000-4000-8000-000000000004",
      price: 210000,
      saleDate: "2026-10-02",
      postcode: "TD9 1AA",
      paon: "2",
      street: "HIGH STREET",
    });
    const dgUpdate = ppdLine({
      transactionId: "AAAAAAAA-0000-4000-8000-000000000005",
      price: 180000,
      saleDate: "2026-10-03",
      postcode: "DG1 1AA",
      paon: "3",
      street: "BUCCLEUCH STREET",
    });
    const result = await runNational(client as never, {
      fullLines: [...fullLines, tdFull],
      updateLines: [...updateLines, tdUpdate, dgUpdate],
      edition: EDITION,
    });
    expect(result.stats.uncovered).toEqual({ DG: 1, TD: 2 });
    // The skipped update rows are not counted as merged.
    expect(result.updateRows).toBe(2);
    expect(result.total).toBe(39);
    expect(result.logLine).toContain("3 uncovered-area rows skipped (DG 1 · TD 2)");
    // The zero-filed proof, in the guard's own area extraction:
    // no live row sits in an uncovered area.
    const uncoveredAreas = new Set([
      "AB",
      "DD",
      "DG",
      "EH",
      "FK",
      "G",
      "HS",
      "IV",
      "KA",
      "KY",
      "ML",
      "PA",
      "PH",
      "TD",
      "ZE",
      "BT",
    ]);
    const filedUncovered = client.live.filter((r) =>
      uncoveredAreas.has(/^[A-Z]+/.exec((r.postcode as string).split(" ")[0])?.[0] ?? ""),
    );
    expect(filedUncovered).toHaveLength(0);
  });

  it("leaves the live register untouched when the swap itself fails", async () => {
    const client = new FakeClient();
    const sentinel = [{ transaction_id: "SENTINEL", postcode: "CM3 2JT" } as Row];
    client.live = structuredClone(sentinel);
    client.failOnSwapInsert = true;
    // BUG-248: the swap reports itself before the error
    // propagates — one failure line, first error line only.
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-sold-prices",
      log: (line: string) => lines.push(line),
    });
    await expect(
      runNational(client as never, { fullLines, updateLines, edition: EDITION, progress }),
    ).rejects.toThrow(/armed failure/);
    expect(
      lines.some((l) =>
        /^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d\d\dZ load-sold-prices failed · swap · filed 0 of \d+ · armed failure on the swap insert · resume from re-run the national pass from the start \(the swap rolled back, the live register is untouched\)$/.test(
          l,
        ),
      ),
    ).toBe(true);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
    expect(client.live).toEqual(sentinel);
  });

  it("verify-only proves the pass and files nothing", async () => {
    const client = new FakeClient();
    client.live = [{ transaction_id: "SENTINEL" } as Row];
    client.seedCache(["CM3 2AA"]);
    const result = await runNational(client as never, {
      fullLines,
      updateLines,
      edition: EDITION,
      verifyOnly: true,
    });
    expect(result.total).toBe(39);
    expect(result.stamped).toBe(0);
    expect(client.live).toEqual([{ transaction_id: "SENTINEL" }]);
    expect(client.cache.get("CM3 2AA")?.answers.soldPricesLoad).toBeUndefined();
  });
});

describe("BUG-201 — the slim staging: no indexes, no edition rewrite, constants land at the swap", () => {
  it("builds no index on the staging table and never rewrites it to stamp the edition", async () => {
    const { client } = await nationalClient();
    const sql = client.statements.map((s) => s.sql);
    expect(sql.some((s) => /^CREATE (UNIQUE )?INDEX/.test(s))).toBe(false);
    expect(sql.some((s) => s.startsWith("UPDATE price_paid_stage"))).toBe(false);
  });

  it("stages rows with the pass-wide constants absent, and writes them from the swap's parameters", async () => {
    const { client } = await nationalClient();
    const stageInserts = client.statements.filter((s) =>
      s.sql.startsWith("INSERT INTO price_paid_stage"),
    );
    expect(stageInserts.length).toBeGreaterThan(0);
    for (const { params } of stageInserts) {
      for (let at = 0; at < params.length; at += COLUMNS.length) {
        expect(params[at + 15]).toBeNull(); // source_name
        expect(params[at + 16]).toBeNull(); // source_date
      }
    }
    const swap = client.statements.find(
      (s) => s.sql.startsWith("INSERT INTO price_paid") && s.sql.includes("SELECT"),
    );
    expect(swap?.params).toEqual([
      "HM Land Registry Price Paid (full file + monthly update)",
      EDITION,
    ]);
    // The filed rows carry the constants exactly as the old
    // stamp-then-copy wrote them.
    expect(new Set(client.live.map((r) => r.source_name))).toEqual(
      new Set(["HM Land Registry Price Paid (full file + monthly update)"]),
    );
    expect(new Set(client.live.map((r) => r.source_date))).toEqual(new Set([EDITION]));
  });
});

describe("nationalFileSources — the --file branch streams its local copy (BUG-200)", () => {
  it("files the register end to end from a local directory, guarded by the file's on-disk size", async () => {
    const sources = await nationalFileSources(fixtureDir);
    // The guard's declared size is the complete file's true
    // on-disk size, taken from stat — not a held copy's length.
    expect(sources.expectedFullBytes).toBe(statSync(join(fixtureDir, "pp-complete.csv")).size);
    const client = new FakeClient();
    client.seedCache(["CM3 2JT", "CM3 2AA", "E16 1GN", "EH1 1AA", "BT1 1AA"]);
    const result = await runNational(client as never, {
      fullLines: sources.fullLines,
      updateLines: sources.updateLines,
      edition: EDITION,
      expectedFullBytes: sources.expectedFullBytes,
    });
    expect(result.total).toBe(39);
    expect(client.live).toHaveLength(39);
    const delivered = fullLines.filter((l) => l);
    expect(result.linesRead).toBe(delivered.length);
    expect(result.logLine).toContain(
      `load-sold-prices · edition ${EDITION} · national pass · 39 sales filed`,
    );
    expect(result.logLine).toContain(`${delivered.length} full-file lines read`);
  });

  it("refuses a truncated local copy and leaves the standing register untouched", async () => {
    // A truncated copy of the complete file, cut mid-line —
    // the shape the live stream twice delivered. Judged
    // against the complete file's on-disk size (the size its
    // source declares), the delivered lines under-account and
    // the guard refuses before anything is filed. Judged
    // against the copy's own stat the cut would be invisible
    // to byte accounting: a mid-line cut is indistinguishable
    // from a complete file whose last line simply carries no
    // terminator — the tolerance the guard's honest sizes
    // spell out — so the declared size here is the complete
    // file's, exactly as the live branch takes the download's
    // Content-Length rather than the delivered body's length.
    const dir = mkdtempSync(join(tmpdir(), "cmnh-pp-truncated-"));
    try {
      const complete = readFileSync(join(fixtureDir, "pp-complete.csv"));
      writeFileSync(
        join(dir, "pp-complete.csv"),
        complete.subarray(0, Math.floor(complete.length / 2)),
      );
      writeFileSync(
        join(dir, "pp-monthly-update.csv"),
        readFileSync(join(fixtureDir, "pp-monthly-update.csv")),
      );
      const sources = await nationalFileSources(dir);
      const client = new FakeClient();
      client.live = [{ transaction_id: "STANDING-ROW", postcode: "CM3 2JT" } as Row];
      await expect(
        runNational(client as never, {
          fullLines: sources.fullLines,
          updateLines: sources.updateLines,
          edition: EDITION,
          expectedFullBytes: complete.length,
        }),
      ).rejects.toThrow(/under-delivered/);
      expect(client.live).toEqual([{ transaction_id: "STANDING-ROW", postcode: "CM3 2JT" }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("runUpdate — one monthly file, edition-gated", () => {
  async function seededClient() {
    const { client } = await nationalClient();
    await writeRunStamp(client as never, {
      mode: "national",
      status: "succeeded",
      startedAt: new Date(),
      sourceDate: EDITION,
      logLine: "national pass",
      errorMessage: null,
    });
    return client;
  }

  function craftedUpdate(client: FakeClient) {
    const no32 = client.live.find((r) => r.postcode === "CM3 2JT" && r.paon === "32") as Row;
    const e16Row = client.live.find((r) => r.postcode === "E16 1GN") as Row;
    return [
      ppdLine({
        transactionId: "AAAAAAAA-0000-4000-8000-000000000010",
        price: 500000,
        saleDate: "2026-11-03",
        postcode: "CM3 2JT",
        paon: "99",
        street: "BIRKDALE RISE",
      }),
      ppdLine({
        transactionId: no32.transaction_id as string,
        price: 651441,
        saleDate: no32.sale_date as string,
        postcode: "CM3 2JT",
        paon: "32",
        street: "BIRKDALE RISE",
        recordStatus: "C",
      }),
      ppdLine({
        transactionId: e16Row.transaction_id as string,
        price: e16Row.price as number,
        saleDate: e16Row.sale_date as string,
        postcode: "E16 1GN",
        recordStatus: "D",
      }),
    ];
  }

  it("applies A, C and D by transaction id, stamping the update's own edition", async () => {
    const client = await seededClient();
    const result = await runUpdate(client as never, {
      updateLines: craftedUpdate(client),
      edition: "2026-11-25",
    });
    expect(result.applied).toBe(2);
    expect(result.deleted).toBe(1);
    expect(client.live).toHaveLength(39);
    const added = client.live.find((r) => r.paon === "99");
    expect(added?.price).toBe(500000);
    expect(added?.source_date).toBe("2026-11-25");
    const amended = client.live.find((r) => r.postcode === "CM3 2JT" && r.paon === "32");
    expect(amended?.price).toBe(651441);
    expect(amended?.source_date).toBe("2026-11-25");
    expect(client.live.filter((r) => r.postcode === "E16 1GN")).toHaveLength(8);
  });

  it("skips and counts uncovered-area rows instead of filing them (BUG-184)", async () => {
    const client = await seededClient();
    const lines = [
      ...craftedUpdate(client),
      ppdLine({
        transactionId: "AAAAAAAA-0000-4000-8000-000000000012",
        price: 300000,
        saleDate: "2026-11-04",
        postcode: "TD15 2AB",
        paon: "1",
        street: "CASTLEGATE",
      }),
      ppdLine({
        transactionId: "AAAAAAAA-0000-4000-8000-000000000013",
        price: 190000,
        saleDate: "2026-11-04",
        postcode: "DG1 1AA",
        paon: "3",
        street: "BUCCLEUCH STREET",
      }),
    ];
    const result = await runUpdate(client as never, {
      updateLines: lines,
      edition: "2026-11-25",
    });
    // The covered rows land exactly as without the TD/DG rows…
    expect(result.applied).toBe(2);
    expect(result.deleted).toBe(1);
    expect(client.live).toHaveLength(39);
    // …and the uncovered rows are counted, never filed.
    expect(result.stats.uncovered).toEqual({ DG: 1, TD: 1 });
    expect(
      client.live.filter((r) => r.postcode === "TD15 2AB" || r.postcode === "DG1 1AA"),
    ).toHaveLength(0);
    expect(result.logLine).toContain("2 uncovered-area rows skipped (DG 1 · TD 1)");
  });

  it("lands a category change (D of the old id, A under a new one) as one row in the new category", async () => {
    const client = await seededClient();
    const victim = client.live.find(
      (r) => r.postcode === "CM3 2JT" && r.ppd_category === "A",
    ) as Row;
    const lines = [
      ppdLine({
        transactionId: victim.transaction_id as string,
        price: victim.price as number,
        saleDate: victim.sale_date as string,
        postcode: "CM3 2JT",
        recordStatus: "D",
      }),
      ppdLine({
        transactionId: "AAAAAAAA-0000-4000-8000-000000000011",
        price: victim.price as number,
        saleDate: victim.sale_date as string,
        postcode: "CM3 2JT",
        paon: victim.paon as string,
        street: victim.street as string,
        ppdCategory: "B",
        recordStatus: "A",
      }),
    ];
    const totalBefore = client.live.length;
    await runUpdate(client as never, { updateLines: lines, edition: "2026-11-25" });
    expect(client.live.find((r) => r.transaction_id === victim.transaction_id)).toBeUndefined();
    // The sale itself lands exactly once, under the new id, in
    // the new category (the house's OTHER sales, under their
    // own ids, are untouched — the register keys on ids).
    const moved = client.live.filter(
      (r) => r.transaction_id === "AAAAAAAA-0000-4000-8000-000000000011",
    );
    expect(moved).toHaveLength(1);
    expect(moved[0].ppd_category).toBe("B");
    expect(moved[0].paon).toBe(victim.paon);
    expect(client.live).toHaveLength(totalBefore);
  });

  it("is a no-op success when the edition is already applied", async () => {
    const client = await seededClient();
    const lines = craftedUpdate(client);
    await runUpdate(client as never, { updateLines: lines, edition: "2026-11-25" });
    await writeRunStamp(client as never, {
      mode: "update",
      status: "succeeded",
      startedAt: new Date(),
      sourceDate: "2026-11-25",
      logLine: "applied",
      errorMessage: null,
    });
    const before = structuredClone(client.live);
    const again = await runUpdate(client as never, { updateLines: lines, edition: "2026-11-25" });
    expect(again.noop).toBe(true);
    expect(client.live).toEqual(before);
  });

  it("refuses a missed month and files nothing", async () => {
    const client = await seededClient();
    const before = structuredClone(client.live);
    await expect(
      runUpdate(client as never, { updateLines: craftedUpdate(client), edition: "2026-12-24" }),
    ).rejects.toThrow(/a month has been missed/);
    expect(client.live).toEqual(before);
  });

  it("refuses an edition older than the last applied one", async () => {
    const client = await seededClient();
    await writeRunStamp(client as never, {
      mode: "update",
      status: "succeeded",
      startedAt: new Date(),
      sourceDate: "2026-11-25",
      logLine: "applied",
      errorMessage: null,
    });
    await expect(
      runUpdate(client as never, { updateLines: craftedUpdate(client), edition: EDITION }),
    ).rejects.toThrow(/older than the last applied edition/);
  });

  it("applies when no earlier edition is recorded", async () => {
    const client = new FakeClient();
    client.live = [
      valuesToRow([
        "AAAAAAAA-0000-4000-8000-000000000020",
        "CM3 2JT",
        400000,
        "2025-05-01",
        "D",
        false,
        "F",
        "30",
        null,
        "BIRKDALE RISE",
        null,
        "CHELMSFORD",
        "ESSEX",
        "A",
        "A",
        "HM Land Registry Price Paid (full file + monthly update)",
        "2025-06-01",
      ]),
    ];
    const result = await runUpdate(client as never, {
      updateLines: [
        ppdLine({
          transactionId: "AAAAAAAA-0000-4000-8000-000000000020",
          price: 400001,
          saleDate: "2025-05-01",
          postcode: "CM3 2JT",
          paon: "30",
          street: "BIRKDALE RISE",
          recordStatus: "C",
        }),
      ],
      edition: "2026-11-25",
    });
    expect(result.applied).toBe(1);
    expect(client.live[0].price).toBe(400001);
  });
});

describe("writeRunStamp — the outcome is recorded either way (gap 4)", () => {
  it("writes the runner-shaped rows on success", async () => {
    const client = new FakeClient();
    const ok = await writeRunStamp(client as never, {
      mode: "update",
      status: "succeeded",
      startedAt: new Date(),
      sourceDate: "2026-11-25",
      logLine: "load-sold-prices · edition 2026-11-25 · monthly update",
      errorMessage: null,
    });
    expect(ok).toBe(true);
    expect(client.runs).toHaveLength(1);
    expect(client.runs[0]).toMatchObject({
      kind: "load",
      trigger_source: "sold-prices-update",
      status: "succeeded",
    });
    expect(client.items).toHaveLength(1);
    expect(client.items[0]).toMatchObject({
      item: "load-sold-prices",
      mode: "update",
      status: "succeeded",
      source_date: "2026-11-25",
      exit_code: 0,
      error_message: null,
    });
  });

  it("writes the failure with its error and a non-zero exit code", async () => {
    const client = new FakeClient();
    await writeRunStamp(client as never, {
      mode: "update",
      status: "failed",
      startedAt: new Date(),
      sourceDate: "2026-12-24",
      logLine: null,
      errorMessage: "a month has been missed",
    });
    expect(client.items[0]).toMatchObject({
      status: "failed",
      exit_code: 1,
      error_message: "a month has been missed",
    });
    expect(client.runs[0].status).toBe("failed");
    expect(client.runs[0].summary).toBe("a month has been missed");
  });

  it("never throws when the stamp itself cannot be written", async () => {
    const client = new FakeClient();
    client.failStamp = true;
    const ok = await writeRunStamp(client as never, {
      mode: "national",
      status: "succeeded",
      startedAt: new Date(),
      sourceDate: EDITION,
      logLine: "national pass",
      errorMessage: null,
    });
    expect(ok).toBe(false);
  });
});

describe("runNational resume (BUG-368)", () => {
  // The fixture repeated 150 times: 6,000 lines, six
  // 1,000-row staging flushes — big enough for a kill to land
  // between flushes, small enough to run in milliseconds. The
  // repeated transaction ids collapse in the dedupe exactly as
  // one copy would, so the filed register is the fixture's own.
  const repeatedLines = Array.from({ length: 150 }, () => fullLines).flat();
  const liveKey = (rows: Row[]) =>
    rows.map((r) => `${r.transaction_id}|${r.postcode}|${r.price}|${r.sale_date}|${r.paon}`).sort();

  async function* killLines(lines: string[], killAfter: number) {
    let counted = 0;
    for (const line of lines) {
      if (line) {
        counted += 1;
        if (counted > killAfter) throw new Error("simulated kill mid-intake");
      }
      yield line;
    }
  }

  it("a kill mid-intake resumes from the checkpoint and files the same register", async () => {
    const client = new FakeClient();
    client.seedCache(["CM3 2JT", "CM3 2AA", "E16 1GN", "EH1 1AA", "BT1 1AA"]);
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-sold-prices",
      log: (line: string) => lines.push(line),
    });

    // Run one: dies after 2,500 lines — two 1,000-row flushes
    // committed with their checkpoints, the third flush's 500
    // rows still in memory.
    await expect(
      runNational(client as never, {
        fullLines: killLines(repeatedLines, 2_500),
        updateLines,
        edition: EDITION,
        progress,
        resumeEdition: EDITION,
      }),
    ).rejects.toThrow(/simulated kill mid-intake/);
    expect(client.checkpoints.get("load-sold-prices")?.filed_count).toBe(2_000);
    expect(client.checkpoints.get("load-sold-prices")?.next_start_index).toBe(2_000);
    expect(client.stage).toHaveLength(2_000);
    expect(
      lines.some((l) => /checkpoint 2,000 lines · staged 2,000 · resume from 2,000/.test(l)),
    ).toBe(true);

    // Run two: the same edition resumes, skips the 2,000 staged
    // lines, and files the register.
    const resumed = await runNational(client as never, {
      fullLines: repeatedLines,
      updateLines,
      edition: EDITION,
      progress,
      resumeEdition: EDITION,
    });
    expect(resumed.linesRead).toBe(6_000);
    expect(
      lines.some((l) =>
        /resuming from checkpoint · 2,000 rows staged · edition 2026-10-28/.test(l),
      ),
    ).toBe(true);

    // The control: the same input in one uninterrupted run.
    const control = new FakeClient();
    control.seedCache(["CM3 2JT", "CM3 2AA", "E16 1GN", "EH1 1AA", "BT1 1AA"]);
    const controlResult = await runNational(control as never, {
      fullLines: repeatedLines,
      updateLines,
      edition: EDITION,
    });
    expect(resumed.total).toBe(controlResult.total);
    expect(liveKey(client.live)).toEqual(liveKey(control.live));
    // The successful swap clears staging + checkpoint: nothing
    // is left behind for the next pass.
    expect(client.checkpoints.get("load-sold-prices")).toBeUndefined();
    expect(client.stage).toHaveLength(0);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });

  it("--restart discards a valid checkpoint and files from the start", async () => {
    const client = new FakeClient();
    client.seedCache(["CM3 2JT", "CM3 2AA", "E16 1GN", "EH1 1AA", "BT1 1AA"]);
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-sold-prices",
      log: (line: string) => lines.push(line),
    });
    await expect(
      runNational(client as never, {
        fullLines: killLines(repeatedLines, 2_500),
        updateLines,
        edition: EDITION,
        progress,
        resumeEdition: EDITION,
      }),
    ).rejects.toThrow(/simulated kill mid-intake/);
    expect(client.checkpoints.get("load-sold-prices")?.filed_count).toBe(2_000);

    const result = await runNational(client as never, {
      fullLines: repeatedLines,
      updateLines,
      edition: EDITION,
      progress,
      resumeEdition: EDITION,
      restart: true,
    });
    expect(lines.some((l) => /restart requested — discarding checkpoint and staging/.test(l))).toBe(
      true,
    );
    expect(lines.some((l) => /resuming from checkpoint/.test(l))).toBe(false);
    expect(result.total).toBe(39);
    expect(client.checkpoints.get("load-sold-prices")).toBeUndefined();
  });

  it("an edition change discards the checkpoint and files from the start", async () => {
    const client = new FakeClient();
    client.seedCache(["CM3 2JT", "CM3 2AA", "E16 1GN", "EH1 1AA", "BT1 1AA"]);
    await expect(
      runNational(client as never, {
        fullLines: killLines(repeatedLines, 2_500),
        updateLines,
        edition: EDITION,
        resumeEdition: EDITION,
      }),
    ).rejects.toThrow(/simulated kill mid-intake/);
    const result = await runNational(client as never, {
      fullLines: repeatedLines,
      updateLines,
      edition: "2026-11-25",
      resumeEdition: "2026-11-25",
    });
    expect(result.total).toBe(39);
    expect(result.linesRead).toBe(6_000);
    expect(client.checkpoints.get("load-sold-prices")).toBeUndefined();
  });

  it("parses --restart", () => {
    expect(parseModeArgs(["--national", "--restart"]).restart).toBe(true);
    expect(parseModeArgs(["--national"]).restart).toBe(false);
  });
});

describe("runNational resume from deduped/merged (BUG-378)", () => {
  // The fixture repeated 150 times: 6,000 lines collapsing to
  // 40 distinct ids in the dedupe (5,960 duplicates), and the
  // update file's two guids both match staged rows
  // (updateMatched 2, upserted 1, merged total 39) — so both
  // biting cases are live in this fixture: a resume from
  // "merged" with duplicates > 0, and a resume from "deduped"
  // after a partial merge.
  const repeatedLines = Array.from({ length: 150 }, () => fullLines).flat();
  const liveKey = (rows: Row[]) =>
    rows.map((r) => `${r.transaction_id}|${r.postcode}|${r.price}|${r.sale_date}|${r.paon}`).sort();

  it("a kill at the swap resumes from the merged checkpoint and files the same register", async () => {
    const client = new FakeClient();
    client.seedCache(["CM3 2JT", "CM3 2AA", "E16 1GN", "EH1 1AA", "BT1 1AA"]);
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-sold-prices",
      log: (line: string) => lines.push(line),
    });

    // Run one: intake, dedupe and merge all complete — the
    // merged checkpoint stands — then the swap insert fails.
    client.failOnSwapInsert = true;
    await expect(
      runNational(client as never, {
        fullLines: repeatedLines,
        updateLines,
        edition: EDITION,
        progress,
        resumeEdition: EDITION,
      }),
    ).rejects.toThrow(/armed failure on the swap insert/);
    expect(client.checkpoints.get("load-sold-prices")?.state).toMatchObject({ phase: "merged" });
    expect(client.stage).toHaveLength(39);

    // Run two: the same edition resumes past the merge and
    // files the register.
    client.failOnSwapInsert = false;
    const resumed = await runNational(client as never, {
      fullLines: repeatedLines,
      updateLines,
      edition: EDITION,
      progress,
      resumeEdition: EDITION,
    });
    expect(resumed.total).toBe(39);
    expect(
      lines.some((l) => /resuming from checkpoint · 39 rows staged · edition 2026-10-28/.test(l)),
    ).toBe(true);

    // The control: the same input in one uninterrupted run.
    const control = new FakeClient();
    control.seedCache(["CM3 2JT", "CM3 2AA", "E16 1GN", "EH1 1AA", "BT1 1AA"]);
    const controlResult = await runNational(control as never, {
      fullLines: repeatedLines,
      updateLines,
      edition: EDITION,
    });
    expect(resumed.total).toBe(controlResult.total);
    expect(liveKey(client.live)).toEqual(liveKey(control.live));
    // The successful swap clears staging + checkpoint: nothing
    // is left behind for the next pass.
    expect(client.checkpoints.get("load-sold-prices")).toBeUndefined();
    expect(client.stage).toHaveLength(0);
  });

  it("a kill mid-merge resumes from the deduped checkpoint and files the same register", async () => {
    const client = new FakeClient();
    client.seedCache(["CM3 2JT", "CM3 2AA", "E16 1GN", "EH1 1AA", "BT1 1AA"]);
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-sold-prices",
      log: (line: string) => lines.push(line),
    });

    // Run one: the merge's delete lands, its first insert dies —
    // the merge is atomic with its checkpoint, so the kill rolls
    // the stage back to the intact deduped set (40 rows) and the
    // deduped checkpoint stands. (Before the fix the delete
    // persisted and the stage was left half-merged at 38 rows.)
    client.failOnMergeInsert = true;
    await expect(
      runNational(client as never, {
        fullLines: repeatedLines,
        updateLines,
        edition: EDITION,
        progress,
        resumeEdition: EDITION,
      }),
    ).rejects.toThrow(/simulated kill mid-merge/);
    expect(client.checkpoints.get("load-sold-prices")?.state).toMatchObject({ phase: "deduped" });
    expect(client.stage).toHaveLength(40);

    // Run two: the same edition resumes, re-runs the merge and
    // files the register.
    client.failOnMergeInsert = false;
    const resumed = await runNational(client as never, {
      fullLines: repeatedLines,
      updateLines,
      edition: EDITION,
      progress,
      resumeEdition: EDITION,
    });
    expect(resumed.total).toBe(39);

    // The control: the same input in one uninterrupted run.
    const control = new FakeClient();
    control.seedCache(["CM3 2JT", "CM3 2AA", "E16 1GN", "EH1 1AA", "BT1 1AA"]);
    const controlResult = await runNational(control as never, {
      fullLines: repeatedLines,
      updateLines,
      edition: EDITION,
    });
    expect(resumed.total).toBe(controlResult.total);
    expect(liveKey(client.live)).toEqual(liveKey(control.live));
    expect(client.checkpoints.get("load-sold-prices")).toBeUndefined();
    expect(client.stage).toHaveLength(0);
  });

  it("a half-merged stage left by the old code is refused, and --restart recovers it", async () => {
    const client = new FakeClient();
    client.seedCache(["CM3 2JT", "CM3 2AA", "E16 1GN", "EH1 1AA", "BT1 1AA"]);

    // Run one: killed mid-merge — the stage rolls back to the
    // deduped set (40 rows) and the deduped checkpoint stands.
    client.failOnMergeInsert = true;
    await expect(
      runNational(client as never, {
        fullLines: repeatedLines,
        updateLines,
        edition: EDITION,
        resumeEdition: EDITION,
      }),
    ).rejects.toThrow(/simulated kill mid-merge/);
    expect(client.stage).toHaveLength(40);

    // Seed the state a kill under the old code left behind: the
    // merge's delete ran but its inserts never did (38 rows).
    const updateStats = { malformed: 0, emptyPostcode: 0, uncovered: {}, duplicates: 0 };
    const updateGuids = [
      ...new Set(parseAllRecords(updateLines, updateStats).map((r) => r.transactionId)),
    ];
    await client.query("DELETE FROM price_paid_stage WHERE transaction_id = ANY($1)", [
      updateGuids,
    ]);
    expect(client.stage).toHaveLength(38);

    // The resumed run refuses: the staged set is not the
    // deduped set the checkpoint accounts for — fail closed,
    // never file a register it cannot account for.
    client.failOnMergeInsert = false;
    await expect(
      runNational(client as never, {
        fullLines: repeatedLines,
        updateLines,
        edition: EDITION,
        resumeEdition: EDITION,
      }),
    ).rejects.toThrow(/refusing to file a register it cannot account for \(BUG-188\)/);

    // --restart discards the inconsistent stage and files the
    // register from the start.
    const restarted = await runNational(client as never, {
      fullLines: repeatedLines,
      updateLines,
      edition: EDITION,
      resumeEdition: EDITION,
      restart: true,
    });
    expect(restarted.total).toBe(39);

    // The control: the same input in one uninterrupted run.
    const control = new FakeClient();
    control.seedCache(["CM3 2JT", "CM3 2AA", "E16 1GN", "EH1 1AA", "BT1 1AA"]);
    const controlResult = await runNational(control as never, {
      fullLines: repeatedLines,
      updateLines,
      edition: EDITION,
    });
    expect(restarted.total).toBe(controlResult.total);
    expect(liveKey(client.live)).toEqual(liveKey(control.live));
  });
});
