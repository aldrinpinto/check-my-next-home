import { displayText } from "../lib/address";
import { STREET_CHOICE_LINE, postcodeRoute, streetChoiceCountLine } from "../lib/journey";
import type { StreetPostcodeRow } from "../lib/server/streets";

// The street choice (plan step M7.15C, 18 Nov 2026): a
// street spanning postcodes is picked from the search
// box as a (street, town); this page offers the short
// list of postcodes the street sits in — biggest first,
// the street's centre of gravity leading. Each row opens
// that postcode's check with its home list narrowed to
// the street. A street pick never lands on a home
// directly, and this page exists only behind a pick:
// submitting a street name without picking never routes
// here.
//
// WA-10 (BUG-160 as corrected): the page takes the
// place page's Sample 29 dress — the district measure,
// the addr-line, the serif title, the intro, the count
// as a .sect head and open ruled rows, the postcode
// itself in the code tile. The words are unchanged.
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
      <div className="district-place">
        <p className="addr-line">
          Wider area · <b>Street</b>
        </p>
        <h1 className="page-title">{town ? `${street}, ${town}` : street}</h1>
        <p className="district-intro">{STREET_CHOICE_LINE}</p>
        <h2 className="district-sect">{streetChoiceCountLine(rows.length)}</h2>
        <ul className="district-place__list">
          {rows.map((row) => (
            <li key={row.postcode}>
              <a
                className="district-place__row"
                href={postcodeRoute(row.postcode, { street: row.street })}
              >
                <span className="district-place__code">{row.postcode}</span>
                <span className="district-place__main">
                  <span className="district-place__label">
                    {displayText(row.street)}
                    {row.town ? `, ${displayText(row.town)}` : ""}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
