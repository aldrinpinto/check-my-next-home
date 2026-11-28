"use client";

import { useEffect, useRef, useState } from "react";

import { homeRoute } from "../lib/journey";
import { REPORT_ROUTE, formatMiles, reportRoute, type DistanceFamily } from "../lib/results";
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
  comparisonCellBand,
  isShortlistCard,
  isStaleShortlistCard,
  loadShortlist,
  notifyShortlistChanged,
  removeCardFromRecord,
  saveShortlist,
  subscribeShortlistChanged,
  type ComparisonRowKey,
  type ComparisonView,
  type ShortlistCard,
  type ShortlistCell,
  type ShortlistRecord,
} from "../lib/shortlist";
import { fireJourneyEvent } from "./JourneyBeacon";
import PostcodeBox from "./PostcodeBox";
import ReportLink from "./ReportLink";

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
// the empty card — built as the sample's plain form in
// the parity fix batch (item 41), and carrying the
// standard PostcodeBox since BUG-147 (22 Nov 2026).
//
// The two named lines stay distinct (fold-in 5): storage
// unavailable renders its own line where the shortlist
// would be; storage working but empty renders the Final
// Design's Section 4B empty state. Cards render in saved
// order from their snapshots — facts are never re-derived
// on view (ruling 3), except the BUG-309 refresh of a
// snapshot that cannot render completely — and removing a
// card here is the same storage write the results page's
// button state reads.
// BUG-304 (founder ruling, 25 Nov 2026): the cards have
// no row of their own any more — each home's card content
// (address, sale line, Remove) lives in its column's
// header cell (CompareColumnHead below), so the page has
// one grid and alignment holds by construction.
//
// The facts table renders from ONE saved home (founder's
// rulings, 17 Nov 2026): a single home's table is headed
// "The facts for this home", two or more are "side by
// side". A rung-3 card keeps its facts line, whose named
// states explain missing data rather than duplicating the
// table — it stands in the header cell with the rest of
// the card's content. The kept line closes the page, in
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
  rowKey,
  family,
}: {
  cell: ShortlistCell;
  rowKey: ComparisonRowKey;
  family: DistanceFamily | null;
}) {
  // Pointer cells are legacy: only cards saved before the
  // 17 Nov 2026 ruling (real flood/crime figures in the
  // cells) hold them, and they still render their pointer
  // rather than dropping a saved list for its age.
  if (cell.kind === "pointer") return <span>{SEE_THIS_HOMES_CHECK}</span>;
  // BUG-163 (founder ruling, 22 Nov 2026): the table takes
  // the reports' colour coding. The band comes from
  // lib/shortlist.ts's comparisonCellBand — the pill
  // machinery's own bands, never a second threshold set —
  // and the colour lives on the VALUE, in the pills'
  // coloured figure dress (the .pill__figure chip). This
  // supersedes item 43 of the parity fix batch, under
  // which the Master's comparison miles stood plain bold
  // Forest with no tint; the Master itself is not edited
  // here. A cell with no band keeps its plain dress.
  const band = comparisonCellBand(rowKey, family, cell);
  if (cell.kind === "segments") {
    // BUG-291 (founder's ruling, 25 Nov 2026): the colour
    // lives on the VALUES, not the line — each banded
    // segment takes the pill's dress (the same classes
    // the whole-line span wore), the plain segments stay
    // unstyled. The band comes from the segment itself,
    // not comparisonCellBand, which returns null here.
    return (
      <span>
        {cell.segments.map((segment, index) =>
          segment.band ? (
            <span key={index} className={`pill__figure pill__figure--${segment.band} compare-val`}>
              {segment.text}
            </span>
          ) : (
            <span key={index}>{segment.text}</span>
          ),
        )}
      </span>
    );
  }
  if (cell.kind === "line") {
    if (!band) return <span>{cell.text}</span>;
    return <span className={`pill__figure pill__figure--${band} compare-val`}>{cell.text}</span>;
  }
  if (!band) {
    // BUG-190 (founder-found 23 Nov 2026): a bandless
    // distance — GP, the row the product never colours —
    // takes the sibling rows' form after all: the name
    // as stored, the distance standing in a pill. The
    // pill is the plain, uncoloured chip (the GP rule
    // stands: no colour), not the bold green text that
    // used to set this one row apart.
    return (
      <span>
        {cell.name} ·{" "}
        <span className="pill__figure pill__figure--plain">{formatMiles(cell.miles)} mi</span>
      </span>
    );
  }
  return (
    <span>
      {cell.name} ·{" "}
      <span className={`pill__figure pill__figure--${band}`}>{formatMiles(cell.miles)} mi</span>
    </span>
  );
}

// BUG-401 (founder instruction, 28 Nov 2026): the
// address re-runs the search for that home — the same
// flow the search box performs for a picked home
// (homeRoute, postcode + home key, same tab), landing
// on /search/home, whose checking screen advances to
// the headline report. A rung-3 card holds an area, not
// a home — no home key — so its address stays plain.
// The link keeps the Master's dress (samples 14–16):
// it inherits the address's colour with no underline;
// the underline appears on hover and keyboard focus
// only (see app/globals.css). Shared by the table head
// and the stacked block, so the two heads cannot drift.
function ShortlistAddress({ card, className }: { card: ShortlistCard; className: string }) {
  if (card.rung !== 1 || !card.homeKey) return <>{card.addressLine}</>;
  return (
    <a className={className} href={homeRoute(card.postcode, card.homeKey)}>
      {card.addressLine}
    </a>
  );
}

// BUG-304 (founder ruling, 25 Nov 2026): a column's
// header cell IS the card now. The tiles row above the
// table is gone — its own 3-column grid never lined up
// with the table's label column, and its cards were
// uneven heights — so each home's card content moves
// here: the address, the card's sale line (price, last
// sale, type) and Remove. A home with no recorded sale
// shows the address and Remove only, as the card did —
// no "No sale filed" line is invented. At rung 3 the
// card's facts line stands here too: its named states
// are not repeated by the table's rows. The report
// button stays out of the header — one buy button per
// home, at its column's foot (founder's ruling, 17 Nov
// 2026). Shared by the desktop table, the phone swipe
// table and (in kind, below) the stacked blocks.
//
// BUG-400 (founder instruction, 28 Nov 2026): the
// head is a flex column that fills the cell, so the
// Remove actions take the free space above them and
// sit at the same height in every column — whether or
// not the sale line (or the rung-3 facts line) is
// there. The swipe table shares this head, so the fix
// covers the phone form too.
function CompareColumnHead({
  card,
  onRemove,
}: {
  card: ShortlistCard;
  onRemove: (id: string) => void;
}) {
  const saleLine = cardLastSaleLine(card);
  return (
    <div className="compare-table__head">
      <ShortlistAddress card={card} className="compare-table__address" />
      {saleLine && <p className="compare-table__sale">{saleLine}</p>}
      {card.rung === 3 && card.factsLine && (
        <p className="compare-table__facts">{card.factsLine}</p>
      )}
      <p className="compare-table__actions">
        {/* One action in the header: Remove. The home's
          buy button lives once, at its table column's
          foot (founder's ruling, 17 Nov 2026). */}
        <button
          type="button"
          className="remove-btn"
          aria-label={`Remove ${card.addressLine}`}
          onClick={() => onRemove(card.id)}
        >
          Remove
        </button>
      </p>
    </div>
  );
}

export function CompareSwipeTable({
  comparison,
  onRemove,
}: {
  comparison: ComparisonView;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="compare-table__scroller">
      <table
        className="compare-table compare-table--swipe"
        data-card-count={comparison.columns.length}
      >
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Check</span>
            </th>
            {comparison.columns.map((card) => (
              <th scope="col" key={card.id} data-rung={card.rung}>
                <CompareColumnHead card={card} onRemove={onRemove} />
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
                  <CompareCell cell={cell} rowKey={row.key} family={row.family} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">
              <span className="visually-hidden">Reports</span>
            </th>
            {comparison.columns.map((card) => (
              <td key={card.id}>
                <ReportLink className="report-btn" href={cardReportHref(card)}>
                  Get the full report — {REPORT_PRICE_LABEL}
                </ReportLink>
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function ShortlistPage() {
  const [state, setState] = useState<State>({ kind: "pending" });
  // The comparison's form follows the viewport (D70 R5/D17):
  // the design's shared-label table at desktop widths, the
  // proven block stacking below them. The page's content is
  // client-resolved already, so the form resolves with it.
  const [wide, setWide] = useState(false);
  // The phone form (founder-picked option 1, 24 Nov 2026):
  // below 40rem the comparison is the swipe table — the
  // desktop table's own form in a horizontal scroller.
  // A second, narrower breakpoint, so the 40–48rem band
  // keeps exactly today's stacked blocks and desktop is
  // untouched.
  const [phone, setPhone] = useState(false);

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

  useEffect(() => {
    const query = window.matchMedia("(max-width: 40rem)");
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // BUG-309: a stale saved snapshot — one saved before
  // the comparison carried bands, the crime verdict, air
  // quality or the price line (BUG-189's residue) —
  // renders incompletely from its snapshot. Once per
  // mount, each stale card is re-derived from the current
  // check data through /api/shortlist-card and replaced
  // in storage, in place: same order, same savedAt —
  // only the facts update. A fetch that fails keeps the
  // stored card: the refresh is a repair, never a reason
  // to drop a saved home. (The exception to ruling 3's
  // "facts are never re-derived on view", recorded in
  // lib/shortlist.ts: a snapshot that cannot render
  // completely is refreshed, not shown broken.)
  const refreshedRef = useRef(false);
  useEffect(() => {
    if (refreshedRef.current) return;
    if (state.kind !== "ready") return;
    const stale = state.record.cards.filter(isStaleShortlistCard);
    if (stale.length === 0) {
      refreshedRef.current = true;
      return;
    }
    refreshedRef.current = true;
    void (async () => {
      const fresh = new Map<string, ShortlistCard>();
      await Promise.all(
        stale.map(async (card) => {
          try {
            const params =
              card.rung === 3
                ? `outward=${encodeURIComponent(card.postcode)}`
                : `postcode=${encodeURIComponent(card.postcode)}&home=${encodeURIComponent(card.homeKey ?? "")}`;
            const response = await fetch(`/api/shortlist-card?${params}`);
            if (!response.ok) return;
            const data = (await response.json()) as { card?: unknown };
            if (!isShortlistCard(data.card)) return;
            fresh.set(card.id, { ...data.card, savedAt: card.savedAt });
          } catch {
            // Keep the stored card — see above.
          }
        }),
      );
      if (fresh.size === 0) return;
      // Re-read the record fresh — a removal elsewhere
      // may have changed it while the fetches were out —
      // and replace only the cards that refreshed, in place.
      const load = loadShortlist();
      if (load.status !== "ok") return;
      const next: ShortlistRecord = {
        v: 1,
        cards: load.record.cards.map((card) => fresh.get(card.id) ?? card),
      };
      if (saveShortlist(next)) {
        setState({ kind: "ready", record: next });
        notifyShortlistChanged();
      }
    })();
  }, [state]);

  // M7.14: the comparison counts as opened when the page
  // first shows it — the ready state with at least one
  // saved home (the comparison renders with the cards).
  // Once per page mount; a removal that empties the list
  // does not un-open it, and a later add does not re-open
  // what is already on screen.
  const comparisonCounted = useRef(false);
  useEffect(() => {
    if (comparisonCounted.current) return;
    if (state.kind === "ready" && state.record.cards.length >= 1) {
      comparisonCounted.current = true;
      fireJourneyEvent("comparison_opened");
    }
  }, [state]);

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
            empty card. Item 41 (parity fix batch) built
            the sample's PLAIN form here — a text input
            and the brass button, no suggestions. BUG-147
            (founder finding, 22 Nov 2026) retires it: the
            plain form dead-ended on anything it could not
            resolve (a place name typed into it went
            nowhere), so the card now carries the standard
            PostcodeBox (D72 hybrid), the same box as
            every other surface. Empty state only. */}
        <section className="shortlist-search-card">
          <h2>Check a home</h2>
          <PostcodeBox bare />
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
    // M7.14: the removal is counted — the fact only,
    // never which home.
    fireJourneyEvent("shortlist_remove");
  };

  const comparison = buildComparison(record.cards);
  const compareHeading =
    record.cards.length === 1 ? "The facts for this home" : "Your saved homes, side by side";

  return (
    <>
      <ShortlistHead lead />
      <div data-shortlist-state="ready">
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
                    column header is the card now (BUG-304):
                    the address, the sale line and Remove,
                    so the address appears once per column. */}
                  <th scope="col">
                    <span className="visually-hidden">Check</span>
                  </th>
                  {comparison.columns.map((card) => (
                    <th scope="col" key={card.id} data-rung={card.rung}>
                      <CompareColumnHead card={card} onRemove={onRemove} />
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
                        <CompareCell cell={cell} rowKey={row.key} family={row.family} />
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
                      <ReportLink className="report-btn" href={cardReportHref(card)}>
                        Get the full report — {REPORT_PRICE_LABEL}
                      </ReportLink>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          ) : phone ? (
            // The phone form (founder-picked option 1,
            // 24 Nov 2026): the swipe table — the desktop
            // table's own rows, cells and foot buttons in
            // a horizontal scroller, the fact labels
            // pinned in a fixed first column. The heading
            // above ("side by side") becomes true on
            // mobile too. Below 40rem only.
            <CompareSwipeTable comparison={comparison} onRemove={onRemove} />
          ) : (
            // The 40–48rem band keeps the proven block
            // stacking — one block per home, its rows
            // labelled per block — exactly as before.
            <div
              className="shortlist-compare__grid"
              style={{ "--compare-columns": comparison.columns.length } as React.CSSProperties}
            >
              {comparison.columns.map((card, columnIndex) => {
                // BUG-304 (founder ruling, 25 Nov 2026):
                // the stacked block's heading area is the
                // card in kind — the address, the card's
                // sale line and Remove stand above the
                // block's rows, as the header cell carries
                // them in the two table forms. A home with
                // no recorded sale shows the address and
                // Remove only; at rung 3 the facts line
                // stands here too. BUG-401: the address
                // is the same search-flow control as the
                // table head (ShortlistAddress).
                const saleLine = cardLastSaleLine(card);
                return (
                  <div className="shortlist-compare__column" key={card.id} data-rung={card.rung}>
                    <h3 className="shortlist-compare__address">
                      <ShortlistAddress card={card} className="shortlist-compare__address-link" />
                    </h3>
                    {saleLine && <p className="shortlist-compare__sale">{saleLine}</p>}
                    {card.rung === 3 && card.factsLine && (
                      <p className="shortlist-compare__facts">{card.factsLine}</p>
                    )}
                    <p className="shortlist-compare__remove">
                      <button
                        type="button"
                        className="remove-btn"
                        aria-label={`Remove ${card.addressLine}`}
                        onClick={() => onRemove(card.id)}
                      >
                        Remove
                      </button>
                    </p>
                    <dl className="shortlist-compare__rows">
                      {comparison.rows.map((row) => (
                        <div
                          className="shortlist-compare__row"
                          key={row.key}
                          data-compare-row={row.key}
                        >
                          <dt>{row.label}</dt>
                          <dd>
                            <CompareCell
                              cell={row.cells[columnIndex]}
                              rowKey={row.key}
                              family={row.family}
                            />
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <p className="shortlist-compare__actions">
                      <ReportLink className="report-btn" href={cardReportHref(card)}>
                        Get the full report — {REPORT_PRICE_LABEL}
                      </ReportLink>
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
