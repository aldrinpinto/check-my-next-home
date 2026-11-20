import {
  PLACE_CHOICE_LINE,
  placeBridgeLine,
  placeChoiceCountLine,
  placeDistrictDescription,
  widerAreaRoute,
} from "../lib/journey";

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
export default function PlaceChoice({
  place,
  districts,
}: {
  place: string;
  districts: { outward: string; settlements: string[]; examplePostcode: string | null }[];
}) {
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
        <p className="picker__bridge-line">{placeBridgeLine(place, bridgePostcode ?? null)}</p>
      </div>
    </main>
  );
}
