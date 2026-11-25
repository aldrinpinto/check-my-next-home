"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  CHECKING_ADVANCE_MS,
  CHECKING_FINAL_LINE,
  CHECKING_INTRO,
  CHECKING_READY_ANNOUNCEMENT,
  CHECKING_READY_TICKER,
  CHECKING_ROWS,
  CHECKING_ROW_MS,
  CHECKING_SEAL_CAPTION,
  CHECKING_START_LINE,
  CHECKING_STEP_DONE,
  CHECKING_STEP_RUNNING,
  CHECKING_WAITING_LINE,
  assembleCheckingOutcomes,
  parseCheckingPartValue,
  type CheckingAreaPayload,
  type CheckingCrimePayload,
  type CheckingGroupResult,
  type CheckingNearbyPayload,
  type CheckingPart,
  type CheckingSegment,
} from "../lib/journey";
import { fireJourneyEvent } from "./JourneyBeacon";

// The checking screen — the founder-chosen design (ruling
// 19 Nov 2026): Sample 7, "The Recommendation, Combined",
// as drawn in Final Sample Master view 2.
//
// The form: a rotating headline sentence (the live line)
// naming the group in flight; the evidence feed — five
// rows, each completing with a FINDING line derived from
// the real served data for its group, never a bare "Done"
// (a group whose part serves a not-filed, not-covered or
// failure state completes with that honest named state
// instead); and the seal — a five-segment ring around the
// house mark, one segment per completed group, stamping
// CHECKED when the last group lands, as the final beat
// before the reveal.
//
// The mechanics are D73's, unchanged: the same
// /api/check part calls fire in parallel (four since
// BUG-144 split the safety group's crime half out of
// the area part); a group completes
// only once its parts have settled, paced at least
// CHECKING_ROW_MS after the previous group's completion
// (smoothing over the real settlements, never a timer
// chain that can outrun or lag the data); the advance
// happens once all five groups have completed AND every
// part has settled, plus CHECKING_ADVANCE_MS. The parts
// answer with the groups' derived completion lines
// (lib/journey.ts derives them server-side from the
// bundles — the bundles themselves never ship here), and
// they warm the D29 cache the server-rendered results
// behind this screen read.
//
// Accessibility: the role="status" region renders from the
// first paint and announces milestones only — each group's
// completion and the final CHECKED beat — never progress
// percentages. The seal is decorative (aria-hidden): its
// information is the feed's, and the final beat is the
// announcement.
//
// M7.14 counting: the mount is the check's start
// (check_started, rung from the journey), and a part call
// that fails — an error status or a network failure — is
// a failed check request in the D45 error class
// (page_error). Neither post carries the postcode or the
// home: the event names the part and the failure class
// only.

// The seal's five segment rotations (Master view 2's own
// geometry: r=66 on a 160 viewBox, each segment spanning
// a fifth of the ring less a 5-unit gap).
const SEAL_ROTATIONS = [-90, -18, 54, 126, 198];

type PartSettlements = {
  nearby?: CheckingPart<CheckingNearbyPayload>;
  flood?: CheckingPart<CheckingSegment[]>;
  crime?: CheckingPart<CheckingCrimePayload>;
  area?: CheckingPart<CheckingAreaPayload>;
};

// BUG-320: the session flag for a completed check —
// module-level so the effects can read it without
// closing over per-render helpers. A "1" for this
// postcode and home means the check already ran in
// this session; a fresh session, or private mode
// (where the read/write throw), replays honestly.
function checkedFlagKey(postcode: string, homeKey: string | null): string {
  return `cmnh:checked:${postcode}:${homeKey ?? ""}`;
}
function readCheckedFlag(postcode: string, homeKey: string | null): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      window.sessionStorage.getItem(checkedFlagKey(postcode, homeKey)) === "1"
    );
  } catch {
    return false;
  }
}
function writeCheckedFlag(postcode: string, homeKey: string | null) {
  try {
    window.sessionStorage.setItem(checkedFlagKey(postcode, homeKey), "1");
  } catch {
    // Private mode or disabled storage: the check
    // replays, honestly, as before.
  }
}

export default function CheckingScreen({
  postcode,
  homeKey,
  heading,
  eyebrow,
  children,
}: {
  postcode: string;
  homeKey: string | null;
  heading: string;
  // The slim eyebrow (parity fix batch, items 2–4): the
  // Master's checking view is a STANDALONE screen — no
  // results H1, manifesto or scope line above it, no back
  // link, no visible status line; the only address
  // reference is this eyebrow ("19 Birkdale Rise ·
  // Hatfield Peverel · CM3 2JT"). At rung 2 the lead IS
  // the postcode and renders alone.
  eyebrow: { lead: string; town?: string | null };
  children: ReactNode;
}) {
  const [parts, setParts] = useState<PartSettlements>({});
  const [doneCount, setDoneCount] = useState(0);
  const [complete, setComplete] = useState(false);

  // BUG-320: a forward navigation back to this screen
  // must not re-run the check — the bundles are cached
  // server-side (D29), so the whole sequence would
  // replay from 0 for nothing. A session flag records a
  // completed check for this postcode and home; a
  // remount in the same session restores straight to the
  // results, with no part calls and no new check_started.
  // sessionStorage's per-tab scope matches the case
  // exactly — a fresh session replays honestly. The
  // restore reads in the mount effect, after hydration,
  // so there is no server/client mismatch — one frame
  // of the screen is the cost, and the results follow.
  // The real wiring: fire the four check calls in parallel
  // and record each part's settlement as it lands — the
  // derived group payload on success, the failure mark on
  // an error status, an unreadable body or a network
  // failure. BUG-144: the safety group's two parts —
  // flood and crime — fire FIRST, in the same moment as
  // the rest: the group stands last in the feed, and its
  // computation (the slowest on a cold postcode) runs
  // from the start, in parallel with the earlier groups.
  useEffect(() => {
    // BUG-320: this postcode and home already checked
    // in this session — restore straight to the results.
    // The restore reads sessionStorage in the mount
    // effect, after hydration, so there is no
    // server/client mismatch; the setState is the
    // restore itself, not a render cascade — hence the
    // targeted disable of the set-state-in-effect rule.
    if (readCheckedFlag(postcode, homeKey)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- post-hydration restore from sessionStorage (BUG-320); the one-frame flash is the accepted cost, documented above.
      setComplete(true);
      return;
    }
    let cancelled = false;
    fireJourneyEvent("check_started", { rung: homeKey ? 1 : 2 });
    const params = new URLSearchParams({ postcode });
    if (homeKey) params.set("home", homeKey);
    const settle = async <T,>(
      part: string,
      parse: (body: unknown) => T | null,
    ): Promise<CheckingPart<T>> => {
      try {
        const response = await fetch(`/api/check/${part}?${params.toString()}`);
        if (!response.ok) {
          fireJourneyEvent("page_error", {
            error_name: "CheckRequestFailed",
            error_message: `The ${part} part of the check answered HTTP ${response.status}`,
          });
          return { ok: false };
        }
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          // The part answered but its body could not be
          // read: the settlement is a failure for its
          // groups, and no page_error fires — the part did
          // answer, so it is not a failed check request in
          // the D45 sense the HTTP and network cases are.
          return { ok: false };
        }
        // The body is validated against the payload
        // contract before the assembly reads it (CI #247:
        // a blind cast let a drifted wire shape stall the
        // screen — the groups read as absent — and throw
        // mid-render). A mismatch settles the part as
        // failed, the same as an unreadable body: its
        // groups complete with their named failure lines
        // and the results still open.
        const value = parse(body);
        return value === null ? { ok: false } : { ok: true, value };
      } catch {
        fireJourneyEvent("page_error", {
          error_name: "CheckRequestFailed",
          error_message: `The ${part} part of the check could not be reached`,
        });
        return { ok: false };
      }
    };
    void settle("flood", (body) => parseCheckingPartValue("flood", body)).then((part) => {
      if (!cancelled) setParts((prev) => ({ ...prev, flood: part }));
    });
    void settle("crime", (body) => parseCheckingPartValue("crime", body)).then((part) => {
      if (!cancelled) setParts((prev) => ({ ...prev, crime: part }));
    });
    void settle("nearby", (body) => parseCheckingPartValue("nearby", body)).then((part) => {
      if (!cancelled) setParts((prev) => ({ ...prev, nearby: part }));
    });
    void settle("area", (body) => parseCheckingPartValue("area", body)).then((part) => {
      if (!cancelled) setParts((prev) => ({ ...prev, area: part }));
    });
    return () => {
      cancelled = true;
    };
  }, [postcode, homeKey]);

  const outcomes = assembleCheckingOutcomes(parts);
  const allSettled =
    parts.nearby !== undefined &&
    parts.flood !== undefined &&
    parts.crime !== undefined &&
    parts.area !== undefined;
  const sealed = doneCount >= CHECKING_ROWS.length;

  // The pacing: the next group completes CHECKING_ROW_MS
  // after the previous one, and only once its own outcome
  // exists (its parts have settled). The timer is the
  // floor; the data is the gate.
  useEffect(() => {
    if (sealed) return;
    const key = CHECKING_ROWS[doneCount].key;
    if (!outcomes[key]) return;
    const timer = setTimeout(() => setDoneCount((count) => count + 1), CHECKING_ROW_MS);
    return () => clearTimeout(timer);
  }, [doneCount, outcomes, sealed]);

  // The advance: all five groups complete AND every part
  // settled (the completion gate already implies it), then
  // CHECKING_ADVANCE_MS — the seal's stamp gets its beat.
  // BUG-320: the completion is recorded in the session
  // flag as the results open, so a forward navigation
  // back here restores instead of replaying.
  useEffect(() => {
    if (!sealed || !allSettled || complete) return;
    const timer = setTimeout(() => {
      writeCheckedFlag(postcode, homeKey);
      setComplete(true);
    }, CHECKING_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [sealed, allSettled, complete, postcode, homeKey]);

  if (complete) return <>{children}</>;

  const currentRow = CHECKING_ROWS[doneCount] as (typeof CHECKING_ROWS)[number] | undefined;
  const ticker = sealed
    ? CHECKING_READY_TICKER
    : doneCount === 0 && parts.nearby === undefined
      ? CHECKING_START_LINE
      : (currentRow?.ticker ?? CHECKING_START_LINE);
  const stepLabel = sealed
    ? CHECKING_STEP_DONE
    : doneCount === 0
      ? CHECKING_START_LINE
      : CHECKING_STEP_RUNNING;
  const lastCompleted = doneCount > 0 ? CHECKING_ROWS[doneCount - 1] : undefined;
  const announcement = sealed
    ? CHECKING_READY_ANNOUNCEMENT
    : lastCompleted && outcomes[lastCompleted.key]
      ? `${lastCompleted.label} — ${outcomes[lastCompleted.key]!.line}`
      : "";

  return (
    <section className="checking" aria-label={heading}>
      <p className="addr-line">
        {eyebrow.lead !== postcode && (
          <>
            <b>{eyebrow.lead}</b>
            {eyebrow.town ? ` · ${eyebrow.town}` : ""} ·{" "}
          </>
        )}
        <b>{postcode}</b>
      </p>
      <h1 className="page-title">{heading}</h1>
      <p className="checking__intro">{CHECKING_INTRO}</p>

      {/* BUG-261 (24 Nov 2026): the dot used to stand
          beside the text span as its own inline-block,
          so when the headline wrapped to two lines the
          whole text box dropped to line two and the dot
          sat alone on line one. The dot now rides INSIDE
          the text span, at the head of its first line —
          it can never wrap alone, at any width. The fade
          still covers dot and text together. */}
      <p className="checking__ticker">
        <span key={ticker} className="checking__ticker-text">
          <span className="checking__ticker-dot" aria-hidden="true" />
          {ticker}
        </span>
      </p>

      <div className="checking__seal-wrap">
        <svg className="checking__seal" viewBox="0 0 160 160" aria-hidden="true">
          {SEAL_ROTATIONS.map((rotation, index) => (
            <circle
              key={rotation}
              className="checking__seal-seg"
              data-on={index < doneCount ? "true" : undefined}
              cx="80"
              cy="80"
              r="66"
              strokeDasharray="77.94 336.75"
              transform={`rotate(${rotation} 80 80)`}
            />
          ))}
          <path
            className="checking__seal-house"
            d="M52 84 L80 58 L108 84 M60 78 V106 H100 V78 M73 106 V92 H87 V106"
          />
          <g className="checking__seal-badge" data-on={sealed ? "true" : undefined}>
            <rect x="52" y="118" width="56" height="17" rx="8.5" />
            <text x="80" y="130" textAnchor="middle">
              CHECKED
            </text>
          </g>
        </svg>
        <p className="checking__seal-caption">{CHECKING_SEAL_CAPTION}</p>
      </div>

      <div
        className="checking__progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={CHECKING_ROWS.length}
        aria-valuenow={doneCount}
        aria-label="Checks complete"
      >
        <div
          className="checking__progress-bar"
          style={{ width: `${(doneCount / CHECKING_ROWS.length) * 100}%` }}
        />
      </div>
      <p className="checking__stepline">
        <span>{stepLabel}</span>
        <b>{doneCount > 0 ? `${doneCount} of ${CHECKING_ROWS.length}` : ""}</b>
      </p>

      <ul className="checking__rows">
        {CHECKING_ROWS.map((row, index) => {
          const outcome: CheckingGroupResult | null = outcomes[row.key];
          const done = index < doneCount && outcome !== null;
          const active = !done && index === doneCount;
          const state = done ? outcome!.state : active ? "active" : "waiting";
          const stateText = done ? outcome!.line : active ? row.doing : CHECKING_WAITING_LINE;
          return (
            <li key={row.key} className="checking__row" data-row={row.key} data-state={state}>
              <span className="checking__row-icon" data-state={state} aria-hidden="true">
                {done && outcome!.state === "done" ? (
                  <svg viewBox="0 0 24 24" width="12" height="12">
                    <path
                      d="M4 12.5 L9.5 18 L20 6.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : done ? (
                  <svg viewBox="0 0 24 24" width="12" height="12">
                    <path
                      d="M12 5.5 V13.5 M12 17.5 h.01"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : active ? (
                  <span className="checking__row-spinner" />
                ) : (
                  <span className="checking__pendot" />
                )}
              </span>
              <span className="checking__row-main">
                <span className="checking__row-label">{row.label}</span>
                <span className="checking__row-state">{stateText}</span>
                <span className="checking__row-source">{row.source}</span>
              </span>
            </li>
          );
        })}
      </ul>

      <p className="checking__final" data-visible={sealed ? "true" : undefined}>
        {CHECKING_FINAL_LINE}
      </p>
      <div className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </div>
    </section>
  );
}
