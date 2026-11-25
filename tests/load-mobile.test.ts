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
