// Flood defences canary probe (plan step M6.27).
//
// The defences loader reads the AIMS GeoPackage whole from
// the Data Sharing Platform file endpoint. What earns a
// monthly look is the SOURCE RECORD's shape: the CKAN
// package record for aims-spatial-flood-defences-inc-
// standardised-attributes must still name the AfA345
// product, and must still carry the GeoPackage zip resource
// on the same file-download pattern (same dataset id) the
// loader downloads. If either moves, the loader's next
// quarterly run is at risk and the operator hears about it
// here first.
//
// What this probe deliberately does NOT assert:
// - Freshness. The record's modified date is the metadata
//   record's, not the data's (measured in the prep: it read
//   2026-11-16 while the data was the 13 Nov build), so it
//   is no freshness oracle. The loader's edition stamp is
//   the zip member's own date, and its ±10% feature-count
//   band is the real content guard.
// - Reachability of the download itself: HEAD on the file
//   endpoint is 405 (measured), and a 41 MB monthly download
//   is the loader's job, not the canary's.
//
// States, kept strictly separate (the planning probe's
// idiom): a record that still matches is a healthy success;
// a record whose shape moved throws (an alert — the source
// changed under the loader); a source that does not answer
// after the one retry is a skip in its own words, never read
// as healthy or as gone.
//
// Standalone module, wired into canary.mjs by one import
// and one run line, like canary-planning-application.mjs.

const PACKAGE_URL =
  "https://www.data.gov.uk/api/3/action/package_show?id=aims-spatial-flood-defences-inc-standardised-attributes";
const PACKAGE_NAME = "aims-spatial-flood-defences-inc-standardised-attributes";
const GPKG_RESOURCE_NAME = "AIMS_Spatial_Flood_Defences_inc_standardised_attributes.gpkg.zip";
const FILE_DATASET_ID = "3aa34e3d-1d6d-4345-a655-64a683e06b6b";
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

// The pure shape check over the CKAN record's result
// object. Throws with the reason on any mismatch — a moved
// shape is an alert, never a silent pass.
export function floodDefencesRecordCheck(record) {
  if (!record || typeof record !== "object")
    throw new Error(
      "the AIMS defences CKAN record is not an object — the platform's shape changed",
    );
  if (record.name !== PACKAGE_NAME)
    throw new Error(
      `the CKAN record answering for the AIMS defences package is named ${JSON.stringify(record.name)}, not ${PACKAGE_NAME} — the platform's shape changed`,
    );
  if (typeof record.notes !== "string" || !record.notes.includes("AfA345"))
    throw new Error(
      "the AIMS defences CKAN record no longer names the AfA345 product in its notes — the record's identity changed",
    );
  const resources = Array.isArray(record.resources) ? record.resources : [];
  const gpkg = resources.find((r) => r && r.name === GPKG_RESOURCE_NAME);
  if (!gpkg)
    throw new Error(
      `the AIMS defences record carries no resource named ${GPKG_RESOURCE_NAME} — the loader's download is gone`,
    );
  const url = typeof gpkg.url === "string" ? gpkg.url : "";
  if (
    !url.startsWith("https://environment.data.gov.uk/api/file/download") ||
    !url.includes(`fileDataSetId=${FILE_DATASET_ID}`)
  )
    throw new Error(
      "the GeoPackage resource no longer sits on the file-download pattern (same dataset id) the loader downloads — the access route changed",
    );
  return { resources: resources.length };
}

function sourceUnreachable(detail) {
  return {
    skipped:
      `source unreachable — ${detail}; the AIMS defences record's state is ` +
      `unknown this month, which is not read as healthy or as gone`,
  };
}

export function probeFloodDefences() {
  return (async () => {
    let response;
    try {
      response = await fetchRetry(PACKAGE_URL, { headers: PROBE_HEADERS });
    } catch (error) {
      return sourceUnreachable(`www.data.gov.uk did not answer (${error.message})`);
    }
    if (response.status === 503 || response.status === 403)
      return sourceUnreachable(`www.data.gov.uk answered HTTP ${response.status}`);
    if (!response.ok) throw new Error(`HTTP ${response.status} for the AIMS defences CKAN record`);
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!body || typeof body !== "object" || body.success !== true)
      throw new Error(
        "the AIMS defences CKAN response is not a successful package record — the platform's shape changed",
      );
    const { resources } = floodDefencesRecordCheck(body.result);
    return {
      logLine:
        "canary flood-defences · the AIMS record still names AfA345 and carries the GeoPackage zip " +
        `on the loader's file-download pattern (${resources} resources on the record)`,
      sourceDate: null,
    };
  })();
}
