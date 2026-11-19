import Link from "next/link";

import {
  ERROR_PAGE_CLOSING_AFTER,
  ERROR_PAGE_CLOSING_BEFORE,
  ERROR_PAGE_CLOSING_LINK,
  ERROR_PAGE_HEADING,
  ERROR_PAGE_KEPT_NOTE,
  ERROR_PAGE_LINE,
} from "../lib/journey";
import PostcodeBox from "./PostcodeBox";

// The single error page (Final Sample Master view 26;
// founder ruling 19 Nov 2026): one face for every
// visitor-facing failure — the route error boundary
// (app/error.tsx), unmatched routes (app/not-found.tsx),
// the whole-check failure state (components/
// WholeCheckFailure.tsx) and its landing route
// (/search/failed) all render THIS page, inside the
// site's unified header and footer. The failure kinds
// stay distinct in the counting (D45); only the face is
// one. No error codes, no technical words, no variants.
//
// The way forward is the site's own search box, in its
// hero form (the label "Postcode or address", the Brass
// "Check this home" button). Where the visitor was
// checking a home, the caller hands that postcode or
// address in as initialValue: the box arrives holding
// it, and the kept note under the box says so — the
// note renders only then, because with an empty box
// there is no kept home for it to speak of. (The
// sample draws the box's label visibly; the hero form
// carries the label as the field's accessible name —
// the box is used exactly as the site serves it
// everywhere else, per the build brief.)

export default function ErrorPage({ initialValue = "" }: { initialValue?: string }) {
  const kept = initialValue.trim().length > 0;
  return (
    <main className="error-page">
      <div className="error-page__mark" aria-hidden="true">
        <svg width="30" height="24" viewBox="0 0 34 26" fill="none">
          <path
            d="M3 12.5 L17 3 L31 12.5"
            stroke="#2F5D3E"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M12 21.5 h10" stroke="#C29A3B" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
      <h1 className="error-page__title">{ERROR_PAGE_HEADING}</h1>
      <p className="error-page__lede">{ERROR_PAGE_LINE}</p>
      <div className="error-page__card">
        <PostcodeBox bare defaultValue={initialValue} />
        {kept && <p className="error-page__note">{ERROR_PAGE_KEPT_NOTE}</p>}
      </div>
      <p className="error-page__closing">
        {ERROR_PAGE_CLOSING_BEFORE} <Link href="/contact">{ERROR_PAGE_CLOSING_LINK}</Link>{" "}
        {ERROR_PAGE_CLOSING_AFTER}
      </p>
    </main>
  );
}
