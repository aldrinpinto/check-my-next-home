// Council tax canary probe (plan step M5.10).
//
// Council tax has no feed: the seed loader
// (load-council-tax.mjs) files by hand once a year. What
// earns a monthly look is change at the publishers, in
// three shapes:
//   (a) NEXT YEAR LANDED — the MHCLG release for the tax
//       year after the filed one has appeared on GOV.UK
//       (it lands around 25 March, just before the year
//       starts): warning-grade — the spring pass is due.
//       Once the year has started, a filed year's page
//       that cannot be found is the same warning in its
//       other shape: the release is late, or it has moved.
//   (b) FILED YEAR REVISED — MHCLG re-issues releases (the
//       2025-26 tables were re-issued in April 2026, a year
//       after first publication): if the filed year's
//       release page has been updated since the date the
//       seed was filed from, warning-grade — re-run the
//       loader (its seed mode upserts, so a re-run is
//       safe) and let its golden checks judge whether any
//       filed figure actually moved.
//   (c) WALES STALE — the StatsWales composition dataset
//       updates once a year with the Welsh release; an
//       update stamp more than 400 days old means the
//       annual update was missed: warning-grade.
// A source that does not answer is "source unreachable",
// reported as a skip in its own words — NEVER read as
// "no revision" and never as "no new release" (the Ofcom
// precedent in canary.mjs). A warning found on either
// publisher is reported even if the other cannot be
// reached; the unreachable half is named in the line.
//
// Deliberately standalone, like canary-planning-
// application.mjs: wired into canary.mjs's
// runCanaryProbes by one import and one run line.

import { currentTaxYear, nextTaxYear, RELEASES } from "./load-council-tax.mjs";

const PROBE_HEADERS = {
  Accept: "application/json",
  "User-Agent": "CheckMyNextHome/1.0 (+https://checkmynexthome.co.uk)",
};
const STATSWALES_META_URL = "https://api.stats.gov.wales/v2/3ca971eb-7d9b-4b79-89fa-6d7f77431aad";

function releasePageUrl(taxYear) {
  const start = Number(taxYear.slice(0, 4));
  return `https://www.gov.uk/api/content/government/statistics/council-tax-levels-set-by-local-authorities-in-england-${start}-to-${start + 1}`;
}

// Mirrors the sibling probes' fetchRetry: one retry, 5xx
// and 429 throw, other statuses return for the caller.
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

// The decision, pure: given what the fetches found, what
// does the probe say? fetched = {
//   filedYear, filedUpdated (date string, or null when the
//   release page could not be read), filedMissing (the
//   filed year's page answered 404), nextExists (true /
//   false / null when unreadable), walesUpdated (date
//   string or null when unreadable), now (Date) }.
// Unreadable halves come back as notes; a warning anywhere
// wins over a skip, and a skip wins over healthy — an
// unreachable source is never read as a clean bill.
export function councilTaxVerdict(fetched) {
  const { filedYear, filedUpdated, filedMissing, nextExists, walesUpdated, now } = fetched;
  const nextYear = nextTaxYear(filedYear);
  const notes = [];
  if (!filedMissing && filedUpdated === null)
    notes.push("the filed year's release page could not be read");
  if (nextExists === null) notes.push("the next year's release page could not be read");
  if (walesUpdated === null) notes.push("the StatsWales dataset could not be read");

  if (nextExists === true) {
    return {
      warning: true,
      logLine:
        `canary mhclg-council-tax · the ${nextYear} council tax release has landed on GOV.UK — ` +
        `the spring pass is due: run the council-tax loader to file ${nextYear}, then record the new year in its RELEASES` +
        (notes.length > 0 ? ` (also: ${notes.join("; ")})` : ""),
      sourceDate: filedUpdated,
    };
  }
  const filedStamp = RELEASES[filedYear]?.england ?? null;
  if (filedUpdated !== null && filedStamp !== null && filedUpdated > filedStamp) {
    return {
      warning: true,
      logLine:
        `canary mhclg-council-tax · the filed ${filedYear} release has been revised — its GOV.UK page was updated ${filedUpdated}, ` +
        `after the ${filedStamp} state the seed was filed from: re-run the council-tax loader to re-seed (it upserts; its golden checks judge whether figures moved)` +
        (notes.length > 0 ? ` (also: ${notes.join("; ")})` : ""),
      sourceDate: filedUpdated,
    };
  }
  if (filedMissing) {
    return {
      warning: true,
      logLine:
        `canary mhclg-council-tax · the ${filedYear} council tax release page cannot be found on GOV.UK — ` +
        `either the new year's release is late (it usually lands around 25 March, just before the year starts) or the release has moved; check the GOV.UK statistics page` +
        (notes.length > 0 ? ` (also: ${notes.join("; ")})` : ""),
      sourceDate: null,
    };
  }
  if (walesUpdated !== null) {
    const ageDays = Math.floor((now.getTime() - Date.parse(walesUpdated)) / 86_400_000);
    if (ageDays > 400) {
      return {
        warning: true,
        logLine:
          `canary mhclg-council-tax · the StatsWales composition dataset was last updated ${walesUpdated} (${ageDays} days ago) — ` +
          `the Welsh annual update looks missed; check StatsWales before the next seed re-run` +
          (notes.length > 0 ? ` (also: ${notes.join("; ")})` : ""),
        sourceDate: filedUpdated,
      };
    }
  }
  if (notes.length > 0) {
    return {
      skipped:
        `source unreachable — ${notes.join("; ")}; the council-tax sources' state is unknown this month, ` +
        `which is not read as "no revision" and not as "no new release"`,
    };
  }
  return {
    logLine: `canary mhclg-council-tax · the filed ${filedYear} release stands unrevised and no ${nextYear} release has landed — the spring pass is not due`,
    sourceDate: filedUpdated,
  };
}

export function probeCouncilTax() {
  return (async () => {
    const now = new Date();
    const filedYear = currentTaxYear(now);
    let filedUpdated = null;
    let filedMissing = false;
    let nextExists = null;
    let walesUpdated = null;

    try {
      const response = await fetchRetry(releasePageUrl(filedYear), { headers: PROBE_HEADERS });
      if (response.status === 404) filedMissing = true;
      else if (response.ok) {
        const doc = await response.json();
        filedUpdated = (doc.public_updated_at ?? "").slice(0, 10) || null;
      }
    } catch {
      filedUpdated = null;
    }
    try {
      const response = await fetchRetry(releasePageUrl(nextTaxYear(filedYear)), {
        headers: PROBE_HEADERS,
      });
      nextExists = response.status === 404 ? false : response.ok ? true : null;
    } catch {
      nextExists = null;
    }
    try {
      const response = await fetchRetry(STATSWALES_META_URL, { headers: PROBE_HEADERS });
      if (response.ok) {
        const meta = await response.json();
        walesUpdated = (meta.last_updated_at ?? "").slice(0, 10) || null;
      }
    } catch {
      walesUpdated = null;
    }
    return councilTaxVerdict({
      filedYear,
      filedUpdated,
      filedMissing,
      nextExists,
      walesUpdated,
      now,
    });
  })();
}
