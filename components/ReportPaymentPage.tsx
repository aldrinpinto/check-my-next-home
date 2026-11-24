"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

import { isEmailShape, normaliseEmail } from "../lib/gift";
import {
  liveStartedPayment,
  paymentElementKey,
  PAYMENT_CONSENT_ERROR_LINE,
  PAYMENT_DECLINED_FALLBACK_LINE,
  PAYMENT_HOME_NOT_FOUND_LINE,
  PAYMENT_START_FAILED_LINE,
  type ReportPaymentView,
  type StartedPayment,
} from "../lib/report-payment";
import { fireJourneyEvent } from "./JourneyBeacon";

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
// tests/report-payment.test.ts). The flow on the page:
// the buyer ticks the digital-content consent (M9.5)
// — the consent block is a single checkbox line in
// small print since BUG-215 (founder ruling, 24 Nov
// 2026): the one line naming what the report is with
// its Terms link, followed by the change-of-mind
// sentence; the price stands on the Pay button alone
// — gives the delivery email, and
// pays. Sample 2 "Checkout alongside" (founder,
// 24 Nov 2026) lays the page out in two columns on
// desktop — the selling points (mystery tease +
// contents card) on the left, one sticky checkout
// card on the right carrying the consent, the email
// and the payment panel; on phones the checkout card
// stacks first, straight after the address. The
// Card and Revolut Pay method rows stand visible in
// the checkout card from the start; only the Pay
// button waits for the tick and a shape-valid email.
// A shape-valid email WITH the tick standing
// starts a payment on the server (POST
// /api/payments/intent — the server re-resolves the
// home, the translator sets the amount, and the email
// and the consent tick + timestamp ride in the
// payment's metadata), the element mounts against that
// payment's client secret, and Pay confirms with the
// provider. Unticked, no payment can start and neither
// button can fire a confirmation (test T-PAY-06). A
// decline is answered inline, in Sample 9's error-line
// pattern.
//
// M9.7 hands the provider the return address: the
// confirm call carries return_url — /report/return
// naming this order — so a payment that leaves the
// page (the bank-approval detour) comes back to the
// order's own landing, which reads the order's true
// state server-side and routes from it: paid, to the
// success surface; not paid, to Sample 12's page
// (lib/report-payment-failed.ts), rendered verbatim.
//
// M9.6 completes the page's own wiring: the intent
// answer carries the LANE's publishable key (the test
// lane — a tester's payment is created with the test
// key set, and the element initialises from that same
// set or it cannot confirm it); a started payment
// fires checkout_started (the funnel's second step,
// recorded by our own endpoint like every journey
// event); an answer that recognises a bound gift
// creates no payment at all — the page moves straight
// to the success surface, which shows the gift-applied
// banner; and a confirmed payment moves to the success
// surface too (Sample 10, lib/report-success.ts),
// which reads the fulfilment state server-side. BUG-217
// (24 Nov 2026): no interim line stands between the
// provider's confirmation and that navigation — the
// buyer goes straight from the payment screen to the
// success surface.

// The provider library's promises, one per publishable
// key (the default set's and the test lane's): the
// library is a singleton per key by the provider's own
// contract, and a payment's element must initialise
// from the set that created it.
const stripePromises = new Map<string, Promise<Stripe | null>>();

function stripePromiseFor(key: string): Promise<Stripe | null> {
  let promise = stripePromises.get(key);
  if (!promise) {
    promise = loadStripe(key);
    stripePromises.set(key, promise);
  }
  return promise;
}

function PaySection({
  view,
  consented,
  orderRef,
  onPaid,
}: {
  view: ReportPaymentView;
  consented: boolean;
  // The started payment's own id — the order's
  // reference (M9.7): the confirm call's return_url
  // names it, so a payment that leaves the page (the
  // bank-approval detour) returns to the order's own
  // landing, which reads the order's true state and
  // routes from it.
  orderRef: string | null;
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
    const returnUrl = orderRef
      ? `${window.location.origin}/report/return?order=${encodeURIComponent(orderRef)}`
      : `${window.location.origin}/report/return`;
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: "if_required",
    });
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
  // BUG-132: the consent error — set when the buyer
  // tries to pay with the tick standing unticked,
  // cleared the moment the box is ticked. Until this
  // stack the Pay button simply stood disabled and
  // never said why.
  const [consentError, setConsentError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // The digital-content consent (M9.5): the ISO moment
  // the buyer ticked the box, or null while it stands
  // unticked. The timestamp is captured at the tick
  // itself — it is the consent's own time, carried into
  // the payment's metadata, not a time invented later.
  const [consentAt, setConsentAt] = useState<string | null>(null);
  const [started, setStarted] = useState<StartedPayment | null>(null);
  const [attempt, setAttempt] = useState(0);
  const creatingFor = useRef<string | null>(null);
  // The claim reference of the payment this page
  // started — the success surface's key, kept from the
  // intent answer in a ref of its own, so the navigation
  // after a confirmed payment reads it without waiting
  // on a state round-trip.
  const startedRef = useRef<string | null>(null);
  // The provider's browser library, loaded lazily on
  // the client only — the key arrives as page data from
  // the server (never a build-time public variable),
  // and a started payment's lane key (the test lane,
  // M9.6) supersedes the page's key for that payment's
  // element. loadStripe promises are cached per key at
  // module level (stripePromiseFor, below): the element
  // for a payment must initialise from the set that
  // created it.

  const normalised = normaliseEmail(email);
  const emailValid = isEmailShape(normalised);

  // The payment that belongs to the page as it now
  // stands: a payment started for any other address, or
  // under a consent that no longer stands, simply does
  // not count — unticking the box or editing the email
  // retires the old payment without any state surgery
  // (liveStartedPayment, lib/report-payment.ts).
  const activeIntent = liveStartedPayment(started, { emailValid, email: normalised, consentAt });

  // The element initialises from the key of the set
  // that created the standing payment (the lane's key
  // where the intent answer carried one — the test
  // lane, M9.6), falling back to the page's own key.
  const elementKey = paymentElementKey(activeIntent, publishableKey);
  const stripePromise = useMemo(
    () => (typeof window !== "undefined" && elementKey ? stripePromiseFor(elementKey) : null),
    [elementKey],
  );

  // A shape-valid email with the tick standing starts
  // its payment on the server; the answer lands in
  // state from the fetch, never synchronously. A failed
  // start leaves the notice standing and the start
  // button as the retry.
  useEffect(() => {
    if (!emailValid || consentAt === null) {
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
          intentId?: string;
          publishableKey?: string | null;
          gifted?: boolean;
          ref?: string;
          error?: string;
        } | null;
        if (!live) return;
        if (response.ok && data?.gifted && data.ref) {
          // Gift recognition: no payment was created —
          // the order stands claimed as a gifted
          // fulfilment, and the success surface (which
          // carries the gift-applied banner) is where
          // the buyer belongs.
          window.location.assign(`/report/success?order=${encodeURIComponent(data.ref)}`);
          return;
        }
        if (response.ok && data?.clientSecret) {
          setNotice(null);
          startedRef.current = data.intentId ?? null;
          setStarted({
            clientSecret: data.clientSecret,
            email: normalised,
            consentAt,
            publishableKey: data.publishableKey ?? null,
            intentId: data.intentId ?? "",
          });
          // The funnel's second step: a payment stands
          // started for this page (M9.6, Amendment B).
          fireJourneyEvent("checkout_started");
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
  }, [emailValid, normalised, started, consentAt, postcode, homeKey, attempt]);

  function onConsentChange(checked: boolean) {
    // Ticking stamps the consent with its moment;
    // unticking withdraws it — and with it, through the
    // derivation above, any payment it had started.
    // Ticking also clears the consent error (BUG-132).
    setConsentAt(checked ? new Date().toISOString() : null);
    if (checked) setConsentError(false);
  }

  function onStartClick() {
    if (!emailValid) {
      setEmailError(true);
      return;
    }
    if (consentAt === null) {
      // BUG-132: an attempt without the tick is answered
      // where the tick stands — the message under the
      // tick line, and the tick outlined. No payment
      // starts: the start effect still requires the
      // consent to stand.
      setConsentError(true);
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
      {view.subline && <p className="type-lead report-door__subline">{view.subline}</p>}

      {/* Sample 2 "Checkout alongside" (founder,
          24 Nov 2026): two columns on desktop — the
          selling points on the left, one checkout card
          on the right (sticky); on phones the checkout
          card stacks first, straight after the address. */}
      <div className="report-payment__layout">
        <div className="report-payment__selling">
          {/* BUG-133: the mystery tease stands directly
              under the intro, above the contents card — in
              the first screenful, where a tease belongs. It
              stood below the email block until this stack. */}
          <div className="report-payment__tease">
            <span className="buy-bar__mystery-eyebrow">{view.teaseEyebrow}</span>
            <p className="report-payment__tease-line">{view.teaseLine}</p>
          </div>

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
            {/* BUG-131: no one-payment line closes this
                card — the honesty block below is the single
                money statement on the page. */}
          </section>
        </div>

        <div className="report-payment__checkout">
          {/* The checkout card (Sample 2): the head
              carries no price — the price shows only on
              the Pay button — then the plain one-payment
              line, the BUG-215 consent, the email block
              and the payment panel, in that order. */}
          <section className="report-door__card report-payment__checkout-card">
            <div className="report-payment__checkout-head">
              <h2>Detailed report</h2>
            </div>
            <p className="report-payment__one-payment">{view.onePaymentLine}</p>

            <>
              <section className="report-payment__honesty">
                {/* BUG-215 (founder ruling, 24 Nov 2026):
                    the card is a SINGLE checkbox line in
                    small print — the one line naming what
                    the report is with its Terms link,
                    followed by the change-of-mind
                    sentence. This supersedes BUG-145's
                    block: the "Make my report now" tick
                    label, the separate small-print
                    paragraph, the Required pill and the
                    bold price line are all gone. The price
                    stands on the Pay button alone.
                    BUG-132's consent error still answers
                    directly under the tick line. */}
                <label
                  className={`report-payment__consent${consentError ? " report-payment__consent--attention" : ""}`}
                >
                  <input
                    className="report-payment__consent-box"
                    id="payment-consent"
                    name="consent"
                    type="checkbox"
                    checked={consentAt !== null}
                    aria-describedby={consentError ? "payment-consent-error" : undefined}
                    onChange={(event) => onConsentChange(event.target.checked)}
                  />
                  <span>
                    {view.termsLineLead}
                    <a href={view.termsHref}>{view.termsLinkLabel}</a>.{view.consentTail}
                  </span>
                </label>
                {consentError && (
                  <p
                    className="report-payment__consent-error"
                    id="payment-consent-error"
                    role="alert"
                  >
                    {PAYMENT_CONSENT_ERROR_LINE}
                  </p>
                )}
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
                    options={{
                      clientSecret: activeIntent.clientSecret,
                      // PF-13: the element is dressed in the
                      // page's own livery — Sample 9's drawn
                      // fields (labels #3C4257 at 13.5px/500,
                      // inputs on #CBD2DC at 8px radius) over
                      // the page's text face — instead of the
                      // provider's unthemed default.
                      appearance: {
                        theme: "stripe",
                        variables: {
                          fontFamily:
                            '"DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                          colorPrimary: "#2f5d3e",
                          colorText: "#30313d",
                          borderRadius: "8px",
                        },
                        rules: {
                          ".Label": { color: "#3c4257", fontSize: "13.5px", fontWeight: "500" },
                          ".Input": {
                            border: "1px solid #cbd2dc",
                            boxShadow: "0 1px 2px rgba(16, 24, 40, 0.05)",
                          },
                        },
                      },
                    }}
                  >
                    <PaySection
                      view={view}
                      consented={consentAt !== null}
                      orderRef={activeIntent.intentId || null}
                      onPaid={() => {
                        // The success surface reads the
                        // fulfilment claim server-side; the
                        // claim's reference is the payment's
                        // own id.
                        if (startedRef.current) {
                          window.location.assign(
                            `/report/success?order=${encodeURIComponent(startedRef.current)}`,
                          );
                        }
                      }}
                    />
                  </Elements>
                ) : (
                  <>
                    {/* Sample 2: the payment methods are
                        visible from the start — these rows
                        are the page's own static list, not
                        the provider's element (the element
                        still mounts only once a payment has
                        started, below). */}
                    <ul className="report-payment__methods" aria-label="Payment methods">
                      <li className="report-payment__method">Card</li>
                      <li className="report-payment__method">Revolut Pay</li>
                    </ul>
                    {/* The element's mount point: the provider's
                        card fields render inside its own iframes
                        here once a payment has started — until
                        then this page's DOM holds no card field
                        of any kind. */}
                    <div data-payment-element-mount />
                    {/* BUG-132: the button is NOT disabled
                        while the tick stands unticked — it
                        wears the disabled dress (aria-disabled)
                        so an attempt can be answered with the
                        consent error instead of silence. No
                        payment can start unticked either way:
                        the start effect requires the consent. */}
                    <button
                      type="button"
                      className="btn btn--brass report-payment__pay"
                      onClick={onStartClick}
                      aria-disabled={consentAt === null || undefined}
                    >
                      {view.payLabel}
                    </button>
                    <p className="report-payment__smallprint">{view.closingLine}</p>
                  </>
                )}
              </section>
            </>
          </section>
        </div>
      </div>
    </main>
  );
}
