import { SUPPLEMENT_ROW_LINE, supplementDoneLine, supplementLoadingLine } from "../lib/journey";

// The "Don't see your home?" row (BUG-185, founder-ruled
// 23 Nov 2026; dress from the approved draft samples) —
// one component for both surfaces that carry it: the
// search box's suggestions panel and the check page's
// picker dropdown, each rendering it as the pinned last
// item of a dropdown that lists one postcode's homes.
//
// Three states, and only three — there is deliberately
// no failure state: idle (the action, on its brass band
// — BUG-193, founder ruling 23 Nov 2026: the Check
// button's brass with ink text and a white disc),
// loading (a spinner in the row while the homes above
// dim), and done (the settled line, not clickable, over
// whatever list stands — the click's outcome, success or
// failure alike, always lands here). The activation is
// the visitor's one deliberate Postio call; the parent
// owns the fetch and the stage.

export type SupplementStage = "idle" | "loading" | "done";

function SearchMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 21 21" />
    </svg>
  );
}

function DoneMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12.5 9.5 18 20 6.5" />
    </svg>
  );
}

export default function SupplementRow({
  stage,
  postcode,
  onActivate,
}: {
  stage: SupplementStage;
  postcode: string;
  onActivate: () => void;
}) {
  if (stage === "loading") {
    return (
      <div className="postio-row postio-row--loading" role="status">
        <span className="postio-row__spinner" aria-hidden="true" />
        <span>{supplementLoadingLine(postcode)}</span>
      </div>
    );
  }
  if (stage === "done") {
    return (
      <div className="postio-row postio-row--done" aria-disabled="true">
        <span className="postio-row__mark">
          <DoneMark />
        </span>
        <span>{supplementDoneLine(postcode)}</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      className="postio-row"
      onMouseDown={(event) => {
        // Land before any blur-driven panel close: the
        // panel the row lives in must stay open through
        // the loading and done states.
        event.preventDefault();
      }}
      onClick={onActivate}
    >
      <span className="postio-row__mark">
        <SearchMark />
      </span>
      <span>{SUPPLEMENT_ROW_LINE}</span>
    </button>
  );
}
