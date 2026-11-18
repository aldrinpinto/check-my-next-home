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
// "Homes", capped at 8 in total; each item carries the
// href a pick navigates to, so the client holds no routing
// logic of its own.
//
// Server-time budget: under 100ms (D72 item 4). Both reads
// are prefix/index reads over filed tables — the postcode
// prefix query rides the postcode column's index, and the
// homes read is the resolver's own per-postcode query.

import {
  classifyAddressInput,
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
// The cap across both groups (D72 item 6).
export const SUGGEST_TOTAL_CAP = 8;

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

// The spaced prefix a partial input names: "cm3" -> "CM3",
// "CM3 2" / "cm32" -> "CM3 2". Returns null when the input
// carries no postcode-shaped fragment at all. The outward
// code is letters + a digit + an optional LETTER (CM3,
// SW1A) — a digit after the outward's digit belongs to
// the inward code, so the parse must not eat it.
export function spacedPrefixOf(raw: string): string | null {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = /^([A-Z]{1,2}[0-9][A-Z]?)([0-9][A-Z0-9]*)?$/.exec(compact);
  if (!match) return null;
  const outward = match[1];
  const rest = match[2] ?? "";
  return rest === "" ? outward : `${outward} ${rest}`;
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
    // appear in the home's filed parts).
    const rows = await source.addressesInPostcode(input.postcode);
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
      if (items.length >= SUGGEST_TOTAL_CAP) break;
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

  const prefix = spacedPrefixOf(raw);
  if (prefix && input.outward) {
    const postcodes = await source.postcodesByPrefix(prefix, SUGGEST_TOTAL_CAP);
    // A prefix that has quietly become a whole postcode
    // ("CM3 2JT" typed without the classifier seeing it as
    // one cannot happen — classifyAddressInput runs first;
    // this guard is for a prefix equal to a full postcode
    // arriving via the outward path) still serves the
    // postcode itself.
    const items = postcodes.map((postcode) => ({
      label: postcode,
      href: postcodeRoute(postcode),
    }));
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
