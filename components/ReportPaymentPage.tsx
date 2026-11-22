"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

import { isEmailShape, normaliseEmail } from "../lib/gift";
import {
  liveStartedPayment,
  PAYMENT_DECLINED_FALLBACK_LINE,
  PAYMENT_HOME_NOT_FOUND_LINE,
  PAYMENT_START_FAILED_LINE,
  PAYMENT_TAKEN_LINE,
  type ReportPaymentView,
  type StartedPayment,
} from "../lib/report-payment";

// The payment page (plan steps M9.4 and M9.5; Final
// Sample Master, Sample 9). The report door's paid
// state: built in full here, rendered by /report only
// when M9.6 flips the door with fulfilment behind it.
//
// The card fields are the payment company's embedded
// element — they live inside its cross-origin iframes,
// never in this page's DOM: the only inputs this page
// owns are the delivery email and the consent tick-box
// (the step's Check, pinned by
// tests/report-payment.test.ts). The flow on the page,
// in the 17 Nov 2026 ruling's reading order: the buyer
// reads the honesty area — the Option A line with its
// Terms link, the price and the refund line — and
// ticks the digital-content consent (M9.5), gives the
// delivery email, and pays. A shape-valid email WITH
// the tick standing
// starts a payment on the server (POST
// /api/payments/intent — the server re-resolves the
// home, the translator sets the amount, and the email
// and the consent tick + timestamp ride in the
// payment's metadata), the element mounts against that
// payment's client secret, and Pay confirms with the
// provider. Unticked, no payment can start and neither
// button can fire a confirmation (test T-PAY-06). A
// decline is answered inline, in Sample 9's error-line
// pattern (the standalone Payment failed page is
// M9.7's); a confirmation shows the interim taken line
// until M9.6 builds Sample 10's success surface.

function PaySection({
  view,
  consented,
  onPaid,
}: {
  view: ReportPaymentView;
  consented: boolean;
  onPaid: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements || busy || !consented) return;
    setBusy(true);
    setError(null);
    const result = await stripe.confirmPayment({ elements, redirect: "if_required" });
    if (result.error) {
      // The provider's buyer-facing wording, or our own
      // fallback line — never a raw error object.
      setError(result.error.message ?? PAYMENT_DECLINED_FALLBACK_LINE);
      setBusy(false);
      return;
    }
    onPaid();
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <PaymentElement />
      {error && (
        <p className="field__message field__message--error" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="btn btn--brass report-payment__pay"
        disabled={!stripe || busy || !consented}
      >
        {view.payLabel}
      </button>
      <p className="report-payment__smallprint">{view.closingLine}</p>
    </form>
  );
}

export default function ReportPaymentPage({
  view,
  publishableKey,
  postcode,
  homeKey,
}: {
  view: ReportPaymentView;
  publishableKey: string | null;
  postcode: string | null;
  homeKey: string | null;
}) {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // The digital-content consent (M9.5): the ISO moment
  // the buyer ticked the box, or null while it stands
  // unticked. The timestamp is captured at the tick
  // itself — it is the consent's own time, carried into
  // the payment's metadata, not a time invented later.
  const [consentAt, setConsentAt] = useState<string | null>(null);
  const [started, setStarted] = useState<StartedPayment | null>(null);
  const [paid, setPaid] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const creatingFor = useRef<string | null>(null);
  // The provider's browser library, loaded lazily on
  // the client only — the key arrives as page data from
  // the server (never a build-time public variable).
  const [stripePromise] = useState<Promise<Stripe | null> | null>(() =>
    typeof window !== "undefined" && publishableKey ? loadStripe(publishableKey) : null,
  );

  const normalised = normaliseEmail(email);
  const emailValid = isEmailShape(normalised);

  // The payment that belongs to the page as it now
  // stands: a payment started for any other address, or
  // under a consent that no longer stands, simply does
  // not count — unticking the box or editing the email
  // retires the old payment without any state surgery
  // (liveStartedPayment, lib/report-payment.ts).
  const activeIntent = paid
    ? null
    : liveStartedPayment(started, { emailValid, email: normalised, consentAt });

  // A shape-valid email with the tick standing starts
  // its payment on the server; the answer lands in
  // state from the fetch, never synchronously. A failed
  // start leaves the notice standing and the start
  // button as the retry.
  useEffect(() => {
    if (paid || !emailValid || consentAt === null) {
      creatingFor.current = null;
      return;
    }
    if (
      liveStartedPayment(started, { emailValid, email: normalised, consentAt }) ||
      creatingFor.current === `${normalised}|${consentAt}`
    ) {
      return;
    }
    creatingFor.current = `${normalised}|${consentAt}`;
    let live = true;
    (async () => {
      try {
        const response = await fetch("/api/payments/intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            postcode,
            homeKey,
            email: normalised,
            consent: { ticked: true, timestamp: consentAt },
          }),
        });
        const data = (await response.json().catch(() => null)) as {
          clientSecret?: string;
          error?: string;
        } | null;
        if (!live) return;
        if (response.ok && data?.clientSecret) {
          setNotice(null);
          setStarted({ clientSecret: data.clientSecret, email: normalised, consentAt });
        } else {
          setNotice(
            data?.error === "home-not-found"
              ? PAYMENT_HOME_NOT_FOUND_LINE
              : PAYMENT_START_FAILED_LINE,
          );
        }
      } catch {
        if (live) setNotice(PAYMENT_START_FAILED_LINE);
      } finally {
        if (creatingFor.current === `${normalised}|${consentAt}`) creatingFor.current = null;
      }
    })();
    return () => {
      live = false;
    };
  }, [emailValid, normalised, started, consentAt, paid, postcode, homeKey, attempt]);

  function onConsentChange(checked: boolean) {
    // Ticking stamps the consent with its moment;
    // unticking withdraws it — and with it, through the
    // derivation above, any payment it had started.
    setConsentAt(checked ? new Date().toISOString() : null);
  }

  function onStartClick() {
    if (!emailValid) {
      setEmailError(true);
      return;
    }
    if (!publishableKey) {
      setNotice(PAYMENT_START_FAILED_LINE);
      return;
    }
    // A valid address with the tick standing starts its
    // payment through the effect above; the button is
    // the affordance for a buyer whose card panel has
    // not mounted yet — and the retry when a start has
    // failed.
    setAttempt((value) => value + 1);
  }

  return (
    <main className="journey-page report-door report-payment">
      <h1>{view.heading}</h1>
      {view.subline && <p className="type-lead">{view.subline}</p>}
      <p className="type-lead report-payment__lede">{view.lede}</p>

      <section className="report-door__card">
        <h2>{view.contentsHeading}</h2>
        <ul className="report-door__list">
          {view.contents.map((line) => (
            <li key={line.lead}>
              <strong>{line.lead}</strong>
              {line.rest}
            </li>
          ))}
        </ul>
        <p className="report-door__price">{view.priceLine}</p>
      </section>

      {paid ? (
        <p className="report-payment__taken" role="status">
          {PAYMENT_TAKEN_LINE}
        </p>
      ) : (
        <>
          <section className="report-door__card report-payment__honesty">
            <p className="report-payment__honesty-line">
              {view.termsLineLead}
              <a href={view.termsHref}>{view.termsLinkLabel}</a>.
            </p>
            <p className="report-payment__honesty-price">{view.honestyPriceLine}</p>
            <p className="report-payment__honesty-refund">{view.refundLine}</p>
            <label className="report-payment__consent">
              <input
                className="report-payment__consent-box"
                id="payment-consent"
                name="consent"
                type="checkbox"
                checked={consentAt !== null}
                onChange={(event) => onConsentChange(event.target.checked)}
              />
              <span>{view.consentLabel}</span>
            </label>
          </section>

          <div className="field report-payment__email">
            <label className="field__label" htmlFor="payment-email">
              {view.emailLabel} <span className="report-payment__req">Required</span>
            </label>
            <p className="field__hint">{view.emailHelp}</p>
            <input
              className="field__input"
              id="payment-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder={view.emailPlaceholder}
              value={email}
              aria-invalid={emailError || undefined}
              aria-describedby={emailError ? "payment-email-error" : undefined}
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
                id="payment-email-error"
                role="alert"
              >
                {view.emailError}
              </p>
            )}
          </div>

          <div className="report-payment__tease">
            <span className="buy-bar__mystery-eyebrow">{view.teaseEyebrow}</span>
            <p className="report-payment__tease-line">{view.teaseLine}</p>
          </div>

          <section className="report-payment__panel">
            <div className="report-payment__panel-head">
              <span className="report-payment__panel-title">{view.cardTitle}</span>
              <span className="report-payment__panel-powered">
                Powered by <strong>Stripe</strong>
              </span>
            </div>
            {notice && (
              <p className="field__message field__message--error" role="alert">
                {notice}
              </p>
            )}
            {activeIntent && stripePromise ? (
              <Elements
                stripe={stripePromise}
                options={{ clientSecret: activeIntent.clientSecret }}
              >
                <PaySection
                  view={view}
                  consented={consentAt !== null}
                  onPaid={() => setPaid(true)}
                />
              </Elements>
            ) : (
              <>
                {/* The element's mount point: the provider's
                    card fields render inside its own iframes
                    here once a payment has started — until
                    then this page's DOM holds no card field
                    of any kind. */}
                <div data-payment-element-mount />
                <button
                  type="button"
                  className="btn btn--brass report-payment__pay"
                  onClick={onStartClick}
                  disabled={consentAt === null}
                >
                  {view.payLabel}
                </button>
                <p className="report-payment__smallprint">{view.closingLine}</p>
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}
