// Contract canary probes (plan step M4.8). One probe per data
// source: check the SHAPE and FRESHNESS of the newest edition,
// file nothing, stay cheap. A probe failure means the source
// changed shape or went stale — it warns early; the loaders
// themselves remain the authority on whether filing is safe, so
// a failed probe never blocks a load.
//
// What earns an alert: a consumed column, field or key missing
// or renamed; discovery failing; the newest edition breaching
// the loader's own freshness guard; a response shape change; a
// golden anchor absent; HTTP 401/403, or 429/5xx surviving one
// retry. What never alerts: a transient failure the retry fixes,
// lag inside the guards, ordinary data movement — and the EPC
// deltas probe, which is warning-grade only until its normal
// behaviour is characterised (it has never been tested before).

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
const longDate = (day, monthName, year) =>
  MONTHS[monthName] ? `${year}-${MONTHS[monthName]}-${String(day).padStart(2, "0")}` : null;
const ageDays = (date) => (Date.now() - new Date(`${date}T00:00:00Z`).getTime()) / 86400000;

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

// Stream a response body only until `stopAfter(text)` says the
// captured text is enough; returns what was captured.
async function streamHead(url, stopAfter, { decode = "utf-8", maxBytes = 2_000_000 } = {}) {
  const response = await fetchRetry(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder(decode);
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) text += decoder.decode(value, { stream: !done });
    if (done || text.length > maxBytes || stopAfter(text)) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  return text;
}

// Quote-aware split of one CSV line (the register files quote
// fields that contain commas; a naive comma count lies).
function splitCsvLine(line) {
  const fields = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      fields.push(field);
      field = "";
    } else field += ch;
  }
  fields.push(field);
  return fields;
}

const GIAS_CONSUMED = [
  "URN",
  "EstablishmentName",
  "EstablishmentStatus (name)",
  "PhaseOfEducation (name)",
  "TypeOfEstablishment (name)",
  "AdmissionsPolicy (name)",
  "ReligiousCharacter (name)",
  "LA (code)",
  "LA (name)",
  "Gender (name)",
  "OfficialSixthForm (name)",
  "SchoolWebsite",
  "NumberOfPupils",
  "StatutoryLowAge",
  "StatutoryHighAge",
  "Easting",
  "Northing",
  "Postcode",
  "Street",
  "Locality",
  "Town",
];
const OFSTED_CONSUMED = [
  "URN",
  "Latest OEIF overall effectiveness",
  "Inspection start date of latest OEIF graded inspection",
  "Inspection type of latest OEIF graded inspection",
  "Inspection type",
  "Inspection start date",
  "Date of latest ungraded inspection",
  "Ungraded inspection overall outcome",
  "Achievement",
  "Attendance and behaviour",
  "Curriculum and teaching",
  "Early years (where applicable)",
  "Inclusion",
  "Leadership and governance",
];

function probeOnspd() {
  return (async () => {
    const query = 'tags:ONSPD AND owner:ONSGeography_data AND type:"CSV Collection"';
    const url = `https://www.arcgis.com/sharing/rest/search?q=${encodeURIComponent(query)}&f=json&num=10&sortField=modified&sortOrder=desc`;
    const response = await fetchRetry(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} resolving the ONSPD edition`);
    const body = await response.json();
    const items = body.results ?? [];
    if (items.length === 0) throw new Error("no ONSPD download found on the geography portal");
    const title = items[0].title ?? "";
    const m = title.match(
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/,
    );
    if (!m) throw new Error(`could not parse an edition from the ONSPD title "${title}"`);
    const edition = `${m[2]}-${MONTHS[m[1]]}-01`;
    if (ageDays(edition) > 130)
      throw new Error(`the newest ONSPD edition (${title}) is over a quarter old`);
    return { logLine: `canary onspd · edition ${title} · resolution OK`, sourceDate: edition };
  })();
}

function probePpd() {
  return (async () => {
    const base = "http://prod2.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com";
    const notes = [];
    for (const file of ["pp-complete.csv", "pp-monthly-update-new-version.csv"]) {
      const response = await fetchRetry(`${base}/${file}`, { method: "HEAD" }).catch(() => null);
      const head = response?.headers.get("last-modified");
      if (!head) {
        // Some endpoints refuse HEAD; a ranged stream-head answers instead.
        notes.push(`${file}: no Last-Modified on HEAD`);
        continue;
      }
      const modified = new Date(head);
      if ((Date.now() - modified.getTime()) / 86400000 > 45)
        throw new Error(`${file} is stale (Last-Modified ${head})`);
      notes.push(`${file} modified ${modified.toISOString().slice(0, 10)}`);
    }
    const sample = await streamHead(`${base}/pp-complete.csv`, (t) => t.split("\n").length >= 210, {
      maxBytes: 300_000,
    });
    const lines = sample
      .split("\n")
      .filter((l) => l.trim() !== "")
      .slice(0, 200);
    let malformed = 0;
    for (const line of lines) {
      const fields = line.split('","').length;
      if (fields !== 16 || !/^"?\{?[0-9A-Fa-f-]{36}/.test(line)) malformed += 1;
    }
    if (lines.length === 0) throw new Error("the PPD head sample was empty");
    if (malformed / lines.length > 0.01)
      throw new Error(`${malformed} of ${lines.length} sampled PPD lines are malformed`);
    return {
      logLine: `canary ppd · ${notes.join(" · ")} · head sample ${lines.length} lines, ${malformed} malformed`,
    };
  })();
}

function probePolice() {
  return (async () => {
    const response = await fetchRetry("https://data.police.uk/api/crimes-street-dates");
    if (!response.ok)
      throw new Error(`HTTP ${response.status} from the Police.uk availability endpoint`);
    const dates = await response.json();
    if (!Array.isArray(dates) || dates.length === 0)
      throw new Error("the Police.uk availability list is empty");
    const latest = dates
      .map((d) => d.date)
      .sort()
      .at(-1);
    const [year, month] = latest.split("-").map(Number);
    const ageMonths = (new Date().getFullYear() - year) * 12 + (new Date().getMonth() + 1 - month);
    if (ageMonths > 3)
      throw new Error(
        `the latest Police.uk month (${latest}) breaches the 3-month freshness guard`,
      );
    const crimes = await fetchRetry(
      `https://data.police.uk/api/crimes-street/all-crime?lat=51.515224&lng=0.021177&date=${latest}`,
    );
    if (!crimes.ok) throw new Error(`HTTP ${crimes.status} from the Police.uk crimes endpoint`);
    const body = await crimes.json();
    if (!Array.isArray(body)) throw new Error("the Police.uk crimes response is not an array");
    return {
      logLine: `canary police · latest month ${latest} · golden-point response is an array (${body.length} records)`,
    };
  })();
}

function probeEpc() {
  return (async () => {
    const token = process.env.EPC_API_TOKEN;
    if (!token) return { skipped: "no EPC token in this environment" };
    const base = "https://api.get-energy-performance-data.communities.gov.uk";
    const headers = { Authorization: `Bearer ${token}` };
    const search = await fetch(
      `${base}/api/domestic/search?postcode=${encodeURIComponent("E16 1GN")}&page=1&page_size=5`,
      { headers },
    );
    if (search.status === 401 || search.status === 403)
      throw new Error(
        `the EPC token was rejected (HTTP ${search.status}) — the K9 token needs attention`,
      );
    if (!search.ok) throw new Error(`HTTP ${search.status} from the EPC search`);
    const searchBody = await search.json();
    const stubs = searchBody.data ?? searchBody;
    if (!Array.isArray(stubs) || stubs.length === 0)
      throw new Error("the EPC search returned no certificates for a golden postcode");
    if (!stubs[0].certificateNumber)
      throw new Error("EPC search stubs no longer carry certificateNumber");
    const cert = await fetch(
      `${base}/api/certificate?certificate_number=${encodeURIComponent(stubs[0].certificateNumber)}`,
      { headers },
    );
    if (!cert.ok) throw new Error(`HTTP ${cert.status} fetching an EPC certificate`);
    const doc = await cert.json();
    const data = doc.data ?? doc;
    for (const key of [
      "current_energy_efficiency_band",
      "total_floor_area",
      "address_line_1",
      "assessment_type",
    ]) {
      if (!(key in data)) throw new Error(`the EPC certificate no longer carries ${key}`);
    }
    return {
      logLine: `canary epc · search + certificate shape OK (${stubs.length} stubs on page 1)`,
    };
  })();
}

function probeEpcDeltas() {
  // Warning-grade only: the feed is uncharacterised, so its
  // outcome is recorded and never alerts.
  return (async () => {
    const token = process.env.EPC_API_TOKEN;
    if (!token) return { skipped: "no EPC token in this environment" };
    const base = "https://api.get-energy-performance-data.communities.gov.uk";
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const response = await fetch(`${base}/api/deltas?date_start=${from}&date_end=${to}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await response.text();
    let shape = "unparseable";
    try {
      const parsed = JSON.parse(text);
      shape = Array.isArray(parsed)
        ? `array of ${parsed.length}`
        : `object with keys ${Object.keys(parsed).slice(0, 6).join(", ")}`;
    } catch {
      /* recorded as unparseable */
    }
    return {
      warning: true,
      logLine: `canary epc-deltas (warning-grade) · HTTP ${response.status} · ${shape} for ${from}..${to}`,
    };
  })();
}

function probeGias() {
  return (async () => {
    let lastError;
    for (let back = 0; back < 8; back += 1) {
      const day = new Date(Date.now() - back * 86400000);
      const stamp = day.toISOString().slice(0, 10).replaceAll("-", "");
      const url = `https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/public/edubasealldata${stamp}.csv`;
      try {
        const head = await streamHead(url, (t) => t.split("\n").length >= 3, {
          decode: "windows-1252",
          maxBytes: 400_000,
        });
        const headerLine = head.split("\n")[0].replace(/^\ufeff/, "");
        const columns = splitCsvLine(headerLine).map((c) => c.trim());
        const missing = GIAS_CONSUMED.filter((c) => !columns.includes(c));
        if (missing.length > 0) throw new Error(`GIAS no longer carries: ${missing.join(", ")}`);
        return {
          logLine: `canary gias · extract ${stamp} · all ${GIAS_CONSUMED.length} consumed columns present`,
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(`no GIAS extract found within 7 days (${lastError?.message})`);
  })();
}

function probeOfsted() {
  return (async () => {
    const page = await (
      await fetchRetry(
        "https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes",
      )
    ).text();
    const links = [
      ...page.matchAll(/https:\/\/assets\.publishing\.service\.gov\.uk\/[^"']+\.csv/g),
    ].map((m) => m[0]);
    const months = {
      ...MONTHS,
      Jan: "01",
      Feb: "02",
      Mar: "03",
      Apr: "04",
      Jun: "06",
      Jul: "07",
      Aug: "08",
      Sep: "09",
      Sept: "09",
      Oct: "10",
      Nov: "11",
      Dec: "12",
    };
    const candidates = [];
    for (const url of links) {
      if (!/latest_inspections/i.test(url)) continue;
      const m = url.match(/(?:as_at|at)_(\d{1,2})_([A-Za-z]+)_(\d{4})/);
      if (!m || !months[m[2]]) continue;
      candidates.push({ url, date: `${m[3]}-${months[m[2]]}-${m[1].padStart(2, "0")}` });
    }
    candidates.sort((a, b) => (a.date < b.date ? 1 : -1));
    const newest = candidates[0];
    if (!newest)
      throw new Error("no dated latest-inspections link found on the Ofsted data-set page");
    if (ageDays(newest.date) > 100)
      throw new Error(`the newest Ofsted file (as at ${newest.date}) breaches the 100-day guard`);
    const head = await streamHead(newest.url, (t) => t.split("\n").length >= 2, {
      maxBytes: 300_000,
    });
    const header = splitCsvLine(head.split("\n")[0].replace(/^\ufeff/, "")).map((c) => c.trim());
    const missing = OFSTED_CONSUMED.filter((c) => !header.includes(c));
    if (missing.length > 0)
      throw new Error(`the Ofsted file no longer carries: ${missing.join(", ")}`);
    return {
      logLine: `canary ofsted · file as at ${newest.date} · all ${OFSTED_CONSUMED.length} consumed columns present`,
      sourceDate: newest.date,
    };
  })();
}

function probeOds() {
  return (async () => {
    const base = "https://www.odsdatasearchandexport.nhs.uk/api/getReport?report=";
    const notes = [];
    for (const report of ["epraccur", "ebranchs", "edispensary", "egdpprac"]) {
      const response = await fetchRetry(base + report);
      if (!response.ok) throw new Error(`HTTP ${response.status} for the ODS report ${report}`);
      const text = await response.text();
      const lines = text.split("\n").filter((l) => l.trim() !== "");
      let badWidth = 0;
      let anchor = false;
      let recipesBite = false;
      for (const line of lines) {
        // Width counted quote-aware (names and addresses carry
        // commas inside quotes) — the shape check the loader
        // itself cannot do, since it drops wrong-width rows
        // silently.
        const width = splitCsvLine(line).length;
        if (width !== 27) badWidth += 1;
        if (report === "epraccur" && width === 27) {
          const cols = splitCsvLine(line);
          if (cols[0].trim() === "F81149") anchor = true;
          if (cols[12].trim() === "ACTIVE" && cols[25].trim() === "RO76") recipesBite = true;
        }
      }
      if (badWidth / Math.max(lines.length, 1) > 0.001)
        throw new Error(`${badWidth} of ${lines.length} ${report} rows are not 27 fields wide`);
      if (report === "epraccur" && (!anchor || !recipesBite))
        throw new Error(
          "the epraccur anchors are missing (golden practice F81149 or the ACTIVE + RO76 recipe)",
        );
      notes.push(`${report} ${lines.length} rows, ${badWidth} wrong-width`);
    }
    return { logLine: `canary ods · ${notes.join(" · ")}` };
  })();
}

async function discoverCqc() {
  const page = await (
    await fetchRetry("https://www.cqc.org.uk/about-us/transparency/using-cqc-data")
  ).text();
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

function probeCqcDirectory(discovery) {
  return (async () => {
    const head = await streamHead(discovery.directory.url, (t) => t.split("\n").length >= 6, {
      maxBytes: 200_000,
    });
    const lines = head.split("\n");
    const produced = lines
      .slice(0, 5)
      .join(" ")
      .match(/produced on (\d{1,2}) ([A-Za-z]+) (\d{4})/i);
    const producedOn = produced
      ? longDate(produced[1], produced[2], produced[3])
      : discovery.directory.date;
    if (!producedOn || ageDays(producedOn) > 21)
      throw new Error(`the CQC directory is stale (produced ${producedOn})`);
    const header = (lines[4] ?? "").split(",");
    const consumed = [
      "Name",
      "Postcode",
      "Service types",
      "Provider name",
      "CQC Location ID (for office use only)",
    ];
    const missing = consumed.filter((c) => !header.includes(c));
    if (missing.length > 0)
      throw new Error(`the CQC directory no longer carries: ${missing.join(", ")}`);
    return {
      logLine: `canary cqc-directory · produced ${producedOn} · header OK`,
      sourceDate: producedOn,
    };
  })();
}

function probeCqcRatings(discovery) {
  return (async () => {
    // Download the .ods, then stream content.xml only until the
    // Locations header is captured — never the full 1.1 GB.
    const { default: yauzl } = await import("yauzl");
    const { Readable } = await import("node:stream");
    const response = await fetchRetry(discovery.ratings.url);
    if (!response.ok) throw new Error(`HTTP ${response.status} for the CQC ratings file`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const outcome = await new Promise((resolve, reject) => {
      yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
        if (err) return reject(err);
        zip.readEntry();
        zip.on("entry", (entry) => {
          if (entry.fileName !== "content.xml") return zip.readEntry();
          zip.openReadStream(entry, (streamErr, stream) => {
            if (streamErr) return reject(streamErr);
            const web = Readable.toWeb(stream);
            const reader = web.getReader();
            const decoder = new TextDecoder("utf-8");
            let buf = "";
            let readmeText = "";
            let inLocations = false;
            let settled = false;
            const finish = (value) => {
              if (!settled) {
                settled = true;
                resolve(value);
              }
            };
            (async () => {
              try {
                for (;;) {
                  const { done, value } = await reader.read();
                  if (value) buf += decoder.decode(value, { stream: !done });
                  if (!inLocations) {
                    const at = buf.indexOf('table:name="Locations"');
                    if (at !== -1) {
                      readmeText = buf.slice(0, at);
                      buf = buf.slice(at);
                      inLocations = true;
                    } else if (buf.length > 400_000) {
                      buf = buf.slice(-200_000);
                    }
                  }
                  if (inLocations) {
                    const rowEnd = buf.indexOf("</table:table-row>");
                    if (rowEnd !== -1) {
                      const row = buf.slice(0, rowEnd);
                      if (row.includes("Location ID")) {
                        const cells = [...row.matchAll(/<text:p[^>]*>(.*?)<\/text:p>/gs)].map((p) =>
                          p[1].replace(/<[^>]+>/g, "").trim(),
                        );
                        await reader.cancel().catch(() => {});
                        return finish({ header: cells, readmeText });
                      }
                      buf = buf.slice(rowEnd + 18);
                    }
                  }
                  if (done) return finish({ header: null, readmeText });
                }
              } catch (error) {
                if (!settled) reject(error);
              }
            })();
          });
        });
        zip.on("error", reject);
      });
    });
    if (!outcome.header) throw new Error("the ratings Locations header was never reached");
    if (outcome.header[0] !== "Location ID")
      throw new Error("the ratings Locations sheet changed shape");
    const asAtMatch = outcome.readmeText.match(/as at (\d{1,2}) ([A-Za-z]+) (\d{4})/);
    const asAt = asAtMatch
      ? longDate(asAtMatch[1], asAtMatch[2], asAtMatch[3])
      : discovery.ratings.date;
    if (asAt && ageDays(asAt) > 100)
      throw new Error(`the CQC ratings file is stale (as at ${asAt})`);
    return {
      logLine: `canary cqc-ratings · as at ${asAt} · Locations header OK (early-abort stream)`,
      sourceDate: asAt,
    };
  })();
}

// --- planning.data.gov.uk (plan step M5.2) ---------------------
//
// One probe per dataset, mirroring what the three M5.2 loaders
// consume: the bulk CSV is reachable, its size is plausible, its
// Last-Modified is inside the loader's freshness rhythm, and its
// header still carries every consumed column. Green belt and
// listed buildings also get a streamed record count (the files
// are tens of MB — streamed, never held whole): green belt's
// piece count in band, and listed buildings' total row count in
// a band that keeps the current count above 370,000 while ended
// rows stay in the low thousands (the loader asserts the exact
// current count; the probe is the early warning).

const PLANNING_BASE = "https://files.planning.data.gov.uk/dataset";
const PLANNING_CONSUMED_BASE = [
  "entity",
  "reference",
  "name",
  "organisation-entity",
  "end-date",
  "entry-date",
  "geometry",
  "point",
  "quality",
];
const PLANNING_DATASETS = {
  "conservation-area": { extra: [], sizeMB: [30, 80], maxAgeDays: 100 },
  "article-4-direction-area": {
    extra: ["article-4-direction", "permitted-development-rights"],
    sizeMB: [12, 45],
    maxAgeDays: 100,
  },
  "green-belt": {
    extra: ["green-belt-core", "local-authority-district"],
    sizeMB: [20, 55],
    maxAgeDays: 430,
    count: { needle: "\ngreen-belt,", band: [150, 220], label: "pieces" },
  },
  "listed-building": {
    extra: ["listed-building-grade"],
    sizeMB: [60, 140],
    maxAgeDays: 100,
    count: { needle: "\nlisted-building,", band: [375000, 410000], label: "rows in file" },
  },
  "scheduled-monument": { extra: [], sizeMB: [15, 45], maxAgeDays: 100 },
};

async function streamRecordCount(url, needle) {
  const response = await fetchRetry(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let text = "";
  let count = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (value) text += decoder.decode(value, { stream: !done });
    let at = text.indexOf(needle);
    while (at !== -1) {
      count += 1;
      text = text.slice(at + needle.length);
      at = text.indexOf(needle);
    }
    if (text.length > 1_000_000) text = text.slice(-needle.length);
    if (done) break;
  }
  return count;
}

function probePlanningDataset(dataset) {
  return (async () => {
    const spec = PLANNING_DATASETS[dataset];
    const url = `${PLANNING_BASE}/${dataset}.csv`;
    const headResponse = await fetchRetry(url, { method: "HEAD" });
    if (!headResponse.ok) throw new Error(`HTTP ${headResponse.status} for the ${dataset} file`);
    const length = Number(headResponse.headers.get("content-length") ?? "0");
    const sizeMB = length / 1_000_000;
    if (sizeMB < spec.sizeMB[0] || sizeMB > spec.sizeMB[1])
      throw new Error(
        `the ${dataset} file is ${sizeMB.toFixed(1)} MB — outside the plausible band ${spec.sizeMB[0]}–${spec.sizeMB[1]} MB`,
      );
    const modified = headResponse.headers.get("last-modified");
    const modifiedDate = modified ? new Date(modified).toISOString().slice(0, 10) : null;
    if (modifiedDate && ageDays(modifiedDate) > spec.maxAgeDays)
      throw new Error(
        `the ${dataset} file was last modified ${modifiedDate} — beyond its ${spec.maxAgeDays}-day freshness rhythm`,
      );
    const head = await streamHead(url, (t) => t.includes("\n"), { maxBytes: 600_000 });
    const header = splitCsvLine(head.split("\n")[0].replace(/^﻿/, "")).map((c) => c.trim());
    const consumed = [...PLANNING_CONSUMED_BASE, ...spec.extra];
    const missing = consumed.filter((c) => !header.includes(c));
    if (missing.length > 0)
      throw new Error(`the ${dataset} file no longer carries: ${missing.join(", ")}`);
    let countNote = "";
    if (spec.count) {
      const n = await streamRecordCount(url, spec.count.needle);
      if (n < spec.count.band[0] || n > spec.count.band[1])
        throw new Error(
          `the ${dataset} file holds ${n} ${spec.count.label} — outside the band ${spec.count.band[0]}–${spec.count.band[1]}`,
        );
      countNote = ` · ${n} ${spec.count.label}`;
    }
    return {
      logLine: `canary ${dataset} · file ${sizeMB.toFixed(1)} MB, modified ${modifiedDate ?? "unknown"} · all ${consumed.length} consumed columns present${countNote}`,
      sourceDate: modifiedDate,
    };
  })();
}

// --- Natural England (plan step M5.3) --------------------------
//
// One probe per service the two nature loaders consume: the
// service's own count inside its band and, where the dataset's
// rhythm makes freshness meaningful, its data-edit date. The
// SSSI Units service is deliberately NOT probed — the loaders
// never read it (gap L4). Freshness follows each dataset's real
// rhythm: SSSI edits continuously (warn past ~130 days, the
// ONSPD-style quarter); the woodland inventories move as
// counties complete (warn when NEITHER has edited in ~9
// months); PHI versions twice a year (warn past ~9 months).
// SAC/SPA/Ramsar get NO staleness warning: they change rarely,
// their source dates are displayed on every row, and a
// permanent amber would teach the operator to ignore warnings.

const NE_BASE = "https://services.arcgis.com/JJzESW51TqeY9uat/arcgis/rest/services";

// ArcGIS (and OGC) services can report a failure as an HTTP
// 200 body carrying an `error` member and no data — the shape
// behind the 13 Nov 2026 PHI short read. A probe must record
// that as a FAILURE, never as an empty or zero result, so
// every JSON body the Natural England and flood probes consume
// is checked for the envelope before anything is read from it.
function assertNoErrorEnvelope(body, what) {
  const error = body?.error;
  if (!error) return;
  const parts = [error.code != null ? `code ${error.code}` : null, error.message ?? null].filter(
    (part) => part !== null && part !== "",
  );
  throw new Error(
    `${what} returned an error envelope${parts.length > 0 ? `: ${parts.join(": ")}` : ""}`,
  );
}

async function neLayerMeta(service) {
  const response = await fetchRetry(`${NE_BASE}/${service}/FeatureServer/0?f=json`);
  if (!response.ok) throw new Error(`HTTP ${response.status} for the ${service} layer`);
  const meta = await response.json();
  assertNoErrorEnvelope(meta, `the ${service} layer metadata`);
  const ms = meta.editingInfo?.dataLastEditDate;
  return { editDate: ms ? new Date(ms).toISOString().slice(0, 10) : null };
}

export async function neCount(service, where = "1=1") {
  const q = new URLSearchParams({ where, returnCountOnly: "true", f: "json" });
  const response = await fetchRetry(`${NE_BASE}/${service}/FeatureServer/0/query?${q}`);
  if (!response.ok) throw new Error(`HTTP ${response.status} for the ${service} count`);
  const body = await response.json();
  assertNoErrorEnvelope(body, `the ${service} count`);
  if (typeof body.count !== "number")
    throw new Error(`the ${service} count response changed shape`);
  return body.count;
}

function neBand(value, lo, hi, what) {
  if (value < lo || value > hi)
    throw new Error(`${what} is ${value} — outside the band ${lo}–${hi}`);
}

function probeSssi() {
  return (async () => {
    const n = await neCount("SSSI_England");
    neBand(n, 3900, 4400, "the SSSI feature count");
    const { editDate } = await neLayerMeta("SSSI_England");
    if (!editDate || ageDays(editDate) > 130)
      throw new Error(`the SSSI data was last edited ${editDate} — beyond its continuous rhythm`);
    return { logLine: `canary sssi · ${n} features · edited ${editDate}`, sourceDate: editDate };
  })();
}

function probeSac() {
  return (async () => {
    const total = await neCount("Special_Areas_of_Conservation_England");
    neBand(total, 1750, 2100, "the SAC feature count");
    const designated = await neCount(
      "Special_Areas_of_Conservation_England",
      "STATUS = 'Designated'",
    );
    neBand(designated, 1800, 1950, "the designated SAC feature count");
    return {
      logLine: `canary sac · ${total} features, ${designated} designated (${total - designated} candidate) · no staleness alarm by design`,
    };
  })();
}

function probeSpa() {
  return (async () => {
    const n = await neCount("Special_Protection_Areas_England");
    neBand(n, 950, 1250, "the SPA feature count");
    return { logLine: `canary spa · ${n} features · no staleness alarm by design` };
  })();
}

function probeRamsar() {
  return (async () => {
    const n = await neCount("Ramsar_England");
    neBand(n, 1150, 1450, "the Ramsar feature count");
    return { logLine: `canary ramsar · ${n} features · no staleness alarm by design` };
  })();
}

function probeAncientWoodland() {
  return (async () => {
    const n = await neCount("Ancient_Woodland_England");
    neBand(n, 50000, 57500, "the original woodland polygon count");
    const original = await neLayerMeta("Ancient_Woodland_England");
    const revised = await neLayerMeta("Ancient_Woodland_Revised_England");
    const freshest = [original.editDate, revised.editDate].filter(Boolean).sort().at(-1);
    if (!freshest || ageDays(freshest) > 270)
      throw new Error(
        `neither woodland inventory has edited since ${freshest} — the county revision has stalled or the services moved`,
      );
    return {
      logLine: `canary ancient-woodland · ${n} polygons · inventories last edited ${original.editDate} (original) / ${revised.editDate} (revised)`,
      sourceDate: original.editDate,
    };
  })();
}

export function probeAncientWoodlandRevised() {
  return (async () => {
    const n = await neCount("Ancient_Woodland_Revised_England");
    // The revision only ever grows as counties complete: the
    // count never decreases against the 45,406 polygons of the
    // 12 Nov 2026 snapshot. A drop means a county was pulled —
    // exactly what a canary exists to catch.
    if (n < 45406)
      throw new Error(
        `the revised woodland count is ${n} — below the 45,406 floor (the count never decreases; a county may have been pulled)`,
      );
    neBand(n, 45406, 70000, "the revised woodland polygon count");
    const { editDate } = await neLayerMeta("Ancient_Woodland_Revised_England");
    return {
      logLine: `canary ancient-woodland-revised · ${n} polygons · edited ${editDate}`,
      sourceDate: editDate,
    };
  })();
}

const PHI_MONTHS = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Sept: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
};

function probePriorityHabitats() {
  return (async () => {
    const n = await neCount("Priority_Habitats_Inventory_England");
    neBand(n, 750000, 900000, "the PHI patch count");
    const q = new URLSearchParams({
      where: "1=1",
      outFields: "Version",
      returnGeometry: "false",
      resultRecordCount: "1",
      f: "json",
    });
    const response = await fetchRetry(
      `${NE_BASE}/Priority_Habitats_Inventory_England/FeatureServer/0/query?${q}`,
    );
    if (!response.ok) throw new Error(`HTTP ${response.status} for the PHI version sample`);
    const body = await response.json();
    assertNoErrorEnvelope(body, "the PHI version sample");
    const version = body.features?.[0]?.attributes?.Version;
    const m = String(version ?? "").match(/^([A-Za-z]+)_(\d{2})$/);
    if (!m || !PHI_MONTHS[m[1]]) throw new Error(`unparseable PHI version "${version}"`);
    const ageMonths =
      new Date().getUTCFullYear() * 12 +
      (new Date().getUTCMonth() + 1) -
      ((2000 + Number(m[2])) * 12 + PHI_MONTHS[m[1]]);
    if (ageMonths > 9)
      throw new Error(
        `PHI version ${version} is ${ageMonths} months old — the twice-yearly cycle has slipped`,
      );
    return { logLine: `canary priority-habitats · ${n} patches · version ${version}` };
  })();
}

// --- Environment Agency flood products (plan step M5.1) -----
//
// One probe per product, mirroring what the three flood
// loaders consume: the OGC collections document names the
// collection; the unfiltered numberMatched — the only service
// count trusted, since the service silently ignores property
// filters (gap L5) — sits inside ±10% of the 12 Nov 2026
// snapshot; and the WMS build layer still stamps a single
// edition date, exactly as the loaders parse it. Freshness is
// warn-only: the publisher's metadata promises updates only
// "asNeeded", so an edition older than ~200 days (the
// quarterly ambition plus slack) warns rather than fails.
// Zones and RoFRS also keep the Exeter anchor — a small box
// around the golden point still returns the covering fact
// (Zone 3; a filed Very low) — the earliest warning that a
// republication moved the golden home.

const FLOOD_PRODUCTS = {
  "flood-zones": {
    items:
      "https://environment.data.gov.uk/geoservices/datasets/04532375-a198-476e-985e-0579a0a11b47/ogc/features/v1/collections/Flood_Zones_2_3_Rivers_and_Sea/items",
    wms: "https://environment.data.gov.uk/spatialdata/flood-map-for-planning-flood-zones/wms?service=WMS&version=1.3.0&request=GetCapabilities",
    collection: "Flood_Zones_2_3_Rivers_and_Sea",
    snapshot: 415408,
    anchor: { property: "flood_zone", value: "FZ3", label: "Zone 3" },
  },
  "flood-rivers-sea": {
    items:
      "https://environment.data.gov.uk/geoservices/datasets/96ab4342-82c1-4095-87f1-0082e8d84ef1/ogc/features/v1/collections/rofrs_4band/items",
    wms: "https://environment.data.gov.uk/spatialdata/nafra2-risk-of-flooding-from-rivers-and-sea/wms?service=WMS&version=1.3.0&request=GetCapabilities",
    collection: "rofrs_4band",
    snapshot: 249019,
    anchor: { property: "risk_band", value: "Very low", label: "Very low" },
  },
  "flood-surface-water": {
    items:
      "https://environment.data.gov.uk/geoservices/datasets/b5aaa28d-6eb9-460e-8d6f-43caa71fbe0e/ogc/features/v1/collections/rofsw/items",
    wms: "https://environment.data.gov.uk/spatialdata/nafra2-risk-of-flooding-from-surface-water/wms?service=WMS&version=1.3.0&request=GetCapabilities",
    collection: "rofsw",
    snapshot: 405438,
    anchor: null,
  },
};

const FLOOD_EXETER_POINT = { lat: 51.515224, lng: 0.021177 };

async function floodEdition(spec) {
  const response = await fetchRetry(spec.wms);
  if (!response.ok)
    throw new Error(`HTTP ${response.status} for the ${spec.collection} WMS capabilities`);
  const xml = await response.text();
  const pattern = new RegExp(`${spec.collection}_(\\d{2})_(\\d{2})_(\\d{4})`, "g");
  const dates = new Set([...xml.matchAll(pattern)].map((m) => `${m[3]}-${m[2]}-${m[1]}`));
  if (dates.size !== 1)
    throw new Error(
      `the ${spec.collection} WMS capabilities carry ${dates.size} distinct build dates — no single edition can be stamped`,
    );
  return [...dates][0];
}

export function probeFloodProduct(item) {
  const spec = FLOOD_PRODUCTS[item];
  return (async () => {
    const collectionsUrl = `${spec.items.split("/collections/")[0]}/collections?f=json`;
    const collectionsResponse = await fetchRetry(collectionsUrl);
    if (!collectionsResponse.ok)
      throw new Error(
        `HTTP ${collectionsResponse.status} for the ${spec.collection} collections document`,
      );
    const collectionsBody = await collectionsResponse.json();
    assertNoErrorEnvelope(collectionsBody, `the ${spec.collection} collections document`);
    if (!(collectionsBody.collections ?? []).some((c) => c.id === spec.collection))
      throw new Error(`the collections document no longer names ${spec.collection}`);
    const countResponse = await fetchRetry(`${spec.items}?limit=1&f=json`);
    if (!countResponse.ok)
      throw new Error(`HTTP ${countResponse.status} for the ${spec.collection} count`);
    const countBody = await countResponse.json();
    assertNoErrorEnvelope(countBody, `the ${spec.collection} count`);
    const matched = countBody.numberMatched;
    if (!Number.isInteger(matched))
      throw new Error(`the ${spec.collection} items response carries no numberMatched`);
    const lo = Math.floor(spec.snapshot * 0.9);
    const hi = Math.ceil(spec.snapshot * 1.1);
    if (matched < lo || matched > hi)
      throw new Error(
        `the ${spec.collection} count is ${matched} — outside the band ${lo}–${hi} (±10% of the ${spec.snapshot} snapshot)`,
      );
    let anchorNote = "";
    if (spec.anchor) {
      const d = 0.0005;
      const bbox = [
        FLOOD_EXETER_POINT.lng - d,
        FLOOD_EXETER_POINT.lat - d,
        FLOOD_EXETER_POINT.lng + d,
        FLOOD_EXETER_POINT.lat + d,
      ].join(",");
      const anchorResponse = await fetchRetry(`${spec.items}?bbox=${bbox}&limit=100&f=json`);
      if (!anchorResponse.ok)
        throw new Error(`HTTP ${anchorResponse.status} for the ${spec.collection} Exeter anchor`);
      const anchorBody = await anchorResponse.json();
      assertNoErrorEnvelope(anchorBody, `the ${spec.collection} Exeter anchor`);
      const hit = (anchorBody.features ?? []).some(
        (f) => f.properties?.[spec.anchor.property] === spec.anchor.value,
      );
      if (!hit)
        throw new Error(
          `the Exeter anchor no longer returns ${spec.anchor.label} for ${spec.collection} — a republication may have moved the golden home`,
        );
      anchorNote = ` · Exeter anchor ${spec.anchor.label} OK`;
    }
    const edition = await floodEdition(spec);
    const age = Math.floor(ageDays(edition));
    const base = `canary ${item} · ${matched} features · edition ${edition}${anchorNote}`;
    if (age > 200)
      return {
        warning: true,
        logLine: `${base} · edition is ${age} days old — beyond the ~200-day ambition (warn-only: the publisher promises updates only as needed)`,
        sourceDate: edition,
      };
    return { logLine: base, sourceDate: edition };
  })();
}

// --- NaPTAN transport stops (plan step M5.5) ----------------
//
// One probe, mirroring what the transport loader consumes —
// but the service's actual behaviour decides its shape (gap
// L5): the API sends no Last-Modified header (measured — Date
// only) and HEAD requests fail, so freshness is read from the
// content. The probe pulls ONE small ATCO area (571, Cardiff:
// 1,860 rows, 446 KB, ~2 s at the 13 Nov 2026 snapshot — the
// loader's whole-GB pull is 97 MB and far too heavy for a
// monthly probe) and asserts the header still carries every
// consumed column, the row count sits in band, and the file's
// own newest ModificationDateTime is within ~45 days —
// authorities edit NaPTAN continuously (3,065 rows changed in
// the month before the snapshot), so a stale area file means
// the service, not the area, has stopped.

const NAPTAN_CONSUMED = [
  "ATCOCode",
  "CommonName",
  "Longitude",
  "Latitude",
  "Easting",
  "Northing",
  "StopType",
  "Status",
  "ModificationDateTime",
];

function probeNaptan() {
  return (async () => {
    const url = "https://naptan.api.dft.gov.uk/v1/access-nodes?dataFormat=CSV&atcoAreaCodes=571";
    const response = await fetchRetry(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} for the NaPTAN area probe`);
    const text = await response.text();
    const lines = text.split("\n").filter((l) => l.trim() !== "");
    if (lines.length < 2) throw new Error("the NaPTAN area probe returned no rows");
    const header = splitCsvLine(lines[0].replace(/^﻿/, "")).map((c) => c.trim());
    const missing = NAPTAN_CONSUMED.filter((c) => !header.includes(c));
    if (missing.length > 0)
      throw new Error(`the NaPTAN file no longer carries: ${missing.join(", ")}`);
    const rows = lines.length - 1;
    if (rows < 1674 || rows > 2046)
      throw new Error(
        `the NaPTAN area 571 probe returned ${rows} rows — outside the band 1674–2046 (1,860 ±10% at the 13 Nov 2026 snapshot)`,
      );
    const modIndex = header.indexOf("ModificationDateTime");
    let newest = "";
    for (const line of lines.slice(1)) {
      const value = (splitCsvLine(line)[modIndex] ?? "").trim();
      if (value > newest) newest = value;
    }
    const newestDate = newest.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newestDate) || ageDays(newestDate) > 45)
      throw new Error(
        `the newest NaPTAN edit in area 571 is ${newestDate || "unreadable"} — beyond the 45-day freshness guard`,
      );
    return {
      logLine: `canary naptan · area 571: ${rows} stops · newest edit ${newestDate} · all ${NAPTAN_CONSUMED.length} consumed columns present`,
      sourceDate: newestDate,
    };
  })();
}

// Geofabrik (the M5.6 places loader's source): each country
// extract must still resolve to a DATED file no more than 14
// days old (Geofabrik republishes daily, so a stale dated
// file means the mirror stalled), and the published .md5 the
// loader verifies against must still parse. Cheap by design:
// three HEADs and three tiny text files — never the extracts
// themselves.
function probeGeofabrik() {
  return (async () => {
    const base = "https://download.geofabrik.de/europe/united-kingdom";
    const parts = [];
    let newest = "";
    for (const country of ["england", "wales", "scotland"]) {
      const head = await fetchRetry(`${base}/${country}-latest.osm.pbf`, { method: "HEAD" });
      if (!head.ok) throw new Error(`HTTP ${head.status} for the ${country} extract`);
      const match = /-(\d{2})(\d{2})(\d{2})\.osm\.pbf/.exec(head.url);
      if (!match)
        throw new Error(`the ${country} extract no longer resolves to a dated file (${head.url})`);
      const date = `20${match[1]}-${match[2]}-${match[3]}`;
      if (ageDays(date) > 14)
        throw new Error(
          `the ${country} extract is dated ${date} — beyond the 14-day freshness guard (Geofabrik republishes daily)`,
        );
      const md5Response = await fetchRetry(`${base}/${country}-latest.osm.pbf.md5`);
      if (!md5Response.ok)
        throw new Error(`HTTP ${md5Response.status} for the ${country} published md5`);
      const md5Text = await md5Response.text();
      if (!/^[0-9a-f]{32}\s+\S+/m.test(md5Text.trim()))
        throw new Error(`the ${country} published md5 no longer parses`);
      parts.push(`${country} ${date}`);
      if (date > newest) newest = date;
    }
    return {
      logLine: `canary geofabrik · ${parts.join(" · ")} · published md5 files parse`,
      sourceDate: newest,
    };
  })();
}

// OS Open Greenspace (the M5.6 parks loader's source): the
// anonymous Downloads API must still answer with a product
// version and a GB GeoPackage listing entry carrying a usable
// md5 and a plausible size. Edition AGE is warning-grade only
// — the product updates twice a year, so an old edition is
// normal for months at a time; past ~240 days it earns a
// look, never an alarm.
function probeOsGreenspace() {
  return (async () => {
    const productResponse = await fetchRetry(
      "https://api.os.uk/downloads/v1/products/OpenGreenspace",
    );
    if (!productResponse.ok)
      throw new Error(`HTTP ${productResponse.status} for the OS Greenspace product record`);
    const product = await productResponse.json();
    const version = typeof product?.version === "string" ? product.version.trim() : "";
    if (version === "") throw new Error("the OS Greenspace product record holds no version");
    const listResponse = await fetchRetry(
      "https://api.os.uk/downloads/v1/products/OpenGreenspace/downloads",
    );
    if (!listResponse.ok)
      throw new Error(`HTTP ${listResponse.status} for the OS Greenspace downloads listing`);
    const downloads = await listResponse.json();
    const entry = Array.isArray(downloads)
      ? downloads.find((e) => e.area === "GB" && e.format === "GeoPackage")
      : null;
    if (!entry) throw new Error("the downloads listing holds no GB GeoPackage entry");
    if (!/^[0-9a-f]{32}$/.test(entry.md5 ?? ""))
      throw new Error("the GB GeoPackage listing entry's md5 no longer parses");
    if (!(entry.size > 40_000_000 && entry.size < 80_000_000))
      throw new Error(
        `the GB GeoPackage is listed at ${entry.size} bytes — outside the expected 40–80 MB band`,
      );
    const versionMatch = /^(\d{4})-(\d{2})$/.exec(version);
    const editionDate = versionMatch ? `${versionMatch[1]}-${versionMatch[2]}-01` : null;
    const logLine = `canary os-greenspace · edition ${version} · GB GeoPackage ${entry.size} bytes · md5 ${entry.md5}`;
    if (editionDate && ageDays(editionDate) > 240) {
      return {
        warning: true,
        logLine: `${logLine} · the edition is over 240 days old (the product updates twice a year — worth a look, not an alarm)`,
        sourceDate: editionDate,
      };
    }
    return { logLine, sourceDate: editionDate };
  })();
}

export async function runCanaryProbes() {
  const results = [];
  const run = async (item, fn) => {
    const started = Date.now();
    try {
      const outcome = await fn();
      if (outcome.skipped) {
        results.push({
          item,
          mode: "probe",
          status: "skipped",
          logLine: `canary ${item} · skipped — ${outcome.skipped}`,
          durationMs: Date.now() - started,
        });
      } else if (outcome.warning) {
        results.push({
          item,
          mode: "probe",
          status: "warning",
          logLine: outcome.logLine,
          sourceDate: outcome.sourceDate ?? null,
          durationMs: Date.now() - started,
        });
      } else {
        results.push({
          item,
          mode: "probe",
          status: "succeeded",
          logLine: outcome.logLine,
          sourceDate: outcome.sourceDate ?? null,
          durationMs: Date.now() - started,
        });
      }
    } catch (error) {
      results.push({
        item,
        mode: "probe",
        status: "failed",
        logLine: null,
        errorMessage: error.message,
        durationMs: Date.now() - started,
      });
    }
  };
  await run("onspd", probeOnspd);
  await run("ppd", probePpd);
  await run("police", probePolice);
  await run("epc", probeEpc);
  await run("epc-deltas", probeEpcDeltas);
  await run("gias", probeGias);
  await run("ofsted", probeOfsted);
  await run("ods", probeOds);
  let discovery = null;
  try {
    discovery = await discoverCqc();
  } catch (error) {
    results.push({
      item: "cqc-directory",
      mode: "probe",
      status: "failed",
      logLine: null,
      errorMessage: error.message,
      durationMs: 0,
    });
    results.push({
      item: "cqc-ratings",
      mode: "probe",
      status: "failed",
      logLine: null,
      errorMessage: error.message,
      durationMs: 0,
    });
    return results;
  }
  await run("cqc-directory", () => probeCqcDirectory(discovery));
  await run("cqc-ratings", () => probeCqcRatings(discovery));
  for (const dataset of Object.keys(PLANNING_DATASETS)) {
    await run(dataset, () => probePlanningDataset(dataset));
  }
  await run("sssi", probeSssi);
  await run("sac", probeSac);
  await run("spa", probeSpa);
  await run("ramsar", probeRamsar);
  await run("ancient-woodland", probeAncientWoodland);
  await run("ancient-woodland-revised", probeAncientWoodlandRevised);
  await run("priority-habitats", probePriorityHabitats);
  await run("flood-zones", () => probeFloodProduct("flood-zones"));
  await run("flood-rivers-sea", () => probeFloodProduct("flood-rivers-sea"));
  await run("flood-surface-water", () => probeFloodProduct("flood-surface-water"));
  await run("naptan", probeNaptan);
  await run("geofabrik", probeGeofabrik);
  await run("os-greenspace", probeOsGreenspace);
  return results;
}
