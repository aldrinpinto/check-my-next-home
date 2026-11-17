"use client";

import { useEffect, useState } from "react";

import { REPORT_ROUTE } from "../lib/results";
import {
  SHORTLIST_FULL_LINE,
  SHORTLIST_UNAVAILABLE_LINE,
  addCardToRecord,
  isCardSaved,
  loadShortlist,
  notifyShortlistChanged,
  removeCardFromRecord,
  saveShortlist,
  subscribeShortlistChanged,
  type ShortlistCard,
  type ShortlistRecord,
} from "../lib/shortlist";
import { Button } from "./kit";

// The add control (plan step M7.5, fold-ins 3, 4 and 8):
// "Shortlist this home" in two unmistakable states — one
// tap saves, tapping again un-saves. The card record is
// embedded by the server-rendered results page at render
// (fold-in 8), so the snapshot written here is provably the
// facts the visitor saw; this control stamps the save
// moment and writes through lib/shortlist.ts's storage
// contract, nothing else.
//
// At this step the control sits in the results header area;
// when M7.6 builds the buy bar it moves beside the report
// button there — M7.6 adopts that move deliberately (the
// deferral is recorded in docs/frontend-m7.5.md).
//
// When the list already holds 3, tapping add opens the
// add-a-4th panel in place: it states the free shortlist
// holds 3 and offers remove-one (freeing the slot in place)
// or the detailed report on a saved home via /report. When
// storage itself is unavailable, the named line renders in
// place of the control — never a silent failure (fold-in 5).

type State =
  { kind: "pending" } | { kind: "unavailable" } | { kind: "ready"; record: ShortlistRecord };

export default function ShortlistButton({ card }: { card: ShortlistCard }) {
  const [state, setState] = useState<State>({ kind: "pending" });
  const [panelOpen, setPanelOpen] = useState(false);

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

  if (state.kind === "unavailable") {
    return (
      <p className="shortlist-unavailable" data-shortlist-state="unavailable">
        {SHORTLIST_UNAVAILABLE_LINE}
      </p>
    );
  }

  const record = state.kind === "ready" ? state.record : null;
  const saved = record !== null && isCardSaved(record, card.id);

  const write = (next: ShortlistRecord) => {
    if (!saveShortlist(next)) {
      setState({ kind: "unavailable" });
      return;
    }
    setState({ kind: "ready", record: next });
    notifyShortlistChanged();
  };

  const onToggle = () => {
    if (!record) return;
    if (saved) {
      write(removeCardFromRecord(record, card.id));
      return;
    }
    const attempt = addCardToRecord(record, { ...card, savedAt: new Date().toISOString() });
    if (attempt.outcome === "full") {
      setPanelOpen(true);
      return;
    }
    write(attempt.record);
  };

  const onPanelRemove = (id: string) => {
    if (!record) return;
    write(removeCardFromRecord(record, id));
  };

  const onPanelAdd = () => {
    if (!record) return;
    const attempt = addCardToRecord(record, { ...card, savedAt: new Date().toISOString() });
    if (attempt.outcome !== "full") {
      write(attempt.record);
      setPanelOpen(false);
    }
  };

  return (
    <div className="shortlist-control">
      {/* D70 R5: the control takes the design's pill form —
          the white pill, the saved state in the green tint.
          Its words are M7.5's pinned two states, unchanged. */}
      <button
        type="button"
        className={saved ? "shortlist-btn shortlist-btn--saved" : "shortlist-btn"}
        aria-pressed={saved}
        data-shortlist-toggle={card.id}
        onClick={onToggle}
      >
        {saved ? "Shortlisted — tap to remove" : "Shortlist this home"}
      </button>
      {panelOpen && record && (
        <div className="shortlist-panel" role="group" aria-label="Your shortlist is full">
          <p className="shortlist-panel__line">{SHORTLIST_FULL_LINE}</p>
          <ul className="shortlist-panel__list">
            {record.cards.map((savedCard) => (
              <li className="shortlist-panel__item" key={savedCard.id}>
                <span className="shortlist-panel__address">{savedCard.addressLine}</span>
                <Button
                  type="button"
                  variant="quiet"
                  aria-label={`Remove ${savedCard.addressLine}`}
                  onClick={() => onPanelRemove(savedCard.id)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          <p className="shortlist-panel__line">
            <a href={REPORT_ROUTE}>Get the detailed report on a saved home — £4.99</a>
          </p>
          {record.cards.length < 3 && (
            <Button type="button" onClick={onPanelAdd}>
              Shortlist this home
            </Button>
          )}
          <Button type="button" variant="quiet" onClick={() => setPanelOpen(false)}>
            Close
          </Button>
        </div>
      )}
    </div>
  );
}
