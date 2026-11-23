"use client";

// The wider-area checking screen (founder ruling, 19 Nov
// 2026 — Sample 3, "The Recommendation, Combined", of the
// wider-area checking samples, drawn as Final Sample
// Master view 31).
//
// The district twin of the home checking screen
// (components/CheckingScreen.tsx): the same system — the
// rotating sentence over an evidence feed, completion
// driven by the real data settling, the D73 pacing — on
// the wider area's own centrepiece. Where the home check
// earns a seal (a home, checked), the wider area earns a
// district stamp on a schematic sweep: a place, not a
// home.
//
// The mechanics, recorded in docs/frontend-design-pass.md:
// the page streams the district results in behind this
// screen exactly as the home page streams its results
// behind the checking screen, and this screen holds them
// until its gate completes. The gate is four part calls —
// /api/check/district-<group>, one per group, in the home
// check's per-part pattern (BUG-171) — each derived
// server-side from only that group's slice of the one
// staged district build (lib/district-checking.ts); the
// bundle itself never ships to the browser. The part
// calls and the streamed results share the one build
// through the district cache's single-flight, so the
// lines this screen lands are derived from the very
// bundle the results behind it serve.
//
// Honest granularity: each group completes as its own
// data settles, in feed order under the D73 pacing — a
// group whose sections are quick no longer waits for
// the district's slowest read behind the others. No
// group completes before its own part settles, and no
// completion is a timer chain: the timers only space
// out completions the data has already earned. A part
// that fails completes its own group with its named
// failure line and the results still open.
//
// Scotland and Northern Ireland: a part reports the
// not-covered kind and the screen completes on
// settlement without playing — no groups are drawn
// complete for a check the product does not run, and
// the streamed not-covered results reveal as they land.

import { useEffect, useMemo, useState, type ReactNode } from "react";

import DistrictSweep from "./DistrictSweep";
import {
  DISTRICT_CHECKING_FINAL_LINE,
  DISTRICT_CHECKING_READY_ANNOUNCEMENT,
  DISTRICT_CHECKING_READY_TICKER,
  DISTRICT_CHECKING_ROWS,
  DISTRICT_CHECKING_START_LINE,
  DISTRICT_CHECKING_STEP_DONE,
  DISTRICT_CHECKING_SWEEP_CAPTION,
  districtCheckingFailureOutcomes,
  parseDistrictCheckingGroupValue,
  type DistrictCheckingGroupPayload,
  type DistrictCheckingRowKey,
} from "../lib/district-checking";
import {
  CHECKING_ADVANCE_MS,
  CHECKING_ROW_MS,
  CHECKING_STEP_RUNNING,
  CHECKING_WAITING_LINE,
  type CheckingGroupResult,
} from "../lib/journey";
import { fireJourneyEvent } from "./JourneyBeacon";

// One group's part settlement: the validated payload on
// success, the failure mark on an error status, an
// unreadable or contract-drifting body, or a network
// failure (the home screen's CheckingPart shape).
type DistrictGroupPart =
  { ok: true; value: DistrictCheckingGroupPayload } | { ok: false } | undefined;

export default function DistrictCheckingScreen({
  outward,
  children,
}: {
  outward: string;
  children: ReactNode;
}) {
  const [parts, setParts] = useState<Partial<Record<DistrictCheckingRowKey, DistrictGroupPart>>>(
    {},
  );
  const [doneCount, setDoneCount] = useState(0);
  const [playedComplete, setPlayedComplete] = useState(false);

  // The part calls: the four groups fire in parallel and
  // each settlement is recorded as it lands (the home
  // screen's wiring, part for part). A non-200 or an
  // unreachable call completes that group failed and
  // fires a page_error naming the part; an unparsable or
  // contract-drifting 200 body completes it the same way
  // without a page_error — the home screen's precedent.
  useEffect(() => {
    let cancelled = false;
    const settle = async (
      partName: string,
      group: DistrictCheckingRowKey,
    ): Promise<DistrictGroupPart> => {
      try {
        const response = await fetch(
          `/api/check/${partName}?outward=${encodeURIComponent(outward)}`,
        );
        if (!response.ok) {
          fireJourneyEvent("page_error", {
            error_name: "CheckRequestFailed",
            error_message: `The ${partName} part of the check answered HTTP ${response.status}`,
          });
          return { ok: false };
        }
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          return { ok: false };
        }
        const value = parseDistrictCheckingGroupValue(group, body);
        return value === null ? { ok: false } : { ok: true, value };
      } catch {
        fireJourneyEvent("page_error", {
          error_name: "CheckRequestFailed",
          error_message: `The ${partName} part of the check could not be reached`,
        });
        return { ok: false };
      }
    };
    for (const row of DISTRICT_CHECKING_ROWS) {
      void settle(`district-${row.key}`, row.key).then((part) => {
        if (!cancelled) setParts((prev) => ({ ...prev, [row.key]: part }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [outward]);

  // A not-covered answer from any part completes the
  // screen (the settlement is the build's own gate, so
  // every part carries the same answer; the first to
  // land settles it).
  const notCovered = DISTRICT_CHECKING_ROWS.some((row) => {
    const part = parts[row.key];
    return part?.ok === true && part.value.kind === "not-covered";
  });

  // Each group's outcome exists once its own part has
  // settled: the served line on success, the group's
  // named failure line on failure. Unsettled groups read
  // null — the pacing below never completes a group
  // whose outcome is not there (D73).
  const outcomes = useMemo<Record<DistrictCheckingRowKey, CheckingGroupResult | null>>(() => {
    const failures = districtCheckingFailureOutcomes();
    const record = {} as Record<DistrictCheckingRowKey, CheckingGroupResult | null>;
    for (const row of DISTRICT_CHECKING_ROWS) {
      const part = parts[row.key];
      if (part === undefined) record[row.key] = null;
      else if (!part.ok) record[row.key] = failures[row.key];
      else record[row.key] = part.value.kind === "district" ? part.value.result : null;
    }
    return record;
  }, [parts]);

  // A not-covered district completes on settlement,
  // without playing: the streamed not-covered results
  // reveal as they land. The completion is derived from
  // a part's answer rather than played into state.
  const complete = playedComplete || notCovered;

  // The pacing: a group completes only once its outcome
  // exists, and never sooner than CHECKING_ROW_MS after
  // the previous group completed — the display smoothing
  // that keeps a fast answer readable (D73), never the
  // driver of completion.
  useEffect(() => {
    if (complete) return;
    if (doneCount >= DISTRICT_CHECKING_ROWS.length) return;
    const row = DISTRICT_CHECKING_ROWS[doneCount];
    if (!outcomes[row.key]) return;
    const timer = setTimeout(() => setDoneCount((count) => count + 1), CHECKING_ROW_MS);
    return () => clearTimeout(timer);
  }, [complete, doneCount, outcomes]);

  // The advance: once every group has completed, the
  // screen holds the completed beat briefly (the stamp
  // landed, the settled sentence showing), then reveals.
  useEffect(() => {
    if (complete) return;
    if (doneCount < DISTRICT_CHECKING_ROWS.length) return;
    const timer = setTimeout(() => setPlayedComplete(true), CHECKING_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [complete, doneCount, outcomes]);

  if (complete) return <>{children}</>;

  const sealed = doneCount >= DISTRICT_CHECKING_ROWS.length;
  const activeKey =
    doneCount < DISTRICT_CHECKING_ROWS.length ? DISTRICT_CHECKING_ROWS[doneCount].key : null;
  const anyPartSettled = DISTRICT_CHECKING_ROWS.some((row) => parts[row.key] !== undefined);
  const ticker = sealed
    ? DISTRICT_CHECKING_READY_TICKER
    : doneCount === 0 && !anyPartSettled
      ? DISTRICT_CHECKING_START_LINE
      : DISTRICT_CHECKING_ROWS[Math.min(doneCount, DISTRICT_CHECKING_ROWS.length - 1)].ticker(
          outward,
        );

  // The live region announces milestones only (WCAG
  // 4.1.3): each group's completion as it lands, in the
  // group's own served words, and the final readiness.
  let announcement = "";
  if (sealed) {
    announcement = DISTRICT_CHECKING_READY_ANNOUNCEMENT;
  } else if (doneCount > 0) {
    const row = DISTRICT_CHECKING_ROWS[doneCount - 1];
    const outcome = outcomes[row.key];
    if (outcome) announcement = `${row.label} — ${outcome.line}`;
  }

  // The stamp's place rides the neighbourhood part (its
  // slice carries the head): until that part lands the
  // header names the district alone, as the screen did
  // before the single payload landed.
  const neighbourhoodPart = parts.neighbourhood;
  const postTown =
    neighbourhoodPart?.ok && neighbourhoodPart.value.kind === "district"
      ? neighbourhoodPart.value.postTown
      : null;
  const county =
    neighbourhoodPart?.ok && neighbourhoodPart.value.kind === "district"
      ? neighbourhoodPart.value.county
      : null;

  return (
    <>
      <section className="checking dchecking" aria-label="Checking the wider area">
        <p className="addr-line">
          Wider area · <b>Postcode district</b>
        </p>
        <h1 className="page-title">Checking the wider area…</h1>
        <p className="checking__intro">
          District <b>{outward}</b>
          {postTown ? ` · ${postTown}${county ? `, ${county}` : ""}` : ""}
        </p>
        <p className="checking__ticker">
          <span className="checking__ticker-dot" aria-hidden="true" />
          <span key={ticker} className="checking__ticker-text">
            {ticker}
          </span>
        </p>
        <div className="dchecking__sweep-wrap">
          <DistrictSweep
            clipId="dcheck-clip-screen"
            outward={outward}
            groupsDone={doneCount}
            floodOn={doneCount >= 3}
            stationOn={sealed}
            stampOn={sealed}
            stampBig={outward}
            stampSmall={postTown ? postTown.toUpperCase() : null}
          />
          <p className="dchecking__caption">{DISTRICT_CHECKING_SWEEP_CAPTION}</p>
        </div>
        <div
          className="checking__progress"
          role="progressbar"
          aria-label="Groups complete"
          aria-valuemin={0}
          aria-valuemax={DISTRICT_CHECKING_ROWS.length}
          aria-valuenow={doneCount}
        >
          <div
            className="checking__progress-bar"
            style={{ width: `${(doneCount / DISTRICT_CHECKING_ROWS.length) * 100}%` }}
          />
        </div>
        <p className="checking__stepline">
          <span>
            {sealed
              ? DISTRICT_CHECKING_STEP_DONE
              : doneCount === 0
                ? DISTRICT_CHECKING_START_LINE
                : CHECKING_STEP_RUNNING}
          </span>
          <b>{doneCount > 0 ? `${doneCount} of ${DISTRICT_CHECKING_ROWS.length}` : ""}</b>
        </p>
        <ul className="checking__rows">
          {DISTRICT_CHECKING_ROWS.map((row) => {
            const outcome = outcomes?.[row.key];
            const index = DISTRICT_CHECKING_ROWS.indexOf(row);
            const state =
              outcome && index < doneCount
                ? outcome.state
                : row.key === activeKey
                  ? "active"
                  : "waiting";
            return (
              <li key={row.key} className="checking__row" data-row={row.key} data-state={state}>
                <span className="checking__row-icon" aria-hidden="true">
                  {state === "done" ? (
                    <svg viewBox="0 0 12 12">
                      <path
                        d="M2 6.5 L4.8 9 L10 3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : state === "unavailable" || state === "failed" ? (
                    "!"
                  ) : state === "active" ? (
                    <span className="checking__spinner" />
                  ) : (
                    <span className="checking__pendot" />
                  )}
                </span>
                <span className="checking__row-main">
                  <span className="checking__row-label">{row.label}</span>
                  <span className="checking__row-state">
                    {state === "done" || state === "unavailable" || state === "failed"
                      ? outcome?.line
                      : state === "active"
                        ? row.doing
                        : CHECKING_WAITING_LINE}
                  </span>
                  <span className="checking__row-source">{row.source}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="checking__final" data-visible={sealed ? "true" : undefined}>
          {DISTRICT_CHECKING_FINAL_LINE}
        </p>
        <p className="visually-hidden" role="status">
          {announcement}
        </p>
      </section>
      <div hidden>{children}</div>
    </>
  );
}
