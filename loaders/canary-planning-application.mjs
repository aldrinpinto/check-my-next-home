// Planning applications canary probe (plan step M5.12).
//
// M5.12's V1 deliverable is the per-council hand-off state
// (built at M6.12) plus THIS probe: the step's named source,
// planning.data.gov.uk's `planning-application` dataset, is a
// specification with no data behind it — the dataset page
// publishes 0 entities and 0 data providers, its collector has
// never run, and LPAs are not required to share application
// data to the specification. There is nothing to load. What
// earns a monthly look is the dataset STARTING to collect:
// the day either count moves off zero, M5.12 re-opens as a
// filing step (the next free migration number; the field
// mapping is already done in the M5.12 prep, Section 1.3).
// The number is deliberately not named: an earlier draft of
// this probe named 0014, which council tax has since taken
// (corrected at M6.12) — a hard-coded number in a warning
// goes stale the same way twice.
//
// Three states, kept strictly separate:
// - 0 entities AND 0 providers: a healthy success — "still
//   empty", the hand-off state stands.
// - Either count non-zero: warning-grade — nothing is broken,
//   but the operator must act (re-open M5.12 as a filing step).
// - HTTP 503/403 or a network failure: "source unreachable",
//   reported as a skip in its own words (the Ofcom precedent
//   in canary.mjs) — NEVER read as "still empty". The platform
//   returned 503 to the build sandbox throughout prep day and
//   again at this build's start gate (13 Nov 2026), so from
//   some networks this probe will sit in the unreachable state
//   for long stretches; that is the honest answer there.
//
// This module is deliberately standalone (canary.mjs carries
// every other probe inline): it is wired into canary.mjs's
// runCanaryProbes by one import and one run line —
//   import { probePlanningApplication } from "./canary-planning-application.mjs";
//   await run("planning-application", probePlanningApplication);
// — left to the parent so this build never edits canary.mjs
// under a concurrent build.

const DATASET_JSON_URL = "https://www.planning.data.gov.uk/dataset/planning-application.json";
const DATASET_PAGE_URL = "https://www.planning.data.gov.uk/dataset/planning-application";
const PROBE_HEADERS = {
  Accept: "application/json",
  "User-Agent": "CheckMyNextHome/1.0 (+https://checkmynexthome.co.uk)",
};

// Mirrors canary.mjs's fetchRetry: one retry, 5xx and 429
// throw, other statuses return for the caller to read.
async function fetchRetry(url, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.status >= 500 || response.status === 429)
        throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw lastError;
}

// The two published counts, read from the dataset record.
// The entity count is the record's `entity-count`; the
// provider count is a `providers` list or a `provider-count`
// number on the same record, falling back to the dataset
// page's own "Data providers: N" line — the page is where the
// prep read both figures. An unreadable entity count is a
// shape change and throws (an alert), never a silent zero; an
// unreadable provider count comes back null for the probe to
// resolve, for the same reason.
export function planningApplicationCounts(dataset, pageHtml) {
  const entities = dataset?.["entity-count"];
  if (!Number.isInteger(entities) || entities < 0)
    throw new Error(
      "the planning-application dataset record carries no readable entity-count — the platform's shape changed",
    );
  let providers = null;
  if (Array.isArray(dataset?.providers)) providers = dataset.providers.length;
  else if (Number.isInteger(dataset?.["provider-count"])) providers = dataset["provider-count"];
  if (providers === null && typeof pageHtml === "string") {
    const m = pageHtml.match(/Data providers[^0-9]*(\d+)/);
    if (m) providers = Number.parseInt(m[1], 10);
  }
  return { entities, providers };
}

function sourceUnreachable(detail) {
  return {
    skipped:
      `source unreachable — ${detail}; the planning-application dataset's state is ` +
      `unknown this month, which is not read as "still empty"`,
  };
}

export function probePlanningApplication() {
  return (async () => {
    let response;
    try {
      response = await fetchRetry(DATASET_JSON_URL, { headers: PROBE_HEADERS });
    } catch (error) {
      return sourceUnreachable(`planning.data.gov.uk did not answer (${error.message})`);
    }
    if (response.status === 503 || response.status === 403)
      return sourceUnreachable(`planning.data.gov.uk answered HTTP ${response.status}`);
    if (!response.ok)
      throw new Error(`HTTP ${response.status} for the planning-application dataset record`);
    let dataset = null;
    try {
      dataset = await response.json();
    } catch {
      dataset = null;
    }
    if (dataset === null || typeof dataset !== "object")
      throw new Error(
        "the planning-application dataset record is not a JSON object — the platform's shape changed",
      );
    let counts = planningApplicationCounts(dataset, null);
    if (counts.providers === null) {
      // The record alone did not carry the provider count:
      // read it off the published dataset page, as the prep
      // did. A page that also fails to answer leaves the
      // count unreadable, which is a shape alert below — not
      // an unreachable verdict on a source that just answered.
      let pageHtml = null;
      try {
        const page = await fetchRetry(DATASET_PAGE_URL, { headers: PROBE_HEADERS });
        if (page.ok) pageHtml = await page.text();
      } catch {
        pageHtml = null;
      }
      counts = planningApplicationCounts(dataset, pageHtml);
    }
    if (counts.providers === null)
      throw new Error(
        "no provider count could be read from the planning-application dataset record or its page — the platform's shape changed",
      );
    const { entities, providers } = counts;
    if (entities === 0 && providers === 0) {
      return {
        logLine:
          "canary planning-application · still empty — 0 entities, 0 providers on planning.data.gov.uk; " +
          "collection has not started, so M5.12 stays the hand-off state",
        sourceDate: null,
      };
    }
    return {
      warning: true,
      logLine:
        `canary planning-application · collection has started — ${entities} entities from ${providers} providers ` +
        "on planning.data.gov.uk: re-open M5.12 as a filing step (the next free migration number; field mapping in the M5.12 prep, Section 1.3)",
      sourceDate: null,
    };
  })();
}
