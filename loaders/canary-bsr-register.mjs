// Building Safety Register canary probe (plan step
// M5.14).
//
// The register half of M5.14 files NOTHING: no
// building-level extract of the Building Safety
// Regulator's register of high-rise residential
// buildings exists to file — the register is a
// postcode lookup by design (the search service exists
// precisely so the register is never published as
// data), so the report hands the reader to the
// official lookup (M6.16). What earns a monthly look
// is the two shapes of change that would break that
// design:
//   (a) AN EXTRACT APPEARS — a building-level official
//       dataset shows up in the data.gov.uk catalogue:
//       warning-grade — re-open the register half as a
//       filing step. The watch is three narrow phrase
//       searches ("high-rise residential building",
//       "building safety register", "higher-risk
//       building"); on 14 Nov 2026 they returned only
//       the three named service-performance datasets
//       (transaction counts for the digital services —
//       not building data), which are the recorded
//       benign baseline. ANY other title in those
//       result sets is news and is named in the line.
//   (b) THE LOOKUP CHANGES SHAPE — the GOV.UK "Find a
//       high-rise residential building" guidance stops
//       presenting the register search service, or the
//       service stops answering: warning-grade — the
//       hand-off wording and link need re-checking
//       before the next report leans on them.
// A source that does not answer is "source
// unreachable", reported as a skip in its own words —
// NEVER read as "no extract" and never as "the lookup
// is unchanged" (the house canary rule). A warning
// found on one half is reported even if the other
// cannot be reached; the unreachable half is named in
// the line.
//
// Deliberately standalone, like
// canary-planning-application.mjs and
// canary-council-tax.mjs: wired into canary.mjs's
// runCanaryProbes by one import and one run line.

const PROBE_HEADERS = { "User-Agent": "CheckMyNextHome/1.0 (+https://checkmynexthome.co.uk)" };

export const GUIDANCE_URL =
  "https://www.gov.uk/api/content/guidance/find-a-high-rise-residential-building";
export const REGISTER_SEARCH_URL =
  "https://www.register-high-rise-building.service.gov.uk/public-register/search";
export const CATALOGUE_QUERIES = [
  '"high-rise residential building"',
  '"building safety register"',
  '"higher-risk building"',
];

// The catalogue's recorded benign baseline (14 Nov
// 2026): the only titles the three phrase searches
// return, all of them service-performance statistics.
export const KNOWN_BENIGN_TITLES = new Set([
  "Register a high-rise residential building service performance data",
  "Register as a building inspector service performance data",
  "Manage a building control application for a higher-risk building service performance data",
]);

function catalogueUrl(query) {
  return `https://www.data.gov.uk/api/3/action/package_search?q=${encodeURIComponent(query)}&rows=20`;
}

// Mirrors the sibling probes' fetchRetry: one retry,
// 5xx and 429 throw, other statuses return for the
// caller.
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

// The decision, pure: given what the fetches found,
// what does the probe say? fetched = {
//   guidance: { state: "ok" | "missing" | "unreachable",
//     hasServiceLink, mentionsPostcode,
//     updated (date string or null) },
//   serviceReachable (true / false / null when the
//     check itself could not be made),
//   catalogue: { state: "ok" | "unreachable",
//     titles: [every title the phrase searches
//     returned] } }.
// A warning anywhere wins; an unreachable half with no
// warning is a skip — never read as a clean bill.
export function bsrRegisterVerdict(fetched) {
  const { guidance, serviceReachable, catalogue } = fetched;
  const notes = [];
  if (guidance.state === "unreachable") notes.push("the GOV.UK guidance page could not be read");
  if (catalogue.state === "unreachable") notes.push("the data.gov.uk catalogue could not be read");

  if (catalogue.state === "ok") {
    const novel = [...new Set(catalogue.titles)].filter((t) => !KNOWN_BENIGN_TITLES.has(t));
    if (novel.length > 0) {
      return {
        warning: true,
        logLine:
          `canary bsr-register · a possible building-level Building Safety Register dataset has appeared in the data.gov.uk catalogue: ` +
          `${novel.map((t) => `"${t}"`).join(", ")} — check whether it is a building-level official extract; ` +
          `if it is, re-open the M5.14 register half as a filing step` +
          (notes.length > 0 ? ` (also: ${notes.join("; ")})` : ""),
        sourceDate: guidance.updated,
      };
    }
  }
  if (guidance.state === "missing") {
    return {
      warning: true,
      logLine:
        `canary bsr-register · the GOV.UK "Find a high-rise residential building" guidance page cannot be found — ` +
        `the register lookup has moved or changed shape; re-check the M6.16 hand-off wording and link` +
        (notes.length > 0 ? ` (also: ${notes.join("; ")})` : ""),
      sourceDate: null,
    };
  }
  if (guidance.state === "ok" && (!guidance.hasServiceLink || !guidance.mentionsPostcode)) {
    return {
      warning: true,
      logLine:
        `canary bsr-register · the GOV.UK "Find a high-rise residential building" guidance no longer presents the ` +
        `register search service as a postcode lookup (service link present: ${guidance.hasServiceLink}, postcode lookup described: ${guidance.mentionsPostcode}) — ` +
        `re-check the M6.16 hand-off wording and link` +
        (notes.length > 0 ? ` (also: ${notes.join("; ")})` : ""),
      sourceDate: guidance.updated,
    };
  }
  if (serviceReachable === false) {
    return {
      warning: true,
      logLine:
        `canary bsr-register · the register search service (${REGISTER_SEARCH_URL}) is not answering — ` +
        `the hand-off link in the report points at a service that is down or has moved; check it before the next report leans on it` +
        (notes.length > 0 ? ` (also: ${notes.join("; ")})` : ""),
      sourceDate: guidance.updated,
    };
  }
  if (notes.length > 0) {
    return {
      skipped:
        `source unreachable — ${notes.join("; ")}; the register's state is unknown this month, ` +
        `which is not read as "no extract" and not as "the lookup is unchanged"`,
    };
  }
  return {
    logLine:
      `canary bsr-register · the register is still a postcode lookup — the GOV.UK guidance presents the search ` +
      `service and data.gov.uk still lists no building-level register dataset — the M5.14 hand-off stands`,
    sourceDate: guidance.updated,
  };
}

export function probeBsrRegister() {
  return (async () => {
    const guidance = {
      state: "unreachable",
      hasServiceLink: false,
      mentionsPostcode: false,
      updated: null,
    };
    try {
      const response = await fetchRetry(GUIDANCE_URL, { headers: PROBE_HEADERS });
      if (response.status === 404) guidance.state = "missing";
      else if (response.ok) {
        const doc = await response.json();
        const body = doc.details?.body ?? "";
        guidance.state = "ok";
        guidance.hasServiceLink = body.includes("www.register-high-rise-building.service.gov.uk");
        guidance.mentionsPostcode = /postcode/i.test(body);
        guidance.updated = (doc.public_updated_at ?? "").slice(0, 10) || null;
      }
    } catch {
      guidance.state = "unreachable";
    }

    let serviceReachable = null;
    try {
      const response = await fetchRetry(REGISTER_SEARCH_URL, { headers: PROBE_HEADERS });
      serviceReachable = response.ok;
    } catch {
      serviceReachable = null;
    }

    const catalogue = { state: "unreachable", titles: [] };
    try {
      const titles = [];
      for (const query of CATALOGUE_QUERIES) {
        const response = await fetchRetry(catalogueUrl(query), { headers: PROBE_HEADERS });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const doc = await response.json();
        for (const result of doc.result?.results ?? []) titles.push(result.title);
      }
      catalogue.state = "ok";
      catalogue.titles = titles;
    } catch {
      catalogue.state = "unreachable";
    }

    return bsrRegisterVerdict({ guidance, serviceReachable, catalogue });
  })();
}
