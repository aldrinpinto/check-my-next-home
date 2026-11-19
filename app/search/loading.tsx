// The /search segment's interim (founder ruling,
// 19 Nov 2026 — the wider-area checking build): while a
// navigation into the segment resolves, the visitor sees
// the wider-area checking screen's frame at rest — the
// eyebrow and heading, the starting sentence, the
// schematic sweep unshaded under its caption, the
// progress bar empty, and the four groups waiting.
// Rendered statically on the server: it has no district
// to name (the fallback receives no search parameters),
// so the sweep carries no outward and the frame carries
// no intro line — the live screen adds the district's
// own intro the moment it mounts, and the stamp's place
// comes with the payload. When the page lands, the
// checking screen (components/DistrictCheckingScreen.tsx)
// takes over with the real district and the real
// findings. The dress is the finalised design's (Sample
// 3 of the wider-area checking samples; Final Sample
// Master view 31) and the shared .checking styles.
//
// Scope: this boundary wraps the /search segment. The
// home and failed routes carry their own null boundaries
// (app/search/home/loading.tsx, app/search/failed/
// loading.tsx) so their behaviour is untouched — the
// home route's checking screen is its own state, and the
// failure page is instant.

import DistrictSweep from "../../components/DistrictSweep";
import {
  DISTRICT_CHECKING_ROWS,
  DISTRICT_CHECKING_START_LINE,
  DISTRICT_CHECKING_SWEEP_CAPTION,
} from "../../lib/district-checking";
import { CHECKING_WAITING_LINE } from "../../lib/journey";

export default function SearchLoading() {
  return (
    <main className="journey-page main--wide">
      <section className="checking dchecking" aria-label="Checking the wider area">
        <p className="addr-line">
          Wider area · <b>Postcode district</b>
        </p>
        <h1 className="page-title">Checking the wider area…</h1>
        <p className="checking__ticker">
          <span className="checking__ticker-dot" aria-hidden="true" />
          <span className="checking__ticker-text">{DISTRICT_CHECKING_START_LINE}</span>
        </p>
        <div className="dchecking__sweep-wrap">
          <DistrictSweep
            clipId="dcheck-clip-loading"
            outward=""
            groupsDone={0}
            floodOn={false}
            stationOn={false}
            stampOn={false}
            stampBig=""
            stampSmall={null}
          />
          <p className="dchecking__caption">{DISTRICT_CHECKING_SWEEP_CAPTION}</p>
        </div>
        <div
          className="checking__progress"
          role="progressbar"
          aria-label="Groups complete"
          aria-valuemin={0}
          aria-valuemax={DISTRICT_CHECKING_ROWS.length}
          aria-valuenow={0}
        >
          <div className="checking__progress-bar" style={{ width: "0%" }} />
        </div>
        <p className="checking__stepline">
          <span>{DISTRICT_CHECKING_START_LINE}</span>
          <b></b>
        </p>
        <ul className="checking__rows">
          {DISTRICT_CHECKING_ROWS.map((row) => (
            <li key={row.key} className="checking__row" data-row={row.key} data-state="waiting">
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
      </section>
    </main>
  );
}
