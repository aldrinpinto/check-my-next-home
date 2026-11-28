import Link from "next/link";

import {
  PLACE_CHOICE_LINE,
  placeBridgeLine,
  placeChoiceCountLine,
  placeDistrictDescription,
  widerAreaRoute,
} from "../lib/journey";
import DistrictSaveButton from "./DistrictSaveButton";
import PostcodeBox from "./PostcodeBox";

// The place page (founder ruling, 19 Nov 2026, reversing
// the 18 Nov in-dropdown chooser): a place pick — from
// the dropdown, from a submitted place name, from a bare
// place name sent to /search — lands here, exactly as a
// street pick lands on the street choice page. One row
// per district the place serves, ALL of them (the
// dropdown's reveal capped the list at five; Liverpool's
// districts run far past that), each row opening that
// district's wider-area search.
//
// Fix batch, 19 Nov 2026 — the view-29 parity items:
// each row carries its one-line area description (the
// district's cleaned settlements — BUG-026), the count
// line counts in full words (BUG-025, in
// placeChoiceCountLine), and the one-home bridge stands
// under the list (BUG-027).
//
// BUG-035 (founder ruling, 20 Nov 2026): the bridge is
// view 29's ONE line and nothing else — the BUG-027
// block wore the district bridge's heading, form and
// example chip (view 28's dress), and the parity
// re-check logged the substitution. The line's example
// is one filed postcode in the place: the first
// district, in district order, that files one. No filed
// postcode anywhere in the place, no example clause;
// the line still stands.
//
// WA-10 (BUG-160 as corrected): the page wears Sample
// 29's own dress — the district measure, the addr-line,
// the serif title, the intro, the count as a .sect head
// and the rows as open ruled rows with the outward's
// code tile. The words are unchanged; the picker's
// dress is retired from this page.
//
// BUG-359 (25 Nov 2026): the Suspense fallback renders
// this same component with bare rows while the area
// furniture streams in (BUG-286), so until the swap
// runs the fallback list and the settled list share
// the DOM. The fallback list therefore wears a
// DISTINCT class — district-place__list--fallback,
// dressed identically (app/globals.css) — and the
// settled list stays the only .district-place__list
// on the page. A locator for the settled list can
// never match twice (CI #356's strict-mode violation
// on the place test's retry).
export default function PlaceChoice({
  place,
  districts,
  fallback,
}: {
  place: string;
  districts: {
    outward: string;
    settlements: string[];
    examplePostcode: string | null;
    // BUG-317: the district's own post town (the
    // districtAreas read composes it). Optional so the
    // bare-rows fallback (BUG-286) keeps its shape —
    // a district without one falls back to the place.
    postTown?: string | null;
  }[];
  // BUG-359: true only for the Suspense fallback in
  // app/search/page.tsx — the bare-rows interim.
  fallback?: boolean;
}) {
  const bridgePostcode = districts.find((district) => district.examplePostcode)?.examplePostcode;
  return (
    <main className="journey-page">
      <div className="district-place">
        <p className="addr-line">
          Wider area · <b>Place</b>
        </p>
        <h1 className="page-title">{place}</h1>
        <p className="district-intro">{PLACE_CHOICE_LINE}</p>
        <h2 className="district-sect">{placeChoiceCountLine(districts.length)}</h2>
        <ul className={fallback ? "district-place__list--fallback" : "district-place__list"}>
          {districts.map((district) => {
            const description = placeDistrictDescription(district.settlements);
            return (
              // BUG-318: the Save button sits BESIDE the
              // row's link, as its sibling — never inside
              // it, where a tap would navigate instead of
              // saving. The list item is the flex parent
              // (.district-place__item), so the button
              // shows at every desktop width.
              <li key={district.outward} className="district-place__item">
                {/* BUG-402: client-side, so Back restores
                    the place page from the router cache
                    instead of re-rendering it behind its
                    loading frame. */}
                <Link
                  className="district-place__row"
                  href={widerAreaRoute(district.outward)}
                  prefetch={false}
                >
                  <span className="district-place__code">{district.outward}</span>
                  <span className="district-place__main">
                    {/* BUG-317: the row names the
                        district's own post town — CM11
                        reads "CM11 — Billericay", never
                        "CM11 — Chelmsford". A district
                        with no filed town falls back to
                        the place, as before. */}
                    <span className="district-place__label">{`${district.outward} — ${district.postTown ?? place}`}</span>
                    {description && <span className="district-place__detail">{description}</span>}
                  </span>
                </Link>
                <DistrictSaveButton outward={district.outward} />
              </li>
            );
          })}
        </ul>
        <p className="district-place__bridge">{placeBridgeLine(place, bridgePostcode ?? null)}</p>
        {/* BUG-317: the search box stands on the place
            page, under the bridge line — a visitor who
            landed here on a place name can type a
            postcode (or a home) without going back.
            The bridge line itself is untouched (BUG-035:
            it is view 29's ONE line). */}
        <PostcodeBox />
      </div>
    </main>
  );
}
