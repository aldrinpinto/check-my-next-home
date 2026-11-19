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
//   3. Requests the served whole-postcode check the
//      way a browser reaches it: GET
//      http://localhost:3000/search?postcode=<pc>, then
//      follows the route's own redirect instruction to
//      the whole-postcode page it names (see "The two
//      hops" below), and judges THAT page.
//   4. Passes only when the reached page is 200, is not
//      the error page rendered as the page, and carries
//      the results markers (see "The markers" below).
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
//
// The two hops (correction, 19 Nov 2026): the probe's
// first live run FAILED its first pool postcode
// (CB6 2FE) with "the error page was served" — a false
// alarm, proven the same evening against the served
// bytes. /search?postcode=<pc> never serves the check
// itself: the route resolves the postcode and redirects
// to the whole-postcode page (/search/home?postcode=…).
// Because the /search segment's loading shell streams
// out first, the redirect cannot be a 307 — the served
// document is a 200 shell carrying the instruction as
// a meta refresh (and a NEXT_REDIRECT flight digest).
// fetch follows HTTP redirects only, never a meta
// refresh, so the first version judged the SHELL: a
// body with no results in it at all. The probe now
// reads the refresh target out of the shell and
// requests it, the hop a browser makes on its own.
//
// The markers (same correction): the reached page
// streams its results as flight rows behind the
// checking screen, so the results' attributes arrive
// as JSON props — "className":"results-head",
// "data-section":"sold-prices" — never as the HTML
// forms class="results / data-section= the first
// version looked for. The markers below are the bare
// tokens that DO survive that serialization, proven
// present on the served bytes of a filed page (CM3
// 2JT) and a genuine first check (CB7 4EY, 11.2s, its
// sold section carrying the still-gathering line) on
// 19 Nov 2026. And the error page cannot be told by
// its heading or its class name as raw text: the
// route's error boundary ships a SERIALIZED copy of
// the error page's element tree inside every healthy
// page's flight chunks (the h1 element included), so
// the bare strings appear on every response. What a
// real failure render carries — and a healthy page
// never does — is the error page as the page's actual
// HTML: <main class="error-page">. That, plus the
// results markers' absence, is the verdict's ground.
// (The DOM-level form of the same distinction is what
// the E2E specs assert: .error-page absent, .results
// present.)

import { appendFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:3000";
const TIMEOUT_MS = 120_000;
// The route's redirect chain is one hop by design
// (/search → /search/home); three leaves room for the
// route family to grow a hop without the probe going
// blind, and no more.
const MAX_HOPS = 3;

// The error page as rendered HTML — components/
// ErrorPage.tsx's root element, in the unescaped form
// only a real render of the page carries. The bare
// heading text and the "error-page" substring are NOT
// fingerprints: both ride inside every healthy page's
// flight chunks as serialized data (see the header).
const ERROR_PAGE_MAIN = '<main class="error-page">';
// Results markers, flight form: bare tokens the served
// results carry however they are serialized — the
// results head's class, the section class, and the
// per-section key attribute's name. Proven present on
// filed and cold healthy pages (see the header); a
// whole-check failure page carries none of them.
const RESULTS_MARKERS = ["results-head", "results-section", "data-section"];

// The streamed redirect instruction: the meta refresh
// the /search shell carries when its route redirects
// after the shell has flushed. Returns the target it
// names (a path, as served), or null when the body is
// a page in its own right.
export function redirectTargetOf(body) {
  const match = /http-equiv="refresh" content="[^"]*?url=([^"]+)"/.exec(body);
  return match ? match[1] : null;
}

// The verdict on one served response. Pure — the unit
// suite (tests/cold-probe.test.ts) pins every branch
// against bodies composed from the live captures.
//   { kind: "redirect", url }  — an instruction shell:
//     follow it; the shell itself is never judged.
//   { kind: "fail", detail }   — a served failure: a
//     non-200, the error page rendered as the page, or
//     a 200 carrying none of the results.
//   { kind: "pass", detail }   — the results rendered.
export function judgeColdProbeResponse({ status, body }) {
  if (status !== 200) {
    return { kind: "fail", detail: `HTTP ${status}` };
  }
  const target = redirectTargetOf(body);
  if (target !== null) {
    return { kind: "redirect", url: target };
  }
  if (body.includes(ERROR_PAGE_MAIN)) {
    return { kind: "fail", detail: "the error page was served" };
  }
  if (!RESULTS_MARKERS.every((marker) => body.includes(marker))) {
    return { kind: "fail", detail: "no results markers in the served page" };
  }
  return { kind: "pass", detail: "results rendered" };
}

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

async function main() {
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

  const entry = `${BASE}/search?postcode=${encodeURIComponent(next)}`;
  console.log(`cold-probe: probing ${next} via ${entry}`);

  const timestamp = new Date().toISOString();
  async function record(verdict, detail) {
    await appendFile(statePath, `${next}\t${verdict}\t${timestamp}\t${detail}\n`, "utf8");
  }

  // The hops: fetch follows any true HTTP redirect on
  // its own; a streamed instruction shell is followed
  // here, by hand, the way a browser follows it. A
  // transport failure at any hop is the run's failure
  // and is NOT recorded — the next run retries the
  // same postcode.
  let url = entry;
  for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
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
    const verdict = judgeColdProbeResponse({
      status: response.status,
      body: await response.text(),
    });
    if (verdict.kind === "redirect") {
      if (hop === MAX_HOPS) {
        await record("FAIL", `still redirecting after ${MAX_HOPS} hops`);
        console.error(
          `cold-probe: FAIL ${next} — the check kept redirecting (${MAX_HOPS} hops) without reaching a page.`,
        );
        process.exit(1);
      }
      url = new URL(verdict.url, BASE).toString();
      continue;
    }
    if (verdict.kind === "fail") {
      await record("FAIL", verdict.detail);
      console.error(
        verdict.detail === "the error page was served"
          ? `cold-probe: FAIL ${next} — the error page was served for a first check (the 19 Nov 2026 failure form).`
          : `cold-probe: FAIL ${next} — ${verdict.detail} (the reached page was not a whole rendered check).`,
      );
      process.exit(1);
    }
    await record("OK", verdict.detail);
    console.log(`cold-probe: OK ${next} — the first check rendered its results.`);
    return;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
