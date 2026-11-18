// The hybrid brain (entry-point build, 18 Nov 2026;
// decision D72 as adopted in full).
//
// The serve layer's new resolution SOURCE, sitting beside
// the frozen ladder (lib/address.ts is untouched — M7.3's
// rungs, routes and brains do not change). Three movements:
//
//   1. THE PICKER LIST — local as filed first; when the
//      local list at a full postcode is short, Postio's
//      exhaustive postcode list supplements it, merged and
//      deduplicated by normalised parts (a home both filed
//      and in PAF appears once, as the local row). A Postio
//      failure here degrades silently to the local list —
//      the degradation happened before any pick, so no
//      notice is owed (D72 item 3); it is still logged.
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

// When the local list at a postcode holds fewer distinct
// homes than this, it is "short" and Postio supplements
// it. A postcode typically carries 15–30 delivery points;
// filed sales are only the homes that have sold since
// 1995, so a short filed list is a partial list, and the
// hybrid's promise is every address. The constant is a
// build judgement, recorded in docs/entry-point.md.
export const POSTIO_SUPPLEMENT_BELOW = 25;

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
// 1. The picker list
// ------------------------------------------------------------------

export interface PickerListResult {
  rows: PickerRow[];
  localCount: number;
  postioCount: number;
  dedupedCount: number;
  postioFrom: "live" | "memory" | "failed" | "not-called";
}

export async function pickerList(deps: {
  postio: PostioClient;
  postcode: string;
  local: ResolvedAddress[];
  // The route's narrowing, when the ladder narrowed the
  // local list to a street or building: Postio rows are
  // filtered to the same narrowing (word filtering over
  // the merged list's parts).
  narrowing?: { street: string | null; building: string | null };
  req: string;
}): Promise<PickerListResult> {
  const started = entryNow();
  const { postio, postcode, local, req } = deps;
  const rows: PickerRow[] = local.map((address) => ({
    key: partsKey(address),
    label: address.label,
    source: "local" as const,
    homeKey: partsKey(address),
  }));
  const seen = new Set(rows.map((row) => row.key));
  let postioCount = 0;
  let dedupedCount = 0;
  let postioFrom: PickerListResult["postioFrom"] = "not-called";
  let postioReason: string | undefined;

  if (local.length < POSTIO_SUPPLEMENT_BELOW) {
    const list = await postioListFor(postio, postcode, req);
    postioFrom = list.from;
    postioReason = list.reason;
    const streetNorm = deps.narrowing?.street ? normText(deps.narrowing.street) : null;
    const buildingNorm = deps.narrowing?.building ? normText(deps.narrowing.building) : null;
    for (const candidate of list.rows) {
      if (streetNorm && normText(candidate.parts.street ?? "") !== streetNorm) continue;
      if (buildingNorm) {
        const paonName = normText((candidate.parts.paon ?? "").split(",")[0]);
        if (!paonName.includes(buildingNorm) && !buildingNorm.includes(paonName)) continue;
      }
      const key = partsKey(candidate.parts);
      postioCount += 1;
      if (seen.has(key)) {
        dedupedCount += 1;
        continue;
      }
      seen.add(key);
      rows.push({
        key: `postio:${candidate.udprn}`,
        label: candidate.label,
        source: "postio",
        udprn: candidate.udprn,
      });
    }
  }

  logEntry(req, "picker.list", {
    layer: postioCount > 0 ? "hybrid" : "local",
    reason:
      postioFrom === "not-called"
        ? "local-complete"
        : postioFrom === "failed"
          ? `postio-${postioReason ?? "error"}`
          : "merged",
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
