import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSettings, beginFiling } from "../loaders/load-nurseries.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// Guards the nurseries loader (plan step M5.17): the Ofsted
// childcare register is discovered from the GOV.UK page by its
// dated asset name and read by header name past its preamble
// rows; only group settings file — "Childcare on non-domestic
// premises" in the Full day care and Sessional day care subtypes
// — while childminder-type rows never file (decision D5),
// domestic-premises rows (published REDACTED by Ofsted) never
// file, and out-of-school and blank-subtype rows stay out of a
// category the brain serves as nurseries. The fixture is real
// rows captured from the 30 June 2026 register file, and its
// golden facts reproduce the first filed load's figures.

const loader = readFileSync(join(process.cwd(), "loaders/load-nurseries.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests/fixtures/nurseries");

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const push = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    push();
    rows.push(row);
    row = [];
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
    else if (ch === "\n") endRow();
    else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length > 0) endRow();
  const headerAt = rows.findIndex((r) => r[1] === "Provider URN" && r[3] === "Provider type");
  const header = rows[headerAt].map((h) => h.replace(/^﻿/, "").trim());
  return rows
    .slice(headerAt + 1)
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const records = parseCsv(readFileSync(join(fixtureDir, "providers.csv"), "utf8"));
const postcodes = JSON.parse(readFileSync(join(fixtureDir, "postcodes.json"), "utf8")) as Record<
  string,
  { lat: number; lng: number }
>;
const GROUP = "Childcare on non-domestic premises";
const filedClass = records.filter(
  (r) =>
    r["Provider type"] === GROUP &&
    r["Provider status"] === "Active" &&
    (r["Provider subtype"] === "Full day care" || r["Provider subtype"] === "Sessional day care") &&
    r["Provider Early Years Register flag"] === "Y",
);

function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 3956;
  const r = Math.PI / 180;
  const h =
    Math.sin(((bLat - aLat) * r) / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLng - aLng) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const HOMES = {
  "CM3 2JT": { lat: 51.776176, lng: 0.60387 },
  "E16 1GN": { lat: 51.515224, lng: 0.021177 },
  "KT17 1FH": { lat: 51.344571, lng: -0.247104 },
};

describe("nurseries loader sources", () => {
  it("discovers the provider-data CSV from the GOV.UK page by its dated asset name", () => {
    expect(loader).toContain("childcare-providers-and-inspections-management-information");
    expect(loader).toContain("childcare_providers_data_as_at");
    expect(loader).toContain("as_at_(\\d{1,2})_([A-Za-z]+)_(\\d{4})");
  });

  it("reads the register by header name, past the preamble rows, with the as-at date as its stamp", () => {
    expect(loader).toContain('"Provider URN"');
    expect(loader).toContain('"Provider subtype"');
    expect(loader).toContain('r[1] === "Provider URN"');
    expect(loader).toContain("Ofsted childcare register (management information)");
  });

  it("files group settings only: the non-domestic type in the two nursery subtypes, on the Early Years Register (BUG-240)", () => {
    expect(loader).toContain('const GROUP_TYPE = "Childcare on non-domestic premises"');
    expect(loader).toContain('"Full day care"');
    expect(loader).toContain('"Sessional day care"');
    expect(loader).toContain('"Out-of-school day care"');
    expect(loader).toContain('"Provider Early Years Register flag"');
    expect(loader).toContain("notOnEarlyYearsRegister");
  });

  it("keeps childminders and the redacted domestic rows out by named class (D5)", () => {
    expect(loader).toContain('"Childminder"');
    expect(loader).toContain('"Home childcarer"');
    expect(loader).toContain('"Childminder without domestic premises"');
    expect(loader).toContain('const DOMESTIC_TYPE = "Childcare on domestic premises"');
  });

  it("takes no positional arguments and refuses any it does not recognise — nothing is silently dropped", () => {
    expect(loader).toContain("unrecognised argument");
    expect(loader).not.toContain("GOLDEN_POSTCODES");
  });

  it("positions settings from the postcode directory and counts the unresolved, never guessing", () => {
    expect(loader).toContain("FROM postcode_cache WHERE latitude IS NOT NULL");
    expect(loader).toContain("unresolvedPostcode");
  });
});

describe("nurseries fixture — real rows from the register as at 30 June 2026", () => {
  it("holds the exclusion classes the loader must never file, one row each", () => {
    const count = (type: string, subtype?: string) =>
      records.filter(
        (r) =>
          r["Provider type"] === type &&
          (subtype === undefined || r["Provider subtype"] === subtype),
      ).length;
    expect(count("Childminder")).toBe(1);
    expect(count("Home childcarer")).toBe(1);
    expect(count("Childcare on domestic premises")).toBe(1);
    expect(count(GROUP, "Out-of-school day care")).toBe(1);
    expect(count(GROUP, "")).toBe(1);
    // The childminder and domestic rows are REDACTED in the
    // published file itself — no name, no postcode to file.
    for (const r of records.filter((r) => r["Provider type"] !== GROUP)) {
      expect(r["Provider name"]).toBe("REDACTED");
      expect(r["Provider postcode"]).toBe("REDACTED");
    }
  });

  it("files 296 group settings, every one positioned by the fixture's postcode list", () => {
    expect(filedClass).toHaveLength(296);
    for (const r of filedClass) {
      expect(postcodes[r["Provider postcode"].toUpperCase()]).toBeDefined();
    }
    expect(new Set(filedClass.map((r) => r["Provider URN"])).size).toBe(296);
  });

  it("the Early Years Register rule drops only voluntary-register care, never a nursery (BUG-240)", () => {
    // 40 of the 336 subtype-filed rows are off the EYR —
    // every one a voluntary-register-only provider for
    // activity, tutoring or holiday care, not a nursery.
    const offEyr = records.filter(
      (r) =>
        r["Provider type"] === GROUP &&
        r["Provider status"] === "Active" &&
        (r["Provider subtype"] === "Full day care" ||
          r["Provider subtype"] === "Sessional day care") &&
        r["Provider Early Years Register flag"] !== "Y",
    );
    expect(offEyr).toHaveLength(40);
    for (const r of offEyr) {
      expect(r["Provider Voluntary Childcare Register flag"]).toBe("Y");
    }
    // The sample's own case: the maths tutor listed
    // under Nurseries is VCR-only, never EYR.
    const pearl = records.find(
      (r) => r["Provider name"] === "Maths Tutoring By Pearl Lily And Co Accountants",
    );
    expect(pearl?.["Provider Early Years Register flag"]).toBe("N");
    expect(pearl?.["Provider Voluntary Childcare Register flag"]).toBe("Y");
    expect(filedClass.some((r) => r["Provider name"].includes("Pearl Lily"))).toBe(false);
    // No dropped name is a day nursery or pre-school.
    for (const r of offEyr) {
      expect(r["Provider name"]).not.toMatch(/Day Nursery|Pre-School|Pre-school|Nursery School/i);
    }
  });

  it("reproduces the golden facts the first filed load locked", () => {
    const positioned = filedClass.map((r) => ({
      name: r["Provider name"],
      ...postcodes[r["Provider postcode"].toUpperCase()],
    }));
    const goldens = {
      "CM3 2JT": {
        nearest: "Shining Stars",
        miles: 0.11,
        count: 5,
        top3: ["Shining Stars", "The Little Bears Nursery", "Gershwin Park Day Nursery School"],
      },
      "E16 1GN": {
        nearest: "Cribs Day Nursery",
        miles: 0.088,
        count: 81,
        top3: ["Cribs Day Nursery", "Moksliukas", "Clever Cloggs Day Nursery"],
      },
      "KT17 1FH": {
        nearest: "Nestots Day Nursery",
        miles: 0.174,
        count: 35,
        top3: [
          "Nestots Day Nursery",
          "Lynton House Day Nursery",
          "Little Nick Nursery and Pre-School",
        ],
      },
    } as const;
    for (const [pc, golden] of Object.entries(goldens)) {
      const home = HOMES[pc as keyof typeof HOMES];
      const measured = positioned
        .map((s) => ({ s, miles: haversineMiles(home.lat, home.lng, s.lat, s.lng) }))
        .sort((a, b) => a.miles - b.miles || a.s.name.localeCompare(b.s.name));
      const within = measured.filter((m) => m.miles <= 2);
      expect(within[0].s.name).toBe(golden.nearest);
      expect(Math.round(within[0].miles * 1000) / 1000).toBe(golden.miles);
      expect(within).toHaveLength(golden.count);
      expect(within.slice(0, 3).map((m) => m.s.name)).toEqual([...golden.top3]);
    }
  });
});

// BUG-265: the register scan carries the shared progress
// logger — a tally every 5,000 rows against the file's own
// row count (a closing line only at fixture scale).
describe("progress logging (BUG-265)", () => {
  it("scans the fixture with a closing build line, and the settings are unchanged", () => {
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-nurseries",
      log: (...args: unknown[]) => lines.push(args.join(" ")),
    });
    const positionOf = (pc: string) => postcodes[(pc ?? "").trim().toUpperCase()] ?? null;
    const { settings, stats } = buildSettings(records, positionOf, { progress });
    expect(settings).toHaveLength(296);
    expect(stats.total).toBe(341);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/progress · build 341\/341 rows \(100%\)$/);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });
});

// BUG-368: the filing resumes instead of restarting — the
// build re-runs whole and deterministic, the staging loop
// skips the settings the checkpoint already covers.
describe("resume (BUG-368)", () => {
  // 2,501 synthetic group settings: past two 1,000-setting
  // checkpoints, with a tail. Every one is positioned by the
  // fixture's postcode list, cycled so no single postcode
  // carries the whole run.
  const postcodeKeys = Object.keys(postcodes);
  const settingRecord = (i: number): Record<string, string> => ({
    "Provider URN": `EY${String(i).padStart(6, "0")}`,
    "Provider type": "Childcare on non-domestic premises",
    "Provider subtype": "Full day care",
    "Provider status": "Active",
    "Provider name": `Nursery EY${String(i).padStart(6, "0")}`,
    "Provider Early Years Register flag": "Y",
    "Provider address line 1": "1 Test Street",
    "Provider address line 2": "",
    "Provider address line 3": "",
    "Provider town": "Testville",
    "Provider postcode": postcodeKeys[i % postcodeKeys.length],
  });
  const { settings } = buildSettings(
    Array.from({ length: 2501 }, (_, i) => settingRecord(i)),
    (pc: string) => postcodes[(pc ?? "").trim().toUpperCase()] ?? null,
  );
  const EDITION = "2026-06-30";

  // A fake pg client: the staged rows, the live table and the
  // loader_checkpoint row as arrays, with just enough SQL to
  // run the filer.
  type StagedRow = { urn: string; seq: number };
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
      if (/CREATE TABLE IF NOT EXISTS nurseries_stage/.test(text)) return { rows: [] };
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
      if (/DELETE FROM nurseries_stage WHERE seq >=/.test(text)) {
        const before = staged.length;
        staged = staged.filter((r) => r.seq < (params[0] as number));
        return { rows: [], rowCount: before - staged.length };
      }
      if (text === "DELETE FROM nurseries_stage") {
        staged = [];
        return { rows: [] };
      }
      if (/INSERT INTO nurseries_stage/.test(text)) {
        insertCalls += 1;
        if (failAfterInserts !== null && insertCalls > failAfterInserts)
          throw new Error("simulated kill: the database connection dropped mid-insert");
        staged.push({ urn: params[0] as string, seq: params[9] as number });
        return { rows: [], rowCount: 1 };
      }
      if (/SELECT count\(\*\)::int AS n FROM nurseries_stage/.test(text))
        return { rows: [{ n: staged.length }] };
      if (/DELETE FROM nurseries/.test(text)) {
        live = [];
        return { rows: [] };
      }
      if (/INSERT INTO nurseries/.test(text)) {
        live = [...staged].sort((a, b) => a.seq - b.seq);
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n FROM nurseries/.test(text))
        return { rows: [{ n: live.length }] };
      throw new Error(`fake client: unhandled SQL: ${sql}`);
    };
    return {
      query,
      staged: () => staged,
      liveUrns: () => live.map((r) => r.urn),
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
      name: "load-nurseries",
      log: (line: string) => captured.push(line),
    });
    const filer = await beginFiling(progress, { client: fake as never, restart });
    await filer.prepareResume(EDITION, settings.length);
    await filer.stageSettings(settings, EDITION);
    return { filer, lines: captured };
  }

  it("builds 2,501 synthetic settings to file", () => {
    expect(settings).toHaveLength(2501);
    expect(new Set(settings.map((s) => s.urn)).size).toBe(2501);
  });

  it(
    "kill mid-filing resumes and files every setting exactly once",
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
      expect(fake.checkpoints.get("load-nurseries")?.next_start_index).toBe(1000);
      expect(
        killLines.some((l) =>
          /checkpoint 1,000\/2,501 settings \(40%\) · staged 1,000 · resume from 1,000/.test(l),
        ),
      ).toBe(true);

      fake.setFailAfterInserts(null);
      const { filer, lines } = await runLoad(fake);
      expect(
        lines.some((l) =>
          /resuming from checkpoint · 1,000 rows staged · edition 2026-06-30 · resume from 1,000/.test(
            l,
          ),
        ),
      ).toBe(true);
      expect(
        lines.some((l) =>
          /checkpoint 2,501\/2,501 settings \(100%\) · staged 2,501 · resume from 2,501/.test(l),
        ),
      ).toBe(true);
      await filer.finishFiling(settings);
      expect(fake.liveUrns()).toHaveLength(2501);
      expect(new Set(fake.liveUrns()).size).toBe(2501);
      expect(fake.liveUrns().sort()).toEqual(settings.map((s) => s.urn).sort());
      // The swap cleared staging and the checkpoint together.
      expect(fake.staged().length).toBe(0);
      expect(fake.checkpoints.get("load-nurseries")).toBeUndefined();
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

      const progress = createProgressLogger({ name: "load-nurseries", log: () => {} });
      const filer = await beginFiling(progress, { client: fake as never });
      const prep = await filer.prepareResume("2026-12-31", settings.length);
      expect(prep.resumed).toBe(false);
      expect(fake.staged().length).toBe(0);
      expect(fake.checkpoints.get("load-nurseries")).toBeUndefined();
      // The fresh start files the whole read.
      fake.setFailAfterInserts(null);
      await filer.stageSettings(settings, "2026-12-31");
      await filer.finishFiling(settings);
      expect(fake.liveUrns()).toHaveLength(2501);
      expect(new Set(fake.liveUrns()).size).toBe(2501);
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
    await filer.finishFiling(settings);
    expect(fake.liveUrns()).toHaveLength(2501);
    expect(new Set(fake.liveUrns()).size).toBe(2501);
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-nurseries")).toBeUndefined();
  });
});
