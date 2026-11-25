"use client";

import { useEffect, useState } from "react";

import {
  SHORTLIST_FULL_LINE,
  SHORTLIST_LIMIT,
  SHORTLIST_SAVE_FAILED_LINE,
  SHORTLIST_UNAVAILABLE_LINE,
  addCardToRecord,
  isCardSaved,
  isShortlistCard,
  loadShortlist,
  notifyShortlistChanged,
  removeCardFromRecord,
  saveShortlist,
  shortlistCardId,
  subscribeShortlistChanged,
  type ShortlistRecord,
} from "../lib/shortlist";
import { fireJourneyEvent } from "./JourneyBeacon";

// The district Save button (BUG-318): "Shortlist this
// area" beside each place-page row — the rung-3 twin of
// the results page's ShortlistButton, in the same dress
// (the white pill, the saved state in the green tint)
// and the same two states. It differs in exactly one
// place: the results page's button carries its card
// embedded at render, while a district row carries no
// card — the card is derived on the first save tap,
// through GET /api/shortlist-card?outward=…, and
// validated (isShortlistCard) before anything is
// written. A removal needs no fetch and no card. No
// fetch fires on mount: the London place page lists
// 279 districts, and a fetch per row would be 279
// derivations for buttons nobody tapped.
//
// The button sits BESIDE its row's link, never inside
// it — a button inside a link is invalid HTML and a tap
// would navigate instead of saving. The row's list item
// is the flex parent (see .district-place__item), so
// the button shows at every desktop width, including
// 1519px, where the audit found none.
//
// When the list already holds 3, tapping add replaces
// the button in place with the full line and a link to
// the shortlist (the ShortlistButton ruling, 17 Nov
// 2026): nothing opens, nothing is saved. When the
// fetch fails, the named line stands under the button
// and the button stays, so the visitor can try again.
// When storage itself is unavailable, the named line
// renders in place of the control — never a silent
// failure (fold-in 5).

type State =
  { kind: "pending" } | { kind: "unavailable" } | { kind: "ready"; record: ShortlistRecord };

export default function DistrictSaveButton({ outward }: { outward: string }) {
  const id = shortlistCardId(3, outward, null);
  const [state, setState] = useState<State>({ kind: "pending" });
  const [fullNotice, setFullNotice] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [saving, setSaving] = useState(false);

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
  const saved = record !== null && isCardSaved(record, id);

  const write = (next: ShortlistRecord): boolean => {
    if (!saveShortlist(next)) {
      setState({ kind: "unavailable" });
      return false;
    }
    setState({ kind: "ready", record: next });
    notifyShortlistChanged();
    return true;
  };

  const onToggle = () => {
    if (!record || saving) return;
    if (saved) {
      // M7.14: the removal is counted — the fact only,
      // never which area (the event carries no card data).
      if (write(removeCardFromRecord(record, id))) {
        fireJourneyEvent("shortlist_remove");
      }
      return;
    }
    // The first save derives the card fresh — the facts
    // as they stand now, not a snapshot from render.
    setSaving(true);
    setFetchFailed(false);
    void (async () => {
      try {
        const response = await fetch(`/api/shortlist-card?outward=${encodeURIComponent(outward)}`);
        if (!response.ok) throw new Error("shortlist-card-failed");
        const data = (await response.json()) as { card?: unknown };
        if (!isShortlistCard(data.card)) throw new Error("shortlist-card-shape");
        const attempt = addCardToRecord(record, {
          ...data.card,
          savedAt: new Date().toISOString(),
        });
        if (attempt.outcome === "full") {
          setFullNotice(true);
          return;
        }
        setFullNotice(false);
        if (write(attempt.record) && attempt.outcome === "added") {
          fireJourneyEvent("shortlist_add");
        }
      } catch {
        setFetchFailed(true);
      } finally {
        setSaving(false);
      }
    })();
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
          Its words are the ShortlistButton's pinned two
          states, with "area" for "home". */}
      <button
        type="button"
        className={saved ? "shortlist-btn shortlist-btn--saved" : "shortlist-btn"}
        aria-pressed={saved}
        data-shortlist-toggle={id}
        disabled={saving}
        onClick={onToggle}
      >
        {saved ? "Shortlisted — tap to remove" : "Shortlist this area"}
      </button>
      {fetchFailed && (
        <p className="shortlist-save-failed" role="alert">
          {SHORTLIST_SAVE_FAILED_LINE}
        </p>
      )}
    </div>
  );
}
