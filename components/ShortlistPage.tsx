"use client";

import { useEffect, useState } from "react";

import { REPORT_ROUTE, formatMiles, reportRoute } from "../lib/results";
import { REPORT_PRICE_LABEL } from "../lib/site";
import {
  SHORTLIST_EMPTY_HEADING,
  SHORTLIST_EMPTY_LINE,
  SHORTLIST_KEPT_LINE,
  SHORTLIST_LEAD_LINE,
  SHORTLIST_UNAVAILABLE_LINE,
  SEE_THIS_HOMES_CHECK,
  buildComparison,
  cardLastSaleLine,
  loadShortlist,
  notifyShortlistChanged,
  removeCardFromRecord,
  saveShortlist,
  subscribeShortlistChanged,
  type ShortlistCell,
  type ShortlistRecord,
} from "../lib/shortlist";

// The /shortlist page's client island (plan step M7.5,
// fold-in 6): the server sends the framed shell only; the
// page head, the cards, the comparison and the named lines
// resolve here, from browser storage — no serve call, so
// the page is exact under the second-context absence check
// and works while the play server is down.
//
// Shortlist sample-parity fix (18 Nov 2026): the head
// (h1, lead, brass rule) renders here, not in the server
// shell, because the sample's head is state-shaped — the
// empty state carries NO lead, and the saved states carry
// exactly the one stored-on-no-server sentence. The empty
// state also gains the sample's "Check a home" card under
// the empty card — a plain form in the sample's card dress
// (parity fix batch, item 41: no dropdown, no picker
// behaviour; the saved states keep their PostcodeBox).
//
// The two named lines stay distinct (fold-in 5): storage
// unavailable renders its own line where the shortlist
// would be; storage working but empty renders the Final
// Design's Section 4B empty state. Cards render in saved
// order from their snapshots — facts are never re-derived
// on view (ruling 3) — and removing a card here is the same
// storage write the results page's button state reads.
//
// The facts table renders from ONE saved home (founder's
// rulings, 17 Nov 2026): a single home's table is headed
// "The facts for this home", two or more are "side by
// side". Cards carry no facts line at rung 1 (the table
// below carries those rows — the card line duplicated
// them) and no report link (one buy button per home, at
// its column's foot); a rung-3 card keeps its facts line,
// whose named states explain missing data rather than
// duplicating the table. The kept line closes the page, in
// small print, below the table.

type State =
  { kind: "pending" } | { kind: "unavailable" } | { kind: "ready"; record: ShortlistRecord };

// The page head (sample views 14–16): h1 and the brass
// rule on every state; the lead only where the sample
// carries it — the saved states, as the one sentence.
function ShortlistHead({ lead }: { lead: boolean }) {
  return (
    <>
      <h1>Your shortlist</h1>
      {lead && <p className="shortlist-lead">{SHORTLIST_LEAD_LINE}</p>}
      <div className="shortlist-rule" aria-hidden="true" />
    </>
  );
}

// A column's report link (plan step M7.6, link contract):
// a rung-1 card carries its identity — the saved
// postcode + home key — so the door names the home; a
// rung-3 card's identity is an area, not a home, so its
// link stays the bare route and the door renders its
// generic form.
function cardReportHref(card: ShortlistRecord["cards"][number]): string {
  return card.rung === 1 ? reportRoute(card.postcode, card.homeKey) : REPORT_ROUTE;
}

function CompareCell({
  cell,
  family,
}: {
  cell: ShortlistCell;
  family: "school" | "everyday" | "hospital" | null;
}) {
  // Pointer cells are legacy: only cards saved before the
  // 17 Nov 2026 ruling (real flood/crime figures in the
  // cells) hold them, and they still render their pointer
  // rather than dropping a saved list for its age.
  if (cell.kind === "pointer") return <span>{SEE_THIS_HOMES_CHECK}</span>;
  if (cell.kind === "line") return <span>{cell.text}</span>;
  // Item 43 (parity fix batch): the Master's comparison
  // miles are plain bold Forest text after a "·" — no
  // tinted distance pill in a comparison cell.
  return (
    <span>
      {cell.name} · <span className="compare-mi">{formatMiles(cell.miles)} mi</span>
    </span>
  );
}

export default function ShortlistPage() {
  const [state, setState] = useState<State>({ kind: "pending" });
  // The comparison's form follows the viewport (D70 R5/D17):
  // the design's shared-label table at desktop widths, the
  // proven block stacking below them. The page's content is
  // client-resolved already, so the form resolves with it.
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const read = () => {
      const load = loadShortlist();
      setState(
        load.status === "ok" ? { kind: "ready", record: load.record } : { kind: "unavailable" },
      );
    };
    read();
    return subscribeShortlistChanged(read);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 48rem)");
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  if (state.kind === "pending") return null;

  if (state.kind === "unavailable") {
    return (
      <>
        <ShortlistHead lead={false} />
        <p className="shortlist-unavailable" data-shortlist-state="unavailable">
          {SHORTLIST_UNAVAILABLE_LINE}
        </p>
      </>
    );
  }

  const { record } = state;
  if (record.cards.length === 0) {
    return (
      <>
        <ShortlistHead lead={false} />
        <section className="shortlist-empty" data-shortlist-state="empty">
          {/* D8 (parity fix stack, 18 Nov 2026): the sample's
            empty state is the dashed-brass paper card alone
            — it carries no illustration, so the dog the D70
            pass dressed this panel with is removed under
            the founder's exact-parity ruling. */}
          <h2>{SHORTLIST_EMPTY_HEADING}</h2>
          <p>{SHORTLIST_EMPTY_LINE}</p>
        </section>
        {/* The sample's search card (view 14), under the
            empty card. Item 41 (parity fix batch): the
            sample's card is a PLAIN form — a text input and
            the brass button, no suggestions dropdown and no
            picker behaviour. It submits to /search like
            the landing search (a full postcode now lands
            on that postcode's check). Empty state only; the
            saved states' PostcodeBox usage is untouched. */}
        <section className="shortlist-search-card">
          <h2>Check a home</h2>
          <form className="shortlist-search-form" action="/search" method="get">
            <label className="visually-hidden" htmlFor="shortlist-postcode">
              Postcode
            </label>
            <input
              id="shortlist-postcode"
              name="postcode"
              type="text"
              placeholder="Enter a postcode — e.g. SW1A 1AA"
              autoComplete="postal-code"
            />
            <button type="submit" className="btn btn--brass shortlist-search-form__button">
              Check this home
            </button>
          </form>
        </section>
      </>
    );
  }

  const onRemove = (id: string) => {
    const next = removeCardFromRecord(record, id);
    if (!saveShortlist(next)) {
      setState({ kind: "unavailable" });
      return;
    }
    setState({ kind: "ready", record: next });
    notifyShortlistChanged();
  };

  const comparison = buildComparison(record.cards);
  const compareHeading =
    record.cards.length === 1 ? "The facts for this home" : "Your saved homes, side by side";

  return (
    <>
      <ShortlistHead lead />
      <div data-shortlist-state="ready">
        {/* D8: the cards grid is keyed by the count — the
          sample's one / two-across / three-across forms. */}
        <ul
          className={`shortlist-cards${
            record.cards.length === 2
              ? " shortlist-cards--two"
              : record.cards.length >= 3
                ? " shortlist-cards--three"
                : ""
          }`}
        >
          {record.cards.map((card) => {
            const saleLine = cardLastSaleLine(card);
            return (
              <li className="shortlist-card" key={card.id} data-rung={card.rung}>
                <h2 className="shortlist-card__address">{card.addressLine}</h2>
                {saleLine && <p className="shortlist-card__sale">{saleLine}</p>}
                {/* The facts line renders at rung 3 only: its
                  named states explain what the wider area
                  cannot serve. At rung 1 the table below
                  carries the same facts as rows, so the card
                  line would only duplicate them. */}
                {card.rung === 3 && card.factsLine && (
                  <p className="shortlist-card__facts">{card.factsLine}</p>
                )}
                <p className="shortlist-card__actions">
                  {/* One action on the card: Remove. The home's
                    buy button lives once, at its table
                    column's foot (founder's ruling, 17 Nov
                    2026). */}
                  <button
                    type="button"
                    className="remove-btn"
                    aria-label={`Remove ${card.addressLine}`}
                    onClick={() => onRemove(card.id)}
                  >
                    Remove
                  </button>
                </p>
              </li>
            );
          })}
        </ul>
        <section className="shortlist-compare" aria-label={compareHeading}>
          <h2>{compareHeading}</h2>
          {wide ? (
            // The desktop form (D70 R5/D17): the design's
            // shared-label table — the first column names each
            // check once, one column per home, values aligned,
            // one report button at each column's foot, in the
            // results page's own words.
            <table className="compare-table" data-card-count={comparison.columns.length}>
              <thead>
                <tr>
                  {/* Sample parity (18 Nov 2026): the first
                    header cell is visually blank — "Check"
                    survives for screen readers only — and a
                    column header is the address alone; the
                    sale line lives on the card above, not
                    repeated here. */}
                  <th scope="col">
                    <span className="visually-hidden">Check</span>
                  </th>
                  {comparison.columns.map((card) => (
                    <th scope="col" key={card.id} data-rung={card.rung}>
                      {card.addressLine}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparison.rows.map((row) => (
                  <tr key={row.key} data-compare-row={row.key}>
                    <th scope="row">{row.label}</th>
                    {row.cells.map((cell, columnIndex) => (
                      <td key={comparison.columns[columnIndex].id}>
                        <CompareCell cell={cell} family={row.family} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  {/* Item 45 (parity fix batch): the Master's
                      foot row opens with a row header
                      carrying the screen-reader-only
                      "Reports" label, not an empty cell. */}
                  <th scope="row">
                    <span className="visually-hidden">Reports</span>
                  </th>
                  {comparison.columns.map((card) => (
                    <td key={card.id}>
                      <a className="report-btn" href={cardReportHref(card)}>
                        Get the full report — {REPORT_PRICE_LABEL}
                      </a>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          ) : (
            // The phone form: the proven block stacking — one
            // block per home, its rows labelled per block.
            <div
              className="shortlist-compare__grid"
              style={{ "--compare-columns": comparison.columns.length } as React.CSSProperties}
            >
              {comparison.columns.map((card, columnIndex) => {
                // Item 44 (parity fix batch): the phone form
                // carries NO sale line — the Master's stacked
                // blocks omit it, as the wide table does; the
                // sale line lives on the card above.
                return (
                  <div className="shortlist-compare__column" key={card.id} data-rung={card.rung}>
                    <h3 className="shortlist-compare__address">{card.addressLine}</h3>
                    <dl className="shortlist-compare__rows">
                      {comparison.rows.map((row) => (
                        <div
                          className="shortlist-compare__row"
                          key={row.key}
                          data-compare-row={row.key}
                        >
                          <dt>{row.label}</dt>
                          <dd>
                            <CompareCell cell={row.cells[columnIndex]} family={row.family} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <p className="shortlist-compare__actions">
                      <a className="report-btn" href={cardReportHref(card)}>
                        Get the full report — {REPORT_PRICE_LABEL}
                      </a>
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        {/* The kept line closes the page (founder's ruling,
          17 Nov 2026): small print at the bottom, below the
          table — its class carries the small size. */}
        <p className="shortlist-kept-line">{SHORTLIST_KEPT_LINE}</p>
      </div>
    </>
  );
}
