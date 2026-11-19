// Cold probe — the play server's weekly first-check
// sentinel (cold-check fix stack, 19 Nov 2026).
//
// Why: on 19 Nov 2026 a first check on any postcode
// with no filed data failed WHOLE on the play server
// (the sold-prices cold load's bounded wait expired,
// its rejection poisoned the check assembly, and the
// visitor got the error page) — and nothing automated
// noticed, because every automated check only ever
// visited postcodes that were already filed. The E2E
// cold specs (e2e/cold.e2e.ts) guard the test world;
// this probe guards the real one: once a week it runs
// ONE genuine first check against the served app on
// this machine, so a cold-check regression is caught
// by the probe instead of by a visitor.
//
// What it does, per run:
//   1. Reads the pool (default scripts/cold-probe-pool.txt
//      — real postcodes, one per line, # comments) and
//      the state file (default scripts/cold-probe-state.txt
//      beside this script; created on first use).
//   2. Picks the FIRST pool postcode with no line in
//      the state file — one new cold postcode per run,
//      worked through in pool order.
//   3. Requests the served whole-postcode check,
//      GET http://localhost:3000/search?postcode=<pc>
//      (redirects followed; 120s budget — a cold check
//      spends the sold-prices bounded wait by design).
//   4. Passes only when the response is 200, carries
//      results markers (the results head / section
//      markup) and does NOT carry the error page (its
//      heading or its marker class).
//   5. Appends "<postcode>\t<OK|FAIL>\t<timestamp>\t<detail>"
//      to the state file and exits 0 (OK) or 1 (FAIL,
//      with the reason printed). A transport failure
//      (server down, timeout) prints the reason and
//      exits 1 WITHOUT recording the postcode, so the
//      next run retries the same one. When the pool is
//      exhausted it prints so, prominently, and exits
//      0 — refilling the pool is a human job.
//
// Usage (on the play server, from the repo root):
//   node scripts/cold-probe.mjs [--pool <path>] [--state <path>]
// Dependency-free Node (fetch is built in); it runs
// against localhost, so it never leaves the machine.

import { appendFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:3000";
const TIMEOUT_MS = 120_000;

// The served error page's fingerprints — the heading
// is components/ErrorPage.tsx's ERROR_PAGE_HEADING,
// duplicated here (the probe is a standalone script,
// and the e2e specs duplicate their literals the same
// way).
const ERROR_HEADING = "Well — that wasn't supposed to happen";
const ERROR_MARKER = "error-page";
// Results markers: any of these in the served HTML
// means the results rendered (the head, or any
// section block).
const RESULTS_MARKERS = ["results-head", "data-section=", 'class="results'];

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readLines(path) {
  try {
    return (await readFile(path, "utf8")).split("\n");
  } catch {
    return [];
  }
}

const poolPath = argValue("--pool") ?? join(HERE, "cold-probe-pool.txt");
const statePath = argValue("--state") ?? join(HERE, "cold-probe-state.txt");

const pool = (await readLines(poolPath))
  .map((line) => line.trim().toUpperCase())
  .filter((line) => line !== "" && !line.startsWith("#"));
const probed = new Set(
  (await readLines(statePath))
    .map((line) => line.split("\t")[0]?.trim().toUpperCase())
    .filter(Boolean),
);

const next = pool.find((postcode) => !probed.has(postcode));
if (next === undefined) {
  console.log(
    `cold-probe: POOL EXHAUSTED — all ${pool.length} postcodes in ${poolPath} have been probed. ` +
      `Add more real postcodes to the pool; the weekly cold check is NOT running until then.`,
  );
  process.exit(0);
}

const url = `${BASE}/search?postcode=${encodeURIComponent(next)}`;
console.log(`cold-probe: probing ${next} via ${url}`);

let response;
try {
  response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
} catch (error) {
  console.error(
    `cold-probe: FAIL ${next} — the request itself failed (${error?.message ?? error}); ` +
      `not recorded, so the next run retries this postcode.`,
  );
  process.exit(1);
}

const body = await response.text();
const timestamp = new Date().toISOString();

async function record(verdict, detail) {
  await appendFile(statePath, `${next}\t${verdict}\t${timestamp}\t${detail}\n`, "utf8");
}

if (response.status !== 200) {
  await record("FAIL", `HTTP ${response.status}`);
  console.error(`cold-probe: FAIL ${next} — HTTP ${response.status} (expected 200).`);
  process.exit(1);
}
if (body.includes(ERROR_HEADING) || body.includes(ERROR_MARKER)) {
  await record("FAIL", "the error page was served");
  console.error(
    `cold-probe: FAIL ${next} — the error page was served for a first check (the 19 Nov 2026 failure form).`,
  );
  process.exit(1);
}
if (!RESULTS_MARKERS.some((marker) => body.includes(marker))) {
  await record("FAIL", "no results markers in the served page");
  console.error(
    `cold-probe: FAIL ${next} — the served page carried no results markers (neither the results head nor any section).`,
  );
  process.exit(1);
}

await record("OK", "results rendered");
console.log(`cold-probe: OK ${next} — the first check rendered its results.`);
