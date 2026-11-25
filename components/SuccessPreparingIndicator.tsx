// BUG-260 (24 Nov 2026): the preparing page gave no
// visible progress feedback during the ~63-second wait
// after payment — a static page that reads as stuck. This
// is the honest indicator: the house building itself
// while the refresher polls — an indeterminate wait,
// never a faked percentage or staged messages. BUG-271
// (25 Nov 2026, founder's pick — Draft 1 from the
// spinner-drafts page, "Lets go with Pick no 1"): the
// spinner is the house being built — foundations, walls,
// brass roof, door, then the brass sun — assembling in
// order on a 3.8s loop, holding complete briefly, fading
// out, starting again. The drawing is the draft's
// verbatim (viewBox 0 0 120 110, 118px square); the
// label beneath is the page's own "Preparing your
// report…" line, exactly as before. No rotating sub-line:
// the draft mock's rotating lines would claim staged
// progress the page is not making, and their 2.4s cycle
// drifts against the 3.8s build — BUG-260's honesty rule
// forbids staged messages, so the house stands alone
// under the label. A client component so the soft
// refresh's re-render never remounts it and the build
// runs uninterrupted until the ready flip unmounts it
// with the refresher. role="status" announces the
// preparing state once; the house itself is decorative
// (aria-hidden).
export default function SuccessPreparingIndicator() {
  return (
    <p className="report-success__preparing" role="status">
      <span className="report-success__house" aria-hidden="true">
        <svg viewBox="0 0 120 110">
          <circle className="report-success__house-sun" cx="96" cy="18" r="8" fill="#C9A95C" />
          <rect
            className="report-success__house-foundations"
            x="18"
            y="94"
            width="84"
            height="6"
            rx="3"
            fill="#224233"
          />
          <g className="report-success__house-walls">
            <rect
              x="30"
              y="56"
              width="60"
              height="38"
              rx="2"
              fill="#FFFFFF"
              stroke="#224233"
              strokeWidth="3.5"
            />
            <rect
              x="40"
              y="66"
              width="12"
              height="12"
              fill="#F3E3B3"
              stroke="#224233"
              strokeWidth="2.5"
            />
            <rect
              x="68"
              y="66"
              width="12"
              height="12"
              fill="#F3E3B3"
              stroke="#224233"
              strokeWidth="2.5"
            />
          </g>
          <g className="report-success__house-roof">
            <path
              d="M22 58 L60 28 L98 58 Z"
              fill="#B9974F"
              stroke="#8A6F33"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <rect x="80" y="30" width="9" height="16" fill="#224233" />
          </g>
          <rect
            className="report-success__house-door"
            x="53"
            y="72"
            width="14"
            height="22"
            rx="2"
            fill="#224233"
          />
        </svg>
      </span>
      <span className="report-success__preparing-label">Preparing your report…</span>
    </p>
  );
}
