// Crime loader (plan step M4.3). Police.uk street-level crime counts,
// filed into each postcode's cached answers (postcode_cache.answers,
// key "crime") — counts only, never a score or a verdict.
//
//   npm run load:crime -- "CM3 2JT" "E16 1GN"
//   npm run load:crime -- --verify-only "CM3 2JT"
//   npm run load:crime -- --file tests/fixtures/police-uk "CM3 2JT" "E16 1GN"
//
// How it works:
//   1. Ask Police.uk which months exist and anchor everything to the
//      LATEST published month (the availability endpoint). Police.uk
//      publishes with a lag of about two months, so the freshness
//      guard fails the load — filing nothing — if the newest month
//      is more than three months behind today: stale data must be
//      an alerted failure, never a silent success (step M4.8 wires
//      the alert email; the old data keeps serving meanwhile).
//   2. For each postcode's directory point (from step M4.1), count
//      the street-level crimes within the API's 1-mile radius for
//      each of the 12 months ending at the latest month, and sum.
//   3. File the counts into the postcode's answers inside one
//      transaction, merging the "crime" key only — broadband and
//      EPC answers stored beside it are never touched — then read
//      the filed answer back and check the maths before commit.
//
// The plan's Check for M4.3: the 12-month window totals match the
// approved reports — 330 for CM3 2JT and 10,722 for E16 1GN over
// Oct 2025 – Sep 2026. The window rolls forward as new months
// publish, so the live proof checks the maths (filed total = the
// sum of the 12 monthly counts, window ending at the latest
// published month); the frozen approved totals are asserted in
// fixture mode, where the data is the captured window itself.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const DATES_URL = "https://data.police.uk/api/crimes-street-dates";
const CRIMES_URL = "https://data.police.uk/api/crimes-street/all-crime";
const SOURCE_NAME = "Police.uk street-level crime";
const MAX_LAG_MONTHS = 3; // expected lag ~2 months, plus one of tolerance
const WINDOW_MONTHS = 12;

// The approved reports' totals for the Oct 2025 – Sep 2026 window,
// asserted in fixture mode only (the live window rolls forward).
const APPROVED_TOTALS = { "CM3 2JT": 330, "E16 1GN": 10722 };

function monthIndex(yyyyMm) {
  const [y, m] = yyyyMm.split("-").map(Number);
  return y * 12 + (m - 1);
}
function monthName(index) {
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}
function windowMonths(latest) {
  const end = monthIndex(latest);
  return Array.from({ length: WINDOW_MONTHS }, (_, i) => monthName(end - (WINDOW_MONTHS - 1) + i));
}

async function fetchJson(url) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await fetch(url);
    if (response.ok) return response.json();
    if (attempt === 2)
      throw new Error(`Police.uk request failed: HTTP ${response.status} (${url})`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("unreachable");
}

async function main() {
  const startedAt = Date.now();
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  const fileIdx = args.indexOf("--file");
  const fileDir = fileIdx >= 0 ? args[fileIdx + 1] : null;
  const postcodes = args
    .filter((a, i) => !a.startsWith("--") && i !== fileIdx + 1)
    .map((pc) => pc.trim().toUpperCase());
  if (postcodes.length === 0)
    throw new Error('name at least one postcode, e.g. load-crime -- "CM3 2JT"');

  const fixture = fileDir
    ? JSON.parse(await readFile(join(fileDir, "fixture.json"), "utf8"))
    : null;

  // 1 — the latest published month, and the freshness guard.
  const dates = fixture
    ? JSON.parse(await readFile(join(fileDir, fixture.datesFile), "utf8"))
    : await fetchJson(DATES_URL);
  const latest = dates
    .map((d) => d.date)
    .sort()
    .at(-1);
  if (!latest) throw new Error("Police.uk availability list is empty");
  const today = fixture ? fixture.today : new Date().toISOString().slice(0, 10);
  const lag = monthIndex(today.slice(0, 7)) - monthIndex(latest);
  if (lag > MAX_LAG_MONTHS)
    throw new Error(
      `freshness guard: the newest Police.uk month is ${latest}, ${lag} months behind ${today.slice(0, 7)} (expected lag ~2, tolerance ${MAX_LAG_MONTHS}) — treating this as a failed load; the previous data keeps serving`,
    );
  const months = windowMonths(latest);

  // Points: fixture.json in fixture mode; the directory otherwise.
  let client = null;
  const getPoint = async (pc) => {
    if (fixture) {
      const point = fixture.points[pc];
      if (!point)
        throw new Error(
          `${pc}: no point in the fixture (fixture covers ${Object.keys(fixture.points).join(", ")})`,
        );
      return point;
    }
    const res = await client.query(
      "SELECT latitude, longitude FROM postcode_cache WHERE postcode = $1",
      [pc],
    );
    if (res.rows.length === 0)
      throw new Error(
        `${pc}: not in the postcode directory — run the postcode loader (step M4.1) first`,
      );
    return { lat: res.rows[0].latitude, lng: res.rows[0].longitude };
  };

  const connectionString = process.env.DATABASE_URL;
  if (!fixture || !verifyOnly) {
    if (!connectionString) throw new Error("DATABASE_URL is not set (see .env.example, Key K6)");
    client = new pg.Client({ connectionString });
    await client.connect();
  }

  try {
    // 2 — count, per postcode.
    const answers = new Map();
    for (const pc of postcodes) {
      const point = fixture ? fixture.points[pc] : await getPoint(pc);
      if (!point) throw new Error(`${pc}: no point available`);
      const perMonth = [];
      const categories = {};
      for (const month of months) {
        const records = fixture
          ? JSON.parse(await readFile(join(fileDir, `${point.prefix}-${month}.json`), "utf8"))
          : await fetchJson(`${CRIMES_URL}?lat=${point.lat}&lng=${point.lng}&date=${month}`);
        if (!Array.isArray(records))
          throw new Error(`${pc} ${month}: Police.uk response is not a list`);
        perMonth.push({ month, count: records.length });
        for (const record of records) {
          const category = record.category ?? "unknown";
          categories[category] = (categories[category] ?? 0) + 1;
        }
        if (!fixture) await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const total = perMonth.reduce((sum, m) => sum + m.count, 0);
      if (fixture && APPROVED_TOTALS[pc] !== undefined && total !== APPROVED_TOTALS[pc])
        throw new Error(
          `${pc}: fixture total is ${total}, but the approved report says ${APPROVED_TOTALS[pc]} — the counting basis has changed`,
        );
      answers.set(pc, {
        total,
        windowFrom: months[0],
        windowTo: latest,
        months: perMonth,
        categories,
        basis: "Street-level crimes recorded within 1 mile of the postcode point (Police.uk API)",
        sourceName: SOURCE_NAME,
        sourceDate: latest,
        loadedAt: new Date().toISOString(),
      });
    }

    const summary = () =>
      `load-crime · latest month ${latest} · window ${months[0]}..${latest} · ${postcodes
        .map((pc) => `${pc} ${answers.get(pc).total} crimes`)
        .join(" · ")}`;

    if (verifyOnly) {
      console.log(
        `${summary()} · golden homes OK (verify only, nothing filed) · ${Math.round((Date.now() - startedAt) / 1000)}s`,
      );
      return;
    }

    // 3 — file it: merge the crime key into each postcode's answers,
    // in one transaction, and read back before commit.
    await client.query("BEGIN");
    try {
      for (const pc of postcodes) {
        const res = await client.query(
          "UPDATE postcode_cache SET answers = answers || $1::jsonb WHERE postcode = $2",
          [JSON.stringify({ crime: answers.get(pc) }), pc],
        );
        if (res.rowCount === 0)
          throw new Error(
            `${pc}: not in the postcode directory — run the postcode loader (step M4.1) first`,
          );
      }
      for (const pc of postcodes) {
        const res = await client.query(
          "SELECT answers->'crime' AS crime FROM postcode_cache WHERE postcode = $1",
          [pc],
        );
        const filed = res.rows[0]?.crime;
        const expected = answers.get(pc);
        if (
          !filed ||
          filed.total !== expected.total ||
          filed.windowTo !== latest ||
          filed.months?.length !== WINDOW_MONTHS
        )
          throw new Error(
            `${pc}: the filed crime answer does not match the counted figures — rolling back`,
          );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    console.log(`${summary()} · golden homes OK · ${Math.round((Date.now() - startedAt) / 1000)}s`);
  } finally {
    if (client) await client.end();
  }
}

main().catch((error) => {
  console.error(`load-crime FAILED: ${error.message}`);
  process.exitCode = 1;
});
