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
import {
  createBatchWatch,
  createProgressLogger,
  formatCount,
  formatDuration,
} from "./progress.mjs";
import { isTransientFetchError, TRANSIENT_RETRY_BUDGET_MS } from "./flood-resume.mjs";
import { createLoaderResume } from "./loader-resume.mjs";
import { createShortPageTracker, isShortPage, verifyReadCounts } from "./read-tolerance.mjs";

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
//
// Filing with resume support (BUG-368): the stage is a
// PERSISTENT table now (migration 0048, columns spelled
// out — the old TEMP used LIKE ... INCLUDING ALL, which
// must not be copied to a persistent table) and a
// loader_checkpoint row records the last fully staged
// chunk, so a killed run resumes staging from the
// checkpoint instead of re-staging the whole slice. The
// enumeration (GOV.UK pages + PDF downloads) still
// re-runs — only the staging is saved. The edition is
// the newest decision date; a new decision publishing
// between a kill and its resume changes the edition and
// the checkpoint is discarded, which is the safe
// behaviour. The swap stays atomic, and a successful
// swap clears staging + checkpoint together (BUG-248
// unchanged).
/**
 * @param {any} pool
 * @param {any[]} rows
 * @param {{ progress?: import("./progress.mjs").ProgressLogger | null, restart?: boolean }} [options]
 */
export async function fileCases(pool, rows, { progress = null, restart = false } = {}) {
  // BUG-265: the staging is the filing phase — a tally over
  // the stage chunks, a slow-chunk warning and a heartbeat,
  // so the log moves while the cases file.
  progress?.stage(`staging ${formatCount(rows.length)} tribunal cases`);
  const chunks = Math.ceil(rows.length / 100);
  const stageTally = progress?.tally({
    label: "staging",
    total: chunks,
    every: Math.max(1, Math.ceil(chunks / 10)),
    unit: "chunks",
  });
  const stageWatch = createBatchWatch();
  const maxDate = rows.reduce((m, r) => (r.decisionDate > m ? r.decisionDate : m), "");
  const edition = `tribunal-${maxDate || "none"}`;
  const expected = rows.length;
  const client = await pool.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS tribunal_building_safety_stage (
      case_ref text, decision_date date, order_kind text, property_text text,
      postcode text, building_key text, is_single_flat boolean,
      source_url text, source_name text, source_date date,
      seq bigint NOT NULL, UNIQUE (seq)
    )`);
  const resume = createLoaderResume(client, {
    loader: "load-tribunal-building-safety",
    stageTable: "tribunal_building_safety_stage",
    progress,
    restart,
  });
  const resumePrep = await resume.prepare({ edition, expected });
  const startAt = resumePrep.resumed ? resumePrep.checkpoint.next_start_index : 0;
  let chunksDone = Math.floor(startAt / 100);
  let stagedRows = resumePrep.resumed ? resumePrep.checkpoint.filed_count : 0;
  try {
    for (let at = startAt; at < rows.length; at += 100) {
      const chunk = rows.slice(at, at + 100);
      const started = Date.now();
      const tuples = [];
      const values = [];
      const base = resume.takeSeq(chunk.length);
      chunk.forEach((row, index) => {
        const b = index * 11;
        tuples.push(
          `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}, $${b + 10}, $${b + 11})`,
        );
        values.push(...rowValues(row), base + index);
      });
      await client.query(
        `INSERT INTO tribunal_building_safety_stage (case_ref, decision_date, order_kind, property_text, postcode, building_key, is_single_flat, source_url, source_name, source_date, seq) VALUES ${tuples.join(", ")}`,
        values,
      );
      stagedRows += chunk.length;
      chunksDone += 1;
      const { tookMs, averageMs, slow } = stageWatch.observe(Date.now() - started);
      stageTally?.tick(chunksDone);
      progress?.heartbeat({ stage: "staging", done: chunksDone, total: chunks });
      if (slow) {
        progress?.warning({
          what: "stage chunk duration",
          value: `chunk ${chunksDone} took ${formatDuration(tookMs)}`,
          threshold: `3x recent average ${formatDuration(averageMs)}`,
        });
      }
      // BUG-368: one checkpoint line per committed chunk —
      // the save is visible in the logs, and a kill after
      // this line loses at most the chunk in flight.
      await resume.checkpoint({
        edition,
        expected,
        nextStartIndex: at + chunk.length,
        read: at + chunk.length,
        filed: stagedRows,
        unit: "rows",
      });
    }
    stageTally?.finish(chunksDone, `${formatCount(rows.length)} cases staged`);
  } catch (error) {
    // BUG-368: the staging is durable per chunk — no
    // transaction to roll back, and the staged rows +
    // checkpoint STAY for the next run to resume from.
    progress?.failed({
      stage: "filing",
      filed: stagedRows,
      total: rows.length,
      error,
      resume: resume.resumeNote(),
    });
    client.release();
    throw error;
  }
  try {
    const stagedRes = await client.query(
      "SELECT count(*)::int AS n FROM tribunal_building_safety_stage",
    );
    if (stagedRes.rows[0].n !== expected)
      throw new Error("the staged case count does not match — rolling back");
    progress?.stage("swap started — replacing the filed tribunal cases");
    await client.query("BEGIN");
    try {
      await client.query("DELETE FROM tribunal_building_safety_decisions");
      await client.query(
        `INSERT INTO tribunal_building_safety_decisions (case_ref, decision_date, order_kind, property_text, postcode, building_key, is_single_flat, source_url, source_name, source_date) SELECT case_ref, decision_date, order_kind, property_text, postcode, building_key, is_single_flat, source_url, source_name, source_date FROM tribunal_building_safety_stage`,
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
    // The run is complete: staging + checkpoint go together,
    // so nothing is left behind for the next enumeration.
    await resume.clear();
  } catch (error) {
    progress?.failed({
      stage: "filing",
      filed: stagedRows,
      total: rows.length,
      error,
      resume: resume.resumeNote(),
    });
    client.release();
    throw error;
  }
  client.release();
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

const RETRY_DELAYS_MS = [5000, 15000, 30000, 60000];
// BUG-385: a transient fetch failure is retried for up to 30
// minutes (TRANSIENT_RETRY_BUDGET_MS, founder-ordered 27 Nov
// 2026) — the same retry the flood loaders got in BUG-384.
// Past the budget the original error fails the run and it
// waits. The delay caps at the last schedule entry; a test
// may pass delaysMs: [] for instant retries. Non-transient
// failures throw at once (see isTransientFetchError). `init`
// is the fetch init, or a function returning a fresh one
// per attempt (a caller passing an AbortSignal.timeout
// needs a new signal each retry — a fired one stays
// aborted).
/**
 * @param {string} url
 * @param {string} what
 * @param {{ delaysMs?: number[], onRetry?: ((error: Error, attempt: number, delay: number, what: string) => void) | null, retryBudgetMs?: number, init?: any }} [opts]
 */
export async function fetchResponse(
  url,
  what,
  {
    delaysMs = RETRY_DELAYS_MS,
    onRetry = null,
    retryBudgetMs = TRANSIENT_RETRY_BUDGET_MS,
    init = undefined,
  } = {},
) {
  const startedAt = Date.now();
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      const response = await fetch(url, typeof init === "function" ? init() : init);
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} for ${what}`);
        error.status = response.status;
        throw error;
      }
      return response;
    } catch (error) {
      if (!isTransientFetchError(error)) throw error;
      if (Date.now() - startedAt >= retryBudgetMs) throw error;
      const delay =
        delaysMs.length === 0 ? 0 : delaysMs[Math.min(attempt - 1, delaysMs.length - 1)];
      onRetry?.(error, attempt, delay, what);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// The loader's own HTTP-error wording, kept: fetchResponse
// throws `HTTP <status> for <what>`, this helper rewords a
// status failure into the form its callers have always
// seen (and keeps the status on the error, as
// fetchResponse stamps it). A failure with no status —
// the transport's own error — passes through untouched.
function rewordHttpError(error, message) {
  if (typeof error?.status !== "number") return error;
  return Object.assign(new Error(message), { status: error.status });
}

async function fetchJson(url, what, opts = {}) {
  let response;
  try {
    response = await fetchResponse(url, what, {
      ...opts,
      init: () => ({ headers: FETCH_HEADERS, signal: AbortSignal.timeout(60_000) }),
    });
  } catch (error) {
    throw rewordHttpError(error, `${what}: HTTP ${error.status} from ${url}`);
  }
  return response.json();
}

async function fetchBuffer(url, what, opts = {}) {
  let response;
  try {
    response = await fetchResponse(url, what, {
      ...opts,
      init: () => ({ headers: FETCH_HEADERS, signal: AbortSignal.timeout(120_000) }),
    });
  } catch (error) {
    throw rewordHttpError(error, `${what}: HTTP ${error.status} from ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

// The enumeration streams (BUG-195): each search page's
// selected items are fetched and handed to the sink as
// they land, so neither the whole item list nor the whole
// document set is ever held — the sink (the case builder)
// keeps only per-case candidates.
//
// BUG-265: the enumeration is the run's long phase — a
// tally over the documents read, a heartbeat and a
// slow-document warning. No total: the category total
// counts every item in the category, not the selected
// documents, so no percentage is ever shown.
//
// BUG-387: page.total CAN serve as the independent expected
// (assessed from this loop before wiring): it is the search
// API's count of results matching the filtered query, so the
// paged enumeration should return exactly that many results
// in total — the loop already trusts it as its bound. The
// "No total" note above means the total counts category
// items, not the selected documents, so the gate below is
// read-vs-total over `enumerated`, and the filed/geoless
// pair is the enumeration's own reconciliation (selected
// for a document fetch vs counted as not selected); the
// case rows-vs-staged reconciliation stays fileCases' own
// check. The expected is fixed from the FIRST page's
// total — a snapshot: items published mid-run wait for the
// next run, and items removed mid-run fail the gate rather
// than filing thin.
/**
 * @param {(doc: { item: { link: string, title: string, decisionDate: string | null, subCategory: string | null }, parsed: any }) => void} onDocument
 * @param {{ progress?: import("./progress.mjs").ProgressLogger | null }} [options]
 */
export async function enumerateLive(onDocument, { progress = null } = {}) {
  let expected = null;
  let enumerated = 0;
  let documents = 0;
  let selected = 0;
  // BUG-387: the short pages this enumeration met, for the one
  // re-fetch each earns (below) and the loud log if the read
  // lands short.
  const refetch = createShortPageTracker();
  const readTally = progress?.tally({ label: "reading", every: 10, unit: "documents" });
  const readWatch = createBatchWatch();
  for (let start = 0; expected === null || start < expected; start += 100) {
    const page = await fetchJson(
      `${SEARCH_API}?count=100&start=${start}&filter_tribunal_decision_category=building-safety-act`,
      "the GOV.UK tribunal decisions search",
    );
    if (expected === null) expected = page.total;
    let results = page.results ?? [];
    // BUG-387: a page that comes back short — fewer results
    // than asked for while more remain — is re-requested ONCE,
    // in place, through the same fetchJson, so it carries the
    // BUG-385 transient retry; the fuller of the two pages is
    // the one enumerated. The loop still advances start by 100
    // after a page that stays short, so the shortfall is the
    // gate's to catch below.
    const want = Math.min(100, expected - start);
    if (isShortPage({ returned: results.length, want, read: enumerated, expected })) {
      refetch.note({ startIndex: start, want, returned: results.length });
      const again = await fetchJson(
        `${SEARCH_API}?count=100&start=${start}&filter_tribunal_decision_category=building-safety-act`,
        "the GOV.UK tribunal decisions search",
      );
      const againResults = again.results ?? [];
      refetch.recordRefetch({ startIndex: start, returned: againResults.length });
      progress?.warning({
        what: "short page re-fetched (BUG-387)",
        value: `page at start ${start} returned ${formatCount(results.length)} of ${formatCount(want)} — re-fetch returned ${formatCount(againResults.length)}`,
        threshold: "one re-fetch per short page",
      });
      if (againResults.length > results.length) results = againResults;
    }
    enumerated += results.length;
    const selectedItems = selectItems(results);
    selected += selectedItems.length;
    for (const item of selectedItems) {
      const started = Date.now();
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
      } else {
        const buffer = await fetchBuffer(pdf.url, `the decision PDF for ${item.link}`);
        onDocument({ item: base, parsed: parseDecisionHeader(extractPdfText(buffer)) });
      }
      documents += 1;
      const { tookMs, averageMs, slow } = readWatch.observe(Date.now() - started);
      readTally?.tick(documents);
      progress?.heartbeat({ stage: "reading", done: documents });
      if (slow) {
        progress?.warning({
          what: "decision document duration",
          value: `document ${item.link} took ${formatDuration(tookMs)}`,
          threshold: `3x recent average ${formatDuration(averageMs)}`,
        });
      }
    }
    if (results.length === 0) break;
  }
  readTally?.finish(documents);
  // BUG-387: the read gate — read-vs-total with the 1%
  // tolerance after the re-fetch. A shortfall over 1% throws
  // with nothing filed, exactly as a failed enumeration
  // throws today; an overshoot (read above the service count)
  // is never tolerated.
  const verdict = verifyReadCounts({
    label: "tribunal decisions",
    read: enumerated,
    expected,
    filed: selected,
    geoless: enumerated - selected,
    refetch: refetch.summary(),
  });
  return { categoryTotal: expected, enumerated, refetch: refetch.summary(), verdict };
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

async function enumerateFixture(dir, onDocument, { progress = null } = {}) {
  const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
  // BUG-265: the fixture set is small and its size is
  // known — a tally over the manifest's own count, so the
  // log carries a real percentage.
  const readTally = progress?.tally({
    label: "reading",
    total: manifest.items.length,
    every: Math.max(1, Math.ceil(manifest.items.length / 10)),
    unit: "documents",
  });
  const readWatch = createBatchWatch();
  let documents = 0;
  for (const entry of manifest.items) {
    const started = Date.now();
    const item = {
      link: entry.link,
      title: entry.title,
      decisionDate: entry.decisionDate ?? null,
      subCategory: entry.subCategory ?? null,
    };
    const buffer = await readFixturePdf(dir, entry.pdf);
    onDocument({ item, parsed: parseDecisionHeader(extractPdfText(buffer)) });
    documents += 1;
    const { tookMs, averageMs, slow } = readWatch.observe(Date.now() - started);
    readTally?.tick(documents);
    progress?.heartbeat({
      stage: "reading",
      done: documents,
      total: manifest.items.length,
    });
    if (slow) {
      progress?.warning({
        what: "decision document duration",
        value: `document ${entry.link} took ${formatDuration(tookMs)}`,
        threshold: `3x recent average ${formatDuration(averageMs)}`,
      });
    }
  }
  readTally?.finish(documents);
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
    restart: argv.includes("--restart"),
  };
  if (fileAt !== -1 && !args.fileDir) throw new Error("--file needs a directory");

  // BUG-265: one logger for the run — the reading tally
  // lives in the enumeration, the staging tally in
  // fileCases; the enumeration failure line is here.
  const progress = createProgressLogger({ name: "load-tribunal-building-safety" });
  progress.stage("enumerating the published building-safety decisions");

  const builder = createCaseBuilder();
  let categoryTotal;
  let enumerated;
  let verdict;
  let rows;
  let failures;
  let unfiledCases;
  let metadataDateFallbacks;
  let noPostcode;
  try {
    ({ categoryTotal, enumerated, verdict } = args.fileDir
      ? await enumerateFixture(args.fileDir, (doc) => builder.addDocument(doc), { progress })
      : await enumerateLive((doc) => builder.addDocument(doc), { progress }));
    if (verdict?.withinTolerance) {
      // BUG-387: LOUD, twice — the progress log line here and
      // the run summary below both carry the shortfall; a
      // tolerated short read is never silent.
      progress.warning({
        what: "read shortfall accepted (BUG-387)",
        value: verdict.notice,
        threshold: "1% after re-fetch",
      });
    }
    ({ rows, failures, unfiledCases, metadataDateFallbacks, noPostcode } = builder.finish());
    if (unfiledCases.length > 0)
      throw new Error(
        `cases whose documents parsed but yielded no property or no date — nothing filed: ${unfiledCases.join(", ")}`,
      );
    goldenChecks(rows);
  } catch (err) {
    // BUG-265: the enumeration, the case build and the
    // golden check all fail before anything is filed.
    progress.failed({
      stage: "enumeration",
      filed: 0,
      error: err,
      resume: "re-run from scratch (nothing is filed until the swap)",
    });
    throw err;
  }

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
      : ` · fixture set of ${formatCount(enumerated)} captured documents`) +
    (verdict?.notice ? ` · ${verdict.notice}` : "");

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
    await fileCases(pool, rows, { progress, restart: args.restart });
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
