"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  POSTCODE_BOX_BUTTON,
  POSTCODE_BOX_BUTTON_BARE,
  POSTCODE_BOX_HINT,
  POSTCODE_BOX_LABEL,
  POSTCODE_BOX_PLACEHOLDER_BARE,
} from "../lib/home";
import { FAILED_ROUTE, TURNSTILE_BLOCK_LINE } from "../lib/journey";
import { Button, SuggestionShell, type SuggestionGroup } from "./kit";

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
// TextField. The suggestions prop is the shell's seam: a
// future address-data source (D71, priced separately) will
// hand grouped suggestions in; no caller passes any yet,
// so the shell renders nowhere today.
//
// Fidelity pass 2 (founder, 17 Nov 2026): the `bare` prop is
// the decided sample page's hero form — no visible label or
// hint (the label survives, visually hidden, as the field's
// accessible name), the sample's placeholder in the field,
// and the Brass button in the sample's words. The submit
// path is identical in both forms; only the furniture
// differs. The standard form (label, hint, Forest button)
// serves the journey's retry surfaces — the no-location fix
// route and the wider-area banner. Both forms carry the
// neutral SW1A 1AA example: the founder's own postcode never
// appears in visitor-facing copy.

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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBlockMessage(null);
    setBusy(true);
    const input = new FormData(event.currentTarget).get("postcode");
    const typed = typeof input === "string" ? input : "";

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
      window.location.assign(FAILED_ROUTE);
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
      window.location.assign(FAILED_ROUTE);
      return;
    }
    const data = (await response.json()) as { destination?: string };
    window.location.assign(data.destination ?? FAILED_ROUTE);
  }

  const describedBy = bare
    ? blockMessage
      ? "postcode-message"
      : undefined
    : blockMessage
      ? "postcode-hint postcode-message"
      : "postcode-hint";

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
            placeholder={bare ? POSTCODE_BOX_PLACEHOLDER_BARE : "SW1A 1AA"}
            autoComplete="postal-code"
            autoFocus={autoFocus}
            defaultValue={defaultValue}
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
      {suggestions && <SuggestionShell groups={suggestions} />}
      <div ref={widgetRef} className="turnstile-slot" aria-hidden="true" />
    </form>
  );
}
