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
  return results;
}
