"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

import { isEmailShape, normaliseEmail } from "../lib/gift";
import {
  PAYMENT_DECLINED_FALLBACK_LINE,
  PAYMENT_HOME_NOT_FOUND_LINE,
  PAYMENT_START_FAILED_LINE,
  PAYMENT_TAKEN_LINE,
  type ReportPaymentView,
} from "../lib/report-payment";

// The payment page (plan step M9.4; Final Sample Master,
// Sample 9). The report door's paid state: built in
// full here, rendered by /report only when M9.6 flips
// the door with fulfilment behind it.
//
// The card fields are the payment company's embedded
// element — they live inside its cross-origin iframes,
// never in this page's DOM: the only input this page
// owns is the delivery email (the step's Check, pinned
// by tests/report-payment.test.ts). The flow on the
// page: a shape-valid email starts a payment on the
// server (POST /api/payments/intent — the server
// re-resolves the home and the translator sets the
// amount; the email rides in the payment's metadata),
// the element mounts against that payment's client
// secret, and Pay confirms with the provider. A decline
// is answered inline, in Sample 9's error-line pattern
// (the standalone Payment failed page is M9.7's); a
// confirmation shows the interim taken line until
// M9.6 builds Sample 10's success surface.

function PaySection({ view, onPaid }: { view: ReportPaymentView; onPaid: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements || busy) return;
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
        disabled={!stripe || busy}
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
  const [intent, setIntent] = useState<{ clientSecret: string; forEmail: string } | null>(null);
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

  // The payment that belongs to the address now standing:
  // an intent created for any other address (or while the
  // address is misshapen) simply does not count — editing
  // the email retires the old payment, whose metadata
  // carries the first address, without any state surgery.
  const activeIntent = !paid && emailValid && intent?.forEmail === normalised ? intent : null;

  // A shape-valid email starts its payment on the server;
  // the answer lands in state from the fetch, never
  // synchronously. A failed start leaves the notice
  // standing and the start button as the retry.
  useEffect(() => {
    if (paid || !emailValid) {
      creatingFor.current = null;
      return;
    }
    if (intent?.forEmail === normalised || creatingFor.current === normalised) return;
    creatingFor.current = normalised;
    let live = true;
    (async () => {
      try {
        const response = await fetch("/api/payments/intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postcode, homeKey, email: normalised }),
        });
        const data = (await response.json().catch(() => null)) as {
          clientSecret?: string;
          error?: string;
        } | null;
        if (!live) return;
        if (response.ok && data?.clientSecret) {
          setNotice(null);
          setIntent({ clientSecret: data.clientSecret, forEmail: normalised });
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
        if (creatingFor.current === normalised) creatingFor.current = null;
      }
    })();
    return () => {
      live = false;
    };
  }, [emailValid, normalised, intent, paid, postcode, homeKey, attempt]);

  function onStartClick() {
    if (!emailValid) {
      setEmailError(true);
      return;
    }
    if (!publishableKey) {
      setNotice(PAYMENT_START_FAILED_LINE);
      return;
    }
    // A valid address starts its payment through the
    // effect above; the button is the affordance for a
    // buyer whose card panel has not mounted yet — and
    // the retry when a start has failed.
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
                <PaySection view={view} onPaid={() => setPaid(true)} />
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
