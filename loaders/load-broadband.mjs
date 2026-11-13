// Ofcom Connected Nations — fixed broadband coverage by postcode,
// filed into postcode_cache.answers under the "broadband" key:
//
//   load-broadband — Ofcom's Connected Nations fixed coverage
//   release (snapshot January 2026 at build), Open Government
//   Licence. The release ZIP is DISCOVERED from Ofcom's publication
//   page on every run — never a hardcoded filename (plan M5.9,
//   gap G12: the Spring 2026 postcode files were re-issued mid-cycle
//   from r1 to r2 after two area files duplicated others; a loader
//   pinned to r1 would have filed the wrong data without a murmur).
//   Inside the ZIP, the all-premises postcode files are nested
//   under 202601_fixed_pc_coverage/postcode_files_r<N>/ with
//   basenames <snapshot>_fixed_pc_coverage_r<N>_<area>.csv; those
//   are the filed set. The residential-only series under
//   postcode_res_files_r<N>/ is deliberately not filed.
//
// What is filed, per postcode, exactly as published (gap G6):
// the gigabit-capable percentage is the headline figure; alongside
// it the superfast (30 Mbit/s), ultrafast (100 and 300 Mbit/s) and
// NGA percentages, the unable-to-receive percentages (2/5/10/30
// Mbit/s and "decent" from fixed or FWA), the decent-via-FWA
// percentage, and the maximum-speed band shares. Ofcom publishes
// PERCENTAGES ONLY at postcode level — no premise counts — and no
// full-fibre percentage and no fastest-speed field at this level
// (commercial confidentiality, per Ofcom's own notes); nothing here
// invents them. Every figure carries the release snapshot month.
//
// ACCESS NOTE (build, 13 Nov 2026): ofcom.org.uk returns HTTP 403
// to this build sandbox and to the M5.9 prep sandbox (Cloudflare).
// This loader is built against Ofcom's published file documentation
// ("About this data — fixed coverage", Spring 2026, v2) with
// format-faithful fixtures; its live-pull proof is OUTSTANDING and
// runs on the founder's machine (the PHI precedent, M5.3). The
// header contract below names the documented columns and, on any
// mismatch, fails with the file's actual headers in the message so
// the first real pull is self-diagnosing. --file mode files a
// downloaded release without touching ofcom.org.uk.
//
// Filing is the answers pattern (like load-crime / load-epc): one
// transaction stages every postcode's answer and merges it into
// postcode_cache.answers; postcodes the new release no longer
// carries lose their stale key in the same transaction. A failed
// load never overwrites the last good copy.
//
// Modes:
//   node loaders/load-broadband.mjs                  discover + file
//   node loaders/load-broadband.mjs --verify-only    discover +
//     structural checks, files nothing
//   node loaders/load-broadband.mjs --file <dir>     file a local
//     release folder: release.json plus real-shaped all-premises
//     postcode entries at any depth below it.
//
// Exits non-zero on any failure and prints
// "load-broadband FAILED: …" to stderr.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import yauzl from "yauzl";

const USER_AGENT = "CheckMyNextHome/1.0 (+https://checkmynexthome.co.uk)";

export const PUBLICATION_PAGE =
  process.env.OFCOM_CN_PAGE ??
  "https://www.ofcom.org.uk/phones-and-broadband/coverage-and-speeds/connected-nations-update-spring-2026";
export const SOURCE_NAME = "Ofcom Connected Nations — fixed broadband coverage";
export const ANSWER_KEY = "broadband";

// Documented postcode-file columns (Ofcom, "About this data — fixed
// coverage", Spring 2026 v2), normalised for matching: lowercase,
// whitespace collapsed. The two ultrafast columns are distinguished
// in the document by their descriptions: "(100Mbit/s)" is 100, the
// bare "UFBB availability" is 300.
const COL = {
  postcode: "postcode_space",
  superfast: "sfbb availability (% premises)",
  ultrafast100: "ufbb (100mbit/s) availability (% premises)",
  ultrafast300: "ufbb availability (% premises)",
  gigabit: "gigabit availability (% premises)",
  nga: "% of premises with nga",
  unable2: "% of premises unable to receive 2mbit/s",
  unable5: "% of premises unable to receive 5mbit/s",
  unable10: "% of premises unable to receive 10mbit/s",
  unable30: "% of premises unable to receive 30mbit/s",
  unableDecent: "% of premises unable to receive decent broadband from fixed or fwa",
  decentFwa: "% of premises able to receive decent broadband from fwa",
  bandLt2: "% of premises with 0<2mbit/s download speed",
  band2to5: "% of premises with 2<5mbit/s download speed",
  band5to10: "% of premises with 5<10mbit/s download speed",
  band10to30: "% of premises with 10<30mbit/s download speed",
  band30to300: "% of premises with 30<300mbit/s download speed",
  band300Plus: "% of premises with >=300mbit/s download speed",
};

const normaliseHeader = (h) => h.replace(/\s+/g, " ").trim().toLowerCase();

export function* csvRecords(text) {
  let field = "";
  let record = [];
  let inQuotes = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      yield record;
      record = [];
    } else field += c;
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    yield record;
  }
}

const pct = (raw, postcode, field) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error(`broadband: ${field} "${raw}" for ${postcode} is not a percentage`);
  }
  return n;
};

// Parse one postcode-area CSV into answer rows. Speed-band rule
// (Ofcom, "About this data — fixed broadband coverage and full
// fibre take-up 2026", v2): each band is the percentage of ALL
// premises in the postcode whose maximum download speed falls in
// that range. Premises that could not be matched to at least one
// provider record with a non-zero predicted speed are
// UNCLASSIFIED — they count in the denominator but sit in no
// band — so the six bands legitimately sum to LESS than 100, the
// shortfall is the postcode's unclassified share, and a sum of
// exactly 0 is the legitimate limiting case (no matched
// premises). Only a sum OVER 100 (beyond a small rounding
// tolerance) signals a mis-mapped column; every single band is
// separately held to [0, 100] by pct() below.
export function parsePostcodeCsv(text, release) {
  const records = [...csvRecords(text)];
  if (records.length < 2) throw new Error("broadband: postcode file has no rows");
  const header = records[0].map(normaliseHeader);
  const index = new Map(header.map((h, i) => [h, i]));
  for (const name of Object.values(COL)) {
    if (!index.has(name)) {
      throw new Error(
        `broadband: missing column "${name}"; file headers: ${records[0].join(" | ")}`,
      );
    }
  }
  const get = (rec, name) => rec[index.get(name)];
  const rows = [];
  for (const rec of records.slice(1)) {
    if (rec.length === 1 && rec[0] === "") continue;
    const postcode = get(rec, COL.postcode).trim().toUpperCase();
    if (!/^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$/.test(postcode)) {
      throw new Error(`broadband: unexpected postcode "${postcode}"`);
    }
    const bands = {
      under_2: pct(get(rec, COL.bandLt2), postcode, "band 0<2"),
      "2_to_5": pct(get(rec, COL.band2to5), postcode, "band 2<5"),
      "5_to_10": pct(get(rec, COL.band5to10), postcode, "band 5<10"),
      "10_to_30": pct(get(rec, COL.band10to30), postcode, "band 10<30"),
      "30_to_300": pct(get(rec, COL.band30to300), postcode, "band 30<300"),
      "300_plus": pct(get(rec, COL.band300Plus), postcode, "band >=300"),
    };
    const bandSum = Object.values(bands).reduce((a, b) => a + b, 0);
    // Bands are shares of all premises and may sum below 100 (the
    // shortfall is the unclassified share — see the rule above);
    // only a sum over 100, beyond a small rounding tolerance,
    // means a column is mis-mapped.
    if (bandSum > 100.5) {
      throw new Error(
        `broadband: speed bands for ${postcode} sum to ${bandSum}, over 100 — a column is mis-mapped (bands are shares of all premises; a sum below 100 is legitimate, the shortfall being the unclassified share of unmatched / zero-predicted-speed premises — Ofcom, "About this data — fixed broadband coverage and full fibre take-up 2026")`,
      );
    }
    rows.push({
      postcode,
      answer: {
        basis: "All premises",
        snapshot: release.snapshotLabel,
        gigabit_capable_pct: pct(get(rec, COL.gigabit), postcode, "gigabit"),
        superfast_30_pct: pct(get(rec, COL.superfast), postcode, "superfast"),
        ultrafast_100_pct: pct(get(rec, COL.ultrafast100), postcode, "ultrafast 100"),
        ultrafast_300_pct: pct(get(rec, COL.ultrafast300), postcode, "ultrafast 300"),
        nga_pct: pct(get(rec, COL.nga), postcode, "NGA"),
        unable_2_pct: pct(get(rec, COL.unable2), postcode, "unable 2"),
        unable_5_pct: pct(get(rec, COL.unable5), postcode, "unable 5"),
        unable_10_pct: pct(get(rec, COL.unable10), postcode, "unable 10"),
        unable_30_pct: pct(get(rec, COL.unable30), postcode, "unable 30"),
        unable_decent_fixed_or_fwa_pct: pct(get(rec, COL.unableDecent), postcode, "unable decent"),
        decent_via_fwa_pct: pct(get(rec, COL.decentFwa), postcode, "decent via FWA"),
        speed_band_pct: bands,
      },
    });
  }
  return rows;
}

// The golden postcodes (D10) — structural checks only. No coverage
// figure for any postcode is asserted anywhere in this loader: none
// has been measured (Ofcom 403, see the header note), and inventing
// one would poison the golden set.
export const GOLDEN_POSTCODES = ["CM3 2JT", "E16 1GN", "KT17 1FH"];

export function structuralChecks(rows, { full }) {
  const problems = [];
  if (full && rows.length < 1_000_000) {
    problems.push(`only ${rows.length} postcode rows — a national release carries ~1.74M`);
  }
  const byPostcode = new Map(rows.map((r) => [r.postcode, r]));
  if (byPostcode.size !== rows.length) problems.push("duplicate postcodes in the release");
  for (const pc of GOLDEN_POSTCODES) {
    if (!byPostcode.has(pc)) problems.push(`golden postcode ${pc} missing from the release`);
  }
  if (problems.length > 0) {
    throw new Error(`structural checks failed:\n  - ${problems.join("\n  - ")}`);
  }
}

const CHUNK = 500;

export async function fileBroadband(client, rows) {
  await client.query("BEGIN");
  try {
    await client.query(`CREATE TEMP TABLE broadband_stage (
        postcode text PRIMARY KEY, answer jsonb
      ) ON COMMIT DROP`);
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const values = [];
      const params = [];
      chunk.forEach((r, j) => {
        const b = j * 2;
        values.push(`($${b + 1}, $${b + 2}::jsonb)`);
        params.push(r.postcode, JSON.stringify(r.answer));
      });
      await client.query(
        `INSERT INTO broadband_stage (postcode, answer) VALUES ${values.join(", ")} ON CONFLICT (postcode) DO NOTHING`,
        params,
      );
    }
    // The answer carries its own snapshot; the row's source stamps
    // stay the postcode directory's (the crime/EPC pattern).
    const updated = await client.query(
      `UPDATE postcode_cache SET answers = answers || jsonb_build_object('broadband', s.answer)
       FROM broadband_stage s WHERE postcode_cache.postcode = s.postcode`,
    );
    await client.query(
      `UPDATE postcode_cache SET answers = answers - 'broadband'
       WHERE answers ? 'broadband'
         AND postcode NOT IN (SELECT postcode FROM broadband_stage)`,
    );
    await client.query("COMMIT");
    return updated.rowCount ?? 0;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }
}

async function fetchRetry(url, { binary = false } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (res.ok) return binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
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

// Resolve the current release's ZIPs from the publication page.
// Returns {fixedZipUrl, mobileZipUrl} — either may be null if the
// page does not link it (the caller decides whether that is fatal).
export async function discoverReleaseZips(pageUrl = PUBLICATION_PAGE) {
  const html = await fetchRetry(pageUrl);
  const hrefs = [...html.matchAll(/href="([^"]+\.zip(?:\?[^"]*)?)"/gi)].map((m) => m[1]);
  const absolute = hrefs.map((h) => new URL(h, pageUrl).toString());
  const fixed = absolute.find((u) => /fixed/i.test(u) && /broadband/i.test(u));
  const mobile = absolute.find((u) => /mobile/i.test(u));
  return { fixedZipUrl: fixed ?? null, mobileZipUrl: mobile ?? null };
}

function readZipEntries(buffer, predicate) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      const out = new Map();
      zip.readEntry();
      zip.on("entry", (entry) => {
        if (!predicate(entry.fileName)) return zip.readEntry();
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr) return reject(streamErr);
          const chunks = [];
          stream.on("data", (c) => chunks.push(c));
          stream.on("end", () => {
            out.set(entry.fileName, Buffer.concat(chunks).toString("utf8"));
            zip.readEntry();
          });
          stream.on("error", reject);
        });
      });
      zip.on("end", () => resolve(out));
      zip.on("error", reject);
    });
  });
}

// Ofcom abbreviates "postcode" to "pc" in the real file names.
// Requiring _r<N> immediately after "coverage" is load-bearing:
// the residential series is _fixed_pc_coverage_res_r<N>_<area>.csv
// and must never match this all-premises pattern.
export const POSTCODE_FILE = /_fixed_pc_coverage_r(\d+)_([A-Z]+)\.csv$/i;

export function releaseFromNames(names) {
  const first = names[0]?.split(/[\\/]/).pop();
  const match = first?.match(/^(\d{6})_/);
  if (!match) throw new Error(`broadband: cannot read a snapshot from "${first}"`);
  const yyyymm = match[1];
  const snapshot = `${yyyymm.slice(0, 4)}-${yyyymm.slice(4)}`;
  const rev = names.map((n) => n.match(POSTCODE_FILE)?.[1]).filter(Boolean);
  return {
    snapshot,
    snapshotLabel: snapshot,
    sourceDate: `${snapshot}-01`,
    revision: rev.length ? `r${Math.max(...rev.map(Number))}` : null,
  };
}

// Load a release into answer rows: from a local folder (--file) or
// by discovery + download (live).
export async function loadBroadbandRows({ fileDir = null } = {}) {
  let release;
  let files;
  if (fileDir) {
    release = JSON.parse(await readFile(join(fileDir, "release.json"), "utf8"));
    const paths = [];
    const walk = async (dir) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (entry.isFile() && POSTCODE_FILE.test(entry.name)) paths.push(path);
      }
    };
    await walk(fileDir);
    if (paths.length === 0) throw new Error(`broadband: no postcode files in ${fileDir}`);
    files = new Map();
    for (const path of paths) {
      files.set(path.split(/[\\/]/).pop(), await readFile(path, "utf8"));
    }
  } else {
    const { fixedZipUrl } = await discoverReleaseZips();
    if (!fixedZipUrl) {
      throw new Error("broadband: no fixed-broadband ZIP linked from the publication page");
    }
    const buffer = await fetchRetry(fixedZipUrl, { binary: true });
    files = await readZipEntries(buffer, (name) => POSTCODE_FILE.test(name));
    if (files.size === 0) throw new Error("broadband: the release ZIP holds no postcode files");
    release = releaseFromNames([...files.keys()].map((k) => k.split("/").pop()));
  }
  const rows = [];
  for (const [name, text] of files) {
    rows.push(...parsePostcodeCsv(text, release));
  }
  return { release, rows };
}

async function run() {
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  const fileAt = args.indexOf("--file");
  const fileDir = fileAt >= 0 ? args[fileAt + 1] : null;
  if (fileAt >= 0 && !fileDir) throw new Error("--file needs a directory");

  const { release, rows } = await loadBroadbandRows({ fileDir });
  structuralChecks(rows, { full: !fileDir });
  const base = `load-broadband · Connected Nations ${release.snapshotLabel}${release.revision ? ` (${release.revision})` : ""} · ${rows.length.toLocaleString("en-GB")} postcodes`;
  if (verifyOnly) {
    console.log(`${base} — structural checks OK (verify-only, nothing filed)`);
    return;
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const client = await pool.connect();
    let updated;
    try {
      updated = await fileBroadband(client, rows);
    } finally {
      client.release();
    }
    console.log(`${base} — ${updated.toLocaleString("en-GB")} answers filed`);
  } finally {
    await pool.end();
  }
}

const invokedAsScript = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedAsScript) {
  run().catch((err) => {
    console.error(`load-broadband FAILED: ${err.message}`);
    process.exit(1);
  });
}
