import {
  PLACE_BRIDGE_LINE,
  PLACE_CHOICE_LINE,
  SEARCH_ROUTE,
  homeRoute,
  placeBridgeHeading,
  placeChoiceCountLine,
  placeDistrictDescription,
  widerAreaRoute,
} from "../lib/journey";
import { POSTCODE_BOX_PLACEHOLDER } from "../lib/home";

// The place page (founder ruling, 19 Nov 2026, reversing
// the 18 Nov in-dropdown chooser): a place pick — from
// the dropdown, from a submitted place name, from a bare
// place name sent to /search — lands here, exactly as a
// street pick lands on the street choice page. One row
// per district the place serves, ALL of them (the
// dropdown's reveal capped the list at five; Liverpool's
// districts run far past that), each row opening that
// district's wider-area search. The page is the street
// choice page's seam and dress throughout: the picker's
// shell, the place as the heading, the pinned explainer
// and count lines, the picker's rows.
//
// Fix batch, 19 Nov 2026 — the view-29 parity items:
// each row carries its one-line area description (the
// district's cleaned settlements — BUG-026), the count
// line counts in full words (BUG-025, in
// placeChoiceCountLine), and the one-home bridge block
// stands under the list (BUG-027), in the district
// bridge's own dress: a plain postcode form and one
// filed postcode in the place as its example link.
export default function PlaceChoice({
  place,
  districts,
}: {
  place: string;
  districts: { outward: string; settlements: string[]; examplePostcode: string | null }[];
}) {
  // The bridge's example: the first district's filed
  // postcode, in district order — one home in the place
  // to land on. No filed postcode anywhere in the place,
  // no example link; the form still reaches every home.
  const bridgePostcode = districts.find((district) => district.examplePostcode)?.examplePostcode;
  return (
    <main className="journey-page">
      <div className="picker">
        <h1>{place}</h1>
        <p className="picker__explainer">{PLACE_CHOICE_LINE}</p>
        <p className="picker__count">{placeChoiceCountLine(districts.length)}</p>
        <ul className="picker__list">
          {districts.map((district) => {
            const description = placeDistrictDescription(district.settlements);
            return (
              <li key={district.outward}>
                <a className="picker__row" href={widerAreaRoute(district.outward)}>
                  <span className="picker__row-main">
                    <span>{`${district.outward} — ${place}`}</span>
                    {description && <span className="picker__row-detail">{description}</span>}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
        <div className="district-bridge">
          <h2 className="district-bridge__heading">{placeBridgeHeading(place)}</h2>
          <p className="district-bridge__line">{PLACE_BRIDGE_LINE}</p>
          <form className="district-bridge__form" action={SEARCH_ROUTE} method="get">
            <label className="visually-hidden" htmlFor="place-bridge-postcode">
              Full postcode
            </label>
            <input
              className="district-bridge__input"
              id="place-bridge-postcode"
              name="postcode"
              placeholder={POSTCODE_BOX_PLACEHOLDER}
              autoComplete="postal-code"
            />
            <button className="btn btn--primary" type="submit">
              Check this home →
            </button>
          </form>
          {bridgePostcode && (
            <div className="district-bridge__links">
              <a className="district-bridge__chip" href={homeRoute(bridgePostcode)}>
                {`${bridgePostcode} · ${place}`}
              </a>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
