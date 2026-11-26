import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { beginSchoolsFiling } from "../loaders/load-schools.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// Guards the schools loader (plan step M4.6): the register is read
// by header name in its real Windows-1252 encoding, the selective
// flag is the register's own value with blank kept as not-recorded,
// Ofsted outcomes keep the graded word, the newest event and the
// report card apart, and the fixture (real rows captured 12 Nov
// 2026) reproduces the golden facts the prep and gap check
// established. The live proof runs in CI against a real PostGIS.

const loader = readFileSync(join(process.cwd(), "loaders/load-schools.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests/fixtures/schools");

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const push = () => {
    row.push(field);
    field = "";
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") push();
    else if (ch === "\n") {
      push();
      rows.push(row);
      row = [];
    } else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length > 0) {
    push();
    rows.push(row);
  }
  const header = rows[0].map((h) => h.replace(/^﻿/, "").trim());
  return rows
    .slice(1)
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const gias = parseCsv(
  new TextDecoder("windows-1252").decode(readFileSync(join(fixtureDir, "edubase.csv"))),
);
const ofsted = parseCsv(readFileSync(join(fixtureDir, "ofsted-latest-inspections.csv"), "utf8"));
const open = gias.filter((r) => r["EstablishmentStatus (name)"] === "Open");
const ofstedByUrn = new Map(ofsted.map((r) => [r["URN"], r]));

describe("schools loader sources", () => {
  it("reads the register by header name, in Windows-1252, GET-only dated URL", () => {
    expect(loader).toContain("edubasealldata");
    expect(loader).toContain('new TextDecoder("windows-1252")');
    expect(loader).toContain('"AdmissionsPolicy (name)"');
    expect(loader).toContain('"ReligiousCharacter (name)"');
    expect(loader).toContain("EPSG:27700");
  });

  it("discovers the Ofsted file from the gov.uk page instead of hard-coding it", () => {
    expect(loader).toContain("monthly-management-information-ofsteds-school-inspections-outcomes");
    expect(loader).toContain("latest_inspections");
  });

  it("keeps blank admissions policy as not-recorded, never non-selective", () => {
    expect(loader).toContain('blank(row["AdmissionsPolicy (name)"])');
    const blanks = open.filter(
      (r) =>
        r["LA (name)"] === "Newham" &&
        r["PhaseOfEducation (name)"] === "Secondary" &&
        r["AdmissionsPolicy (name)"] === "",
    );
    expect(blanks.map((r) => r["EstablishmentName"]).sort()).toEqual([
      "Harris Science Academy East London",
      "London Design and Engineering UTC",
    ]);
  });
});

describe("fixture golden facts", () => {
  it("Newham has 17 open secondaries and zero recorded selective", () => {
    const secondaries = open.filter(
      (r) => r["LA (name)"] === "Newham" && r["PhaseOfEducation (name)"] === "Secondary",
    );
    expect(secondaries).toHaveLength(17);
    expect(secondaries.filter((r) => r["AdmissionsPolicy (name)"] === "Selective")).toHaveLength(0);
  });

  it("Lift Maltings carries both its 2023 grade and its 2026 report card", () => {
    const row = ofstedByUrn.get("135653");
    expect(row?.["Latest OEIF overall effectiveness"]).toBe("3");
    expect(row?.["Inspection start date of latest OEIF graded inspection"]).toBe("19/09/2023");
    expect(row?.["Inspection start date"]).toBe("24/03/2026");
    expect(row?.["Curriculum and teaching"]).toBe("Expected standard");
    expect(row?.["Achievement"]).toBe("Needs attention");
    expect(row?.["Safeguarding standards"]).toBe("Met");
  });

  it("no-grade schools file their ungraded outcome, not a blank", () => {
    expect(ofstedByUrn.get("114974")?.["Ungraded inspection overall outcome"]).toBe(
      "School remains Good",
    );
    const blenheim = open.find((r) => r["EstablishmentName"] === "Blenheim High School");
    expect(blenheim).toBeDefined();
    expect(ofstedByUrn.get(blenheim!["URN"])?.["Ungraded inspection overall outcome"]).toBe(
      "Standards maintained",
    );
  });

  it("the flat's nearest schools include a Catholic primary and a girls' grammar", () => {
    const stClements = open.find((r) => r["EstablishmentName"]?.includes("St Clement"));
    expect(stClements?.["ReligiousCharacter (name)"]).toBe("Roman Catholic");
    const nonsuch = open.find((r) => r["EstablishmentName"] === "Nonsuch High School for Girls");
    expect(nonsuch?.["AdmissionsPolicy (name)"]).toBe("Selective");
    expect(nonsuch?.["Gender (name)"]).toBe("Girls");
  });
});

// ------------------------------------------------------------------
// Progress logging (BUG-265): this loader's main run is not
// exported, so the wiring is pinned in its source — the
// end-to-end lines are pinned in
// tests/load-progress-bug265-d.test.ts.
// ------------------------------------------------------------------
describe("progress logging (BUG-265)", () => {
  it("creates one shared logger and logs the read, the parsed count, both filing tallies and failures", () => {
    expect(loader).toContain('createProgressLogger({ name: "load-schools" })');
    expect(loader).toContain('progress.stage("reading the GIAS register and the Ofsted file")');
    expect(loader).toContain('label: "parsed",');
    expect(loader).toContain('label: "filing",');
    expect(loader).toContain('label: "filing outcomes",');
    expect(loader).toContain("swap started — replacing the filed schools and outcomes");
    expect(loader).toContain("progress.failed({");
  });
});

describe("resume (BUG-368)", () => {
  // A fake pg client: the staged rows, the live tables and the
  // loader_checkpoint row as arrays, with just enough SQL to
  // run the filer.
  type CheckpointRow = {
    loader: string;
    edition: string;
    expected: number | null;
    next_start_index: number;
    read_count: number;
    filed_count: number;
    state: Record<string, unknown> | null;
  };
  const makeSchools = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      urn: String(100000 + i),
      name: `Test School ${i}`,
      type: "Community school",
      phase: "Primary",
      ageLow: 5,
      ageHigh: 11,
      address: "1 Test Street",
      postcode: "CM3 2JT",
      lat: 51.77,
      lng: 0.6,
      admissionsPolicy: null,
      religiousCharacter: null,
      laCode: "E08000001",
      laName: "Test LA",
      gender: "Mixed",
      sixthForm: null,
      website: null,
      numberOfPupils: 100,
      positionApproximate: false,
    }));
  const makeOutcomes = (n: number) =>
    new Map(
      Array.from({ length: n }, (_, i) => [
        String(100000 + i),
        {
          rating: "Good",
          inspectionDate: "2024-01-15",
          latestEventType: "Graded inspection",
          latestEventDate: "2024-01-15",
          ungradedOutcome: null,
          reportCard: null,
          reportUrl: null,
        },
      ]),
    );
  function createFakeClient() {
    let stagedSchools: { urn: string; seq: number }[] = [];
    let stagedOutcomes: { urn: string; seq: number }[] = [];
    let liveSchools: { urn: string; seq: number }[] = [];
    let liveOutcomes: { urn: string; seq: number }[] = [];
    const checkpoints = new Map<string, CheckpointRow>();
    let schoolInserts = 0;
    let outcomeInserts = 0;
    let failSchoolsAfter: number | null = null;
    let failOutcomesAfter: number | null = null;
    let snapshot: {
      stagedSchools: { urn: string; seq: number }[];
      stagedOutcomes: { urn: string; seq: number }[];
      liveSchools: { urn: string; seq: number }[];
      liveOutcomes: { urn: string; seq: number }[];
      checkpoints: Map<string, CheckpointRow>;
    } | null = null;
    const query = async (sql: string, params: unknown[] = []) => {
      const text = sql.replace(/\s+/g, " ");
      if (text === "BEGIN") {
        snapshot = {
          stagedSchools: [...stagedSchools],
          stagedOutcomes: [...stagedOutcomes],
          liveSchools: [...liveSchools],
          liveOutcomes: [...liveOutcomes],
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
          stagedSchools = snapshot.stagedSchools;
          stagedOutcomes = snapshot.stagedOutcomes;
          liveSchools = snapshot.liveSchools;
          liveOutcomes = snapshot.liveOutcomes;
          checkpoints.clear();
          for (const [k, v] of snapshot.checkpoints) checkpoints.set(k, v);
        }
        snapshot = null;
        return { rows: [] };
      }
      if (/CREATE TABLE IF NOT EXISTS (schools|outcomes)_stage/.test(text)) return { rows: [] };
      if (/INSERT INTO schools_stage/.test(text)) {
        schoolInserts += 1;
        if (failSchoolsAfter !== null && schoolInserts > failSchoolsAfter)
          throw new Error("simulated kill: the database connection dropped mid-insert");
        stagedSchools.push({ urn: params[0] as string, seq: params[21] as number });
        return { rows: [], rowCount: 1 };
      }
      if (/INSERT INTO outcomes_stage/.test(text)) {
        outcomeInserts += 1;
        if (failOutcomesAfter !== null && outcomeInserts > failOutcomesAfter)
          throw new Error("simulated kill: the database connection dropped mid-insert");
        stagedOutcomes.push({ urn: params[0] as string, seq: params[10] as number });
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
        const rows = /outcomes_stage/.test(text) ? stagedOutcomes : stagedSchools;
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
      if (/DELETE FROM outcomes_stage WHERE seq >=/.test(text)) {
        stagedOutcomes = stagedOutcomes.filter((r) => r.seq < (params[0] as number));
        return { rows: [], rowCount: 0 };
      }
      if (/DELETE FROM schools_stage WHERE seq >=/.test(text)) {
        stagedSchools = stagedSchools.filter((r) => r.seq < (params[0] as number));
        return { rows: [], rowCount: 0 };
      }
      if (/DELETE FROM outcomes_stage/.test(text)) {
        stagedOutcomes = [];
        return { rows: [] };
      }
      if (/DELETE FROM schools_stage/.test(text)) {
        stagedSchools = [];
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n FROM schools_stage/.test(text))
        return { rows: [{ n: stagedSchools.length }] };
      if (/SELECT count\(\*\)::int AS n FROM outcomes_stage/.test(text))
        return { rows: [{ n: stagedOutcomes.length }] };
      if (/DELETE FROM ofsted_outcomes/.test(text)) {
        liveOutcomes = [];
        return { rows: [] };
      }
      if (/DELETE FROM schools/.test(text)) {
        liveSchools = [];
        return { rows: [] };
      }
      if (/INSERT INTO schools/.test(text)) {
        liveSchools = [...stagedSchools];
        return { rows: [] };
      }
      if (/INSERT INTO ofsted_outcomes/.test(text)) {
        liveOutcomes = [...stagedOutcomes];
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n FROM schools/.test(text))
        return { rows: [{ n: liveSchools.length }] };
      throw new Error(`fake client: unhandled SQL: ${sql}`);
    };
    return {
      query,
      stagedSchools: () => stagedSchools,
      stagedOutcomes: () => stagedOutcomes,
      liveSchools: () => liveSchools,
      liveOutcomes: () => liveOutcomes,
      checkpoints,
      setFailSchoolsAfter: (n: number | null) => {
        failSchoolsAfter = n;
      },
      setFailOutcomesAfter: (n: number | null) => {
        failOutcomesAfter = n;
      },
    };
  }
  type FakeClient = ReturnType<typeof createFakeClient>;
  const EDITION = "2026-11-12/2026-10-31";
  async function runFiling(
    fake: FakeClient,
    schools: ReturnType<typeof makeSchools>,
    outcomes: ReturnType<typeof makeOutcomes>,
    { restart = false, lines = null as string[] | null } = {},
  ) {
    const captured: string[] = lines ?? [];
    const progress = createProgressLogger({
      name: "load-schools",
      log: (line: string) => captured.push(line),
    });
    const filer = await beginSchoolsFiling(progress, {
      client: fake as never,
      restart,
      giasEdition: "2026-11-12",
      ofstedAsAt: "2026-10-31",
    });
    await filer.prepareResume(EDITION, schools.length, outcomes.size);
    await filer.stageSchools(schools as never);
    await filer.stageOutcomes(outcomes as never);
    return { filer, lines: captured };
  }

  it("kill mid-schools resumes and files every school and outcome exactly once", async () => {
    const fake = createFakeClient();
    const schools = makeSchools(450);
    const outcomes = makeOutcomes(300);
    // Kill after 250 school inserts: checkpoints at 200, the
    // 50-row tail past it staged but uncheckpointed.
    fake.setFailSchoolsAfter(250);
    await expect(runFiling(fake, schools, outcomes)).rejects.toThrow(/simulated kill/);
    expect(fake.stagedSchools().length).toBe(250);
    expect(fake.checkpoints.get("load-schools")?.filed_count).toBe(200);

    fake.setFailSchoolsAfter(null);
    const { filer, lines } = await runFiling(fake, schools, outcomes);
    expect(filer.stagedCount()).toBe(750);
    expect(
      lines.some((l) =>
        /resuming from checkpoint · 200 rows staged · edition 2026-11-12\/2026-10-31 · resume from 200/.test(
          l,
        ),
      ),
    ).toBe(true);
    await filer.finishFiling(schools.length, outcomes.size);
    expect(fake.liveSchools().map((r) => r.urn)).toEqual(schools.map((s) => s.urn));
    expect(fake.liveOutcomes().map((r) => r.urn)).toEqual([...outcomes.keys()]);
    expect(fake.stagedSchools().length).toBe(0);
    expect(fake.stagedOutcomes().length).toBe(0);
    expect(fake.checkpoints.get("load-schools")).toBeUndefined();
    expect(filer.resumeNote()).toBe("the start (nothing staged yet)");
  });

  it("kill mid-outcomes resumes from the outcomes checkpoint, trimming the tail", async () => {
    const fake = createFakeClient();
    const schools = makeSchools(450);
    const outcomes = makeOutcomes(300);
    // Kill after 250 outcome inserts: all 450 schools staged
    // and checkpointed, outcomes checkpointed at 200, the
    // 50-row tail staged but uncheckpointed.
    fake.setFailOutcomesAfter(250);
    await expect(runFiling(fake, schools, outcomes)).rejects.toThrow(/simulated kill/);
    expect(fake.stagedSchools().length).toBe(450);
    expect(fake.stagedOutcomes().length).toBe(250);
    expect(fake.checkpoints.get("load-schools")?.state).toMatchObject({ outcomesFiled: 200 });

    fake.setFailOutcomesAfter(null);
    const { filer } = await runFiling(fake, schools, outcomes);
    expect(filer.stagedCount()).toBe(750);
    await filer.finishFiling(schools.length, outcomes.size);
    expect(fake.liveSchools().map((r) => r.urn)).toEqual(schools.map((s) => s.urn));
    expect(fake.liveOutcomes().map((r) => r.urn)).toEqual([...outcomes.keys()]);
    expect(fake.stagedOutcomes().length).toBe(0);
    expect(fake.checkpoints.get("load-schools")).toBeUndefined();
  });

  it("an edition change discards the staged rows and starts from zero", async () => {
    const fake = createFakeClient();
    const schools = makeSchools(450);
    const outcomes = makeOutcomes(300);
    fake.setFailSchoolsAfter(250);
    await expect(runFiling(fake, schools, outcomes)).rejects.toThrow(/simulated kill/);
    expect(fake.stagedSchools().length).toBe(250);

    const progress = createProgressLogger({ name: "load-schools", log: () => {} });
    const filer = await beginSchoolsFiling(progress, {
      client: fake as never,
      giasEdition: "2026-11-12",
      ofstedAsAt: "2026-10-31",
    });
    const prep = await filer.prepareResume("2099-01-01/2099-01-01", schools.length, outcomes.size);
    expect(prep.resumed).toBe(false);
    expect(fake.stagedSchools().length).toBe(0);
    expect(fake.checkpoints.get("load-schools")).toBeUndefined();
  });

  it("--restart discards the checkpoint and starts from zero", async () => {
    const fake = createFakeClient();
    const schools = makeSchools(450);
    const outcomes = makeOutcomes(300);
    fake.setFailSchoolsAfter(250);
    await expect(runFiling(fake, schools, outcomes)).rejects.toThrow(/simulated kill/);
    expect(fake.stagedSchools().length).toBe(250);

    fake.setFailSchoolsAfter(null);
    const { filer } = await runFiling(fake, schools, outcomes, { restart: true });
    expect(filer.stagedCount()).toBe(750);
    await filer.finishFiling(schools.length, outcomes.size);
    expect(fake.liveSchools().map((r) => r.urn)).toEqual(schools.map((s) => s.urn));
    expect(fake.stagedSchools().length).toBe(0);
    expect(fake.checkpoints.get("load-schools")).toBeUndefined();
  });
});
