import { SAMPLE_REPORT_PATH } from "../lib/home";
import {
  WHOLE_CHECK_FAILURE_HEADING,
  WHOLE_CHECK_FAILURE_LINE,
  WHOLE_CHECK_FAILURE_RETRY,
  WHOLE_CHECK_FAILURE_SAMPLE,
} from "../lib/journey";

// The whole-check failure state (D44(7)), built once at
// M7.3 as part of the journey shell and reused by M7.4 on
// the results route: plain wording, a retry, and the
// sample-report route — never a generic error page.
// Per-brain failures never land here; they stay per-row
// named states on the checking screen (D44(5)(ii)).

export default function WholeCheckFailure({ retryHref = "/" }: { retryHref?: string }) {
  return (
    <main className="journey-page">
      <h1>{WHOLE_CHECK_FAILURE_HEADING}</h1>
      <p className="type-lead">{WHOLE_CHECK_FAILURE_LINE}</p>
      <p className="journey-actions">
        <a className="btn btn--primary" href={retryHref}>
          {WHOLE_CHECK_FAILURE_RETRY}
        </a>{" "}
        <a href={SAMPLE_REPORT_PATH}>{WHOLE_CHECK_FAILURE_SAMPLE}</a>
      </p>
    </main>
  );
}
