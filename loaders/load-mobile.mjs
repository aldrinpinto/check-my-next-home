// Ofcom Connected Nations — mobile coverage, filed into
// postcode_cache.answers under the "mobile" key:
//
//   load-mobile — the mobile companion to load-broadband, from the
//   same Connected Nations release (discovered from the same
//   publication page; plan M5.9 gap G7: mobile is in V1).
//
// THE GRAIN, stated plainly: Ofcom does not publish mobile coverage
// by postcode — it says so itself (the pixel-level data is not
// released; the address-level checker API is per-address, not bulk).
// The published bulk file is at LOCAL AUTHORITY level:
// <snapshot>_mobile_coverage_laua_r<N>.csv, one row per local or
// unitary authority, percentages of premises with coverage from
// exactly 0, 1, 2, 3 or 4 operators for each service. This loader
// files each postcode the answer for ITS OWN local authority (the
// council the postcode directory already files), with the grain
// named inside the answer — an area figure, never dressed up as a
// postcode measurement. The prep's expectation of a postcode-level
// mobile file was wrong; the founder's ruling stands (mobile is
// included), the design absorbs the true grain.
//
// What is filed per authority, from the published columns: for
// Voice, 4G, ordinary 5G (high and very high confidence) and 5G
// Standalone (high and very high confidence), the outdoor
// percentages with no operator and with all operators, plus
// Ofcom's own sanctioned derivation for "at least one operator"
// (100 minus the no-operator percentage — Spring 2026
// About-this-data note 4), with the published inputs filed beside
// it so the derivation is auditable. Voice's all-operators column
// is _3, not _4: the real file publishes Voice for a maximum of
// three operators. The 5G SA _4 columns are present but empty —
// one operator does not deploy 5G SA — so their all-operators
// figure files as null while the published no-operator figure and
// its derivation still file. Of the filed services, only 4G also
// carries an indoor set; every 5G variant is outdoor-only.
//
// There is NO Data service in the Spring 2026 file. Older Ofcom
// documentation (through Spring 2025) listed an aggregate Data
// family, and this loader originally required it; the founder's
// live run on 13 Nov 2026 proved the shipped Spring 2026 file has
// no Data_* columns, and the Spring 2026 About-this-data service
// list omits Data. It is not reconstructed from 4G: the older
// aggregate was defined from combined 3G/4G thresholds, so 4G
// alone is not the same measure.
//
// Access, filing discipline and modes mirror load-broadband:
// ofcom.org.uk 403s this build sandbox. The founder-machine pull
// supplied the real Spring 2026 header shape this loader and its
// fixture now follow; the corrected loader's live-pull proof is
// still outstanding. One transaction stages and merges; stale
// keys are removed in the same transaction; a failed load never
// overwrites the last good copy. Postcodes whose council matches
// no published authority are counted and named in the loader's
// output — never silently skipped.
//
// Modes:
//   node loaders/load-mobile.mjs                  discover + file
//   node loaders/load-mobile.mjs --verify-only    discover +
//     structural checks, files nothing
//   node loaders/load-mobile.mjs --file <dir>     file a local
//     release folder: release.json + the laua CSV.
//
// Exits non-zero on any failure and prints
// "load-mobile FAILED: …" to stderr.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import yauzl from "yauzl";
import { csvRecords, discoverReleaseZips } from "./load-broadband.mjs";

const USER_AGENT = "CheckMyNextHome/1.0 (+https://checkmynexthome.co.uk)";

export const SOURCE_NAME = "Ofcom Connected Nations — mobile coverage (local authority level)";
export const ANSWER_KEY = "mobile";

// Service columns consumed, by their published names
// ([Service]_[prem type]_[operator count]). `allOperators` is the
// highest published operator-count column for that service: 3 for
// Voice, 4 for the rest. (The 5G SA _4 columns exist but are
// empty in Spring 2026; see the header note.)
const SERVICES = {
  voice: { label: "Voice", allOperators: 3 },
  "4g": { label: "4G", allOperators: 4 },
  "5g_high_confidence": { label: "5G_high_confidence", allOperators: 4 },
  "5g_very_high_confidence": { label: "5G_very_high_confidence", allOperators: 4 },
  "5g_sa_high_confidence": { label: "5G_SA_high_confidence", allOperators: 4 },
  "5g_sa_very_high_confidence": {
    label: "5G_SA_very_high_confidence",
    allOperators: 4,
  },
};
const REQUIRED_COLUMNS = [
  "laua",
  "laua_name",
  ...Object.values(SERVICES).flatMap(({ label, allOperators }) => [
    `${label}_prem_out_0`,
    `${label}_prem_out_${allOperators}`,
  ]),
  "4G_prem_in_0",
  "4G_prem_in_4",
];

// The golden homes' councils (D10) — directory facts from the
// postcode loader, not coverage figures. Their authorities must be
// present in the release and must match postcodes at filing time.
export const GOLDEN_COUNCILS = ["Braintree", "Newham", "Epsom and Ewell"];

export const normaliseCouncil = (name) => name.trim().replace(/\s+/g, " ").toLowerCase();

const pct = (raw, laua, field) => {
  if (raw === "" || raw === undefined) return null; // published empty (e.g. defunct services)
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error(`mobile: ${field} "${raw}" for ${laua} is not a percentage`);
  }
  return n;
};

const coverageSet = (noneRaw, allRaw, laua, field) => {
  const none = pct(noneRaw, laua, field);
  const all = pct(allRaw, laua, field);
  // A missing all-operators value (5G SA _4 in Spring 2026) does
  // not erase the published no-operator figure: file it as null
  // beside the figures that were published.
  if (none === null) return null;
  return {
    no_operator_pct: none,
    all_operators_pct: all,
    // Ofcom's own derivation (Spring 2026 About-this-data note 4).
    at_least_one_operator_pct: Math.round((100 - none) * 10) / 10,
  };
};

// Parse the laua CSV into {laua, lauaName, answer} rows.
export function parseLauaCsv(text, release) {
  const records = [...csvRecords(text)];
  if (records.length < 2) throw new Error("mobile: laua file has no rows");
  const header = records[0].map((h) => h.trim());
  const index = new Map(header.map((h, i) => [h, i]));
  for (const name of REQUIRED_COLUMNS) {
    if (!index.has(name)) {
      throw new Error(`mobile: missing column "${name}"; file headers: ${records[0].join(" | ")}`);
    }
  }
  const get = (rec, name) => rec[index.get(name)];
  const rows = [];
  for (const rec of records.slice(1)) {
    // A record in which every field is empty is a blank row the
    // file carries (the real Spring 2026 file ends with an empty
    // row spanning all columns): it holds no data, so skip it. A
    // record that carries values but no authority code or name is
    // a data error and still throws below.
    if (rec.every((field) => field.trim() === "")) continue;
    const laua = get(rec, "laua").trim();
    const lauaName = get(rec, "laua_name").trim();
    if (!laua || !lauaName) throw new Error("mobile: a row with no authority code or name");
    const services = {};
    for (const [key, { label, allOperators }] of Object.entries(SERVICES)) {
      services[key] = {
        outdoor: coverageSet(
          get(rec, `${label}_prem_out_0`),
          get(rec, `${label}_prem_out_${allOperators}`),
          lauaName,
          `${label} outdoor`,
        ),
      };
      if (key === "4g") {
        services[key].indoor = coverageSet(
          get(rec, "4G_prem_in_0"),
          get(rec, "4G_prem_in_4"),
          lauaName,
          "4G indoor",
        );
      }
    }
    rows.push({
      laua,
      lauaName,
      answer: {
        basis:
          "Local authority area — Ofcom publishes mobile coverage at local-authority level, not by postcode",
        snapshot: release.snapshotLabel,
        laua,
        laua_name: lauaName,
        services,
      },
    });
  }
  return rows;
}

export function structuralChecks(rows, { full }) {
  const problems = [];
  if (full && rows.length < 300) {
    problems.push(`only ${rows.length} authorities — a national release carries ~361`);
  }
  const names = new Set(rows.map((r) => normaliseCouncil(r.lauaName)));
  for (const council of GOLDEN_COUNCILS) {
    if (!names.has(normaliseCouncil(council))) {
      problems.push(`golden council "${council}" missing from the release`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`structural checks failed:\n  - ${problems.join("\n  - ")}`);
  }
}

const CHUNK = 500;

export async function fileMobile(client, rows) {
  await client.query("BEGIN");
  try {
    await client.query(`CREATE TEMP TABLE mobile_stage (
        laua_name text, laua_norm text PRIMARY KEY, answer jsonb
      ) ON COMMIT DROP`);
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const values = [];
      const params = [];
      chunk.forEach((r, j) => {
        const b = j * 3;
        values.push(`($${b + 1}, $${b + 2}, $${b + 3}::jsonb)`);
        params.push(r.lauaName, normaliseCouncil(r.lauaName), JSON.stringify(r.answer));
      });
      await client.query(
        `INSERT INTO mobile_stage (laua_name, laua_norm, answer) VALUES ${values.join(", ")}`,
        params,
      );
    }
    const updated = await client.query(
      `UPDATE postcode_cache SET answers = answers || jsonb_build_object('mobile', s.answer)
       FROM mobile_stage s
       WHERE lower(regexp_replace(trim(postcode_cache.council), '\\s+', ' ', 'g')) = s.laua_norm`,
    );
    // Any postcode still holding a mobile key that this release did
    // not just refresh belongs to an unmatched or renamed council —
    // clear it rather than serve a stale area figure as current.
    await client.query(
      `UPDATE postcode_cache SET answers = answers - 'mobile'
       WHERE answers ? 'mobile'
         AND lower(regexp_replace(trim(council), '\\s+', ' ', 'g'))
             NOT IN (SELECT laua_norm FROM mobile_stage)`,
    );
    const unmatched = await client.query(
      `SELECT council, COUNT(*)::int AS n FROM postcode_cache
       WHERE council IS NOT NULL
         AND lower(regexp_replace(trim(council), '\\s+', ' ', 'g'))
             NOT IN (SELECT laua_norm FROM mobile_stage)
       GROUP BY council ORDER BY council`,
    );
    await client.query("COMMIT");
    return { updated: updated.rowCount ?? 0, unmatched: unmatched.rows };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }
}

async function fetchBinary(url) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      if (res.status === 403) {
        throw new Error(
          `Ofcom returned HTTP 403 for ${url.split("?")[0]} — this network is blocked by Ofcom's Cloudflare (known; the live pull runs from an unblocked network or via --file)`,
        );
      }
      if (res.status !== 429 && res.status < 500) {
        throw new Error(`${url} returned HTTP ${res.status}`);
      }
      lastError = new Error(`${url} returned HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
      if (/returned HTTP|HTTP 403/.test(err.message)) throw err;
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 3000));
  }
  throw lastError;
}

const LAUA_FILE = /_mobile_coverage_laua_r\d+\.csv$/i;

function readZipEntry(buffer, predicate) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      let found = null;
      zip.readEntry();
      zip.on("entry", (entry) => {
        if (!predicate(entry.fileName)) return zip.readEntry();
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr) return reject(streamErr);
          const chunks = [];
          stream.on("data", (c) => chunks.push(c));
          stream.on("end", () => {
            found = { name: entry.fileName, text: Buffer.concat(chunks).toString("utf8") };
            zip.readEntry();
          });
          stream.on("error", reject);
        });
      });
      zip.on("end", () => resolve(found));
      zip.on("error", reject);
    });
  });
}

export function releaseFromLauaName(name) {
  const match = name.match(/(\d{6})_mobile_coverage_laua_r(\d+)\.csv$/i);
  if (!match) throw new Error(`mobile: cannot read a snapshot from "${name}"`);
  const snapshot = `${match[1].slice(0, 4)}-${match[1].slice(4)}`;
  return { snapshot, snapshotLabel: snapshot, revision: `r${match[2]}` };
}

export async function loadMobileRows({ fileDir = null } = {}) {
  let release;
  let text;
  if (fileDir) {
    release = JSON.parse(await readFile(join(fileDir, "release.json"), "utf8"));
    const names = (await readdir(fileDir)).filter((n) => LAUA_FILE.test(n));
    if (names.length !== 1) {
      throw new Error(`mobile: expected one laua CSV in ${fileDir}, found ${names.length}`);
    }
    text = await readFile(join(fileDir, names[0]), "utf8");
  } else {
    const { mobileZipUrl } = await discoverReleaseZips();
    if (!mobileZipUrl) {
      throw new Error("mobile: no mobile ZIP linked from the publication page");
    }
    const entry = await readZipEntry(await fetchBinary(mobileZipUrl), (name) =>
      LAUA_FILE.test(name.split("/").pop()),
    );
    if (!entry) throw new Error("mobile: the release ZIP holds no laua file");
    release = releaseFromLauaName(entry.name.split("/").pop());
    text = entry.text;
  }
  return { release, rows: parseLauaCsv(text, release) };
}

async function run() {
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  const fileAt = args.indexOf("--file");
  const fileDir = fileAt >= 0 ? args[fileAt + 1] : null;
  if (fileAt >= 0 && !fileDir) throw new Error("--file needs a directory");

  const { release, rows } = await loadMobileRows({ fileDir });
  structuralChecks(rows, { full: !fileDir });
  const base = `load-mobile · Connected Nations ${release.snapshotLabel}${release.revision ? ` (${release.revision})` : ""} · ${rows.length} authorities`;
  if (verifyOnly) {
    console.log(`${base} — structural checks OK (verify-only, nothing filed)`);
    return;
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const client = await pool.connect();
    let result;
    try {
      result = await fileMobile(client, rows);
    } finally {
      client.release();
    }
    const unmatchedNote =
      result.unmatched.length > 0
        ? ` — WARNING: ${result.unmatched.length} councils matched no authority (${result.unmatched
            .slice(0, 5)
            .map((u) => `${u.council} ${u.n}`)
            .join(", ")}${result.unmatched.length > 5 ? ", …" : ""})`
        : "";
    console.log(
      `${base} — ${result.updated.toLocaleString("en-GB")} answers filed${unmatchedNote}`,
    );
  } finally {
    await pool.end();
  }
}

const invokedAsScript = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedAsScript) {
  run().catch((err) => {
    console.error(`load-mobile FAILED: ${err.message}`);
    process.exit(1);
  });
}
