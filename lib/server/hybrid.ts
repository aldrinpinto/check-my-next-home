// The hybrid brain (entry-point build, 18 Nov 2026;
// decision D72 as adopted in full; the list movement
// re-ruled by the founder, 23 Nov 2026 — BUG-185).
//
// The serve layer's new resolution SOURCE, sitting beside
// the frozen ladder (lib/address.ts is untouched — M7.3's
// rungs, routes and brains do not change). Three movements:
//
//   1. THE PICKER LIST — local as filed, ALWAYS. No Postio
//      call ever happens on a list build: the automatic
//      supplement (the floor-of-5 trigger) is abolished.
//      The wider list is fetched only when the visitor
//      clicks the "Don't see your home?" row inside a
//      dropdown that lists one postcode's homes — one
//      deliberate click, one call (supplementPickerList
//      below), the list refreshing in place, merged and
//      deduplicated by home identity (a home both filed
//      and in PAF appears once, as the local row). A
//      Postio failure on that click degrades silently to
//      the list as it stands — the visitor sees the done
//      state either way, no notice is owed (D72 item 3);
//      it is still logged. The row itself is gated by the
//      kill switch POSTIO_SUPPLEMENT_ENABLED: off, the
//      row disappears everywhere and no supplement call
//      is possible at all.
//   2. THE PICK — a local row navigates by its home key,
//      exactly as before. A Postio row resolves at pick
//      time into a transient record (founder-ruled, 24h
//      TTL) and navigates by its token. A pick that cannot
//      resolve — Postio down, out of credit, the row gone —
//      falls back to the whole-postcode check WITH the
//      mid-pick notice (gap item 5).
//   3. PROMOTION — once a Postio pick's own check has cold-
//      loaded the postcode's filings and the home is among
//      them, the home's canonical key takes over: the
//      caller redirects to it and the record lapses.
//
// Every movement logs its layer decision (lib/server/
// entry-log.ts) under the caller's request id: a developer
// can grep one request id and see which layer answered,
// why, and how long it took.
//
// Postio lists are held in a short in-process memory
// (minutes) keyed by postcode: postcode-mode charging
// means re-listing a postcode re-charges, and back-and-
// forth navigation inside a few minutes must not pay
// twice. Anything longer-lived would be storage, which is
// the transient record's ruled shape or nothing (gap
// item 10).

import {
  compareAddressParts,
  labelForAddressParts,
  normalisePostcode,
  type LoadedAddressParts,
  type ResolvedAddress,
} from "../address";
import { homeKeyOf } from "../bundle-cache";
import { PICK_FALLBACK_FLAG, homeRoute } from "../journey";
import { entryNow, logEntry } from "./entry-log";
import type { PostioAddress, PostioClient } from "./postio";
import type { ResolveRecordStore } from "./resolve-records";

// The supplement's kill switch (BUG-185, founder-ruled
// 23 Nov 2026): POSTIO_SUPPLEMENT_ENABLED in the server
// env, default ON. It gates the "Don't see your home?"
// ROW ITSELF on both surfaces — off, the row is not
// rendered anywhere and the supplement endpoint makes no
// Postio call at all. Only an explicit off value (0,
// false, off, no — any casing, whitespace tolerated)
// turns it off; an unset or unrecognised value leaves
// the ruled default standing.
export function postioSupplementEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = (env.POSTIO_SUPPLEMENT_ENABLED ?? "").trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off" || raw === "no");
}

// The in-process Postio list memory's lifetime.
export const POSTIO_LIST_MEMORY_MS = 5 * 60 * 1000;

// The route flag the mid-pick fallback carries lives with
// the journey's copy (lib/journey.ts, PICK_FALLBACK_FLAG).

// ------------------------------------------------------------------
// Shared shapes
// ------------------------------------------------------------------

// One picker row, from either layer. A local row carries
// its home key; a Postio row carries the UDPRN a pick
// resolves by. The picker renders both identically.
export interface PickerRow {
  key: string;
  label: string;
  source: "local" | "postio";
  homeKey?: string;
  udprn?: string;
}

// The normalised-parts key two rows dedupe by — the home
// key itself, computed from parts alone (homeKeyOf's
// rung-1 branch reads only the parts).
export function partsKey(parts: LoadedAddressParts): string {
  return homeKeyOf({
    rung: 1,
    kind: "home",
    address: { ...parts, label: labelForAddressParts(parts) },
    directory: null as never,
  });
}

function normText(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// ------------------------------------------------------------------
// The Postio list memory (in-process, minutes)
// ------------------------------------------------------------------

interface ListMemoryEntry {
  at: number;
  rows: PostioAddress[];
}

// The memory is anchored to globalThis (the standard
// Next.js pattern for state shared across bundle
// instances), NOT held in a module-level Map. Bug fix,
// 18 Nov 2026: the play server's entry log showed a
// KT17 1FH list served live at 10:56:17 and a pick for one
// of its rows 53 seconds later resolving via=udprn-call —
// it PAID inside the 5-minute TTL. The logic was correct
// and pinned; the serving runtime simply did not share
// one module instance (and so not one Map) between the
// /search render and the /api/pick route — the production
// bundle had split the module, each instance with its own
// empty memory. Anchored here, every instance of this
// module reads and writes the ONE memory.
const globalScope = globalThis as typeof globalThis & {
  __cmnhPostioListMemory?: Map<string, ListMemoryEntry>;
};
const listMemory: Map<string, ListMemoryEntry> = (globalScope.__cmnhPostioListMemory ??= new Map<
  string,
  ListMemoryEntry
>());

// Keys are the normalised postcode, identically on write
// and on read, so "KT171FH" and "KT17 1FH" share one
// entry. A string that does not normalise keys as itself.
function listMemoryKey(postcode: string): string {
  return normalisePostcode(postcode) ?? postcode;
}

// Test hook: forget every remembered list.
export function resetPostioListMemory(): void {
  listMemory.clear();
}

async function postioListFor(
  postio: PostioClient,
  postcode: string,
  req: string,
): Promise<{ rows: PostioAddress[]; from: "live" | "memory" | "failed"; reason?: string }> {
  const hit = listMemory.get(listMemoryKey(postcode));
  if (hit && Date.now() - hit.at < POSTIO_LIST_MEMORY_MS) {
    return { rows: hit.rows, from: "memory" };
  }
  const outcome = await postio.listForPostcode(postcode, req);
  if (!outcome.ok) return { rows: [], from: "failed", reason: outcome.reason };
  listMemory.set(listMemoryKey(postcode), { at: Date.now(), rows: outcome.value });
  return { rows: outcome.value, from: "live" };
}

// A remembered row by UDPRN, for a pick that arrives while
// the list is still warm — no second Postio call.
export function rememberedPostioRow(postcode: string, udprn: string): PostioAddress | null {
  const hit = listMemory.get(listMemoryKey(postcode));
  if (!hit || Date.now() - hit.at >= POSTIO_LIST_MEMORY_MS) return null;
  return hit.rows.find((row) => row.udprn === udprn) ?? null;
}

// ------------------------------------------------------------------
// 1. The picker list — and the on-demand supplement
// ------------------------------------------------------------------

export interface PickerListResult {
  rows: PickerRow[];
  localCount: number;
  postioCount: number;
  dedupedCount: number;
  postioFrom: "live" | "memory" | "failed" | "not-called";
}

// The local list, in natural address order, exactly as
// filed. This is the ONLY list a page load or a keystroke
// ever builds (BUG-185): it takes no Postio client
// because it never calls one, at any list size.
export function pickerList(deps: {
  postcode: string;
  local: ResolvedAddress[];
  req: string;
}): PickerListResult {
  const started = entryNow();
  const { postcode, local, req } = deps;
  const merged: { row: PickerRow; parts: LoadedAddressParts }[] = local.map((address) => ({
    row: {
      key: partsKey(address),
      label: address.label,
      source: "local" as const,
      homeKey: partsKey(address),
    },
    parts: address,
  }));
  merged.sort((x, y) => compareAddressParts(x.parts, y.parts));
  const rows = merged.map((entry) => entry.row);

  logEntry(req, "picker.list", {
    layer: "local",
    reason: "local-complete",
    ms: entryNow() - started,
    postcode,
    local: local.length,
    postio: 0,
    deduped: 0,
    postioFrom: "not-called",
  });

  return {
    rows,
    localCount: local.length,
    postioCount: 0,
    dedupedCount: 0,
    postioFrom: "not-called",
  };
}

// ------------------------------------------------------------------
// Home identity across part-split written forms (BUG-185)
// ------------------------------------------------------------------
//
// The merge's dedupe used to key rows by their exact
// parts (paon | saon | street), which holds only while
// every source splits an address the same way. They do
// not: the picking index's EPC-derived form can carry the
// flat in the PAON and the building's name in the STREET
// slot ("FLAT B" / street "JUST DELIGHTS"), where PAF
// carries the building in the PAON and the flat in the
// SAON ("JUST DELIGHTS" / "FLAT B" / street "COMMERCIAL
// ROAD") — the same home under two different keys, served
// twice (the founder's TR10 8AH finding, 23 Nov 2026).
// The predicate below recognises the same home across
// those splits. It is deliberately pairwise — a canonical
// key cannot know which slot the OTHER form put the
// building's name in — and it is conservative: the unit
// must agree exactly, a street number carried on both
// sides must agree, and a name/street disagreement is a
// match only under the split signature (one side's name
// is the other side's street).

const UNIT_WORDS = new Set(["FLAT", "APARTMENT", "APT", "UNIT", "MAISONETTE"]);
const PURE_UNIT_RE = /^(?:FLAT|APARTMENT|APT|UNIT|MAISONETTE)\s+([0-9]+[A-Z]?|[A-Z])$/;

function tokenSet(value: string | null): Set<string> {
  if (!value) return new Set();
  return new Set(normText(value).split(" ").filter(Boolean));
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const token of a) if (!b.has(token)) return false;
  return true;
}

// The home's unit designator, wherever the form put it:
// the SAON when there is one (its leading unit word is
// dress, not identity — "FLAT 4" and "4" are one unit),
// else a PAON that is nothing but a unit ("FLAT B").
// Null when the home carries no unit at all.
function unitKeyOf(parts: LoadedAddressParts): string | null {
  const saon = normText(parts.saon ?? "");
  if (saon) {
    const tokens = saon.split(" ").filter(Boolean);
    if (tokens.length > 1 && UNIT_WORDS.has(tokens[0])) tokens.shift();
    return tokens.join(" ");
  }
  const paon = normText(parts.paon ?? "");
  const pure = PURE_UNIT_RE.exec(paon);
  return pure ? pure[1] : null;
}

// The PAON read as (name, number) once a pure-unit PAON
// is accounted for: a PAON that IS the unit contributes
// neither a name nor a number.
function paonNameAndNumber(parts: LoadedAddressParts): {
  name: Set<string>;
  number: string | null;
} {
  const paon = normText(parts.paon ?? "");
  if (PURE_UNIT_RE.test(paon)) return { name: new Set(), number: null };
  const tokens = paon.split(" ").filter(Boolean);
  const numberIdx = tokens.findIndex((token) => /^[0-9]+[A-Z]?$/.test(token));
  const number = numberIdx === -1 ? null : tokens[numberIdx];
  const name = new Set(tokens.filter((_, i) => i !== numberIdx));
  return { name, number };
}

// True when two part sets name the SAME home within one
// postcode, across the part-split written forms the
// sources use. Both sides are read independently; the
// postcode itself is the caller's bound (the merge only
// ever compares rows of one postcode).
export function sameHomeParts(a: LoadedAddressParts, b: LoadedAddressParts): boolean {
  // The unit must agree exactly — a flat and its building
  // are different homes, and two flats of one building
  // differ only here.
  if (unitKeyOf(a) !== unitKeyOf(b)) return false;

  const pa = paonNameAndNumber(a);
  const pb = paonNameAndNumber(b);
  // A street number both sides carry must agree.
  if (pa.number !== null && pb.number !== null && pa.number !== pb.number) return false;

  const streetA = tokenSet(a.street);
  const streetB = tokenSet(b.street);

  if (setsEqual(pa.name, pb.name)) {
    if (pa.name.size === 0) {
      // Numbered (or numberless) houses: the street is
      // the identity that remains — same number on two
      // streets of one postcode is two homes.
      return setsEqual(streetA, streetB);
    }
    // The same building/house name on both sides. The
    // streets may differ only by the split signature —
    // one side's street IS the shared name (the EPC form
    // that parks the building in the street slot) — or
    // by one side carrying no street at all.
    if (setsEqual(streetA, streetB)) return true;
    if (streetA.size === 0 || streetB.size === 0) return true;
    return setsEqual(streetA, pa.name) || setsEqual(streetB, pa.name);
  }

  // The names differ: a match only under the split
  // signature — one side carries no name of its own and
  // its street is the other side's name (the flat-in-PAON
  // form), or one side's name is the other side's street.
  if (pa.name.size === 0 && setsEqual(streetA, pb.name)) return true;
  if (pb.name.size === 0 && setsEqual(streetB, pa.name)) return true;
  if (setsEqual(pa.name, streetB) || setsEqual(pb.name, streetA)) return true;
  return false;
}

// ------------------------------------------------------------------
// The on-demand supplement (BUG-185)
// ------------------------------------------------------------------

// The merged list after the visitor's one deliberate
// click on the "Don't see your home?" row: exactly one
// Postio list fetch (the 5-minute list memory may answer
// it — re-listing a postcode re-charges, and the ruled
// retention is unchanged), merged over the local list and
// deduped by home identity (sameHomeParts), the local
// row winning every shared home. With the kill switch
// off, no call is made at all and the local list stands.
// A failed call returns the local list standing — the
// caller settles the row to its done state over it, and
// the failure lives only in this log.
export async function supplementPickerList(deps: {
  postio: PostioClient;
  postcode: string;
  local: ResolvedAddress[];
  // The route's narrowing, when the ladder narrowed the
  // local list to a street or building: Postio rows are
  // filtered to the same narrowing (word filtering over
  // the merged list's parts).
  narrowing?: { street: string | null; building: string | null };
  // The kill switch (postioSupplementEnabled): false
  // means no call is possible, whatever the client asks.
  enabled: boolean;
  req: string;
}): Promise<PickerListResult> {
  const started = entryNow();
  const { postio, postcode, local, req } = deps;
  const merged: { row: PickerRow; parts: LoadedAddressParts }[] = local.map((address) => ({
    row: {
      key: partsKey(address),
      label: address.label,
      source: "local" as const,
      homeKey: partsKey(address),
    },
    parts: address,
  }));
  let postioCount = 0;
  let dedupedCount = 0;

  if (!deps.enabled) {
    merged.sort((x, y) => compareAddressParts(x.parts, y.parts));
    logEntry(req, "picker.supplement", {
      layer: "local",
      reason: "supplement-off",
      ms: entryNow() - started,
      postcode,
      local: local.length,
      postio: 0,
      deduped: 0,
      postioFrom: "not-called",
    });
    return {
      rows: merged.map((entry) => entry.row),
      localCount: local.length,
      postioCount,
      dedupedCount,
      postioFrom: "not-called",
    };
  }

  const list = await postioListFor(postio, postcode, req);
  const postioFrom = list.from;
  const postioReason = list.reason;
  const streetNorm = deps.narrowing?.street ? normText(deps.narrowing.street) : null;
  const buildingNorm = deps.narrowing?.building ? normText(deps.narrowing.building) : null;
  for (const candidate of list.rows) {
    if (streetNorm && normText(candidate.parts.street ?? "") !== streetNorm) continue;
    if (buildingNorm) {
      const paonName = normText((candidate.parts.paon ?? "").split(",")[0]);
      if (!paonName.includes(buildingNorm) && !buildingNorm.includes(paonName)) continue;
    }
    postioCount += 1;
    if (merged.some((entry) => sameHomeParts(entry.parts, candidate.parts))) {
      dedupedCount += 1;
      continue;
    }
    merged.push({
      row: {
        key: `postio:${candidate.udprn}`,
        label: candidate.label,
        source: "postio",
        udprn: candidate.udprn,
      },
      parts: candidate.parts,
    });
  }

  // ONE merged list in natural address order
  // (compareAddressParts, founder fix 18 Nov 2026): the
  // layers decide which homes are IN the list and, at the
  // dedupe above, whose form a shared home takes — never
  // a display grouping. A Postio 3 sorts between a local
  // 2 and a local 10, where a visitor expects it.
  merged.sort((x, y) => compareAddressParts(x.parts, y.parts));
  const rows = merged.map((entry) => entry.row);

  logEntry(req, "picker.supplement", {
    layer: postioCount > 0 ? "hybrid" : "local",
    reason: postioFrom === "failed" ? `postio-${postioReason ?? "error"}` : "merged",
    ms: entryNow() - started,
    postcode,
    local: local.length,
    postio: postioCount,
    deduped: dedupedCount,
    postioFrom,
  });

  return { rows, localCount: local.length, postioCount, dedupedCount, postioFrom };
}

// ------------------------------------------------------------------
// 2. The pick
// ------------------------------------------------------------------

export type PickResult =
  | { kind: "transient"; url: string; token: string }
  | { kind: "fallback"; url: string; reason: string };

// The whole-postcode destination a failed pick lands on,
// carrying the notice flag.
export function pickFallbackUrl(postcode: string): string {
  const params = new URLSearchParams({ postcode, notfound: PICK_FALLBACK_FLAG });
  return `/search/home?${params.toString()}`;
}

export async function resolvePick(deps: {
  postio: PostioClient;
  store: ResolveRecordStore;
  postcode: string;
  udprn: string;
  req: string;
}): Promise<PickResult> {
  const started = entryNow();
  const { postio, store, postcode, udprn, req } = deps;

  // The parts come from the warm list memory when it holds
  // the row (the normal path — the visitor just saw this
  // list); otherwise the pick is the one billable UDPRN
  // resolve.
  let address = rememberedPostioRow(postcode, udprn);
  let via = "memory";
  if (!address) {
    const outcome = await postio.byUdprn(udprn, req);
    if (!outcome.ok) {
      logEntry(req, "pick.resolved", {
        layer: "fallback",
        reason: `postio-${outcome.reason}`,
        ms: entryNow() - started,
        postcode,
        udprn,
      });
      return { kind: "fallback", url: pickFallbackUrl(postcode), reason: outcome.reason };
    }
    address = outcome.value;
    via = "udprn-call";
  }

  const record = await store.create({ postcode, parts: address.parts, udprn });
  logEntry(req, "transient.created", {
    layer: "transient",
    reason: "pick",
    ms: entryNow() - started,
    postcode,
    udprn,
    via,
  });
  logEntry(req, "pick.resolved", {
    layer: "postio",
    reason: "resolved",
    ms: entryNow() - started,
    postcode,
    udprn,
    via,
  });
  return { kind: "transient", url: homeRoute(postcode, record.token), token: record.token };
}

// ------------------------------------------------------------------
// 3. Promotion
// ------------------------------------------------------------------

// If the record's home is now among the postcode's filed
// addresses, its canonical home key; otherwise null. The
// caller owns the redirect and the record's deletion —
// this is the pure decision, tested as such.
export function promotionKeyFor(
  parts: LoadedAddressParts,
  filed: LoadedAddressParts[],
): string | null {
  const wanted = partsKey(parts);
  for (const row of filed) {
    if (partsKey(row) === wanted) return wanted;
  }
  return null;
}
