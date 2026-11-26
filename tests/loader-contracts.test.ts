// Loader contracts — the universal pre-push guard for filing SQL.
//
// Three CI failures taught the same lesson in a row. CI 98/99
// (M5.6): the nearby-places filers created their ON COMMIT DROP
// stage table before BEGIN — outside a transaction the CREATE is
// its own commit, so the stage dropped itself and the first
// staged insert failed — and, once that was fixed, their final
// INSERTs named the position columns lat/lon where migration
// 0001 defines latitude/longitude. CI 101/102 (M5.7): the EV
// filer had been written earlier and carried the same pre-BEGIN
// stage create. Every one of those defects was invisible to the
// local unit tests of the day (the sandbox proofs were
// verify-only; the fake pools recorded statement shape, not
// names), and each fix armoured only the loader that had failed.
//
// This suite is the armour, generalised: it discovers every
// loader registered in loaders/run-loaders.mjs — the set grows
// on its own when a loader is added — and checks, for each one,
// with no database and no network:
//
//   (a) SCHEMA CONTRACT — every live table a loader INSERTs
//       into exists in the migrations, every inserted column
//       exists in that table's DDL (CREATE TABLE plus every
//       ALTER ... ADD COLUMN, in file order), and no inserted
//       column is a generated one (id, geom, any GENERATED
//       ALWAYS) — the database owns those.
//   (b) STATEMENT ORDER — wherever a loader creates a temp
//       stage table ON COMMIT DROP, the BEGIN query is issued
//       before the create inside the same top-level function.
//       This is a textual order check on the function body,
//       honestly labelled: it pins the shape every filer in
//       this codebase follows (BEGIN is the filer's first
//       statement). The per-loader fake-pool tests remain the
//       gold standard for new loaders; this check exists so a
//       pre-BEGIN create can never again reach CI unarmoured,
//       including in a loader whose own tests forgot to pin it.
//   (c) REGISTRY COHERENCE — every registered loader has a
//       loader file, a FRIENDLY_NAMES entry (the plain-English
//       name the run summaries and the alert email use), and a
//       fixture invocation in the runner whose fixture
//       directory exists under tests/fixtures/ — or a named
//       exception below, with its reason.
//
// It runs as part of `npm test`, and therefore as part of
// `npm run prepush` — the local gate that mirrors CI. A red
// here is a CI database job saved.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "db", "migrations");
const LOADERS_DIR = join(ROOT, "loaders");
const FIXTURES_DIR = join(ROOT, "tests", "fixtures");
const RUNNER_PATH = join(LOADERS_DIR, "run-loaders.mjs");

// --- the exceptions -------------------------------------------------
//
// A loader with no live-table INSERT of its own. Both of these
// file by merging their answers into postcode_cache.answers
// (UPDATE postcode_cache SET answers = answers || $1::jsonb) —
// they insert no rows. The per-loader check below also asserts
// that UPDATE pattern is still present, so an entry here cannot
// quietly become a hiding place for a loader that files nothing.
const NO_LIVE_INSERT: Record<string, string> = {
  "load-crime":
    "files by merging crime counts into postcode_cache.answers (UPDATE ... SET answers); inserts no rows of its own",
  "load-epc":
    "files by merging EPC answers into postcode_cache.answers (UPDATE ... SET answers); inserts no rows of its own",
  "load-broadband":
    "files by merging Ofcom broadband answers into postcode_cache.answers (UPDATE ... SET answers); inserts no rows of its own",
  "load-mobile":
    "files by merging Ofcom mobile answers into postcode_cache.answers (UPDATE ... SET answers); inserts no rows of its own",
};

// A registered loader with no fixture invocation in the runner.
// Empty today: every registered loader runs against a fixture
// in the runner's fixture pass. A future entry needs its reason
// written here, in words, or the coherence check fails.
const FIXTURE_LESS: Record<string, string> = {};

// --- DDL, parsed from the migrations --------------------------------

type TableDdl = { columns: Set<string>; generated: Set<string> };

function stripSqlComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      const at = line.indexOf("--");
      return at === -1 ? line : line.slice(0, at);
    })
    .join("\n");
}

// The body of the parenthesised list opening at openIdx, walked
// paren-aware (column definitions carry their own parens —
// geometry(Point, 4326), the generated geom CASE).
function parenBody(sql: string, openIdx: number): string {
  let depth = 0;
  for (let i = openIdx; i < sql.length; i++) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")") {
      depth--;
      if (depth === 0) return sql.slice(openIdx + 1, i);
    }
  }
  return "";
}

function topLevelParts(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim() !== "") parts.push(cur);
  return parts;
}

const CONSTRAINT_HEADS = /^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN)$/i;

function buildDdl(): Map<string, TableDdl> {
  const tables = new Map<string, TableDdl>();
  for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
    if (!file.endsWith(".sql")) continue;
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    for (const create of sql.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)\s*\(/g)) {
      const ddl: TableDdl = { columns: new Set(), generated: new Set() };
      const body = parenBody(sql, sql.indexOf("(", create.index));
      for (const part of topLevelParts(body)) {
        const def = part.trim();
        const name = def.split(/\s+/)[0];
        if (!name || CONSTRAINT_HEADS.test(name)) continue;
        ddl.columns.add(name);
        if (/GENERATED\s+ALWAYS/i.test(def)) ddl.generated.add(name);
      }
      tables.set(create[1], ddl);
    }
    for (const alter of sql.matchAll(/ALTER TABLE\s+(\w+)\s+([\s\S]*?);/g)) {
      const ddl = tables.get(alter[1]);
      if (!ddl) continue;
      for (const add of alter[2].matchAll(/ADD COLUMN\s+(?:IF NOT EXISTS\s+)?(\w+)/g)) {
        ddl.columns.add(add[1]);
      }
    }
  }
  return tables;
}

// --- loader source extraction ----------------------------------------

type Insert = { table: string; columns: string[] };

function stageTables(source: string): Set<string> {
  return new Set([...source.matchAll(/CREATE TEMP TABLE\s+(\w+)/g)].map((m) => m[1]));
}

function inserts(source: string): Insert[] {
  return [...source.matchAll(/INSERT INTO\s+(\w+)\s*\(([^)]*)\)/gi)].map((m) => ({
    table: m[1],
    columns: m[2].split(",").map((c) => c.trim()),
  }));
}

function insertProblems(id: string, ddl: Map<string, TableDdl>, live: Insert[]): string[] {
  const problems: string[] = [];
  for (const ins of live) {
    const table = ddl.get(ins.table);
    if (!table) {
      problems.push(`${id}: INSERT INTO ${ins.table} — no such table in the migrations`);
      continue;
    }
    for (const col of ins.columns) {
      if (!table.columns.has(col))
        problems.push(
          `${id}: INSERT INTO ${ins.table} names column "${col}", which the migration DDL does not define`,
        );
      else if (table.generated.has(col))
        problems.push(
          `${id}: INSERT INTO ${ins.table} targets generated column "${col}" — the database owns it`,
        );
    }
  }
  return problems;
}

// Temp stage creates that carry ON COMMIT DROP — the ones whose
// survival depends on an open transaction.
function onCommitDropCreates(source: string): { name: string; index: number }[] {
  const found: { name: string; index: number }[] = [];
  for (const m of source.matchAll(/CREATE TEMP TABLE\s+(\w+)/g)) {
    const end = Math.min(
      ...[source.indexOf("`", m.index), source.indexOf(";", m.index), m.index + 4000].filter(
        (n) => n > m.index,
      ),
    );
    if (/ON COMMIT DROP/.test(source.slice(m.index, end)))
      found.push({ name: m[1], index: m.index });
  }
  return found;
}

// True when a query("BEGIN") is issued between the start of the
// top-level function enclosing the create at createIndex and the
// create itself. Top-level declarations are the column-0
// function/const forms every filer in this codebase uses;
// indented inner helpers do not shrink the window. If a future
// filer opens its transaction through some other shape, this
// returns false and the failure message says where to look —
// extending the guard beats silently passing.
function beginBeforeCreate(source: string, createIndex: number): boolean {
  const declRe =
    /^(?:export\s+)?(?:async\s+)?function\s+[\w$]+\s*\(|^(?:export\s+)?const\s+[\w$]+\s*=\s*(?:async\s*)?\(/gm;
  let declStart = -1;
  for (const m of source.matchAll(declRe)) {
    if (m.index >= createIndex) break;
    declStart = m.index;
  }
  if (declStart === -1) return false;
  return /query\(\s*["'`]BEGIN["'`]\s*\)/.test(source.slice(declStart, createIndex));
}

// --- the registry, discovered from the runner -------------------------

function discoverRegistry(): {
  friendly: Set<string>;
  fixtures: Map<string, string>;
  registered: string[];
} {
  const runner = readFileSync(RUNNER_PATH, "utf8");
  const span = runner.slice(runner.indexOf("FRIENDLY_NAMES"));
  const friendly = new Set(
    [...span.slice(0, span.indexOf("};")).matchAll(/"([\w-]+)"\s*:/g)]
      .map((m) => m[1])
      .filter((k) => k.startsWith("load-")),
  );
  const fixtures = new Map(
    [
      ...runner.matchAll(
        /runAndLog\(\s*"(load-[\w-]+)"\s*,\s*\[\s*"--file"\s*,\s*fx\("([\w-]+)"\)/g,
      ),
    ].map((m) => [m[1], m[2]] as const),
  );
  const registered = [...new Set([...friendly, ...fixtures.keys()])].sort();
  return { friendly, fixtures, registered };
}

const ddl = buildDdl();
const { friendly, fixtures, registered } = discoverRegistry();
const sources = new Map(
  registered.map((id) => [id, readFileSync(join(LOADERS_DIR, `${id}.mjs`), "utf8")] as const),
);

// --- sanity: the guard can see what it claims to guard ----------------

describe("loader contracts — the guard's own sight", () => {
  it("the DDL parser finds the migrated tables, ALTER additions included", () => {
    expect(ddl.size).toBeGreaterThanOrEqual(23);
    // Migration 0010's ALTER, not the 0001 CREATE, adds these two.
    expect(ddl.get("ev_points")?.columns.has("operator")).toBe(true);
    expect(ddl.get("ev_points")?.columns.has("detail")).toBe(true);
    // Migration 0002's ADD COLUMN IF NOT EXISTS form.
    expect(ddl.get("postcode_cache")?.columns.has("msoa_code")).toBe(true);
    // Generated columns are recognised as the database's own.
    expect(ddl.get("ev_points")?.generated.has("id")).toBe(true);
    expect(ddl.get("ev_points")?.generated.has("geom")).toBe(true);
  });

  it("registry discovery finds every loader the runner knows", () => {
    expect(registered.length).toBeGreaterThanOrEqual(18);
    expect(registered).toContain("load-postcodes");
    expect(registered).toContain("load-ev-chargers");
  });

  it("stage-create discovery finds the ON COMMIT DROP creates across the loaders", () => {
    let total = 0;
    for (const source of sources.values()) total += onCommitDropCreates(source).length;
    // BUG-368: most stage tables are persistent now, so the
    // TEMP creates are down to the seven that remain — census
    // (out of scope), the dual-mode loaders' non-resume path
    // (council-tax, imd, lsoa-bases, mobile, pvgis,
    // school-destinations). The floor tracks that count; a
    // future conversion lowers it again.
    expect(total).toBeGreaterThanOrEqual(7);
  });

  it("the schema check bites: a column the DDL does not define is reported", () => {
    const problems = insertProblems("synthetic", ddl, [
      { table: "ev_points", columns: ["registry_id", "lat"] },
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('"lat"');
    const generated = insertProblems("synthetic", ddl, [{ table: "ev_points", columns: ["geom"] }]);
    expect(generated).toHaveLength(1);
    expect(generated[0]).toContain("generated");
  });

  it("the order check bites: a create before BEGIN is reported, after BEGIN is not", () => {
    const buggy = [
      "export async function fileSynthetic(pool) {",
      "  await client.query(`CREATE TEMP TABLE s_stage (a text) ON COMMIT DROP`);",
      '  await client.query("BEGIN");',
      "}",
    ].join("\n");
    const createAt = buggy.indexOf("CREATE TEMP TABLE");
    expect(beginBeforeCreate(buggy, createAt)).toBe(false);
    const fixed = [
      "export async function fileSynthetic(pool) {",
      '  await client.query("BEGIN");',
      "  await client.query(`CREATE TEMP TABLE s_stage (a text) ON COMMIT DROP`);",
      "}",
    ].join("\n");
    expect(beginBeforeCreate(fixed, fixed.indexOf("CREATE TEMP TABLE"))).toBe(true);
  });
});

// --- per-loader contracts ----------------------------------------------

for (const id of registered) {
  const source = sources.get(id)!;

  describe(`loader contracts — ${id}`, () => {
    it("(a) schema contract: every live INSERT names only columns the migrations define", () => {
      const stages = stageTables(source);
      const all = inserts(source);
      const live = all.filter((ins) => !stages.has(ins.table));
      if (live.length === 0) {
        // No live INSERT is a contract only when it is the
        // documented answers-merge pattern — anything else
        // means the extractor is blind for this loader, which
        // is itself a failure.
        expect(
          NO_LIVE_INSERT[id],
          `${id} files no live-table INSERT and is not a named NO_LIVE_INSERT exception`,
        ).toBeTruthy();
        expect(source).toMatch(/UPDATE postcode_cache SET answers/);
        return;
      }
      expect(insertProblems(id, ddl, live)).toEqual([]);
    });

    it("(b) statement order: BEGIN precedes every ON COMMIT DROP stage create", () => {
      const creates = onCommitDropCreates(source);
      for (const create of creates) {
        expect(
          beginBeforeCreate(source, create.index),
          `${id}: CREATE TEMP TABLE ${create.name} ... ON COMMIT DROP is not preceded by a ` +
            `query("BEGIN") inside its enclosing function — outside a transaction the stage ` +
            `drops itself at the end of its own CREATE (CI 98/101). If this filer opens its ` +
            `transaction in a new shape, extend beginBeforeCreate in tests/loader-contracts.test.ts.`,
        ).toBe(true);
      }
    });

    it("(c) registry coherence: friendly name, loader file and fixture all present", () => {
      expect(
        friendly.has(id),
        `${id} has no FRIENDLY_NAMES entry in run-loaders.mjs — run summaries and the alert email would have no plain-English name for it`,
      ).toBe(true);
      expect(existsSync(join(LOADERS_DIR, `${id}.mjs`))).toBe(true);
      const fixtureDir = fixtures.get(id);
      if (!fixtureDir) {
        expect(
          FIXTURE_LESS[id],
          `${id} has no fixture invocation in the runner's fixture pass and is not a named FIXTURE_LESS exception`,
        ).toBeTruthy();
        return;
      }
      const dir = join(FIXTURES_DIR, fixtureDir);
      expect(
        existsSync(dir) && statSync(dir).isDirectory(),
        `${id}: fixture directory tests/fixtures/${fixtureDir} does not exist`,
      ).toBe(true);
    });
  });
}
