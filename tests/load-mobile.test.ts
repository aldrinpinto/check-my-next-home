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
    // Voice is a three-operator maximum in the real file: its
    // all-operators figure is the _3 column, not a missing _4 column.
    expect(braintree?.answer.services.voice.outdoor.all_operators_pct).toBe(88.5);
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
