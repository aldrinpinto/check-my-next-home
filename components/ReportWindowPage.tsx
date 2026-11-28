"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { isEmailShape, normaliseEmail } from "../lib/gift";
import type { ReportWindowView } from "../lib/report-door";
import { PAYMENT_HOME_NOT_FOUND_LINE, WINDOW_START_FAILED_LINE } from "../lib/report-payment";

// The report door's window page (plan step M9.6; the
// free launch window, D44): the door's structure with
// the window state's lines (lib/report-door.ts) and
// one form — the delivery email, and nothing else. The
// form posts to /api/payments/window, which re-resolves
// the home on the server and takes the free fulfilment
// claim; the answer's reference moves the visitor to
// the success surface, which reads the claim's state
// from there. No payment, no card, no gift — the
// window's rules, in the page's shape as in its words.

export default function ReportWindowPage({
  view,
  postcode,
  homeKey,
}: {
  view: ReportWindowView;
  postcode: string | null;
  homeKey: string | null;
}) {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const normalised = normaliseEmail(email);
  const emailValid = isEmailShape(normalised);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!emailValid) {
      setEmailError(true);
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/payments/window", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postcode, homeKey, email: normalised }),
      });
      const data = (await response.json().catch(() => null)) as {
        ref?: string;
        error?: string;
      } | null;
      if (response.ok && data?.ref) {
        window.location.assign(`/report/success?order=${encodeURIComponent(data.ref)}`);
        return;
      }
      setNotice(
        data?.error === "home-not-found" ? PAYMENT_HOME_NOT_FOUND_LINE : WINDOW_START_FAILED_LINE,
      );
      setBusy(false);
    } catch {
      setNotice(WINDOW_START_FAILED_LINE);
      setBusy(false);
    }
  }

  return (
    <main className="journey-page report-door report-window">
      <h1>{view.heading}</h1>
      {view.subline && <p className="type-lead report-door__subline">{view.subline}</p>}
      <p className="type-lead report-payment__lede">{view.lede}</p>

      <section className="report-door__card">
        <h2>{view.contentsHeading}</h2>
        <ul className="report-door__list">
          {view.contents.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="report-door__state">{view.stateLine}</p>
      </section>

      <form onSubmit={onSubmit} noValidate>
        <div className="field report-payment__email">
          <label className="field__label" htmlFor="window-email">
            {view.emailLabel} <span className="report-payment__req">Required</span>
          </label>
          <p className="field__hint">{view.emailHelp}</p>
          <input
            className="field__input"
            id="window-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder={view.emailPlaceholder}
            value={email}
            aria-invalid={emailError || undefined}
            aria-describedby={emailError ? "window-email-error" : undefined}
            onChange={(event) => {
              setEmail(event.target.value);
              setEmailError(false);
              setNotice(null);
            }}
            onBlur={() => {
              if (email.trim() !== "" && !emailValid) setEmailError(true);
            }}
          />
          {emailError && (
            <p
              className="field__message field__message--error"
              id="window-email-error"
              role="alert"
            >
              {view.emailError}
            </p>
          )}
        </div>
        {notice && (
          <p className="field__message field__message--error" role="alert">
            {notice}
          </p>
        )}
        <button type="submit" className="btn btn--brass report-payment__pay" disabled={busy}>
          {view.buttonLabel}
        </button>
      </form>

      <p className="journey-actions">
        <a href={view.sampleHref}>{view.sampleLabel}</a>{" "}
        {/* BUG-402: client-side, so the return to the
            free check restores the rendered results from
            the router cache instead of re-rendering them
            behind the fallback. */}
        <Link href={view.backHref} prefetch={false}>
          {view.backLabel}
        </Link>
      </p>
    </main>
  );
}
