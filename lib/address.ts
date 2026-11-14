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
const OUTWARD_RE = /\b([A-Z]{1,2}[0-9][A-Z0-9]?)\b/;

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

function toResolved(parts: LoadedAddressParts): ResolvedAddress {
  const paon = displayText(parts.paon ?? "");
  const street = parts.street ? displayText(parts.street) : null;
  // The label reads as an address line: "19 Birkdale Rise" for a
  // house (number + street), "Flat 4, Minerva House, 12 Ceres
  // Crescent" for a flat — the PAON's own comma (building name, street
  // number) is kept, and the street follows the PAON's number.
  let label = paon;
  if (parts.saon) label = `${displayText(parts.saon)}, ${paon}`;
  if (street) {
    const separator = parts.saon || /[0-9]$/.test(paon) ? " " : ", ";
    label = label === "" ? street : `${label}${separator}${street}`;
  }
  return { ...parts, label };
}

// The display label for any filed address parts — the same
// one-line form a resolution carries ("19 Birkdale Rise",
// "Flat 4, Minerva House, 12 Ceres Crescent"). Later checks use
// it to name the home a filed record belongs to.
export function labelForAddressParts(parts: LoadedAddressParts): string {
  return toResolved(parts).label;
}

function addressKey(parts: LoadedAddressParts): string {
  return [parts.paon ?? "", parts.saon ?? "", parts.street ?? ""].join("|");
}

function sortAddresses(addresses: ResolvedAddress[]): ResolvedAddress[] {
  const key = (a: ResolvedAddress): [string, string, number, number, string] => {
    const paon = parsePaon(a.paon);
    return [
      a.street ?? "",
      paon.name ?? "",
      numericPart(paon.number),
      numericPart(flatKeyOf(a.saon)),
      a.label,
    ];
  };
  return [...addresses].sort((x, y) => {
    const kx = key(x);
    const ky = key(y);
    for (let i = 0; i < kx.length; i += 1) {
      if (kx[i] < ky[i]) return -1;
      if (kx[i] > ky[i]) return 1;
    }
    return 0;
  });
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

  const seen = new Set<string>();
  const rows = (await source.addressesInPostcode(input.postcode)).filter((parts) => {
    const key = addressKey(parts);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

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
