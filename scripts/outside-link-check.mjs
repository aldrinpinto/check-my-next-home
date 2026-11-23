// The outside-link robot (plan step M8.7).
//
// Once a week this script visits every fixed outside
// destination the site serves — the GOV.UK services, the
// Ofsted page, the Nomis datasets, the register searches
// — and reports which still work. The origin lesson is
// the hand-made sample report, whose GOV.UK links rotted
// unnoticed: a link that dies must be found by this robot,
// not by a visitor.
//
// The list is NOT kept here. It is generated from the
// code's own link sources (lib/outside-links.ts derives it
// from the very constants and content the site builds its
// links from) into scripts/outside-links.json, and the
// gate test proves the two agree on every push — see
// docs/outside-link-robot-howto.md for the regeneration
// command. The robot never edits or removes a link; it
// only reports.
//
// Verdicts (the adopted prep's three):
//   works          — the destination answers and serves a
//                    page. If the FINAL landing (after
//                    redirects) differs from last week's,
//                    the link still works but is flagged
//                    for human review — a moved service is
//                    not a dead one.
//   dead           — the destination answers and the page
//                    is gone (404 / 410) or the service is
//                    erroring (5xx).
//   couldn't check — anything ambiguous: a block (401 /
//                    403 / 429), a timeout, a network or
//                    TLS failure, an odd status. A robot
//                    block is never reported as a death.
//
// Visits are gentle and honest: one visit per link, in
// sequence, with a pause between, and a User-Agent that
// names the robot and the site it checks for.
//
// The report is ONE weekly note: every link listed with
// its verdict, problems first — each problem names where
// the site shows the link and the last date it was seen
// working (kept in the state file). The note prints to
// stdout (and to the GitHub step summary when running
// there); on a problem run it also emails the project
// address through the Resend path, and the exit code is 1
// so the scheduled run itself shows the alert. A clean
// run exits 0.
//
// Scheduling: .github/workflows/outside-links.yml (weekly,
// state carried in the Actions cache). The state file's
// home is OUTSIDE_LINK_STATE (default beside this script).
//
// Usage: node scripts/outside-link-check.mjs
// Environment: RESEND_API_KEY and ALERT_EMAIL_TO as the
// heartbeat uses them (process, or .env.local / .env).

import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIST_PATH = join(HERE, "outside-links.json");
const STATE_PATH = process.env.OUTSIDE_LINK_STATE ?? join(HERE, "outside-link-state.json");
const USER_AGENT =
  "CheckMyNextHome-LinkRobot/1.0 (+https://checkmynexthome.co.uk; weekly outside-link check)";
const REQUEST_TIMEOUT_MS = 20_000;
const VISIT_PAUSE_MS = 300;

function loadEnvLocal() {
  for (const name of [".env.local", ".env"]) {
    const path = join(process.cwd(), name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}

export function loadLinkList(path = LIST_PATH) {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const links = Array.isArray(parsed) ? parsed : parsed.links;
  if (!Array.isArray(links)) throw new Error(`no link list in ${path}`);
  return links.filter(
    (link) => link && typeof link.url === "string" && /^https?:\/\//.test(link.url),
  );
}

export function readState(path = STATE_PATH) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeState(state, path = STATE_PATH) {
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}

// The verdict for one answered visit. Only a demonstrably
// gone page is "dead"; every ambiguous answer is
// "couldnt-check", never a death.
export function classifyStatus(status) {
  if (status >= 200 && status < 400) return "works";
  if (status === 404 || status === 410) return "dead";
  if (status >= 500 && status < 600) return "dead";
  return "couldnt-check";
}

async function checkOne(link, fetchImpl) {
  const base = {
    url: link.url,
    label: link.label ?? "",
    shownOn: link.shownOn ?? [],
    ...(link.pattern ? { pattern: link.pattern } : {}),
  };
  try {
    const response = await fetchImpl(link.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
    });
    // Drain the body so the connection is released; the
    // robot reads no content beyond the landing.
    if (typeof response.text === "function") {
      try {
        await response.text();
      } catch {
        // A body that fails mid-read does not change the
        // verdict the status already gave.
      }
    }
    return {
      ...base,
      verdict: classifyStatus(response.status),
      httpStatus: response.status,
      finalUrl: typeof response.url === "string" && response.url ? response.url : link.url,
      detail: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ...base,
      verdict: "couldnt-check",
      httpStatus: null,
      finalUrl: null,
      detail: error instanceof Error ? error.name : "fetch failed",
    };
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Visit every link once, in order. `state` is last week's
// record ({ [url]: { finalUrl, lastWorking, lastVerdict } });
// the returned nextState is this week's. A landing that
// changed since last week is flagged on the result
// (landingChanged) while the verdict stays "works".
export async function checkOutsideLinks(links, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const state = options.state ?? {};
  const pauseMs = options.pauseMs ?? VISIT_PAUSE_MS;
  const today = (options.now ?? new Date()).toISOString().slice(0, 10);
  const results = [];
  const nextState = {};
  for (const [index, link] of links.entries()) {
    if (index > 0 && pauseMs > 0) await sleep(pauseMs);
    const result = await checkOne(link, fetchImpl);
    const before = state[link.url] ?? {};
    const landingChanged =
      result.verdict === "works" &&
      typeof before.finalUrl === "string" &&
      before.finalUrl !== result.finalUrl;
    const lastWorking = result.verdict === "works" ? today : (before.lastWorking ?? null);
    results.push({ ...result, landingChanged, lastWorking });
    nextState[link.url] = {
      finalUrl: result.finalUrl ?? before.finalUrl ?? null,
      lastWorking,
      lastVerdict: result.verdict,
    };
  }
  return { results, nextState };
}

export function alertWorthy(results) {
  return results.some((result) => result.verdict === "dead" || result.landingChanged);
}

const MARKS = { works: "✓", dead: "✗", "couldnt-check": "?" };

// The one weekly note: problems first (each with where
// the site shows the link and when it last worked), then
// every link with its verdict — the first report lists
// them all, and every report since does the same.
export function renderNote(results, now = new Date()) {
  const dateLine = now.toISOString().slice(0, 10);
  const problems = results.filter((result) => result.verdict !== "works" || result.landingChanged);
  const lines = [`Outside-link check — ${dateLine}`, ""];
  if (problems.length === 0) {
    lines.push(`All ${results.length} outside links work.`, "");
  } else {
    lines.push("Needs attention:", "");
    for (const result of problems) {
      const shown = result.shownOn.length > 0 ? ` — shown on ${result.shownOn.join("; ")}` : "";
      if (result.verdict === "dead") {
        lines.push(
          `✗ DEAD: ${result.url} (${result.detail})${shown} — last seen working ${result.lastWorking ?? "never recorded"}`,
        );
      } else if (result.landingChanged) {
        lines.push(
          `⚑ LANDING CHANGED: ${result.url} now lands on ${result.finalUrl}${shown} — a person should check the new landing is the right service`,
        );
      } else {
        lines.push(
          `? COULDN'T CHECK: ${result.url} (${result.detail})${shown} — not a death; the visit was blocked or inconclusive`,
        );
      }
    }
    lines.push("");
  }
  lines.push("Every link:");
  for (const result of results) {
    const mark = result.landingChanged ? "⚑" : MARKS[result.verdict];
    const name = result.label ? `${result.label} — ` : "";
    const via = result.pattern ? ` (pattern: ${result.pattern}; service landing checked)` : "";
    lines.push(`${mark} ${name}${result.url}${via}`);
  }
  return lines.join("\n");
}

async function sendEmail(subject, text) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const to = process.env.ALERT_EMAIL_TO ?? "checkmynexthome@gmail.com";
  // EM-12 (founder ruling 23 Nov 2026): never Resend's
  // sandbox sender — the placed internal identity
  // (CONTACT_NOTIFICATION_FROM, loaded from .env.local
  // above) where placed, else the site's one fixed
  // proper sender, the delivery mailer's own default.
  const from =
    process.env.CONTACT_NOTIFICATION_FROM ?? "Check My Next Home <reports@checkmynexthome.co.uk>";
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function main() {
  loadEnvLocal();
  const links = loadLinkList();
  const state = readState();
  const { results, nextState } = await checkOutsideLinks(links, { state });
  writeState(nextState);
  const note = renderNote(results);
  console.log(note);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${note}\n`);
  }
  if (alertWorthy(results)) {
    const dead = results.filter((result) => result.verdict === "dead").length;
    const changed = results.filter((result) => result.landingChanged).length;
    await sendEmail(
      `Outside-link check: ${dead} dead, ${changed} landing changed — Check My Next Home`,
      note,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
