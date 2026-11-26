import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  fileMobile,
  loadMobileRows,
  normaliseCouncil,
  parseLauaCsv,
  structuralChecks,
} from "../loaders/load-mobile.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// Mobile loader (plan step M5.9). Fixture values are invented and
// format-faithful (fixture README); Ofcom publishes mobile coverage
// at local-authority level only, and the tests pin that grain: the
// answer names it, the join is by council, and the at-least-one
// figure is Ofcom's own published derivation from filed inputs.

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/mobile");
const RELEASE = { snapshot: "2026-01", snapshotLabel: "2026-01" };

describe("the fixture release", () => {
  it("parses the three golden authorities with the grain named in the answer", async () => {
    const { rows } = (await loadMobileRows({ fileDir: FIXTURE_DIR } as never)) as unknown as {
      rows: {
        laua: string;
        lauaName: string;
        answer: {
          basis: string;
          services: Record<
            string,
            {
              outdoor: {
                no_operator_pct: number;
                all_operators_pct: number | null;
                at_least_one_operator_pct: number;
              };
            }
          >;
        };
      }[];
    };
    expect(rows.map((r) => r.lauaName).sort()).toEqual(["Braintree", "Epsom and Ewell", "Newham"]);
    expect(() => structuralChecks(rows, { full: false })).not.toThrow();
    const braintree = rows.find((r) => r.lauaName === "Braintree");
    expect(braintree?.answer.basis).toMatch(/local-authority level/);
    // Spring 2026 removed the aggregate Data service. The filed
    // services are the technology/service families the real file
    // publishes, including 5G Standalone at both confidence levels.
    expect(Object.keys(braintree?.answer.services ?? {})).toEqual([
      "voice",
      "4g",
      "5g_high_confidence",
      "5g_very_high_confidence",
      "5g_sa_high_confidence",
      "5g_sa_very_high_confidence",
    ]);
    expect(braintree?.answer.services).not.toHaveProperty("data");
    // Voice's all-operators figure is the _4 column, like every
    // other service (the real file publishes Voice_prem_out_4
    // with values; _3 is only the exactly-three share).
    expect(braintree?.answer.services.voice.outdoor.all_operators_pct).toBe(99.17);
    // 5G SA has no four-operator column values (one operator does
    // not deploy it), but its published no-operator figure and the
    // sanctioned at-least-one derivation still file.
    expect(braintree?.answer.services["5g_sa_high_confidence"].outdoor).toEqual({
      no_operator_pct: 42.6,
      all_operators_pct: null,
      at_least_one_operator_pct: 57.4,
    });
    // at-least-one = 100 - no-operator, from the filed inputs.
    const fourG = braintree?.answer.services["4g"].outdoor;
    expect(fourG?.at_least_one_operator_pct).toBeCloseTo(100 - (fourG?.no_operator_pct ?? NaN), 5);
  });

  it("refuses a file missing a consumed service column", () => {
    const broken = "laua,laua_name,Voice_prem_out_0\nE07000067,Braintree,0.1\n";
    expect(() => parseLauaCsv(broken, RELEASE)).toThrow(/missing column/);
  });
});

type CoverageSet = {
  no_operator_pct: number | null;
  all_operators_pct: number | null;
  at_least_one_operator_pct: number | null;
} | null;
type Services = Record<string, { outdoor: CoverageSet; indoor?: CoverageSet }>;

describe("the empty-cell rule (Ofcom writes exact zeros as empty cells)", () => {
  // Proven by the founder's v6 live run (13 Nov 2026) against the
  // real file, whose raw rows the harness printed: Braintree's
  // real 4G_prem_out_0 is empty while its siblings sum to exactly
  // 100, and Newham's _0.._3 are empty beside _4 = 100. An empty
  // cell is a zero — unless its column is empty in EVERY row,
  // which is an unpublished column (the documented 3G
  // multi-operator and 5G SA four-operator cases) whose figure
  // files as null. The fixture reproduces all three shapes with
  // invented values.
  const load = async () =>
    (await loadMobileRows({ fileDir: FIXTURE_DIR } as never)) as unknown as {
      rows: { lauaName: string; answer: { services: Services } }[];
    };

  it("files an empty _0 cell as 0 when its siblings carry the figures", async () => {
    const { rows } = await load();
    const braintree = rows.find((r) => r.lauaName === "Braintree");
    expect(braintree?.answer.services["4g"].outdoor).toEqual({
      no_operator_pct: 0,
      all_operators_pct: 98.9,
      at_least_one_operator_pct: 100,
    });
    // Voice's all-operators figure comes from _4, not from the
    // exactly-three _3 column an earlier revision read.
    expect(braintree?.answer.services.voice.outdoor).toEqual({
      no_operator_pct: 0,
      all_operators_pct: 99.17,
      at_least_one_operator_pct: 100,
    });
  });

  it("files the full-coverage authority (every _4 = 100, siblings empty) in full", async () => {
    const { rows } = await load();
    const newham = rows.find((r) => r.lauaName === "Newham");
    const full = { no_operator_pct: 0, all_operators_pct: 100, at_least_one_operator_pct: 100 };
    expect(newham?.answer.services.voice.outdoor).toEqual(full);
    expect(newham?.answer.services["4g"].outdoor).toEqual(full);
    expect(newham?.answer.services["4g"].indoor).toEqual(full);
    expect(newham?.answer.services["5g_high_confidence"].outdoor).toEqual(full);
    expect(newham?.answer.services["5g_very_high_confidence"].outdoor).toEqual(full);
    // 5G SA's _4 column is unpublished file-wide: its
    // all-operators figure stays null even here, beside the
    // filed 0 and its derivation — it is never filed as 0 or 100.
    const sa = { no_operator_pct: 0, all_operators_pct: null, at_least_one_operator_pct: 100 };
    expect(newham?.answer.services["5g_sa_high_confidence"].outdoor).toEqual(sa);
    expect(newham?.answer.services["5g_sa_very_high_confidence"].outdoor).toEqual(sa);
  });

  it("keeps the ordinary all-numeric row filing as published", async () => {
    const { rows } = await load();
    const epsom = rows.find((r) => r.lauaName === "Epsom and Ewell");
    expect(epsom?.answer.services.voice.outdoor).toEqual({
      no_operator_pct: 0.4,
      all_operators_pct: 97.8,
      at_least_one_operator_pct: 99.6,
    });
    expect(epsom?.answer.services["5g_sa_high_confidence"].outdoor).toEqual({
      no_operator_pct: 27.5,
      all_operators_pct: null,
      at_least_one_operator_pct: 72.5,
    });
  });

  it("files a set as null only when both its columns are unpublished file-wide", async () => {
    const text = await readFile(join(FIXTURE_DIR, "202601_mobile_coverage_laua_r01.csv"), "utf8");
    const lines = text.split(/\r?\n/).filter((line) => line !== "");
    const header = lines[0].split(",");
    const targets = [
      "5G_very_high_confidence_prem_out_0",
      "5G_very_high_confidence_prem_out_4",
    ].map((name) => header.indexOf(name));
    const blanked = [
      lines[0],
      ...lines.slice(1).map((line) => {
        const fields = line.split(",");
        for (const at of targets) fields[at] = "";
        return fields.join(",");
      }),
    ].join("\n");
    const rows = parseLauaCsv(blanked, RELEASE) as unknown as {
      lauaName: string;
      answer: { services: Services };
    }[];
    const braintree = rows.find((r) => r.lauaName === "Braintree");
    expect(braintree?.answer.services["5g_very_high_confidence"].outdoor).toBeNull();
    expect(braintree?.answer.services["4g"].outdoor).not.toBeNull();
  });
});

describe("blank and partial rows", () => {
  // The real Spring 2026 file ends with an empty row spanning every
  // column (founder's live run, 13 Nov 2026): a record in which
  // every field is empty holds no data and must be skipped — the
  // fixture itself now ends with such a row, and the fixture test
  // above parses it. A row that carries values but no authority
  // code or name is a data error and must still throw.
  const fixtureLines = async () => {
    const text = await readFile(join(FIXTURE_DIR, "202601_mobile_coverage_laua_r01.csv"), "utf8");
    return text.split(/\r?\n/).filter((line) => line !== "");
  };

  it("skips a record in which every field is empty", async () => {
    const [header, row] = await fixtureLines();
    const emptyRow = ",".repeat(header.split(",").length - 1);
    const rows = parseLauaCsv([header, row, emptyRow].join("\n"), RELEASE);
    expect(rows).toHaveLength(1);
    expect(rows[0].lauaName).toBe(row.split(",")[1]);
  });

  it("still refuses a row that carries values but no authority code or name", async () => {
    const [header, row] = await fixtureLines();
    const fields = row.split(",");
    fields[0] = "";
    fields[1] = "";
    expect(() => parseLauaCsv([header, fields.join(",")].join("\n"), RELEASE)).toThrow(
      /no authority code or name/,
    );
  });
});

describe("the council join", () => {
  it("normalises case and spacing the way the SQL join does", () => {
    expect(normaliseCouncil("  Epsom   and  Ewell ")).toBe("epsom and ewell");
    expect(normaliseCouncil("Newham")).toBe("newham");
  });

  it("stages, merges by council with UPDATE postcode_cache SET answers, and reports unmatched councils", async () => {
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        if (/SELECT council, COUNT/.test(sql)) {
          return { rows: [{ council: "Nowhere", n: 12 }], rowCount: 1 };
        }
        return { rows: [], rowCount: 42 };
      },
    };
    const { rows } = await loadMobileRows({ fileDir: FIXTURE_DIR } as never);
    const result = (await fileMobile(client as never, rows as never)) as {
      updated: number;
      unmatched: { council: string; n: number }[];
    };
    expect(result.updated).toBe(42);
    expect(result.unmatched).toEqual([{ council: "Nowhere", n: 12 }]);
    const beginAt = statements.findIndex((s) => s === "BEGIN");
    const stageAt = statements.findIndex((s) => /CREATE TEMP TABLE mobile_stage/.test(s));
    expect(beginAt).toBeGreaterThanOrEqual(0);
    expect(stageAt).toBeGreaterThan(beginAt);
    expect(statements.some((s) => /UPDATE postcode_cache SET answers/.test(s))).toBe(true);
    expect(statements.at(-1)).toBe("COMMIT");
  });
});

describe("progress — BUG-265", () => {
  const collect = () => {
    const lines: string[] = [];
    return { lines, log: (line: string) => lines.push(line) };
  };

  it("logs the staged authorities with a real percentage and the filed answers", async () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-mobile", log });
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        if (/SELECT council, COUNT/.test(sql)) {
          return { rows: [{ council: "Nowhere", n: 12 }], rowCount: 1 };
        }
        return { rows: [], rowCount: 42 };
      },
    };
    const { rows } = await loadMobileRows({ fileDir: FIXTURE_DIR } as never);
    const result = (await fileMobile(client as never, rows as never, { progress })) as {
      updated: number;
    };
    expect(result.updated).toBe(42);
    expect(lines.some((l) => /progress · stage 3\/3 authorities \(100%\)$/.test(l))).toBe(true);
    expect(
      lines.some((l) => /progress · file 42 answers · 1 council matched no authority$/.test(l)),
    ).toBe(true);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
    expect(statements.at(-1)).toBe("COMMIT");
  });

  it("names a filing failure with the resume point", async () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-mobile", log });
    const client = {
      query: async (sql: string) => {
        if (/INSERT INTO mobile_stage/.test(sql)) throw new Error("forced failure");
        return { rows: [], rowCount: 0 };
      },
    };
    const { rows } = await loadMobileRows({ fileDir: FIXTURE_DIR } as never);
    await expect(fileMobile(client as never, rows as never, { progress })).rejects.toThrow(
      "forced failure",
    );
    expect(
      lines.some((l) =>
        /failed · file · filed 0 · forced failure · resume from re-run from scratch/.test(l),
      ),
    ).toBe(true);
  });
});

describe("resume (BUG-368)", () => {
  // A fake pg client: the staged authorities, the postcode
  // directory's answers, and the loader_checkpoint row as
  // arrays, with just enough SQL to run the filer. The merge
  // UPDATE is modelled as a set-add per postcode, so a
  // re-run merge can never double-file an answer.
  type CheckpointRow = {
    loader: string;
    edition: string;
    expected: number | null;
    next_start_index: number;
    read_count: number;
    filed_count: number;
    state: Record<string, unknown> | null;
  };
  type StagedRow = { lauaName: string; lauaNorm: string; seq: number };
  const EDITION = "2026-03r1";
  const makeRows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      laua: `E000000${i}`,
      lauaName: `Authority ${i}`,
      answer: { snapshot: EDITION, laua: `E000000${i}`, laua_name: `Authority ${i}`, services: {} },
    }));
  function createFakeClient() {
    let staged: StagedRow[] = [];
    const checkpoints = new Map<string, CheckpointRow>();
    // Two postcodes per authority, plus three unmatched
    // councils with five postcodes each.
    const postcodes: { council: string; answers: Set<string> }[] = [];
    const addPostcodes = (council: string, n: number) => {
      for (let i = 0; i < n; i++) postcodes.push({ council, answers: new Set() });
    };
    const rows = makeRows(1200);
    for (const r of rows) addPostcodes(r.lauaName, 2);
    for (const u of ["Nowhere 1", "Nowhere 2", "Nowhere 3"]) addPostcodes(u, 5);
    let insertCalls = 0;
    let failAfterInserts: number | null = null;
    let failMergeOnce = false;
    let mergeCalls = 0;
    let snapshot: {
      staged: StagedRow[];
      checkpoints: Map<string, CheckpointRow>;
      answers: Set<string>[];
    } | null = null;
    const query = async (sql: string, params: unknown[] = []) => {
      const text = sql.replace(/\s+/g, " ");
      if (text === "BEGIN") {
        snapshot = {
          staged: [...staged],
          checkpoints: new Map(checkpoints),
          answers: postcodes.map((p) => new Set(p.answers)),
        };
        return { rows: [] };
      }
      if (text === "COMMIT") {
        snapshot = null;
        return { rows: [] };
      }
      if (text === "ROLLBACK") {
        const snap = snapshot;
        if (snap) {
          staged = snap.staged;
          checkpoints.clear();
          for (const [k, v] of snap.checkpoints) checkpoints.set(k, v);
          postcodes.forEach((p, i) => {
            p.answers = snap.answers[i];
          });
        }
        snapshot = null;
        return { rows: [] };
      }
      if (/CREATE TABLE IF NOT EXISTS mobile_stage/.test(text)) return { rows: [] };
      if (/INSERT INTO mobile_stage/.test(text)) {
        insertCalls += 1;
        if (failAfterInserts !== null && insertCalls > failAfterInserts)
          throw new Error("simulated kill: the database connection dropped mid-insert");
        for (let r = 0; r < params.length / 4; r++) {
          const b = r * 4;
          staged.push({
            lauaName: params[b] as string,
            lauaNorm: params[b + 1] as string,
            seq: params[b + 3] as number,
          });
        }
        return { rows: [], rowCount: params.length / 4 };
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
      if (/DELETE FROM mobile_stage WHERE seq >=/.test(text)) {
        staged = staged.filter((r) => r.seq < (params[0] as number));
        return { rows: [], rowCount: 0 };
      }
      if (/DELETE FROM mobile_stage/.test(text)) {
        staged = [];
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n FROM mobile_stage/.test(text))
        return { rows: [{ n: staged.length }] };
      if (
        /UPDATE postcode_cache SET answers = answers \|\| jsonb_build_object\('mobile'/.test(text)
      ) {
        mergeCalls += 1;
        if (failMergeOnce) {
          failMergeOnce = false;
          throw new Error("simulated kill: the database connection dropped mid-merge");
        }
        const stagedNorms = new Set(staged.map((r) => r.lauaNorm));
        let updated = 0;
        for (const p of postcodes) {
          if (stagedNorms.has(p.council.trim().replace(/\s+/g, " ").toLowerCase())) {
            p.answers.add("mobile");
            updated += 1;
          }
        }
        return { rows: [], rowCount: updated };
      }
      if (/UPDATE postcode_cache SET answers = answers - 'mobile'/.test(text)) {
        const stagedNorms = new Set(staged.map((r) => r.lauaNorm));
        for (const p of postcodes) {
          if (!stagedNorms.has(p.council.trim().replace(/\s+/g, " ").toLowerCase()))
            p.answers.delete("mobile");
        }
        return { rows: [], rowCount: 0 };
      }
      if (/SELECT council, COUNT\(\*\)::int AS n FROM postcode_cache/.test(text)) {
        const stagedNorms = new Set(staged.map((r) => r.lauaNorm));
        const unmatched = new Map<string, number>();
        for (const p of postcodes) {
          if (!stagedNorms.has(p.council.trim().replace(/\s+/g, " ").toLowerCase()))
            unmatched.set(p.council, (unmatched.get(p.council) ?? 0) + 1);
        }
        return {
          rows: [...unmatched.entries()]
            .map(([council, n]) => ({ council, n }))
            .sort((a, b) => a.council.localeCompare(b.council)),
        };
      }
      throw new Error(`fake client: unhandled SQL: ${sql}`);
    };
    return {
      query,
      staged: () => staged,
      checkpoints,
      postcodes,
      mergeCalls: () => mergeCalls,
      setFailAfterInserts: (n: number | null) => {
        failAfterInserts = n;
      },
      setFailMergeOnce: () => {
        failMergeOnce = true;
      },
    };
  }
  type FakeClient = ReturnType<typeof createFakeClient>;
  async function runFiling(
    fake: FakeClient,
    rows: ReturnType<typeof makeRows>,
    { restart = false, lines = null as string[] | null } = {},
  ) {
    const captured: string[] = lines ?? [];
    const progress = createProgressLogger({
      name: "load-mobile",
      log: (line: string) => captured.push(line),
    });
    const result = await fileMobile(fake as never, rows as never, {
      progress,
      resume: { edition: EDITION, restart },
    });
    return { result, lines: captured };
  }

  it("kill mid-staging resumes and merges every authority exactly once", async () => {
    const fake = createFakeClient();
    const rows = makeRows(1200);
    // Kill after two 500-row chunks: 1,000 authorities staged,
    // the checkpoint at 1,000, the third chunk never landed.
    const killLines: string[] = [];
    fake.setFailAfterInserts(2);
    await expect(runFiling(fake, rows, { lines: killLines })).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(1000);
    expect(fake.checkpoints.get("load-mobile")?.next_start_index).toBe(1000);
    expect(
      killLines.some((l) =>
        /checkpoint 1,000\/1,200 authorities \(83%\) · staged 1,000 · resume from 1,000/.test(l),
      ),
    ).toBe(true);
    // Nothing merged yet — the kill happened before the merge.
    expect(fake.postcodes.some((p) => p.answers.has("mobile"))).toBe(false);

    fake.setFailAfterInserts(null);
    const { result, lines } = await runFiling(fake, rows);
    expect(
      lines.some((l) =>
        /resuming from checkpoint · 1,000 rows staged · edition 2026-03r1 · resume from 1,000/.test(
          l,
        ),
      ),
    ).toBe(true);
    // 1,200 authorities × 2 postcodes each merged.
    expect(result.updated).toBe(2400);
    expect(result.unmatched.map((u: { council: string }) => u.council)).toEqual([
      "Nowhere 1",
      "Nowhere 2",
      "Nowhere 3",
    ]);
    expect(fake.postcodes.filter((p) => p.answers.has("mobile"))).toHaveLength(2400);
    expect(fake.mergeCalls()).toBe(1);
    // The merge cleared staging and the checkpoint together.
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-mobile")).toBeUndefined();
  });

  it("kill during the merge resumes with staging complete and re-runs the merge", async () => {
    const fake = createFakeClient();
    const rows = makeRows(1200);
    fake.setFailMergeOnce();
    await expect(runFiling(fake, rows)).rejects.toThrow(/simulated kill/);
    // The merge transaction rolled back: staging and the
    // checkpoint stand, no postcode holds a mobile answer.
    expect(fake.staged().length).toBe(1200);
    expect(fake.checkpoints.get("load-mobile")?.next_start_index).toBe(1200);
    expect(fake.postcodes.some((p) => p.answers.has("mobile"))).toBe(false);

    const { result, lines } = await runFiling(fake, rows);
    // The resumed run stages nothing — and its staging tally
    // must still finish at 3/3 chunks, not one short: the
    // last chunk was partial (200 of 500), so a floor seed
    // would have printed 2/3 here.
    expect(lines.some((l) => /progress · file 3\/3 chunks \(100%\)/.test(l))).toBe(true);
    expect(result.updated).toBe(2400);
    expect(fake.postcodes.filter((p) => p.answers.has("mobile"))).toHaveLength(2400);
    // The merge ran twice in total (once rolled back, once
    // committed) but each postcode holds one mobile answer —
    // the merge is idempotent, so the re-run cannot double-file.
    expect(fake.mergeCalls()).toBe(2);
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-mobile")).toBeUndefined();
  });

  it("a checkpoint for another edition is discarded and the run starts from zero", async () => {
    const fake = createFakeClient();
    const rows = makeRows(1200);
    fake.setFailAfterInserts(2);
    await expect(runFiling(fake, rows)).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(1000);

    // The release edition never changes between runs of the
    // same release, so simulate the new release by editing
    // the stored checkpoint's edition directly.
    const cp = fake.checkpoints.get("load-mobile");
    expect(cp).toBeDefined();
    if (!cp) throw new Error("expected a checkpoint to exist");
    fake.checkpoints.set("load-mobile", { ...cp, edition: "2099-01r9" });
    fake.setFailAfterInserts(null);
    const { result, lines } = await runFiling(fake, rows);
    expect(lines.some((l) => /discarding stale checkpoint · edition changed/.test(l))).toBe(true);
    expect(result.updated).toBe(2400);
    expect(fake.postcodes.filter((p) => p.answers.has("mobile"))).toHaveLength(2400);
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-mobile")).toBeUndefined();
  });

  it("--restart discards the checkpoint and starts from zero", async () => {
    const fake = createFakeClient();
    const rows = makeRows(1200);
    fake.setFailAfterInserts(2);
    await expect(runFiling(fake, rows)).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(1000);

    fake.setFailAfterInserts(null);
    const { result } = await runFiling(fake, rows, { restart: true });
    expect(result.updated).toBe(2400);
    expect(fake.postcodes.filter((p) => p.answers.has("mobile"))).toHaveLength(2400);
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-mobile")).toBeUndefined();
  });
});
