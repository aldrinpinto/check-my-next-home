"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  CHECKING_INTRO,
  CHECKING_ROWS,
  rowFailureLine,
  type CheckingRowKey,
  type RowResult,
} from "../lib/journey";

// The checking screen (plan step M7.3; the Final Design's
// Stop W3 mock, founder ruling at M6.23). It has no URL of
// its own: it renders on the home form and is replaced in
// place by the holding results view (its children) when
// every row reaches a terminal state.
//
// The nine rows complete as the real answers resolve — the
// three brain calls fire in parallel, there is no simulated
// staggering and no artificial delay (the step's own
// honesty rule). A row ends in exactly one of three states:
// done; named-unavailable, carrying the line its bundle
// serves (D30); or named-failure, when its call failed
// outright — and the results still open (D44(5)(ii)). A
// cold postcode's long first check is carried here with
// rows in their checking states and no give-up point
// (D44(5)(i)): nothing on this screen ever times out into
// giving up.

type RowStatus = "checking" | "done" | "unavailable" | "failed";

interface RowView {
  status: RowStatus;
  line: string | null;
  elements?: RowResult["elements"];
}

// The minimum readable hold (founder ruling, 17 Nov 2026,
// carried by D70): once every row has completed — truthfully,
// as the brains resolved — the finished screen holds for
// this long before the results open, so the completed rows
// can actually be read. The hold delays only the advance;
// no row ever waits on it, and nothing is staggered.
const ADVANCE_BEAT_MS = 2_000;

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
  const [rows, setRows] = useState<Record<CheckingRowKey, RowView>>(() => {
    const initial = {} as Record<CheckingRowKey, RowView>;
    for (const row of CHECKING_ROWS) initial[row.key] = { status: "checking", line: null };
    return initial;
  });
  const [complete, setComplete] = useState(false);
  const advancedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ postcode });
    if (homeKey) params.set("home", homeKey);

    const apply = (keys: CheckingRowKey[], results: Record<string, RowResult> | null) => {
      if (cancelled) return;
      setRows((current) => {
        const next = { ...current };
        for (const key of keys) {
          const result = results?.[key];
          next[key] = result
            ? { status: result.state, line: result.line, elements: result.elements }
            : {
                status: "failed",
                line: rowFailureLine(CHECKING_ROWS.find((r) => r.key === key)?.label ?? key),
              };
        }
        return next;
      });
    };

    const call = async (
      part: "nearby" | "flood" | "area",
      keys: CheckingRowKey[],
      pick: (data: Record<string, unknown>) => Record<string, RowResult> | null,
    ) => {
      try {
        const response = await fetch(`/api/check/${part}?${params.toString()}`);
        if (!response.ok) throw new Error(`check-${part}-${response.status}`);
        const data = (await response.json()) as Record<string, unknown>;
        apply(keys, pick(data));
      } catch {
        apply(keys, null);
      }
    };

    void call(
      "nearby",
      ["schools", "nurseries", "health", "hospitals", "parks", "shops", "food"],
      (data) =>
        data.rows && typeof data.rows === "object"
          ? (data.rows as Record<string, RowResult>)
          : null,
    );
    void call("flood", ["flood"], (data) => (data.row ? { flood: data.row as RowResult } : null));
    void call("area", ["history"], (data) =>
      data.row ? { history: data.row as RowResult } : null,
    );

    return () => {
      cancelled = true;
    };
  }, [postcode, homeKey]);

  const allTerminal = CHECKING_ROWS.every((row) => rows[row.key].status !== "checking");

  useEffect(() => {
    if (!allTerminal || advancedRef.current) return;
    advancedRef.current = true;
    // The readable hold (see ADVANCE_BEAT_MS): the rows
    // themselves never wait on it; it is not a simulated
    // delay in any check.
    const timer = setTimeout(() => setComplete(true), ADVANCE_BEAT_MS);
    return () => clearTimeout(timer);
  }, [allTerminal]);

  if (complete) return <>{children}</>;

  return (
    <section className="checking" aria-label={heading}>
      <h2>{heading}</h2>
      <p className="checking__intro">{CHECKING_INTRO}</p>
      {backHref && (
        <p className="checking__back">
          <a href={backHref}>Back to the address list</a>
        </p>
      )}
      <ul className="checking__rows">
        {CHECKING_ROWS.map((row) => {
          const view = rows[row.key];
          return (
            <li key={row.key} className="checking__row" data-row={row.key} data-state={view.status}>
              <span className="checking__row-label">{row.label}</span>
              <span className="checking__row-state">
                {view.status === "checking" && "Checking…"}
                {/* The done state carries its tick in the word
                    itself (D70) — never colour alone. */}
                {view.status === "done" && "Done ✓"}
                {view.status === "unavailable" && (view.line ?? "Not available for this home")}
                {view.status === "failed" && view.line}
              </span>
              {view.status === "done" && view.line && (
                <span className="checking__row-line">{view.line}</span>
              )}
              {view.elements && view.elements.length > 0 && (
                <ul className="checking__elements">
                  {view.elements.map((element) => (
                    <li key={element.label} data-element={element.label} data-state={element.state}>
                      <span className="checking__element-label">{element.label}</span>
                      <span className="checking__element-state">
                        {element.state === "done" ? "Done ✓" : (element.line ?? "Not available")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <p className="checking__status" role="status" aria-live="polite">
        {allTerminal ? "Every check has finished." : "Checks are running."}
      </p>
    </section>
  );
}
