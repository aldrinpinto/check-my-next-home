"use client";

import { useState } from "react";

import {
  EMPTY_PICKER_LINE,
  PICKER_EXPLAINER,
  PICKER_SELECT_PROMPT,
  PICK_FALLBACK_FLAG,
  homeRoute,
} from "../lib/journey";

// The home picker on the whole-postcode check (founder
// ruling, 20 Nov 2026, superseding the 18 Nov 2026 list
// form): ONE dropdown under the intro line carries the
// postcode's homes — the full address list dump and its
// count line are gone. The rows arrive in natural address
// order (house-number order) from the union read model —
// the hybrid supplement machinery (pickerRowsFor: the
// local union plus the Postio supplement below the
// floor) feeds this dropdown exactly as it fed the list,
// so no behaviour is lost.
//
// Choosing a home goes straight to its check: a local
// row navigates to its home route; a Postio row resolves
// through /api/pick first (the transient record, or the
// mid-pick fallback) — the same machinery the list's
// rows used, minus the rendered list: on this page the
// visitor is already looking at the postcode's check, so
// the choice IS the pick. The select wears the kit's
// field dress (.field / .field__input), the site's one
// form-control form.

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

  const pick = (key: string) => {
    const row = addresses.find((address) => address.key === key);
    if (!row) return;
    if (row.source === "postio" && row.udprn) {
      resolvePostioRow(row);
      return;
    }
    window.location.assign(homeRoute(postcode, row.key));
  };

  return (
    <div className="picker">
      <h2>{heading}</h2>
      <p className="picker__explainer">{PICKER_EXPLAINER}</p>
      <div className="field picker__field">
        <select
          className="field__input picker__select"
          aria-label={PICKER_SELECT_PROMPT}
          defaultValue=""
          disabled={resolvingKey !== null}
          onChange={(event) => pick(event.target.value)}
        >
          <option value="" disabled>
            {PICKER_SELECT_PROMPT}
          </option>
          {addresses.map((address) => (
            <option key={address.key} value={address.key}>
              {address.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
