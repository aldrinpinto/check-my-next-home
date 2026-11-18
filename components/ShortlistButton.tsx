"use client";

import { useEffect, useState } from "react";

import {
  SHORTLIST_FULL_LINE,
  SHORTLIST_LIMIT,
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

// The add control (plan step M7.5, fold-ins 3, 4 and 8):
// "Shortlist this home" in two unmistakable states — one
// tap saves, tapping again un-saves. The card record is
// embedded by the server-rendered results page at render
// (fold-in 8), so the snapshot written here is provably the
// facts the visitor saw; this control stamps the save
// moment and writes through lib/shortlist.ts's storage
// contract, nothing else.
//
// The control sits inside the results page's buy bar,
// beside the report button (plan step M7.6 — the move
// this component's M7.5 note recorded as owed, discharged
// there; at rung 3, where there is no buy bar, it stays
// beside the scope-label heading). One control per page,
// never duplicated.
//
// When the list already holds 3, tapping add replaces the
// button in place with the full line and a link to the
// shortlist (founder's ruling, 17 Nov 2026 — a simple
// message, no panel): nothing opens, nothing is saved, and
// removing a home on the shortlist page brings the button
// back. When storage itself is unavailable, the named line
// renders in place of the control — never a silent failure
// (fold-in 5).

type State =
  { kind: "pending" } | { kind: "unavailable" } | { kind: "ready"; record: ShortlistRecord };

export default function ShortlistButton({ card }: { card: ShortlistCard }) {
  const [state, setState] = useState<State>({ kind: "pending" });
  const [fullNotice, setFullNotice] = useState(false);

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
      setFullNotice(true);
      return;
    }
    setFullNotice(false);
    write(attempt.record);
  };

  // The full message stands in the button's place only
  // while the list is in fact full: a removal elsewhere
  // (the shortlist page, another tab) re-reads the record
  // through the subscription and the button returns.
  if (fullNotice && record && !saved && record.cards.length >= SHORTLIST_LIMIT) {
    return (
      <p className="shortlist-full-line" data-shortlist-state="full">
        {SHORTLIST_FULL_LINE} <a href="/shortlist">See your shortlist</a>
      </p>
    );
  }

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
    </div>
  );
}
