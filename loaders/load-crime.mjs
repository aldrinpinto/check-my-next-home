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
//
// M6.20 (decision D39) — the calibration populations file at
// the same moment, inside the same artefact, so numerator and
// denominator age together:
//   basisResidents — Basis B, the founder's ruling: the Census
//     2021 residents of the LSOAs containing the postcodes
//     within the same 1 mile of the postcode point, counted
//     whole. Live mode computes it from the filed directory +
//     lsoa_bases (computeBasisResidents below). FIXTURE MODE
//     NEVER COMPUTES IT: CI's lsoa_bases fixture holds only
//     the three golden LSOA rows, so a live computation there
//     would silently degrade to the rejected own-LSOA basis
//     while every count golden still passed — the fixture
//     pins the value per postcode (fixture.basisResidents,
//     the APPROVED_TOTALS precedent), and a postcode with no
//     pin files no basis.
//   national — the window's England figure { total,
//     residents }, read from crime_national_months (migration
//     0021, loader load-crime-national) when every month of
//     the window is filed there; null otherwise. The national
//     loader refreshes the embedding in already-filed
//     artefacts as later months land.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { formatCount } from "./progress.mjs";

const DATES_URL = "https://data.police.uk/api/crimes-street-dates";
const CRIMES_URL = "https://data.police.uk/api/crimes-street/all-crime";
const SOURCE_NAME = "Police.uk street-level crime";
const MAX_LAG_MONTHS = 3; // expected lag ~2 months, plus one of tolerance
const WINDOW_MONTHS = 12;

// The approved reports' totals for the Oct 2025 – Sep 2026 window,
// asserted in fixture mode only (the live window rolls forward).
const APPROVED_TOTALS = { "CM3 2JT": 330, "E16 1GN": 10722 };

export function monthIndex(yyyyMm) {
  const [y, m] = yyyyMm.split("-").map(Number);
  return y * 12 + (m - 1);
}
function monthName(index) {
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}
export function windowMonths(latest) {
  const end = monthIndex(latest);
  return Array.from({ length: WINDOW_MONTHS }, (_, i) => monthName(end - (WINDOW_MONTHS - 1) + i));
}

// The loaders' haversine, verbatim in form (load-transport.mjs):
// earth radius 3,956 miles — the product's one distance basis.
export function haversineMiles(aLat, aLng, bLat, bLng) {
  const R = 3956;
  const r = Math.PI / 180;
  const h =
    Math.sin(((bLat - aLat) * r) / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLng - aLng) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Basis B (M6.20, decision D39): the Census 2021 residents of
// the LSOAs containing the postcodes within 1 mile of the
// point, each LSOA counted whole. The candidate set is a
// generous degree box over the filed directory; the cut is
// the haversine itself, so the set is exactly the prep's
// measured set. Returns null — the named absence — when any
// LSOA in the set has no lsoa_bases row (a partial sum would
// be a wrong figure wearing a right one's clothes), or when
// the set is empty.
export async function computeBasisResidents(client, point) {
  const latDelta = 1.05 / 69.0;
  const lngDelta = 1.05 / (69.0 * Math.cos((point.lat * Math.PI) / 180));
  const { rows } = await client.query(
    `SELECT lsoa_code, latitude, longitude FROM postcode_cache
      WHERE lsoa_code IS NOT NULL
        AND latitude BETWEEN $1 AND $2
        AND longitude BETWEEN $3 AND $4`,
    [point.lat - latDelta, point.lat + latDelta, point.lng - lngDelta, point.lng + lngDelta],
  );
  const lsoas = new Set();
  for (const row of rows) {
    if (haversineMiles(point.lat, point.lng, row.latitude, row.longitude) <= 1) {
      lsoas.add(row.lsoa_code);
    }
  }
  if (lsoas.size === 0) return null;
  const { rows: bases } = await client.query(
    "SELECT lsoa_code, residents FROM lsoa_bases WHERE lsoa_code = ANY($1)",
    [[...lsoas]],
  );
  if (bases.length !== lsoas.size) return null;
  return bases.reduce((sum, row) => sum + row.residents, 0);
}

// The England denominator: England's Census 2021 residents
// from the same filed source as every circle's basis — the
// sum over lsoa_bases' E01 rows (56,490,108 on the full
// filing). Null while the bases are unfiled.
//
// Coverage guard (parity fix batch, 18 Nov 2026): the sum
// is England's ONLY when the bases are credibly the whole
// national filing — England has 33,755 LSOAs. A partial
// filing (the play server held 3 LSOAs / 5,899 residents)
// divided the national crime total by a village-sized base
// and served an England figure of 933,039 per 1,000. Below
// the floor the denominator does not exist: the figure is
// withheld, never approximated.
export const ENGLAND_BASE_MIN_AREAS = 30_000;
export async function englandResidents(client) {
  const { rows } = await client.query(
    "SELECT COALESCE(SUM(residents), 0)::int AS residents, COUNT(*)::int AS areas FROM lsoa_bases WHERE lsoa_code LIKE 'E01%'",
  );
  return rows[0].areas >= ENGLAND_BASE_MIN_AREAS ? rows[0].residents : null;
}

// The window's England figure for embedding, or null while
// any month of the window is uncounted in
// crime_national_months (migration 0021) or the denominator
// is unfiled. Shared with load-crime-national, which embeds
// the same figure into already-filed artefacts.
export async function nationalForWindow(client, months) {
  const { rows } = await client.query(
    "SELECT month, england_total FROM crime_national_months WHERE month = ANY($1)",
    [months],
  );
  if (rows.length !== months.length) return null;
  const residents = await englandResidents(client);
  if (residents === null) return null;
  return { total: rows.reduce((sum, row) => sum + row.england_total, 0), residents };
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
      const answer = {
        total,
        windowFrom: months[0],
        windowTo: latest,
        months: perMonth,
        categories,
        basis: "Street-level crimes recorded within 1 mile of the postcode point (Police.uk API)",
        sourceName: SOURCE_NAME,
        sourceDate: latest,
        loadedAt: new Date().toISOString(),
      };
      // M6.20 (D39): the calibration populations file with
      // the counts, in the same artefact. Fixture mode takes
      // the pinned basis from the fixture and NEVER computes
      // one (CI's lsoa_bases fixture holds only the three
      // golden rows — a computation there silently degrades
      // to the rejected own-LSOA basis); a postcode with no
      // pin files no basis. Live mode computes Basis B from
      // the filed directory + lsoa_bases.
      if (fixture) {
        const pinned = fixture.basisResidents?.[pc];
        if (typeof pinned === "number") answer.basisResidents = pinned;
      } else {
        const basisResidents = await computeBasisResidents(client, point);
        if (basisResidents !== null) answer.basisResidents = basisResidents;
      }
      // The England embedding: the window's filed national
      // figure, or null while any month is uncounted (the
      // national loader refreshes it later as months land).
      if (client) answer.national = await nationalForWindow(client, months);
      answers.set(pc, answer);
    }

    const summary = () =>
      `load-crime · latest month ${latest} · window ${months[0]}..${latest} · ${postcodes
        .map((pc) => `${pc} ${formatCount(answers.get(pc).total)} crimes`)
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
          filed.months?.length !== WINDOW_MONTHS ||
          filed.basisResidents !== expected.basisResidents
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

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(`load-crime FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
