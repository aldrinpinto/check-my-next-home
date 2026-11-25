// The local suggestion read model (entry-point build,
// 18 Nov 2026; decisions D71 + D72).
//
// What the search box may suggest, from LOCAL DATA
// ONLY — the postcode directory (postcode_cache, the
// full ONSPD as filed) and the picker's union of homes
// (the filed sale addresses plus the national picking
// index, M7.15B). A keystroke never reaches Postio
// (D72 item 4: Postio's free search is abuse-monitored and
// the key can be suspended; and nothing paid sits behind a
// keystroke). The endpoint this feeds is therefore a
// deliberate, named exception to the per-submit robot
// check: local data only, rate-limited (app/api/suggest),
// and the data it can expose is the postcode list, which
// is open data (ONSPD, OGL) anyway.
//
// The shapes (D71): from ~3 characters, a partial postcode
// suggests FULL postcodes; a full postcode suggests that
// postcode's HOMES inline, filtered by any address words
// typed with it. Each item carries the href a pick
// navigates to, so the client holds no routing logic of
// its own.
//
// D71 AMENDMENT (founder ruling, 18 Nov 2026): a full
// postcode's Homes group carries that postcode's COMPLETE
// home list — the original cap of 8 hid homes past the cut
// (the founder's own 19 Birkdale Rise sat out of view at
// CM3 2JT, on a street the site holds in full). The
// full-postcode list is bounded only by a defensive
// ceiling far above any real postcode's home count, and
// hitting it logs rather than truncating silently.
//
// M7.15C (founder rulings, 18 Nov 2026): the fragment
// shapes gain the ruled three groups — Postcodes,
// Streets, Properties — and two scope rulings land with
// them.
//   * STREETS: D71's "bare street names suggest nothing"
//     is superseded. Street suggestions now come from
//     held data — the picking index's derived street
//     table (lib/server/streets.ts) — in two tiers:
//     exact word-prefix matches, then pg_trgm fuzzy
//     matches offered AS CHOICES ONLY when the exact
//     tier found nothing or nearly nothing. A street
//     pick leads to that street's homes (one postcode:
//     straight to its check, narrowed; several: the
//     short postcode choice) — never to a home, and a
//     submit never applies a fuzzy match silently.
//   * THE E161G FIX: the fragment cap of 8 is gone. The
//     deploy round found it cutting E16 1GN out of the
//     fragment E161G's twenty live matches against the
//     complete directory — a typed fragment making a
//     real postcode unreachable. Fragment postcode
//     results now ride the D71 pattern: the complete
//     matching set, scrollable, bounded only by the
//     same defensive ceiling as the full-postcode list.
//     The grouped Postcodes cap of 5 the same ruling set
//     governs how many rows RENDER before scrolling (the
//     panel's CSS, app/globals.css) — never how many
//     matches exist; the full set stays reachable by
//     scrolling, exactly as the home list behaves.
//   * PROPERTIES: the picking index's homes matched by
//     the fragment's postcode prefix and/or the served
//     streets, filtered by the typed address words —
//     each shown as its full address line, a pick going
//     straight to that home's check. Capped at 5, as
//     Streets are; Postcodes alone serve unbounded
//     (to the ceiling), because a postcode is the one
//     thing a fragment must never lose.
//
// M7.15D (founder ruling, 18 Nov 2026): the fragment
// shapes gain the fourth group — PLACES. A town or
// place name offers the place (lib/server/places.ts:
// the picking index's town-as-filed, two tiers like
// the streets — exact word-prefix, then pg_trgm fuzzy
// AS CHOICES ONLY at the same pinned threshold,
// witnessed on the plan's pair: CHLEMSFORD ~
// CHELMSFORD 0.4667 against CHELTENHAM 0.2222). As
// built on 18 Nov the chooser lived inside the
// picker: a place item carried no route, its pick
// filed the name into the field, and the place's
// districts expanded beneath it under "Districts in
// <Place>". FOUNDER RULING, 19 Nov 2026, reversing
// that: places behave like streets — a place item
// carries a route and its pick NAVIGATES to the
// place page (lib/journey.ts's placeChoiceRoute),
// which lists ALL the place's districts with no cap;
// a place serving one district routes straight to
// that district's wider-area page. No districts
// group rides the panel any more, picked or not. A
// place pick never lands on a home. The honesty rule
// is the district bundle's own: only districts the
// district page serves in its own form are offered,
// and a place with none is not offered (Scotland / NI
// keep the not-covered form; Phase 3 owns them).
//
// BUG-009 (founder ruling, 20 Nov 2026): a Districts
// group returns — in a narrower form than the one
// M7.15D removed. That group listed a picked PLACE's
// districts inside the panel; this one serves a
// single line when the typed input IS exactly a
// postcode district the directory knows: "<DISTRICT>
// — the wider area", linking to the district's
// wider-area route (the same route a one-district
// place's pick takes). A bare district otherwise
// offered only its postcodes and its homes, and the
// wider-area page — the page built for exactly that
// intent — was unreachable from the panel.
//
// BUG-010 (founder ruling, 20 Nov 2026): a
// full-postcode-shaped input that resolves to
// nothing (the founder's witness: "CM3 2JTTX") no
// longer falls through to the fragment shapes for
// its outward, which read as though the visitor were
// still browsing the district. It serves a settled
// EMPTY response instead — the box shows its
// no-suggestions line, and pressing search lands on
// the couldn't-place notice. The shape is judged
// from the classifier's own outputs
// (failedFullPostcodeOf below); no new postcode
// grammar is written here.
//
// Server-time budget: under 100ms (D72 item 4). Both reads
// are prefix/index reads over filed tables — the postcode
// prefix query rides the postcode column's index, and the
// homes read is the resolver's own per-postcode query.

import type { Pool, PoolClient } from "pg";

import {
  canonicalHomeKey,
  classifyAddressInput,
  compareAddressParts,
  displayText,
  labelForAddressParts,
  type ClassifiedInput,
  type LoadedAddressParts,
} from "../address";
import { homeKeyOf } from "../bundle-cache";
import {
  homeRoute,
  placeChoiceRoute,
  postcodeRoute,
  streetChoiceRoute,
  widerAreaRoute,
} from "../journey";
import { entryNow, logEntry } from "./entry-log";
import { createPickingIndexSource } from "./picking-index";
import { createPlaceSource, placeNormOf, type PlaceSuggestion } from "./places";
import { createStreetSource, type StreetQueryable, type StreetSuggestion } from "./streets";

export type { StreetSuggestion } from "./streets";
export type { PlaceSuggestion } from "./places";

// Suggestions start at 3 typed characters (D71).
export const SUGGEST_MIN_CHARS = 3;
// The defensive ceiling on a full postcode's Homes group
// (D71 amendment): a postcode's homes number in the
// hundreds at most, so 1,000 sits far above any real
// list. It exists only to bound a pathological response;
// reaching it logs (suggestions.ceiling) and truncates
// at the ceiling — never silently, and never below it.
export const SUGGEST_FULL_POSTCODE_CEILING = 1_000;
// The same defensive ceiling for a fragment's Postcodes
// group (M7.15C, the E161G fix): the complete matching
// set serves, scrollable — a fragment's real matches
// number in the dozens, so 1,000 is again far above any
// honest list, and reaching it logs the same way.
export const SUGGEST_FRAGMENT_CEILING = 1_000;
// The grouped caps (founder ruling, 18 Nov 2026): the
// Streets and Properties groups serve at most five
// each. (The Postcodes group's "cap of 5" is a RENDER
// window only — see the header; the served set is the
// complete match.)
export const SUGGEST_STREET_CAP = 5;
export const SUGGEST_PROPERTY_CAP = 5;
// The fuzzy street tier (M7.15C): it runs only when the
// exact tier found at most this many streets — a
// misspelling's exact tier is empty, a part-typed real
// street's is not — and it may add at most this many
// rows, below the exact ones, inside the group cap.
// (The prep's shape: fuzzy ≤ 4 of the group's rows.)
export const SUGGEST_STREET_FUZZY_TRIGGER = 1;
export const SUGGEST_STREET_FUZZY_CAP = 4;
// The Places group (M7.15D): capped at 5 like Streets
// and Properties. Its fuzzy tier mirrors the streets'
// exactly — it runs only when the exact tier found at
// most one place, and may add at most four rows below
// the exact ones, inside the group cap.
export const SUGGEST_PLACE_CAP = 5;
export const SUGGEST_PLACE_FUZZY_TRIGGER = 1;
export const SUGGEST_PLACE_FUZZY_CAP = 4;
// The properties read's fetch bound per source table:
// the read model fetches candidates within the typed
// bound (a postcode prefix and/or the served streets'
// postcodes) and this module owns the word filter, the
// dedupe, the order and the cap — one implementation,
// as the full-postcode branch owns its filter. A
// fragment's honest candidate set is far below this.
const PROPERTIES_FETCH_LIMIT = 2_000;

export interface SuggestionItem {
  label: string;
  // The route a pick navigates to. Every item kind
  // carries a real href since the founder's ruling of
  // 19 Nov 2026 made the place pick navigate like the
  // others; the type keeps its nullable form because
  // the client's panel treats an href-less item as a
  // non-pick rather than assuming one exists. A place
  // item additionally carries the filed place name in
  // `place`, so the client's submit path can recognise
  // a field holding exactly a place name.
  href: string | null;
  place?: string;
}

export interface SuggestionGroups {
  groups: {
    label: "Postcodes" | "Streets" | "Properties" | "Homes" | "Places" | "Districts";
    items: SuggestionItem[];
  }[];
  // Set only when the full-postcode branch served one
  // postcode's own list — its Homes group, or the
  // postcode itself in the zero-home self-serve form
  // (BUG-032). It is the search box's warrant for the
  // "Don't see your home?" row (BUG-185): the row belongs
  // only where one postcode's homes are listed, never on
  // a street or area search, whose groups span postcodes.
  postcodeList?: { postcode: string };
}

// A properties query: the homes inside a bound — a
// postcode prefix (the fragment's winning parse), the
// served streets' (street, postcode) pairs, or both.
// Implementations return candidate rows within the
// bound, FILED rows first (the union's precedence), up
// to the fetch limit; suggestionsFor applies the typed
// words, the dedupe, the ruling's order and the cap.
export interface PropertyQuery {
  postcodePrefix: string | null;
  streetPostcodes: { streetNorm: string; postcode: string }[];
}

// The read model's query shapes over the filed tables:
// the directory prefix read, the union's per-postcode
// homes, the street tiers (lib/server/streets.ts) and
// the properties candidates.
export interface SuggestionSource {
  postcodesByPrefix(prefix: string, limit: number): Promise<string[]>;
  addressesInPostcode(postcode: string): Promise<LoadedAddressParts[]>;
  streetsByPrefix(words: string[], limit: number): Promise<StreetSuggestion[]>;
  streetsByFuzzy(words: string[], limit: number): Promise<StreetSuggestion[]>;
  propertiesMatching(query: PropertyQuery, limit: number): Promise<LoadedAddressParts[]>;
  placesByPrefix(words: string[], limit: number): Promise<PlaceSuggestion[]>;
  placesByFuzzy(words: string[], limit: number): Promise<PlaceSuggestion[]>;
  placeDistricts(placeNorm: string): Promise<string[]>;
}

// The street normalisation expression, restated in SQL
// (the home key's recipe — see lib/server/streets.ts):
// the properties read matches a home to a served street
// by it, so a street's homes are its index rows on that
// street in that postcode, exactly as filed.
const STREET_NORM_SQL =
  "btrim(regexp_replace(regexp_replace(upper(street), '[^A-Z0-9]+', ' ', 'g'), ' +', ' ', 'g'))";

export function createSuggestionSource(db: StreetQueryable): SuggestionSource {
  // Homes come from the picker's union (M7.15B): the
  // filed price_paid rows plus the national picking
  // index, the filed rows winning collisions — so the
  // dropdown names a postcode's homes from day one, not
  // only after a check has filed them. The postcode
  // prefix read below is unchanged.
  const union = createPickingIndexSource(db);
  const streets = createStreetSource(db);
  const places = createPlaceSource(db);
  return {
    async postcodesByPrefix(prefix, limit) {
      // The prefix arrives in the directory's own spaced
      // form ("CM3 2"), so a plain LIKE prefix rides the
      // postcode index.
      const { rows } = await db.query(
        "SELECT postcode FROM postcode_cache WHERE postcode LIKE $1 ORDER BY postcode LIMIT $2",
        [`${prefix}%`, limit],
      );
      return rows.map((row) => row.postcode as string);
    },
    addressesInPostcode: (postcode) => union.unionAddressesInPostcode(postcode),
    streetsByPrefix: (words, limit) => streets.streetsByPrefix(words, limit),
    streetsByFuzzy: (words, limit) => streets.streetsByFuzzy(words, limit),
    placesByPrefix: (words, limit) => places.placesByPrefix(words, limit),
    placesByFuzzy: (words, limit) => places.placesByFuzzy(words, limit),
    placeDistricts: (placeNorm) => places.placeDistricts(placeNorm),
    async propertiesMatching(query, limit) {
      const conditions: string[] = [];
      const params: unknown[] = [];
      if (query.postcodePrefix !== null) {
        params.push(`${query.postcodePrefix}%`);
        conditions.push(`postcode LIKE $${params.length}`);
      }
      if (query.streetPostcodes.length > 0) {
        const pairs = query.streetPostcodes.map((pair) => {
          params.push(pair.postcode, pair.streetNorm);
          return `(postcode = $${params.length - 1} AND ${STREET_NORM_SQL} = $${params.length})`;
        });
        conditions.push(`(${pairs.join(" OR ")})`);
      }
      if (conditions.length === 0) return [];
      const where = conditions.join(" OR ");
      params.push(limit);
      const limitParam = `$${params.length}`;
      // Filed rows first (their parts win the dedupe in
      // suggestionsFor), then the picking index's — the
      // union's precedence, kept by concatenation; the
      // caller sorts. Each side is bounded by the fetch
      // limit on its own postcode-prefixed read.
      const filed = await db.query(
        `SELECT DISTINCT paon, saon, street, locality, town, postcode
           FROM price_paid WHERE ${where}
          ORDER BY postcode, street, paon, saon LIMIT ${limitParam}`,
        params,
      );
      const indexed = await db.query(
        `SELECT paon, saon, street, NULL AS locality, town, postcode
           FROM picking_index WHERE ${where}
          ORDER BY postcode, street, paon, saon LIMIT ${limitParam}`,
        params,
      );
      return [...filed.rows, ...indexed.rows] as unknown as LoadedAddressParts[];
    },
  };
}

// The bounded suggest source (BUG-194, 23 Nov 2026):
// the suggest route serves through this, never
// through the bare pool. The audit's compounding
// defect, beside the missing register index
// (migration 0045): a fragment keystroke's reads ran
// with NO statement timeout and NO cancellation, so
// every superseded keystroke left its scan running
// against the app's shared pool — the oldest orphan
// was observed at 13 minutes — congesting the box
// for every later keystroke and every other reader.
//
// The bounds, both real mechanisms of this stack:
//   * One dedicated client per request, with
//     statement_timeout set on its session: every
//     statement the read model issues for the
//     request — the tiers' own transaction included,
//     see the connect() note below — is bounded by
//     SUGGEST_STATEMENT_TIMEOUT_MS, and a statement
//     that overruns fails the request (the route's
//     settled 500) instead of holding the disk and a
//     pool connection. Three seconds is generous
//     against D72 item 4's under-100ms budget for
//     the indexed reads; it exists to kill pathological
//     scans, not to gate honest ones.
//   * Cancellation on client disconnect: the route
//     hands in the request's AbortSignal; when it
//     fires, the request's backend is cancelled with
//     pg_cancel_backend, so the database work dies
//     with the request that asked for it. The
//     client's own per-keystroke abort (lib/
//     suggest-client.ts) is what ordinarily triggers
//     the disconnect. Cancellation is best-effort —
//     a cancel that lands after the work finished is
//     a no-op — and the statement timeout above is
//     the hard bound that stands even if a signal
//     never fires.
//
// The connect() seam: the fuzzy tiers (streets,
// places) take a dedicated client from the source
// for their BEGIN / set_limit / read / COMMIT, and
// release it when done. Here that client is a
// stand-in over the request's one bounded session —
// its queries delegate, so the timeout covers the
// tiers' transaction too, and its release() is a
// deliberate no-op: the session is owned by this
// source and released exactly once, by close(). The
// read model issues its reads sequentially, so one
// session is never driven concurrently.
export const SUGGEST_STATEMENT_TIMEOUT_MS = 3_000;

export interface BoundedSuggestionSource {
  source: SuggestionSource;
  close: () => Promise<void>;
}

export async function createBoundedSuggestionSource(
  pool: Pool,
  signal?: AbortSignal,
): Promise<BoundedSuggestionSource> {
  const client = await pool.connect();
  let backendPid: number | null = null;
  let closed = false;
  const onAbort = () => {
    if (backendPid === null || closed) return;
    // Fire and forget: the cancel rides its own pool
    // connection, and a failure to land it leaves the
    // statement timeout as the bound.
    void pool.query("SELECT pg_cancel_backend($1)", [backendPid]).catch(() => undefined);
  };
  try {
    const { rows } = await client.query("SELECT pg_backend_pid() AS pid");
    backendPid = (rows[0]?.pid as number | undefined) ?? null;
    await client.query(`SET statement_timeout = ${SUGGEST_STATEMENT_TIMEOUT_MS}`);
  } catch (error) {
    client.release();
    throw error;
  }
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  const boundedDb = {
    query: (text: string, params?: readonly unknown[]) => client.query(text, params as unknown[]),
    connect: () =>
      Promise.resolve({
        query: (text: string, params?: readonly unknown[]) =>
          client.query(text, params as unknown[]),
        release: () => undefined,
      } as unknown as PoolClient),
  } as unknown as StreetQueryable;
  return {
    source: createSuggestionSource(boundedDb),
    close: async () => {
      closed = true;
      signal?.removeEventListener("abort", onAbort);
      try {
        await client.query("RESET statement_timeout");
      } catch {
        // The session is released regardless; a reset
        // that fails (a dead connection) must not turn
        // the release into a leak.
      }
      client.release();
    },
  };
}

// The inward code's shape, whole or cut off mid-typing:
// a digit, then up to two letters — "", "1", "1G" and
// "1GN" are all a visitor may have typed so far. A rest
// that breaks this ("61", say) cannot be an inward start,
// which is what prunes the impossible parses below.
function inwardPartialOk(rest: string): boolean {
  return rest === "" || /^[0-9][A-Z]{0,2}$/.test(rest);
}

// The spaced prefixes a partial input may name, best
// first. UK outward codes are 1–2 letters + 1–2 digits
// (E16, SE15, EH12, B24, LS12) or 1–2 letters + a digit
// + a letter (SW1A, EC1V, W1A) — the parse must allow
// BOTH digit shapes. (The founder-found bug, 18 Nov
// 2026: the old parse allowed ONE digit only — letters +
// a digit + an optional letter — so a two-digit district
// was split after its first digit: "E161" produced the
// prefix "E1 61", which matches nothing filed, and
// partial-postcode suggestions silently returned nothing
// for every two-digit district in the country.)
//
// One string can still parse two ways: "CM32" is the
// district CM32 with nothing after it, or CM3 with the
// inward's "2" — and "SE15" is the same shape the other
// way (SE1 with a "5", or the district SE15, which is a
// real district). No string-only rule separates those;
// an explicit space in what was typed does ("CM3 2" is
// unambiguous), so that parse leads when present, then
// the longest district, then the shorter one.
// suggestionsFor serves the first candidate the filed
// directory actually answers — the directory is the
// disambiguator of last resort.
export function spacedPrefixCandidatesOf(raw: string): string[] {
  const candidates: string[] = [];
  const add = (district: string, rest: string) => {
    if (!inwardPartialOk(rest)) return;
    const prefix = rest === "" ? district : `${district} ${rest}`;
    if (!candidates.includes(prefix)) candidates.push(prefix);
  };

  // An explicit space pins the outward / inward boundary
  // exactly where the visitor put it.
  const spaced = /^([A-Z]{1,2}[0-9][A-Z0-9]?)\s+([0-9][A-Z]{0,2})$/.exec(
    raw.toUpperCase().trim().replace(/\s+/g, " "),
  );
  if (spaced) add(spaced[1], spaced[2]);

  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  // Longest district first: two digits (E16), then digit
  // + letter (SW1A), then one digit (CM3) — the one-digit
  // form doubles as the shorter-district fallback for a
  // two-digit string ("CM32" also yields "CM3 2").
  const twoDigit = /^([A-Z]{1,2}[0-9]{2})(.*)$/.exec(compact);
  if (twoDigit) add(twoDigit[1], twoDigit[2]);
  const digitLetter = /^([A-Z]{1,2}[0-9][A-Z])(.*)$/.exec(compact);
  if (digitLetter) add(digitLetter[1], digitLetter[2]);
  const oneDigit = /^([A-Z]{1,2}[0-9])(.*)$/.exec(compact);
  if (oneDigit) add(oneDigit[1], oneDigit[2]);
  return candidates;
}

// The spaced prefix a partial input names — the best
// parse from spacedPrefixCandidatesOf: "cm3" -> "CM3",
// "CM3 2" -> "CM3 2", "e161" -> "E16 1", "se15" ->
// "SE15". Returns null when the input carries no
// postcode-shaped fragment at all. suggestionsFor also
// walks the remaining candidates when the filed
// directory answers nothing for the best one (a bare
// "cm32"'s best parse is the district CM32; the prefix
// that serves is its fallback, "CM3 2").
export function spacedPrefixOf(raw: string): string | null {
  return spacedPrefixCandidatesOf(raw)[0] ?? null;
}

// The failed full postcode (BUG-010, founder ruling
// 20 Nov 2026): an input that occupies a full
// postcode's shape — an outward plus an inward
// ATTEMPT — yet is not one. The classifier found no
// full postcode in it (a complete, well-formed inward
// would have classified), and the attempt is not the
// beginning of one either: inwardPartialOk admits the
// honest partials ("CM3 2", "CM3 2J"), which keep
// their fragment suggestions untouched. What remains
// — an attempt at least a full inward's length,
// opening with the inward's digit, that is neither —
// is a postcode the visitor believes they typed
// whole: "CM3 2JTTX", "CM32JTTX", "E16 1GNX".
//
// The judgement reads only the classifier's outputs:
// the outward it found, and the input's normalised
// text, which must consist of the outward alone (the
// compact form) or the outward plus the one attempt
// token (the spaced form). Anything carrying address
// words — "CM3 Birkdale", "Birkdale Rise CM3",
// "CM3 2 Birkdale" — is a mixed input, never this,
// and keeps the fragment shapes exactly as before.
function failedFullPostcodeOf(input: ClassifiedInput): boolean {
  if (input.postcode !== null || input.outward === null) return false;
  const tokens = input.text.split(" ").filter(Boolean);
  let attempt: string | null = null;
  if (tokens.length === 2 && tokens[0] === input.outward) attempt = tokens[1];
  else if (tokens.length === 1 && tokens[0].startsWith(input.outward))
    attempt = tokens[0].slice(input.outward.length);
  if (attempt === null || attempt.length < 3) return false;
  const first = attempt.charAt(0);
  return first >= "0" && first <= "9" && !inwardPartialOk(attempt);
}

// The home key for filed parts alone. homeKeyOf's rung-1
// branch reads only the address parts (the directory is
// never touched on that branch), so the parts carry the
// key on their own — the same key the route will re-derive.
function keyForParts(parts: LoadedAddressParts): string {
  return homeKeyOf({
    rung: 1,
    kind: "home",
    address: { ...parts, label: labelForAddressParts(parts) },
    directory: null as never,
  });
}

function norm(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// The typed words a fragment leaves behind once its
// postcode-shaped tokens are accounted for (M7.15C):
// "Birkdale Rise CM3" leaves BIRKDALE RISE; "E161G"
// leaves nothing; "CM3 2" leaves nothing. A token is
// postcode-shaped when it IS the outward, when it
// carries the outward plus a plausible inward start
// ("E161G"), or when it is a spaced inward start right
// after such a token ("CM3 2"). What remains is what
// the visitor meant as address words — the streets'
// and properties' matching material.
function fragmentWordsOf(input: { outward: string | null; text: string }): string[] {
  const tokens = input.text.split(" ").filter(Boolean);
  if (!input.outward) return tokens;
  const words: string[] = [];
  let previousWasFragment = false;
  for (const token of tokens) {
    const isOutward = token === input.outward;
    const isCompactFragment =
      token.startsWith(input.outward) &&
      token.length > input.outward.length &&
      inwardPartialOk(token.slice(input.outward.length));
    const isSpacedInward = previousWasFragment && /^[0-9][A-Z]{0,2}$/.test(token);
    if (isOutward || isCompactFragment || isSpacedInward) {
      previousWasFragment = true;
      continue;
    }
    previousWasFragment = false;
    words.push(token);
  }
  return words;
}

// A street unit's identity for the fuzzy dedupe: the
// same street in the same town is the same suggestion
// whichever tier named it.
function streetUnitKey(unit: StreetSuggestion): string {
  return `${norm(unit.street)}|${norm(unit.town ?? "")}`;
}

// One street suggestion's item. The label is the street
// in display casing with its town; a street whose homes
// file no town falls back to its postcode where it has
// exactly one (the prep's rule) — with several postcodes
// and no town, the street name alone leads to the
// choice, whose rows carry the postcodes. The href is
// the pick's whole meaning: one postcode goes straight
// to that postcode's check (the ladder narrows its list
// to the street from the route's own parameter);
// several go to the short postcode choice. Never a home.
function streetItemOf(unit: StreetSuggestion): SuggestionItem {
  const street = displayText(unit.street);
  const town = unit.town ? displayText(unit.town) : null;
  const label = town
    ? `${street}, ${town}`
    : unit.postcodes.length === 1
      ? `${street}, ${unit.postcodes[0]}`
      : street;
  if (unit.postcodes.length === 1) {
    return { label, href: postcodeRoute(unit.postcodes[0], { street: unit.street }) };
  }
  return { label, href: streetChoiceRoute(street, town) };
}

// One property suggestion's label: the home's full
// address line — its picker label, its town where one
// is filed, and its postcode.
function propertyLabelOf(parts: LoadedAddressParts): string {
  const town = parts.town ? `, ${displayText(parts.town)}` : "";
  return `${labelForAddressParts(parts)}${town}, ${parts.postcode}`;
}

// One place suggestion's item (M7.15D; the pick's
// behaviour ruled again 19 Nov 2026): the place in
// display casing, carrying a route like every other
// pick — the pick NAVIGATES to the place page, where
// the place's districts are listed in full (the
// street pick's pattern: one destination straight
// there, several to the choice page). A place serving
// exactly one district goes straight to that
// district's wider-area search, as a street in one
// postcode goes straight to its check. The item still
// carries the filed display name in `place` so the
// box's submit path can recognise a field holding
// exactly a place name and take the same route. A
// place pick never lands on a home.
function placeItemOf(unit: PlaceSuggestion): SuggestionItem {
  const place = displayText(unit.place);
  if (unit.districts.length === 1) {
    return { label: place, href: widerAreaRoute(unit.districts[0]), place };
  }
  return { label: place, href: placeChoiceRoute(place), place };
}

// BUG-323: the Places group's one-row-per-place rule.
// The same place can be filed twice — the bare town and
// the town-with-county ("Chelmsford" and "Chelmsford,
// Essex") — and the panel must name it once: the rows
// merge by base name (the display before its first ", ",
// normalised), the district sets union, and the bare
// name is kept — the shorter display, since the comma
// form is always the bare name plus ", County". UK place
// names contain no commas: the comma is always the
// town,county join, never part of the name.
function mergePlaceUnits(units: PlaceSuggestion[]): PlaceSuggestion[] {
  const byBase = new Map<string, PlaceSuggestion>();
  for (const unit of units) {
    const base = placeNormOf(unit.place.split(",")[0].trim());
    const existing = byBase.get(base);
    if (!existing) {
      byBase.set(base, { place: unit.place, districts: [...unit.districts] });
      continue;
    }
    const districts = [...new Set([...existing.districts, ...unit.districts])].sort();
    const place = unit.place.length < existing.place.length ? unit.place : existing.place;
    byBase.set(base, { place, districts });
  }
  return [...byBase.values()];
}

// BUG-323, Londonthorpe leg — CLOSED with no code
// change, by founder ruling 25 Nov 20:15: leave
// Londonthorpe (and Chesterfield). They are valid
// places and showing them is the right behaviour —
// someone typing "London" may be after Londonthorpe,
// and someone typing "Chester" may be after
// Chesterfield. No hiding rule; the blanket rule stays
// out. The pinned test below ("sibling places ride
// beside the named one") stands as the behaviour.

// The suggestions for one typed input. Pure over the
// source, so the scenarios test it against fixture rows.
export async function suggestionsFor(
  raw: string,
  source: SuggestionSource,
  req: string,
): Promise<SuggestionGroups> {
  const started = entryNow();
  const input = classifyAddressInput(raw);
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const groups: SuggestionGroups["groups"] = [];

  if (compact.length < SUGGEST_MIN_CHARS) {
    logEntry(req, "suggestions.served", {
      layer: "local",
      reason: "too-short",
      ms: entryNow() - started,
      postcodes: 0,
      streets: 0,
      homes: 0,
    });
    return { groups };
  }

  if (input.postcode) {
    // A full postcode: its filed homes, filtered by the
    // address words typed with it (every typed word must
    // appear in the home's filed parts). The homes are
    // served in natural address order — the picker's own
    // order (compareAddressParts, founder fix 18 Nov
    // 2026) — applied here so the dropdown holds it for
    // any source, not only the union's.
    //
    // The list is COMPLETE (D71 amendment, founder ruling
    // 18 Nov 2026): no cap — the dropdown renders it in a
    // scrollable region. The filtered list is uncapped
    // too: words typed with the postcode narrow within
    // the full list, never within a capped slice of it.
    //
    // BUG-203 (24 Nov 2026): the homes read is the
    // slowest read this branch issues, and under load
    // it is the one that trips the statement timeout —
    // which used to fail the whole response. A failed
    // homes read now degrades to the postcode itself
    // (the self-serve check below, a cheap indexed
    // read): the visitor still gets the postcode to
    // pick, and the failure is logged, never silent.
    // Only when the postcode itself cannot be served
    // either does the branch fail outright (the
    // route's logged 500) — an empty answer must
    // never be a failure wearing an empty answer's
    // clothes.
    let homesFailed = false;
    let rows: LoadedAddressParts[];
    try {
      rows = [...(await source.addressesInPostcode(input.postcode))].sort(compareAddressParts);
    } catch (error) {
      homesFailed = true;
      logEntry(req, "suggestions.group-failed", {
        layer: "local",
        reason: "group-failed",
        group: "homes",
        error: error instanceof Error ? error.message : String(error),
      });
      rows = [];
    }
    const words = input.text.split(" ").filter(Boolean);
    const items: SuggestionItem[] = [];
    const seen = new Set<string>();
    for (const parts of rows) {
      const label = labelForAddressParts(parts);
      const haystack = norm(
        [parts.paon ?? "", parts.saon ?? "", parts.street ?? "", label].join(" "),
      );
      if (!words.every((word) => ` ${haystack} `.includes(` ${word} `))) continue;
      // BUG-308: the panel dedupes on the canonical home
      // — two filings of one home in different shapes
      // serve once. The href still carries the strict
      // home key, the identity the route re-derives.
      const canonical = canonicalHomeKey(parts);
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      const key = keyForParts(parts);
      items.push({ label: `${label}, ${input.postcode}`, href: homeRoute(input.postcode, key) });
    }
    if (items.length > SUGGEST_FULL_POSTCODE_CEILING) {
      // The defensive ceiling (see the constant): log the
      // truncation with the true count, then serve the
      // first ceiling-many in natural order.
      logEntry(req, "suggestions.ceiling", {
        layer: "local",
        reason: "full-postcode-ceiling",
        homes: items.length,
        ceiling: SUGGEST_FULL_POSTCODE_CEILING,
      });
      items.length = SUGGEST_FULL_POSTCODE_CEILING;
    }
    if (items.length > 0) groups.push({ label: "Homes", items });
    // BUG-032 (fix batch, 19 Nov 2026): a full postcode
    // with NO homes in the picking union served an empty
    // response — the branch above was the only thing it
    // could offer, so a real, checkable postcode (E16 1AF:
    // in the postcode directory, zero picking-index rows)
    // offered nothing, not even itself, and the panel
    // never opened. The branch now always serves at least
    // the postcode itself — its whole-postcode route, the
    // fragment branch's own Postcodes form — when the
    // directory files the postcode; the homes list rides
    // above as before when homes exist. A postcode the
    // directory does not file still serves nothing here:
    // the panel never offers a postcode the site cannot
    // place.
    let selfServed = 0;
    if (items.length === 0) {
      const filed = await source.postcodesByPrefix(input.postcode, 1);
      if (filed.includes(input.postcode)) {
        selfServed = 1;
        groups.push({
          label: "Postcodes",
          items: [{ label: input.postcode, href: homeRoute(input.postcode) }],
        });
      }
    }
    logEntry(req, "suggestions.served", {
      layer: "local",
      reason: groups.length > 0 ? "ok" : "empty",
      ms: entryNow() - started,
      shape: "full-postcode",
      postcodes: selfServed,
      streets: 0,
      homes: items.length,
      places: 0,
      districts: 0,
    });
    // BUG-185: this branch listed ONE postcode's homes
    // (or the postcode itself, when it files none) — the
    // one panel shape the wider-list row belongs to. A
    // full-postcode-shaped input the directory does not
    // file served nothing above, and carries no marker:
    // there is no settled postcode to widen.
    if (items.length > 0 || selfServed === 1) {
      return { groups, postcodeList: { postcode: input.postcode } };
    }
    // BUG-203: the homes read failed AND the postcode
    // itself could not be served — the empty answer
    // below would be a failure wearing an empty
    // answer's clothes. Fail outright (the route's
    // logged 500, the client's retry, then its honest
    // failure line) instead of serving nothing.
    if (homesFailed) throw new Error("suggest-homes-failed");
    return { groups };
  }

  if (failedFullPostcodeOf(input)) {
    // BUG-010 (founder ruling, 20 Nov 2026): the
    // failed full postcode serves a settled EMPTY
    // response — the panel shows its no-suggestions
    // line and a submit lands on the couldn't-place
    // notice — rather than melting into the fragment
    // shapes for its outward, which read as though
    // the visitor were still browsing the district.
    logEntry(req, "suggestions.served", {
      layer: "local",
      reason: "empty",
      ms: entryNow() - started,
      shape: "failed-postcode",
      postcodes: 0,
      streets: 0,
      homes: 0,
      places: 0,
      districts: 0,
    });
    return { groups };
  }

  // ---- The fragment shapes (M7.15C, M7.15D): the
  // groups. Group order — Postcodes, Streets,
  // Properties, Places, then Districts — and each
  // group serves under its own rule (see the header):
  // Postcodes complete to the ceiling, Streets,
  // Properties and Places capped at five, Districts
  // the single wider-area line for an input that is
  // exactly a district (BUG-009, founder ruling
  // 20 Nov 2026 — not the M7.15D place-districts
  // group, which stays removed).
  //
  // BUG-203 (24 Nov 2026): the groups read
  // sequentially under one statement timeout, and a
  // timeout anywhere used to fail the whole response
  // — the panel's vanish. Each group read now fails
  // alone: a failed group is logged and skipped, and
  // the groups that did serve still reach the
  // visitor. Only an answer that would be EMPTY
  // because a group failed — never a genuine empty
  // answer — fails outright (the throw before the
  // served log): an empty answer must never be a
  // failure wearing an empty answer's clothes.
  let groupFailed = false;
  const shape = input.outward ? "partial-postcode" : "text";

  // Postcodes: the first candidate the filed directory
  // answers wins. The candidate order (an explicit
  // space's parse, then the longest district) is a
  // preference, not a verdict: a candidate that names
  // nothing filed — "CM32", a district that does not
  // exist — falls through to the next ("CM3 2").
  let servedPrefix: string | null = null;
  let postcodeCount = 0;
  // The raw-string parse names the candidates when the
  // input LEADS with its fragment ("E161G", "CM3 2"). A
  // mixed input — address words with the fragment among
  // them ("Birkdale Rise CM3") — parses to none, and the
  // classifier's outward stands as the one candidate:
  // the district the visitor demonstrably typed.
  const parsed = spacedPrefixCandidatesOf(raw);
  const candidates = parsed.length > 0 ? parsed : input.outward ? [input.outward] : [];
  if (candidates.length > 0 && input.outward) {
    for (const prefix of candidates) {
      let postcodes: string[];
      try {
        postcodes = await source.postcodesByPrefix(prefix, SUGGEST_FRAGMENT_CEILING + 1);
      } catch (error) {
        // BUG-203: the directory read failed — log it
        // and stop the walk (the next candidate reads
        // the same table under the same load); the
        // streets, properties and places groups below
        // still run on their own reads.
        groupFailed = true;
        logEntry(req, "suggestions.group-failed", {
          layer: "local",
          reason: "group-failed",
          group: "postcodes",
          error: error instanceof Error ? error.message : String(error),
        });
        break;
      }
      if (postcodes.length === 0) continue;
      servedPrefix = prefix;
      if (postcodes.length > SUGGEST_FRAGMENT_CEILING) {
        // The defensive ceiling, exactly as the
        // full-postcode list treats it: log the true
        // count, serve the first ceiling-many.
        logEntry(req, "suggestions.ceiling", {
          layer: "local",
          reason: "fragment-ceiling",
          postcodes: postcodes.length,
          ceiling: SUGGEST_FRAGMENT_CEILING,
        });
        postcodes.length = SUGGEST_FRAGMENT_CEILING;
      }
      postcodeCount = postcodes.length;
      groups.push({
        label: "Postcodes",
        items: postcodes.map((postcode) => ({
          label: postcode,
          // The whole-postcode check directly (founder
          // ruling, 18 Nov 2026: the picker route the
          // postcode link used to name is retired and only
          // redirects here).
          href: homeRoute(postcode),
        })),
      });
      break;
    }
  }

  // The words the fragment leaves: the streets' and
  // properties' material. Pure-digit words (a house
  // number on its own) are no street's material — the
  // street tiers skip them; the properties keep them.
  const typedWords = fragmentWordsOf(input);
  const streetWords = typedWords.filter((word) => !/^[0-9]+$/.test(word));

  // Streets: exact tier first; the fuzzy tier tops up
  // only when exact found nothing or nearly nothing,
  // its rows below the exact ones, deduplicated, inside
  // the group cap. The fuzzy rows are the READ MODEL's
  // real streets — a misspelling is offered the real
  // street as a choice, never served back as typed.
  let streetUnits: StreetSuggestion[] = [];
  if (streetWords.length > 0) {
    let exactFailed = false;
    try {
      streetUnits = await source.streetsByPrefix(streetWords, SUGGEST_STREET_CAP);
    } catch (error) {
      // BUG-203: the exact tier failed — log it and
      // skip the group (the fuzzy tier has nothing to
      // top up); the other groups still serve.
      groupFailed = true;
      exactFailed = true;
      logEntry(req, "suggestions.group-failed", {
        layer: "local",
        reason: "group-failed",
        group: "streets",
        error: error instanceof Error ? error.message : String(error),
      });
      streetUnits = [];
    }
    if (!exactFailed && streetUnits.length <= SUGGEST_STREET_FUZZY_TRIGGER) {
      const seen = new Set(streetUnits.map(streetUnitKey));
      let fuzzy: StreetSuggestion[] = [];
      try {
        fuzzy = await source.streetsByFuzzy(streetWords, SUGGEST_STREET_FUZZY_CAP);
      } catch (error) {
        // BUG-203: the fuzzy tier failed — log it and
        // keep the exact rows (a missing top-up is
        // not a missing group).
        groupFailed = true;
        logEntry(req, "suggestions.group-failed", {
          layer: "local",
          reason: "group-failed",
          group: "streets-fuzzy",
          error: error instanceof Error ? error.message : String(error),
        });
      }
      for (const unit of fuzzy) {
        if (streetUnits.length >= SUGGEST_STREET_CAP) break;
        if (seen.has(streetUnitKey(unit))) continue;
        seen.add(streetUnitKey(unit));
        streetUnits.push(unit);
      }
    }
  }
  if (streetUnits.length > 0) {
    groups.push({ label: "Streets", items: streetUnits.map(streetItemOf) });
  }

  // Properties: the union's homes inside the typed
  // bound — the winning postcode prefix and/or the
  // served streets — narrowed by every typed word (the
  // full-postcode branch's whole-token rule), deduped
  // by home key with the filed form winning, ordered by
  // postcode then natural address order, capped at
  // five. With neither bound there is nothing honest to
  // offer: a bare word never scans the nation's homes.
  let propertyCount = 0;
  const streetPostcodes = streetUnits.flatMap((unit) =>
    unit.postcodes.map((postcode) => ({ streetNorm: norm(unit.street), postcode })),
  );
  if (servedPrefix !== null || streetPostcodes.length > 0) {
    let rows: LoadedAddressParts[];
    try {
      rows = await source.propertiesMatching(
        { postcodePrefix: servedPrefix, streetPostcodes },
        PROPERTIES_FETCH_LIMIT,
      );
    } catch (error) {
      // BUG-203: the properties read is the heaviest
      // read this branch issues (two 2,000-row scans)
      // and the one likeliest to trip the timeout —
      // log it and skip the group; the postcodes,
      // streets and places groups still serve.
      groupFailed = true;
      logEntry(req, "suggestions.group-failed", {
        layer: "local",
        reason: "group-failed",
        group: "properties",
        error: error instanceof Error ? error.message : String(error),
      });
      rows = [];
    }
    const sorted = [...rows].sort((a, b) =>
      a.postcode === b.postcode ? compareAddressParts(a, b) : a.postcode < b.postcode ? -1 : 1,
    );
    const items: SuggestionItem[] = [];
    const seen = new Set<string>();
    for (const parts of sorted) {
      const haystack = norm(
        [parts.paon ?? "", parts.saon ?? "", parts.street ?? "", parts.town ?? ""].join(" "),
      );
      if (!typedWords.every((word) => ` ${haystack} `.includes(` ${word} `))) continue;
      // BUG-308: as the Homes branch above — the panel
      // dedupes on the canonical home; the href keeps
      // the strict home key.
      const canonical = canonicalHomeKey(parts);
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      const key = keyForParts(parts);
      items.push({ label: propertyLabelOf(parts), href: homeRoute(parts.postcode, key) });
      if (items.length >= SUGGEST_PROPERTY_CAP) break;
    }
    propertyCount = items.length;
    if (items.length > 0) groups.push({ label: "Properties", items });
  }

  // Places (M7.15D): the fourth group. Exact tier first;
  // the fuzzy tier tops up only when exact found nothing
  // or nearly nothing, its rows below the exact ones,
  // deduplicated, inside the group cap — the streets'
  // arrangement exactly. The fuzzy rows are the READ
  // MODEL's real places: a misspelling is offered the
  // real place as a choice, never served back as typed.
  let placeUnits: PlaceSuggestion[] = [];
  let exactPlaceUnits: PlaceSuggestion[] = [];
  if (streetWords.length > 0) {
    let exactFailed = false;
    try {
      exactPlaceUnits = await source.placesByPrefix(streetWords, SUGGEST_PLACE_CAP);
    } catch (error) {
      // BUG-203: the exact tier failed — log it and
      // skip the group (the fuzzy tier has nothing to
      // top up); the other groups still serve.
      groupFailed = true;
      exactFailed = true;
      logEntry(req, "suggestions.group-failed", {
        layer: "local",
        reason: "group-failed",
        group: "places",
        error: error instanceof Error ? error.message : String(error),
      });
      exactPlaceUnits = [];
    }
    placeUnits = [...exactPlaceUnits];
    if (!exactFailed && placeUnits.length <= SUGGEST_PLACE_FUZZY_TRIGGER) {
      const seen = new Set(placeUnits.map((unit) => placeNormOf(unit.place)));
      let fuzzy: PlaceSuggestion[] = [];
      try {
        fuzzy = await source.placesByFuzzy(streetWords, SUGGEST_PLACE_FUZZY_CAP);
      } catch (error) {
        // BUG-203: the fuzzy tier failed — log it and
        // keep the exact rows (a missing top-up is
        // not a missing group).
        groupFailed = true;
        logEntry(req, "suggestions.group-failed", {
          layer: "local",
          reason: "group-failed",
          group: "places-fuzzy",
          error: error instanceof Error ? error.message : String(error),
        });
      }
      for (const unit of fuzzy) {
        if (placeUnits.length >= SUGGEST_PLACE_CAP) break;
        if (seen.has(placeNormOf(unit.place))) continue;
        seen.add(placeNormOf(unit.place));
        placeUnits.push(unit);
      }
    }
  }
  if (placeUnits.length > 0) {
    // BUG-323: one row per place — the bare/comma
    // duplicates merge. (The Londonthorpe leg of the
    // same bug is NOT done here — see the note after
    // mergePlaceUnits: its proposed rule breaks the
    // pinned sibling behaviour.)
    placeUnits = mergePlaceUnits(placeUnits);
  }
  if (placeUnits.length > 0) {
    groups.push({ label: "Places", items: placeUnits.map(placeItemOf) });
  }

  // Districts (BUG-009, founder ruling 20 Nov 2026):
  // the input IS exactly a district the directory
  // knows — its normalised whole equals the outward,
  // and the Postcodes walk above served that very
  // prefix — so the panel also offers the district's
  // wider-area page, the one destination the fragment
  // shapes could not reach before. The item links to
  // the wider-area route a one-district place's pick
  // takes (widerAreaRoute). This is not the M7.15D
  // "Districts in <Place>" group: that listed a
  // place's districts under a pick (removed 19 Nov
  // 2026, and it stays removed — a panel still holds
  // a place as a choice and nothing beneath it); this
  // serves one line for the district itself, only
  // when nothing but the district was typed.
  const bareDistrict =
    input.outward !== null &&
    servedPrefix === input.outward &&
    raw.trim().toUpperCase().replace(/\s+/g, " ") === input.outward
      ? input.outward
      : null;
  if (bareDistrict !== null) {
    groups.push({
      label: "Districts",
      items: [{ label: `${bareDistrict} — the wider area`, href: widerAreaRoute(bareDistrict) }],
    });
  }

  // The served log's districts field counts the
  // Districts group above (0 or 1 since BUG-009): the
  // field's shape does not move — it has stood in the
  // line since M7.15D — and its count is the honest
  // one again now a Districts group can serve.
  //
  // BUG-203: an answer that would be EMPTY because a
  // group read failed is not an empty answer — it is
  // a failure wearing one. Fail outright (the route's
  // logged 500, the client's retry, then its honest
  // failure line) instead of serving nothing. A
  // genuinely empty answer — no group failed — still
  // serves empty, exactly as before.
  if (groups.length === 0 && groupFailed) throw new Error("suggest-groups-failed");
  logEntry(req, "suggestions.served", {
    layer: "local",
    reason: groups.length > 0 ? "ok" : "empty",
    ms: entryNow() - started,
    shape,
    postcodes: postcodeCount,
    streets: streetUnits.length,
    homes: propertyCount,
    places: placeUnits.length,
    districts: bareDistrict !== null ? 1 : 0,
  });
  return { groups };
}
