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
// until its gate completes. The gate is one payload —
// /api/check/district — derived server-side from the
// district bundle (lib/district-checking.ts); the bundle
// itself never ships to the browser. The payload call and
// the streamed results share one bundle build through
// the district cache's single-flight, so the lines this
// screen lands are derived from the very bundle the
// results behind it serve.
//
// Honest granularity: the district bundle assembles as
// one build, so the four groups' lines arrive in the
// single payload settlement and complete in feed order
// under the D73 pacing — as the home groups do when
// their parts settle together. No group completes before
// the payload settles, and no completion is a timer
// chain: the timers only space out completions the data
// has already earned. A payload that fails completes
// every group with its named failure line and the
// results still open.
//
// Scotland and Northern Ireland: the payload reports the
// not-covered kind and the screen completes on settlement
// without playing — no groups are drawn complete for a
// check the product does not run, and the streamed
// not-covered results reveal as they land.

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
  type DistrictCheckingPayload,
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

type DistrictPart = { ok: true; payload: DistrictCheckingPayload } | { ok: false } | null;

export default function DistrictCheckingScreen({
  outward,
  children,
}: {
  outward: string;
  children: ReactNode;
}) {
  const [part, setPart] = useState<DistrictPart>(null);
  const [doneCount, setDoneCount] = useState(0);
  const [playedComplete, setPlayedComplete] = useState(false);

  // The payload call. A non-200 or an unreachable call
  // completes every group failed (the outcomes below);
  // an unparsable 200 body completes them the same way
  // without a page_error — the home screen's precedent.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const response = await fetch(`/api/check/district?outward=${encodeURIComponent(outward)}`);
        if (!response.ok) {
          fireJourneyEvent("page_error", {
            error_name: "CheckRequestFailed",
            error_message: `The district part of the check answered HTTP ${response.status}`,
          });
          if (!cancelled) setPart({ ok: false });
          return;
        }
        let parsed: unknown = null;
        try {
          parsed = await response.json();
        } catch {
          parsed = null;
        }
        if (cancelled) return;
        if (parsed !== null && typeof parsed === "object" && "kind" in parsed) {
          setPart({ ok: true, payload: parsed as DistrictCheckingPayload });
        } else {
          setPart({ ok: false });
        }
      } catch {
        fireJourneyEvent("page_error", {
          error_name: "CheckRequestFailed",
          error_message: "The district part of the check could not be reached",
        });
        if (!cancelled) setPart({ ok: false });
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [outward]);

  const payload = part?.ok ? part.payload : null;
  const notCovered = payload?.kind === "not-covered";
  const outcomes = useMemo<Record<DistrictCheckingRowKey, CheckingGroupResult> | null>(() => {
    if (part === null || notCovered) return null;
    if (!part.ok) return districtCheckingFailureOutcomes();
    return part.payload.kind === "district" ? part.payload.groups : null;
  }, [part, notCovered]);

  // A not-covered district completes on settlement,
  // without playing: the streamed not-covered results
  // reveal as they land. The completion is derived from
  // the payload rather than played into state.
  const complete = playedComplete || notCovered;

  // The pacing: a group completes only once its outcome
  // exists, and never sooner than CHECKING_ROW_MS after
  // the previous group completed — the display smoothing
  // that keeps a fast answer readable (D73), never the
  // driver of completion.
  useEffect(() => {
    if (complete || outcomes === null) return;
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
    if (complete || outcomes === null) return;
    if (doneCount < DISTRICT_CHECKING_ROWS.length) return;
    const timer = setTimeout(() => setPlayedComplete(true), CHECKING_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [complete, doneCount, outcomes]);

  if (complete) return <>{children}</>;

  const sealed = doneCount >= DISTRICT_CHECKING_ROWS.length;
  const activeKey =
    outcomes !== null && doneCount < DISTRICT_CHECKING_ROWS.length
      ? DISTRICT_CHECKING_ROWS[doneCount].key
      : null;
  const ticker = sealed
    ? DISTRICT_CHECKING_READY_TICKER
    : doneCount === 0 && outcomes === null
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
  } else if (doneCount > 0 && outcomes !== null) {
    const row = DISTRICT_CHECKING_ROWS[doneCount - 1];
    const outcome = outcomes[row.key];
    if (outcome) announcement = `${row.label} — ${outcome.line}`;
  }

  const postTown = payload?.kind === "district" ? payload.postTown : null;
  const county = payload?.kind === "district" ? payload.county : null;

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
