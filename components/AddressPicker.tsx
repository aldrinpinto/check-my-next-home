"use client";

import { useEffect, useRef } from "react";

import { EMPTY_PICKER_LINE, homeRoute, pickerCountLine, POSTCODE_LEVEL_LINK } from "../lib/journey";

// The address picker (plan step M7.3, fold-in 3) — a
// reusable component: M7.4 embeds it on the results page
// for the postcode-level upgrade (T-WEB-08), so it takes
// plain data and renders the same list everywhere.
//
// The list renders in the brain's sortAddresses order (the
// serve layer hands the addresses over already sorted), as
// full-width rows at the kit's 44px tap target, headed by a
// count line, with no cap and no pagination in V1 and
// natural tab order — the kit commissions no listbox
// pattern, so the rows are plain links. Back from the
// checking screen returns here with the picked address
// retained (D44(5)(iii)): the picked row is marked and
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
  const pickedRef = useRef<HTMLAnchorElement>(null);
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
      <p className="picker__count">{pickerCountLine(addresses.length)}</p>
      <ul className="picker__list">
        {addresses.map((address) => {
          const picked = pickedKey !== null && address.key === pickedKey;
          return (
            <li key={address.key}>
              <a
                className={picked ? "picker__row picker__row--picked" : "picker__row"}
                href={homeRoute(postcode, address.key)}
                aria-current={picked ? "true" : undefined}
                ref={picked ? pickedRef : undefined}
              >
                {address.label}
              </a>
            </li>
          );
        })}
      </ul>
      <p className="picker__postcode-level">
        <a href={homeRoute(postcode)}>{POSTCODE_LEVEL_LINK}</a>
      </p>
    </div>
  );
}
