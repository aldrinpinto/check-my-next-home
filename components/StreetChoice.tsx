import { displayText } from "../lib/address";
import { STREET_CHOICE_LINE, postcodeRoute, streetChoiceCountLine } from "../lib/journey";
import type { StreetPostcodeRow } from "../lib/server/streets";

// The street choice (plan step M7.15C, 18 Nov 2026): a
// street spanning postcodes is picked from the search
// box as a (street, town); this page offers the short
// list of postcodes the street sits in — biggest first,
// the street's centre of gravity leading — in the
// picker's own list style (the HomeList forms: same
// shell, same row anatomy). Each row opens that
// postcode's check with its home list narrowed to the
// street. A street pick never lands on a home directly,
// and this page exists only behind a pick: submitting a
// street name without picking never routes here.
export default function StreetChoice({
  street,
  town,
  rows,
}: {
  street: string;
  town: string | null;
  rows: StreetPostcodeRow[];
}) {
  return (
    <main className="journey-page">
      <div className="picker">
        <h1>{town ? `${street}, ${town}` : street}</h1>
        <p className="picker__explainer">{STREET_CHOICE_LINE}</p>
        <p className="picker__count">{streetChoiceCountLine(rows.length)}</p>
        <ul className="picker__list">
          {rows.map((row) => (
            <li key={row.postcode}>
              <a className="picker__row" href={postcodeRoute(row.postcode, { street: row.street })}>
                <span>
                  {displayText(row.street)}
                  {row.town ? `, ${displayText(row.town)}` : ""}, {row.postcode}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
