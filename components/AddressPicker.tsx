"use client";

import { useEffect, useRef, useState } from "react";

import {
  EMPTY_PICKER_LINE,
  PICKER_CONFIRM_LABEL,
  PICKER_EXPLAINER,
  homeRoute,
  pickerCountLine,
  POSTCODE_LEVEL_LINK,
} from "../lib/journey";
import { Button } from "./kit";

// The address picker (plan step M7.3, fold-in 3) — a
// reusable component: M7.4 embeds it on the results page
// for the postcode-level upgrade (T-WEB-08), so it takes
// plain data and renders the same list everywhere.
//
// D70 R6 gives the picker its designed form: select-then-
// confirm. The rows are buttons in the brain's
// sortAddresses order (the serve layer hands the addresses
// over already sorted) — one tap selects a row (the
// selected tint, the heavy weight and a tick), and the
// full-width Ink button below confirms and starts the
// check. The list is headed by the design's explainer and
// the count line (an M7.3 fold-in the design lacks, kept),
// with no cap and no pagination in V1. Back from the
// checking screen returns here with the picked address
// retained (D44(5)(iii)): its row starts selected and
// focus returns to it.

export interface PickerAddress {
  key: string;
  label: string;
}

export default function AddressPicker({
  postcode,
  heading,
  headingLevel = 2,
  addresses,
  pickedKey = null,
}: {
  postcode: string;
  heading: string;
  headingLevel?: 1 | 2;
  addresses: PickerAddress[];
  pickedKey?: string | null;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(pickedKey);
  const pickedRef = useRef<HTMLButtonElement>(null);
  const Heading = headingLevel === 1 ? "h1" : "h2";

  useEffect(() => {
    if (pickedKey) pickedRef.current?.focus();
  }, [pickedKey]);

  if (addresses.length === 0) {
    // The empty picker (fold-in 4): one named state with one
    // meaning — a valid England/Wales postcode whose filed
    // addresses we cannot list yet. The journey proceeds to
    // the postcode-level results from here.
    return (
      <div className="picker picker--empty">
        <Heading>{heading}</Heading>
        <p className="picker__empty-line">{EMPTY_PICKER_LINE}</p>
        <p>
          <a href={homeRoute(postcode)}>{POSTCODE_LEVEL_LINK}</a>
        </p>
      </div>
    );
  }

  return (
    <div className="picker">
      <Heading>{heading}</Heading>
      <p className="picker__explainer">{PICKER_EXPLAINER}</p>
      <p className="picker__count">{pickerCountLine(addresses.length)}</p>
      <ul className="picker__list">
        {addresses.map((address) => {
          const selected = selectedKey !== null && address.key === selectedKey;
          const picked = pickedKey !== null && address.key === pickedKey;
          return (
            <li key={address.key}>
              <button
                type="button"
                className={selected ? "picker__row picker__row--selected" : "picker__row"}
                aria-pressed={selected}
                aria-current={picked ? "true" : undefined}
                ref={picked ? pickedRef : undefined}
                onClick={() => setSelectedKey(address.key)}
              >
                <span>{address.label}</span>
                {selected && (
                  <span className="picker__tick" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <Button
        type="button"
        variant="ink"
        className="picker__confirm"
        disabled={selectedKey === null}
        onClick={() => {
          if (selectedKey !== null) window.location.assign(homeRoute(postcode, selectedKey));
        }}
      >
        {PICKER_CONFIRM_LABEL}
      </Button>
      <p className="picker__postcode-level">
        <a href={homeRoute(postcode)}>{POSTCODE_LEVEL_LINK}</a>
      </p>
    </div>
  );
}
