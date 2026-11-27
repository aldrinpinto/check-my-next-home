import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runLegacy, runUpdate } from "../loaders/load-sold-prices.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// Guards the sold-prices loader's LEGACY per-postcode mode
// and monthly UPDATE mode (BUG-368, second half): the legacy
// mode stages the target postcodes' sales as the full file
// streams past, checkpoints the staged chunks, and resumes a
// killed run mid-stream instead of re-reading the file; the
// update mode's single-transaction merge IS its resume (a
// kill rolls back, the re-run applies exactly once, and a
// re-run after success is a gate noop). Driven against an
// in-memory fake of the pg client that pattern-matches the
// loader's fixed SQL shapes — the live proof against a real
// database runs in CI.

const fixtureDir = join(process.cwd(), "tests", "fixtures", "land-registry");
const fullLines = readFileSync(join(fixtureDir, "pp-complete.csv"), "utf8").split(/\r?\n/);
const updateLines = readFileSync(join(fixtureDir, "pp-monthly-update.csv"), "utf8").split(/\r?\n/);
const EXPECTED_BYTES = statSync(join(fixtureDir, "pp-complete.csv")).size;
const TARGETS = new Set(["CM3 2JT", "E16 1GN"]);
const EDITION = "2026-11-12";
// The update file's two rows, both CM3 2JT: one deletion and
// one correction — both guids are in the full file, so the
// merge matches 2 and upserts 1 (40 staged − 2 + 1 = 39).
// toRecord strips the braces, so the ids here are bare.
const DELETE_GUID = "237B17FE-C04F-22AC-E063-4804A8C0EA3A";
const UPSERT_GUID = "237B17FE-C050-22AC-E063-4804A8C0EA3A";

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

// An in-memory stand-in for the loader's pg client, in the
// national test's shape: BEGIN snapshots the live register
// and the stage; ROLLBACK restores them — the
// swap-atomicity pins lean on exactly that.
class FakeClient {
  stage: Row[] | null = null;
  live: Row[] = [];
  items: Row[] = [];
  checkpoints = new Map<string, Record<string, unknown>>();
  stageInserts = 0;
  failAfterStageInserts: number | null = null;
  failNextLiveInsert = false;
  #snapshot: {
    live: Row[];
    stage: Row[] | null;
    checkpoints: Map<string, Record<string, unknown>>;
  } | null = null;

  armFailNextLiveInsert() {
    this.failNextLiveInsert = true;
  }

  async query(text: string, params: unknown[] = []): Promise<{ rows: Row[]; rowCount?: number }> {
    const sql = text.replace(/\s+/g, " ").trim();
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
    if (sql.startsWith("CREATE TABLE IF NOT EXISTS sold_prices_legacy_stage")) {
      if (this.stage === null) this.stage = [];
      return { rows: [] };
    }
    if (sql.startsWith("TRUNCATE sold_prices_legacy_stage")) {
      this.stage = [];
      return { rows: [] };
    }
    if (sql.startsWith("DROP TABLE IF EXISTS sold_prices_legacy_stage")) {
      this.stage = null;
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
    if (sql.startsWith("SELECT coalesce(max(seq), -1) + 1 AS next FROM sold_prices_legacy_stage")) {
      const seqs = (this.stage as Row[])
        .map((r) => r.seq)
        .filter((s): s is number => typeof s === "number");
      return { rows: [{ next: seqs.length === 0 ? 0 : Math.max(...seqs) + 1 }] as Row[] };
    }
    if (sql.startsWith("DELETE FROM sold_prices_legacy_stage WHERE seq >=")) {
      const before = (this.stage as Row[]).length;
      this.stage = (this.stage as Row[]).filter((r) => (r.seq ?? 0) < (params[0] as number));
      return { rows: [], rowCount: before - (this.stage as Row[]).length };
    }
    if (sql.startsWith("DELETE FROM sold_prices_legacy_stage a USING")) {
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
    if (sql.startsWith("DELETE FROM sold_prices_legacy_stage WHERE transaction_id = ANY")) {
      const guids = new Set(params[0] as string[]);
      this.stage = (this.stage as Row[]).filter((r) => !guids.has(r.transaction_id as string));
      return { rows: [] };
    }
    if (sql === "DELETE FROM sold_prices_legacy_stage") {
      const n = (this.stage as Row[]).length;
      this.stage = [];
      return { rows: [], rowCount: n };
    }
    if (sql.startsWith("INSERT INTO sold_prices_legacy_stage")) {
      this.stageInserts += 1;
      if (this.failAfterStageInserts !== null && this.stageInserts > this.failAfterStageInserts)
        throw new Error("simulated kill: the database connection dropped mid-insert");
      // The stage's seq is NOT NULL with no default (BUG-379):
      // every insert must carry it — the intake's takeSeq
      // insert and the merge's upsert both carry the seq
      // first (18 params a row). A 17-param insert is the
      // unfixed merge, and real Postgres refuses it with
      // the not-null error this branch reproduces.
      const width = sql.includes("(seq, transaction_id") ? COLUMNS.length + 1 : COLUMNS.length;
      if (width === COLUMNS.length)
        throw new Error(
          'null value in column "seq" of relation "sold_prices_legacy_stage" violates not-null constraint',
        );
      for (let at = 0; at < params.length; at += width) {
        const values = params.slice(at, at + width);
        const row =
          width === COLUMNS.length + 1 ? valuesToRow(values.slice(1)) : valuesToRow(values);
        if (width === COLUMNS.length + 1) row.seq = values[0] as number;
        (this.stage as Row[]).push(row);
      }
      return { rows: [] };
    }
    if (sql.includes("FROM sold_prices_legacy_stage") && sql.includes("regexp_replace")) {
      const areas = new Set(params[0] as string[]);
      const n = (this.stage as Row[]).filter((r) =>
        areas.has(/^[A-Z]+/.exec((r.postcode as string).split(" ")[0])?.[0] ?? ""),
      ).length;
      return { rows: [{ n }] as Row[] };
    }
    if (
      sql.startsWith(
        "SELECT count(*)::int AS n FROM sold_prices_legacy_stage WHERE transaction_id = ANY",
      )
    ) {
      const guids = new Set(params[0] as string[]);
      const n = (this.stage as Row[]).filter((r) => guids.has(r.transaction_id as string)).length;
      return { rows: [{ n }] as Row[] };
    }
    if (sql.startsWith("SELECT count(*)::int AS n FROM sold_prices_legacy_stage")) {
      return { rows: [{ n: (this.stage as Row[]).length }] as Row[] };
    }
    if (sql.startsWith("SELECT max(sale_date)::text AS newest FROM sold_prices_legacy_stage")) {
      const dates = (this.stage as Row[]).map((r) => r.sale_date as string).sort();
      return { rows: [{ newest: dates[dates.length - 1] ?? null }] as Row[] };
    }
    if (sql.includes("FROM sold_prices_legacy_stage WHERE postcode = $1")) {
      const rows = (this.stage as Row[])
        .filter((r) => r.postcode === params[0])
        .sort((a, b) => (a.seq ?? Infinity) - (b.seq ?? Infinity));
      return { rows: rows.map((r) => ({ ...r })) };
    }
    if (sql.startsWith("DELETE FROM price_paid WHERE postcode = $1")) {
      this.live = this.live.filter((r) => r.postcode !== params[0]);
      return { rows: [] };
    }
    if (sql.startsWith("DELETE FROM price_paid WHERE transaction_id = ANY")) {
      const guids = new Set(params[0] as string[]);
      this.live = this.live.filter((r) => !guids.has(r.transaction_id as string));
      return { rows: [] };
    }
    if (sql.startsWith("INSERT INTO price_paid")) {
      if (this.failNextLiveInsert) {
        this.failNextLiveInsert = false;
        throw new Error("simulated kill: the database connection dropped mid-insert");
      }
      const width = COLUMNS.length;
      for (let at = 0; at < params.length; at += width) {
        this.live.push(valuesToRow(params.slice(at, at + width)));
      }
      return { rows: [] };
    }
    if (sql.includes("FROM price_paid WHERE postcode = $1")) {
      const rows = this.live
        .filter((r) => r.postcode === params[0])
        .map((r) => ({
          transactionId: r.transaction_id,
          price: r.price,
          saleDate: r.sale_date,
          paon: r.paon,
          street: r.street,
        }));
      return { rows: rows as Row[] };
    }
    if (sql.startsWith("SELECT max(source_date)::text AS edition FROM loader_run_items")) {
      const editions = this.items
        .filter((i) => i.item === "load-sold-prices" && i.status === "succeeded" && i.source_date)
        .map((i) => i.source_date as string)
        .sort();
      return { rows: [{ edition: editions[editions.length - 1] ?? null }] as Row[] };
    }
    throw new Error(`FakeClient: unhandled SQL: ${sql}`);
  }
}

async function runLegacyLoad(
  fake: FakeClient,
  {
    restart = false,
    resumeEdition = EDITION,
    lines = null as string[] | null,
  }: { restart?: boolean; resumeEdition?: string | null; lines?: string[] | null } = {},
) {
  const captured: string[] = lines ?? [];
  const progress = createProgressLogger({
    name: "load-sold-prices",
    log: (line: string) => captured.push(line),
  });
  const result = await runLegacy(fake as never, {
    fullLines,
    updateLines,
    targets: TARGETS,
    edition: EDITION,
    resumeEdition,
    expectedFullBytes: EXPECTED_BYTES,
    progress,
    restart,
  });
  return { result, lines: captured };
}

describe("legacy load resume (BUG-368)", () => {
  it("kill mid-filing resumes past the merge and files every postcode exactly once", async () => {
    const fake = new FakeClient();
    // Kill on the filing's first live insert: the intake,
    // dedupe and merge all stand checkpointed, the filing
    // transaction rolls back, and nothing is filed.
    const killLines: string[] = [];
    fake.armFailNextLiveInsert();
    await expect(runLegacyLoad(fake, { lines: killLines })).rejects.toThrow(/simulated kill/);
    expect(fake.live.length).toBe(0);
    expect(fake.stage?.length).toBe(39);
    const cp = fake.checkpoints.get("load-sold-prices-legacy");
    expect(cp?.next_start_index).toBe(40);
    expect(cp?.filed_count).toBe(39);
    expect((cp?.state as { phase: string }).phase).toBe("merged");
    expect(killLines.some((l) => /checkpoint 40 lines · staged 39 · resume from 40/.test(l))).toBe(
      true,
    );

    const { result, lines } = await runLegacyLoad(fake);
    expect(result.total).toBe(39);
    expect(
      lines.some((l) =>
        /resuming from checkpoint · 39 rows staged · edition 2026-11-12 · resume from 40/.test(l),
      ),
    ).toBe(true);
    // Every postcode filed once: 30 CM3 2JT sales (31 − the
    // deleted guid − the replaced guid + its correction)
    // and 9 E16 1GN sales, no duplicate transaction id.
    const cm = fake.live.filter((r) => r.postcode === "CM3 2JT");
    const e16 = fake.live.filter((r) => r.postcode === "E16 1GN");
    expect(cm.length).toBe(30);
    expect(e16.length).toBe(9);
    const ids = fake.live.map((r) => r.transaction_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(DELETE_GUID);
    expect(ids).toContain(UPSERT_GUID);
    expect(fake.live.find((r) => r.transaction_id === UPSERT_GUID)?.price).toBe(651440);
    // The golden home filed with its sale.
    const home = cm.find((r) => r.paon === "19" && r.street === "BIRKDALE RISE");
    expect(home?.price).toBe(588995);
    expect(home?.sale_date).toBe("2023-06-15");
    // The filing cleared staging and the checkpoint together.
    expect(fake.stage?.length).toBe(0);
    expect(fake.checkpoints.get("load-sold-prices-legacy")).toBeUndefined();
  });

  it("kill mid-merge resumes and re-runs the merge idempotently", async () => {
    const fake = new FakeClient();
    // Kill on the merge's stage insert (the second stage
    // insert after the intake's one): the merge and its
    // checkpoint commit together, so the kill rolls the
    // stage back to the deduped set — the deletion half
    // never lands, and the checkpoint still says deduped.
    fake.failAfterStageInserts = 1;
    await expect(runLegacyLoad(fake)).rejects.toThrow(/simulated kill/);
    expect(fake.live.length).toBe(0);
    expect(fake.stage?.length).toBe(40);
    const cp = fake.checkpoints.get("load-sold-prices-legacy");
    expect((cp?.state as { phase: string }).phase).toBe("deduped");
    // The staged rows are the full file's own: both update
    // guids still present at their filed prices.
    expect(fake.stage?.find((r) => r.transaction_id === UPSERT_GUID)?.price).toBe(651439);
    expect(fake.stage?.find((r) => r.transaction_id === DELETE_GUID)?.price).toBe(153243);

    fake.failAfterStageInserts = null;
    const { result } = await runLegacyLoad(fake);
    expect(result.total).toBe(39);
    const cm = fake.live.filter((r) => r.postcode === "CM3 2JT");
    expect(cm.length).toBe(30);
    expect(fake.live.filter((r) => r.postcode === "E16 1GN").length).toBe(9);
    expect(fake.live.filter((r) => r.transaction_id === UPSERT_GUID).length).toBe(1);
    expect(fake.stage?.length).toBe(0);
    expect(fake.checkpoints.get("load-sold-prices-legacy")).toBeUndefined();
  });

  it("the update merge's upserts carry seqs past the staged max (BUG-379)", async () => {
    const fake = new FakeClient();
    // Kill on the filing's first live insert, as in the
    // first test: the intake, dedupe and merge all stand
    // checkpointed, so the staged set can be inspected —
    // and the merge's upsert is in it, not refused by the
    // stage's NOT NULL seq (the CI #371 failure: a
    // seq-less upsert is what real Postgres rejected).
    fake.armFailNextLiveInsert();
    await expect(runLegacyLoad(fake)).rejects.toThrow(/simulated kill/);
    expect(fake.stage?.length).toBe(39);
    const seqs = (fake.stage ?? []).map((r) => r.seq);
    expect(seqs.every((s) => typeof s === "number")).toBe(true);
    expect(new Set(seqs).size).toBe(seqs.length);
    // The intake staged seqs 0..39 and the dedupe removed
    // none, so the merge's upsert continues at 40.
    expect(fake.stage?.find((r) => r.transaction_id === UPSERT_GUID)?.seq).toBe(40);
  });

  it("an edition change discards the staged rows and files from zero", async () => {
    const fake = new FakeClient();
    fake.armFailNextLiveInsert();
    await expect(runLegacyLoad(fake)).rejects.toThrow(/simulated kill/);
    expect(fake.stage?.length).toBe(39);

    const lines: string[] = [];
    const { result } = await runLegacyLoad(fake, { resumeEdition: "2026-11-13", lines });
    expect(result.total).toBe(39);
    expect(
      lines.some((l) =>
        /discarding stale checkpoint · edition changed \(2026-11-12 → 2026-11-13\)/.test(l),
      ),
    ).toBe(true);
    expect(fake.live.filter((r) => r.postcode === "CM3 2JT").length).toBe(30);
    expect(fake.live.filter((r) => r.postcode === "E16 1GN").length).toBe(9);
    expect(fake.stage?.length).toBe(0);
    expect(fake.checkpoints.get("load-sold-prices-legacy")).toBeUndefined();
  });

  it("--restart discards the checkpoint and files from zero", async () => {
    const fake = new FakeClient();
    fake.armFailNextLiveInsert();
    await expect(runLegacyLoad(fake)).rejects.toThrow(/simulated kill/);
    expect(fake.stage?.length).toBe(39);

    const lines: string[] = [];
    const { result } = await runLegacyLoad(fake, { restart: true, lines });
    expect(result.total).toBe(39);
    expect(
      lines.some((l) =>
        /restart requested — discarding checkpoint and staging · starting from 0/.test(l),
      ),
    ).toBe(true);
    expect(fake.live.filter((r) => r.postcode === "CM3 2JT").length).toBe(30);
    expect(fake.live.filter((r) => r.postcode === "E16 1GN").length).toBe(9);
    expect(fake.stage?.length).toBe(0);
    expect(fake.checkpoints.get("load-sold-prices-legacy")).toBeUndefined();
  });

  it("a run with no edition to key on stages without a checkpoint and drops the stage", async () => {
    const fake = new FakeClient();
    const { result } = await runLegacyLoad(fake, { resumeEdition: null });
    expect(result.total).toBe(39);
    expect(fake.live.length).toBe(39);
    // No checkpoint was ever written, and the stage table
    // is dropped at the end instead of cleared.
    expect(fake.checkpoints.size).toBe(0);
    expect(fake.stage).toBeNull();
  });
});

describe("monthly update (BUG-368 — no-checkpoint resume)", () => {
  async function seededFake(): Promise<FakeClient> {
    const fake = new FakeClient();
    await runLegacyLoad(fake);
    expect(fake.live.length).toBe(39);
    return fake;
  }

  it("kill mid-merge rolls back and the re-run applies exactly once", async () => {
    const fake = await seededFake();
    // Kill on the merge's live insert: the delete half is
    // inside the same transaction, so the rollback restores
    // the register whole.
    fake.armFailNextLiveInsert();
    await expect(
      runUpdate(fake as never, {
        updateLines,
        edition: "2026-12-01",
        progress: createProgressLogger({ name: "load-sold-prices", log: () => {} }),
      }),
    ).rejects.toThrow(/simulated kill/);
    expect(fake.live.length).toBe(39);
    expect(fake.live.filter((r) => r.transaction_id === UPSERT_GUID).length).toBe(1);

    const result = await runUpdate(fake as never, {
      updateLines,
      edition: "2026-12-01",
      progress: createProgressLogger({ name: "load-sold-prices", log: () => {} }),
    });
    expect(result.applied).toBe(1);
    expect(result.deleted).toBe(1);
    expect(fake.live.length).toBe(39);
    expect(fake.live.filter((r) => r.transaction_id === UPSERT_GUID).length).toBe(1);
    expect(fake.live.filter((r) => r.transaction_id === DELETE_GUID).length).toBe(0);
    expect(fake.live.find((r) => r.transaction_id === UPSERT_GUID)?.price).toBe(651440);
  });

  it("re-run after success is a gate noop", async () => {
    const fake = await seededFake();
    fake.items.push({
      item: "load-sold-prices",
      status: "succeeded",
      source_date: "2026-12-01",
    });
    const before = structuredClone(fake.live);
    const result = await runUpdate(fake as never, {
      updateLines,
      edition: "2026-12-01",
      progress: createProgressLogger({ name: "load-sold-prices", log: () => {} }),
    });
    expect(result.noop).toBe(true);
    expect(result.applied).toBe(0);
    expect(fake.live).toEqual(before);
  });

  it("an older edition is refused by the gate", async () => {
    const fake = await seededFake();
    fake.items.push({
      item: "load-sold-prices",
      status: "succeeded",
      source_date: "2026-12-01",
    });
    const before = structuredClone(fake.live);
    await expect(
      runUpdate(fake as never, {
        updateLines,
        edition: "2026-11-01",
        progress: createProgressLogger({ name: "load-sold-prices", log: () => {} }),
      }),
    ).rejects.toThrow(/older than the last applied edition/);
    expect(fake.live).toEqual(before);
  });
});

describe("no-sale postcode (BUG-383)", () => {
  it("a postcode with no sales in the file files nothing and succeeds", async () => {
    // The seed's neither-source witness (scripts/seed-golden.mjs):
    // the golden pass files CM3 2JT / E16 1GN and clears the
    // stage, then the CM0 7AA pass runs over the same dir —
    // the fixture holds no CM0 rows, so the stage is empty.
    // Before the fix the pass refused with "the full file filed
    // no sales — nothing to swap in" and the Playwright job's
    // seed never started the webServer (CI #373). A fully-read,
    // fully-reconciled intake that staged nothing is a
    // legitimate empty result, not a broken register.
    const fake = new FakeClient();
    const run = async (targets: Set<string>, lines: string[]) =>
      runLegacy(fake as never, {
        fullLines,
        updateLines,
        targets,
        edition: null,
        resumeEdition: `size-${EXPECTED_BYTES}`,
        expectedFullBytes: EXPECTED_BYTES,
        progress: createProgressLogger({
          name: "load-sold-prices",
          log: (line: string) => lines.push(line),
        }),
      });
    const goldenLines: string[] = [];
    const golden = await run(TARGETS, goldenLines);
    expect(golden.total).toBe(39);
    expect(fake.live.length).toBe(39);
    expect(fake.stage?.length).toBe(0);
    expect(fake.checkpoints.get("load-sold-prices-legacy")).toBeUndefined();

    const cm0Lines: string[] = [];
    const result = await run(new Set(["CM0 7AA"]), cm0Lines);
    expect(result.total).toBe(0);
    // The old in-memory legacy path's fallback edition for an
    // empty set: the newest sale date cannot be read from an
    // empty stage, so the edition is the earliest date.
    expect(result.edition).toBe("1970-01-01");
    // Nothing filed for CM0 7AA, and the golden rows stand.
    expect(fake.live.length).toBe(39);
    expect(fake.live.filter((r) => r.postcode === "CM0 7AA").length).toBe(0);
    // The filing cleared staging and the checkpoint together.
    expect(fake.stage?.length).toBe(0);
    expect(fake.checkpoints.get("load-sold-prices-legacy")).toBeUndefined();
    expect(result.logLine).toContain("CM0 7AA 0 sales");
  });
});
