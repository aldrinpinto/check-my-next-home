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
// typed with it. Bare street or place names suggest
// nothing (D71's scope ruling stands — no national
// street-name index). The two groups are "Postcodes" and
// "Homes"; each item carries the href a pick navigates to,
// so the client holds no routing logic of its own.
//
// D71 AMENDMENT (founder ruling, 18 Nov 2026): a full
// postcode's Homes group carries that postcode's COMPLETE
// home list — the original cap of 8 hid homes past the cut
// (the founder's own 19 Birkdale Rise sat out of view at
// CM3 2JT, on a street the site holds in full). The cap of
// 8 still governs every fragment shape (the partial-
// postcode Postcodes group above all); the full-postcode
// list is bounded only by a defensive ceiling far above
// any real postcode's home count, and hitting it logs
// rather than truncating silently.
//
// Server-time budget: under 100ms (D72 item 4). Both reads
// are prefix/index reads over filed tables — the postcode
// prefix query rides the postcode column's index, and the
// homes read is the resolver's own per-postcode query.

import {
  classifyAddressInput,
  compareAddressParts,
  labelForAddressParts,
  type AddressQueryable,
  type LoadedAddressParts,
} from "../address";
import { homeKeyOf } from "../bundle-cache";
import { homeRoute, postcodeRoute } from "../journey";
import { entryNow, logEntry } from "./entry-log";
import { createPickingIndexSource } from "./picking-index";

// Suggestions start at 3 typed characters (D71).
export const SUGGEST_MIN_CHARS = 3;
// The cap across both groups for the FRAGMENT shapes
// (D72 item 6): a partial postcode's Postcodes group.
// A full postcode's Homes group is NOT under this cap —
// it serves the complete list (D71 amendment, above).
export const SUGGEST_TOTAL_CAP = 8;
// The defensive ceiling on a full postcode's Homes group
// (D71 amendment): a postcode's homes number in the
// hundreds at most, so 1,000 sits far above any real
// list. It exists only to bound a pathological response;
// reaching it logs (suggestions.ceiling) and truncates
// at the ceiling — never silently, and never below it.
export const SUGGEST_FULL_POSTCODE_CEILING = 1_000;

export interface SuggestionItem {
  label: string;
  href: string;
}

export interface SuggestionGroups {
  groups: { label: "Postcodes" | "Homes"; items: SuggestionItem[] }[];
}

// The read model's one new query shape over the filed
// directory; the homes read is the resolver's own.
export interface SuggestionSource {
  postcodesByPrefix(prefix: string, limit: number): Promise<string[]>;
  addressesInPostcode(postcode: string): Promise<LoadedAddressParts[]>;
}

export function createSuggestionSource(db: AddressQueryable): SuggestionSource {
  // Homes come from the picker's union (M7.15B): the
  // filed price_paid rows plus the national picking
  // index, the filed rows winning collisions — so the
  // dropdown names a postcode's homes from day one, not
  // only after a check has filed them. The postcode
  // prefix read below is unchanged.
  const union = createPickingIndexSource(db);
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
    const rows = [...(await source.addressesInPostcode(input.postcode))].sort(compareAddressParts);
    const words = input.text.split(" ").filter(Boolean);
    const items: SuggestionItem[] = [];
    const seen = new Set<string>();
    for (const parts of rows) {
      const label = labelForAddressParts(parts);
      const haystack = norm(
        [parts.paon ?? "", parts.saon ?? "", parts.street ?? "", label].join(" "),
      );
      if (!words.every((word) => ` ${haystack} `.includes(` ${word} `))) continue;
      const key = keyForParts(parts);
      if (seen.has(key)) continue;
      seen.add(key);
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
    logEntry(req, "suggestions.served", {
      layer: "local",
      reason: items.length > 0 ? "ok" : "empty",
      ms: entryNow() - started,
      shape: "full-postcode",
      postcodes: 0,
      homes: items.length,
    });
    return { groups };
  }

  const candidates = spacedPrefixCandidatesOf(raw);
  if (candidates.length > 0 && input.outward) {
    // The first candidate the filed directory answers
    // wins. The candidate order (an explicit space's
    // parse, then the longest district) is a preference,
    // not a verdict: a candidate that names nothing
    // filed — "CM32", a district that does not exist —
    // falls through to the next ("CM3 2"). A prefix that
    // has quietly become a whole postcode ("CM3 2JT"
    // typed without the classifier seeing it as one
    // cannot happen — classifyAddressInput runs first;
    // this guard is for a prefix equal to a full postcode
    // arriving via the outward path) still serves the
    // postcode itself.
    let items: SuggestionItem[] = [];
    for (const prefix of candidates) {
      const postcodes = await source.postcodesByPrefix(prefix, SUGGEST_TOTAL_CAP);
      if (postcodes.length === 0) continue;
      items = postcodes.map((postcode) => ({
        label: postcode,
        href: postcodeRoute(postcode),
      }));
      break;
    }
    if (items.length > 0) groups.push({ label: "Postcodes", items });
    logEntry(req, "suggestions.served", {
      layer: "local",
      reason: items.length > 0 ? "ok" : "empty",
      ms: entryNow() - started,
      shape: "partial-postcode",
      postcodes: items.length,
      homes: 0,
    });
    return { groups };
  }

  // No postcode fragment: a bare street or place name —
  // out of scope by ruling, and the box's submit path
  // carries the honest no-location answer for it.
  logEntry(req, "suggestions.served", {
    layer: "local",
    reason: "no-postcode-fragment",
    ms: entryNow() - started,
    shape: "text",
    postcodes: 0,
    homes: 0,
  });
  return { groups };
}
