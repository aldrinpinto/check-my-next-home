"use client";

import { useState } from "react";

import {
  EMPTY_PICKER_LINE,
  PICKER_EXPLAINER,
  PICK_FALLBACK_FLAG,
  homeRoute,
  pickerCountLine,
} from "../lib/journey";

// The home list on the whole-postcode check (founder
// ruling, 18 Nov 2026, parity fix batch: the picker page
// is REMOVED and its list moved here). The whole-postcode
// check carries the postcode's full home list — the union
// read model in natural address order, uncapped as the
// dropdown's full-postcode list is — each home linking
// straight to its own check. The hybrid supplement
// machinery (pickerRowsFor: the local union plus the
// Postio supplement below the floor) feeds this list
// exactly as it fed the picker, so no behaviour is lost.
//
// A local row is a plain link to its home key. A Postio
// row resolves through /api/pick on click (the transient
// record, or the mid-pick fallback) — the same machinery
// the picker's confirm used, minus select-then-confirm:
// on this page the visitor is already looking at the
// postcode's check, so a row click IS the pick.

export interface PickerAddress {
  key: string;
  label: string;
  // The layer that supplied the row (entry-point build,
  // D72): a local row links straight to its home key; a
  // Postio row resolves through /api/pick, which answers
  // the URL to navigate to.
  source?: "local" | "postio";
  udprn?: string;
}

export default function HomeList({
  postcode,
  heading,
  addresses,
}: {
  postcode: string;
  heading: string;
  addresses: PickerAddress[];
}) {
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);

  if (addresses.length === 0) {
    // The empty list: a valid England/Wales postcode whose
    // filed addresses we cannot list yet — the postcode
    // check below still serves (the ruling's zero-home
    // fallback line, unchanged).
    return (
      <div className="picker picker--empty">
        <h2>{heading}</h2>
        <p className="picker__empty-line">{EMPTY_PICKER_LINE}</p>
      </div>
    );
  }

  const resolvePostioRow = (row: PickerAddress) => {
    // A Postio row: the pick resolves server-side (the
    // transient record, or the mid-pick fallback when the
    // backstop cannot answer). A pick call that itself
    // fails lands on the same fallback — the journey never
    // dead-ends here.
    setResolvingKey(row.key);
    void (async () => {
      try {
        const response = await fetch("/api/pick", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ postcode, udprn: row.udprn }),
        });
        const data = (await response.json()) as { url?: string };
        window.location.assign(
          data.url ??
            `/search/home?postcode=${encodeURIComponent(postcode)}&notfound=${PICK_FALLBACK_FLAG}`,
        );
      } catch {
        window.location.assign(
          `/search/home?postcode=${encodeURIComponent(postcode)}&notfound=${PICK_FALLBACK_FLAG}`,
        );
      }
    })();
  };

  return (
    <div className="picker">
      <h2>{heading}</h2>
      <p className="picker__explainer">{PICKER_EXPLAINER}</p>
      <p className="picker__count">{pickerCountLine(addresses.length)}</p>
      <ul className="picker__list">
        {addresses.map((address) => (
          <li key={address.key}>
            {address.source === "postio" && address.udprn ? (
              <button
                type="button"
                className="picker__row"
                disabled={resolvingKey !== null}
                onClick={() => resolvePostioRow(address)}
              >
                <span>{address.label}</span>
              </button>
            ) : (
              <a className="picker__row" href={homeRoute(postcode, address.key)}>
                <span>{address.label}</span>
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
