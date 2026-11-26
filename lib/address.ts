// Check My Next Home — the brain's front door: address resolution and
// the input classifier (plan steps M6.1 + the classifier half of
// M6.11; decisions D6 + D7, ruling D20).
//
// Everything here resolves from LOADED DATA ONLY: the postcode
// directory (postcode_cache, filed by the M4.1 loader from the ONS
// Postcode Directory) and the filed address parts (price_paid's PAON /
// SAON / street, filed by the M4.2 loader from Land Registry Price
// Paid). There is no portal lookup, no scraping, and no postcode is
// ever guessed from a map pin — if the loaded data cannot support an
// answer, the ladder lands lower instead.
//
// The four-rung ladder (D6):
//   Rung 1 — a full address resolves to the home itself.
//   Rung 2 — a street + full postcode (or a full postcode alone)
//     resolves to the street's / postcode's address list.
//   Rung 3 — a partial postcode (the outward code, e.g. CM3) resolves
//     to a wider area, labelled "Wider area — CM3, not this exact
//     home". The rung-3 result type carries NO address-level payload
//     by construction, so address-level facts (a home's own sales,
//     its own certificate) cannot leak into a wider-area answer.
//   Rung 4 — no usable location: the no-location state.
//
// The flat rule: a flat is matched by building name + flat number
// TOGETHER (the Land Registry PAON + SAON pair), never by flat number
// alone — Flat 4 exists in Minerva House, Jupiter House and Juno
// House alike. A building may also be identified by its street
// number on a named street ("12 Ceres Crescent"), which is still
// building + flat together, not the flat number alone.
//
// The classifier's half of the job is shape only: it reads a typed or
// pasted string (listing-style strings included) and says what rung
// the shape proposes. Resolution then confirms against the loaded
// data, and any ambiguity — a number that is not loaded, a flat that
// is not in the building — lands on the honest LOWER rung. Nothing
// here ever guesses upward.

// ------------------------------------------------------------------
// Loaded-data shapes
// ------------------------------------------------------------------

// One row of the postcode directory, as filed in postcode_cache.
export interface DirectoryPostcode {
  postcode: string;
  latitude: number;
  longitude: number;
  council: string | null;
  ward: string | null;
  region: string | null;
  lsoaCode: string | null;
  msoaCode: string | null;
}

// The address parts of one filed sale, as held in price_paid. PAON is
// the primary addressable object (a house number, a house name, or a
// building as "MINERVA HOUSE, 12"); SAON is the secondary part (the
// flat within the building, e.g. "FLAT 4"), null for houses.
export interface LoadedAddressParts {
  postcode: string;
  paon: string | null;
  saon: string | null;
  street: string | null;
  locality: string | null;
  town: string | null;
}

// A filed address, display-ready. `label` is the one-line form built
// from the loaded parts ("19 Birkdale Rise", "Flat 4, Minerva House,
// 12 Ceres Crescent"); the raw parts ride along for later checks.
export interface ResolvedAddress extends LoadedAddressParts {
  label: string;
}

// The only reads resolution is allowed to make. The database-backed
// implementation is createAddressSource below; tests drive the same
// interface with fixture rows.
export interface AddressDataSource {
  directoryPostcode(postcode: string): Promise<DirectoryPostcode | null>;
  addressesInPostcode(postcode: string): Promise<LoadedAddressParts[]>;
  districtSummary(outward: string): Promise<{ postcodeCount: number } | null>;
}

// ------------------------------------------------------------------
// The ladder's results
// ------------------------------------------------------------------

export type AddressResolution =
  | {
      rung: 1;
      kind: "home";
      address: ResolvedAddress;
      directory: DirectoryPostcode;
    }
  | {
      rung: 2;
      kind: "address-list";
      directory: DirectoryPostcode;
      // The street the list is narrowed to, as filed (e.g.
      // "BIRKDALE RISE"), or null for the whole postcode.
      street: string | null;
      // The building the list is narrowed to, display-cased (e.g.
      // "Minerva House"), or null when no building was identified.
      building: string | null;
      addresses: ResolvedAddress[];
    }
  | {
      rung: 3;
      kind: "wider-area";
      outward: string;
      label: string;
      postcodeCount: number;
    }
  | { rung: 4; kind: "no-location" };

// ------------------------------------------------------------------
// Text normalisation
// ------------------------------------------------------------------

// Matching normal form: upper case, punctuation becomes spaces, runs
// of spaces collapse. "MINERVA HOUSE, 12" -> "MINERVA HOUSE 12".
function normText(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Display form: the filed words with their casing tidied, numbers and
// commas kept. "MINERVA HOUSE, 12" -> "Minerva House, 12".
export function displayText(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|[\s,])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

function isNumberToken(token: string): boolean {
  return /^[0-9]+[A-Z]?$/.test(token);
}

// The leading digits of a number token, for natural sorting ("12A" -> 12).
function numericPart(token: string | null): number {
  if (!token) return Number.POSITIVE_INFINITY;
  const n = Number.parseInt(token, 10);
  return Number.isNaN(n) ? Number.POSITIVE_INFINITY : n;
}

// ------------------------------------------------------------------
// Postcodes
// ------------------------------------------------------------------

const FULL_POSTCODE_RE = /\b([A-Z]{1,2}[0-9][A-Z0-9]?)\s*([0-9][A-Z]{2})\b/g;
// The outward token of a partial postcode. The match may
// end mid-token where the inward code begins — a digit
// follows ("E161" carries outward E16) — so the trailing
// guard is "not a letter", not a word boundary: a plain
// \b can never match there, and until 18 Nov 2026 it
// made compact partials in two-digit districts (E161,
// E161G, SW1A1) classify as carrying no outward at all.
// It still never ends immediately before a letter, which
// would split the outward's own digit+letter form.
const OUTWARD_RE = /\b([A-Z]{1,2}[0-9][A-Z0-9]?)(?![A-Z])/;

// Normalise a string that is meant to be one full postcode, tolerant
// of case and spacing ("cm32jt" -> "CM3 2JT"). Returns null for
// partials and non-postcodes.
export function normalisePostcode(raw: string): string | null {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = /^([A-Z]{1,2}[0-9][A-Z0-9]?)([0-9][A-Z]{2})$/.exec(compact);
  return match ? `${match[1]} ${match[2]}` : null;
}

// ------------------------------------------------------------------
// The classifier (M6.11, classifier half)
// ------------------------------------------------------------------

export interface ClassifiedInput {
  raw: string;
  // The full postcode found in the input, normalised, or null.
  postcode: string | null;
  // The outward (district) code — from the full postcode when one was
  // found, or the partial code the input carried.
  outward: string | null;
  // True when the input carried only a partial postcode.
  partialOnly: boolean;
  // The flat identifier as a bare key ("4", "12A"), or null.
  flat: string | null;
  // The non-postcode text in matching normal form, for the resolver's
  // street / building / number matching against the loaded data.
  text: string;
}

const FLAT_RE = /\b(?:FLAT|APARTMENT|APT|UNIT)\s*([0-9]+[A-Z]?)\b/;

export function classifyAddressInput(raw: string): ClassifiedInput {
  const upper = (raw ?? "").toUpperCase();

  // A full postcode, wherever it sits in a pasted string — the last
  // match wins (a postcode is the tail of an address, and an earlier
  // fragment like a flat's "1FH" never forms one on its own).
  let postcode: string | null = null;
  let postcodeSpan: [number, number] | null = null;
  for (const match of upper.matchAll(FULL_POSTCODE_RE)) {
    postcode = `${match[1]} ${match[2]}`;
    postcodeSpan = [match.index, match.index + match[0].length];
  }

  const outward = postcode ? postcode.split(" ")[0] : null;
  const rest = postcodeSpan
    ? `${upper.slice(0, postcodeSpan[0])} ${upper.slice(postcodeSpan[1])}`
    : upper;

  // No full postcode: a standalone outward token makes the input a
  // partial postcode ("CM3", "CM3 2"). Anything else carries no
  // postcode at all.
  let partialOutward: string | null = null;
  if (!postcode) {
    const m = OUTWARD_RE.exec(rest);
    if (m) partialOutward = m[1];
  }

  const flatMatch = FLAT_RE.exec(rest);

  return {
    raw,
    postcode,
    outward: outward ?? partialOutward,
    partialOnly: postcode === null && partialOutward !== null,
    flat: flatMatch ? flatMatch[1] : null,
    text: normText(rest),
  };
}

// ------------------------------------------------------------------
// Address parts
// ------------------------------------------------------------------

// Split a filed PAON into its building/house name and its number:
// "MINERVA HOUSE, 12" -> { name: "MINERVA HOUSE", number: "12" };
// "19" -> { name: null, number: "19" }; "ROSE COTTAGE" -> name only.
export function parsePaon(paon: string | null): { name: string | null; number: string | null } {
  if (!paon) return { name: null, number: null };
  const tokens = normText(paon).split(" ").filter(Boolean);
  if (tokens.length === 0) return { name: null, number: null };
  const numIdx = tokens.findIndex(isNumberToken);
  if (numIdx === -1) return { name: tokens.join(" "), number: null };
  const name = tokens.filter((_, i) => i !== numIdx).join(" ");
  return { name: name === "" ? null : name, number: tokens[numIdx] };
}

// The flat key of a filed SAON ("FLAT 4" -> "4"), or null when the
// SAON is not a plain flat identifier.
export function flatKeyOf(saon: string | null): string | null {
  if (!saon) return null;
  const match = /^(?:FLAT|APARTMENT|APT|UNIT)?\s*([0-9]+[A-Z]?)$/.exec(normText(saon));
  return match ? match[1] : null;
}

// The canonical home key (BUG-308): the identity of a
// home across the part-shapes its filings take. The
// Price Paid file and the EPC index file the same home
// differently — the building name in PAON with the
// number in SAON ("MANOR VILLAS" / "115"), the number
// and name together in PAON ("115 MANOR VILLAS"), or
// the number alone ("115") — and a PAON that already
// carries the street ("148 ATLANTIC REACH") repeats
// it. The strict parts key (homeKeyOf) treats those as
// different homes, so the picker lists one home twice.
//
// The canonical key keeps only what identifies the
// home: the postcode, every number token filed in PAON
// or SAON (sorted, deduped — the house number, the
// flat number, the building's street number), the
// street, and — only where no number is filed — the
// building name. A number on a street is one house
// whatever its building is called, while two unnumbered
// cottages on one street are two homes, so the name
// counts only where it is the whole identity. A flat
// marker separates a flat from a house carrying the
// same number on the same street. A name that IS the
// street carries nothing. This key dedupes picker lists
// ONLY — it never replaces homeKeyOf, the bundle and
// route identity.
export function canonicalHomeKey(parts: LoadedAddressParts): string {
  const numbers = new Set<string>();
  const names: string[] = [];
  let flat = false;
  const take = (value: string | null) => {
    if (!value) return;
    for (const token of normText(value).split(" ").filter(Boolean)) {
      if (isNumberToken(token)) numbers.add(token);
      else if (/^(FLAT|APARTMENT|APT|UNIT)$/.test(token)) flat = true;
      else if (!names.includes(token)) names.push(token);
    }
  };
  take(parts.paon);
  take(parts.saon);
  const street = normText(parts.street ?? "");
  let name = numbers.size > 0 ? "" : normText(names.join(" "));
  if (name === street) name = "";
  return [
    normText(parts.postcode ?? ""),
    [...numbers].sort().join(","),
    street,
    name,
    flat ? "F" : "",
  ].join("|");
}

// One home, one row: the canonical key's dedupe over a
// list of filed parts, in first-seen order. Within a
// canonical group the first shape serves — the reads
// order street, PAON, SAON, so the simplest shape
// ("115" before "115 MANOR VILLAS" before "MANOR
// VILLAS") wins. A street-less row then absorbs into
// the one kept row it matches on everything but the
// street, only where exactly one such row exists — so
// an ambiguous street-less row (a No. 1 on two streets)
// stays, never guessed.
export function dedupeAddressParts(rows: LoadedAddressParts[]): LoadedAddressParts[] {
  const seen = new Set<string>();
  const kept: LoadedAddressParts[] = [];
  for (const parts of rows) {
    const key = canonicalHomeKey(parts);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(parts);
  }
  const blankedKey = (parts: LoadedAddressParts): string => {
    const slots = canonicalHomeKey(parts).split("|");
    slots[2] = "";
    return slots.join("|");
  };
  const byBlanked = new Map<string, LoadedAddressParts[]>();
  for (const parts of kept) {
    const key = blankedKey(parts);
    const list = byBlanked.get(key) ?? [];
    list.push(parts);
    byBlanked.set(key, list);
  }
  return kept.filter((parts) => {
    if (normText(parts.street ?? "") !== "") return true;
    const matches = (byBlanked.get(blankedKey(parts)) ?? []).filter(
      (candidate) => candidate !== parts && normText(candidate.street ?? "") !== "",
    );
    return matches.length !== 1;
  });
}

// BUG-370 (26 Nov 2026): filed parts can carry a stray leading
// comma — 68,290 picking rows file a paon like ", OTTAWA TOWER,
// MURRELL CLOSE" — and the composed label then carries a double
// comma ("Flat 5, , Ottawa Tower, ..."). Collapse every double
// comma into one after composing, so the H1 reads "Flat 5,
// Ottawa Tower, ...". The founder's rule: collapse the double
// comma, don't trim the parts.
function collapseDoubleCommas(label: string): string {
  return label.replace(/,(?:\s*,)+/g, ",");
}

function toResolved(parts: LoadedAddressParts): ResolvedAddress {
  const paon = displayText(parts.paon ?? "");
  const street = parts.street ? displayText(parts.street) : null;
  // The label reads as an address line: "19 Birkdale Rise" for a
  // house (number + street), "Flat 4, Minerva House, 12 Ceres
  // Crescent" for a flat — the PAON's own comma (building name, street
  // number) is kept, and the street follows the PAON's number.
  let label = paon;
  // BUG-308: a SAON that is a bare number is the house
  // number, not a separate address line — "115 Manor
  // Villas", never "115, Manor Villas". A named SAON
  // ("Flat 4") keeps its comma.
  if (parts.saon) {
    label = isNumberToken(normText(parts.saon))
      ? `${displayText(parts.saon)} ${paon}`
      : `${displayText(parts.saon)}, ${paon}`;
  }
  // BUG-308: a PAON that already carries the street
  // ("148 ATLANTIC REACH") must not have it appended
  // again — the street appears once, never doubled.
  if (street && label !== "" && normText(label).endsWith(normText(street))) {
    return { ...parts, label: collapseDoubleCommas(label) };
  }
  if (street) {
    // BUG-308: the street follows with a space where the
    // PAON is number-led ("1 GOLF LODGES") or number-
    // trailed ("MINERVA HOUSE, 12") or a SAON is filed
    // — and with a comma only for a pure name ("ROSE
    // COTTAGE, HIGH STREET"). A number-led PAON took
    // the comma before, so its shape labelled
    // differently from the same home's SAON shape.
    const separator = parts.saon || /^[0-9]/.test(paon) || /[0-9]$/.test(paon) ? " " : ", ";
    label = label === "" ? street : `${label}${separator}${street}`;
  }
  return { ...parts, label: collapseDoubleCommas(label) };
}

// The display label for any filed address parts — the same
// one-line form a resolution carries ("19 Birkdale Rise",
// "Flat 4, Minerva House, 12 Ceres Crescent"). Later checks use
// it to name the home a filed record belongs to.
export function labelForAddressParts(parts: LoadedAddressParts): string {
  return toResolved(parts).label;
}

// The heading for a home: its label and postcode ("19 Birkdale Rise,
// CM3 2JT"). When the label is empty — a postcode-only delivery point
// with no house name, number or street — the postcode alone, with no
// leading comma ("MK10 1AA", never ", MK10 1AA").
export function headingForHome(label: string, postcode: string): string {
  return label === "" ? postcode : `${label}, ${postcode}`;
}

// The letter suffix of a number token, for natural sorting
// ("535A" -> "A"; "535" and a missing token -> "").
function numberSuffix(token: string | null): string {
  if (!token) return "";
  const match = /^[0-9]+([A-Z]?)$/.exec(token);
  return match ? match[1] : "";
}

// THE natural-order comparator for home rows (founder fix,
// 18 Nov 2026): every served list of homes — the resolver's
// rung-2 list, the picking union behind the suggestions
// dropdown, and the picker's merged local + Postio list —
// is ordered by this one comparator, so a street's homes
// read the way Royal Mail's address finder lists them
// (1, 2, 3 … 10, 12, 14), never in string order
// (1, 10, 14, 3 …). The key, in order:
//
//   - the street (case-folded; the filed form is upper
//     case already, a Postio row's is not);
//   - the building part's number, numerically, then its
//     letter suffix, so 535, then 535A, then 536. A
//     number the building part carries ANYWHERE —
//     leading ("12 MINERVA HOUSE"), trailing
//     ("MINERVA HOUSE 12") or after a comma
//     ("TILLY COURT, 29") — is the building's street
//     number (parsePaon extracts it wherever it sits),
//     so a named building interleaves among the numbered
//     houses at its number, the way Royal Mail lists
//     "1, Tilly Court, 29 Hastings Road" between 27 and
//     31 (refinement, 18 Nov 2026, from the founder's
//     E16 1GF screenshots). A building part with NO
//     number at all sorts after the whole numbered run
//     (a missing number reads as +Infinity);
//   - at the same street number, a plain numbered house
//     before a named building, named buildings
//     alphabetical by name;
//   - the flat/unit part's number, numerically, then its
//     suffix (Flat 2 before Flat 10);
//   - the display label, as the final tiebreak.
//
// Membership and precedence are NOT this comparator's
// business: where two layers name the same home, the
// dedupe (by home key, filed winning) has already kept
// one row before any list is ordered.
export function compareAddressParts(a: LoadedAddressParts, b: LoadedAddressParts): number {
  const key = (
    parts: LoadedAddressParts,
  ): [string, number, string, number, string, number, string, string] => {
    const paon = parsePaon(parts.paon);
    const flat = flatKeyOf(parts.saon);
    return [
      (parts.street ?? "").trim().toUpperCase(),
      numericPart(paon.number),
      numberSuffix(paon.number),
      paon.name === null ? 0 : 1,
      paon.name ?? "",
      numericPart(flat),
      numberSuffix(flat),
      labelForAddressParts(parts),
    ];
  };
  const kx = key(a);
  const ky = key(b);
  for (let i = 0; i < kx.length; i += 1) {
    if (kx[i] < ky[i]) return -1;
    if (kx[i] > ky[i]) return 1;
  }
  return 0;
}

function sortAddresses(addresses: ResolvedAddress[]): ResolvedAddress[] {
  return [...addresses].sort(compareAddressParts);
}

// ------------------------------------------------------------------
// Resolution (M6.1)
// ------------------------------------------------------------------

// Does the normalised input text contain the normalised phrase, on
// token boundaries?
function textContains(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${phrase} `);
}

// The number token immediately before a phrase in the input text
// ("12 CERES CRESCENT" -> "12"), or null.
function numberBefore(text: string, phrase: string): string | null {
  const idx = ` ${text} `.indexOf(` ${phrase} `);
  if (idx === -1) return null;
  const before = text.slice(0, idx).trim().split(" ").filter(Boolean);
  const last = before[before.length - 1];
  return last && isNumberToken(last) ? last : null;
}

export async function resolveAddressInput(
  raw: string,
  source: AddressDataSource,
): Promise<AddressResolution> {
  const input = classifyAddressInput(raw);

  // Rung 4: no postcode, full or partial — nothing to place. A street
  // name alone cannot be placed from loaded data (every town has an
  // Exeter Road), so it honestly lands here too.
  if (!input.postcode && !input.outward) return { rung: 4, kind: "no-location" };

  const widerArea = async (): Promise<AddressResolution> => {
    const district = await source.districtSummary(input.outward as string);
    if (!district || district.postcodeCount <= 0) return { rung: 4, kind: "no-location" };
    return {
      rung: 3,
      kind: "wider-area",
      outward: input.outward as string,
      label: `Wider area — ${input.outward}, not this exact home`,
      postcodeCount: district.postcodeCount,
    };
  };

  // Rung 3: a partial postcode is a wider area, never a home — the
  // result carries no address-level payload by construction.
  if (!input.postcode) return widerArea();

  const directory = await source.directoryPostcode(input.postcode);
  // A full postcode the directory does not hold: degrade to the wider
  // area it names, never a guessed home.
  if (!directory) return widerArea();

  // BUG-308: the list dedupes on the canonical home,
  // not the filed part-shape — two filings of one home
  // in different shapes collapse to one row.
  const rows = dedupeAddressParts(await source.addressesInPostcode(input.postcode));

  const listResult = (
    subset: LoadedAddressParts[],
    street: string | null,
    building: string | null,
  ): AddressResolution => ({
    rung: 2,
    kind: "address-list",
    directory,
    street,
    building,
    addresses: sortAddresses(subset.map(toResolved)),
  });

  const text = input.text;

  // The streets and buildings the loaded data actually holds here —
  // matching is decided by the data, not by parsing guesses.
  const streets = [...new Set(rows.map((r) => r.street).filter((s): s is string => Boolean(s)))];
  const streetHit =
    streets
      .filter((s) => textContains(text, normText(s)))
      .sort((a, b) => normText(b).length - normText(a).length)[0] ?? null;
  const buildingRows = rows.filter((r) => parsePaon(r.paon).name !== null);
  const buildingHit =
    buildingRows
      .map((r) => parsePaon(r.paon).name as string)
      .filter((name, i, all) => all.indexOf(name) === i)
      .filter((name) => textContains(text, name))
      .sort((a, b) => b.length - a.length)[0] ?? null;

  const inBuilding = (name: string): LoadedAddressParts[] =>
    rows.filter((r) => parsePaon(r.paon).name === name);

  // Rung 1 via the flat rule: flat + building together. The building
  // may be named, or identified by its street number on the street.
  if (input.flat) {
    let buildingName = buildingHit;
    if (!buildingName && streetHit) {
      const num = numberBefore(text, normText(streetHit));
      if (num) {
        const atNumber = buildingRows.filter(
          (r) => r.street === streetHit && parsePaon(r.paon).number === num,
        );
        const names = [
          ...new Set(
            atNumber.map((r) => parsePaon(r.paon).name).filter((n): n is string => n !== null),
          ),
        ];
        if (names.length === 1) buildingName = names[0];
      }
    }
    if (buildingName) {
      const flats = inBuilding(buildingName).filter((r) => flatKeyOf(r.saon) === input.flat);
      if (flats.length === 1) {
        return { rung: 1, kind: "home", address: toResolved(flats[0]), directory };
      }
      if (flats.length > 1) {
        return listResult(flats, streetHit, displayText(buildingName));
      }
      // The building is identified but the flat is not loaded in it:
      // the honest answer is the building's list, never a guessed flat.
      return listResult(inBuilding(buildingName), streetHit, displayText(buildingName));
    }
    // A flat number alone can never identify a home — fall through to
    // the street / postcode list.
  }

  // A named building with no flat: the building's list, unless the
  // building is a single address with no flats — then it is the home.
  if (buildingHit) {
    const subset = inBuilding(buildingHit);
    if (subset.length === 1 && !subset[0].saon) {
      return { rung: 1, kind: "home", address: toResolved(subset[0]), directory };
    }
    return listResult(subset, streetHit, displayText(buildingHit));
  }

  // Houses: a number (or house name) on the named street, matched
  // against flat-less filed addresses.
  if (streetHit) {
    const num = numberBefore(text, normText(streetHit));
    const houses = rows.filter((r) => !r.saon && r.street === streetHit);
    const byNumber = num ? houses.filter((r) => parsePaon(r.paon).number === num) : [];
    const byName = houses.filter((r) => {
      const name = parsePaon(r.paon).name;
      return name !== null && textContains(text, name);
    });
    const matched = byNumber.length > 0 ? byNumber : byName;
    if (matched.length === 1) {
      return { rung: 1, kind: "home", address: toResolved(matched[0]), directory };
    }
    if (matched.length > 1) return listResult(matched, streetHit, null);
    return listResult(
      rows.filter((r) => r.street === streetHit),
      streetHit,
      null,
    );
  }

  // Rung 2: the postcode's address list.
  return listResult(rows, null, null);
}

// ------------------------------------------------------------------
// The database-backed source
// ------------------------------------------------------------------

// The minimal shape of a pg client/pool, structurally — the repo's
// own `pg` driver satisfies it.
export interface AddressQueryable {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export function createAddressSource(db: AddressQueryable): AddressDataSource {
  return {
    async directoryPostcode(postcode) {
      const { rows } = await db.query(
        "SELECT postcode, latitude, longitude, council, ward, region, lsoa_code, msoa_code FROM postcode_cache WHERE postcode = $1",
        [postcode],
      );
      const row = rows[0];
      if (!row) return null;
      return {
        postcode: row.postcode as string,
        latitude: row.latitude as number,
        longitude: row.longitude as number,
        council: (row.council as string | null) ?? null,
        ward: (row.ward as string | null) ?? null,
        region: (row.region as string | null) ?? null,
        lsoaCode: (row.lsoa_code as string | null) ?? null,
        msoaCode: (row.msoa_code as string | null) ?? null,
      };
    },
    async addressesInPostcode(postcode) {
      const { rows } = await db.query(
        "SELECT DISTINCT paon, saon, street, locality, town, postcode FROM price_paid WHERE postcode = $1 ORDER BY street, paon, saon",
        [postcode],
      );
      return rows.map((row) => ({
        postcode: row.postcode as string,
        paon: (row.paon as string | null) ?? null,
        saon: (row.saon as string | null) ?? null,
        street: (row.street as string | null) ?? null,
        locality: (row.locality as string | null) ?? null,
        town: (row.town as string | null) ?? null,
      }));
    },
    async districtSummary(outward) {
      const { rows } = await db.query(
        "SELECT count(*)::int AS n FROM postcode_cache WHERE split_part(postcode, ' ', 1) = $1",
        [outward],
      );
      const n = Number(rows[0]?.n ?? 0);
      return n > 0 ? { postcodeCount: n } : null;
    },
  };
}
