import { PLACE_CHOICE_LINE, placeChoiceCountLine, widerAreaRoute } from "../lib/journey";

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
export default function PlaceChoice({ place, districts }: { place: string; districts: string[] }) {
  return (
    <main className="journey-page">
      <div className="picker">
        <h1>{place}</h1>
        <p className="picker__explainer">{PLACE_CHOICE_LINE}</p>
        <p className="picker__count">{placeChoiceCountLine(districts.length)}</p>
        <ul className="picker__list">
          {districts.map((outward) => (
            <li key={outward}>
              <a className="picker__row" href={widerAreaRoute(outward)}>
                <span>{`${outward} — ${place}`}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
