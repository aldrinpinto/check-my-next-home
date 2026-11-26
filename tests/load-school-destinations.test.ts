import { createReadStream, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  JOIN_FLOOR,
  KS4_SNAPSHOT,
  KS5_SNAPSHOT,
  MEASURED_RELEASE_PIN,
  PUBLICATIONS,
  SOURCE_NAME,
  bandFor,
  checkBand,
  checkGolden,
  checkReleaseAgreement,
  checkStaleness,
  collectHeadline,
  fileDestinations,
  parseCatalogue,
  parseCsvObjects,
  parsePublishedDate,
} from "../loaders/load-school-destinations.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// Guards the school destinations loader (plan step
// M6.34, decisions D51 and D65): two DfE Explore
// Education Statistics publications discovered per
// release (data-set IDs are per-release and never
// hardcoded), filed together or not at all into
// school_destinations — the D65 field set only, "low" as
// a flagged value, "c" as the suppressed state, the
// consortium URNs resolved to their combined rows, and
// the whole filing fail-closed (bands and the URN join
// floor on live filings, golden checks in both modes).
// The fixture is a real cut of the 2024/25 release
// (published 15 October 2026, cohort 2023/24) around the
// golden homes — see tests/fixtures/school-destinations/
// README.md.

const loader = readFileSync(join(process.cwd(), "loaders/load-school-destinations.mjs"), "utf8");
const runner = readFileSync(join(process.cwd(), "loaders/run-loaders.mjs"), "utf8");
const canary = readFileSync(join(process.cwd(), "loaders/canary.mjs"), "utf8");
const pkg = readFileSync(join(process.cwd(), "package.json"), "utf8");
const migration = readFileSync(
  join(process.cwd(), "db/migrations/0028_school_destinations.sql"),
  "utf8",
);
const fixtureDir = join(process.cwd(), "tests/fixtures/school-destinations");

async function collectFixture(stage: "ks4" | "ks5") {
  return collectHeadline(
    parseCsvObjects(createReadStream(join(fixtureDir, `${stage}.csv`))),
    stage,
  );
}

describe("school destinations loader — sources and registration", () => {
  it("discovers both publications by their stable publication IDs and never hardcodes a data-set ID", () => {
    expect(PUBLICATIONS.ks4.publicationId).toBe("b70e71fa-5767-4fb5-c9bf-08d82a49a1d0");
    expect(PUBLICATIONS.ks5.publicationId).toBe("657a20f6-13ef-494f-c9c0-08d82a49a1d0");
    expect(loader).not.toContain("ecbafe39-f3d4-44b2-9d0b-2e686308da1f");
    expect(loader).not.toContain("1cf3fa31-8773-484c-a5f9-5cb2d7906882");
    expect(SOURCE_NAME).toBe("Department for Education — Explore Education Statistics");
  });

  it("is registered quarterly, with its friendly names, fixture pass, npm script and canary probe", () => {
    expect(runner).toContain(
      '{ item: "load-school-destinations", cadence: "quarterly", timeoutMinutes: 30 }',
    );
    expect(runner).toContain(
      '"load-school-destinations": "School destinations — DfE leavers\' destinations"',
    );
    expect(runner).toContain('"ees-destinations": "School destinations source (canary)"');
    expect(runner).toContain(
      'await runAndLog("load-school-destinations", ["--file", fx("school-destinations")])',
    );
    expect(pkg).toContain(
      '"load:school-destinations": "node loaders/load-school-destinations.mjs"',
    );
    expect(canary).toContain("probeDestinations");
    expect(canary).toContain('await run("ees-destinations", probeDestinations)');
  });

  it("migration 0028 files the D65 field set — and no column can hold a remainder or a Russell Group figure", () => {
    expect(migration).toContain("CREATE TABLE school_destinations");
    expect(migration).toContain("PRIMARY KEY (urn, stage)");
    for (const column of [
      "cohort_year",
      "cohort_count",
      "overall",
      "education",
      "higher_education",
      "apprenticeships",
      "employment",
      "state",
      "version",
    ])
      expect(migration).toContain(column);
    // The DDL itself (the header prose names the
    // exclusions to explain them): no column for the
    // remainders, none for a national or Russell Group
    // figure, none for the KS4 education split.
    const ddl = migration.slice(migration.indexOf("CREATE TABLE")).toLowerCase();
    expect(ddl).not.toContain("notsust");
    expect(ddl).not.toContain("not_sustained");
    expect(ddl).not.toContain("unknown");
    expect(ddl).not.toContain("russell");
    expect(ddl).not.toContain("national");
    expect(ddl).not.toContain("ssf");
    expect(ddl).not.toContain("sfc");
  });
});

describe("school destinations loader — catalogue discovery", () => {
  it("reads the KS5 fixture page (the prep's real capture): the institution data set, its release and its date", () => {
    const html = readFileSync(join(fixtureDir, "catalogue-ks5.html"), "utf8");
    const found = parseCatalogue(html, PUBLICATIONS.ks5);
    expect(found.dataSetId).toBe("1cf3fa31-8773-484c-a5f9-5cb2d7906882");
    expect(found.release).toBe("Academic year 2024/25");
    expect(found.published).toBe("2026-10-15");
    expect(MEASURED_RELEASE_PIN).toEqual({
      release: "Academic year 2024/25",
      published: "2026-10-15",
      cohortYear: "2023/24",
    });
  });

  it("reads the KS4 fixture page (modelled on the KS5 page's shape): the KS4 institution data set", () => {
    const html = readFileSync(join(fixtureDir, "catalogue-ks4.html"), "utf8");
    const found = parseCatalogue(html, PUBLICATIONS.ks4);
    expect(found.dataSetId).toBe("ecbafe39-f3d4-44b2-9d0b-2e686308da1f");
    expect(found.release).toBe("Academic year 2024/25");
    expect(found.published).toBe("2026-10-15");
  });

  it("refuses when no latest data set carries the expected title, and when two do", () => {
    const html = readFileSync(join(fixtureDir, "catalogue-ks5.html"), "utf8");
    expect(() => parseCatalogue(html, PUBLICATIONS.ks4)).toThrow(/found 0 latest data sets/);
    expect(() => parseCatalogue(html + html, PUBLICATIONS.ks5)).toThrow(/found 2 latest data sets/);
    expect(() => parseCatalogue("<html></html>", PUBLICATIONS.ks5)).toThrow(/found 0/);
  });

  it("parses the catalogue's Published dates and refuses unparseable ones", () => {
    expect(parsePublishedDate("15 Oct 2026")).toBe("2026-10-15");
    expect(parsePublishedDate("3 Jan 2027")).toBe("2027-01-03");
    expect(() => parsePublishedDate("October 2026")).toThrow(/not a parseable date/);
    expect(() => parsePublishedDate("")).toThrow(/not a parseable date/);
  });
});

describe("school destinations loader — the fixture filing", () => {
  it("files 36 KS4 rows from the cut: the golden secondaries exact, Plashet absent, the suppressed witness suppressed", async () => {
    const ks4 = await collectFixture("ks4");
    expect(ks4.cohortYear).toBe("2023/24");
    expect(ks4.version).toBe("Provisional");
    expect(ks4.consortiumGroups).toBe(0);
    expect(ks4.filed).toHaveLength(36);
    const byUrn = new Map(ks4.filed.map((r) => [r.urn, r]));
    const maltings = byUrn.get("135653");
    expect(maltings?.state).toBe("served");
    expect(maltings?.cohortCount).toBe(171);
    expect(maltings?.shares.overall).toEqual({ value: 84.8, low: false });
    expect(maltings?.shares.education).toEqual({ value: 72.5, low: false });
    expect(maltings?.shares.apprenticeships).toEqual({ value: 5.3, low: false });
    expect(maltings?.shares.employment).toEqual({ value: 7.0, low: false });
    // The D65 field set only: no HE share files at KS4
    // beyond the null placeholder, and no remainder
    // exists anywhere on the record.
    expect(maltings?.shares.higher_education).toEqual({ value: null, low: false });
    expect(Object.keys(maltings?.shares ?? {}).sort()).toEqual([
      "apprenticeships",
      "education",
      "employment",
      "higher_education",
      "overall",
    ]);
    // Plashet School: filed in GIAS, no row in the
    // release — the golden absence.
    expect(byUrn.has("152267")).toBe(false);
    const suppressed = byUrn.get("105602");
    expect(suppressed?.state).toBe("suppressed");
    expect(suppressed?.cohortCount).toBe(1);
    expect(suppressed?.shares.overall).toEqual({ value: null, low: false });
  });

  it("files 39 KS5 rows from the cut: twelve consortium groups resolved, NESCOT filed, the goldens exact", async () => {
    const ks5 = await collectFixture("ks5");
    expect(ks5.cohortYear).toBe("2023/24");
    expect(ks5.version).toBe("Provisional");
    expect(ks5.consortiumGroups).toBe(12);
    expect(ks5.filed).toHaveLength(39);
    const byUrn = new Map(ks5.filed.map((r) => [r.urn, r]));
    const nescot = byUrn.get("130822");
    expect(nescot?.cohortCount).toBe(953);
    expect(nescot?.shares.overall).toEqual({ value: 70.4, low: false });
    expect(nescot?.shares.higher_education).toEqual({ value: 11.1, low: false });
    const glyn = byUrn.get("136534");
    expect(glyn?.cohortCount).toBe(253);
    expect(glyn?.shares.overall).toEqual({ value: 87.4, low: false });
    expect(glyn?.shares.higher_education).toEqual({ value: 61.7, low: false });
    // A consortium files its combined row: Harris
    // Federation Post 16's cohort is the sum of its
    // members'.
    const harris = byUrn.get("135416");
    expect(harris?.cohortCount).toBe(1112);
    // The identical-figures consortium files one row.
    const stAidans = byUrn.get("132913");
    expect(stAidans?.cohortCount).toBe(531);
    expect(stAidans?.shares.overall).toEqual({ value: 89.3, low: false });
    // The suppressed witness and New City College.
    expect(byUrn.get("106004")?.state).toBe("suppressed");
    expect(byUrn.get("130418")?.cohortCount).toBe(4007);
    // URN 130531's 'low' sits in other_edu — a column
    // the loader does not file; its served shares are
    // ordinary numbers.
    const lowRow = byUrn.get("130531");
    expect(lowRow?.state).toBe("served");
    expect(lowRow?.shares.overall.value).not.toBeNull();
  });

  it("passes the golden checks on the fixture filing (Provisional: exact)", async () => {
    const ks4 = await collectFixture("ks4");
    const ks5 = await collectFixture("ks5");
    expect(() => checkGolden([ks4, ks5])).not.toThrow();
  });

  it("the fail-closed band refuses the cut's counts — bands judge live filings only", async () => {
    const ks4 = await collectFixture("ks4");
    expect(bandFor(KS4_SNAPSHOT)).toEqual({ low: 4096, high: 5006 });
    expect(bandFor(KS5_SNAPSHOT)).toEqual({ low: 2466, high: 3014 });
    expect(() => checkBand(ks4, KS4_SNAPSHOT)).toThrow(/outside the band 4096–5006/);
    const synthetic = { stage: "ks4", filed: new Array(4551).fill(null) };
    expect(() => checkBand(synthetic as never, KS4_SNAPSHOT)).not.toThrow();
  });

  it("staleness: the 2023/24 cohort against the October 2026 publication passes; a stale pairing refuses", async () => {
    const ks4 = await collectFixture("ks4");
    expect(() => checkStaleness(ks4, "2026-10-15")).not.toThrow();
    expect(() => checkStaleness(ks4, "2020-10-15")).toThrow(/staleness failure/);
    expect(() => checkStaleness(ks4, "2030-10-15")).toThrow(/staleness failure/);
  });

  it("release agreement: mismatched dates or cohorts refuse both files", async () => {
    const ks4 = await collectFixture("ks4");
    const ks5 = await collectFixture("ks5");
    const d = { release: "Academic year 2024/25", published: "2026-10-15" };
    expect(() => checkReleaseAgreement(d, d, ks4, ks5)).not.toThrow();
    expect(() => checkReleaseAgreement(d, { ...d, published: "2026-05-28" }, ks4, ks5)).toThrow(
      /disagree on the release/,
    );
    expect(() =>
      checkReleaseAgreement(d, d, ks4, { ...ks5, period: "202425", cohortYear: "2024/25" }),
    ).toThrow(/newest cohorts disagree/);
  });
});

// ------------------------------------------------------------------
// Synthetic rows: the filing rules in miniature. The cohort is
// 2024/25 (time_period 202425) — a cohort with no measured golden
// entry, so the golden checks run structurally here.
// ------------------------------------------------------------------

function row(partial: Record<string, string>): Record<string, string> {
  return {
    time_period: "202425",
    breakdown_topic: "Total",
    breakdown: "Total",
    data_type: "Percentage",
    cohort_level_group: "Total",
    cohort_level: "Total",
    school_urn: "900001",
    cohort_count: "100",
    version: "Provisional",
    overall: "80",
    education: "60",
    he: "40",
    appren: "5",
    all_work: "15",
    ...partial,
  };
}

describe("school destinations loader — the filing rules", () => {
  it("files the newest cohort only, and only the headline cut (not the Level 3 cut, not the counts file)", async () => {
    const collection = await collectHeadline(
      [
        row({ time_period: "202324", overall: "50" }),
        row({}),
        row({ cohort_level: "Level 3", cohort_level_group: "Level 3", overall: "99" }),
        row({ data_type: "Number of students", overall: "80" }),
        row({ breakdown_topic: "Sex", breakdown: "Female", overall: "70" }),
      ],
      "ks5",
    );
    expect(collection.cohortYear).toBe("2024/25");
    expect(collection.filed).toHaveLength(1);
    expect(collection.filed[0].shares.overall).toEqual({ value: 80, low: false });
    expect(collection.filed[0].shares.higher_education).toEqual({ value: 40, low: false });
  });

  it("'low' files as a flagged null share — never a zero", async () => {
    const collection = await collectHeadline([row({ appren: "low" })], "ks5");
    expect(collection.filed[0].shares.apprenticeships).toEqual({ value: null, low: true });
    expect(collection.filed[0].state).toBe("served");
  });

  it("suppression is all-or-nothing: a fully 'c' row files suppressed with its cohort; a mixed row refuses", async () => {
    const suppressed = await collectHeadline(
      [
        row({
          cohort_count: "3",
          overall: "c",
          education: "c",
          he: "c",
          appren: "c",
          all_work: "c",
        }),
      ],
      "ks5",
    );
    expect(suppressed.filed[0].state).toBe("suppressed");
    expect(suppressed.filed[0].cohortCount).toBe(3);
    expect(suppressed.filed[0].shares.overall).toEqual({ value: null, low: false });
    await expect(collectHeadline([row({ overall: "c", education: "60" })], "ks5")).rejects.toThrow(
      /mixes suppressed/,
    );
  });

  it("any cell outside the vocabulary refuses the load", async () => {
    await expect(collectHeadline([row({ overall: "x" })], "ks5")).rejects.toThrow(
      /outside the destinations vocabulary/,
    );
    await expect(collectHeadline([row({ overall: "" })], "ks5")).rejects.toThrow(
      /outside the destinations vocabulary/,
    );
    await expect(collectHeadline([row({ overall: "101" })], "ks5")).rejects.toThrow(
      /outside the destinations vocabulary/,
    );
    await expect(collectHeadline([row({ cohort_count: "c" })], "ks5")).rejects.toThrow(
      /not a non-negative integer/,
    );
  });

  it("consortium groups: identical figures file one; the sum row files; an unresolvable group refuses", async () => {
    const identical = await collectHeadline(
      [row({ school_urn: "900002" }), row({ school_urn: "900002" })],
      "ks5",
    );
    expect(identical.filed).toHaveLength(1);
    expect(identical.consortiumGroups).toBe(1);
    const summed = await collectHeadline(
      [
        row({ school_urn: "900003", cohort_count: "60", overall: "70" }),
        row({ school_urn: "900003", cohort_count: "40", overall: "60" }),
        row({ school_urn: "900003", cohort_count: "100", overall: "66" }),
      ],
      "ks5",
    );
    expect(summed.filed).toHaveLength(1);
    expect(summed.filed[0].cohortCount).toBe(100);
    expect(summed.filed[0].shares.overall).toEqual({ value: 66, low: false });
    await expect(
      collectHeadline(
        [
          row({ school_urn: "900004", cohort_count: "60" }),
          row({ school_urn: "900004", cohort_count: "50" }),
        ],
        "ks5",
      ),
    ).rejects.toThrow(/resolve neither/);
  });

  it("a Revised filing of a measured cohort is guarded by tolerance, not exactness", async () => {
    const ks4 = await collectFixture("ks4");
    const ks5 = await collectFixture("ks5");
    const revised = { ...ks4, version: "Revised" };
    expect(() => checkGolden([revised, { ...ks5, version: "Revised" }])).not.toThrow();
    const drifted = {
      ...revised,
      filed: ks4.filed.map((r) =>
        r.urn === "135653"
          ? { ...r, shares: { ...r.shares, overall: { value: 70.0, low: false } } }
          : r,
      ),
    };
    expect(() => checkGolden([drifted as never, ks5])).toThrow(/moved more than 1 points/);
    const exact = {
      ...ks4,
      filed: ks4.filed.map((r) =>
        r.urn === "135653"
          ? { ...r, shares: { ...r.shares, overall: { value: 84.9, low: false } } }
          : r,
      ),
    };
    expect(() => checkGolden([exact as never, ks5])).toThrow(/overall 84.9, expected 84.8/);
  });

  it("the join floor is 90% of a stage's filed URNs", () => {
    expect(JOIN_FLOOR).toBe(0.9);
  });
});

// ------------------------------------------------------------------
// The filing transaction, over a fake client.
// ------------------------------------------------------------------

describe("school destinations loader — the filing transaction", () => {
  type Call = { text: string; params?: unknown[] };
  const standingRow = (stage: string, partial: Record<string, string> = {}) => ({
    stage,
    cohort_year: "2023/24",
    version: "Provisional",
    source_date: "2026-10-15",
    ...partial,
  });
  const fakeClient = ({
    standing = [] as ReturnType<typeof standingRow>[],
    staged = 2,
    filedTotal = 2,
    joined = { ks4: 1, ks5: 1 } as Record<string, number>,
  } = {}) => {
    const calls: Call[] = [];
    return {
      calls,
      async query(text: string, params?: unknown[]) {
        calls.push({ text, params });
        if (text.includes("GROUP BY stage, cohort_year, version, source_date"))
          return { rows: standing };
        if (text.includes("JOIN schools"))
          return { rows: [{ n: joined[params?.[0] as string] ?? 0 }] };
        if (text.includes("FROM school_destinations_stage") && text.includes("count(*)"))
          return { rows: [{ n: staged }] };
        if (text.includes("FROM school_destinations") && text.includes("count(*)"))
          return { rows: [{ n: filedTotal }] };
        return { rows: [] };
      },
    };
  };
  const record = (urn: string, stage: "ks4" | "ks5") => ({
    urn,
    stage,
    cohortCount: 100,
    version: "Provisional",
    state: "served",
    shares: {
      overall: { value: 80, low: false },
      education: { value: 60, low: false },
      higher_education: { value: null, low: false },
      apprenticeships: { value: 5, low: false },
      employment: { value: 15, low: false },
    },
  });
  const filing = () => ({
    published: "2026-10-15",
    collections: {
      ks4: { cohortYear: "2023/24", version: "Provisional", filed: [record("900001", "ks4")] },
      ks5: { cohortYear: "2023/24", version: "Provisional", filed: [record("900001", "ks5")] },
    },
  });

  it("stages inside one transaction, swaps, asserts counts, commits (statement order)", async () => {
    const client = fakeClient();
    const result = await fileDestinations(client as never, filing() as never, {
      enforceJoin: true,
    });
    expect(result).toEqual({ filed: true });
    const texts = client.calls.map((c) => c.text);
    expect(texts[0]).toBe("BEGIN");
    const stageAt = texts.findIndex((t) =>
      t.includes("CREATE TEMP TABLE school_destinations_stage"),
    );
    const insertStageAt = texts.findIndex((t) =>
      t.includes("INSERT INTO school_destinations_stage"),
    );
    const deleteAt = texts.findIndex((t) => t === "DELETE FROM school_destinations");
    const insertAt = texts.findIndex((t) => t.includes("INSERT INTO school_destinations ("));
    expect(stageAt).toBeGreaterThan(0);
    expect(insertStageAt).toBeGreaterThan(stageAt);
    expect(deleteAt).toBeGreaterThan(insertStageAt);
    expect(insertAt).toBeGreaterThan(deleteAt);
    expect(texts.at(-1)).toBe("COMMIT");
    expect(texts.some((t) => t === "ROLLBACK")).toBe(false);
  });

  it("an unchanged edition files nothing and says so", async () => {
    const client = fakeClient({ standing: [standingRow("ks4"), standingRow("ks5")] });
    const result = await fileDestinations(client as never, filing() as never, {
      enforceJoin: true,
    });
    expect(result).toEqual({ filed: false, reason: "edition unchanged" });
    expect(client.calls.some((c) => c.text === "DELETE FROM school_destinations")).toBe(false);
  });

  it("a Provisional pull never supersedes a filed Revised, and an older cohort never supersedes a newer", async () => {
    const revised = fakeClient({
      standing: [standingRow("ks4", { version: "Revised" }), standingRow("ks5")],
    });
    await expect(
      fileDestinations(revised as never, filing() as never, { enforceJoin: false }),
    ).rejects.toThrow(/already Revised/);
    expect(revised.calls.at(-1)?.text).toBe("ROLLBACK");
    const newer = fakeClient({
      standing: [standingRow("ks4", { cohort_year: "2024/25" }), standingRow("ks5")],
    });
    await expect(
      fileDestinations(newer as never, filing() as never, { enforceJoin: false }),
    ).rejects.toThrow(/is newer than this file's/);
    expect(newer.calls.at(-1)?.text).toBe("ROLLBACK");
  });

  it("the spring Revised supersedes the October Provisional of the same cohort", async () => {
    const client = fakeClient({ standing: [standingRow("ks4"), standingRow("ks5")] });
    const spring = filing();
    spring.collections.ks4.version = "Revised";
    spring.collections.ks5.version = "Revised";
    const result = await fileDestinations(client as never, spring as never, {
      enforceJoin: true,
    });
    expect(result).toEqual({ filed: true });
  });

  it("the join floor refuses a filing whose URNs do not join the schools table", async () => {
    // Ten rows per stage: the floor is nine joins.
    const big = filing();
    big.collections.ks4.filed = Array.from({ length: 10 }, (_, i) => record(`91000${i}`, "ks4"));
    big.collections.ks5.filed = Array.from({ length: 10 }, (_, i) => record(`91000${i}`, "ks5"));
    const client = fakeClient({
      staged: 20,
      filedTotal: 20,
      joined: { ks4: 8, ks5: 10 },
    });
    await expect(
      fileDestinations(client as never, big as never, { enforceJoin: true }),
    ).rejects.toThrow(/join failure: 8 of 10 ks4 URNs/);
    expect(client.calls.at(-1)?.text).toBe("ROLLBACK");
    // At the floor it files; and fixture mode skips the
    // floor entirely (a cut is judged by its goldens).
    const atFloor = fakeClient({
      staged: 20,
      filedTotal: 20,
      joined: { ks4: 9, ks5: 9 },
    });
    await expect(
      fileDestinations(atFloor as never, big as never, { enforceJoin: true }),
    ).resolves.toEqual({ filed: true });
    const fixtureClient = fakeClient({
      staged: 20,
      filedTotal: 20,
      joined: { ks4: 0, ks5: 0 },
    });
    await expect(
      fileDestinations(fixtureClient as never, big as never, { enforceJoin: false }),
    ).resolves.toEqual({ filed: true });
  });

  it("a short swap rolls the whole filing back", async () => {
    const client = fakeClient({ filedTotal: 1 });
    await expect(
      fileDestinations(client as never, filing() as never, { enforceJoin: false }),
    ).rejects.toThrow(/filed row count does not match/);
    expect(client.calls.at(-1)?.text).toBe("ROLLBACK");
  });
});

// ------------------------------------------------------------------
// Progress logging (BUG-265).
// ------------------------------------------------------------------
describe("progress logging (BUG-265)", () => {
  const collect = () => {
    const lines: string[] = [];
    return {
      lines,
      progress: createProgressLogger({
        name: "load-school-destinations",
        log: (line: string) => lines.push(line),
      }),
    };
  };

  it("collectHeadline logs a closing read count with the headline rows kept", async () => {
    const { lines, progress } = collect();
    const collection = await collectHeadline(
      parseCsvObjects(createReadStream(join(fixtureDir, "ks4.csv"))),
      "ks4",
      { progress },
    );
    expect(collection.filed.length).toBe(36);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/progress · read ks4 1,446 rows · 36 headline rows kept$/);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });

  it("fileDestinations logs a stage marker, the staging tally and the swap marker", async () => {
    const { lines, progress } = collect();
    const calls: { text: string; params?: unknown[] }[] = [];
    const client = {
      calls,
      async query(text: string, params?: unknown[]) {
        calls.push({ text, params });
        if (text.includes("FROM school_destinations_stage") && text.includes("count(*)"))
          return { rows: [{ n: 2 }] };
        if (text.includes("FROM school_destinations") && text.includes("count(*)"))
          return { rows: [{ n: 2 }] };
        return { rows: [] };
      },
    };
    const record = (urn: string, stage: "ks4" | "ks5") => ({
      urn,
      stage,
      cohortCount: 100,
      version: "Provisional",
      state: "served",
      shares: {
        overall: { value: 80, low: false },
        education: { value: 60, low: false },
        higher_education: { value: null, low: false },
        apprenticeships: { value: 5, low: false },
        employment: { value: 15, low: false },
      },
    });
    const filing = {
      published: "2026-10-15",
      collections: {
        ks4: { cohortYear: "2023/24", version: "Provisional", filed: [record("900001", "ks4")] },
        ks5: { cohortYear: "2023/24", version: "Provisional", filed: [record("900001", "ks5")] },
      },
    };
    const result = await fileDestinations(client as never, filing as never, {
      enforceJoin: false,
      progress,
    });
    expect(result).toEqual({ filed: true });
    expect(
      lines.some((l) =>
        /progress · staging 2 destination rows \(1 key stage 4, 1 16-19\)$/.test(l),
      ),
    ).toBe(true);
    expect(lines.some((l) => /progress · staging 1\/1 chunks \(100%\)$/.test(l))).toBe(true);
    expect(
      lines.some((l) => /progress · swap started — replacing the filed destinations$/.test(l)),
    ).toBe(true);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });
});

describe("resume (BUG-368)", () => {
  // A fake pg client: the staged rows, the live table and the
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
  type StagedRow = { urn: string; stage: string; seq: number };
  const record = (urn: string, stage: "ks4" | "ks5") => ({
    urn,
    stage,
    cohortCount: 100,
    version: "Provisional",
    state: "served",
    shares: {
      overall: { value: 80, low: false },
      education: { value: 60, low: false },
      higher_education: { value: null, low: false },
      apprenticeships: { value: 5, low: false },
      employment: { value: 15, low: false },
    },
  });
  const filing = (nPerStage = 250) => ({
    published: "2026-10-15",
    collections: {
      ks4: {
        cohortYear: "2023/24",
        version: "Provisional",
        filed: Array.from({ length: nPerStage }, (_, i) => record(`91000${i}`, "ks4")),
      },
      ks5: {
        cohortYear: "2023/24",
        version: "Provisional",
        filed: Array.from({ length: nPerStage }, (_, i) => record(`92000${i}`, "ks5")),
      },
    },
  });
  function createFakeClient() {
    let staged: StagedRow[] = [];
    let live: StagedRow[] = [];
    const checkpoints = new Map<string, CheckpointRow>();
    let insertCalls = 0;
    let failAfterInserts: number | null = null;
    let snapshot: {
      staged: StagedRow[];
      live: StagedRow[];
      checkpoints: Map<string, CheckpointRow>;
    } | null = null;
    const query = async (sql: string, params: unknown[] = []) => {
      const text = sql.replace(/\s+/g, " ");
      if (text === "BEGIN") {
        snapshot = { staged: [...staged], live: [...live], checkpoints: new Map(checkpoints) };
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
          checkpoints.clear();
          for (const [k, v] of snapshot.checkpoints) checkpoints.set(k, v);
        }
        snapshot = null;
        return { rows: [] };
      }
      if (/CREATE TABLE IF NOT EXISTS school_destinations_stage/.test(text)) return { rows: [] };
      if (/INSERT INTO school_destinations_stage/.test(text)) {
        insertCalls += 1;
        if (failAfterInserts !== null && insertCalls > failAfterInserts)
          throw new Error("simulated kill: the database connection dropped mid-insert");
        for (let r = 0; r < params.length / 19; r++) {
          const b = r * 19;
          staged.push({
            urn: params[b] as string,
            stage: params[b + 1] as string,
            seq: params[b + 18] as number,
          });
        }
        return { rows: [], rowCount: params.length / 19 };
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
      if (/DELETE FROM school_destinations_stage WHERE seq >=/.test(text)) {
        staged = staged.filter((r) => r.seq < (params[0] as number));
        return { rows: [], rowCount: 0 };
      }
      if (/DELETE FROM school_destinations_stage/.test(text)) {
        staged = [];
        return { rows: [] };
      }
      if (/GROUP BY stage, cohort_year, version, source_date/.test(text)) return { rows: [] };
      if (/SELECT count\(\*\)::int AS n FROM school_destinations_stage/.test(text))
        return { rows: [{ n: staged.length }] };
      if (/DELETE FROM school_destinations/.test(text)) {
        live = [];
        return { rows: [] };
      }
      if (/INSERT INTO school_destinations/.test(text)) {
        live = [...staged];
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n FROM school_destinations/.test(text))
        return { rows: [{ n: live.length }] };
      throw new Error(`fake client: unhandled SQL: ${sql}`);
    };
    return {
      query,
      staged: () => staged,
      live: () => live,
      checkpoints,
      setFailAfterInserts: (n: number | null) => {
        failAfterInserts = n;
      },
    };
  }
  type FakeClient = ReturnType<typeof createFakeClient>;
  async function runFiling(
    fake: FakeClient,
    f: ReturnType<typeof filing>,
    { restart = false, lines = null as string[] | null } = {},
  ) {
    const captured: string[] = lines ?? [];
    const progress = createProgressLogger({
      name: "load-school-destinations",
      log: (line: string) => captured.push(line),
    });
    const result = await fileDestinations(fake as never, f as never, {
      enforceJoin: false,
      progress,
      resume: { restart },
    });
    return { result, lines: captured };
  }

  it("kill mid-staging resumes and files every row exactly once", async () => {
    const fake = createFakeClient();
    const f = filing();
    // Kill after two 200-row chunks: 400 rows staged, the
    // checkpoint at 400, the third chunk never landed.
    const killLines: string[] = [];
    fake.setFailAfterInserts(2);
    await expect(runFiling(fake, f, { lines: killLines })).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(400);
    expect(fake.checkpoints.get("load-school-destinations")?.next_start_index).toBe(400);
    expect(
      killLines.some((l) =>
        /checkpoint 400\/500 rows \(80%\) · staged 400 · resume from 400/.test(l),
      ),
    ).toBe(true);

    fake.setFailAfterInserts(null);
    const { result, lines } = await runFiling(fake, f);
    expect(result).toEqual({ filed: true });
    expect(
      lines.some((l) =>
        /resuming from checkpoint · 400 rows staged · edition 2023\/24\/Provisional\/2026-10-15 · resume from 400/.test(
          l,
        ),
      ),
    ).toBe(true);
    expect(fake.live().length).toBe(500);
    expect(new Set(fake.live().map((r) => `${r.stage}:${r.urn}`)).size).toBe(500);
    // The swap cleared staging and the checkpoint together.
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-school-destinations")).toBeUndefined();
  });

  it("an edition change discards the staged rows and starts from zero", async () => {
    const fake = createFakeClient();
    const f = filing();
    fake.setFailAfterInserts(2);
    await expect(runFiling(fake, f)).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(400);

    // The spring Revised edition of the same cohort: a new
    // edition, so the staged Provisional rows are discarded.
    const revised = filing();
    revised.collections.ks4.version = "Revised";
    revised.collections.ks5.version = "Revised";
    fake.setFailAfterInserts(null);
    const { result } = await runFiling(fake, revised);
    expect(result).toEqual({ filed: true });
    expect(fake.live().length).toBe(500);
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-school-destinations")).toBeUndefined();
  });

  it("--restart discards the checkpoint and starts from zero", async () => {
    const fake = createFakeClient();
    const f = filing();
    fake.setFailAfterInserts(2);
    await expect(runFiling(fake, f)).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(400);

    fake.setFailAfterInserts(null);
    const { result } = await runFiling(fake, f, { restart: true });
    expect(result).toEqual({ filed: true });
    expect(fake.live().length).toBe(500);
    expect(new Set(fake.live().map((r) => `${r.stage}:${r.urn}`)).size).toBe(500);
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-school-destinations")).toBeUndefined();
  });
});
