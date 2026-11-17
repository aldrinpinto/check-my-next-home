"use client";

import { useEffect, useState } from "react";

import { REPORT_ROUTE, distanceBand, formatMiles } from "../lib/results";
import {
  SHORTLIST_EMPTY_HEADING,
  SHORTLIST_EMPTY_LINE,
  SHORTLIST_KEPT_LINE,
  SHORTLIST_UNAVAILABLE_LINE,
  SEE_THIS_HOMES_CHECK,
  buildComparison,
  cardLastSaleLine,
  comparisonSaleLine,
  loadShortlist,
  notifyShortlistChanged,
  removeCardFromRecord,
  saveShortlist,
  subscribeShortlistChanged,
  type ShortlistCell,
  type ShortlistRecord,
} from "../lib/shortlist";
import { Button } from "./kit";

// The /shortlist page's client island (plan step M7.5,
// fold-in 6): the server sends the shell and page furniture
// only; the cards, the comparison and the named lines
// resolve here, from browser storage — no serve call, so
// the page is exact under the second-context absence check
// and works while the play server is down.
//
// The two named lines stay distinct (fold-in 5): storage
// unavailable renders its own line where the shortlist
// would be; storage working but empty renders the Final
// Design's Section 4B empty state. Cards render in saved
// order from their snapshots — facts are never re-derived
// on view (ruling 3) — and removing a card here is the same
// storage write the results page's button state reads.

type State =
  { kind: "pending" } | { kind: "unavailable" } | { kind: "ready"; record: ShortlistRecord };

function CompareCell({
  cell,
  family,
}: {
  cell: ShortlistCell;
  family: "school" | "everyday" | "hospital" | null;
}) {
  if (cell.kind === "pointer") return <span>{SEE_THIS_HOMES_CHECK}</span>;
  if (cell.kind === "line") return <span>{cell.text}</span>;
  return (
    <span>
      {cell.name}{" "}
      <span
        className={`place-row__miles${family ? ` place-row__miles--${distanceBand(family, cell.miles)}` : ""}`}
      >
        {formatMiles(cell.miles)} mi
      </span>
    </span>
  );
}

export default function ShortlistPage() {
  const [state, setState] = useState<State>({ kind: "pending" });

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

  if (state.kind === "pending") return null;

  if (state.kind === "unavailable") {
    return (
      <p className="shortlist-unavailable" data-shortlist-state="unavailable">
        {SHORTLIST_UNAVAILABLE_LINE}
      </p>
    );
  }

  const { record } = state;
  if (record.cards.length === 0) {
    return (
      <section className="shortlist-empty" data-shortlist-state="empty">
        <h2>{SHORTLIST_EMPTY_HEADING}</h2>
        <p>{SHORTLIST_EMPTY_LINE}</p>
      </section>
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

  const comparison = record.cards.length >= 2 ? buildComparison(record.cards) : null;

  return (
    <div data-shortlist-state="ready">
      <ul className="shortlist-cards">
        {record.cards.map((card) => {
          const saleLine = cardLastSaleLine(card);
          return (
            <li className="shortlist-card" key={card.id} data-rung={card.rung}>
              <h2 className="shortlist-card__address">{card.addressLine}</h2>
              {saleLine && <p className="shortlist-card__sale">{saleLine}</p>}
              {card.factsLine && <p className="shortlist-card__facts">{card.factsLine}</p>}
              <p className="shortlist-card__actions">
                <a className="btn btn--primary" href={REPORT_ROUTE}>
                  Get the full report
                </a>{" "}
                <Button
                  type="button"
                  variant="quiet"
                  aria-label={`Remove ${card.addressLine}`}
                  onClick={() => onRemove(card.id)}
                >
                  Remove
                </Button>
              </p>
            </li>
          );
        })}
      </ul>
      <p className="shortlist-kept-line">{SHORTLIST_KEPT_LINE}</p>
      {comparison && (
        <section className="shortlist-compare" aria-label="Your saved homes, side by side">
          <h2>Your saved homes, side by side</h2>
          <div
            className="shortlist-compare__grid"
            style={{ "--compare-columns": comparison.columns.length } as React.CSSProperties}
          >
            {comparison.columns.map((card, columnIndex) => {
              const saleLine = comparisonSaleLine(card);
              return (
                <div className="shortlist-compare__column" key={card.id} data-rung={card.rung}>
                  <h3 className="shortlist-compare__address">{card.addressLine}</h3>
                  {saleLine && <p className="shortlist-compare__sale">{saleLine}</p>}
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
                    <a className="btn btn--primary" href={REPORT_ROUTE}>
                      Report for this home
                    </a>
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
