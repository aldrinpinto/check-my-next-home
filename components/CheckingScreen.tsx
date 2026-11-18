"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  CHECKING_ADVANCE_MS,
  CHECKING_INTRO,
  CHECKING_ROWS,
  CHECKING_ROW_MS,
} from "../lib/journey";

// The checking screen — D73 (fold-in build, 17 Nov 2026).
//
// A pure graphic with a purposeful delay, NOT synced to the
// backend: exactly five grouped rows, each showing a
// spinner that flips to "Done" on the graphic's own clock
// (~720ms apart), and a progress bar below the title and
// intro (the sample's order) advancing 20% per completed
// row. There are no failure or
// not-completed states on this screen ever — the Results
// page (its children) carries any "couldn't pull" states.
//
// Reconciliation with the real wiring: the graphic ticks on
// its own clock; the advance happens when the graphic has
// finished AND the real check calls have settled (the same
// three /api/check calls as before — they warm the D29
// cache the server-rendered results behind this screen
// read), whichever is later, plus ~600ms after the fifth
// row. A call that fails still counts as settled: the
// visitor never sees a failure state here, and the results
// derivation names any gap in place. No button, no replay,
// no resting state.

export default function CheckingScreen({
  postcode,
  homeKey,
  heading,
  backHref,
  children,
}: {
  postcode: string;
  homeKey: string | null;
  heading: string;
  backHref: string | null;
  children: ReactNode;
}) {
  const [doneCount, setDoneCount] = useState(0);
  const [dataReady, setDataReady] = useState(false);
  const [complete, setComplete] = useState(false);
  const graphicDoneAt = useRef<number | null>(null);

  // The graphic's own clock: one row completes every
  // CHECKING_ROW_MS until all five are done.
  useEffect(() => {
    if (doneCount >= CHECKING_ROWS.length) {
      if (graphicDoneAt.current === null) graphicDoneAt.current = Date.now();
      return;
    }
    const timer = setTimeout(() => setDoneCount((count) => count + 1), CHECKING_ROW_MS);
    return () => clearTimeout(timer);
  }, [doneCount]);

  // The real wiring: fire the three check calls in parallel
  // and mark the data ready when they have all settled —
  // success or failure alike (see the header: no failure
  // state exists on this screen).
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ postcode });
    if (homeKey) params.set("home", homeKey);
    const calls = ["nearby", "flood", "area"].map(async (part) => {
      try {
        await fetch(`/api/check/${part}?${params.toString()}`);
      } catch {
        // Settled either way — the results page names any
        // gap; this screen never does.
      }
    });
    void Promise.allSettled(calls).then(() => {
      if (!cancelled) setDataReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [postcode, homeKey]);

  // The advance: graphic finished AND data ready, whichever
  // is later, then ~600ms after the fifth row.
  useEffect(() => {
    if (doneCount < CHECKING_ROWS.length || !dataReady || complete) return;
    const timer = setTimeout(() => setComplete(true), CHECKING_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [doneCount, dataReady, complete]);

  if (complete) return <>{children}</>;

  const progressPct = (doneCount / CHECKING_ROWS.length) * 100;

  return (
    <section className="checking" aria-label={heading}>
      <h2>{heading}</h2>
      <p className="checking__intro">{CHECKING_INTRO}</p>
      <div
        className="checking__progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPct}
        aria-label="Check progress"
      >
        <div className="checking__progress-bar" style={{ width: `${progressPct}%` }} />
      </div>
      {backHref && (
        <p className="checking__back">
          <a href={backHref}>Back to the address list</a>
        </p>
      )}
      <ul className="checking__rows">
        {CHECKING_ROWS.map((row, index) => {
          const done = index < doneCount;
          return (
            <li
              key={row.key}
              className="checking__row"
              data-row={row.key}
              data-state={done ? "done" : "checking"}
            >
              <span className="checking__row-label">{row.label}</span>
              <span className="checking__row-qualifier">{row.qualifier}</span>
              <span className="checking__row-state">
                {done ? (
                  "Done"
                ) : (
                  <>
                    <span className="checking__spinner" aria-hidden="true" /> Checking…
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="checking__status" role="status" aria-live="polite">
        {doneCount >= CHECKING_ROWS.length ? "Every check has finished." : "Checks are running."}
      </p>
    </section>
  );
}
