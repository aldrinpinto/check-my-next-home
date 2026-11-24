import { spawn } from "node:child_process";
import { mkdtemp, open, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DISK_FREE_WARN_GB,
  HEARTBEAT_EVERY_BATCHES,
  HEARTBEAT_EVERY_MS,
  RSS_WARN_MB,
  SLOW_BATCH_FACTOR,
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
} from "../loaders/progress.mjs";
import { readFixture } from "../loaders/load-flood-zones.mjs";
import { postioVerdict } from "../loaders/canary-postio.mjs";
import { pickingIndexVerdict } from "../loaders/canary-picking-index.mjs";

// BUG-204: the shared progress helper every loader now
// writes through, and the property the whole fix stands
// on — the lines land in the log WHILE the work runs,
// not buffered to the end.

const collect = () => {
  const lines: string[] = [];
  return {
    lines,
    log: (line: string) => lines.push(line),
  };
};

describe("formatCount", () => {
  it("groups thousands en-GB", () => {
    expect(formatCount(12001)).toBe("12,001");
    expect(formatCount(1000000)).toBe("1,000,000");
    expect(formatCount(0)).toBe("0");
  });
});

describe("the progress line format", () => {
  it("is a timestamp, the loader name, the progress token, then the message", () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-flood-zones", log });
    progress.stage("swap started — filing 463 staged features into the live table");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z load-flood-zones progress · swap started — filing 463 staged features into the live table$/,
    );
  });

  it("formats the streets swap count with thousands separators (BUG-227)", () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-streets", log });
    progress.stage(
      `swap started — filing ${formatCount(3_100_000)} staged street lines into the live table`,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /progress · swap started — filing 3,100,000 staged street lines into the live table$/,
    );
    expect(lines[0]).not.toMatch(/filing 3100000 /);
  });

  it("never starts with the loader name, so the runner keeps the summary line", () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-broadband", log });
    progress.stage("sweep started — 1,726,966 postcodes carry the broadband key");
    progress.count({ label: "merge", done: 25, total: 100, unit: "chunks" });
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });

  it("counts done/total with a percentage where the total is known", () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-sold-prices", log });
    progress.count({ label: "intake", done: 2000000, unit: "lines" });
    progress.count({ label: "merge", done: 25, total: 100, unit: "chunks" });
    progress.count({
      label: "sweep",
      done: 3,
      total: 3,
      unit: "batches",
      extra: "1 stale key removed",
    });
    progress.count({
      label: "sweep",
      done: 3,
      total: 3,
      unit: "batches",
      extra: "2 stale keys removed",
    });
    expect(lines[0]).toMatch(/progress · intake 2,000,000 lines$/);
    expect(lines[0]).not.toContain("%");
    expect(lines[1]).toMatch(/progress · merge 25\/100 chunks \(25%\)$/);
    expect(lines[2]).toMatch(/progress · sweep 3\/3 batches \(100%\) · 1 stale key removed$/);
    expect(lines[3]).toMatch(/progress · sweep 3\/3 batches \(100%\) · 2 stale keys removed$/);
  });

  it("clamps the percentage at 100 when done overshoots the total", () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-broadband", log });
    progress.count({ label: "merge", done: 101, total: 100, unit: "chunks" });
    expect(lines[0]).toMatch(/merge 101\/100 chunks \(100%\)$/);
  });
});

describe("the tally", () => {
  it("emits only when done crosses the next multiple of every, and finish always closes", () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-flood-zones", log });
    const tally = progress.tally({ label: "read", total: 100, every: 10, unit: "features" });
    for (let done = 1; done <= 25; done++) tally.tick(done);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/progress · read 10\/100 features \(10%\)$/);
    expect(lines[1]).toMatch(/progress · read 20\/100 features \(20%\)$/);
    tally.finish(25);
    expect(lines).toHaveLength(3);
    expect(lines[2]).toMatch(/progress · read 25\/100 features \(25%\)$/);
    // A finish at a number the last tick already said stays silent.
    tally.tick(30);
    expect(lines).toHaveLength(4);
    tally.finish(30);
    expect(lines).toHaveLength(4);
  });

  it("finish emits even when no tick ever fired", () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-broadband", log });
    const tally = progress.tally({ label: "merge", total: 3, every: 25, unit: "chunks" });
    tally.tick(1);
    tally.tick(2);
    expect(lines).toHaveLength(0);
    tally.finish(3);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/progress · merge 3\/3 chunks \(100%\)$/);
  });

  it("refuses a non-positive or non-integer every", () => {
    const progress = createProgressLogger({ name: "load-broadband", log: () => {} });
    expect(() => progress.tally({ label: "read", every: 0 })).toThrow(
      /"every" must be a positive integer/,
    );
    expect(() => progress.tally({ label: "read", every: 2.5 })).toThrow(
      /"every" must be a positive integer/,
    );
  });
});

describe("mid-run flushing (BUG-204)", () => {
  it(
    "a progress line is already in the log file while the process is still running",
    { timeout: 30_000 },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "cmnh-progress-"));
      const driverPath = join(dir, "driver.mjs");
      const logPath = join(dir, "run.log");
      // A stand-in long loader: the real helper, a tally
      // ticked once every 200 ms for ten ticks — two seconds
      // of work, with the first line due after ~400 ms.
      await writeFile(
        driverPath,
        `import { createProgressLogger } from ${JSON.stringify(join(process.cwd(), "loaders/progress.mjs"))};\n` +
          `const progress = createProgressLogger({ name: "load-flood-zones" });\n` +
          `const tally = progress.tally({ label: "read", total: 10, every: 2, unit: "pages" });\n` +
          `for (let i = 1; i <= 10; i++) {\n` +
          `  await new Promise((r) => setTimeout(r, 200));\n` +
          `  tally.tick(i);\n` +
          `}\n` +
          `tally.finish(10);\n` +
          `console.log("load-flood-zones · done");\n`,
      );
      const handle = await open(logPath, "w");
      const child = spawn(process.execPath, [driverPath], {
        stdio: ["ignore", handle.fd, "pipe"],
      });
      try {
        // Poll the file, not the pipe: the proof is that a
        // line is in the log file while the loader runs.
        let sawLineWhileRunning = false;
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline) {
          const text = await readFile(logPath, "utf8");
          if (/progress · read 2\/10 pages \(20%\)/.test(text) && child.exitCode === null) {
            sawLineWhileRunning = true;
            break;
          }
          if (child.exitCode !== null) break;
          await new Promise((r) => setTimeout(r, 100));
        }
        expect(sawLineWhileRunning).toBe(true);
        const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
        expect(code).toBe(0);
        const text = await readFile(logPath, "utf8");
        expect(text).toMatch(/progress · read 10\/10 pages \(100%\)$/m);
        expect(text).toMatch(/^load-flood-zones · done$/m);
      } finally {
        if (child.exitCode === null) child.kill();
        await handle.close();
      }
    },
  );
});

describe("flood fixture progress (BUG-204)", () => {
  it("emits one line per fixture part, and the read is unchanged", async () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-flood-zones", log });
    const processed = await readFixture(join(process.cwd(), "tests/fixtures/flood-zones"), {
      progress,
    });
    expect(processed.read).toBe(463);
    expect(processed.filed).toBe(463);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/progress · fixture 1\/4 parts \(25%\) · \d+ features read$/);
    expect(lines[3]).toMatch(/progress · fixture 4\/4 parts \(100%\) · 463 features read$/);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });
});

// BUG-228: every other raw count in the BUG-204 progress/log
// lines now goes through formatCount — the flood five, the
// streets and sold-prices summaries, the EPC/picking log
// lines, and the flood-defences summary. These pins render
// the exact line templates the loaders emit (the same shape
// as the BUG-227 streets pin) at thousands scale, and assert
// the raw unformatted form never appears.
describe("formatted loader counts (BUG-228)", () => {
  it("formats the flood filing stage line", () => {
    const line = `filing ${formatCount(141_373)} features — counts, validity repair and swap`;
    expect(line).toBe("filing 141,373 features — counts, validity repair and swap");
    expect(line).not.toMatch(/filing 141373 /);
  });

  it("formats the flood summary counts and the invalid-geometries count", () => {
    const perLabel = { High: 12_001, Medium: 34_002, Low: 45_003, "Very low": 50_367 };
    const labels = Object.entries(perLabel)
      .map(([label, n]) => `${label} ${formatCount(n)}`)
      .join(" · ");
    const line =
      `load-flood-rivers-sea · edition 2026-11-12 · ${formatCount(141_373)} features filed ` +
      `(${formatCount(141_373)} read · ${labels} · ${formatCount(0)} without geometry counted)`;
    expect(line).toContain("141,373 features filed (141,373 read");
    expect(line).toContain("High 12,001 · Medium 34,002 · Low 45,003 · Very low 50,367");
    expect(line).not.toMatch(/141373 features filed/);
    const filed = `${line} · ${formatCount(1_234)} invalid geometries made valid · golden homes OK`;
    expect(filed).toContain("1,234 invalid geometries made valid");
    expect(filed).not.toMatch(/1234 invalid geometries/);
  });

  it("formats the streets per-country and final lines", () => {
    const staged = `load-streets · england: ${formatCount(1_200_000)} highway ways read, ${formatCount(3_100_000)} street lines staged`;
    expect(staged).toContain("1,200,000 highway ways read, 3,100,000 street lines staged");
    expect(staged).not.toMatch(/1200000 highway ways/);
    expect(staged).not.toMatch(/3100000 street lines staged/);
    const filed = `load-streets · ${formatCount(3_100_000)} street lines filed (england + scotland + wales) — golden homes OK`;
    expect(filed).toContain("3,100,000 street lines filed");
    expect(filed).not.toMatch(/3100000 street lines filed/);
    const area = `load-streets · ${formatCount(123_456)} street lines filed for area -1,50,1,51 (${formatCount(78_901)} highway ways read) — golden homes OK`;
    expect(area).toContain("123,456 street lines filed for area");
    expect(area).toContain("(78,901 highway ways read)");
    expect(area).not.toMatch(/123456 street lines filed/);
  });

  it("formats the sold-prices national and monthly lines", () => {
    const national =
      `load-sold-prices · edition 2026-11-01 · national pass · ${formatCount(31_200_000)} sales filed · ` +
      `${formatCount(48_210)} update rows merged · ${formatCount(1_234)} malformed skipped · ` +
      `${formatCount(1_234_567)} no-sale postcodes stamped · ${formatCount(31_700_000)} full-file lines read · golden homes OK`;
    expect(national).toContain("31,200,000 sales filed");
    expect(national).toContain("1,234,567 no-sale postcodes stamped");
    expect(national).not.toMatch(/31200000 sales filed/);
    const monthly =
      `load-sold-prices · edition 2026-11-01 · monthly update · ${formatCount(48_210)} sales added or corrected · ` +
      `${formatCount(312)} deleted · ${formatCount(1_234)} malformed skipped`;
    expect(monthly).toContain("48,210 sales added or corrected");
    expect(monthly).not.toMatch(/48210 sales added/);
  });

  it("formats the EPC and picking log lines", () => {
    const epc =
      `Picking index (EPC parts) — edition 2026-11-01: ${formatCount(2_500_000)} certificates read, ` +
      `${formatCount(1_234)} refused by the strict parser.`;
    expect(epc).toContain("2,500,000 certificates read, 1,234 refused");
    expect(epc).not.toMatch(/2500000 certificates read/);
    const filed =
      `Filed: ${formatCount(1_461_522)} distinct postcodes, ${formatCount(25_108_628)} distinct homes, ` +
      `${formatCount(123_456)} distinct streets-with-town.`;
    expect(filed).toContain("1,461,522 distinct postcodes, 25,108,628 distinct homes");
    expect(filed).not.toMatch(/25108628 distinct homes/);
    const sales =
      `Picking index (sales parts) — edition 2026-11-01: ${formatCount(31_200_000)} transactions read, ` +
      `${formatCount(1_234)} malformed lines skipped, ${formatCount(567)} rows without a usable postcode or address skipped.`;
    expect(sales).toContain("31,200,000 transactions read");
    expect(sales).not.toMatch(/31200000 transactions read/);
  });

  it("formats the flood-defences summary counts", () => {
    const line =
      `load-flood-defences · edition 2026-11-13 · ${formatCount(141_373)} features filed ` +
      `(${formatCount(1_234)} invalid lines filed as published) — golden homes OK`;
    expect(line).toContain("141,373 features filed (1,234 invalid lines filed as published)");
    expect(line).not.toMatch(/141373 features filed/);
  });
});

describe("flood fixture progress at thousands scale (BUG-228)", () => {
  it("formats the running feature count through the real readFixture", async () => {
    const dir = await mkdtemp(join(tmpdir(), "flood-zones-1234-"));
    await writeFile(join(dir, "fixture.json"), JSON.stringify({ edition: "synthetic-test" }));
    const features = Array.from({ length: 1_234 }, (_, i) => ({
      type: "Feature",
      properties: { flood_zone: "FZ3", flood_source: "river", origin: `synthetic-${i}` },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [0, 1],
            [1, 1],
            [1, 0],
            [0, 0],
          ],
        ],
      },
    }));
    await writeFile(
      join(dir, "flood-zones.geojson"),
      JSON.stringify({ type: "FeatureCollection", features }),
    );
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-flood-zones", log });
    const processed = await readFixture(dir, { progress });
    expect(processed.read).toBe(1_234);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/progress · fixture 1\/1 parts \(100%\) · 1,234 features read$/);
    expect(lines[0]).not.toMatch(/1234 features read/);
  });
});

// BUG-231: the same defect as BUG-228 in every OTHER loader's
// printed summary line — the BUG-204 progress lines were
// already formatted, but the loaders' own summary() /
// summaryLine() builders and the canary log lines still
// printed raw counts. Every changed line now goes through
// formatCount (or the file's existing toLocaleString
// convention, where one was already used consistently).
// These pins render the exact line templates the loaders
// emit at thousands scale, and assert the raw unformatted
// form never appears. The summaryLine builders are not
// exported, so those pins are render-form only; the two
// exported canary verdict functions get real call-site pins.
describe("formatted loader summary counts (BUG-231)", () => {
  it("formats the aqma filed and per-nation counts", () => {
    const nationSummary = Object.entries({ E: 12_345, S: 1_234, W: 2_345 })
      .map(
        ([letter, n]) => `${{ E: "England", S: "Scotland", W: "Wales" }[letter]} ${formatCount(n)}`,
      )
      .join(" · ");
    const line = `load-aqma · UK-AIR · edition 2026-11-01 · ${formatCount(15_924)} areas filed (${nationSummary})`;
    expect(line).toContain("15,924 areas filed (England 12,345 · Scotland 1,234 · Wales 2,345)");
    expect(line).not.toMatch(/15924 areas filed/);
    expect(line).not.toMatch(/England 12345/);
  });

  it("formats the brownfield, built-up-areas, green-belt and priority-habitats summaries", () => {
    const brownfield =
      `load-brownfield · planning.data.gov.uk file retrieved 2026-11-01 · ` +
      `${formatCount(12_345)} sites filed (${formatCount(11_234)} current of ${formatCount(12_345)} in file · ${formatCount(1_111)} ended excluded · ${formatCount(0)} without a point counted · ${formatCount(234)} duplicates dropped · ${formatCount(56)} same-site records collapsed) · ` +
      `supplier gate: ${formatCount(1_234)} organisations with current sites`;
    expect(brownfield).toContain("12,345 sites filed (11,234 current of 12,345 in file");
    expect(brownfield).toContain("supplier gate: 1,234 organisations");
    expect(brownfield).not.toMatch(/12345 sites filed/);
    const bua =
      `load-built-up-areas · ONS Built Up Areas (December 2024) Boundaries EW BGG (V2) · ` +
      `${formatCount(12_345)} areas filed (${formatCount(12_345)} features in file · ${formatCount(1_234)} without geometry counted) · ` +
      `golden points inside Hatfield Peverel, Newham and Ewell`;
    expect(bua).toContain(
      "12,345 areas filed (12,345 features in file · 1,234 without geometry counted)",
    );
    expect(bua).not.toMatch(/12345 areas filed/);
    const greenBelt =
      `load-green-belt · planning.data.gov.uk file retrieved 2026-11-01 · ` +
      `${formatCount(12_345)} pieces filed (${formatCount(11_111)} current of ${formatCount(12_345)} in file · ${formatCount(1_234)} ended excluded · ${formatCount(0)} without geometry counted · ${formatCount(234)} duplicates dropped) · ` +
      `named by the belt (green-belt-core), never by district`;
    expect(greenBelt).toContain("12,345 pieces filed (11,111 current of 12,345 in file");
    expect(greenBelt).not.toMatch(/12345 pieces filed/);
    const phi =
      `load-priority-habitats · Natural England · Priority Habitat Inventory 2026-11 (2026-11-01) · ` +
      `${formatCount(12_345)} patches filed (${formatCount(12_345)} read · ${formatCount(1_234)} without geometry counted · ${formatCount(234)} duplicate UIDs dropped)`;
    expect(phi).toContain("12,345 patches filed (12,345 read · 1,234 without geometry counted");
    expect(phi).not.toMatch(/12345 patches filed/);
  });

  it("formats the census, lsoa-bases and claimant-count summary lines", () => {
    const census = `load-census · 7 datasets · ${formatCount(12_345)} areas filed (counts only; Census Day 21 March 2021)`;
    expect(census).toContain("12,345 areas filed");
    expect(census).not.toMatch(/12345 areas filed/);
    const lsoa = `load-lsoa-bases · 2 census totals (TS021 residents, TS054 households) · ${formatCount(12_345)} areas filed (Census Day 21 March 2021)`;
    expect(lsoa).toContain("12,345 areas filed");
    expect(lsoa).not.toMatch(/12345 areas filed/);
    const claimant =
      `load-claimant-count · Claimant Count (count + published % of residents aged 16–64) · ` +
      `${formatCount(12_345)} area-months filed for 2025-10 and 2025-11`;
    expect(claimant).toContain("12,345 area-months filed");
    expect(claimant).not.toMatch(/12345 area-months/);
  });

  it("formats the charging-zones filed count", () => {
    const line = `load-charging-zones · ${formatCount(1_234)} schemes filed (no schemes pending)`;
    expect(line).toContain("1,234 schemes filed");
    expect(line).not.toMatch(/1234 schemes filed/);
  });

  it("formats the company-ownership totals, snapshots, rejects and postcode drops", () => {
    const rejectNote = `${formatCount(1_234)} CCOD row(s) rejected by name (Acme Ltd)`;
    const line =
      `load-company-ownership · HM Land Registry company ownership (CCOD/OCOD) + Companies House snapshots · ` +
      `${formatCount(12_345)} company-owned titles filed (${formatCount(11_111)} CCOD, ${formatCount(1_234)} OCOD) · ` +
      `${formatCount(11_111)} snapshots filed of ${formatCount(11_111)} filed company numbers · ` +
      `missing snapshots: ${formatCount(1_234)} titles carry no company number, ${formatCount(234)} numbers not in the Companies House snapshot` +
      ` · ${formatCount(1_234)} postcodes not in UK form (filed as no-postcode)` +
      ` · ${rejectNote}`;
    expect(line).toContain("12,345 company-owned titles filed (11,111 CCOD, 1,234 OCOD)");
    expect(line).toContain("1,234 postcodes not in UK form");
    expect(line).toContain("1,234 CCOD row(s) rejected by name");
    expect(line).not.toMatch(/12345 company-owned titles/);
  });

  it("formats the council-tax authorities and not-yet-filed counts", () => {
    const line = `${formatCount(12_345)} authorities filed for 2026-27 (${formatCount(11_111)} England, ${formatCount(1_234)} Wales); ${formatCount(234)} further authorities parsed but not yet filed — their state is "not published" until the spring pass`;
    expect(line).toContain(
      "12,345 authorities filed for 2026-27 (11,111 England, 1,234 Wales); 234 further authorities",
    );
    expect(line).not.toMatch(/12345 authorities filed/);
  });

  it("formats the crime per-postcode totals", () => {
    const line =
      `load-crime · latest month 2026-10 · window 2025-11..2026-10 · ` +
      `CM3 2JT ${formatCount(1_234)} crimes · E16 1GN ${formatCount(12_345)} crimes`;
    expect(line).toContain("CM3 2JT 1,234 crimes · E16 1GN 12,345 crimes");
    expect(line).not.toMatch(/E16 1GN 12345 crimes/);
  });

  it("formats the crime-national window total, months, new counts and embedded artefacts", () => {
    const windowTotal: number | null = 12_345_678;
    const line = `load-crime-national · latest month 2026-10 · window 2025-11..2026-10 · England 12-month total ${windowTotal === null ? "not yet countable" : formatCount(windowTotal)} · ${formatCount(12)} of ${formatCount(12)} months on file (${formatCount(1_234)} new) · ${formatCount(1_234)} artefacts embedded · 12s`;
    expect(line).toContain("England 12-month total 12,345,678");
    expect(line).toContain("(1,234 new) · 1,234 artefacts embedded");
    expect(line).not.toMatch(/total 12345678/);
    const uncountable: number | null = null;
    const uncountedLine = `England 12-month total ${uncountable === null ? "not yet countable" : formatCount(uncountable)}`;
    expect(uncountedLine).toContain("not yet countable");
  });

  it("formats the dwp-uc summaryLine and stats.summary counts", () => {
    const bits = ["people", "households"]
      .map((series) => `${series}: ${formatCount(12_345)} areas for 2025-10, 2025-11`)
      .join(" · ");
    const line = `load-dwp-uc · Universal Credit (people + households, as published by DWP) · ${bits} · filed`;
    expect(line).toContain("people: 12,345 areas");
    expect(line).toContain("households: 12,345 areas");
    expect(line).not.toMatch(/people: 12345 areas/);
  });

  it("formats the epc certificate and skipped counts", () => {
    const line = `load-epc · CM3 2JT ${formatCount(12_345)} certificates (${formatCount(1_234)} withdrawn on the register, skipped) · E16 1GN ${formatCount(2_345)} certificates`;
    expect(line).toContain(
      "CM3 2JT 12,345 certificates (1,234 withdrawn on the register, skipped)",
    );
    expect(line).not.toMatch(/CM3 2JT 12345 certificates/);
  });

  it("formats the ev-chargers by-class values and all counts", () => {
    const byClass = (obj: Record<string, number>) =>
      Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${formatCount(v)} ${k}`)
        .join(", ");
    const line =
      `${formatCount(12_345)} charging sites filed ` +
      `(${formatCount(11_111)} chargers recorded at them, ${formatCount(1_234)} records grouped into their site; ` +
      `read ${formatCount(12_345)} · excluded ${formatCount(1_234)} by access class (${byClass({ public: 1_234, private: 234 })}) · ${formatCount(234)} in Northern Ireland · ${formatCount(56)} with no position)`;
    expect(line).toContain(
      "12,345 charging sites filed (11,111 chargers recorded at them, 1,234 records grouped",
    );
    expect(line).toContain("1,234 by access class (1,234 public, 234 private)");
    expect(line).not.toMatch(/12345 charging sites/);
  });

  it("formats the health template counts", () => {
    const line =
      `load-health · ODS 2026-11-01 · CQC directory 2026-11-01 · ratings as at 2026-11-01 · ` +
      `${formatCount(12_345)} practices · ${formatCount(1_234)} branches ` +
      `(${formatCount(234)} closed-by-date removed, ${formatCount(56)} COVID-named removed) · ` +
      `${formatCount(2_345)} pharmacies · ${formatCount(1_234)} dentists · ${formatCount(345)} hospitals ` +
      `(${formatCount(123)} carrying the Maternity group) · ` +
      `${formatCount(12_345)} ratings joined · ${formatCount(234)} same-day ties withheld · ${formatCount(1_234)} excluded non-practices · ` +
      `${formatCount(56)} CLINIC-named practices filed for review · ${formatCount(1_234)} without a directory position skipped`;
    expect(line).toContain("12,345 practices · 1,234 branches (234 closed-by-date removed");
    expect(line).toContain("12,345 ratings joined · 234 same-day ties withheld");
    expect(line).not.toMatch(/12345 practices/);
  });

  it("formats the heritage listed-building, monument, layer and park counts", () => {
    const line =
      `load-heritage · planning.data.gov.uk files retrieved 2026-11-01 (source of record: Historic England, NHLE) · ` +
      `listed buildings: ${formatCount(12_345)} filed (${formatCount(11_111)} current of ${formatCount(12_345)} in file · ${formatCount(1_234)} ended excluded · ${formatCount(234)} without a point counted · ${formatCount(56)} outside the grade vocabulary quarantined · ${formatCount(78)} duplicates dropped) · ` +
      `scheduled monuments: ${formatCount(12_345)} filed (${formatCount(11_111)} current of ${formatCount(12_345)} in file · ${formatCount(1_234)} ended excluded · ${formatCount(234)} without geometry counted · ${formatCount(78)} duplicates dropped)` +
      ` · parks-gardens: ${formatCount(1_234)} filed (${formatCount(1_111)} current of ${formatCount(1_234)} in file · ${formatCount(123)} ended excluded · ${formatCount(45)} without geometry counted · ${formatCount(67)} duplicates dropped)`;
    expect(line).toContain("listed buildings: 12,345 filed (11,111 current of 12,345 in file");
    expect(line).toContain("scheduled monuments: 12,345 filed (11,111 current of 12,345 in file");
    expect(line).toContain("parks-gardens: 1,234 filed");
    expect(line).not.toMatch(/listed buildings: 12345 filed/);
  });

  it("formats the mobile, noise and postcodes counts in the files' own toLocaleString convention", () => {
    const mobile = `load-mobile · Connected Nations 2026-11 · ${(12_345).toLocaleString("en-GB")} authorities`;
    expect(mobile).toContain("12,345 authorities");
    expect(mobile).not.toMatch(/12345 authorities/);
    const unmatched = ` — WARNING: ${(1_234).toLocaleString("en-GB")} councils matched no authority (Test Council ${(12_345).toLocaleString("en-GB")})`;
    expect(unmatched).toContain("1,234 councils matched no authority (Test Council 12,345)");
    expect(unmatched).not.toMatch(/1234 councils matched/);
    const noise = `load-noise · Defra Round 4 · ${(12_345).toLocaleString("en-GB")} rows from /tmp/noise filed — golden homes OK`;
    expect(noise).toContain("12,345 rows from");
    expect(noise).not.toMatch(/12345 rows from/);
    const postcodes =
      `load-postcodes · edition 2026-11-01 (2026-11-01) · ${(1_234_567).toLocaleString("en-GB")} live postcodes filed · ` +
      `${(12_345).toLocaleString("en-GB")} terminated skipped · ${(1_234).toLocaleString("en-GB")} without coordinates skipped · ${(234).toLocaleString("en-GB")} duplicates ignored · ` +
      `postcode_cache ${(1_234_567).toLocaleString("en-GB")} → ${(1_234_567).toLocaleString("en-GB")} rows · golden homes OK · 12s`;
    expect(postcodes).toContain("1,234,567 live postcodes filed");
    expect(postcodes).toContain("1,234 without coordinates skipped · 234 duplicates ignored");
    expect(postcodes).not.toMatch(/1234567 live postcodes/);
  });

  it("formats the nature-designations counts and geo notes", () => {
    const geoNote = (n: number) => (n > 0 ? ` · ${formatCount(n)} without geometry counted` : "");
    const line =
      `load-nature-designations · Natural England ArcGIS services · ` +
      `SSSI: ${formatCount(12_345)} features filed · ${formatCount(1_234)} sites (${formatCount(12_345)} read${geoNote(1_234)}) · ` +
      `SAC: ${formatCount(1_234)} designated features filed · ${formatCount(234)} designated sites (${formatCount(1_234)} read · ${formatCount(56)} candidate features excluded${geoNote(78)}) · ` +
      `SPA: ${formatCount(1_234)} features filed · ${formatCount(234)} sites (${formatCount(1_234)} read${geoNote(0)}) · ` +
      `Ramsar: ${formatCount(1_234)} features filed · ${formatCount(234)} sites (${formatCount(1_234)} read${geoNote(0)}) · ` +
      `ancient woodland: ${formatCount(12_345)} filed (${formatCount(11_111)} in the original inventory · ${formatCount(12_345)} in the revised inventory · ${formatCount(1_234)} originals replaced by the revision${geoNote(234)})`;
    expect(line).toContain(
      "SSSI: 12,345 features filed · 1,234 sites (12,345 read · 1,234 without geometry counted)",
    );
    expect(line).toContain("ancient woodland: 12,345 filed (11,111 in the original inventory");
    expect(line).not.toMatch(/SSSI: 12345 features/);
  });

  it("formats the nurseries summary counts", () => {
    const line =
      `load-nurseries · Ofsted childcare register as at 2026-11-01 · ${formatCount(12_345)} group settings filed ` +
      `(${formatCount(11_111)} full day care, ${formatCount(1_234)} sessional day care) · ` +
      `of ${formatCount(12_345)} register rows: ${formatCount(1_234)} childminder-type never filed, ` +
      `${formatCount(234)} on domestic premises (published redacted, never filed), ` +
      `${formatCount(345)} out-of-school day care not filed, ${formatCount(456)} blank subtype not filed, ` +
      `${formatCount(567)} other subtype not filed, ${formatCount(678)} not active, ${formatCount(789)} other type, ` +
      `${formatCount(12)} duplicate URNs, ${formatCount(1_234)} unresolved postcodes not filed`;
    expect(line).toContain(
      "12,345 group settings filed (11,111 full day care, 1,234 sessional day care)",
    );
    expect(line).toContain("of 12,345 register rows: 1,234 childminder-type never filed");
    expect(line).not.toMatch(/12345 group settings filed/);
  });

  it("formats the os-greenspace read, filed and mix counts", () => {
    const mix = ["Play Area", "Playing Field"].map((f) => `${f} ${formatCount(1_234)}`).join(" · ");
    const line = `load-os-greenspace · ${formatCount(12_345)} points filed (${formatCount(1_234)} centres · ${formatCount(11_111)} access; ${mix}; version 2026-11 · md5 abc) — golden homes OK`;
    expect(line).toContain(
      "12,345 points filed (1,234 centres · 11,111 access; Play Area 1,234 · Playing Field 1,234",
    );
    expect(line).not.toMatch(/12345 points filed/);
    const verifyOnly = `load-os-greenspace · read ${formatCount(12_345)} sites and ${formatCount(11_111)} access points — would file ${formatCount(12_345)} points (${formatCount(1_234)} centres · ${formatCount(11_111)} access; ${mix}; version 2026-11 · md5 abc) — golden homes OK (verify-only: nothing filed)`;
    expect(verifyOnly).toContain(
      "read 12,345 sites and 11,111 access points — would file 12,345 points",
    );
    expect(verifyOnly).not.toMatch(/read 12345 sites/);
  });

  it("formats the osm-places per-country, fixture, by-type and dropped counts", () => {
    const perCountry = [
      `england ${formatCount(1_234_567)}`,
      `scotland ${formatCount(234_567)}`,
    ].join(" · ");
    const byType = ["town", "village"].map((t) => `${t} ${formatCount(12_345)}`).join(" · ");
    const line = `load-osm-places · ${perCountry} — would file ${formatCount(12_345)} places (${byType}; ${formatCount(1_234)} repeat elements and ${formatCount(234)} duplicate places dropped) — golden homes OK (verify-only: nothing filed)`;
    expect(line).toContain("england 1,234,567 · scotland 234,567 — would file 12,345 places");
    expect(line).toContain("1,234 repeat elements and 234 duplicate places dropped");
    expect(line).not.toMatch(/would file 12345 places/);
    const fixture = `fixture captures ${formatCount(12_345)} elements`;
    expect(fixture).toBe("fixture captures 12,345 elements");
    expect(fixture).not.toMatch(/captures 12345 elements/);
  });

  it("formats the planning-areas conservation, article-4 and gate counts", () => {
    const line =
      `load-planning-areas · planning.data.gov.uk files retrieved 2026-11-01 · ` +
      `conservation areas: ${formatCount(12_345)} filed (${formatCount(11_111)} current of ${formatCount(12_345)} in file · ${formatCount(1_234)} ended excluded · ${formatCount(234)} without geometry counted · ${formatCount(56)} duplicates dropped) · ` +
      `article 4 areas: ${formatCount(1_234)} filed (${formatCount(1_111)} current of ${formatCount(1_234)} in file · ${formatCount(123)} ended excluded · ${formatCount(45)} without geometry counted · ${formatCount(67)} duplicates dropped) · ` +
      `article 4 directions: ${formatCount(1_234)} current checked (${formatCount(1_234)} in file · ${formatCount(123)} ended excluded) · ` +
      `article 4 gate: ${formatCount(234)} organisations publish areas (gate filed)`;
    expect(line).toContain("conservation areas: 12,345 filed (11,111 current of 12,345 in file");
    expect(line).toContain("article 4 gate: 234 organisations publish areas");
    expect(line).not.toMatch(/conservation areas: 12345 filed/);
  });

  it("formats the school-destinations KS4/KS5 and consortium counts", () => {
    const line =
      `load-school-destinations · Department for Education — Explore Education Statistics · release "2024-25" published 2026-11-01 · ` +
      `cohort 2024 (v1) · ` +
      `KS4 ${formatCount(12_345)} institutions (${formatCount(1_234)} consortium groups resolved) · ` +
      `KS5 ${formatCount(2_345)} institutions (${formatCount(234)} consortium groups resolved)`;
    expect(line).toContain("KS4 12,345 institutions (1,234 consortium groups resolved)");
    expect(line).toContain("KS5 2,345 institutions (234 consortium groups resolved)");
    expect(line).not.toMatch(/KS4 12345 institutions/);
  });

  it("formats the schools summary counts", () => {
    const line =
      `load-schools · GIAS 2026-11-01 · Ofsted as at 2026-11-01 · ${formatCount(12_345)} open schools · ` +
      `${formatCount(1_234)} closed skipped · ${formatCount(2_345)} without coordinates ` +
      `(${formatCount(1_234)} at postcode position, ${formatCount(1_111)} unfiled) · ` +
      `${formatCount(123)} selective secondaries · ` +
      `${formatCount(12_345)} Ofsted outcomes joined · ${formatCount(234)} admissions-policy mismatches logged · ` +
      `${formatCount(345)} Welsh schools without an Ofsted row (Estyn territory, expected)`;
    expect(line).toContain(
      "12,345 open schools · 1,234 closed skipped · 2,345 without coordinates",
    );
    expect(line).toContain("123 selective secondaries · 12,345 Ofsted outcomes joined");
    expect(line).not.toMatch(/12345 open schools/);
  });

  it("formats the transport family line and stats counts", () => {
    const familyLine = ["bus", "rail"].map((f) => `${f} ${formatCount(12_345)}`).join(" · ");
    const line =
      `load-transport · NaPTAN · file of 2026-11-01 · ` +
      `${formatCount(12_345)} rows read · ${formatCount(11_111)} active · ` +
      `${formatCount(12_345)} transport stops filed (${familyLine}) · ` +
      `${formatCount(1_234)} grid references converted · ` +
      `${formatCount(234)} inactive or pending excluded · ` +
      `${formatCount(345)} active sub-point or out-of-scope rows set aside · ` +
      `${formatCount(456)} without a position counted · ` +
      `${formatCount(567)} duplicate ATCO codes dropped`;
    expect(line).toContain(
      "12,345 rows read · 11,111 active · 12,345 transport stops filed (bus 12,345 · rail 12,345)",
    );
    expect(line).not.toMatch(/12345 rows read/);
  });

  it("formats the tribunal-building-safety rows, counts, documents and failures", () => {
    const line =
      `load-tribunal-building-safety: ${formatCount(12_345)} cases filed ` +
      `(${formatCount(1_234)} remediation orders, ${formatCount(234)} remediation contribution orders, ${formatCount(345)} other building-safety) ` +
      `from ${formatCount(11_111)} published documents · parse failures: ${formatCount(12)}` +
      ` · ${formatCount(1_234)} cases name no full postcode` +
      ` · ${formatCount(234)} dates from GOV.UK metadata where the header carries none` +
      ` · enumerated ${formatCount(1_234)} of ${formatCount(12_345)} Building Safety Act category items on GOV.UK`;
    expect(line).toContain(
      "12,345 cases filed (1,234 remediation orders, 234 remediation contribution orders",
    );
    expect(line).toContain("from 11,111 published documents · parse failures: 12");
    expect(line).toContain("enumerated 1,234 of 12,345 Building Safety Act category items");
    expect(line).not.toMatch(/12345 cases filed/);
  });

  it("formats the runner's failure subject counts", () => {
    const line = `[Check My Next Home] Loader run FAILED — load-schools, load-epc (${formatCount(2)} of ${formatCount(1_234)})`;
    expect(line).toContain("(2 of 1,234)");
    expect(line).not.toMatch(/\(2 of 1234\)/);
  });
});

// BUG-231 (canary half): every printed canary log line that
// carried a raw count now goes through formatCount. Render
// pins, as above — except the two exported verdict
// functions, which get real call-site pins through the
// actual functions with synthetic inputs.
describe("formatted canary log lines (BUG-231)", () => {
  it("formats the ppd, police, epc, gias/ofsted and ods lines", () => {
    const ppd = `canary ppd · head sample ${formatCount(12_345)} lines, ${formatCount(1_234)} malformed`;
    expect(ppd).toContain("head sample 12,345 lines, 1,234 malformed");
    expect(ppd).not.toMatch(/sample 12345 lines/);
    const police = `canary police · latest month 2026-10 · golden-point response is an array (${formatCount(12_345)} records)`;
    expect(police).toContain("(12,345 records)");
    expect(police).not.toMatch(/\(12345 records\)/);
    const epc = `canary epc · search + certificate shape OK (${formatCount(1_234)} stubs on page 1)`;
    expect(epc).toContain("(1,234 stubs on page 1)");
    expect(epc).not.toMatch(/\(1234 stubs on page 1\)/);
    const epcDeltas = `array of ${formatCount(12_345)}`;
    expect(epcDeltas).toBe("array of 12,345");
    expect(epcDeltas).not.toMatch(/array of 12345/);
    const gias = `canary gias · extract 2026-11-01 · all ${formatCount(12)} consumed columns present`;
    expect(gias).toContain("all 12 consumed columns present");
    const ofsted = `canary ofsted · file as at 2026-11-01 · all ${formatCount(12)} consumed columns present`;
    expect(ofsted).toContain("all 12 consumed columns present");
    const ods = `canary ods · epraccur ${formatCount(12_345)} rows, ${formatCount(1_234)} wrong-width`;
    expect(ods).toContain("epraccur 12,345 rows, 1,234 wrong-width");
    expect(ods).not.toMatch(/epraccur 12345 rows/);
    const planning = `canary planning · file 12.3 MB, modified 2026-11-01 · all ${formatCount(12)} consumed columns present · ${formatCount(1_234)} applications`;
    expect(planning).toContain("all 12 consumed columns present · 1,234 applications");
    expect(planning).not.toMatch(/· 1234 applications/);
  });

  it("formats the nature, flood, aqma and clean-air-zone lines", () => {
    const sssi = `canary sssi · ${formatCount(12_345)} features · edited 2026-11-01`;
    expect(sssi).toContain("12,345 features");
    expect(sssi).not.toMatch(/· 12345 features/);
    const sac = `canary sac · ${formatCount(12_345)} features, ${formatCount(1_234)} designated (${formatCount(11_111)} candidate) · no staleness alarm by design`;
    expect(sac).toContain("12,345 features, 1,234 designated (11,111 candidate)");
    expect(sac).not.toMatch(/12345 features, 1234 designated/);
    const spa = `canary spa · ${formatCount(1_234)} features · no staleness alarm by design`;
    expect(spa).toContain("1,234 features");
    const ramsar = `canary ramsar · ${formatCount(1_234)} features · no staleness alarm by design`;
    expect(ramsar).toContain("1,234 features");
    const ancient = `canary ancient-woodland · ${formatCount(12_345)} polygons · inventories last edited 2026-11-01 (original) / 2026-11-01 (revised)`;
    expect(ancient).toContain("12,345 polygons");
    expect(ancient).not.toMatch(/12345 polygons/);
    const phi = `canary priority-habitats · ${formatCount(12_345)} patches · version 2026-11`;
    expect(phi).toContain("12,345 patches");
    expect(phi).not.toMatch(/12345 patches/);
    const flood = `canary flood-rivers-sea · ${formatCount(12_345)} features · edition 2026-11-12`;
    expect(flood).toContain("12,345 features");
    expect(flood).not.toMatch(/· 12345 features/);
    const warning = `edition is ${formatCount(1_234)} days old — beyond the ~200-day ambition (warn-only: the publisher promises updates only as needed)`;
    expect(warning).toContain("edition is 1,234 days old");
    expect(warning).not.toMatch(/is 1234 days old/);
    const aqma = `canary aqma · ${formatCount(12_345)} areas · edition 2026-11-01 · England ${formatCount(11_111)} · Scotland ${formatCount(1_234)}`;
    expect(aqma).toContain("12,345 areas · edition 2026-11-01 · England 11,111 · Scotland 1,234");
    expect(aqma).not.toMatch(/12345 areas/);
    const caz = `canary govuk-caz · ${formatCount(12)} of ${formatCount(12)} registered Clean Air Zones named on GOV.UK · ${formatCount(1_234)} table rows`;
    expect(caz).toContain("12 of 12 registered Clean Air Zones named on GOV.UK · 1,234 table rows");
    const cazWarning = `the table carries ${formatCount(1_234)} rows against the register's ${formatCount(12)} — a scheme may have been added or removed`;
    expect(cazWarning).toContain("carries 1,234 rows against the register's 12");
    const lez = `canary scotland-lez · ${formatCount(12)} of ${formatCount(12)} registered Low Emission Zones named on lowemissionzones.scot`;
    expect(lez).toContain("12 of 12 registered Low Emission Zones");
    const lezWarning = `the site says there are ${formatCount(12)} LEZs in Scotland against the register's ${formatCount(12)} — a scheme may have been added or removed`;
    expect(lezWarning).toContain("there are 12 LEZs in Scotland against the register's 12");
  });

  it("formats the naptan, os-greenspace, open-charge-map and nomis lines", () => {
    const naptan = `canary naptan · area 571: ${formatCount(12_345)} stops · newest edit 2026-11-01 · all ${formatCount(12)} consumed columns present`;
    expect(naptan).toContain(
      "area 571: 12,345 stops · newest edit 2026-11-01 · all 12 consumed columns present",
    );
    expect(naptan).not.toMatch(/571: 12345 stops/);
    const greenspace = `canary os-greenspace · edition 2026-11 · GB GeoPackage ${formatCount(12_345_678)} bytes · md5 abc`;
    expect(greenspace).toContain("GB GeoPackage 12,345,678 bytes");
    expect(greenspace).not.toMatch(/GeoPackage 12345678 bytes/);
    const ocm = `canary open-charge-map · credential answers · South tile ${formatCount(12_345)} records (first load ${formatCount(12_345)}) · membership share 32% · Birkdale ${formatCount(1_234)} fileable within 2 mi · Exeter ${formatCount(2_345)} fileable within 2 mi (first load ${formatCount(2_345)})`;
    expect(ocm).toContain("South tile 12,345 records (first load 12,345)");
    expect(ocm).toContain(
      "Birkdale 1,234 fileable within 2 mi · Exeter 2,345 fileable within 2 mi",
    );
    expect(ocm).not.toMatch(/South tile 12345 records/);
    const census = `canary nomis-census · 7 bulk files present · TS021/TS054 shapes OK · golden totals unchanged (${[12_345, 1_234, 2_345].map((v) => formatCount(v)).join(" / ")})`;
    expect(census).toContain("golden totals unchanged (12,345 / 1,234 / 2,345)");
    expect(census).not.toMatch(/unchanged \(12345 /);
    const claimant = `canary nomis-claimant · latest month 2026-10 (${formatCount(1_234)} days past month end) · golden LSOAs return count + % (E01000001 ${formatCount(1_234)} / 4.5% · E01000002 ${formatCount(2_345)} / 5.6%)`;
    expect(claimant).toContain("latest month 2026-10 (1,234 days past month end)");
    expect(claimant).toContain("E01000001 1,234 / 4.5%");
    expect(claimant).not.toMatch(/\(1234 days past month end\)/);
    const uc = `people latest 2026-10 (${formatCount(1_234)} months old)`;
    expect(uc).toContain("(1,234 months old)");
    expect(uc).not.toMatch(/\(1234 months old\)/);
  });

  it("formats the council-tax, flood-defences and planning-application canary lines", () => {
    const councilTax = `canary mhclg-council-tax · the StatsWales composition dataset was last updated 2026-11-01 (${formatCount(1_234)} days ago) — the Welsh annual update looks missed; check StatsWales before the next seed re-run`;
    expect(councilTax).toContain("(1,234 days ago)");
    expect(councilTax).not.toMatch(/\(1234 days ago\)/);
    const defences = `canary flood-defences · the AIMS record still names AfA345 and carries the GeoPackage zip on the loader's file-download pattern (${formatCount(1_234)} resources on the record)`;
    expect(defences).toContain("(1,234 resources on the record)");
    expect(defences).not.toMatch(/\(1234 resources on the record\)/);
    const planning = `canary planning-application · collection has started — ${formatCount(1_234)} entities from ${formatCount(12)} providers on planning.data.gov.uk: re-open M5.12 as a filing step (the next free migration number; field mapping in the M5.12 prep, Section 1.3)`;
    expect(planning).toContain("collection has started — 1,234 entities from 12 providers");
    expect(planning).not.toMatch(/— 1234 entities from/);
  });

  it("formats the postio balance through the real postioVerdict (call-site pin)", () => {
    const healthy = postioVerdict({
      configured: true,
      reachable: true,
      keyActive: true,
      lookupsRemaining: 25_000,
    });
    expect(healthy.logLine).toContain("canary postio · key active, 25,000 lookups remaining");
    expect(healthy.logLine).not.toMatch(/25000 lookups remaining/);
    // Below 1,000 formatCount is identity — the low-balance
    // branch (under the 100-lookup threshold) still reads plain.
    const low = postioVerdict({
      configured: true,
      reachable: true,
      keyActive: true,
      lookupsRemaining: 42,
    });
    expect(low.warning).toBe(true);
    expect(low.logLine).toContain("(42 lookups left, under the 100-lookup threshold)");
  });

  it("formats the picking-index ages and home counts through the real pickingIndexVerdict (call-site pin)", () => {
    const now = new Date("2026-11-24T00:00:00Z");
    const verdict = pickingIndexVerdict(
      [
        {
          source: "sales",
          edition: "2023-11",
          loaded_at: "2023-11-24T00:00:00Z",
          homes: 25_108_628,
          previous_homes: null,
          last_rejected_homes: 1_234_567,
          last_rejected_at: "2023-11-24T00:00:00Z",
        },
        {
          source: "epc",
          edition: "2026-11",
          loaded_at: "2026-11-20T00:00:00Z",
          homes: 25_108_628,
          previous_homes: null,
          last_rejected_homes: null,
          last_rejected_at: null,
        },
      ],
      now,
    );
    expect(verdict.warning).toBe(true);
    // 2023-11-24 → 2026-11-24 is 1,096 days (one leap year in the span).
    expect(verdict.logLine).toContain(
      "the sales edition in the picking index is 1,096 days old (edition 2023-11)",
    );
    expect(verdict.logLine).toContain("(1,234,567 distinct homes against the filed 25,108,628)");
    expect(verdict.logLine).not.toMatch(/1096 days old/);
    expect(verdict.logLine).not.toMatch(/1234567 distinct homes/);
    expect(verdict.logLine).not.toMatch(/filed 25108628/);
  });
});

// BUG-248: loader health lines — heartbeat, warning and
// failure, in the same timestamped shape as the progress
// lines. Render-form pins through the real logger, with a
// controllable clock and fixed resources so the cadence
// and the thresholds are exact, never machine-dependent.
describe("loader health lines (BUG-248)", () => {
  const START = Date.parse("2026-11-24T00:00:00Z");
  const stamp = (ms: number) => new Date(ms).toISOString();
  // A logger whose clock only moves when the test moves it
  // and whose resources are fixed: the healthy default is
  // 512 MB RSS and 120.5 GB free, comfortably inside both
  // thresholds, so a heartbeat on its own emits exactly
  // one line.
  const healthLogger = (
    resources: { rssMb: number | null; diskGb: number | null } = {
      rssMb: 512,
      diskGb: 120.5,
    },
  ) => {
    const lines: string[] = [];
    let now = START;
    const progress = createProgressLogger({
      name: "load-broadband",
      log: (line: string) => lines.push(line),
      now: () => now,
      resourceReader: () => resources,
    });
    return {
      lines,
      progress,
      advance: (ms: number) => {
        now += ms;
      },
    };
  };

  it("renders the heartbeat line in the approved shape", () => {
    const { lines, progress } = healthLogger();
    expect(progress.heartbeat({ stage: "sweep", done: 10, total: 346 })).toBe(true);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(
      `${stamp(START)} load-broadband heartbeat · sweep · 10/346 · 0s · RSS 512 MB · disk 120.5 GB free`,
    );
  });

  it("renders the heartbeat count alone when the total is unknown", () => {
    const { lines, progress } = healthLogger();
    expect(progress.heartbeat({ stage: "parse", done: 10000000 })).toBe(true);
    expect(lines[0]).toContain("heartbeat · parse · 10,000,000 · 0s ·");
  });

  it("fires the heartbeat at the batch boundary and not before", () => {
    const { lines, progress } = healthLogger();
    expect(progress.heartbeat({ stage: "sweep", done: 9, total: 346 })).toBe(false);
    expect(progress.heartbeat({ stage: "sweep", done: 10, total: 346 })).toBe(true);
    expect(progress.heartbeat({ stage: "sweep", done: 11, total: 346 })).toBe(false);
    expect(progress.heartbeat({ stage: "sweep", done: 20, total: 346 })).toBe(true);
    expect(lines).toHaveLength(2);
  });

  it("fires the heartbeat at the 15-minute boundary and not before", () => {
    const { lines, progress, advance } = healthLogger();
    expect(progress.heartbeat({ stage: "sweep", done: 10, total: 346 })).toBe(true);
    advance(HEARTBEAT_EVERY_MS - 1);
    expect(progress.heartbeat({ stage: "sweep", done: 11, total: 346 })).toBe(false);
    advance(1);
    expect(progress.heartbeat({ stage: "sweep", done: 11, total: 346 })).toBe(true);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("· 15m 0s ·");
  });

  it("never fires a first heartbeat on its own", () => {
    const { lines, progress } = healthLogger();
    expect(progress.heartbeat({ stage: "merge", done: 1, total: 3 })).toBe(false);
    expect(lines).toHaveLength(0);
  });

  it("throttles the heartbeat per stage, not per logger", () => {
    const { lines, progress } = healthLogger();
    expect(progress.heartbeat({ stage: "merge", done: 10, total: 100 })).toBe(true);
    expect(progress.heartbeat({ stage: "sweep", done: 1, total: 346 })).toBe(false);
    expect(progress.heartbeat({ stage: "sweep", done: 10, total: 346 })).toBe(true);
    expect(lines).toHaveLength(2);
  });

  it("renders the elapsed time in the heartbeat", () => {
    const { lines, progress, advance } = healthLogger();
    advance(95_000);
    expect(progress.heartbeat({ stage: "sweep", done: 10, total: 346 })).toBe(true);
    expect(lines[0]).toContain("· 1m 35s ·");
  });

  it("warns once when the disk drops under 15 GB, and never at the threshold", () => {
    const { lines, progress } = healthLogger({ rssMb: 512, diskGb: 15 });
    expect(progress.heartbeat({ stage: "sweep", done: 10, total: 346 })).toBe(true);
    expect(lines).toHaveLength(1);
    const low = healthLogger({ rssMb: 512, diskGb: 12.4 });
    expect(low.progress.heartbeat({ stage: "sweep", done: 10, total: 346 })).toBe(true);
    expect(low.lines).toHaveLength(2);
    expect(low.lines[1]).toBe(
      `${stamp(START)} load-broadband warning · disk free · 12.4 GB (threshold 15 GB)`,
    );
    // A second heartbeat does not repeat the warning.
    expect(low.progress.heartbeat({ stage: "sweep", done: 20, total: 346 })).toBe(true);
    expect(low.lines).toHaveLength(3);
  });

  it("warns once when RSS passes 4 GB, and never at the threshold", () => {
    const at = healthLogger({ rssMb: 4096, diskGb: 120.5 });
    expect(at.progress.heartbeat({ stage: "sweep", done: 10, total: 346 })).toBe(true);
    expect(at.lines).toHaveLength(1);
    const over = healthLogger({ rssMb: 4512, diskGb: 120.5 });
    expect(over.progress.heartbeat({ stage: "sweep", done: 10, total: 346 })).toBe(true);
    expect(over.lines).toHaveLength(2);
    expect(over.lines[1]).toBe(
      `${stamp(START)} load-broadband warning · RSS · 4,512 MB (threshold 4,096 MB)`,
    );
    expect(over.progress.heartbeat({ stage: "sweep", done: 20, total: 346 })).toBe(true);
    expect(over.lines).toHaveLength(3);
  });

  it("renders a warning line in the approved shape", () => {
    const { lines, progress } = healthLogger();
    progress.warning({
      what: "sweep batch duration",
      value: "batch 47 took 6m 12s",
      threshold: "3x recent average 2m 4s",
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(
      `${stamp(START)} load-broadband warning · sweep batch duration · batch 47 took 6m 12s (threshold 3x recent average 2m 4s)`,
    );
  });

  it("renders the failure line with the first error line only", () => {
    const { lines, progress } = healthLogger();
    progress.failed({
      stage: "merge",
      filed: 1234,
      total: 5000,
      error: new Error("boom\nline two\nline three"),
      resume: "re-run from scratch (merge is idempotent, staged rows re-merge)",
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(
      `${stamp(START)} load-broadband failed · merge · filed 1,234 of 5,000 · boom · resume from re-run from scratch (merge is idempotent, staged rows re-merge)`,
    );
    expect(lines[0]).not.toContain("line two");
  });

  it("renders the failure line without an 'of' when the total is unknown, and from a plain string", () => {
    const { lines, progress } = healthLogger();
    progress.failed({
      stage: "parse",
      filed: 7,
      error: "plain string failure",
      resume: "re-run from scratch (nothing is filed until the merge)",
    });
    expect(lines[0]).toBe(
      `${stamp(START)} load-broadband failed · parse · filed 7 · plain string failure · resume from re-run from scratch (nothing is filed until the merge)`,
    );
  });

  it("never lets a health line look like a summary line", () => {
    const { lines, progress } = healthLogger({ rssMb: 5120, diskGb: 12.4 });
    progress.heartbeat({ stage: "sweep", done: 10, total: 346 });
    progress.warning({ what: "disk free", value: "12.4 GB", threshold: "15 GB" });
    progress.failed({ stage: "merge", filed: 1, error: "x", resume: "re-run" });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
    expect(lines.every((l) => /^\d{4}-\d\d-\d\dT/.test(l))).toBe(true);
  });

  it("formats durations for heartbeats and batch warnings", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(59_000)).toBe("59s");
    expect(formatDuration(60_000)).toBe("1m 0s");
    expect(formatDuration(95_000)).toBe("1m 35s");
    expect(formatDuration(3_599_000)).toBe("59m 59s");
    expect(formatDuration(3_600_000)).toBe("1h 0m");
    expect(formatDuration(3_661_000)).toBe("1h 1m");
  });

  it("watches batches: the first is never slow, a batch past 3x is, the boundary is not", () => {
    const watch = createBatchWatch({});
    expect(watch.observe(100)).toEqual({ tookMs: 100, averageMs: null, slow: false });
    expect(watch.observe(300)).toEqual({ tookMs: 300, averageMs: 100, slow: false });
    expect(watch.observe(301)).toEqual({ tookMs: 301, averageMs: 200, slow: false });
    // Average of 100, 300, 301 is 233.67 — 702 beats 3x it (701).
    expect(watch.observe(702).slow).toBe(true);
    expect(SLOW_BATCH_FACTOR).toBe(3);
    expect(HEARTBEAT_EVERY_BATCHES).toBe(10);
    expect(HEARTBEAT_EVERY_MS).toBe(15 * 60 * 1000);
    expect(DISK_FREE_WARN_GB).toBe(15);
    expect(RSS_WARN_MB).toBe(4096);
  });
});
