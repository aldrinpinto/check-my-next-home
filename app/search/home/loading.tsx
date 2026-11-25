// The /search/home route's interim (BUG-268, 25 Nov
// 2026): while a navigation into the route resolves —
// the full page load after "check this home", waiting
// on the address resolution in the database — the
// visitor sees the home checking screen's frame at
// rest: the heading, the intro, the starting ticker,
// the seal unshaded under its caption, the progress
// bar empty, and the five groups waiting. The live
// screen (components/CheckingScreen.tsx) takes over
// with the real postcode and home the moment the
// resolution lands. Before this boundary the route
// rendered null while resolving, so the first painted
// frame was the layout shell alone — header and the
// tall dark-green footer, nothing between — a flash
// on every search-to-checking navigation.
//
// Rendered statically on the server: the boundary
// receives no search parameters, so the frame carries
// no address eyebrow — the live screen adds the
// address the moment it mounts — and no live region:
// the live screen renders its role="status" region
// from its own first paint. The dress is the
// finalised design's (Sample 7, Final Sample Master
// view 2) and the shared .checking styles; the
// markup mirrors the live screen's at-rest state
// exactly, including the seal's geometry
// (components/CheckingScreen.tsx's SEAL_ROTATIONS,
// r=66 on a 160 viewBox) and the closing line held
// invisible until the seal stamps, so the layout
// never shifts at the reveal.
//
// BUG-358 (25 Nov 2026): the rows deliberately carry
// NO data-row / data-state hooks — a static
// placeholder has no state to report, and the live
// screen renders the same hooks the moment it mounts.
// While the resolution streams, the fallback and the
// live screen share the DOM; hooks on both meant two
// data-row="costs" rows and a strict-mode violation
// in the checking-screen test (CI #356). The look is
// unchanged — the stylesheet has no "waiting" hook
// selector, so the at-rest dress is the base row
// style — only the hooks are gone.
//
// Scope: this boundary wraps the /search/home route
// only. The district route keeps its own interim
// (app/search/loading.tsx) and the failed route keeps
// its null boundary (app/search/failed/loading.tsx) —
// the failure page renders instantly, so no frame is
// needed there.

import {
  CHECKING_FINAL_LINE,
  CHECKING_HEADING,
  CHECKING_INTRO,
  CHECKING_ROWS,
  CHECKING_SEAL_CAPTION,
  CHECKING_START_LINE,
  CHECKING_WAITING_LINE,
} from "../../../lib/journey";

// The seal's five segment rotations (Master view 2's
// own geometry, as in components/CheckingScreen.tsx:
// r=66 on a 160 viewBox, each segment spanning a fifth
// of the ring less a 5-unit gap). Kept in step by the
// BUG-268 pin test.
const SEAL_ROTATIONS = [-90, -18, 54, 126, 198];

export default function HomeLoading() {
  return (
    <main className="journey-page main--wide">
      <section className="checking" aria-label={CHECKING_HEADING}>
        <h1 className="page-title">{CHECKING_HEADING}</h1>
        <p className="checking__intro">{CHECKING_INTRO}</p>
        <p className="checking__ticker">
          <span className="checking__ticker-text">
            <span className="checking__ticker-dot" aria-hidden="true" />
            {CHECKING_START_LINE}
          </span>
        </p>
        <div className="checking__seal-wrap">
          <svg className="checking__seal" viewBox="0 0 160 160" aria-hidden="true">
            {SEAL_ROTATIONS.map((rotation) => (
              <circle
                key={rotation}
                className="checking__seal-seg"
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
            <g className="checking__seal-badge">
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
          aria-label="Checks complete"
          aria-valuemin={0}
          aria-valuemax={CHECKING_ROWS.length}
          aria-valuenow={0}
        >
          <div className="checking__progress-bar" style={{ width: "0%" }} />
        </div>
        <p className="checking__stepline">
          <span>{CHECKING_START_LINE}</span>
          <b></b>
        </p>
        <ul className="checking__rows">
          {CHECKING_ROWS.map((row) => (
            <li key={row.key} className="checking__row">
              <span className="checking__row-icon" aria-hidden="true">
                <span className="checking__pendot" />
              </span>
              <span className="checking__row-main">
                <span className="checking__row-label">{row.label}</span>
                <span className="checking__row-state">{CHECKING_WAITING_LINE}</span>
                <span className="checking__row-source">{row.source}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="checking__final">{CHECKING_FINAL_LINE}</p>
      </section>
    </main>
  );
}
