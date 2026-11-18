"use client";

import { useSearchParams } from "next/navigation";

import { UNPLACED_NOTICE_LINE, UNPLACED_NOTICE_PARAM, UNPLACED_NOTICE_VALUE } from "../lib/journey";

// The landing page's unplaced notice (founder ruling,
// 18 Nov 2026): when an input couldn't be placed — or the
// bare /search route was hit directly — the visitor lands
// back here with ?notice=unplaced in the query, and this
// island shows the one small line at the search box. It
// replaces the retired standalone no-location page: the
// notice is a line on the page the visitor already knows,
// not a page of its own. Reading the query client-side
// keeps the landing page itself static.
export default function UnplacedNotice() {
  const params = useSearchParams();
  if (params.get(UNPLACED_NOTICE_PARAM) !== UNPLACED_NOTICE_VALUE) return null;
  return <p className="journey-notice unplaced-notice">{UNPLACED_NOTICE_LINE}</p>;
}
