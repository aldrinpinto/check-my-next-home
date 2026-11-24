// Loader: tribunal_building_safety_decisions — the
// published First-tier Tribunal (Property Chamber)
// building-safety decisions in the BSA/BSB case series
// (plan step M5.14; founder rulings Q1–Q7 of the M5.14
// gap check, 14 Nov 2026, recorded as decision D17).
//
// THE OTHER HALF OF THE STEP IS NOT A LOADER. The
// Building Safety Regulator's register of high-rise
// residential buildings is a postcode lookup by design
// — the register search service exists precisely so the
// register is never published as data, and no
// building-level official extract exists at any price
// (verified at the prep, 13 Nov 2026, and watched
// monthly by the bsr-register canary). So this loader
// files ONLY the tribunal slice, and the register half
// is a hand-off at serving time (M6.16): the report
// sends the reader to the official lookup. Nothing here
// — and nothing the register's absence could be read
// to mean — is a verdict on a building: a filed row
// records that a decision or order was published for a
// case, never that a building has cladding or is safe.
//
// SOURCE: GOV.UK's "Residential property tribunal
// decisions" finder (HM Courts & Tribunals Service /
// the First-tier Tribunal), via GOV.UK's own search and
// content APIs. Free, Crown copyright / OGL. The
// decisions are England only in practice (the Property
// Chamber's building-safety jurisdiction is England's);
// Wales, Scotland and Northern Ireland have their own
// routes and are named not-covered at serving (M6.16),
// never filed here.
//
// THE SELECTION RULE, verified against the live corpus
// on 14 Nov 2026 (the build's first pull):
//   1. Enumerate the finder with GOV.UK's search API
//      filtered to the tribunal_decision_category
//      "building-safety-act" — HMCTS's own Building
//      Safety Act tagging (57 items that day).
//   2. Select the items carrying at least one case
//      reference in the /BSA/ or /BSB/ series (24
//      documents that day). BSA is the section 123
//      remediation-order application series; BSB the
//      section 124 remediation-contribution-order
//      series.
//   3. The PDF's own header is the authority for what
//      files: an item is only filed for the BSA/BSB
//      references its header's case-reference field
//      actually carries (one Empire Square document is
//      the remediation order for an HYI-series case and
//      files nothing here, though its GOV.UK title
//      names the BSB case it was published alongside).
//   Cross-check that day: free-text probes of the whole
//   finder for every BSA/year and BSB/year 2022–2026
//   found exactly the same 24 documents — nothing
//   outside the category set, nothing in it missed.
//   The recorded limit: a building-safety decision the
//   publisher failed to tag into the category would be
//   missed by step 1, so the run output states the
//   category count it enumerated from, and the coverage
//   wording at serving is "published building-safety
//   orders naming this postcode, as at [date]" — never
//   an unqualified claim about tribunal decisions.
//
// READING A DECISION: each selected item's PDF is
// fetched and its first-page header block parsed — the
// case references, the Property (or Premises) line
// exactly as printed, the type of application, the
// decision date. The headers vary by region and era, so
// the parse is field-scoped and tolerant (see
// parseDecisionHeader): labelled fields are located on
// a whitespace-squashed view (some PDFs letter-space
// their text runs, splitting words and even case
// references mid-token) and the values read back from
// the display text. Order documents — the orders
// themselves, printed on a plainer form with a
// CASE REFERENCE line, a PREMISES line and the order's
// own heading — parse by the same fields.
//   order_kind comes from the document: the type
//   line's own words (or the order heading), falling
//   back to the case reference's series (BSA = section
//   123, BSB = section 124) where a combined decision
//   names both applications or the header carries no
//   type line. GOV.UK's sub-category metadata is
//   deliberately NOT used for kind: the same Canary
//   Riverside decision document is published twice
//   under two different sub-categories, so the
//   publisher's tagging cannot be the authority.
//   decision_date is the header's Date of Decision /
//   Date of Order (the last date in the field when it
//   lists several; a Date of Corrected Decision never
//   displaces the decision's own date), falling back
//   to the GOV.UK content item's
//   tribunal_decision_decision_date — order documents
//   carry no header date, and the fallback is counted
//   in the run output.
//   Case references file canonically: serials
//   zero-padded to four digits, ranges in the field
//   (0001-0007) expanded to one row per case, and
//   short-form continuations in the field (0001 and
//   0002) expanded against the full reference before
//   them.
//   A case published as several documents files as ONE
//   row: an order document speaks for the case first,
//   then the latest document; property_text falls back
//   to the best document of the case that prints one.
//
// THE PARSE-FAILURE DISCIPLINE (the prep named this
// class inevitable, and the first pull proved it):
// a document whose text cannot be extracted (scanned
// PDFs; PDFs whose text is CID-encoded) or whose
// header cannot be read files NOTHING and is counted
// BY NAME in the run output — never silently dropped,
// never filed from the GOV.UK title instead. The
// filer compares the run's failure count with the
// previous recorded run's: a count that has RISEN
// fails the run AFTER filing (the alert email is the
// point — a silently thinner index is the one outcome
// this step forbids). The filed corpus is therefore
// exact about what it is: the published BSA/BSB
// decisions this loader could read, as at the run.
//
// PDF TEXT: extractPdfText below is a deliberately
// small reader — it inflates the PDF's FlateDecode
// streams in file order and reads the literal-string
// text-showing operations. That reads the standard
// tribunal forms completely (the large majority of the
// corpus) and yields little or nothing for the two
// failure shapes above, which is exactly the boundary
// the parse-failure class exists to mark; no PDF
// library is taken on for a corpus of tens of
// documents a quarter. The corpus is small, so every
// quarterly pass re-reads the whole published set and
// stage-swaps the table: a corrected decision (the
// Hillside decision was re-issued corrected) lands by
// itself, and a withdrawn one cannot linger.
//
// CONTROL GOLDEN: the Oyster Bay remediation order —
// "1-31 Oyster Bay Apartments, Sterte, Poole BH15 2FN",
// case HAV/00HQ/BSA/2025/0002, 10 April 2026 — asserted
// exactly before anything files, in fixture and live
// runs alike (the enumeration set always contains it;
// if it ever stops matching, the parse has drifted and
// nothing files).
//
// Run it (DATABASE_URL from .env, Key K6):
//   npm run load:tribunal-building-safety            live pass
//   npm run load:tribunal-building-safety -- --verify-only
//   node loaders/load-tribunal-building-safety.mjs --file tests/fixtures/tribunal-building-safety
//
// --file reads a fixture directory in the live inputs'
// shape: a manifest.json (the enumerated items: link,
// title, the content item's decision date and
// sub-category) plus the items' PDFs. The PDFs travel
// base64-encoded (<name>.pdf.b64) through the repo's
// text-only push channel — the council-tax ODS
// precedent; a plain .pdf beside its .b64 wins.
//
// BUG-195 (streaming conversion): the enumeration hands
// each document to the case builder as it is fetched
// instead of building the whole document set first, and
// the builder keeps only per-case candidate lists — the
// merge rule needs each case's own documents, never the
// corpus as rows. The filing was already bounded (100-row
// stage inserts inside the one atomic swap) and is
// unchanged; the swap stays atomic, so a failure files
// nothing and a re-run files the set whole.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";
import pg from "pg";
import { formatCount } from "./progress.mjs";

const { Pool } = pg;

export const SOURCE_NAME =
  "GOV.UK — Residential property tribunal decisions (First-tier Tribunal, Property Chamber)";
export const FINDER_URL = "https://www.gov.uk/residential-property-tribunal-decisions";
const SEARCH_API = "https://www.gov.uk/api/search.json";
const CONTENT_API = "https://www.gov.uk/api/content";
const FETCH_HEADERS = { "User-Agent": "CheckMyNextHome/1.0 (+https://checkmynexthome.co.uk)" };

export const GOLDEN_CASE_REF = "HAV/00HQ/BSA/2025/0002";
export const GOLDEN_ROW = {
  caseRef: GOLDEN_CASE_REF,
  decisionDate: "2026-04-10",
  orderKind: "remediation-order",
  propertyText: "1-31 Oyster Bay Apartments, Sterte, Poole BH15 2FN",
  postcode: "BH15 2FN",
  isSingleFlat: false,
};

// ------------------------------------------------------------------
// PDF text extraction (see the header: a deliberately
// small reader; its two failure shapes ARE the
// parse-failure class, counted by the caller).

export function extractPdfText(buffer) {
  const chunks = [];
  const STREAM = Buffer.from("stream");
  const END = Buffer.from("endstream");
  let at = 0;
  while (true) {
    const s = buffer.indexOf(STREAM, at);
    if (s === -1) break;
    let start = s + STREAM.length;
    if (buffer[start] === 0x0d) start += 1;
    if (buffer[start] === 0x0a) start += 1;
    const e = buffer.indexOf(END, start);
    if (e === -1) break;
    let end = e;
    if (buffer[end - 1] === 0x0a) end -= 1;
    if (buffer[end - 1] === 0x0d) end -= 1;
    at = e + END.length;
    let data;
    try {
      data = inflateSync(buffer.subarray(start, end));
    } catch {
      continue;
    }
    const content = data.toString("latin1");
    if (!/\b(?:BT|Tj|TJ|Tf)\b/.test(content)) continue;
    const out = [];
    const re = /\((?:\\.|[^\\()])*\)\s*(?:Tj|'|")|\[(?:\\.|[^\\\]])*\]\s*TJ|\b(?:Td|TD|T\*)\b/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      const tok = m[0];
      if (/^(?:Td|TD|T\*)\b/.test(tok)) {
        out.push("\n");
        continue;
      }
      const strings = [...tok.matchAll(/\((?:\\.|[^\\()])*\)/g)].map((x) => decodePdfString(x[0]));
      if (strings.length > 0) out.push(strings.join(""));
    }
    chunks.push(out.join(""));
  }
  return chunks.join("\n\f\n");
}

function decodePdfString(literal) {
  let s = literal.slice(1, -1);
  s = s.replace(
    /\\([nrtbf()\\])/g,
    (_, c) => ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" })[c],
  );
  s = s.replace(/\\([0-7]{1,3})/g, (_, o) => String.fromCharCode(Number.parseInt(o, 8)));
  s = s.replace(/\\\r?\n/g, "");
  return Buffer.from(s, "latin1").toString("utf8");
}

// ------------------------------------------------------------------
// The header parse. The head of the extracted text is
// searched on a whitespace-squashed view — some PDFs
// letter-space their text runs, splitting words and
// even case references mid-token ("Case r eference",
// "LON/00 AT /BSB/2025/060 8") — while the values are
// read back from the single-spaced display text via an
// index map between the two views.

const HEAD_CHARS = 12_000;

const LABELS = [
  ["casereferences:", "refs"],
  ["casereference:", "refs"],
  ["tribunalcasereference:", "refs"],
  ["property:", "property"],
  ["premises:", "property"],
  ["typeofapplication:", "type"],
  ["dateofdecision:", "decisionDate"],
  ["dateoforder:", "decisionDate"],
  ["dateofcorrecteddecision:", "correctedDate"],
  ["dateofhearing:", "otherField"],
  ["hearingdates:", "otherField"],
  ["date:", "plainDate"],
  ["tribunal:", "otherField"],
  ["tribunalmember(s):", "otherField"],
  ["tribunalmembers:", "otherField"],
  ["tribunaljudge:", "otherField"],
  ["applicant:", "otherField"],
  ["applicants:", "otherField"],
  ["appellant:", "otherField"],
  ["appellants:", "otherField"],
  ["respondent:", "otherField"],
  ["respondents:", "otherField"],
  ["representative:", "otherField"],
  ["representedby:", "otherField"],
  ["interestedperson:", "otherField"],
  ["interestedpersons:", "otherField"],
  ["interestedparty:", "otherField"],
  ["venue:", "otherField"],
];

function squashWithMap(text) {
  const display = text.replace(/[\f\r\n\t]+/g, " ").replace(/ {2,}/g, " ");
  let squash = "";
  const map = [];
  for (let i = 0; i < display.length; i += 1) {
    if (display[i] !== " ") {
      squash += display[i];
      map.push(i);
    }
  }
  return { display, squash, map };
}

function findFields(squash, map, display) {
  const lower = squash.toLowerCase();
  const hits = [];
  for (const [label, field] of LABELS) {
    let at = 0;
    while (true) {
      const found = lower.indexOf(label, at);
      if (found === -1) break;
      hits.push({ field, start: found, end: found + label.length });
      at = found + label.length;
    }
  }
  hits.sort((a, b) => a.start - b.start);
  const fields = new Map();
  for (let i = 0; i < hits.length; i += 1) {
    const hit = hits[i];
    const nextStart = i + 1 < hits.length ? hits[i + 1].start : Math.min(squash.length, 4000);
    const fromDisplay = map[hit.end] ?? display.length;
    const toDisplay =
      nextStart < squash.length ? (map[nextStart] ?? display.length) : display.length;
    const value = display.slice(fromDisplay, toDisplay).trim().slice(0, 500);
    if (!fields.has(hit.field)) fields.set(hit.field, []);
    fields.get(hit.field).push(value);
  }
  return fields;
}

const FULL_REF_RE = /[A-Z]{3}\/[0-9A-Z]{4}\/[A-Z]{3}\/\d{4}\/\d{3,4}(?:-\d{3,4})?/g;

// Expands the references in a case-reference FIELD
// value (already whitespace-squashed): full references,
// ranges (0001-0007 → one per case), short-form
// continuations (a bare serial after a full reference
// inherits its prefix), serials canonicalised to four
// digits. Series-agnostic: the caller decides which
// series file.
export function expandRefs(fieldSquash) {
  const tokens = [];
  const tokenRe = /[A-Z]{3}\/[0-9A-Z]{4}\/[A-Z]{3}\/\d{4}\/\d{3,4}(?:-\d{3,4})?|\d{3,4}/g;
  let lastPrefix = null;
  let m;
  while ((m = tokenRe.exec(fieldSquash)) !== null) {
    const tok = m[0];
    if (tok.includes("/")) {
      const range = /^(.*\/)(\d{3,4})-(\d{3,4})$/.exec(tok);
      if (range) {
        const [, prefix, from, to] = range;
        const lo = Number(from);
        const hi = Number(to);
        if (hi >= lo && hi - lo <= 50) {
          for (let n = lo; n <= hi; n += 1) tokens.push(prefix + String(n).padStart(4, "0"));
          lastPrefix = prefix;
          continue;
        }
      }
      const cut = tok.lastIndexOf("/");
      lastPrefix = tok.slice(0, cut + 1);
      tokens.push(lastPrefix + tok.slice(cut + 1).padStart(4, "0"));
    } else if (lastPrefix) {
      tokens.push(lastPrefix + tok.padStart(4, "0"));
    }
  }
  return [...new Set(tokens)];
}

const MONTHS = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};
// \s* throughout: tight layouts print "8thMay 2025" with
// no space glyphs between the runs.
const DATE_RE =
  /(\d{1,2})(?:st|nd|rd|th)?\s*(january|february|march|april|may|june|july|august|september|october|november|december)\s*(\d{4})/gi;

export function parseHeaderDates(value) {
  const dates = [];
  for (const m of value.matchAll(DATE_RE)) {
    dates.push(`${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`);
  }
  return dates;
}

// A date field's value can run on into the document's
// heading and first lines (no label follows it in the
// header block), and one tight layout merges the
// hearing dates into the decision field itself. The
// value is therefore capped short and cut at the
// heading words that end a header block — what remains
// is the field's own dates, of which the decision date
// is the LAST (a field listing several dates lists the
// hearing first; the East Village "Date" field and the
// Urban Splash merged field both end on the decision).
const DATE_VALUE_CUTTERS =
  /(?:CONSENT ORDER|REMEDIATION CONTRIBUTION ORDER|REMEDIATION ORDER|PRELIMINARY|CORRECTED|DECISION)/i;

export function decisionDateFromField(value) {
  const cut = DATE_VALUE_CUTTERS.exec(value.slice(0, 120));
  const scoped = cut ? value.slice(0, cut.index) : value.slice(0, 120);
  const dates = parseHeaderDates(scoped);
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

const POSTCODE_RE = /\b([A-Z]{1,2}\d[0-9A-Z]?)\s+(\d[A-Z]{2})\b/;

export function extractPostcode(propertyText) {
  const m = POSTCODE_RE.exec(propertyText.toUpperCase().replace(/,/g, " "));
  return m ? `${m[1]} ${m[2]}` : null;
}

// The normalised building stem for within-postcode
// matching: lower-cased, the postcode removed, any
// leading flat list or number range removed,
// punctuation removed, whitespace collapsed.
export function buildingKey(propertyText, postcode) {
  let s = propertyText.toLowerCase();
  if (postcode) s = s.replace(postcode.toLowerCase(), " ");
  s = s.replace(/\b[a-z]{1,2}\d[0-9a-z]?\s+\d[a-z]{2}\b/g, " ");
  s = s.replace(/^\s*(?:flat|flats|unit|apartment|apartments)\s+[\d,\s&]+?(?=[a-z])/, "");
  s = s.replace(/^\s*\d+\s*-\s*\d+\s+/, "");
  s = s
    .replace(/[.,'"()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

export function isSingleFlat(propertyText) {
  return /^\s*(?:flat|flats|unit|apartment|apartments)\s+\d/i.test(propertyText);
}

function kindSignals(typeValues) {
  const joined = typeValues.join("\n");
  const rco =
    /remediation\s+contribution/i.test(joined) ||
    /\bsection\s*124\b/i.test(joined) ||
    /\bs\.?\s*124\b/i.test(joined);
  const ro =
    /remediation\s+order/i.test(joined) ||
    /\bsection\s*123\b/i.test(joined) ||
    /\bs\.?\s*123\b/i.test(joined);
  if (rco && ro) return "both";
  if (rco) return "remediation-contribution-order";
  if (ro) return "remediation-order";
  return typeValues.length > 0 ? "other" : null;
}

export function kindForRef(docKind, ref) {
  if (docKind === "remediation-order" || docKind === "remediation-contribution-order")
    return docKind;
  if (docKind === "other") return "other-building-safety";
  // "both" (a combined decision naming both applications)
  // and null (no type line read) fall back to the case
  // reference's own series.
  if (ref.includes("/BSA/")) return "remediation-order";
  if (ref.includes("/BSB/")) return "remediation-contribution-order";
  return "other-building-safety";
}

// Parses one decision document's extracted text into
// its header facts, or returns null when the header
// cannot be read (the parse-failure class — see the
// loader header). Pure: the caller counts nulls by
// name.
export function parseDecisionHeader(text) {
  if (!text || text.replace(/\s+/g, "").length < 200) return null;
  const head = text.slice(0, HEAD_CHARS);
  const { display, squash, map } = squashWithMap(head);
  const fields = findFields(squash, map, display);

  let refs = [];
  const refsValues = fields.get("refs") ?? [];
  for (const value of refsValues) {
    refs = refs.concat(expandRefs(value.replace(/\s+/g, "")));
  }
  if (refs.length === 0) {
    // Order documents on the plainest form print the
    // reference bare, near the top, with no label.
    const bare = squash.slice(0, 1500).match(FULL_REF_RE);
    if (bare) refs = expandRefs(bare[0]);
  }
  if (refs.length === 0) return null;

  // The property line ends at its postcode where it
  // prints one (order documents run the parties on
  // directly after the PREMISES line, with no label to
  // bound the field) — truncate there. A property with
  // no full postcode keeps its label-bounded value.
  let property = (fields.get("property") ?? []).find((v) => v.length >= 8) ?? null;
  if (property !== null) {
    const pc = POSTCODE_RE.exec(property.toUpperCase());
    if (pc) property = property.slice(0, pc.index + pc[0].length).trim();
  }

  const typeValues = fields.get("type") ?? [];
  let docKind = kindSignals(typeValues);
  let headingKind = null;
  if (/\bREMEDIATION\s+CONTRIBUTION\s+ORDER\b/.test(display))
    headingKind = "remediation-contribution-order";
  else if (/\bREMEDIATION\s+ORDER\b/.test(display)) headingKind = "remediation-order";
  if (docKind === null) docKind = headingKind;
  const isOrderDoc =
    (fields.get("decisionDate") ?? []).length > 0 &&
    (fields.get("refs") ?? []).length > 0 &&
    /\bdateoforder:/i.test(squash.replace(/\s+/g, ""))
      ? true
      : headingKind !== null && typeValues.length === 0;

  let headerDate = null;
  for (const value of fields.get("decisionDate") ?? []) {
    const date = decisionDateFromField(value);
    if (date !== null) headerDate = date;
  }
  if (headerDate === null) {
    for (const value of fields.get("plainDate") ?? []) {
      const date = decisionDateFromField(value);
      if (date !== null) headerDate = date;
    }
  }

  if (property === null && typeValues.length === 0 && headingKind === null) return null;
  return { refs, property, typeValues, docKind, headingKind, headerDate, isOrderDoc };
}

// ------------------------------------------------------------------
// Documents → cases. A document is { item, parsed } with
// item = { link, title, decisionDate } (decisionDate =
// the GOV.UK content item's metadata date, the fallback)
// and parsed = parseDecisionHeader's result or null (the
// parse-failure class). One row files per BSA/BSB case
// reference; a case published as several documents is
// spoken for by its order document first, then its
// latest document.

// The streaming form (BUG-195): documents arrive one at a
// time as the enumeration fetches them, and only their
// per-case candidate lists accumulate — the merge rule
// (order document first, then latest) needs each case's
// own documents, never the whole corpus as rows. The
// corpus is tens of documents a quarter; what the builder
// removes is the second whole-corpus array the collecting
// path built before filing.
export function createCaseBuilder() {
  const failures = [];
  const byRef = new Map();
  let documents = 0;
  return {
    get documents() {
      return documents;
    },
    addDocument(doc) {
      documents += 1;
      if (doc.parsed === null) {
        failures.push(doc.item.title?.trim() || doc.item.link);
        return;
      }
      for (const ref of doc.parsed.refs) {
        if (!ref.includes("/BSA/") && !ref.includes("/BSB/")) continue;
        if (!byRef.has(ref)) byRef.set(ref, []);
        byRef.get(ref).push(doc);
      }
    },
    finish() {
      const effectiveDate = (doc) => doc.parsed.headerDate ?? doc.item.decisionDate ?? null;

      const rows = [];
      const unfiledCases = [];
      let metadataDateFallbacks = 0;
      for (const [ref, candidates] of [...byRef.entries()].sort()) {
        const ordered = [...candidates].sort((a, b) => {
          if (a.parsed.isOrderDoc !== b.parsed.isOrderDoc) return a.parsed.isOrderDoc ? -1 : 1;
          const da = effectiveDate(a) ?? "";
          const db = effectiveDate(b) ?? "";
          return db.localeCompare(da);
        });
        const primary = ordered[0];
        const propDoc = ordered.find((doc) => doc.parsed.property !== null) ?? null;
        const date = effectiveDate(primary) ?? (propDoc ? effectiveDate(propDoc) : null);
        if (propDoc === null || date === null) {
          unfiledCases.push(ref);
          continue;
        }
        if (primary.parsed.headerDate === null && primary.item.decisionDate) {
          const used = effectiveDate(primary) === primary.item.decisionDate;
          if (used) metadataDateFallbacks += 1;
        }
        let orderKind = "other-building-safety";
        for (const doc of ordered) {
          const kind = kindForRef(doc.parsed.docKind, ref);
          if (kind !== "other-building-safety") {
            orderKind = kind;
            break;
          }
        }
        if (orderKind === "other-building-safety")
          orderKind = kindForRef(primary.parsed.docKind, ref);
        const propertyText = propDoc.parsed.property;
        const postcode = extractPostcode(propertyText);
        rows.push({
          caseRef: ref,
          decisionDate: date,
          orderKind,
          propertyText,
          postcode,
          buildingKey: buildingKey(propertyText, postcode),
          isSingleFlat: isSingleFlat(propertyText),
          sourceUrl: `https://www.gov.uk${propDoc.item.link}`,
        });
      }
      const noPostcode = rows.filter((row) => row.postcode === null).length;
      return { rows, failures, unfiledCases, metadataDateFallbacks, noPostcode };
    },
  };
}

// The collecting form over the builder: the whole document
// set in, the case rows out — the shape this step was built
// with, kept for small inputs and tests.
export function buildCases(documents) {
  const builder = createCaseBuilder();
  for (const doc of documents) builder.addDocument(doc);
  return builder.finish();
}

// The control golden, asserted before anything files
// (the council-tax discipline): if the Oyster Bay row
// is absent or has drifted, the parse has drifted and
// nothing files.
export function goldenChecks(rows) {
  const golden = rows.find((row) => row.caseRef === GOLDEN_CASE_REF);
  if (!golden)
    throw new Error(
      `the control golden is missing: no row for ${GOLDEN_CASE_REF} (Oyster Bay) — the parse has drifted; nothing filed`,
    );
  for (const key of ["decisionDate", "orderKind", "propertyText", "postcode", "isSingleFlat"]) {
    if (golden[key] !== GOLDEN_ROW[key])
      throw new Error(
        `the control golden has drifted: Oyster Bay ${key} is ${JSON.stringify(golden[key])}, expected ${JSON.stringify(GOLDEN_ROW[key])} — nothing filed`,
      );
  }
}

function rowValues(row) {
  return [
    row.caseRef,
    row.decisionDate,
    row.orderKind,
    row.propertyText,
    row.postcode,
    row.buildingKey,
    row.isSingleFlat,
    row.sourceUrl,
    SOURCE_NAME,
    row.decisionDate,
  ];
}

// The stage-swap (the council-tax full-pass pattern):
// the whole slice is re-filed in one transaction, so a
// corrected decision lands and a withdrawn one cannot
// linger. Idempotent: a second pass files the same
// rows to the same state.
export async function fileCases(pool, rows) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "CREATE TEMP TABLE stg_tribunal_building_safety_decisions (LIKE tribunal_building_safety_decisions INCLUDING ALL) ON COMMIT DROP",
    );
    for (let at = 0; at < rows.length; at += 100) {
      const chunk = rows.slice(at, at + 100);
      const tuples = [];
      const values = [];
      chunk.forEach((row, index) => {
        const base = index * 10;
        tuples.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`,
        );
        values.push(...rowValues(row));
      });
      await client.query(
        `INSERT INTO stg_tribunal_building_safety_decisions (case_ref, decision_date, order_kind, property_text, postcode, building_key, is_single_flat, source_url, source_name, source_date) VALUES ${tuples.join(", ")}`,
        values,
      );
    }
    await client.query("DELETE FROM tribunal_building_safety_decisions");
    await client.query(
      `INSERT INTO tribunal_building_safety_decisions (case_ref, decision_date, order_kind, property_text, postcode, building_key, is_single_flat, source_url, source_name, source_date) SELECT case_ref, decision_date, order_kind, property_text, postcode, building_key, is_single_flat, source_url, source_name, source_date FROM stg_tribunal_building_safety_decisions`,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// The previous recorded run's parse-failure count, read
// from this loader's own last recorded log line (the
// runner records items after the loader exits, so this
// is always the run BEFORE this one). Best-effort: any
// trouble reading it means no baseline, never a crash.
export async function previousFailureCount(pool) {
  try {
    const res = await pool.query(
      "SELECT log_line FROM loader_run_items WHERE item = 'load-tribunal-building-safety' AND log_line IS NOT NULL ORDER BY finished_at DESC NULLS LAST LIMIT 1",
    );
    const line = res.rows[0]?.log_line ?? "";
    const m = /parse failures: (\d+)/.exec(line);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------
// Inputs — live enumeration and the fixture directory,
// arriving in the same shape.

export function selectItems(results) {
  return results.filter((r) => /\/(BSA|BSB)\//.test(r.title ?? ""));
}

async function fetchJson(url, what) {
  const response = await fetch(url, {
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`${what}: HTTP ${response.status} from ${url}`);
  return response.json();
}

async function fetchBuffer(url, what) {
  const response = await fetch(url, {
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`${what}: HTTP ${response.status} from ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

// The enumeration streams (BUG-195): each search page's
// selected items are fetched and handed to the sink as
// they land, so neither the whole item list nor the whole
// document set is ever held — the sink (the case builder)
// keeps only per-case candidates.
async function enumerateLive(onDocument) {
  let total = null;
  let enumerated = 0;
  for (let start = 0; total === null || start < total; start += 100) {
    const page = await fetchJson(
      `${SEARCH_API}?count=100&start=${start}&filter_tribunal_decision_category=building-safety-act`,
      "the GOV.UK tribunal decisions search",
    );
    total = page.total;
    const results = page.results ?? [];
    enumerated += results.length;
    for (const item of selectItems(results)) {
      const doc = await fetchJson(`${CONTENT_API}${item.link}`, `the decision page ${item.link}`);
      const md = doc.details?.metadata ?? {};
      const pdf = (doc.details?.attachments ?? []).find(
        (a) => a.content_type === "application/pdf" && typeof a.url === "string",
      );
      const base = {
        link: item.link,
        title: item.title,
        decisionDate: md.tribunal_decision_decision_date ?? null,
        subCategory: md.tribunal_decision_sub_category ?? null,
      };
      if (!pdf) {
        onDocument({ item: base, parsed: null });
        continue;
      }
      const buffer = await fetchBuffer(pdf.url, `the decision PDF for ${item.link}`);
      onDocument({ item: base, parsed: parseDecisionHeader(extractPdfText(buffer)) });
    }
    if (results.length === 0) break;
  }
  return { categoryTotal: total, enumerated };
}

// Reads one fixture PDF from a --file directory: the
// plain file when present, else its base64 travel form.
export async function readFixturePdf(dir, name) {
  try {
    return await readFile(join(dir, name));
  } catch {
    const encoded = await readFile(join(dir, `${name}.b64`), "utf8");
    return Buffer.from(encoded.replace(/\s+/g, ""), "base64");
  }
}

async function enumerateFixture(dir, onDocument) {
  const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
  for (const entry of manifest.items) {
    const item = {
      link: entry.link,
      title: entry.title,
      decisionDate: entry.decisionDate ?? null,
      subCategory: entry.subCategory ?? null,
    };
    const buffer = await readFixturePdf(dir, entry.pdf);
    onDocument({ item, parsed: parseDecisionHeader(extractPdfText(buffer)) });
  }
  return { categoryTotal: null, enumerated: manifest.items.length };
}

// ------------------------------------------------------------------
// Main.

async function main() {
  const argv = process.argv.slice(2);
  const fileAt = argv.indexOf("--file");
  const args = {
    fileDir: fileAt === -1 ? null : argv[fileAt + 1],
    verifyOnly: argv.includes("--verify-only"),
  };
  if (fileAt !== -1 && !args.fileDir) throw new Error("--file needs a directory");

  const builder = createCaseBuilder();
  const { categoryTotal, enumerated } = args.fileDir
    ? await enumerateFixture(args.fileDir, (doc) => builder.addDocument(doc))
    : await enumerateLive((doc) => builder.addDocument(doc));
  const { rows, failures, unfiledCases, metadataDateFallbacks, noPostcode } = builder.finish();
  if (unfiledCases.length > 0)
    throw new Error(
      `cases whose documents parsed but yielded no property or no date — nothing filed: ${unfiledCases.join(", ")}`,
    );
  goldenChecks(rows);

  const counts = {
    ro: rows.filter((r) => r.orderKind === "remediation-order").length,
    rco: rows.filter((r) => r.orderKind === "remediation-contribution-order").length,
    other: rows.filter((r) => r.orderKind === "other-building-safety").length,
  };
  const failureNames = failures.map((t) => (t.length > 60 ? `${t.slice(0, 57)}…` : t));
  const summary =
    `load-tribunal-building-safety: ${formatCount(rows.length)} cases filed ` +
    `(${formatCount(counts.ro)} remediation orders, ${formatCount(counts.rco)} remediation contribution orders, ${formatCount(counts.other)} other building-safety) ` +
    `from ${formatCount(builder.documents)} published documents · parse failures: ${formatCount(failures.length)}` +
    (failures.length > 0 ? ` (${failureNames.join("; ")})` : "") +
    ` · ${formatCount(noPostcode)} cases name no full postcode` +
    (metadataDateFallbacks > 0
      ? ` · ${formatCount(metadataDateFallbacks)} dates from GOV.UK metadata where the header carries none`
      : "") +
    (categoryTotal !== null
      ? ` · enumerated ${formatCount(enumerated)} of ${formatCount(categoryTotal)} Building Safety Act category items on GOV.UK`
      : ` · fixture set of ${formatCount(enumerated)} captured documents`);

  if (args.verifyOnly) {
    console.log(`${summary} — verified only, nothing filed.`);
    return;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set — see .env.example (Key K6).");
    process.exit(1);
  }
  const pool = new Pool({ connectionString });
  try {
    const previous = args.fileDir ? null : await previousFailureCount(pool);
    await fileCases(pool, rows);
    console.log(`${summary}.`);
    if (previous !== null && failures.length > previous)
      throw new Error(
        `parse failures rose from ${previous} to ${failures.length} — the index just filed is thinner than the last run's; the newly unreadable: ${failureNames.join("; ")}`,
      );
  } finally {
    await pool.end();
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
