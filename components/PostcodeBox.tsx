"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import {
  POSTCODE_BOX_BUTTON,
  POSTCODE_BOX_BUTTON_BARE,
  POSTCODE_BOX_HINT,
  POSTCODE_BOX_LABEL,
  POSTCODE_BOX_PLACEHOLDER,
} from "../lib/home";
import { FAILED_ROUTE, TURNSTILE_BLOCK_LINE } from "../lib/journey";
import { Button, SuggestionShell, type SuggestionGroup, type SuggestionItem } from "./kit";

// M7.3 — the one postcode box, wired. M7.2 shipped it inert
// (founder ruling at that step: present and typeable, submit
// swallowed); this step wires the real journey into the same
// box, and every surface uses this one component — homepage
// now, check pages as they land (fold-in 7).
//
// The submit path: the robot check runs first (ruling 5) —
// the widget is invisible; its token and the typed input go
// to /api/resolve, which verifies the token server-side
// before the ladder ever runs. A failed or unavailable
// robot check BLOCKS here with the friendly line — the
// search is not sent, nothing navigates, and there is no
// silent pass. A verified search navigates to the
// destination the serve layer returns; a resolution that
// fails outright lands on the whole-check failure state
// (D44(7)). The box itself does no tidying, no validation
// and no normalisation — the ladder owns all of that, and a
// partial postcode typed here is a valid search, never an
// error.
//
// D70: the box takes its designed form — the field and its
// button in one row (stacked on small screens), the field's
// border softened, and the autocomplete dropdown's shell
// under the row. The row needs the input and the button as
// siblings, so the box renders the kit field's own markup
// pattern itself (same classes, ids and aria wiring as
// components/kit.tsx's TextField) rather than through
// TextField.
//
// Entry-point build (18 Nov 2026; D71 + D72): the dropdown
// is live. As the visitor types, the box asks /api/suggest
// — LOCAL FILED DATA ONLY, never Postio (a keystroke must
// not reach the backstop) — after a ~140ms pause, dropping
// any response a newer keystroke has superseded. Picks
// navigate straight to the item's route (the picker for a
// postcode, the home's check for a home); the robot check
// stays on the typed-submit path only, exactly as ruled.
// One pick does not navigate (M7.15D): a Places item
// files its filed name into the field, expanding the
// panel to that place's districts — the town chooser
// lives inside this dropdown, never on a page.
// Founder fix batch (19 Nov 2026): the pick now visibly
// lands — the picked row carries a selected state and
// the Districts group is scrolled into view within the
// panel — and pressing the button with the field holding
// exactly a known place name IS the place pick (the
// panel stays, the districts reveal, nothing navigates
// and the failure page is unreachable from a place
// name). The serve layer routes a bare place name that
// arrives by URL to the landing with the name filed
// (lib/server/serve.ts's placeLandingUrl), where this
// box's own fetch opens the same panel on the same
// districts.
// Keyboard: up/down move the active suggestion, Enter
// chooses it, Escape closes the panel. D71 amendment
// (18 Nov 2026): for a full postcode the panel carries the
// postcode's COMPLETE home list in a scrollable region
// (app/globals.css) — the keyboard walks the whole list
// and the active row is scrolled into view as it moves.
// The `suggestions`
// prop remains as a static override (a caller handing
// groups in suppresses the live fetch); no caller uses it
// today.
//
// Fidelity pass 2 (founder, 17 Nov 2026): the `bare` prop is
// the decided sample page's hero form — no visible label or
// hint (the label survives, visually hidden, as the field's
// accessible name), the sample's placeholder in the field,
// and the Brass button in the sample's words. The submit
// path is identical in both forms; only the furniture
// differs. The standard form (label, hint, Forest button)
// served the journey's retry surfaces for a while — the
// wider-area banner and the whole-check failure — until
// the founder ruling of 19 Nov 2026 made the bare form the
// form of EVERY live search surface: the failure page moved
// to the single error page (bare), and the wider-area
// banner, the last standard-form use, followed. The
// standard form remains in this component, unrendered by
// any live surface. Both forms carry the neutral SW1A 1AA
// example: the founder's own postcode never appears in
// visitor-facing copy.

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      execute: (widgetId: string) => void;
      reset: (widgetId: string) => void;
      getResponse: (widgetId: string) => string;
    };
  }
}

const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

// The failure landing keeps what the visitor typed
// (error-page build, 19 Nov 2026): the single error
// page at FAILED_ROUTE reads the postcode back out of
// its query string and arrives with its search box
// holding it, under the kept note — the sample's story
// (Final Sample Master view 26). An empty field
// carries nothing, and the counting never sees the
// value: route patterns are derived from the pathname
// alone (lib/journey-events.ts).
function failedRouteFor(typed: string): string {
  const kept = typed.trim();
  return kept ? `${FAILED_ROUTE}?postcode=${encodeURIComponent(kept)}` : FAILED_ROUTE;
}

// The place name's normal form for exact-equality checks
// — the read model's own recipe (placeNormOf in
// lib/server/places.ts), restated at the presentation
// edge: upper case, punctuation to spaces, runs
// collapsed. Exact equality is the only comparison this
// box ever makes against a place name: a fuzzy near-match
// is a choice to offer, never a pick to apply silently.
function placeNormOf(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

let scriptPromise: Promise<boolean> | null = null;
function loadTurnstileScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.turnstile) return Promise.resolve(true);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = TURNSTILE_SCRIPT;
      script.async = true;
      script.onload = () => resolve(Boolean(window.turnstile));
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export default function PostcodeBox({
  autoFocus = false,
  bare = false,
  defaultValue = "",
  suggestions,
}: {
  autoFocus?: boolean;
  bare?: boolean;
  defaultValue?: string;
  suggestions?: SuggestionGroup[];
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const waitersRef = useRef<{
    resolve: (token: string) => void;
    reject: (error: Error) => void;
  } | null>(null);
  // No site key configured is a failed widget from the
  // start (the closed direction) — initialised, not set in
  // an effect.
  const [widgetFailed, setWidgetFailed] = useState(() => !siteKey);
  const [blockMessage, setBlockMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The live suggestions (entry-point build): the field is
  // controlled so typing can be watched; the panel's items
  // are flattened for the keyboard, each id remembering the
  // href its pick navigates to.
  const [value, setValue] = useState(defaultValue);
  const [liveGroups, setLiveGroups] = useState<SuggestionGroup[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const hrefByIdRef = useRef(new Map<string, string>());
  // The one non-navigating pick (M7.15D): a Places item
  // carries the filed place name instead of an href —
  // choosing it files the name into the field, and the
  // ordinary suggest fetch then serves that place's
  // districts in the same panel (the town chooser lives
  // inside the picker; there is no town page).
  const placeByIdRef = useRef(new Map<string, string>());
  const suggestSeqRef = useRef(0);
  const choosingRef = useRef(false);
  // The picked place (founder fix batch, 19 Nov 2026):
  // the filed name the panel is currently expanded on,
  // and the pending reveal — set when a place is picked
  // (or the field arrives holding an exact place name),
  // consumed when the place's district group lands in
  // the panel and is scrolled into view. A pick that
  // changed nothing visibly was the founder's twice-
  // reported dead click; the picked row's selected state
  // and the revealed districts are the landing made
  // visible.
  const [pickedPlace, setPickedPlace] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const pickedPlaceRef = useRef<string | null>(null);
  const revealPendingRef = useRef(false);
  // A reveal that does not change the field's value (the
  // name is already filed) re-runs the suggest effect
  // through this tick — the effect is the one fetch path.
  const [revealTick, setRevealTick] = useState(0);

  // The pick's bookkeeping in one place: the state the
  // render reads, and the ref the async fetch reads (a
  // fetch that lands after the pick changed must mark —
  // or clear — the row in ITS OWN groups, whose ids it
  // minted).
  function markPicked(place: string | null) {
    pickedPlaceRef.current = place;
    setPickedPlace(place);
    if (place === null) setPickedId(null);
  }
  // Below the 3-character floor the panel is derived shut
  // at render — the effect never clears state synchronously.
  const typedLength = value.trim().length;
  const visibleGroups = typedLength >= 3 ? liveGroups : [];
  const visibleOpen = panelOpen && visibleGroups.length > 0;
  const flatItems: SuggestionItem[] = visibleGroups.flatMap((group) =>
    group.items.filter((item): item is SuggestionItem => typeof item !== "string"),
  );

  useEffect(() => {
    if (suggestions) return; // a static override suppresses the live fetch
    const typed = value.trim();
    if (typed.length < 3) {
      // Invalidate any in-flight response; the render
      // derivation above keeps the panel shut meanwhile.
      suggestSeqRef.current += 1;
      return;
    }
    const timer = setTimeout(() => {
      const seq = (suggestSeqRef.current += 1);
      void (async () => {
        try {
          const response = await fetch(`/api/suggest?q=${encodeURIComponent(typed)}`);
          if (!response.ok) throw new Error("suggest-failed");
          const data = (await response.json()) as {
            groups?: {
              label: string;
              items: { label: string; href: string | null; place?: string }[];
            }[];
          };
          // A newer keystroke superseded this response —
          // drop it, never repaint with stale suggestions.
          if (seq !== suggestSeqRef.current) return;
          const hrefs = new Map<string, string>();
          const places = new Map<string, string>();
          let n = 0;
          const groups: SuggestionGroup[] = (data.groups ?? []).map((group) => ({
            label: group.label,
            items: group.items.map((item) => {
              const id = `suggest-${n}`;
              n += 1;
              if (item.href) hrefs.set(id, item.href);
              if (item.place) places.set(id, item.place);
              return { id, label: item.label };
            }),
          }));
          hrefByIdRef.current = hrefs;
          placeByIdRef.current = places;
          setLiveGroups(groups);
          setPanelOpen(groups.length > 0);
          setActiveId(null);
          // The picked row in THESE groups (founder fix
          // batch): an exact place arrival — the fetched
          // value IS a filed place's whole name — makes
          // the pick; a standing pick is re-marked under
          // its new id (ids are minted per fetch); a pick
          // these groups no longer carry loses its row.
          const idByPlace = new Map(
            [...places.entries()].map(([id, place]) => [place, id] as const),
          );
          let marked = false;
          for (const place of places.values()) {
            if (placeNormOf(place) === placeNormOf(typed)) {
              pickedPlaceRef.current = place;
              setPickedPlace(place);
              setPickedId(idByPlace.get(place) ?? null);
              revealPendingRef.current = true;
              marked = true;
              break;
            }
          }
          if (!marked) {
            const standing = pickedPlaceRef.current;
            setPickedId(standing ? (idByPlace.get(standing) ?? null) : null);
          }
        } catch {
          if (seq !== suggestSeqRef.current) return;
          setLiveGroups([]);
          setPanelOpen(false);
          setActiveId(null);
        }
      })();
    }, 140);
    return () => clearTimeout(timer);
  }, [value, suggestions, revealTick]);

  // The reveal (founder fix batch): when the picked
  // place's district group lands in the panel, scroll it
  // into view within the panel's region — the districts
  // sat below the dropdown's fold and the pick read as a
  // dead click. "nearest" leaves an already-visible group
  // (and the page) untouched.
  useEffect(() => {
    if (!revealPendingRef.current || !pickedPlace) return;
    const group = document.querySelector(
      '#postcode-suggestions [data-group-label^="Districts in"]',
    );
    if (!group) return;
    revealPendingRef.current = false;
    group.scrollIntoView({ block: "nearest" });
  }, [liveGroups, pickedPlace]);

  // Keep the keyboard's active row in view (D71
  // amendment): on a full postcode's complete list the
  // active row can sit below the scrollable region's
  // fold — scroll it to the region's nearest edge
  // whenever the keyboard moves it. "nearest" leaves an
  // already-visible row (and the page) untouched.
  useEffect(() => {
    if (!activeId) return;
    document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  // The place pick, one behaviour wherever it starts
  // (founder fix batch): file the filed name into the
  // field, mark it picked, keep the panel open on the
  // place's districts. Where the value is not changing
  // (the field already holds the name — a submit pressed
  // on it), the suggest effect is re-run through the
  // reveal tick: no value change means no effect run, and
  // the reveal must not depend on one.
  function revealPlace(place: string) {
    markPicked(place);
    revealPendingRef.current = true;
    setPanelOpen(true);
    if (value === place) {
      setRevealTick((tick) => tick + 1);
    } else {
      setValue(place);
    }
  }

  function choose(item: SuggestionItem) {
    if (choosingRef.current) return;
    // A Places pick (M7.15D) expands in place: file the
    // filed name into the field — the value change
    // re-runs the suggest fetch, whose answer carries
    // the place's districts in the same panel. No
    // navigation, and the choosing latch stays off: the
    // visitor's next pick (a district) still has to land.
    const place = placeByIdRef.current.get(item.id);
    if (place) {
      revealPlace(place);
      setPickedId(item.id);
      setActiveId(null);
      return;
    }
    const href = hrefByIdRef.current.get(item.id);
    if (!href) return;
    choosingRef.current = true;
    window.location.assign(href);
  }

  function onFieldKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!visibleOpen || flatItems.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const current = flatItems.findIndex((item) => item.id === activeId);
      const next =
        event.key === "ArrowDown"
          ? Math.min(current + 1, flatItems.length - 1)
          : Math.max(current - 1, 0);
      setActiveId(flatItems[next]?.id ?? null);
    } else if (event.key === "Enter" && activeId) {
      const item = flatItems.find((candidate) => candidate.id === activeId);
      if (item) {
        event.preventDefault();
        choose(item);
      }
    } else if (event.key === "Escape") {
      setPanelOpen(false);
      setActiveId(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    if (!siteKey) return;
    void loadTurnstileScript().then((loaded) => {
      if (cancelled) return;
      if (!loaded || !window.turnstile || !widgetRef.current) {
        setWidgetFailed(true);
        return;
      }
      widgetIdRef.current = window.turnstile.render(widgetRef.current, {
        sitekey: siteKey,
        size: "invisible",
        callback: (token: string) => {
          tokenRef.current = token;
          waitersRef.current?.resolve(token);
          waitersRef.current = null;
        },
        "error-callback": () => {
          tokenRef.current = null;
          waitersRef.current?.reject(new Error("turnstile-error"));
          waitersRef.current = null;
          setWidgetFailed(true);
        },
        "expired-callback": () => {
          tokenRef.current = null;
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [siteKey]);

  // Ask the widget for a token, waiting for its callback.
  // Rejects when the widget is unavailable or does not
  // answer — the caller turns that into the blocking line.
  function requestToken(): Promise<string> {
    if (tokenRef.current) return Promise.resolve(tokenRef.current);
    if (widgetFailed || !window.turnstile || !widgetIdRef.current) {
      return Promise.reject(new Error("turnstile-unavailable"));
    }
    const widgetId = widgetIdRef.current;
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        waitersRef.current = null;
        reject(new Error("turnstile-timeout"));
      }, 8_000);
      waitersRef.current = {
        resolve: (token) => {
          clearTimeout(timer);
          resolve(token);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
      window.turnstile?.execute(widgetId);
    });
  }

  // The submit's place check (founder fix batch): the
  // field holding exactly a known place name is a place
  // pick, never a search — the panel stays, the districts
  // reveal, and nothing navigates (the founder's
  // twice-reported landing on the failure page from a
  // place name ends here, and the serve layer answers the
  // same input the same way for arrivals that bypass this
  // box). The current panel's places answer first; a
  // stale or absent panel is settled with one fresh
  // suggest fetch. Exact equality only — a near-match is
  // never silently applied.
  async function exactPlaceFor(typed: string): Promise<string | null> {
    const norm = placeNormOf(typed);
    if (norm.length === 0) return null;
    for (const place of placeByIdRef.current.values()) {
      if (placeNormOf(place) === norm) return place;
    }
    try {
      const response = await fetch(`/api/suggest?q=${encodeURIComponent(typed.trim())}`);
      if (!response.ok) return null;
      const data = (await response.json()) as {
        groups?: { items: { place?: string }[] }[];
      };
      for (const group of data.groups ?? []) {
        for (const item of group.items) {
          if (item.place && placeNormOf(item.place) === norm) return item.place;
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBlockMessage(null);
    const input = new FormData(event.currentTarget).get("postcode");
    const typed = typeof input === "string" ? input : "";

    // A place name in the field is the place pick: it
    // runs before the robot check (which stays on the
    // search path only, exactly as ruled for picks) and
    // never reaches the resolve call at all.
    const place = await exactPlaceFor(typed);
    if (place) {
      revealPlace(place);
      return;
    }

    setBusy(true);

    let token: string;
    try {
      token = await requestToken();
    } catch {
      // Ruling 5: the robot check could not run — the
      // search is not sent, and the visitor gets a friendly
      // retry, never a crash and never a silent pass.
      setBlockMessage(TURNSTILE_BLOCK_LINE);
      setBusy(false);
      return;
    }

    let response: Response;
    try {
      response = await fetch("/api/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: typed, token }),
      });
    } catch {
      // The serve layer itself is unreachable — the
      // whole-check failure state (fold-in 10).
      window.location.assign(failedRouteFor(typed));
      return;
    }

    if (response.status === 403) {
      setBlockMessage(TURNSTILE_BLOCK_LINE);
      tokenRef.current = null;
      if (window.turnstile && widgetIdRef.current) window.turnstile.reset(widgetIdRef.current);
      setBusy(false);
      return;
    }
    if (!response.ok) {
      window.location.assign(failedRouteFor(typed));
      return;
    }
    const data = (await response.json()) as { destination?: string };
    window.location.assign(data.destination ?? failedRouteFor(typed));
  }

  const describedBy = bare
    ? blockMessage
      ? "postcode-message"
      : undefined
    : blockMessage
      ? "postcode-hint postcode-message"
      : "postcode-hint";

  function onFieldChange(event: { target: { value: string } }) {
    const next = event.target.value;
    setValue(next);
    // Editing away from the picked name retires the pick:
    // its selected state belongs to the name in the field.
    if (pickedPlace && placeNormOf(next) !== placeNormOf(pickedPlace)) {
      markPicked(null);
      revealPendingRef.current = false;
    }
  }

  return (
    <form className={bare ? "postcode-box postcode-box--bare" : "postcode-box"} onSubmit={onSubmit}>
      <div className="field">
        <label className={bare ? "visually-hidden" : "field__label"} htmlFor="postcode">
          {POSTCODE_BOX_LABEL}
        </label>
        {!bare && (
          <p className="field__hint" id="postcode-hint">
            {POSTCODE_BOX_HINT}
          </p>
        )}
        <div className="postcode-box__row">
          <input
            className="field__input"
            id="postcode"
            name="postcode"
            placeholder={POSTCODE_BOX_PLACEHOLDER}
            autoComplete="postal-code"
            autoFocus={autoFocus}
            value={value}
            onChange={onFieldChange}
            onKeyDown={onFieldKeyDown}
            onBlur={() => setPanelOpen(false)}
            role="combobox"
            aria-expanded={visibleOpen}
            aria-controls="postcode-suggestions"
            aria-activedescendant={activeId ?? undefined}
            aria-autocomplete="list"
            aria-describedby={describedBy}
            aria-invalid={blockMessage ? true : undefined}
          />
          {bare ? (
            <Button type="submit" variant="brass" disabled={busy}>
              {POSTCODE_BOX_BUTTON_BARE}
            </Button>
          ) : (
            <Button type="submit" disabled={busy}>
              {POSTCODE_BOX_BUTTON}
            </Button>
          )}
        </div>
        {blockMessage && (
          <p className="field__message field__message--error" id="postcode-message" role="alert">
            {blockMessage}
          </p>
        )}
      </div>
      {suggestions ? (
        <SuggestionShell groups={suggestions} />
      ) : (
        visibleOpen && (
          <SuggestionShell
            id="postcode-suggestions"
            groups={visibleGroups}
            activeId={activeId}
            pickedId={pickedId}
            onSelect={choose}
          />
        )
      )}
      <div ref={widgetRef} className="turnstile-slot" aria-hidden="true" />
    </form>
  );
}
