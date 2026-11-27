// Re-fetch short pages, then a 1% read tolerance (BUG-387, founder-ordered
// 27 Nov 2026).
//
// THE PROBLEM: a loader's read can end short of the count its source
// promised — a page that came back truncated, a file that stopped early —
// and today the run dies after hours of reading, even when the shortfall
// is a handful of features. Two mechanisms, in order, before the run
// gives up:
//
//   (a) RE-FETCH: a page (or chunk) that returns fewer items than the
//       read asked for while more remain is re-requested ONCE, in place,
//       through the loader's own fetch — which already carries the
//       BUG-384/385 transient retry, so a failed re-fetch retries
//       exactly like a failed first fetch. A page that stays short is
//       accepted as short and the read continues from where it ended:
//       with offset paging the next request starts after the features
//       actually returned, so nothing is skipped twice. One re-fetch
//       per short page, never a loop.
//   (b) TOLERANCE: after the re-fetch pass, a read that lands within
//       1% below the expected count is accepted and filed — but LOUDLY:
//       the run summary and the progress log both carry the shortfall
//       (features missing, which pages were re-fetched, final read vs
//       expected). A shortfall over 1% still fails exactly as today:
//       nothing filed, the live layer untouched (BUG-248 atomicity).
//       An OVERSHOOT (read above expected — duplicated features) is
//       never tolerated.
//
// What stays EXACT: the ±10% sanity band against the snapshot, the
// reconciliation (filed + geoless == read), and the golden checks.
// The tolerance relaxes ONLY read-vs-expected, after the re-fetch.
//
// The re-fetch only has a home where a short unit is identifiable —
// a paged API read, a per-file chunk. Loaders whose expected is the
// read itself (self-derived counts, whole-file downloads with no
// independent total) have nothing to compare against, so no tolerance
// applies to them; their survey verdicts are recorded in the BUG-387
// build report, not here.

import { formatCount } from "./progress.mjs";

// BUG-387: the read may land this far below the expected count, after
// the re-fetch pass, and still file. A fraction, not a count, so it
// scales from a 374-row register to a 415,408-feature read.
export const READ_TOLERANCE_FRACTION = 0.01;

/**
 * One short page (or chunk) in a read, as the tracker records it.
 * @typedef {object} ShortPageRecord
 * @property {number} startIndex - the page's offset into the read (for a
 *   per-file chunk, the chunk's ordinal).
 * @property {number} want - how many items the read asked for.
 * @property {number} returned - how many the page actually returned.
 * @property {boolean} refetched - whether the one re-fetch ran.
 * @property {number} recovered - features the re-fetch added over the
 *   first attempt (0 when it returned the same count or fewer).
 */

/**
 * A read's whole short-page record.
 * @typedef {object} ShortReadSummary
 * @property {ShortPageRecord[]} pages
 * @property {number} refetched - how many short pages were re-fetched.
 * @property {number} recovered - features the re-fetches added in total.
 */

/**
 * @typedef {object} ShortPageTracker
 * @property {ShortPageRecord[]} pages
 * @property {(page: { startIndex: number, want: number, returned: number }) => void} note
 * @property {(refetch: { startIndex: number, returned: number }) => void} recordRefetch
 * @property {() => ShortReadSummary} summary
 */

// A page is short when it returns fewer features than the read asked
// for while more remain: returned < want AND read + returned <
// expected. The final page legitimately returns the remainder, so it
// is never short — and a page that returns nothing is a failed page,
// not a short one (the loader's own fetch throws for it).
/**
 * @param {{ returned: number, want: number, read: number, expected: number }} page
 * @returns {boolean}
 */
export function isShortPage({ returned, want, read, expected }) {
  if (
    !Number.isInteger(returned) ||
    !Number.isInteger(want) ||
    !Number.isInteger(read) ||
    !Number.isInteger(expected)
  )
    return false;
  if (returned <= 0 || want <= 0 || expected <= 0) return false;
  return returned < want && read + returned < expected;
}

// Shortfall-only tolerance: the read may land up to 1% below the
// expected count. An exact read is not a shortfall (it passes the
// gate outright), and an overshoot is never tolerated — duplicated
// features must fail, not file.
/**
 * @param {number} read
 * @param {number} expected
 * @returns {boolean}
 */
export function withinOnePercent(read, expected) {
  if (!Number.isInteger(read) || !Number.isInteger(expected) || expected <= 0) return false;
  if (read >= expected) return false;
  return read * 100 >= expected * 99;
}

// The gate decision after the re-fetch pass. accepted is true when
// the read reconciles exactly, or lands inside the tolerance;
// withinTolerance is true only when the tolerance is what accepted
// it (the caller must log that LOUDLY — see shortReadNotice).
// shortfall is expected - read: positive when short, negative on
// overshoot, zero on an exact read.
/**
 * @param {{ read: number, expected: number }} counts
 * @returns {{ accepted: boolean, shortfall: number, withinTolerance: boolean }}
 */
export function assessShortRead({ read, expected }) {
  const shortfall = expected - read;
  if (read === expected) return { accepted: true, shortfall: 0, withinTolerance: false };
  if (withinOnePercent(read, expected)) return { accepted: true, shortfall, withinTolerance: true };
  return { accepted: false, shortfall, withinTolerance: false };
}

// The record of a read's short pages, for the re-fetch pass and the
// loud log. note() is called when a page first comes back short;
// recordRefetch() when its one re-fetch returns. recovered counts
// only features the re-fetch ADDED over the first attempt — a
// re-fetch that returns the same count or fewer recovers nothing,
// and the read keeps the fuller first page.
/**
 * @returns {ShortPageTracker}
 */
export function createShortPageTracker() {
  const pages = [];
  return {
    pages,
    note({ startIndex, want, returned }) {
      pages.push({ startIndex, want, returned, refetched: false, recovered: 0 });
    },
    recordRefetch({ startIndex, returned }) {
      const page = pages.find((p) => p.startIndex === startIndex && !p.refetched);
      if (!page) return;
      page.refetched = true;
      page.recovered = Math.max(0, returned - page.returned);
    },
    summary() {
      return {
        pages: pages.map((p) => ({ ...p })),
        refetched: pages.filter((p) => p.refetched).length,
        recovered: pages.reduce((sum, p) => sum + p.recovered, 0),
      };
    },
  };
}

// The loud record of a short read, for the progress log and the run
// summary — features missing, which pages were re-fetched, final
// read vs expected. Returned only when the tolerance is what
// accepted the read (or the caller asks for the failure line):
// an exact read earns no notice at all.
/**
 * @param {{ label: string, read: number, expected: number, refetch?: ShortReadSummary | null }} notice
 * @returns {string}
 */
export function shortReadNotice({ label, read, expected, refetch = null }) {
  const shortfall = expected - read;
  const pct = ((shortfall / expected) * 100).toFixed(2);
  const refetchBit =
    refetch && refetch.refetched > 0
      ? ` after re-fetching ${refetch.refetched} short page${refetch.refetched === 1 ? "" : "s"} ` +
        `(startIndex ${refetch.pages
          .filter((p) => p.refetched)
          .map((p) => formatCount(p.startIndex))
          .join(", ")}), recovered ${formatCount(refetch.recovered)} features`
      : " (no short pages re-fetched)";
  return (
    `read ${formatCount(read)} of ${formatCount(expected)} expected ${label} features — ` +
    `short ${formatCount(shortfall)} (${pct}%)${refetchBit} — accepted within the 1% tolerance (BUG-387)`
  );
}

// The read-vs-expected gate, shared by the loaders with an independent
// expected count: the read-vs-expected check with the 1% tolerance
// after the re-fetch, and the reconciliation. The ±10% sanity band
// against the snapshot is NOT here — it stays inline in each loader,
// exactly as before, because the loaders' fail-closed tests pin its
// wording in the loader source. Throws with the loader's own wording
// on failure; returns { shortfall, withinTolerance, notice } on
// success — notice is the loud line, non-null only when the
// tolerance accepted the read, and the caller MUST log it (a
// progress warning line AND the run summary) before filing.
// refetch is the tracker's summary, or null when the read has no pages.
/**
 * @param {{ label: string, read: number, expected: number, filed: number, geoless: number, refetch?: ShortReadSummary | null }} gate
 * @returns {{ shortfall: number, withinTolerance: boolean, notice: string | null }}
 */
export function verifyReadCounts({ label, read, expected, filed, geoless, refetch = null }) {
  const assessment = assessShortRead({ read, expected });
  if (!assessment.accepted) {
    const refetchBit =
      refetch && refetch.refetched > 0
        ? `re-fetched ${refetch.refetched} short page${refetch.refetched === 1 ? "" : "s"}, ` +
          `still short by ${assessment.shortfall} — `
        : "";
    throw new Error(
      `${label}: read ${read} features but the service count is ${expected} — ${refetchBit}nothing filed`,
    );
  }
  if (filed + geoless !== read)
    throw new Error(`${label}: the processed counts do not reconcile — nothing filed`);
  const withinTolerance = assessment.withinTolerance;
  return {
    shortfall: assessment.shortfall,
    withinTolerance,
    notice: withinTolerance ? shortReadNotice({ label, read, expected, refetch }) : null,
  };
}
