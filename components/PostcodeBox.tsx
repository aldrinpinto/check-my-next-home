"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { headingForHome } from "../lib/address";
import {
  POSTCODE_BOX_BUTTON,
  POSTCODE_BOX_BUTTON_BARE,
  POSTCODE_BOX_HINT,
  POSTCODE_BOX_LABEL,
  POSTCODE_BOX_NO_SUGGESTIONS_LINE,
  POSTCODE_BOX_PLACEHOLDER,
  POSTCODE_BOX_SEARCHING_LINE,
  POSTCODE_BOX_SUGGESTIONS_FAILED_LINE,
} from "../lib/home";
import { createSuggestCoordinator, type SuggestCoordinator } from "../lib/suggest-client";
import {
  FAILED_ROUTE,
  PICK_FALLBACK_FLAG,
  TURNSTILE_BLOCK_LINE,
  UNPLACED_NOTICE_LINE,
  homeRoute,
  placeChoiceRoute,
} from "../lib/journey";
import { Button, SuggestionShell, type SuggestionGroup, type SuggestionItem } from "./kit";
import SupplementRow, { type SupplementStage } from "./SupplementRow";

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
// error. BUG-176 (founder, 23 Nov 2026) is the one
// exception, and it is a presentation rule, not a
// validation: a blank box, and a resolve answer of the
// no-location kind, show the couldn't-place line under
// the field on the page the visitor is already on,
// instead of carrying them away — the ladder still owns
// the placing; only the telling moved.
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
// any response a newer keystroke has superseded. The
// asking itself — debounce, sequence guard, settles —
// lives in the suggest coordinator (lib/suggest-client.ts)
// since BUG-196 (23 Nov 2026): each keystroke now aborts
// the superseded fetch (cancel-and-replace), and while
// the current answer is in flight the panel holds the
// plain searching line instead of vanishing — no items,
// nothing clickable, so BUG-033's rule (no stale list
// under new text) stands exactly. Picks
// navigate straight to the item's route (the picker for a
// postcode, the home's check for a home); the robot check
// stays on the typed-submit path only, exactly as ruled.
// Places join the navigating picks (founder ruling,
// 19 Nov 2026, reversing the 18 Nov in-dropdown chooser
// and the same morning's fix-batch reveal): a Places
// item's pick goes to the place page, which lists the
// place's districts in full, exactly as a street pick
// goes to the street choice page — no pick expands the
// panel in place any more. Pressing the button with the
// field holding exactly a known place name IS the place
// pick the same way: it navigates to the place page
// before the robot check (which stays on the search path
// only), and the failure page is unreachable from a
// place name. The serve layer routes a bare place name
// that arrives by URL to the same page
// (lib/server/serve.ts's placeChoiceUrl).
// Keyboard: up/down move the active suggestion, Enter
// chooses it, Escape closes the panel. D71 amendment
// (18 Nov 2026): for a full postcode the panel carries the
// postcode's COMPLETE home list in a scrollable region
// (app/globals.css) — the keyboard walks the whole list
// and the active row is scrolled into view as it moves.
//
// BUG-185 (founder-ruled 23 Nov 2026): when the panel
// lists ONE postcode's homes, its pinned footer is the
// "Don't see your home?" row — the visitor's one
// deliberate Postio call. The suggest response names the
// settled postcode and whether the row may be offered
// (the kill switch); the click fetches /api/supplement,
// the panel's homes dim under the row's spinner, and the
// merged list replaces the panel's in place before the
// row settles to its done line. A failed call settles
// exactly the same way over the list as it stands — the
// visitor never sees a failure state. The row never
// appears on street or area searches (their groups span
// postcodes, and the response carries no settled
// postcode for them). A Postio row in the refreshed list
// picks through /api/pick, exactly as the check page's
// picker picks one.
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
  // The settled-empty flag (fix batch, 19 Nov 2026 —
  // BUG-008): a suggestions response that settles with
  // no groups is an ANSWER, not an absence — the panel
  // opens on the no-suggestions line so the visitor can
  // tell a settled empty result from a box still
  // loading. A failed fetch is not an empty answer and
  // never sets it.
  const [emptySettled, setEmptySettled] = useState(false);
  // The settled-failure flag (BUG-203, 24 Nov 2026):
  // a suggestions fetch that failed — after the
  // coordinator's one retry — is an ANSWER, not an
  // absence: the panel opens on the failure line so
  // the visitor can tell a failed fetch from a box
  // still loading, and from a settled empty answer.
  // A failed fetch is not an empty answer and never
  // sets the settled-empty flag; a fresh response
  // clears this flag, and a fresh keystroke
  // un-settles it, exactly as the empty flag is.
  const [failedSettled, setFailedSettled] = useState(false);
  // The mid-flight flag (BUG-196): the coordinator
  // reports the current query in flight from its
  // keystroke until its response settles, and the
  // panel holds the plain searching line meanwhile —
  // a state, never a result (no items, nothing
  // clickable; BUG-033 untouched).
  const [searching, setSearching] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const hrefByIdRef = useRef(new Map<string, string>());
  // A Places item carries the filed place name alongside
  // its href (M7.15D; the pick navigates since the
  // founder's ruling of 19 Nov 2026): the name is not
  // for choosing — every pick follows its href — it is
  // how the submit path below recognises a field holding
  // exactly a place name.
  const placeByIdRef = useRef(new Map<string, string>());
  // The live-suggest coordinator (lib/suggest-client.ts):
  // the debounce, the sequence guard, the per-keystroke
  // abort and the flight signal live there; this box
  // renders what it settles. Created on mount, below.
  const coordinatorRef = useRef<SuggestCoordinator | null>(null);
  const choosingRef = useRef(false);
  // The wider-list row (BUG-185): the settled postcode
  // the open panel lists, and whether the kill switch
  // lets the row be offered — both named by the suggest
  // response, never guessed client-side. The stage is
  // the row's own: idle, loading, done. A refreshed
  // list's Postio rows remember their UDPRNs here, as
  // hrefByIdRef remembers the local rows' routes.
  const [supplementTarget, setSupplementTarget] = useState<{
    postcode: string;
    enabled: boolean;
  } | null>(null);
  const [supplementStage, setSupplementStage] = useState<SupplementStage>("idle");
  const udprnByIdRef = useRef(new Map<string, string>());
  const supplementSeqRef = useRef(0);
  // Below the 3-character floor the panel is derived shut
  // at render — the effect never clears state synchronously.
  const typedLength = value.trim().length;
  const visibleGroups = typedLength >= 3 ? liveGroups : [];
  const visibleOpen = panelOpen && visibleGroups.length > 0;
  const emptyShown = panelOpen && emptySettled && typedLength >= 3 && visibleGroups.length === 0;
  // The settled-failure panel (BUG-203): the panel
  // OPENS on the failure line — the opposite of the
  // old close — so a failed fetch is visible, never a
  // vanish. Shown only for a settled failure (never
  // alongside items, the empty line or the searching
  // line: the retry holds the searching line while it
  // is out, and the failure settles only once the
  // retry has failed too).
  const failedShown = panelOpen && failedSettled && typedLength >= 3 && visibleGroups.length === 0;
  // The mid-flight panel (BUG-196): while the current
  // query's answer is on its way the panel holds the
  // searching line instead of vanishing — shown from
  // the first keystroke, not only once a panel has
  // opened before, and never alongside items or the
  // settled-empty line.
  const searchingShown =
    searching && typedLength >= 3 && visibleGroups.length === 0 && !emptyShown && !failedShown;
  const flatItems: SuggestionItem[] = visibleGroups.flatMap((group) =>
    group.items.filter((item): item is SuggestionItem => typeof item !== "string"),
  );

  // The coordinator's settles are this box's state
  // changes, exactly as the inline fetch's were: a
  // settled response repaints (its items' ids remember
  // their hrefs — and their place names — for the
  // pick and the submit path, and the wider-list row
  // re-arms for the newly settled postcode); a settled
  // failure opens the panel on its honest line
  // (BUG-203) instead of closing it. The coordinator
  // guarantees these fire only for the current query —
  // a superseded response is dropped inside it, never
  // here.
  useEffect(() => {
    const coordinator = createSuggestCoordinator((url, signal) => fetch(url, { signal }), {
      onResponse: (data) => {
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
        // A fresh list is local-only again: no Postio
        // rows ride it, and the wider-list row starts
        // from idle for the newly settled postcode.
        udprnByIdRef.current = new Map();
        setSupplementTarget(
          data.postcodeList
            ? { postcode: data.postcodeList.postcode, enabled: data.supplementEnabled === true }
            : null,
        );
        setSupplementStage("idle");
        setLiveGroups(groups);
        setEmptySettled(groups.length === 0);
        setFailedSettled(false);
        setPanelOpen(true);
        setActiveId(null);
      },
      onFailure: () => {
        setLiveGroups([]);
        setEmptySettled(false);
        setFailedSettled(true);
        setPanelOpen(true);
        setActiveId(null);
        setSupplementTarget(null);
      },
      onFlightChange: (inFlight) => setSearching(inFlight),
    });
    coordinatorRef.current = coordinator;
    return () => {
      coordinator.dispose();
      coordinatorRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (suggestions) return; // a static override suppresses the live fetch
    coordinatorRef.current?.type(value.trim());
  }, [value, suggestions]);

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

  function choose(item: SuggestionItem) {
    if (choosingRef.current) return;
    // A Postio row of a supplemented list resolves
    // through /api/pick first (BUG-185) — the picker's
    // own machinery, mirrored here.
    const udprn = udprnByIdRef.current.get(item.id);
    if (udprn) {
      resolvePostioPick(udprn);
      return;
    }
    // Every other pick navigates to its item's route — a home
    // to its check, a street to its choice or its one
    // postcode, a place to the place page (founder
    // ruling, 19 Nov 2026: no pick expands in place).
    const href = hrefByIdRef.current.get(item.id);
    if (!href) return;
    choosingRef.current = true;
    window.location.assign(href);
  }

  // A Postio row's pick (BUG-185): the transient record,
  // or the mid-pick fallback when the backstop cannot
  // answer — the same answer the check page's picker
  // gives, so the journey never dead-ends here either.
  function resolvePostioPick(udprn: string) {
    const postcode = supplementTarget?.postcode ?? "";
    choosingRef.current = true;
    void (async () => {
      const fallback = `/search/home?postcode=${encodeURIComponent(postcode)}&notfound=${PICK_FALLBACK_FLAG}`;
      try {
        const response = await fetch("/api/pick", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ postcode, udprn }),
        });
        const data = (await response.json()) as { url?: string };
        window.location.assign(data.url ?? fallback);
      } catch {
        window.location.assign(fallback);
      }
    })();
  }

  // The wider-list row's click (BUG-185): exactly one
  // supplement fetch for the settled postcode. Success
  // replaces the panel's groups with the merged list in
  // place; ANY failure leaves the list standing — and
  // either way the row settles to its done state, because
  // the visitor is never shown a failure for this.
  function startSupplement() {
    const target = supplementTarget;
    if (!target || !target.enabled || supplementStage !== "idle") return;
    const seq = (supplementSeqRef.current += 1);
    setSupplementStage("loading");
    void (async () => {
      try {
        const response = await fetch(
          `/api/supplement?postcode=${encodeURIComponent(target.postcode)}`,
        );
        if (!response.ok) throw new Error("supplement-failed");
        const data = (await response.json()) as {
          rows?: {
            key: string;
            label: string;
            source?: string;
            homeKey?: string;
            udprn?: string;
          }[];
        };
        // A newer keystroke superseded this click — drop
        // the answer, never repaint a stale panel.
        if (seq !== supplementSeqRef.current) return;
        if (Array.isArray(data.rows)) {
          const hrefs = new Map<string, string>();
          const udprns = new Map<string, string>();
          let n = 0;
          const items: SuggestionItem[] = data.rows.map((row) => {
            const id = `suggest-${n}`;
            n += 1;
            if (row.source === "postio" && row.udprn) udprns.set(id, row.udprn);
            else if (row.homeKey) hrefs.set(id, homeRoute(target.postcode, row.homeKey));
            return { id, label: headingForHome(row.label, target.postcode) };
          });
          hrefByIdRef.current = hrefs;
          udprnByIdRef.current = udprns;
          placeByIdRef.current = new Map();
          setLiveGroups([{ label: "Homes", items }]);
          setActiveId(null);
        }
      } catch {
        // Silent by ruling (BUG-185): the done state
        // settles over the list as it stands.
      }
      if (seq === supplementSeqRef.current) setSupplementStage("done");
    })();
  }

  function onFieldKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && (emptyShown || failedShown)) {
      setPanelOpen(false);
      return;
    }
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

  // The submit's place check (founder fix batch; the
  // destination ruled again 19 Nov 2026): the field
  // holding exactly a known place name is a place pick,
  // never a search — it navigates to the place page (the
  // founder's twice-reported landing on the failure page
  // from a place name ends here, and the serve layer
  // answers the same input the same way for arrivals
  // that bypass this box). The current panel's places
  // answer first; a stale or absent panel is settled
  // with one fresh suggest fetch. Exact equality only —
  // a near-match is never silently applied.
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

    // BUG-176 (founder, 23 Nov 2026): a blank or
    // whitespace-only box is answered on the page
    // itself, under the field — immediately, before the
    // place check's fetch, before the robot check,
    // before any resolve call. The line is the product's
    // own couldn't-place line, the same one the unplaced
    // notice carries.
    if (!typed.trim()) {
      setBlockMessage(UNPLACED_NOTICE_LINE);
      return;
    }

    // A place name in the field is the place pick: it
    // runs before the robot check (which stays on the
    // search path only, exactly as ruled for picks) and
    // never reaches the resolve call at all — it goes
    // straight to the place page, as the dropdown's
    // place pick does.
    const place = await exactPlaceFor(typed);
    if (place) {
      window.location.assign(placeChoiceRoute(place));
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
      // The site's-fault class (BUG-176's mapping): the
      // whole-check 500 — the serve layer threw — and
      // any other non-OK the box cannot have caused by
      // typing (the 400 answers a malformed request
      // body, which this box never sends) still land on
      // the single failure page, exactly as before.
      window.location.assign(failedRouteFor(typed));
      return;
    }
    let data: { destination?: string; kind?: string };
    try {
      data = (await response.json()) as { destination?: string; kind?: string };
    } catch {
      window.location.assign(failedRouteFor(typed));
      return;
    }
    // The typist's-fault class (BUG-176): the resolve
    // answered, and the answer is that the input cannot
    // be placed — unparseable, unresolvable, no
    // destination for it (the no-location kind, whose
    // destination used to carry the visitor to the
    // landing's unplaced notice). The couldn't-place
    // line shows here instead, under the field, and the
    // visitor stays where they are.
    if (data.kind === "no-location") {
      setBlockMessage(UNPLACED_NOTICE_LINE);
      setBusy(false);
      return;
    }
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
    setValue(event.target.value);
    // A fresh keystroke un-settles the empty answer: the
    // no-suggestions line belongs to the settled query,
    // and the next response re-settles it either way.
    // The failure line un-settles the same way
    // (BUG-203): it belongs to the settled query too,
    // and the next response re-settles it either way.
    setEmptySettled(false);
    setFailedSettled(false);
    // BUG-033 (founder-found live, 20 Nov 2026): the
    // previous query's list drops the moment the text
    // changes. It used to stay rendered — and clickable
    // — under the new text until the new response
    // landed, so CM3's houses sat under a field reading
    // CO1 and a tap could pick the wrong home's check.
    // The panel now holds nothing of the old query
    // while the new one is in flight; the settled
    // response repaints it, and the no-suggestions
    // line still waits for a settled empty answer,
    // never a mid-flight one.
    setLiveGroups([]);
    setActiveId(null);
    // The wider-list row belongs to the settled query
    // too (BUG-185): a keystroke drops its target, its
    // stage and any supplement answer still in flight.
    supplementSeqRef.current += 1;
    setSupplementTarget(null);
    setSupplementStage("idle");
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
            aria-expanded={visibleOpen || emptyShown || failedShown || searchingShown}
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
      ) : visibleOpen ? (
        <SuggestionShell
          id="postcode-suggestions"
          groups={visibleGroups}
          activeId={activeId}
          onSelect={choose}
          dimmed={supplementStage === "loading"}
          footer={
            supplementTarget && supplementTarget.enabled ? (
              <SupplementRow
                stage={supplementStage}
                postcode={supplementTarget.postcode}
                onActivate={startSupplement}
              />
            ) : undefined
          }
        />
      ) : emptyShown ? (
        <div className="postcode-box__suggestions" id="postcode-suggestions">
          <p className="suggest__empty" role="status">
            {POSTCODE_BOX_NO_SUGGESTIONS_LINE}
          </p>
        </div>
      ) : failedShown ? (
        <div className="postcode-box__suggestions" id="postcode-suggestions">
          <p className="suggest__failed" role="status">
            {POSTCODE_BOX_SUGGESTIONS_FAILED_LINE}
          </p>
        </div>
      ) : searchingShown ? (
        <div className="postcode-box__suggestions" id="postcode-suggestions">
          <p className="suggest__searching" role="status">
            {POSTCODE_BOX_SEARCHING_LINE}
          </p>
        </div>
      ) : null}
      <div ref={widgetRef} className="turnstile-slot" aria-hidden="true" />
    </form>
  );
}
