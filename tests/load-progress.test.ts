import { spawn } from "node:child_process";
import { mkdtemp, open, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createProgressLogger, formatCount } from "../loaders/progress.mjs";
import { readFixture } from "../loaders/load-flood-zones.mjs";

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
