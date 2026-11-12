// Health loader (plan step M4.7). Files GP practices and their
// branch surgeries, pharmacies and dental practices from the NHS
// Organisation Data Service, and hospitals from the CQC directory,
// with CQC ratings and the emergency-department flag overlaid from
// CQC's ratings file. Built to the user-seat gap check of
// 12 Nov 2026:
//
//   npm run load:health
//   npm run load:health -- --verify-only
//   npm run load:health -- --file tests/fixtures/health
//
// The rules that shape this file:
//   - Branch surgeries are IN (user-confirmed): a practice's
//     distance is the distance to its nearest SITE, so branches
//     file as points in their own right with the parent practice's
//     code on the row. Branches have no status column — a branch
//     is open when its close date is blank or in the future, and
//     COVID vaccination leftovers are removed by name. Both
//     filters' counts are printed in the log line, never silent.
//   - The emergency-department flag is THREE-state: true (the
//     ratings file carries an "Urgent and emergency services" row
//     for the hospital), false (the hospital is rated, its
//     services are known, no such row), null (no ratings rows at
//     all — the data says nothing, and nothing is claimed).
//   - Ratings join by exact code, never by name: NHS hospitals
//     key by their Location ID (which is the ODS site code), GP
//     practices by the Location ODS Code the file carries, and
//     independent hospitals by Location ID while their ODS code
//     sits in the ODS Code column — so entries are indexed under
//     both identifiers and matched on either. The
//     rating date is CQC's Publication Date, filed as what it is.
//     Two different ratings published the same day cannot be
//     ordered: neither is filed, and the tie is logged.
//   - Pharmacies are never CQC-rated (a different regulator),
//     dentists are registered but not rated, and Welsh points can
//     never be rated (CQC covers England only). Those NULLs are
//     the truth, not a join failure.
//   - No health source carries coordinates. Every point sits at
//     its postcode's position from the M4.1 directory, so ties at
//     shared postcodes are real and expected.
//   - A small reviewed exclusion list (below) removes register
//     rows that hold a GP prescribing code but are not practices
//     a patient can register with. ODS fields alone cannot spot
//     them; the log also counts filed practices with CLINIC in
//     their name so a human can review for new candidates.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import pg from "pg";
import yauzl from "yauzl";

const DSE_URL = (report) =>
  `https://www.odsdatasearchandexport.nhs.uk/api/getReport?report=${report}`;
const CQC_PAGE = "https://www.cqc.org.uk/about-us/transparency/using-cqc-data";
const SOURCE_ODS = "NHS Organisation Data Service (DSE reports)";
const SOURCE_CQC_DIR = "CQC locations directory";
const SOURCE_CQC_RATINGS = "CQC care directory with ratings";

// Reviewed exclusions — register rows that are not GP practices a
// patient can register with, verified by hand against the
// practice's own description. Additions need the same check.
const EXCLUDED_PRACTICES = new Map([
  [
    "F84750",
    "Community Dermatology Clinic — a specialist clinic holding a prescribing code, not a registerable practice (reviewed 12 Nov 2026)",
  ],
]);

const HOMES = {
  "CM3 2JT": { lat: 51.776176, lng: 0.60387 },
  "E16 1GN": { lat: 51.515224, lng: 0.021177 },
  "KT17 1FH": { lat: 51.344571, lng: -0.247104 },
};
// Postcode areas outside England and Wales (Scotland + Northern
// Ireland). Welsh areas (CF, LD, LL, NP, SA, SY-shared) stay in.
const NON_EW_AREAS = new Set([
  "AB",
  "BT",
  "DD",
  "DG",
  "EH",
  "FK",
  "G",
  "HS",
  "IV",
  "KA",
  "KW",
  "ML",
  "PA",
  "PH",
  "TD",
  "ZE",
]);

function haversineMiles(aLat, aLng, bLat, bLng) {
  const R = 3958.7613;
  const r = Math.PI / 180;
  const h =
    Math.sin(((bLat - aLat) * r) / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLng - aLng) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function parseCsv(text) {
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
  return rows;
}

const MONTHS = {
  January: "01",
  February: "02",
  March: "03",
  April: "04",
  May: "05",
  June: "06",
  July: "07",
  August: "08",
  September: "09",
  October: "10",
  November: "11",
  December: "12",
};
function longDate(day, monthName, year) {
  return MONTHS[monthName] ? `${year}-${MONTHS[monthName]}-${String(day).padStart(2, "0")}` : null;
}
function ukDate(value) {
  const m = (value ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// --- CQC ratings: a streaming read of the .ods content.xml -------
// The real file's content.xml is about 1.1 GB, so rows are cut
// from the stream as they complete; nothing whole is ever held.
function streamRatings(bufferPromise) {
  return new Promise((resolve, reject) => {
    bufferPromise
      .then((buffer) => {
        yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
          if (err) return reject(err);
          zip.readEntry();
          zip.on("entry", (entry) => {
            if (entry.fileName !== "content.xml") return zip.readEntry();
            zip.openReadStream(entry, (streamErr, stream) => {
              if (streamErr) return reject(streamErr);
              resolve(readRatingsStream(Readable.toWeb(stream)));
            });
          });
          zip.on("error", reject);
        });
      })
      .catch(reject);
  });
}

// The per-row ratings aggregation, shared by the live streamer
// and the fixture's CSV form of the same rows.
function createRatingsAggregator() {
  const byLocation = new Map();
  const locationByOdsCode = new Map();
  let headerSeen = false;
  return {
    byLocation,
    locationByOdsCode,
    noteRow(cells) {
      if (!headerSeen) {
        if (cells.some((c) => c !== "")) {
          headerSeen = true;
          if (cells[0] !== "Location ID" || cells[17] !== "Service / Population Group")
            throw new Error("contract failure: the ratings Locations sheet changed shape");
        }
        return;
      }
      const locationId = cells[0] ?? "";
      if (!locationId) return;
      const odsCode = (cells[1] ?? "").trim();
      if (odsCode && !locationByOdsCode.has(odsCode)) locationByOdsCode.set(odsCode, locationId);
      const current = byLocation.get(locationId) ?? { rows: 0, hasUec: false, overall: [] };
      current.rows += 1;
      const group = (cells[17] ?? "").toLowerCase();
      const domain = (cells[18] ?? "").toLowerCase();
      if (group === "urgent and emergency services") current.hasUec = true;
      if (group === "overall" && domain === "overall") {
        current.overall.push({
          locationId,
          rating: cells[19] ?? "",
          date: ukDate(cells[20] ?? ""),
          url: cells[23] ?? "",
        });
      }
      byLocation.set(locationId, current);
    },
  };
}

async function readRatingsStream(webStream) {
  const reader = webStream.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  let sheet = null;
  let readmeText = "";
  const aggregator = createRatingsAggregator();
  const cellTexts = (rowXml) => {
    const cells = [];
    const cellRe = /<table:table-cell([^>]*?)(?:\/>|>(.*?)<\/table:table-cell>)/gs;
    let match;
    while ((match = cellRe.exec(rowXml)) !== null) {
      const rep = /number-columns-repeated="(\d+)"/.exec(match[1] ?? "");
      const n = rep ? Number.parseInt(rep[1], 10) : 1;
      let text = "";
      if (match[2]) {
        text = [...match[2].matchAll(/<text:p[^>]*>(.*?)<\/text:p>/gs)]
          .map((p) => p[1].replace(/<[^>]+>/g, ""))
          .join(" ")
          .trim();
      }
      cells.push(text);
      for (let i = 1; i < n && cells.length < 40; i += 1) cells.push("");
      if (cells.length >= 40) break;
    }
    return cells;
  };
  const handleRow = (rowXml) => {
    if (sheet === "README") {
      if (readmeText.length < 20000) readmeText += ` ${cellTexts(rowXml).join(" ")}`;
      return;
    }
    if (sheet !== "Locations") return;
    aggregator.noteRow(cellTexts(rowXml));
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += decoder.decode(value, { stream: !done });
    // Sheet transitions are consumed in stream order.
    for (;;) {
      const tableAt = buf.indexOf("<table:table ");
      const rowAt = buf.indexOf("<table:table-row");
      if (tableAt !== -1 && (rowAt === -1 || tableAt < rowAt)) {
        const nameMatch = /table:name="([^"]+)"/.exec(buf.slice(tableAt, tableAt + 200));
        sheet = nameMatch ? nameMatch[1] : sheet;
        buf = buf.slice(tableAt + 13);
        continue;
      }
      if (rowAt === -1) {
        buf = buf.slice(-64);
        break;
      }
      const tagEnd = buf.indexOf(">", rowAt);
      if (tagEnd === -1) {
        buf = buf.slice(rowAt);
        break;
      }
      if (buf[tagEnd - 1] === "/") {
        buf = buf.slice(tagEnd + 1);
        continue;
      }
      const end = buf.indexOf("</table:table-row>", tagEnd);
      if (end === -1) {
        buf = buf.slice(rowAt);
        break;
      }
      handleRow(buf.slice(rowAt, end + 18));
      buf = buf.slice(end + 18);
    }
    if (done) break;
  }
  const asAtMatch = readmeText.match(/as at (\d{1,2}) ([A-Za-z]+) (\d{4})/);
  const asAt = asAtMatch ? longDate(asAtMatch[1], asAtMatch[2], asAtMatch[3]) : null;
  return {
    byLocation: aggregator.byLocation,
    locationByOdsCode: aggregator.locationByOdsCode,
    asAt,
  };
}

// -------------------------------------------------------------------

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

async function discoverCqc() {
  const page = await fetchText(CQC_PAGE);
  const urls = [...page.matchAll(/https:\/\/www\.cqc\.org\.uk\/system\/files\/[^"']+/g)].map(
    (m) => m[0],
  );
  const pick = (pattern) => {
    const candidates = [];
    for (const url of urls) {
      if (!pattern.test(url)) continue;
      const m = url.match(/(\d{1,2})_([A-Za-z]+)_(\d{4})/);
      if (m && MONTHS[m[2]]) candidates.push({ url, date: longDate(m[1], m[2], m[3]) });
    }
    candidates.sort((a, b) => (a.date < b.date ? 1 : -1));
    return candidates[0] ?? null;
  };
  const directory = pick(/_CQC_directory\.csv$/);
  const ratings = pick(/_Latest_ratings\.ods$/);
  if (!directory || !ratings)
    throw new Error("could not find the CQC files on the Using CQC data page");
  return { directory, ratings };
}

const ewPostcode = (postcode) => {
  const area = (postcode ?? "").trim().toUpperCase().split(" ")[0]?.replace(/[0-9]/g, "");
  return area !== "" && !NON_EW_AREAS.has(area);
};
const odsDate = (value) => {
  const s = (value ?? "").trim();
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
};

function buildPoints({
  epraccur,
  ebranchs,
  edispensary,
  egdpprac,
  directoryRows,
  positionOf,
  today,
}) {
  const points = [];
  const stats = {
    closedBranches: 0,
    covidBranches: 0,
    excludedPractices: 0,
    clinicNamed: 0,
    noPosition: 0,
    countryFiltered: 0,
  };
  const addressOf = (cols) =>
    [cols[4], cols[5], cols[6], cols[7], cols[8]]
      .map((c) => (c ?? "").trim())
      .filter(Boolean)
      .join(", ") || null;
  const addPoint = (base) => {
    const position = positionOf(base.postcode);
    if (!position) {
      stats.noPosition += 1;
      return;
    }
    points.push({ ...base, lat: position.lat, lng: position.lng });
  };
  const todayStr = today.toISOString().slice(0, 10);

  const rows = (list) => list.filter((cols) => cols.length === 27);
  for (const cols of rows(epraccur)) {
    const code = cols[0].trim();
    const postcode = cols[9].trim().toUpperCase();
    if (!ewPostcode(postcode)) {
      stats.countryFiltered += 1;
      continue;
    }
    if (cols[12].trim() !== "ACTIVE" || cols[25].trim() !== "RO76") continue;
    if (EXCLUDED_PRACTICES.has(code)) {
      stats.excludedPractices += 1;
      continue;
    }
    if (/CLINIC/i.test(cols[1])) stats.clinicNamed += 1;
    addPoint({
      odsCode: code,
      name: cols[1].trim(),
      serviceType: "gp_practice",
      address: addressOf(cols),
      postcode,
      parentOdsCode: null,
      source: SOURCE_ODS,
    });
  }
  for (const cols of rows(ebranchs)) {
    const code = cols[0].trim();
    const postcode = cols[9].trim().toUpperCase();
    if (!ewPostcode(postcode)) {
      stats.countryFiltered += 1;
      continue;
    }
    const closeDate = odsDate(cols[11]);
    if (closeDate && closeDate < todayStr) {
      stats.closedBranches += 1;
      continue;
    }
    if (/COVID|VACCINATION/i.test(cols[1])) {
      stats.covidBranches += 1;
      continue;
    }
    addPoint({
      odsCode: code,
      name: cols[1].trim(),
      serviceType: "gp_branch_surgery",
      address: addressOf(cols),
      postcode,
      parentOdsCode: cols[14].trim() || null,
      source: SOURCE_ODS,
    });
  }
  for (const [list, serviceType] of [
    [edispensary, "pharmacy"],
    [egdpprac, "dentist"],
  ]) {
    for (const cols of rows(list)) {
      const postcode = cols[9].trim().toUpperCase();
      if (!ewPostcode(postcode)) {
        stats.countryFiltered += 1;
        continue;
      }
      if (cols[12].trim() !== "ACTIVE") continue;
      addPoint({
        odsCode: cols[0].trim(),
        name: cols[1].trim(),
        serviceType,
        address: addressOf(cols),
        postcode,
        parentOdsCode: null,
        source: SOURCE_ODS,
      });
    }
  }
  for (const row of directoryRows) {
    const types = [
      ...new Set(
        (row["Service types"] ?? "")
          .split("|")
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ];
    if (!types.includes("Hospital")) continue;
    const postcode = (row["Postcode"] ?? "").trim().toUpperCase();
    addPoint({
      odsCode: (row["CQC Location ID (for office use only)"] ?? "").trim(),
      name: (row["Name"] ?? "").trim(),
      serviceType: "hospital",
      address: (row["Address"] ?? "").trim() || null,
      postcode,
      parentOdsCode: null,
      cqcServiceTypes: types.join("|"),
      providerName: (row["Provider name"] ?? "").trim() || null,
      source: SOURCE_CQC_DIR,
    });
  }
  return { points, stats };
}

function applyRatings(points, ratings) {
  let joined = 0;
  let ties = 0;
  for (const point of points) {
    const locationId = ratings.byLocation.has(point.odsCode)
      ? point.odsCode
      : ratings.locationByOdsCode.get(point.odsCode);
    const entry = locationId ? ratings.byLocation.get(locationId) : undefined;
    if (point.serviceType === "hospital") {
      point.hasEmergencyDepartment = !entry || entry.rows === 0 ? null : entry.hasUec;
    }
    if (!entry || entry.overall.length === 0) continue;
    const latest = entry.overall.reduce((a, b) => ((b.date ?? "") > (a.date ?? "") ? b : a));
    const sameDay = entry.overall.filter((o) => o.date === latest.date);
    if (new Set(sameDay.map((o) => o.rating)).size > 1) {
      ties += 1;
      continue;
    }
    point.rating = {
      cqcLocationId: latest.locationId,
      rating: latest.rating,
      ratingDate: latest.date,
      reportUrl: latest.url || `http://www.cqc.org.uk/location/${latest.locationId}`,
    };
    joined += 1;
  }
  return { joined, ties };
}

function nearest(points, home, predicate, count) {
  return points
    .filter(predicate)
    .map((p) => ({ point: p, miles: haversineMiles(home.lat, home.lng, p.lat, p.lng) }))
    .sort((a, b) => a.miles - b.miles)
    .slice(0, count);
}

function checkGolden(points, byCode) {
  const fails = [];
  const expect = (condition, message) => {
    if (!condition) fails.push(message);
  };
  const close = (actual, expected) => Math.abs(actual - expected) <= 0.06;

  // CM3 — the user's own correction leads: the nearest GP point is
  // the Sidney House site of The Laurels practice, never Witham.
  const cm3Gp = nearest(points, HOMES["CM3 2JT"], (p) => p.serviceType.startsWith("gp_"), 1);
  expect(
    cm3Gp[0] &&
      cm3Gp[0].point.odsCode === "F81149002" &&
      close(cm3Gp[0].miles, 0.37) &&
      cm3Gp[0].point.parentOdsCode === "F81149",
    `CM3 nearest GP point: expected branch F81149002 at 0.37 mi, got ${cm3Gp[0] ? `${cm3Gp[0].point.odsCode} at ${cm3Gp[0].miles.toFixed(2)} mi` : "none"}`,
  );
  const cm3Practice = nearest(points, HOMES["CM3 2JT"], (p) => p.serviceType === "gp_practice", 1);
  expect(
    cm3Practice[0] &&
      cm3Practice[0].point.odsCode === "F81173" &&
      close(cm3Practice[0].miles, 1.98),
    "CM3 nearest practice main site: expected Douglas Grove F81173 at 1.98 mi",
  );
  const cm3Rx = nearest(points, HOMES["CM3 2JT"], (p) => p.serviceType === "pharmacy", 1);
  expect(
    cm3Rx[0] && cm3Rx[0].point.odsCode === "FWM30" && close(cm3Rx[0].miles, 0.42),
    "CM3 nearest pharmacy: expected Boots FWM30 at 0.42 mi",
  );
  expect(
    byCode.has("V07702") && byCode.has("V17324"),
    "both CM3 2EA dental contracts must be filed, never de-duplicated by postcode",
  );
  const stPeters = byCode.get("RAJ1K");
  expect(
    stPeters && stPeters.hasEmergencyDepartment === null && !stPeters.rating,
    "St Peter's must file flag NULL (no ratings rows) and no rating",
  );
  const springfield = byCode.get("1-128733123");
  expect(
    springfield &&
      springfield.hasEmergencyDepartment === false &&
      springfield.rating?.rating === "Good" &&
      springfield.rating?.ratingDate === "2026-08-26",
    "Springfield must file flag FALSE with its Good rating of 2026-08-26",
  );
  const broomfield = byCode.get("RAJ32");
  expect(
    broomfield &&
      broomfield.hasEmergencyDepartment === true &&
      broomfield.rating?.rating === "Requires improvement",
    "Broomfield must file flag TRUE with Requires improvement",
  );

  // E16 — the trap clinic is out; St Luke's exists only as a branch.
  expect(
    !byCode.has("F84750"),
    "F84750 (dermatology clinic) must be excluded, never filed as a GP",
  );
  expect(!byCode.has("F84020"), "the defunct St Luke's practice code F84020 must not appear");
  const stLukes = byCode.get("F84749002");
  expect(
    stLukes && stLukes.serviceType === "gp_branch_surgery" && stLukes.parentOdsCode === "F84749",
    "St Luke's must file as branch F84749002 of F84749",
  );
  const newham = byCode.get("R1HNH");
  expect(
    newham &&
      newham.hasEmergencyDepartment === true &&
      newham.rating?.rating === "Requires improvement" &&
      newham.rating?.ratingDate === "2026-07-17",
    "Newham University Hospital: flag TRUE, Requires improvement, 2026-07-17",
  );
  const ruiz = byCode.get("F84666");
  expect(
    ruiz && ruiz.rating,
    "the Ruiz practice rating must join by code (F84666), whatever the names say",
  );

  // KT17 — the tie is real, and Epsom's flag is TRUE.
  const ktGp = nearest(points, HOMES["KT17 1FH"], (p) => p.serviceType === "gp_practice", 2);
  expect(
    ktGp.length === 2 &&
      close(ktGp[0].miles, 0.46) &&
      close(ktGp[1].miles, 0.46) &&
      new Set(ktGp.map((x) => x.point.odsCode)).size === 2,
    "KT17 must show two distinct practices tied at 0.46 mi",
  );
  const epsom = byCode.get("RVR50");
  expect(
    epsom &&
      epsom.hasEmergencyDepartment === true &&
      epsom.rating?.rating === "Good" &&
      epsom.rating?.ratingDate === "2026-06-11",
    "Epsom General: flag TRUE, Good, 2026-06-11",
  );
  const stHelier = byCode.get("RVR05");
  expect(stHelier && stHelier.hasEmergencyDepartment === true, "St Helier: flag TRUE");

  // National truthfulness invariants.
  const ratedWrong = points.filter(
    (p) => p.rating && (p.serviceType === "pharmacy" || p.serviceType === "dentist"),
  );
  expect(ratedWrong.length === 0, "no pharmacy or dentist point may carry a CQC rating");
  const welsh = points.filter(
    (p) => /^W/i.test(p.odsCode) || /^(CF|LD|LL|NP|SA)\d/i.test(p.postcode ?? ""),
  );
  const welshRated = welsh.filter((p) => p.rating);
  expect(welshRated.length === 0, "no Welsh point may carry a CQC rating");
  if (fails.length > 0) throw new Error(`golden checks failed:\n - ${fails.join("\n - ")}`);
}

async function main() {
  const startedAt = Date.now();
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  const fileAt = args.indexOf("--file");
  const fixtureMode = fileAt !== -1;
  const fixtureDir = fixtureMode ? args[fileAt + 1] : null;
  const today = new Date();

  let epraccur,
    ebranchs,
    edispensary,
    egdpprac,
    directoryRows,
    directoryProducedOn,
    ratings,
    odsDateStamp;
  let positionOf;
  let client = null;

  if (fixtureMode) {
    const meta = JSON.parse(await readFile(join(fixtureDir, "fixture.json"), "utf8"));
    const readReport = async (name) =>
      parseCsv(await readFile(join(fixtureDir, `${name}.csv`), "utf8")).filter(
        (r) => r.length === 27,
      );
    epraccur = await readReport("epraccur");
    ebranchs = await readReport("ebranchs");
    edispensary = await readReport("edispensary");
    egdpprac = await readReport("egdpprac");
    const dirText = await readFile(join(fixtureDir, meta.directoryFile), "utf8");
    const dirLines = dirText.split("\n");
    directoryProducedOn = meta.directoryProducedOn;
    const dirParsed = parseCsv(dirLines.slice(4).join("\n"));
    const header = dirParsed[0];
    directoryRows = dirParsed
      .slice(1)
      .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
    const aggregator = createRatingsAggregator();
    for (const cells of parseCsv(await readFile(join(fixtureDir, meta.ratingsFile), "utf8"))) {
      aggregator.noteRow(cells);
    }
    ratings = {
      byLocation: aggregator.byLocation,
      locationByOdsCode: aggregator.locationByOdsCode,
      asAt: meta.ratingsAsAt,
    };
    odsDateStamp = meta.odsRetrieved;
    const postcodes = JSON.parse(await readFile(join(fixtureDir, "postcodes.json"), "utf8"));
    positionOf = (pc) => postcodes[(pc ?? "").trim().toUpperCase()] ?? null;
    if (!verifyOnly) {
      // Filing needs a database even in fixture mode (CI files the
      // fixture into its throwaway PostGIS); positions still come
      // from the fixture's own postcode list.
      if (!process.env.DATABASE_URL)
        throw new Error("DATABASE_URL is not set — filing requires a database");
      client = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
    }
  } else {
    const [a, b, c, d] = await Promise.all(
      ["epraccur", "ebranchs", "edispensary", "egdpprac"].map((name) => fetchText(DSE_URL(name))),
    );
    epraccur = parseCsv(a);
    ebranchs = parseCsv(b);
    edispensary = parseCsv(c);
    egdpprac = parseCsv(d);
    const { directory, ratings: ratingsPick } = await discoverCqc();
    const dirText = await fetchText(directory.url);
    const dirLines = dirText.split("\n");
    const producedMatch = dirLines
      .slice(0, 5)
      .join(" ")
      .match(/produced on (\d{1,2}) ([A-Za-z]+) (\d{4})/i);
    directoryProducedOn = producedMatch
      ? longDate(producedMatch[1], producedMatch[2], producedMatch[3])
      : directory.date;
    const dirParsed = parseCsv(dirLines.slice(4).join("\n"));
    const header = dirParsed[0];
    directoryRows = dirParsed
      .slice(1)
      .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
    const ratingsResponse = await fetch(ratingsPick.url);
    if (!ratingsResponse.ok)
      throw new Error(`HTTP ${ratingsResponse.status} for the CQC ratings file`);
    ratings = await streamRatings(
      Promise.resolve(Buffer.from(await ratingsResponse.arrayBuffer())),
    );
    odsDateStamp = today.toISOString().slice(0, 10);
    if (!process.env.DATABASE_URL)
      throw new Error(
        "DATABASE_URL is not set — health points are positioned from the postcode directory, so a database is required",
      );
    client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const res = await client.query(
      "SELECT postcode, latitude, longitude FROM postcode_cache WHERE latitude IS NOT NULL",
    );
    const postcodeDirectory = new Map(
      res.rows.map((r) => [r.postcode, { lat: r.latitude, lng: r.longitude }]),
    );
    positionOf = (pc) => postcodeDirectory.get((pc ?? "").trim().toUpperCase()) ?? null;
  }

  // Freshness guards (CQC's own migration-delay warning is why
  // these check the files' own dates, not the download date).
  const ageDays = (date) => (Date.now() - new Date(`${date}T00:00:00Z`).getTime()) / 86400000;
  if (!fixtureMode) {
    if (!directoryProducedOn || ageDays(directoryProducedOn) > 21)
      throw new Error(
        `the CQC directory is stale (produced ${directoryProducedOn}) — failing rather than filing old data`,
      );
    if (!ratings.asAt || ageDays(ratings.asAt) > 100)
      throw new Error(
        `the CQC ratings file is stale (as at ${ratings.asAt}) — failing rather than filing old data`,
      );
  }

  const { points, stats } = buildPoints({
    epraccur,
    ebranchs,
    edispensary,
    egdpprac,
    directoryRows,
    positionOf,
    today,
  });
  const { joined, ties } = applyRatings(points, ratings);
  const byCode = new Map(points.map((p) => [p.odsCode, p]));
  if (byCode.size !== points.length)
    throw new Error("duplicate point codes across sources — failing rather than guessing");

  const count = (type) => points.filter((p) => p.serviceType === type).length;
  if (!fixtureMode) {
    const bands = [
      ["gp_practice", count("gp_practice"), 6000, 7200],
      ["gp_branch_surgery", count("gp_branch_surgery"), 2200, 2900],
      ["pharmacy", count("pharmacy"), 10500, 12000],
      ["dentist", count("dentist"), 9200, 10400],
      ["hospital", count("hospital"), 700, 870],
    ];
    for (const [label, n, lo, hi] of bands) {
      if (n < lo || n > hi)
        throw new Error(
          `sanity failure: ${n} ${label} points is outside the expected band ${lo}-${hi}`,
        );
    }
  }
  checkGolden(points, byCode);

  const summary = () =>
    `load-health · ODS ${odsDateStamp} · CQC directory ${directoryProducedOn} · ratings as at ${ratings.asAt} · ` +
    `${count("gp_practice")} practices · ${count("gp_branch_surgery")} branches ` +
    `(${stats.closedBranches} closed-by-date removed, ${stats.covidBranches} COVID-named removed) · ` +
    `${count("pharmacy")} pharmacies · ${count("dentist")} dentists · ${count("hospital")} hospitals · ` +
    `${joined} ratings joined · ${ties} same-day ties withheld · ${stats.excludedPractices} excluded non-practices · ` +
    `${stats.clinicNamed} CLINIC-named practices filed for review · ${stats.noPosition} without a directory position skipped`;

  if (verifyOnly) {
    console.log(`${summary()} · golden homes OK (verify only, nothing filed)`);
    if (client) await client.end();
    return;
  }

  try {
    await client.query("BEGIN");
    // The stage table is spelled out rather than copied with
    // LIKE: LIKE carries the id column's NOT NULL but not its
    // identity default, so staged rows would arrive with no id.
    await client.query(
      `CREATE TEMP TABLE health_stage (
         ods_code text, name text, service_type text, address text, postcode text,
         latitude double precision, longitude double precision,
         parent_ods_code text, has_emergency_department boolean,
         cqc_service_types text, provider_name text,
         source_name text, source_date date,
         loaded_at timestamptz NOT NULL DEFAULT now()
       ) ON COMMIT DROP`,
    );
    for (const p of points) {
      await client.query(
        `INSERT INTO health_stage (ods_code, name, service_type, address, postcode, latitude, longitude,
           parent_ods_code, has_emergency_department, cqc_service_types, provider_name, source_name, source_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          p.odsCode,
          p.name,
          p.serviceType,
          p.address,
          p.postcode,
          p.lat,
          p.lng,
          p.parentOdsCode ?? null,
          p.hasEmergencyDepartment ?? null,
          p.cqcServiceTypes ?? null,
          p.providerName ?? null,
          p.source,
          p.source === SOURCE_CQC_DIR ? directoryProducedOn : odsDateStamp,
        ],
      );
    }
    const staged = await client.query("SELECT count(*)::int AS n FROM health_stage");
    if (staged.rows[0].n !== points.length)
      throw new Error("the staged point count does not match — rolling back");
    await client.query("DELETE FROM cqc_ratings");
    await client.query("DELETE FROM health_points");
    await client
      .query(
        `INSERT INTO health_points (ods_code, name, service_type, address, postcode, latitude, longitude,
         parent_ods_code, has_emergency_department, cqc_service_types, provider_name, source_name, source_date, loaded_at)
       SELECT ods_code, name, service_type, address, postcode, latitude, longitude,
         parent_ods_code, has_emergency_department, cqc_service_types, provider_name, source_name, source_date, loaded_at
       FROM health_stage RETURNING id, ods_code`,
      )
      .then(async (inserted) => {
        const realId = new Map(inserted.rows.map((r) => [r.ods_code, r.id]));
        for (const p of points) {
          if (!p.rating) continue;
          await client.query(
            `INSERT INTO cqc_ratings (health_point_id, cqc_location_id, rating, rating_date, report_url, source_name, source_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [
              realId.get(p.odsCode),
              p.rating.cqcLocationId,
              p.rating.rating,
              p.rating.ratingDate,
              p.rating.reportUrl,
              SOURCE_CQC_RATINGS,
              ratings.asAt,
            ],
          );
        }
      });
    const filed = await client.query("SELECT count(*)::int AS n FROM health_points");
    if (filed.rows[0].n !== points.length)
      throw new Error("the filed point count does not match — rolling back");
    await client.query("COMMIT");
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    if (client) await client.end();
  }
  console.log(`${summary()} · golden homes OK · ${Math.round((Date.now() - startedAt) / 1000)}s`);
}

main().catch((error) => {
  console.error(`load-health FAILED: ${error.message}`);
  process.exitCode = 1;
});
