// Green belt loader (plan step M5.2). Files the green belt
// pieces from planning.data.gov.uk, following the user-seat gap
// check of 12 Nov 2026:
//
//   npm run load:green-belt
//   npm run load:green-belt -- --verify-only
//   npm run load:green-belt -- --file tests/fixtures/green-belt
//
// What the gap check changed, and where it lives in this file:
//   - L5, the name. The file's 181 rows are per-district
//     compilations and their `name` is the DISTRICT ("Epsom and
//     Ewell"), not the belt. The loader stores the
//     `green-belt-core` value ("London") as the shape's name, so
//     no answer can ever claim a home borders something called
//     "Epsom and Ewell".
//   - Absence here IS trustworthy, unlike Article 4: MHCLG
//     compiles every local authority's annual return, so a
//     district with no piece (Braintree — asserted in the golden
//     checks) genuinely has no designated green belt. The
//     national piece count in the log line is the proof.
//   - Ended rows are excluded and counted; geometry-less rows
//     are counted, never silently dropped (none exist in the
//     12 Nov 2026 snapshot, but the count is always in the log).
//
// The dataset is an annual snapshot (returns made in March,
// published in autumn), not a live feed — that rhythm is why it
// runs in the quarterly runner group with the other M5.2
// loaders, and why its canary freshness guard is ~14 months.
//
// Source: planning.data.gov.uk bulk CSV (files host), compiled
// by the Ministry of Housing, Communities and Local Government
// from local authority returns; Open Government Licence v3.0.
// The file carries no edition date, so the source date is the
// retrieval date. Distances are to the nearest polygon EDGE on
// the longitude-scaled plane, the prep's basis — the Epsom flat
// sits 0.101 miles OUTSIDE the London belt, and a few doors one
// way would flip that, so edges are what the product must quote.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createLoaderResume } from "./loader-resume.mjs";
import { isTransientFetchError, TRANSIENT_RETRY_BUDGET_MS } from "./flood-resume.mjs";
import { createProgressLogger, formatCount, withFilingPulse } from "./progress.mjs";

const FILE_URL = "https://files.planning.data.gov.uk/dataset/green-belt.csv";
const SOURCE_GREEN_BELT = "MHCLG Green Belt (via planning.data.gov.uk)";

const HOMES = {
  "CM3 2JT": { lat: 51.776176, lng: 0.60387, lad: "E07000067" },
  "E16 1GN": { lat: 51.515224, lng: 0.021177, lad: "E09000025" },
  "KT17 1FH": { lat: 51.344571, lng: -0.247104, lad: "E07000208" },
};

// One CSV parser, quote-aware and header-keyed (the house copy —
// geometry fields are quoted WKT containing commas).
export function parseCsv(text) {
  const rows = [];
  let row = [];
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
  const header = rows[0].map((h) => h.replace(/^﻿/, "").trim());
  return rows
    .slice(1)
    .filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

// WKT POLYGON / MULTIPOLYGON → polygons → rings → [lng, lat]
// pairs. Returns null for an empty geometry; throws on anything
// malformed, because corrupt geometry is a contract breach —
// unlike an absent geometry, which is a published state.
function parseWktGeometry(wktText) {
  const text = (wktText ?? "").trim();
  if (text === "" || / EMPTY$/i.test(text)) return null;
  const typeMatch = text.match(/^(MULTIPOLYGON|POLYGON)/i);
  if (!typeMatch) throw new Error(`unsupported geometry type: ${text.slice(0, 40)}`);
  const body = text.slice(typeMatch[0].length).trim();
  let pos = 0;
  const parseGroup = () => {
    if (body[pos] !== "(") throw new Error("malformed WKT: expected (");
    pos += 1;
    const items = [];
    let token = "";
    const flush = () => {
      const t = token.trim();
      token = "";
      if (t !== "") {
        const parts = t.split(/\s+/).map(Number);
        if (parts.length !== 2 || !parts.every(Number.isFinite))
          throw new Error(`malformed WKT coordinate: "${t}"`);
        items.push(parts);
      }
    };
    while (pos < body.length) {
      const ch = body[pos];
      if (ch === "(") items.push(parseGroup());
      else if (ch === ")") {
        pos += 1;
        flush();
        return items;
      } else if (ch === ",") {
        flush();
        pos += 1;
      } else {
        token += ch;
        pos += 1;
      }
    }
    throw new Error("malformed WKT: unbalanced parentheses");
  };
  const top = parseGroup();
  const polygons = typeMatch[1].toUpperCase() === "POLYGON" ? [top] : top;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || polygon.length === 0)
      throw new Error("malformed WKT: empty polygon");
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4)
        throw new Error("malformed WKT: ring with fewer than 4 points");
      for (const pair of ring)
        if (!Array.isArray(pair) || pair.length !== 2)
          throw new Error("malformed WKT: coordinate is not a pair");
    }
  }
  return polygons;
}

function ringContains(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygonsContain(polygons, lng, lat) {
  return polygons.some((polygon) => {
    let inside = false;
    for (const ring of polygon) if (ringContains(ring, lng, lat)) inside = !inside;
    return inside;
  });
}

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const ex = ax + t * dx - px;
  const ey = ay + t * dy - py;
  return Math.sqrt(ex * ex + ey * ey);
}

// Distance from a home to the nearest polygon EDGE, miles —
// zero when the point falls inside. Longitude is scaled by
// cos(latitude); miles are degrees of latitude × 69.05.
function geometryDistanceMiles(polygons, home) {
  if (polygonsContain(polygons, home.lng, home.lat)) return 0;
  const scaleX = Math.cos((home.lat * Math.PI) / 180);
  const px = home.lng * scaleX;
  const py = home.lat;
  let best = Infinity;
  for (const polygon of polygons)
    for (const ring of polygon)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const d = segmentDistance(
          px,
          py,
          ring[j][0] * scaleX,
          ring[j][1],
          ring[i][0] * scaleX,
          ring[i][1],
        );
        if (d < best) best = d;
      }
  return best * 69.05;
}

function nearestEdge(filed, home) {
  let best = null;
  for (const item of filed) {
    const miles = geometryDistanceMiles(item.polygons, home);
    if (!best || miles < best.miles) best = { item, miles };
  }
  return best;
}

// -------------------------------------------------------------------

const CONSUMED = [
  "entity",
  "reference",
  "name",
  "organisation-entity",
  "end-date",
  "entry-date",
  "geometry",
  "point",
  "quality",
  "green-belt-core",
  "local-authority-district",
];

function checkGolden(processed) {
  const fails = [];
  const expect = (condition, message) => {
    if (!condition) fails.push(message);
  };
  const filed = processed.filed;

  for (const [postcode, home] of Object.entries(HOMES)) {
    const inside = filed.filter((item) => polygonsContain(item.polygons, home.lng, home.lat));
    expect(
      inside.length === 0,
      `${postcode}: the point falls inside a green belt piece — the golden reads say inside none`,
    );
  }

  // Epsom: a tenth of a mile outside the London belt, and the
  // filed name is the belt, never the district.
  const epsom = nearestEdge(filed, HOMES["KT17 1FH"]);
  expect(
    epsom &&
      Math.abs(epsom.miles - 0.101) <= 0.02 &&
      epsom.item.row["green-belt-core"] === "London" &&
      epsom.item.row["local-authority-district"] === "E07000208",
    `KT17 1FH: the nearest green belt edge should be the London belt's Epsom and Ewell piece at 0.101 mi, got ${
      epsom
        ? `${epsom.item.row["green-belt-core"]} (${epsom.item.row["local-authority-district"]}) at ${epsom.miles.toFixed(3)} mi`
        : "none"
    }`,
  );

  // Birkdale: Braintree has no piece in the compilation at
  // all, and no belt edge comes within 5 miles — absence here
  // is trustworthy because MHCLG compiles every authority.
  expect(
    !filed.some((item) => item.row["local-authority-district"] === HOMES["CM3 2JT"].lad),
    "no green belt piece exists for Braintree district (E07000067) — one was filed",
  );
  const birkdale = nearestEdge(filed, HOMES["CM3 2JT"]);
  expect(
    !birkdale || birkdale.miles >= 5,
    `CM3 2JT: no green belt edge should come within 5 miles, got ${birkdale?.miles.toFixed(3)} mi`,
  );

  expect(
    filed.every((item) => (item.row["green-belt-core"] ?? "") !== ""),
    "every filed piece must carry its green-belt-core — it is the name the product serves",
  );
  if (fails.length > 0) throw new Error(`golden checks failed:\n - ${fails.join("\n - ")}`);
}

// Current pieces only: ended excluded and counted;
// geometry-less current rows counted, never filed;
// unparseable geometry fails the run. Dedupe on
// reference + organisation, newest entry kept.
export function processPieces(rows) {
  let ended = 0;
  let geoless = 0;
  let invalid = 0;
  const current = [];
  for (const row of rows) {
    if ((row["end-date"] ?? "") !== "") {
      ended += 1;
      continue;
    }
    let polygons = null;
    try {
      polygons = parseWktGeometry(row.geometry ?? "");
    } catch {
      invalid += 1;
      continue;
    }
    if (polygons === null) {
      geoless += 1;
      continue;
    }
    current.push({ row, polygons });
  }
  if (invalid > 0)
    throw new Error(
      `green-belt: ${invalid} current rows carry geometry that does not parse — contract failure, nothing filed`,
    );
  const byKey = new Map();
  let duplicates = 0;
  for (const item of current) {
    const reference = (item.row.reference ?? "").trim();
    const key = reference
      ? `${reference}|${item.row["organisation-entity"] ?? ""}`
      : `entity-${item.row.entity}`;
    const prev = byKey.get(key);
    if (prev) {
      duplicates += 1;
      if ((item.row["entry-date"] ?? "") <= (prev.row["entry-date"] ?? "")) continue;
    }
    byKey.set(key, item);
  }
  return {
    total: rows.length,
    ended,
    geoless,
    current: rows.length - ended,
    filed: [...byKey.values()],
    duplicates,
  };
}

// --- filing ------------------------------------------------------------

// Stage, count, swap — with resume support (BUG-368): the
// staging is a PERSISTENT table now (migration 0048) and
// one loader_checkpoint row records the last fully staged
// 5-row chunk, so a killed run re-reads and re-processes
// the whole file (fast and deterministic) and stages only
// the pieces past the checkpoint. BUG-248 atomicity is
// unchanged: live tables change ONLY on a complete,
// verified swap, in its own transaction; staging +
// checkpoint are dropped (clear()) after a successful swap,
// and stay on any failure.
/**
 * @param {import("./progress.mjs").ProgressLogger | null} [progress]
 * @param {{ restart?: boolean, client?: any }} [options]
 */
export async function beginFiling(
  progress = null,
  { restart = false, client: injectedClient = null } = {},
) {
  // The client is injectable so the resume tests can file
  // against a fake database; production passes none and a
  // real client is opened as before.
  const client = injectedClient ?? new pg.Client({ connectionString: process.env.DATABASE_URL });
  const ownsClient = !injectedClient;
  if (ownsClient) await client.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS green_belt_stage (
         constraint_type text, name text, geom geometry(MultiPolygon, 4326),
         source_reference text, organisation text, quality text, detail text,
         source_name text, source_date date,
         loaded_at timestamptz NOT NULL DEFAULT now(),
         seq bigint NOT NULL, UNIQUE (seq)
       )`,
    );
  } catch (error) {
    if (ownsClient) await client.end().catch(() => {});
    throw error;
  }
  const resume = createLoaderResume(client, {
    loader: "load-green-belt",
    stageTable: "green_belt_stage",
    progress,
    restart,
  });
  let edition = null;
  let expected = null;
  let staged = 0;
  // The failure line's resume note: the last checkpoint
  // written (prepare seeds it with the resumed checkpoint,
  // the staging loop advances it).
  let lastNote = "the start (nothing staged yet)";
  return {
    resumeNote: () => lastNote,
    filedSoFar: () => staged,
    // Decide, from the edition and the staged rows, whether
    // the run resumes or starts from zero. Returns the
    // prepare result; the caller slices the filed array
    // from its checkpoint's next_start_index.
    async prepareResume(ed, exp) {
      edition = ed;
      expected = exp;
      const prep = await resume.prepare({ edition: ed, expected: exp });
      if (prep.resumed) {
        staged = prep.checkpoint.filed_count;
        lastNote = resume.resumeNote();
      }
      return prep;
    },
    // Stage the pieces the caller passes (already sliced
    // from the resume offset), in the house chunks of 5,
    // checkpointing per chunk. The BUG-265 file tally rides
    // as before, ticking the absolute staged count against
    // the full total.
    async stagePieces(items, sourceDate, { fileTally = null } = {}) {
      const CHUNK = 5;
      for (let at = 0; at < items.length; at += CHUNK) {
        const chunk = items.slice(at, at + CHUNK);
        const values = [];
        const params = [];
        const base = resume.takeSeq(chunk.length);
        chunk.forEach((item, i) => {
          const b = i * 10;
          values.push(
            `($${b + 1},$${b + 2},ST_Multi(ST_GeomFromText($${b + 3}, 4326)),$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`,
          );
          params.push(
            "green_belt",
            item.row["green-belt-core"] || null,
            (item.row.geometry ?? "").trim(),
            item.row.reference || null,
            item.row["organisation-entity"] || null,
            item.row.quality || null,
            null,
            SOURCE_GREEN_BELT,
            sourceDate,
            base + i,
          );
        });
        await client.query(
          `INSERT INTO green_belt_stage (constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, seq)
           VALUES ${values.join(",")}`,
          params,
        );
        staged += chunk.length;
        await resume.checkpoint({
          edition,
          expected,
          nextStartIndex: staged,
          read: staged,
          filed: staged,
          unit: "pieces",
        });
        lastNote = resume.resumeNote();
        fileTally?.tick(staged);
      }
      fileTally?.finish(staged);
    },
    // Count-check the staged pieces, then swap in one
    // transaction and verify the filed count. Staging +
    // checkpoint go together after a successful swap.
    async finishFiling(expectedPieces) {
      try {
        const stagedRes = await client.query("SELECT count(*)::int AS n FROM green_belt_stage");
        if (stagedRes.rows[0].n !== expectedPieces)
          throw new Error("the staged piece count does not match — rolling back");
        // BUG-390: one progress line per sub-step — the
        // filing previously printed one line and then went
        // silent while the single INSERT...SELECT ran.
        progress?.stage(`filing · staged count verified · ${formatCount(expectedPieces)} pieces`);
        await client.query("BEGIN");
        try {
          await client.query("DELETE FROM planning_layers WHERE constraint_type = 'green_belt'");
          progress?.stage("filing · live rows deleted");
          progress?.stage(
            `filing · copying ${formatCount(expectedPieces)} pieces into planning_layers`,
          );
          await withFilingPulse(
            progress,
            {
              stage: `filing · copying ${formatCount(expectedPieces)} pieces into planning_layers`,
            },
            () =>
              client.query(
                `INSERT INTO planning_layers (constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, loaded_at)
             SELECT constraint_type, name, geom, source_reference, organisation, quality, detail, source_name, source_date, loaded_at FROM green_belt_stage`,
              ),
          );
          progress?.stage(`filing · copy done · ${formatCount(expectedPieces)} pieces`);
          const filedCount = await client.query(
            "SELECT count(*)::int AS n FROM planning_layers WHERE constraint_type = 'green_belt'",
          );
          if (filedCount.rows[0].n !== expectedPieces)
            throw new Error("the filed piece count does not match — rolling back");
          progress?.stage(`filing · filed count verified · ${formatCount(expectedPieces)} pieces`);
          await client.query("COMMIT");
          progress?.stage(`filing · swap committed · ${formatCount(expectedPieces)} pieces live`);
        } catch (error) {
          await client.query("ROLLBACK").catch(() => {});
          throw error;
        }
        await resume.clear();
        lastNote = "the start (nothing staged yet)";
      } finally {
        if (ownsClient) await client.end().catch(() => {});
      }
    },
    async abortFiling() {
      // The staging + checkpoint STAY: they are the next
      // run's resume point.
      if (ownsClient) await client.end().catch(() => {});
    },
  };
}

// The edition for a run: the retrieval date plus a hash of
// the file text — the file carries no edition date, so the
// date guards a next-day resume (staged rows would
// otherwise carry mixed source_dates) and the hash guards
// a same-day republication.
export function greenBeltEdition(sourceDate, text) {
  return `${sourceDate}:${createHash("sha256").update(text).digest("hex").slice(0, 16)}`;
}

const RETRY_DELAYS_MS = [5000, 15000, 30000, 60000];
// BUG-385: a transient fetch failure is retried for up to 30
// minutes (TRANSIENT_RETRY_BUDGET_MS, founder-ordered 27 Nov
// 2026) — the same retry the flood loaders got in BUG-384.
// Past the budget the original error fails the run and it
// waits. The delay caps at the last schedule entry; a test
// may pass delaysMs: [] for instant retries. Non-transient
// failures throw at once (see isTransientFetchError).
async function fetchResponse(
  url,
  what,
  { delaysMs = RETRY_DELAYS_MS, onRetry = null, retryBudgetMs = TRANSIENT_RETRY_BUDGET_MS } = {},
) {
  const startedAt = Date.now();
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} for ${what}`);
        error.status = response.status;
        throw error;
      }
      return response;
    } catch (error) {
      if (!isTransientFetchError(error)) throw error;
      if (Date.now() - startedAt >= retryBudgetMs) throw error;
      const delay =
        delaysMs.length === 0 ? 0 : delaysMs[Math.min(attempt - 1, delaysMs.length - 1)];
      onRetry?.(error, attempt, delay, what);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export async function fetchText(url, what, opts) {
  // The body read stays outside the retry boundary, so a
  // parse failure fails fast instead of re-requesting.
  return (await fetchResponse(url, what, opts)).text();
}

async function main() {
  const startedAt = Date.now();
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  // BUG-368: resume from the last checkpointed chunk instead
  // of restarting; with no checkpoint this is a fresh start.
  const restart = args.includes("--restart");
  const fileAt = args.indexOf("--file");
  const fixtureMode = fileAt !== -1;
  const fixtureDir = fixtureMode ? args[fileAt + 1] : null;

  // BUG-265: one logger for the run — the parse count and
  // the filing tally below. The file is small (~181 rows),
  // so this loader gets stage + count + tally only: no
  // heartbeat fires on a run this short.
  const progress = createProgressLogger({ name: "load-green-belt" });
  let text;
  let sourceDate;
  if (fixtureMode) {
    progress.stage("reading the fixture green-belt file");
    text = await readFile(join(fixtureDir, "green-belt.csv"), "utf8");
    sourceDate = JSON.parse(await readFile(join(fixtureDir, "fixture.json"), "utf8")).captured;
  } else {
    progress.stage("downloading the green-belt file from planning.data.gov.uk");
    text = await fetchText(FILE_URL, "the green-belt download");
    sourceDate = new Date().toISOString().slice(0, 10);
  }

  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error("contract failure: the green-belt file has no rows");
  for (const header of CONSUMED) {
    if (!(header in rows[0]))
      throw new Error(`contract failure: the green-belt file no longer carries "${header}"`);
  }

  const processed = processPieces(rows);
  // BUG-265: the file's row count is the genuine total,
  // so the count carries a real percentage — rows parsed
  // against pieces to file.
  progress.count({
    label: "parse",
    done: processed.filed.length,
    total: processed.total,
    unit: "pieces",
    extra: `${formatCount(processed.ended)} ended excluded · ${formatCount(processed.geoless)} without geometry`,
  });

  if (!fixtureMode && (processed.total < 150 || processed.total > 220))
    throw new Error(
      `sanity failure: ${processed.total} green belt pieces is outside the expected band`,
    );
  checkGolden(processed);

  const summary = () =>
    `load-green-belt · planning.data.gov.uk file retrieved ${sourceDate} · ` +
    `${formatCount(processed.filed.length)} pieces filed (${formatCount(processed.current)} current of ${formatCount(processed.total)} in file · ${formatCount(processed.ended)} ended excluded · ${formatCount(processed.geoless)} without geometry counted · ${formatCount(processed.duplicates)} duplicates dropped) · ` +
    `named by the belt (green-belt-core), never by district`;

  if (verifyOnly) {
    console.log(`${summary()} · golden homes OK (verify only, nothing filed)`);
    return;
  }
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is not set — filing requires a database");

  // BUG-265: the filing runs in chunks of 5 — a line
  // every 50 pieces with the genuine total and percentage.
  const fileTally = progress.tally({
    label: "file",
    total: processed.filed.length,
    every: 50,
    unit: "pieces",
  });
  progress.stage(`filing ${formatCount(processed.filed.length)} green belt pieces`);
  // BUG-368: the filing is resumable — the edition is the
  // retrieval date plus a hash of the file text, so a kill
  // mid-stage resumes from the last checkpointed chunk
  // instead of re-staging the whole file.
  const filer = await beginFiling(progress, { restart });
  const edition = greenBeltEdition(sourceDate, text);
  try {
    const prep = await filer.prepareResume(edition, processed.filed.length);
    const startOffset = prep.resumed ? prep.checkpoint.next_start_index : 0;
    await filer.stagePieces(processed.filed.slice(startOffset), sourceDate, { fileTally });
    progress.stage(
      `swap started — filing ${formatCount(processed.filed.length)} staged pieces into planning_layers`,
    );
    await filer.finishFiling(processed.filed.length);
  } catch (error) {
    // BUG-368: the failure line carries the resume note,
    // so it names the point the next run resumes from.
    // The filing is not one transaction any more — on a
    // failure the live tables are untouched and the
    // staging stays as the resume point.
    progress.failed({
      stage: "file",
      filed: filer.filedSoFar(),
      total: processed.filed.length,
      error,
      resume: filer.resumeNote(),
    });
    await filer.abortFiling();
    throw error;
  }
  console.log(`${summary()} · golden homes OK · ${Math.round((Date.now() - startedAt) / 1000)}s`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`load-green-belt FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
