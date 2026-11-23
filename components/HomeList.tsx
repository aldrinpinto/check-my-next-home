"use client";

import { useEffect, useRef, useState } from "react";

import {
  EMPTY_PICKER_LINE,
  PICKER_EXPLAINER,
  PICKER_SELECT_PROMPT,
  PICKER_TITLE,
  PICK_FALLBACK_FLAG,
  homeRoute,
} from "../lib/journey";
import SupplementRow, { type SupplementStage } from "./SupplementRow";

// The home picker on the whole-postcode check (founder
// ruling, 20 Nov 2026, superseding the 18 Nov 2026 list
// form): ONE dropdown under the intro line carries the
// postcode's homes — the full address list dump and its
// count line are gone. The rows arrive in natural address
// order (house-number order) from the union read model.
//
// BUG-185 (founder-ruled 23 Nov 2026): the dropdown is
// now the SAME custom dropdown as the search box's
// panel — the native select it replaces could not hold
// an action row. The closed field keeps its Sample 48
// form (the kit's field dress, the prompt, the chevron);
// inside, the homes list in the suggestions panel's own
// dress, and — while the supplement's kill switch is on —
// the "Don't see your home?" row as the last item. The
// page load serves the local list only; the row's click
// is the one deliberate Postio call (/api/supplement),
// the list refreshing in place before the row settles to
// its done line — over whatever list stands, success or
// failure alike, with no failure state anywhere.
//
// Choosing a home goes straight to its check: a local
// row navigates to its home route; a Postio row resolves
// through /api/pick first (the transient record, or the
// mid-pick fallback) — the same machinery as before.

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
  supplementEnabled = false,
  narrowing = { street: null, building: null },
}: {
  postcode: string;
  heading: string;
  addresses: PickerAddress[];
  // The kill switch's state, read server-side at the
  // page (POSTIO_SUPPLEMENT_ENABLED): false, the row is
  // not rendered and no supplement call can be made.
  supplementEnabled?: boolean;
  // The route's narrowing, forwarded to the supplement
  // call so a narrowed picker widens only within its
  // street or building, never past it.
  narrowing?: { street: string | null; building: string | null };
}) {
  const [rows, setRows] = useState<PickerAddress[]>(addresses);
  const [open, setOpen] = useState(false);
  const [supplementStage, setSupplementStage] = useState<SupplementStage>("idle");
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // An outside click closes the panel (the native
  // select's one free behaviour the custom dropdown must
  // reproduce for itself).
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

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
    const row = rows.find((address) => address.key === key);
    if (!row) return;
    if (row.source === "postio" && row.udprn) {
      resolvePostioRow(row);
      return;
    }
    window.location.assign(homeRoute(postcode, row.key));
  };

  // The wider-list row's click: one supplement fetch for
  // this postcode (under the route's narrowing), the
  // merged list replacing the picker's rows in place.
  // Any failure leaves the rows standing — and either
  // way the row settles to its done state, because the
  // visitor is never shown a failure for this.
  const startSupplement = () => {
    if (supplementStage !== "idle") return;
    setSupplementStage("loading");
    void (async () => {
      try {
        const params = new URLSearchParams({ postcode });
        if (narrowing.street) params.set("street", narrowing.street);
        if (narrowing.building) params.set("building", narrowing.building);
        const response = await fetch(`/api/supplement?${params.toString()}`);
        if (!response.ok) throw new Error("supplement-failed");
        const data = (await response.json()) as { rows?: PickerAddress[] };
        if (Array.isArray(data.rows)) {
          setRows(
            data.rows.map((row) => ({
              key: row.key,
              label: row.label,
              source: row.source,
              udprn: row.udprn,
            })),
          );
        }
      } catch {
        // Silent by ruling (BUG-185): the done state
        // settles over the list as it stands.
      }
      setSupplementStage("done");
    })();
  };

  const dropdown = (
    <div
      className="picker__dropdown"
      ref={dropdownRef}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        className="field__input picker__select picker__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={PICKER_SELECT_PROMPT}
        disabled={resolvingKey !== null}
        onClick={() => setOpen((value) => !value)}
      >
        {PICKER_SELECT_PROMPT}
      </button>
      {open && (
        <div
          className={[
            "picker__panel",
            supplementStage === "loading" ? "picker__panel--loading" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-busy={supplementStage === "loading" || undefined}
        >
          {rows.length > 0 && (
            <div className="suggest__group">
              <p className="suggest__group-label">Homes</p>
              <ul className="suggest__list" role="listbox" aria-label="Homes">
                {rows.map((row) => (
                  <li key={row.key}>
                    <button
                      type="button"
                      className="suggest__item"
                      role="option"
                      aria-selected="false"
                      aria-label={row.label}
                      disabled={resolvingKey !== null}
                      onClick={() => pick(row.key)}
                    >
                      {row.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {supplementEnabled && (
            <SupplementRow
              stage={supplementStage}
              postcode={postcode}
              onActivate={startSupplement}
            />
          )}
        </div>
      )}
    </div>
  );

  if (rows.length === 0) {
    // The empty list: a valid England/Wales postcode whose
    // filed addresses we cannot list yet — the postcode
    // check below still serves (the ruling's zero-home
    // fallback line, unchanged).
    if (!supplementEnabled) {
      return (
        <div className="picker picker--empty">
          <h2>{heading}</h2>
          <p className="picker__empty-line">{EMPTY_PICKER_LINE}</p>
        </div>
      );
    }
    // While the kill switch is on, the dropdown stands
    // under the line holding only the wider-list row: a
    // postcode we cannot list is exactly where the full
    // address list matters most, and a call that finds
    // homes grows the picker into its ordinary form
    // below (the rows state carries it there).
    return (
      <div className="picker">
        <div className="picker picker--empty">
          <h2>{heading}</h2>
          <p className="picker__empty-line">{EMPTY_PICKER_LINE}</p>
        </div>
        {dropdown}
      </div>
    );
  }

  return (
    <div className="picker">
      <h2>{heading}</h2>
      {/* BUG-150 (22 Nov 2026): the picker carries its
          own title — the founder's words — above the
          explainer, which now wears small print. */}
      <h3 className="picker__title">{PICKER_TITLE}</h3>
      <p className="picker__explainer">{PICKER_EXPLAINER}</p>
      <div className="field picker__field">{dropdown}</div>
    </div>
  );
}
