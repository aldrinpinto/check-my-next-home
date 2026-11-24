import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  labelForAddressParts,
  type LoadedAddressParts,
  type ResolvedAddress,
} from "../lib/address";
import { homeRoute, PICK_FALLBACK_FLAG, PICK_FALLBACK_LINE } from "../lib/journey";
import { setEntryLogSink } from "../lib/server/entry-log";
import {
  pickerList,
  pickFallbackUrl,
  postioSupplementEnabled,
  promotionKeyFor,
  resetPostioListMemory,
  resolvePick,
  sameHomeParts,
  supplementPickerList,
} from "../lib/server/hybrid";
import {
  addressFromPostio,
  createFakePostioClient,
  createPostioClient,
  partsFromPostio,
  type PostioAddress,
} from "../lib/server/postio";
import { rateLimitOk, resetRateLimits } from "../lib/server/rate-limit";
import {
  createMemoryResolveRecordStore,
  isResolveToken,
  RESOLVE_RECORD_TTL_MS,
} from "../lib/server/resolve-records";
import {
  spacedPrefixOf,
  SUGGEST_FULL_POSTCODE_CEILING,
  suggestionsFor,
  type SuggestionSource,
} from "../lib/server/suggestions";
import {
  BEAULIEU,
  BIRKDALE,
  buildEntryFixture,
  COMBINATION,
  FALLBACK,
  MINERVA,
  type EntryFixture,
} from "./fixtures/entry-point";

// The entry point's hybrid (18 Nov 2026; decision D72,
// adopted in full; the list movement re-ruled by the
// founder, 23 Nov 2026 — BUG-185: no automatic Postio
// call anywhere; the wider list is fetched only by the
// visitor's click on the "Don't see your home?" row, via
// supplementPickerList). The four scenarios the founder
// asked to have "somewhere" — fixtures in
// tests/fixtures/entry-point.ts, the table in
// docs/entry-point.md:
//
//   (a) LOCAL ONLY — Birkdale CM3 2JT: a complete filed
//       list; Postio is never called.
//   (b) POSTIO ONLY — Minerva KT17 1FH: nothing filed;
//       the list build serves nothing and calls nothing,
//       then the click's supplement carries the picker
//       and Flat 4's pick resolves into a transient
//       record.
//   (c) FALLBACK — Southminster CM0 7AA (the M7.15B
//       neither-source witness): local empty and the
//       supplement's Postio call failing (error / timeout
//       / zero-balance / empty in turn); a pick lands on
//       the whole-postcode check with the notice flag.
//   (d) COMBINATION — EX1 1AA: local partial + the
//       supplement's Postio list merged and deduped; a
//       Postio pick that promotes to its home key once
//       its sale is filed.
//   (e) EPC-COVERED — Beaulieu CM1 6ER (M7.15B): no filed
//       sales, but the picking index holds its 49
//       certificate homes, so the local tier carries the
//       picker and Postio is never called. (Beaulieu
//       carried scenario (c) until the preload flipped
//       it — the flip is the step's acceptance witness.)
//
// Every scenario also asserts the decision log: one
// request id must show which layer answered, and why.

let lines: string[] = [];
let fixture: EntryFixture;

function logsFor(req: string): string[] {
  return lines.filter((line) => line.includes(`req=${req}`));
}

function resolved(postcode: string): ResolvedAddress[] {
  return fixture.filedRows
    .filter((row) => row.postcode === postcode)
    .map((parts) => ({ ...parts, label: labelForAddressParts(parts) }));
}

beforeEach(() => {
  lines = [];
  setEntryLogSink((line) => lines.push(line));
  resetPostioListMemory();
  resetRateLimits();
  fixture = buildEntryFixture();
});

afterEach(() => {
  setEntryLogSink(null);
});

// ------------------------------------------------------------------
// (a) LOCAL ONLY — Birkdale CM3 2JT
// ------------------------------------------------------------------

describe("(a) local only — Birkdale CM3 2JT", () => {
  it("suggestions come from the filed directory and the filed homes", async () => {
    const postcodes = await suggestionsFor("CM3 2J", fixture.source, "a1");
    // M7.15C (18 Nov 2026): a fragment now serves the
    // three groups the founder ruled — Postcodes, then
    // Properties from the same prefix (this fixture's
    // world files no street under a CM3 fragment typed
    // as pure postcode characters, so no Streets group).
    expect(postcodes.groups.map((group) => group.label)).toEqual(["Postcodes", "Properties"]);
    expect(postcodes.groups[0].label).toBe("Postcodes");
    expect(postcodes.groups[0].items.map((item) => item.label)).toContain(BIRKDALE);
    // The Postcodes group links straight to the
    // whole-postcode check (picker removed, 18 Nov 2026 —
    // the /search?postcode= route only redirects there).
    expect(postcodes.groups[0].items[0].href).toBe("/search/home?postcode=CM3+2JT");

    const homes = await suggestionsFor(BIRKDALE, fixture.source, "a1");
    expect(homes.groups[0].label).toBe("Homes");
    // D71 amendment (founder ruling, 18 Nov 2026): a full
    // postcode's Homes group is the COMPLETE list — all
    // thirty filed homes in natural order, 19 Birkdale
    // Rise among them. Under the old cap of 8 the served
    // eight stopped at 18 and his own home sat past the
    // cut (his play-server test, 18 Nov 2026).
    expect(homes.groups[0].items).toHaveLength(30);
    expect(homes.groups[0].items.map((item) => item.label)).toEqual(
      Array.from({ length: 30 }, (_, i) => `${i + 1} Birkdale Rise, ${BIRKDALE}`),
    );
    // Address words typed with the postcode filter the homes.
    const filtered = await suggestionsFor(`19 Birkdale Rise ${BIRKDALE}`, fixture.source, "a1");
    expect(filtered.groups[0].items).toHaveLength(1);
    expect(filtered.groups[0].items[0].href).toBe(
      "/search/home?postcode=CM3+2JT&home=19%7C%7CBIRKDALE+RISE",
    );
    expect(logsFor("a1").some((l) => l.includes("event=suggestions.served layer=local"))).toBe(
      true,
    );
  });

  it("the picker list is complete locally — Postio is never called", async () => {
    // BUG-185: the list build takes no Postio client at
    // all — there is nothing here that COULD call. The
    // result's own fields are the pin: not-called, at a
    // complete list's size as at any other.
    const result = pickerList({
      postcode: BIRKDALE,
      local: resolved(BIRKDALE),
      req: "a2",
    });
    expect(result.rows).toHaveLength(30);
    expect(result.rows.every((row) => row.source === "local")).toBe(true);
    expect(result.postioFrom).toBe("not-called");
    expect(result.postioCount).toBe(0);
    const log = logsFor("a2").find((l) => l.includes("event=picker.list"));
    expect(log).toContain("layer=local");
    expect(log).toContain("reason=local-complete");
    expect(log).toContain("local=30");
  });
});

// ------------------------------------------------------------------
// The D71 amendment's bounds (founder ruling, 18 Nov
// 2026): the full-postcode list is complete; the
// defensive ceiling logs. The fragment cap of 8 the
// amendment originally kept was superseded the same
// evening by the E161G fix (M7.15C): fragment postcode
// results now serve their complete matching set too.
// ------------------------------------------------------------------

describe("the D71 amendment — complete full-postcode list; fragment cap superseded at M7.15C", () => {
  const SYNTH = "ZZ1 1AA";
  // Twelve postcodes under one prefix, and a full
  // postcode whose homes are seeded in STRING order so
  // the pins prove the served order is the comparator's.
  function syntheticSource(homeCount: number): SuggestionSource {
    const postcodes = Array.from({ length: 12 }, (_, i) => `ZZ1 1A${String.fromCharCode(65 + i)}`);
    const numbers = Array.from({ length: homeCount }, (_, i) => String(i + 1)).sort();
    const homes: LoadedAddressParts[] = numbers.map((paon) => ({
      postcode: SYNTH,
      paon,
      saon: null,
      street: "HIGH STREET",
      locality: null,
      town: "EXETER",
    }));
    return {
      async postcodesByPrefix(prefix, limit) {
        return postcodes.filter((postcode) => postcode.startsWith(prefix)).slice(0, limit);
      },
      async addressesInPostcode(postcode) {
        return postcode === SYNTH ? homes : [];
      },
      // This world's streets: none filed (M7.15C).
      async streetsByPrefix() {
        return [];
      },
      async streetsByFuzzy() {
        return [];
      },
      // This world's places: none filed (M7.15D).
      async placesByPrefix() {
        return [];
      },
      async placesByFuzzy() {
        return [];
      },
      async placeDistricts() {
        return [];
      },
      async propertiesMatching(query, limit) {
        if (query.postcodePrefix === null) return [];
        return homes
          .filter((parts) => parts.postcode.startsWith(query.postcodePrefix as string))
          .slice(0, limit);
      },
    };
  }

  it("a partial postcode serves its complete matching set (the E161G fix, M7.15C)", async () => {
    // RE-PINNED at M7.15C (18 Nov 2026): this spec used to
    // pin the fragment cap of 8 ("a partial postcode
    // still caps at 8 in total"). The deploy round found
    // that cap cutting E16 1GN out of "E161G"'s twenty
    // live matches against the complete directory — a
    // typed fragment making a real postcode unreachable.
    // The founder's fix brings fragment results onto the
    // D71 pattern: the complete set, scrollable, bounded
    // only by the defensive ceiling. All twelve synthetic
    // postcodes now serve.
    const result = await suggestionsFor("ZZ1 1", syntheticSource(3), "x1");
    expect(result.groups[0].label).toBe("Postcodes");
    expect(result.groups[0].items).toHaveLength(12);
  });

  it("a full postcode serves every home, in natural order", async () => {
    const result = await suggestionsFor(SYNTH, syntheticSource(27), "x2");
    expect(result.groups[0].label).toBe("Homes");
    expect(result.groups[0].items).toHaveLength(27);
    expect(result.groups[0].items.map((item) => item.label)).toEqual(
      Array.from({ length: 27 }, (_, i) => `${i + 1} High Street, ${SYNTH}`),
    );
  });

  it("address words typed with the postcode narrow within the full list", async () => {
    const result = await suggestionsFor(`27 High ${SYNTH}`, syntheticSource(27), "x3");
    expect(result.groups[0].items).toHaveLength(1);
    expect(result.groups[0].items[0].label).toBe(`27 High Street, ${SYNTH}`);
  });

  it("the defensive ceiling truncates at the ceiling — and logs it, never silently", async () => {
    const over = SUGGEST_FULL_POSTCODE_CEILING + 5;
    const result = await suggestionsFor(SYNTH, syntheticSource(over), "x4");
    expect(result.groups[0].items).toHaveLength(SUGGEST_FULL_POSTCODE_CEILING);
    expect(result.groups[0].items.at(-1)?.label).toBe(
      `${SUGGEST_FULL_POSTCODE_CEILING} High Street, ${SYNTH}`,
    );
    const ceilingLog = logsFor("x4").find((l) => l.includes("event=suggestions.ceiling"));
    expect(ceilingLog).toContain(`homes=${over}`);
    expect(ceilingLog).toContain(`ceiling=${SUGGEST_FULL_POSTCODE_CEILING}`);
  });
});

// ------------------------------------------------------------------
// BUG-032 (fix batch, 19 Nov 2026): a full postcode with
// no picking-index homes served an EMPTY suggestions
// response. Proven live: E16 1AF is in the postcode
// directory (postcode_cache) with zero picking_index
// rows, so the full-postcode branch — which served only
// the Homes group from the picking union — offered
// nothing, not even the postcode itself, while its
// fragment "E16 1A" listed it among the postcodes. The
// branch now always serves at least the postcode itself
// (its whole-postcode route) when the directory files
// it, with the homes list when homes exist.
// ------------------------------------------------------------------

describe("BUG-032 — a full postcode with no filed homes still serves itself", () => {
  // The witness world: E16 1AF in the directory with no
  // homes anywhere; its neighbour E16 1AA holding two.
  function noHomesSource(): SuggestionSource {
    const directory = ["E16 1AA", "E16 1AF"];
    const homes: Record<string, LoadedAddressParts[]> = {
      "E16 1AA": [
        {
          postcode: "E16 1AA",
          paon: "1",
          saon: null,
          street: "EXETER ROAD",
          locality: null,
          town: "LONDON",
        },
        {
          postcode: "E16 1AA",
          paon: "2",
          saon: null,
          street: "EXETER ROAD",
          locality: null,
          town: "LONDON",
        },
      ],
    };
    return {
      async postcodesByPrefix(prefix, limit) {
        return directory
          .filter((postcode) => postcode.startsWith(prefix))
          .sort()
          .slice(0, limit);
      },
      async addressesInPostcode(postcode) {
        return homes[postcode] ?? [];
      },
      async streetsByPrefix() {
        return [];
      },
      async streetsByFuzzy() {
        return [];
      },
      async placesByPrefix() {
        return [];
      },
      async placesByFuzzy() {
        return [];
      },
      async placeDistricts() {
        return [];
      },
      async propertiesMatching() {
        return [];
      },
    };
  }

  it("a directory postcode with zero picking homes serves itself, whole-postcode route", async () => {
    const result = await suggestionsFor("E16 1AF", noHomesSource(), "b32a");
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].label).toBe("Postcodes");
    // BUG-185: the self-serve still marks the response as
    // one postcode's list, so the search box stands the
    // "Don't see your home?" row up under it — a zero-home
    // postcode is exactly where the row earns its place.
    expect(result.postcodeList).toEqual({ postcode: "E16 1AF" });
    expect(result.groups[0].items).toEqual([{ label: "E16 1AF", href: homeRoute("E16 1AF") }]);
    const served = logsFor("b32a").find((l) => l.includes("event=suggestions.served"));
    expect(served).toContain("reason=ok");
    expect(served).toContain("postcodes=1");
    expect(served).toContain("homes=0");
  });

  it("a postcode the directory does not file serves nothing", async () => {
    const result = await suggestionsFor("E16 1ZZ", noHomesSource(), "b32b");
    expect(result.groups).toEqual([]);
    const served = logsFor("b32b").find((l) => l.includes("event=suggestions.served"));
    expect(served).toContain("reason=empty");
  });

  it("a postcode with homes serves its Homes group alone — no self row rides along", async () => {
    const result = await suggestionsFor("E16 1AA", noHomesSource(), "b32c");
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].label).toBe("Homes");
    expect(result.groups[0].items).toHaveLength(2);
  });

  it("address words that match no home still leave the postcode itself on offer", async () => {
    const result = await suggestionsFor("99 Nowhere E16 1AA", noHomesSource(), "b32d");
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].label).toBe("Postcodes");
    expect(result.groups[0].items).toEqual([{ label: "E16 1AA", href: homeRoute("E16 1AA") }]);
  });
});

// ------------------------------------------------------------------
// Two-digit districts — the founder-found suggest bug
// (18 Nov 2026). The founder, testing the play server,
// typed E16 and got NO autosuggestions at all, while CM3
// worked. Cause, in two halves: spacedPrefixOf's outward
// parse allowed one digit only, so "E161" produced the
// prefix "E1 61", which matches nothing filed; and the
// classifier's outward token would not match mid-token,
// so "E161" carried no outward and the partial branch
// never ran. Both halves are pinned here (the classifier
// half also in tests/address.test.ts).
// ------------------------------------------------------------------

describe("two-digit districts — partial-postcode suggestions", () => {
  // The witness directory: two E16 postcodes (a real
  // two-digit district) and the golden CM3 2JT.
  function districtSource(): SuggestionSource {
    const directory = ["CM3 2JT", "E16 1EG", "E16 1GN"];
    return {
      async postcodesByPrefix(prefix, limit) {
        return directory
          .filter((postcode) => postcode.startsWith(prefix))
          .sort()
          .slice(0, limit);
      },
      async addressesInPostcode() {
        return [];
      },
      // This world's streets and properties: none filed
      // (M7.15C) — its specs pin the Postcodes group
      // alone, exactly as its directory serves.
      async streetsByPrefix() {
        return [];
      },
      async streetsByFuzzy() {
        return [];
      },
      // This world's places: none filed (M7.15D).
      async placesByPrefix() {
        return [];
      },
      async placesByFuzzy() {
        return [];
      },
      async placeDistricts() {
        return [];
      },
      async propertiesMatching() {
        return [];
      },
    };
  }

  it("the outward parse allows both digit shapes — and the digit+letter form", () => {
    // Two-digit districts parse whole, at every depth of
    // typing.
    expect(spacedPrefixOf("E16")).toBe("E16");
    expect(spacedPrefixOf("E161")).toBe("E16 1");
    expect(spacedPrefixOf("E161G")).toBe("E16 1G");
    expect(spacedPrefixOf("EH12")).toBe("EH12");
    expect(spacedPrefixOf("B24")).toBe("B24");
    expect(spacedPrefixOf("SE15")).toBe("SE15");
    expect(spacedPrefixOf("LS12")).toBe("LS12");
    expect(spacedPrefixOf("W12")).toBe("W12");
    // The digit+letter districts, bare and with the
    // inward begun.
    expect(spacedPrefixOf("W1A")).toBe("W1A");
    expect(spacedPrefixOf("SW1A")).toBe("SW1A");
    expect(spacedPrefixOf("SW1A1")).toBe("SW1A 1");
    expect(spacedPrefixOf("EC1V")).toBe("EC1V");
    // The one-digit districts, exactly as before.
    expect(spacedPrefixOf("CM3")).toBe("CM3");
    expect(spacedPrefixOf("CM3 2")).toBe("CM3 2");
  });

  it("a bare two-digit district suggests its postcodes", async () => {
    // RE-PINNED (BUG-009, founder ruling 20 Nov 2026):
    // a bare district now also serves the Districts
    // group — its wider-area line — behind the
    // Postcodes, so the panel holds two groups where
    // this spec once pinned one. The Postcodes group
    // itself is unchanged.
    const result = await suggestionsFor("E16", districtSource(), "t1");
    expect(result.groups.map((group) => group.label)).toEqual(["Postcodes", "Districts"]);
    expect(result.groups[0].items.map((item) => item.label)).toEqual(["E16 1EG", "E16 1GN"]);
  });

  it("a two-digit partial narrows by as much of the inward as was typed", async () => {
    // "E161" has typed the inward's first digit only, so
    // both E16 postcodes with a 1-inward are served —
    // E16 1GN among them (before the fix: nothing at
    // all). "E161G" has typed one letter more and narrows
    // to the one postcode.
    const begun = await suggestionsFor("E161", districtSource(), "t2");
    expect(begun.groups).toHaveLength(1);
    expect(begun.groups[0].items.map((item) => item.label)).toEqual(["E16 1EG", "E16 1GN"]);

    const narrowed = await suggestionsFor("E161G", districtSource(), "t2");
    expect(narrowed.groups).toHaveLength(1);
    expect(narrowed.groups[0].items.map((item) => item.label)).toEqual(["E16 1GN"]);
    expect(narrowed.groups[0].items[0].href).toBe("/search/home?postcode=E16+1GN");
  });

  it("the one-digit regressions hold: CM3 and CM32 both serve CM3 2JT", async () => {
    // "CM32" is the ambiguity the candidate walk exists
    // for: its best parse is the district CM32, which the
    // directory does not hold, so the walk falls through
    // to "CM3 2" — the behaviour the site has always had
    // for this typing.
    // RE-PINNED (BUG-009, founder ruling 20 Nov 2026):
    // exactly "CM3" also serves the Districts group now
    // (see the BUG-009 describe below), so the group
    // count is asserted per input — the Postcodes group
    // leads for all three, and only the bare district
    // gains the second group.
    for (const raw of ["CM3", "CM32", "CM3 2"]) {
      const result = await suggestionsFor(raw, districtSource(), "t3");
      expect(result.groups[0].label).toBe("Postcodes");
      expect(result.groups[0].items.map((item) => item.label)).toEqual(["CM3 2JT"]);
      expect(result.groups.map((group) => group.label)).toEqual(
        raw === "CM3" ? ["Postcodes", "Districts"] : ["Postcodes"],
      );
    }
  });

  it("a well-formed prefix the directory does not hold still serves nothing", async () => {
    const result = await suggestionsFor("SW1A", districtSource(), "t4");
    expect(result.groups).toEqual([]);
  });
});

// ------------------------------------------------------------------
// BUG-009 (founder ruling, 20 Nov 2026): typing exactly
// a postcode district served its Postcodes and its
// Properties but never the district's own wider-area
// page — the page built for exactly that intent was
// unreachable from the panel. The fragment shapes now
// carry a Districts group behind the others: one line,
// "<DISTRICT> — the wider area", on the wider-area
// route a one-district place's pick takes. It serves
// only when the typed input IS the district (nothing
// more typed with it) and the directory knows the
// district. This is not the M7.15D "Districts in
// <Place>" group (removed 19 Nov 2026): that listed a
// place's districts under a pick; this names the
// district the visitor typed themselves.
// ------------------------------------------------------------------

describe("BUG-009 — a bare district offers its wider area", () => {
  // The witness directory: the golden CM3 2JT and two
  // E16 postcodes; no streets, places or properties.
  function districtSource(): SuggestionSource {
    const directory = ["CM3 2JT", "E16 1EG", "E16 1GN"];
    return {
      async postcodesByPrefix(prefix, limit) {
        return directory
          .filter((postcode) => postcode.startsWith(prefix))
          .sort()
          .slice(0, limit);
      },
      async addressesInPostcode() {
        return [];
      },
      async streetsByPrefix() {
        return [];
      },
      async streetsByFuzzy() {
        return [];
      },
      async placesByPrefix() {
        return [];
      },
      async placesByFuzzy() {
        return [];
      },
      async placeDistricts() {
        return [];
      },
      async propertiesMatching() {
        return [];
      },
    };
  }

  it("typing exactly CM3 offers the wider area, behind the Postcodes", async () => {
    const result = await suggestionsFor("CM3", districtSource(), "b9a");
    expect(result.groups.map((group) => group.label)).toEqual(["Postcodes", "Districts"]);
    expect(result.groups[1].items).toEqual([
      { label: "CM3 — the wider area", href: "/search?outward=CM3" },
    ]);
    const served = logsFor("b9a").find((l) => l.includes("event=suggestions.served"));
    expect(served).toContain("districts=1");
    expect(served).toContain("postcodes=1");
  });

  it("a bare two-digit district offers its wider area the same way", async () => {
    const result = await suggestionsFor("E16", districtSource(), "b9b");
    expect(result.groups.map((group) => group.label)).toEqual(["Postcodes", "Districts"]);
    expect(result.groups[1].items).toEqual([
      { label: "E16 — the wider area", href: "/search?outward=E16" },
    ]);
  });

  it("case and padding do not change what exactly-the-district means", async () => {
    for (const raw of ["cm3", " CM3 "]) {
      const result = await suggestionsFor(raw, districtSource(), "b9c");
      expect(result.groups.map((group) => group.label)).toEqual(["Postcodes", "Districts"]);
    }
  });

  it("a partial postcode is not exactly a district — no wider-area line", async () => {
    const result = await suggestionsFor("CM3 2", districtSource(), "b9d");
    expect(result.groups.map((group) => group.label)).toEqual(["Postcodes"]);
  });

  it("a district typed with address words is not exactly a district either", async () => {
    const result = await suggestionsFor("Birkdale Rise CM3", districtSource(), "b9e");
    expect(result.groups.map((group) => group.label)).not.toContain("Districts");
  });

  it("a district the directory does not know offers nothing at all", async () => {
    const result = await suggestionsFor("ZZ9", districtSource(), "b9f");
    expect(result.groups).toEqual([]);
  });
});

// ------------------------------------------------------------------
// BUG-010 (founder ruling, 20 Nov 2026): a
// full-postcode-shaped input that resolves to nothing
// — the founder's witness "CM3 2JTTX", typed live —
// fell through to the fragment shapes for its outward
// and opened the district's fragment list, as though
// the visitor were still browsing. It now serves a
// settled EMPTY response: the panel shows the
// no-suggestions line (BUG-008) and a submit lands on
// the couldn't-place notice. Honest partials and
// mixed inputs keep their fragment behaviour exactly.
// ------------------------------------------------------------------

describe("BUG-010 — a failed full postcode serves a settled empty response", () => {
  function districtSource(): SuggestionSource {
    const directory = ["CM3 2JT", "E16 1EG", "E16 1GN"];
    return {
      async postcodesByPrefix(prefix, limit) {
        return directory
          .filter((postcode) => postcode.startsWith(prefix))
          .sort()
          .slice(0, limit);
      },
      async addressesInPostcode() {
        return [];
      },
      async streetsByPrefix() {
        return [];
      },
      async streetsByFuzzy() {
        return [];
      },
      async placesByPrefix() {
        return [];
      },
      async placesByFuzzy() {
        return [];
      },
      async placeDistricts() {
        return [];
      },
      async propertiesMatching() {
        return [];
      },
    };
  }

  it("the founder's witness: CM3 2JTTX serves nothing — no melt into CM3 fragments", async () => {
    const result = await suggestionsFor("CM3 2JTTX", districtSource(), "b10a");
    expect(result.groups).toEqual([]);
    const served = logsFor("b10a").find((l) => l.includes("event=suggestions.served"));
    expect(served).toContain("reason=empty");
    expect(served).toContain("shape=failed-postcode");
  });

  it("the compact form melts no more than the spaced form", async () => {
    const result = await suggestionsFor("CM32JTTX", districtSource(), "b10b");
    expect(result.groups).toEqual([]);
  });

  it("an over-long inward in a two-digit district is the same shape", async () => {
    const result = await suggestionsFor("E16 1GNX", districtSource(), "b10c");
    expect(result.groups).toEqual([]);
  });

  it("honest partials keep their fragments: CM3 2 still serves its postcodes", async () => {
    const result = await suggestionsFor("CM3 2", districtSource(), "b10d");
    expect(result.groups.map((group) => group.label)).toEqual(["Postcodes"]);
    expect(result.groups[0].items.map((item) => item.label)).toEqual(["CM3 2JT"]);
  });

  it("a begun inward is an honest partial, not a failed postcode: CM3 2J narrows and serves", async () => {
    // "CM3 2J" has typed the inward's first two
    // characters — a valid beginning (inwardPartialOk),
    // so BUG-010 does not claim it: the fragment walk
    // serves the postcodes under the "CM3 2J" prefix,
    // exactly as before the ruling.
    const result = await suggestionsFor("CM3 2J", districtSource(), "b10e");
    expect(result.groups.map((group) => group.label)).toEqual(["Postcodes"]);
    expect(result.groups[0].items.map((item) => item.label)).toEqual(["CM3 2JT"]);
    const served = logsFor("b10e").find((l) => l.includes("event=suggestions.served"));
    expect(served).toContain("shape=partial-postcode");
  });

  it("a mixed input is not a failed postcode: CM3 plus a street word keeps its fragments", async () => {
    const result = await suggestionsFor("CM3 Birkdale", districtSource(), "b10f");
    expect(result.groups[0].label).toBe("Postcodes");
    expect(result.groups[0].items.map((item) => item.label)).toEqual(["CM3 2JT"]);
  });
});

// ------------------------------------------------------------------
// BUG-203 (24 Nov 2026): a suggestions fetch that failed
// — a statement timeout under load, the deploy's own
// first-two-CM3-calls-500 — settled as a failure, and
// the box closed on it: the panel's vanish. The read
// model ran its group reads sequentially under one
// timeout, so a timeout anywhere failed the whole
// response. Each group read now fails alone: a failed
// group is logged and skipped, the groups that did
// serve still reach the visitor, and only an answer
// that would be EMPTY because a group failed fails
// outright (the route's logged 500). A genuinely empty
// answer — no group failed — still serves empty.
// ------------------------------------------------------------------

describe("BUG-203 — a failed group read fails alone, never the whole response", () => {
  // The witness world: a twelve-postcode directory, three
  // homes on High Street in ZZ1 1AA, and a street the
  // fragment shapes can lose. Each read can be made to
  // throw the timeout error, one method at a time.
  function flakySource(fail: Set<string>): SuggestionSource {
    const directory = Array.from({ length: 12 }, (_, i) => `ZZ1 1A${String.fromCharCode(65 + i)}`);
    const homes: LoadedAddressParts[] = ["1", "2", "3"].map((paon) => ({
      postcode: "ZZ1 1AA",
      paon,
      saon: null,
      street: "HIGH STREET",
      locality: null,
      town: "EXETER",
    }));
    const timeout = () => {
      throw new Error("canceling statement due to statement timeout");
    };
    return {
      async postcodesByPrefix(prefix, limit) {
        if (fail.has("postcodesByPrefix")) timeout();
        return directory
          .filter((postcode) => postcode.startsWith(prefix))
          .sort()
          .slice(0, limit);
      },
      async addressesInPostcode(postcode) {
        if (fail.has("addressesInPostcode")) timeout();
        return postcode === "ZZ1 1AA" ? homes : [];
      },
      async streetsByPrefix(words) {
        if (fail.has("streetsByPrefix")) timeout();
        return words[0] === "HIGH"
          ? [{ street: "HIGH STREET", town: "EXETER", postcodes: ["ZZ1 1AA"], homes: 3 }]
          : [];
      },
      async streetsByFuzzy() {
        if (fail.has("streetsByFuzzy")) timeout();
        return [];
      },
      async placesByPrefix() {
        if (fail.has("placesByPrefix")) timeout();
        return [];
      },
      async placesByFuzzy() {
        if (fail.has("placesByFuzzy")) timeout();
        return [];
      },
      async placeDistricts() {
        return [];
      },
      async propertiesMatching(query, limit) {
        if (fail.has("propertiesMatching")) timeout();
        if (query.postcodePrefix === null) return [];
        return homes
          .filter((parts) => parts.postcode.startsWith(query.postcodePrefix as string))
          .slice(0, limit);
      },
    };
  }

  it("a failed properties read skips the group — the postcodes still serve", async () => {
    // The properties read is the heaviest this branch
    // issues (two 2,000-row scans) and the likeliest to
    // trip the timeout; its failure must not take the
    // postcodes down with it.
    const result = await suggestionsFor(
      "ZZ1 1",
      flakySource(new Set(["propertiesMatching"])),
      "b203a",
    );
    expect(result.groups.map((group) => group.label)).toEqual(["Postcodes"]);
    expect(result.groups[0].items).toHaveLength(12);
    const failed = logsFor("b203a").find((l) => l.includes("event=suggestions.group-failed"));
    expect(failed).toContain("group=properties");
    const served = logsFor("b203a").find((l) => l.includes("event=suggestions.served"));
    expect(served).toContain("reason=ok");
    expect(served).toContain("homes=0");
  });

  it("a failed streets read skips the group — the postcodes and properties still serve", async () => {
    const result = await suggestionsFor(
      "High ZZ1 1",
      flakySource(new Set(["streetsByPrefix"])),
      "b203b",
    );
    expect(result.groups.map((group) => group.label)).toEqual(["Postcodes", "Properties"]);
    expect(result.groups[1].items).toHaveLength(3);
    const failed = logsFor("b203b").find((l) => l.includes("event=suggestions.group-failed"));
    expect(failed).toContain("group=streets");
  });

  it("a failed homes read degrades a full postcode to the postcode itself", async () => {
    const result = await suggestionsFor(
      "ZZ1 1AA",
      flakySource(new Set(["addressesInPostcode"])),
      "b203c",
    );
    expect(result.groups.map((group) => group.label)).toEqual(["Postcodes"]);
    expect(result.groups[0].items).toEqual([{ label: "ZZ1 1AA", href: homeRoute("ZZ1 1AA") }]);
    expect(result.postcodeList).toEqual({ postcode: "ZZ1 1AA" });
    const failed = logsFor("b203c").find((l) => l.includes("event=suggestions.group-failed"));
    expect(failed).toContain("group=homes");
  });

  it("a failed homes read on an unfiled postcode fails outright — never an empty answer", async () => {
    await expect(
      suggestionsFor("ZZ1 1ZZ", flakySource(new Set(["addressesInPostcode"])), "b203d"),
    ).rejects.toThrow("suggest-homes-failed");
    const failed = logsFor("b203d").find((l) => l.includes("event=suggestions.group-failed"));
    expect(failed).toContain("group=homes");
  });

  it("every fragment read failing fails outright — never an empty answer", async () => {
    await expect(
      suggestionsFor(
        "ZZ1 1",
        flakySource(new Set(["postcodesByPrefix", "propertiesMatching"])),
        "b203e",
      ),
    ).rejects.toThrow("suggest-groups-failed");
    const failed = logsFor("b203e").filter((l) => l.includes("event=suggestions.group-failed"));
    expect(failed.some((l) => l.includes("group=postcodes"))).toBe(true);
    // No served line: the answer never served.
    expect(logsFor("b203e").some((l) => l.includes("event=suggestions.served"))).toBe(false);
  });

  it("a genuinely empty answer still serves empty — no group failed, nothing thrown", async () => {
    const result = await suggestionsFor("ZZ9 9", flakySource(new Set()), "b203f");
    expect(result.groups).toEqual([]);
    const served = logsFor("b203f").find((l) => l.includes("event=suggestions.served"));
    expect(served).toContain("reason=empty");
    expect(logsFor("b203f").some((l) => l.includes("event=suggestions.group-failed"))).toBe(false);
  });
});

// ------------------------------------------------------------------
// (b) POSTIO ONLY — Minerva KT17 1FH
// ------------------------------------------------------------------

describe("(b) postio only — Minerva KT17 1FH", () => {
  it("the click's supplement carries the picker, and Flat 4's pick resolves transiently", async () => {
    const postio = createFakePostioClient({ postcodes: fixture.postioLists });
    const store = createMemoryResolveRecordStore();

    // BUG-185: the list build itself serves the empty
    // local list and makes NO call — the postcode's
    // homes arrive only with the visitor's click.
    const built = pickerList({ postcode: MINERVA, local: [], req: "b1" });
    expect(built.rows).toHaveLength(0);
    expect(postio.calls).toHaveLength(0);

    const list = await supplementPickerList({
      postio,
      postcode: MINERVA,
      local: [],
      enabled: true,
      req: "b1",
    });
    expect(list.rows).toHaveLength(7);
    expect(list.rows.every((row) => row.source === "postio")).toBe(true);
    // The flats serve in natural order (founder fix,
    // 18 Nov 2026): Flat 3 … Flat 9, numerically.
    expect(list.rows.map((row) => row.label)).toEqual(
      [3, 4, 5, 6, 7, 8, 9].map((n) => `Flat ${n}, Minerva House, 12 Ceres Crescent`),
    );
    expect(list.rows.map((row) => row.label)).toContain("Flat 4, Minerva House, 12 Ceres Crescent");
    expect(postio.calls).toEqual([{ op: "postcode", arg: MINERVA }]);

    const pick = await resolvePick({
      postio,
      store,
      postcode: MINERVA,
      udprn: "1004",
      req: "b1",
    });
    expect(pick.kind).toBe("transient");
    if (pick.kind !== "transient") throw new Error("unreachable");
    expect(pick.url.startsWith(`/search/home?postcode=KT17+1FH&home=`)).toBe(true);
    // The token is not a home key — the route tells them
    // apart by the "|" a home key always carries.
    expect(isResolveToken(pick.token)).toBe(true);

    const record = await store.get(pick.token, "b1");
    expect(record?.parts.saon).toBe("FLAT 4");
    expect(record && labelForAddressParts(record.parts)).toBe(
      "Flat 4, Minerva House, 12 Ceres Crescent",
    );
    // The pick came from the warm list memory — no second
    // billable call.
    expect(postio.calls).toHaveLength(1);

    const path = logsFor("b1");
    expect(path.some((l) => l.includes("event=postio.call") && l.includes("op=postcode"))).toBe(
      true,
    );
    expect(
      path.some((l) => l.includes("event=picker.supplement") && l.includes("layer=hybrid")),
    ).toBe(true);
    expect(path.some((l) => l.includes("event=transient.created"))).toBe(true);
    expect(path.some((l) => l.includes("event=pick.resolved") && l.includes("layer=postio"))).toBe(
      true,
    );
    // The warm path is asserted EXPLICITLY, not inferred
    // from the absence of a second call: the pick's own
    // log line names via=memory (the 18 Nov warm-path bug
    // — a paid UDPRN call 53 seconds after the list, inside
    // the TTL — is exactly a via that silently wasn't).
    expect(path.some((l) => l.includes("event=pick.resolved") && l.includes("via=memory"))).toBe(
      true,
    );
    expect(path.some((l) => l.includes("via=udprn-call"))).toBe(false);
  });

  it("the list memory survives a module-instance split (the production bundle's shape)", async () => {
    // The live miss of 18 Nov 2026: the /search render and
    // the /api/pick route were served by separate instances
    // of hybrid.ts, each with its own module-level Map, so
    // the pick found an empty memory and paid. The memory
    // is anchored to globalThis precisely so this shape
    // cannot recur — simulated here by re-importing the
    // module fresh (vi.resetModules) between the list and
    // the pick, which is the closest the harness can come
    // to two bundle instances.
    const postio = createFakePostioClient({ postcodes: fixture.postioLists });
    const store = createMemoryResolveRecordStore();

    const first = await import("../lib/server/hybrid");
    const list = await first.supplementPickerList({
      postio,
      postcode: MINERVA,
      local: [],
      enabled: true,
      req: "b3",
    });
    expect(list.postioFrom).toBe("live");
    expect(postio.calls).toHaveLength(1);

    vi.resetModules();
    const second = await import("../lib/server/hybrid");
    expect(second).not.toBe(first);

    // The second instance reads the first instance's
    // memory — including under the unspaced key form.
    expect(second.rememberedPostioRow("KT171FH", "1004")).not.toBeNull();

    const pick = await second.resolvePick({
      postio,
      store,
      postcode: MINERVA,
      udprn: "1004",
      req: "b3",
    });
    expect(pick.kind).toBe("transient");
    // Still exactly one billable call: the pick resolved
    // from the shared warm memory, not by a UDPRN call.
    expect(postio.calls).toHaveLength(1);
  });

  it("a cold pick (list memory empty) resolves by the one UDPRN call", async () => {
    const postio = createFakePostioClient({ postcodes: fixture.postioLists });
    const store = createMemoryResolveRecordStore();
    const pick = await resolvePick({
      postio,
      store,
      postcode: MINERVA,
      udprn: "1005",
      req: "b2",
    });
    expect(pick.kind).toBe("transient");
    expect(postio.calls).toEqual([{ op: "udprn", arg: "1005" }]);
    expect(logsFor("b2").some((l) => l.includes("via=udprn-call"))).toBe(true);
  });
});

// ------------------------------------------------------------------
// (c) FALLBACK — Southminster CM0 7AA (the neither-source
// witness: no filed sales, no index rows from either
// source — see tests/fixtures/entry-point.ts)
// ------------------------------------------------------------------

describe("(c) fallback — Southminster CM0 7AA", () => {
  it("Postio erroring: the supplement degrades silently, a pick falls back WITH the notice flag", async () => {
    const postio = createFakePostioClient({
      postcodes: fixture.postioLists,
      fail: "error",
    });
    const store = createMemoryResolveRecordStore();

    const list = await supplementPickerList({
      postio,
      postcode: FALLBACK,
      local: [],
      enabled: true,
      req: "c1",
    });
    expect(list.rows).toHaveLength(0);
    expect(list.postioFrom).toBe("failed");
    const listLog = logsFor("c1").find((l) => l.includes("event=picker.supplement"));
    expect(listLog).toContain("reason=postio-error");

    const pick = await resolvePick({
      postio,
      store,
      postcode: FALLBACK,
      udprn: "4001",
      req: "c1",
    });
    expect(pick.kind).toBe("fallback");
    if (pick.kind !== "fallback") throw new Error("unreachable");
    expect(pick.url).toBe(`/search/home?postcode=CM0+7AA&notfound=${PICK_FALLBACK_FLAG}`);
    expect(store.size()).toBe(0);
    const pickLog = logsFor("c1").find((l) => l.includes("event=pick.resolved"));
    expect(pickLog).toContain("layer=fallback");
    expect(pickLog).toContain("reason=postio-error");
  });

  it("zero balance refuses the pick the same way, and says so in the log", async () => {
    const postio = createFakePostioClient({
      postcodes: fixture.postioLists,
      fail: "zero-balance",
    });
    const pick = await resolvePick({
      postio,
      store: createMemoryResolveRecordStore(),
      postcode: FALLBACK,
      udprn: "4001",
      req: "c2",
    });
    expect(pick.kind).toBe("fallback");
    expect(logsFor("c2").some((l) => l.includes("reason=postio-zero-balance"))).toBe(true);
  });

  it("a slow Postio times out into the same fallback", async () => {
    const postio = createFakePostioClient(
      { postcodes: fixture.postioLists, delayMs: 60 },
      { timeoutMs: 20 },
    );
    const pick = await resolvePick({
      postio,
      store: createMemoryResolveRecordStore(),
      postcode: FALLBACK,
      udprn: "4001",
      req: "c3",
    });
    expect(pick.kind).toBe("fallback");
    expect(logsFor("c3").some((l) => l.includes("reason=postio-timeout"))).toBe(true);
  });

  it("an empty Postio list is a silent local-only supplement, not a failure", async () => {
    const postio = createFakePostioClient({ postcodes: {} });
    const list = await supplementPickerList({
      postio,
      postcode: FALLBACK,
      local: [],
      enabled: true,
      req: "c4",
    });
    expect(list.rows).toHaveLength(0);
    expect(list.postioFrom).toBe("live");
    expect(list.postioCount).toBe(0);
  });

  it("the fallback destination and its notice line are the pinned forms", () => {
    expect(pickFallbackUrl(FALLBACK)).toBe("/search/home?postcode=CM0+7AA&notfound=pick");
    // PENDING the founder's final copy approval — pinned so
    // any change is deliberate (flagged in the build's
    // terminal report and docs/entry-point.md).
    expect(PICK_FALLBACK_LINE).toBe(
      "We couldn't load that exact home just now — here's the check for the whole postcode instead.",
    );
  });
});

// ------------------------------------------------------------------
// (e) EPC-COVERED — Beaulieu CM1 6ER (M7.15B: the index
// holds the 49 certificate homes; the local tier carries
// the picker)
// ------------------------------------------------------------------

describe("(e) EPC-covered — Beaulieu CM1 6ER", () => {
  it("the union serves all 49 certificate homes locally — Postio is never called", async () => {
    const union = await fixture.source.addressesInPostcode(BEAULIEU);
    expect(union).toHaveLength(49);
    const local: ResolvedAddress[] = union.map((parts) => ({
      ...parts,
      label: labelForAddressParts(parts),
    }));
    // BUG-185: the list build has no Postio client to
    // call with — the 49 arrive as filed, and the result
    // says not-called in its own fields.
    const list = pickerList({ postcode: BEAULIEU, local, req: "e1" });
    expect(list.postioFrom).toBe("not-called");
    expect(list.rows).toHaveLength(49);
    expect(list.rows.every((row) => row.source === "local")).toBe(true);
    // Natural order (founder fix, 18 Nov 2026): the odd
    // numbers read 1, 3, 5 … 97 — under string order the
    // second row would be 11.
    expect(list.rows.map((row) => row.label).slice(0, 5)).toEqual(
      [1, 3, 5, 7, 9].map((n) => `${n} George Heard Crescent`),
    );
    expect(list.rows[48].label).toBe("97 George Heard Crescent");
    // The rows carry durable home keys, not tokens: an
    // index-only home is a first-class local home.
    const last = list.rows.find((row) => row.label === "49 George Heard Crescent");
    expect(last?.key).toBe("49||GEORGE HEARD CRESCENT");
    expect(isResolveToken(last?.key ?? "")).toBe(false);
    expect(logsFor("e1").some((l) => l.includes("event=picker.list"))).toBe(true);
  });

  it("suggestions serve the certificate homes from the local union", async () => {
    const homes = await suggestionsFor(BEAULIEU, fixture.source, "e2");
    expect(homes.groups[0].label).toBe("Homes");
    // D71 amendment (18 Nov 2026): the COMPLETE list —
    // all 49 certificate homes in natural order (1, 3, 5
    // … 97). Under the old cap of 8 only the first eight
    // were served, and under string order even those
    // would have read 1, 11, 13, 15, 17, 19, 21, 23.
    expect(homes.groups[0].items).toHaveLength(49);
    expect(homes.groups[0].items.map((item) => item.label)).toEqual(
      Array.from({ length: 49 }, (_, i) => `${2 * i + 1} George Heard Crescent, ${BEAULIEU}`),
    );
  });
});

// ------------------------------------------------------------------
// (d) COMBINATION — EX1 1AA
// ------------------------------------------------------------------

describe("(d) combination — EX1 1AA", () => {
  it("local partial + the supplement's Postio list merge into one deduped list in natural address order", async () => {
    const postio = createFakePostioClient({ postcodes: fixture.postioLists });
    const list = await supplementPickerList({
      postio,
      postcode: COMBINATION,
      local: resolved(COMBINATION),
      enabled: true,
      req: "d1",
    });
    expect(list.rows.map((row) => row.label)).toEqual([
      "1 High Street",
      "2 High Street",
      "3 High Street",
      "4 High Street",
    ]);
    expect(list.rows.map((row) => row.source)).toEqual(["local", "local", "postio", "postio"]);
    expect(list.dedupedCount).toBe(2);
    const log = logsFor("d1").find((l) => l.includes("event=picker.supplement"));
    expect(log).toContain("layer=hybrid");
    expect(log).toContain("local=2");
    expect(log).toContain("postio=4");
    expect(log).toContain("deduped=2");
  });

  it("a Postio row interleaves between local rows — one merged list, never grouped by layer", async () => {
    // The founder fix (18 Nov 2026) stated as a merge
    // rule: on this fixture the natural order and the
    // layer order in the spec above coincide, so this
    // pin separates them — local holds 2 and 10, Postio
    // adds 1 and 3, and the served list reads 1, 2, 3,
    // 10 with the sources interleaved.
    const parts = (paon: string) => ({
      postcode: COMBINATION,
      paon,
      saon: null,
      street: "HIGH STREET",
      locality: null,
      town: "EXETER",
    });
    const local: ResolvedAddress[] = ["2", "10"].map((paon) => ({
      ...parts(paon),
      label: labelForAddressParts(parts(paon)),
    }));
    const postio = createFakePostioClient({
      postcodes: {
        [COMBINATION]: ["1", "2", "3", "10"].map((paon) => ({
          udprn: `200${paon}`,
          parts: parts(paon),
          label: `${paon} High Street`,
        })),
      },
    });
    const list = await supplementPickerList({
      postio,
      postcode: COMBINATION,
      local,
      enabled: true,
      req: "d1b",
    });
    expect(list.rows.map((row) => row.label)).toEqual([
      "1 High Street",
      "2 High Street",
      "3 High Street",
      "10 High Street",
    ]);
    expect(list.rows.map((row) => row.source)).toEqual(["postio", "local", "postio", "local"]);
    expect(list.dedupedCount).toBe(2);
  });

  it("a Postio pick promotes to its home key once its sale is filed", async () => {
    const postio = createFakePostioClient({ postcodes: fixture.postioLists });
    const store = createMemoryResolveRecordStore();
    await supplementPickerList({
      postio,
      postcode: COMBINATION,
      local: resolved(COMBINATION),
      enabled: true,
      req: "d2",
    });
    const pick = await resolvePick({
      postio,
      store,
      postcode: COMBINATION,
      udprn: "2003",
      req: "d2",
    });
    expect(pick.kind).toBe("transient");
    if (pick.kind !== "transient") throw new Error("unreachable");
    const record = await store.get(pick.token, "d2");
    expect(record).not.toBeNull();

    // Not yet filed: no promotion.
    const filedHere = () => fixture.filedRows.filter((row) => row.postcode === COMBINATION);
    expect(promotionKeyFor(record!.parts, filedHere())).toBeNull();

    // The pick's own check cold-loads the postcode's sales;
    // 3 High Street's sale lands among them.
    fixture.source.addFiledRow({
      postcode: COMBINATION,
      paon: "3",
      saon: null,
      street: "HIGH STREET",
      locality: null,
      town: "EXETER",
    });
    const key = promotionKeyFor(record!.parts, filedHere());
    expect(key).toBe("3||HIGH STREET");

    // Promotion lapses the record (the caller deletes it).
    await store.delete(pick.token);
    expect(store.size()).toBe(0);
    expect(await store.get(pick.token, "d2")).toBeNull();
  });
});

// ------------------------------------------------------------------
// The transient record's own rules
// ------------------------------------------------------------------

describe("transient resolve records", () => {
  it("expire at 24 hours: an aged record deletes itself on read and logs it", async () => {
    let now = 1_700_000_000_000;
    const store = createMemoryResolveRecordStore(() => now);
    const record = await store.create({
      postcode: MINERVA,
      parts: {
        postcode: MINERVA,
        paon: "MINERVA HOUSE, 12",
        saon: "FLAT 4",
        street: "CERES CRESCENT",
        locality: null,
        town: "EPSOM",
      },
      udprn: "1004",
    });
    expect(await store.get(record.token, "t1")).not.toBeNull();
    now += RESOLVE_RECORD_TTL_MS + 1;
    expect(await store.get(record.token, "t1")).toBeNull();
    expect(store.size()).toBe(0);
    expect(logsFor("t1").some((l) => l.includes("event=transient.expired"))).toBe(true);
  });

  it("a token never carries the home key's separator", () => {
    expect(isResolveToken("x7k2togetherTokenABC")).toBe(true);
    expect(isResolveToken("19||BIRKDALE RISE")).toBe(false);
  });
});

// ------------------------------------------------------------------
// Contract pins — the new shapes, key sets exact
// ------------------------------------------------------------------

describe("contract pins", () => {
  it("the suggestions shape: groups of {label, items:[{label, href}]}", async () => {
    const { groups } = await suggestionsFor("CM3 2J", fixture.source, "p1");
    expect(Object.keys(groups[0]).sort()).toEqual(["items", "label"]);
    expect(Object.keys(groups[0].items[0]).sort()).toEqual(["href", "label"]);
  });

  it("the picker row shapes differ by source, exactly", async () => {
    const postio = createFakePostioClient({ postcodes: fixture.postioLists });
    const list = await supplementPickerList({
      postio,
      postcode: COMBINATION,
      local: resolved(COMBINATION),
      enabled: true,
      req: "p2",
    });
    const local = list.rows.find((row) => row.source === "local");
    const remote = list.rows.find((row) => row.source === "postio");
    expect(Object.keys(local!).sort()).toEqual(["homeKey", "key", "label", "source"]);
    expect(Object.keys(remote!).sort()).toEqual(["key", "label", "source", "udprn"]);
  });

  it("the resolve record shape: {token, postcode, parts, udprn, createdAt, expiresAt}", async () => {
    const store = createMemoryResolveRecordStore();
    const record = await store.create({
      postcode: MINERVA,
      parts: {
        postcode: MINERVA,
        paon: "MINERVA HOUSE, 12",
        saon: "FLAT 4",
        street: "CERES CRESCENT",
        locality: null,
        town: "EPSOM",
      },
      udprn: "1004",
    });
    expect(Object.keys(record).sort()).toEqual([
      "createdAt",
      "expiresAt",
      "parts",
      "postcode",
      "token",
      "udprn",
    ]);
    expect(Object.keys(record.parts).sort()).toEqual([
      "locality",
      "paon",
      "postcode",
      "saon",
      "street",
      "town",
    ]);
    expect(record.expiresAt.getTime() - record.createdAt.getTime()).toBe(RESOLVE_RECORD_TTL_MS);
  });
});

// ------------------------------------------------------------------
// The Postio client itself
// ------------------------------------------------------------------

describe("the Postio client", () => {
  it("maps a PAF object onto the filed parts form", () => {
    const raw = {
      udprn: 50905588,
      postcode: "KT17 1FH",
      building_name: "MINERVA HOUSE",
      building_number: "12",
      sub_building_name: "FLAT 4",
      thoroughfare: "CERES CRESCENT",
      post_town: "EPSOM",
    };
    expect(partsFromPostio(raw)).toEqual({
      postcode: "KT17 1FH",
      paon: "MINERVA HOUSE, 12",
      saon: "FLAT 4",
      street: "CERES CRESCENT",
      locality: null,
      town: "EPSOM",
    });
    expect(addressFromPostio(raw)?.label).toBe("Flat 4, Minerva House, 12 Ceres Crescent");
    expect(addressFromPostio(raw)?.udprn).toBe("50905588");
  });

  it("with no key, every call answers no-key and the network is never touched", async () => {
    const client = createPostioClient({
      apiKey: null,
      fetchImpl: () => {
        throw new Error("network touched");
      },
    });
    expect(await client.listForPostcode(MINERVA, "k1")).toEqual({
      ok: false,
      reason: "no-key",
      ms: 0,
    });
  });

  it("a 402 is zero-balance; a 401 is refused; an envelope maps", async () => {
    const envelope = (status: number, body?: unknown) =>
      new Response(body ? JSON.stringify(body) : "", { status });
    const zero = createPostioClient({
      apiKey: "pk_test",
      fetchImpl: async () => envelope(402),
    });
    expect((await zero.listForPostcode(MINERVA, "k2")).ok).toBe(false);
    expect(await zero.listForPostcode(MINERVA, "k2")).toMatchObject({ reason: "zero-balance" });

    const refused = createPostioClient({
      apiKey: "pk_test",
      fetchImpl: async () => envelope(401),
    });
    expect(await refused.byUdprn("1004", "k2")).toMatchObject({ reason: "refused" });

    const okClient = createPostioClient({
      apiKey: "pk_test",
      fetchImpl: async () =>
        envelope(200, {
          success: true,
          results: [
            {
              udprn: 1004,
              postcode: "KT17 1FH",
              building_name: "MINERVA HOUSE",
              building_number: "12",
              sub_building_name: "FLAT 4",
              thoroughfare: "CERES CRESCENT",
              post_town: "EPSOM",
            },
          ],
          meta: { requestId: "req-abc" },
        }),
    });
    const listed = await okClient.listForPostcode(MINERVA, "k2");
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.value[0].label).toBe("Flat 4, Minerva House, 12 Ceres Crescent");
    expect(logsFor("k2").some((l) => l.includes("postioRequestId=req-abc"))).toBe(true);
  });

  it("a call past the 1,500ms budget is a timeout (budget shrunk here for the test)", async () => {
    const client = createPostioClient({
      apiKey: "pk_test",
      timeoutMs: 20,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    });
    expect(await client.listForPostcode(MINERVA, "k3")).toMatchObject({ reason: "timeout" });
  });

  it("search returns {udprn, suggestion} pairs, udprn as a string", async () => {
    let seenUrl = "";
    const client = createPostioClient({
      apiKey: "pk_test",
      fetchImpl: async (url) => {
        seenUrl = url;
        return new Response(
          JSON.stringify({
            success: true,
            results: [{ udprn: 2003, suggestion: "3 High Street, Exeter EX1 1AA" }],
            meta: { requestId: "req-s" },
          }),
          { status: 200 },
        );
      },
    });
    const found = await client.searchAddresses("3 High Street EX1 1AA", "k4");
    expect(found.ok).toBe(true);
    if (found.ok) {
      expect(found.value).toEqual([{ udprn: "2003", suggestion: "3 High Street, Exeter EX1 1AA" }]);
    }
    expect(seenUrl).toContain("/address/search?q=3%20High%20Street%20EX1%201AA");
  });
});

// ------------------------------------------------------------------
// The suggestions endpoint's guard
// ------------------------------------------------------------------

describe("the rate limiter", () => {
  it("admits up to the limit, then refuses inside the window", () => {
    expect(rateLimitOk("test", 2, 60_000)).toBe(true);
    expect(rateLimitOk("test", 2, 60_000)).toBe(true);
    expect(rateLimitOk("test", 2, 60_000)).toBe(false);
    expect(rateLimitOk("other", 2, 60_000)).toBe(true);
  });
});

// ------------------------------------------------------------------
// BUG-185 — the on-demand supplement (founder-ruled
// 23 Nov 2026): no automatic call anywhere; the click's
// merge dedupes the part-split written forms; the kill
// switch gates the call itself. The two proof postcodes
// are the bug's own: TR10 8AH (the duplicate) and
// CM0 7BE (the control).
// ------------------------------------------------------------------

describe("BUG-185 — the on-demand supplement", () => {
  const TR10 = "TR10 8AH";
  const CM0 = "CM0 7BE";

  function localRow(parts: LoadedAddressParts): ResolvedAddress {
    return { ...parts, label: labelForAddressParts(parts) };
  }

  // The local (EPC-form) rows at TR10 8AH: the flats ride
  // in the PAON and the building's name sits in the
  // street slot.
  const tr10Local: ResolvedAddress[] = [
    localRow({
      postcode: TR10,
      paon: "FLAT B",
      saon: null,
      street: "JUST DELIGHTS",
      locality: null,
      town: "PENRYN",
    }),
    localRow({
      postcode: TR10,
      paon: "FLAT D",
      saon: null,
      street: "JUST DELIGHTS",
      locality: null,
      town: "PENRYN",
    }),
  ];

  // Postio's PAF forms for the same postcode: the
  // building in the PAON, the flat in the SAON, the real
  // street named — plus the building itself and the
  // Telephone Exchange.
  const tr10Postio: PostioAddress[] = [
    {
      udprn: "2001",
      label: "Flat B, Just Delights, Commercial Road",
      parts: {
        postcode: TR10,
        paon: "JUST DELIGHTS",
        saon: "FLAT B",
        street: "COMMERCIAL ROAD",
        locality: null,
        town: "PENRYN",
      },
    },
    {
      udprn: "2002",
      label: "Flat D, Just Delights, Commercial Road",
      parts: {
        postcode: TR10,
        paon: "JUST DELIGHTS",
        saon: "FLAT D",
        street: "COMMERCIAL ROAD",
        locality: null,
        town: "PENRYN",
      },
    },
    {
      udprn: "2003",
      label: "Just Delights, Commercial Road",
      parts: {
        postcode: TR10,
        paon: "JUST DELIGHTS",
        saon: null,
        street: "COMMERCIAL ROAD",
        locality: null,
        town: "PENRYN",
      },
    },
    {
      udprn: "2004",
      label: "Telephone Exchange, Commercial Road",
      parts: {
        postcode: TR10,
        paon: "TELEPHONE EXCHANGE",
        saon: null,
        street: "COMMERCIAL ROAD",
        locality: null,
        town: "PENRYN",
      },
    },
  ];

  it("TR10 8AH: the merged list shows Flat B and Flat D ONCE each", async () => {
    const postio = createFakePostioClient({ postcodes: { [TR10]: tr10Postio } });
    const list = await supplementPickerList({
      postio,
      postcode: TR10,
      local: tr10Local,
      enabled: true,
      req: "x1",
    });
    // Two local flats + the building + the exchange; the
    // two PAF flat forms dedupe against their local twins.
    expect(list.rows).toHaveLength(4);
    expect(list.dedupedCount).toBe(2);
    expect(list.postioCount).toBe(4);
    expect(list.postioFrom).toBe("live");
    const labels = list.rows.map((row) => row.label);
    expect(labels.filter((label) => /Flat B/.test(label))).toHaveLength(1);
    expect(labels.filter((label) => /Flat D/.test(label))).toHaveLength(1);
    // The surviving flat rows are the LOCAL rows (the
    // local form wins a shared home); the building and
    // the exchange arrive as Postio rows.
    expect(list.rows.filter((row) => row.source === "local")).toHaveLength(2);
    expect(list.rows.filter((row) => row.source === "postio").map((row) => row.label)).toEqual(
      expect.arrayContaining([
        "Just Delights, Commercial Road",
        "Telephone Exchange, Commercial Road",
      ]),
    );
    expect(postio.calls).toEqual([{ op: "postcode", arg: TR10 }]);
  });

  it("CM0 7BE (the control): six distinct homes, no duplicates, no losses", async () => {
    const names = ["DHU CRAIGE", "IONA", "POND HOUSE", "SCOTTS HILL FARM"];
    const cm0Local: ResolvedAddress[] = names.map((name) =>
      localRow({
        postcode: CM0,
        paon: name,
        saon: null,
        street: "BURNHAM ROAD",
        locality: null,
        town: "SOUTHMINSTER",
      }),
    );
    const cm0Postio: PostioAddress[] = [...names, "HILLSIDE", "ORCHARD COTTAGE"].map(
      (name, index) => ({
        udprn: `30${index}`,
        label: `${labelForAddressParts({
          postcode: CM0,
          paon: name,
          saon: null,
          street: "BURNHAM ROAD",
          locality: null,
          town: "SOUTHMINSTER",
        })}`,
        parts: {
          postcode: CM0,
          paon: name,
          saon: null,
          street: "BURNHAM ROAD",
          locality: null,
          town: "SOUTHMINSTER",
        },
      }),
    );
    const postio = createFakePostioClient({ postcodes: { [CM0]: cm0Postio } });
    const list = await supplementPickerList({
      postio,
      postcode: CM0,
      local: cm0Local,
      enabled: true,
      req: "x2",
    });
    expect(list.rows).toHaveLength(6);
    expect(list.dedupedCount).toBe(4);
    // The only Postio-sourced rows are the two homes the
    // local list did not hold.
    expect(list.rows.filter((row) => row.source === "postio").map((row) => row.label)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Hillside"),
        expect.stringContaining("Orchard Cottage"),
      ]),
    );
    expect(list.rows.filter((row) => row.source === "postio")).toHaveLength(2);
    expect(new Set(list.rows.map((row) => row.key)).size).toBe(6);
  });

  it("sameHomeParts: the split forms match; neighbours never do", () => {
    const flatBLocal = tr10Local[0];
    const [flatBPaf, flatDPaf, buildingPaf] = tr10Postio.map((row) => row.parts);
    expect(sameHomeParts(flatBLocal, flatBPaf)).toBe(true);
    expect(sameHomeParts(flatBLocal, buildingPaf)).toBe(false);
    expect(sameHomeParts(flatBPaf, flatDPaf)).toBe(false);
    const ten = (street: string): LoadedAddressParts => ({
      postcode: "ZZ1 1ZZ",
      paon: "10",
      saon: null,
      street,
      locality: null,
      town: null,
    });
    expect(sameHomeParts(ten("HIGH STREET"), ten("HIGH STREET"))).toBe(true);
    expect(sameHomeParts(ten("HIGH STREET"), ten("STATION ROAD"))).toBe(false);
  });

  it("the kill switch: parsing pins, and off means no call is possible", async () => {
    expect(postioSupplementEnabled({})).toBe(true);
    expect(postioSupplementEnabled({ POSTIO_SUPPLEMENT_ENABLED: "1" })).toBe(true);
    expect(postioSupplementEnabled({ POSTIO_SUPPLEMENT_ENABLED: "banana" })).toBe(true);
    for (const off of ["0", "false", "off", "no", "FALSE", "Off"]) {
      expect(postioSupplementEnabled({ POSTIO_SUPPLEMENT_ENABLED: off })).toBe(false);
    }
    const postio = createFakePostioClient({ postcodes: { [TR10]: tr10Postio } });
    const list = await supplementPickerList({
      postio,
      postcode: TR10,
      local: tr10Local,
      enabled: false,
      req: "x3",
    });
    expect(postio.calls).toHaveLength(0);
    expect(list.rows).toHaveLength(2);
    expect(list.postioFrom).toBe("not-called");
    expect(
      logsFor("x3").some(
        (l) => l.includes("event=picker.supplement") && l.includes("reason=supplement-off"),
      ),
    ).toBe(true);
  });

  it("one click is one call: a second supplement inside the memory adds none", async () => {
    const postio = createFakePostioClient({ postcodes: { [TR10]: tr10Postio } });
    const first = await supplementPickerList({
      postio,
      postcode: TR10,
      local: tr10Local,
      enabled: true,
      req: "x4",
    });
    const second = await supplementPickerList({
      postio,
      postcode: TR10,
      local: tr10Local,
      enabled: true,
      req: "x4",
    });
    expect(postio.calls).toHaveLength(1);
    expect(first.postioFrom).toBe("live");
    expect(second.postioFrom).toBe("memory");
    expect(second.rows).toHaveLength(first.rows.length);
  });

  it("the list build never calls, at local sizes 0, 1 and 20", () => {
    const twenty: ResolvedAddress[] = Array.from({ length: 20 }, (_, i) =>
      localRow({
        postcode: CM0,
        paon: `${i + 1}`,
        saon: null,
        street: "BURNHAM ROAD",
        locality: null,
        town: "SOUTHMINSTER",
      }),
    );
    for (const local of [[], twenty.slice(0, 1), twenty]) {
      const list = pickerList({ postcode: CM0, local, req: "x5" });
      expect(list.rows).toHaveLength(local.length);
      expect(list.postioFrom).toBe("not-called");
      expect(list.postioCount).toBe(0);
    }
  });

  it("suggestions mark a single postcode's list — and only that", async () => {
    // A full postcode's Homes list carries the marker the
    // search box reads to stand the row up; a fragment
    // (several postcodes) never does.
    const full = await suggestionsFor(BIRKDALE, fixture.source, "x6");
    expect(full.postcodeList).toEqual({ postcode: BIRKDALE });
    const fragment = await suggestionsFor("CM3 2J", fixture.source, "x6");
    expect(fragment.postcodeList).toBeUndefined();
  });
});
