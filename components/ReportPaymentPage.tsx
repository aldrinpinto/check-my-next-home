"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

import { isEmailShape, normaliseEmail, type GiftGoneReason } from "../lib/gift";
import { homeRoute } from "../lib/journey";
import {
  effectivePayLabel,
  emailErrorFor,
  giftEmailMatches,
  liveStartedPayment,
  paymentElementKey,
  paymentGiftLockedNote,
  paymentMethodOrderFor,
  PAYMENT_CARD_LOAD_FAILED_LINE,
  PAYMENT_CONSENT_ERROR_LINE,
  PAYMENT_DECLINED_FALLBACK_LINE,
  PAYMENT_DECLINED_LINE,
  PAYMENT_EMAIL_ERROR,
  PAYMENT_GIFT_USE_DIFFERENT_EMAIL,
  PAYMENT_HOME_NOT_FOUND_LINE,
  PAYMENT_START_FAILED_LINE,
  paymentGiftGoneLine,
  type ReportPaymentView,
  type StartedPayment,
  type PreferredPaymentMethod,
} from "../lib/report-payment";
import { fireJourneyEvent } from "./JourneyBeacon";
import { AmexMark, DiscoverMark, MastercardMark, RevolutMark, VisaMark } from "./PaymentBrandMarks";

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
// BUG-335 (25 Nov 2026): the paid flow starts ONLY on
// a start click, never on the consent tick —
// the tick authorises, the click pays. BUG-367
// (26 Nov 2026): the click is the Pay button's OR
// either method row's — both run the same
// onStartClick path (email + consent validation
// included), the row recording its method so the
// element lists it first. Clicking Pay — or a row —
// with the tick standing and a shape-valid email
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
//
// BUG-223: the gift holder's variant (approved Screen
// C, as drawn). The visit's claimed gift arrives in
// the view (giftEmail, from the cmnh-gift cookie the
// claim set): the email stands pre-filled, the
// gift-applied line stands under the heading, the
// consent's lead and the button speak of the free
// report, never of paying, and the card panel keeps
// its "Card payment" title with no "Powered by
// Stripe" (BUG-333: the panel head is the paid page's
// own, never "Detailed report" twice). The consent
// starts UNTICKED for a gift holder, exactly as for a
// payer (BUG-348 — the old pre-tick, Screen C as
// drawn, is gone: a consent the claimant never
// actively gives is no consent) — and the order still
// starts only when the claimant clicks "Get my free
// report".
// The gift applies while the entered email still
// matches the bound email — editing away from it
// reverts the page to its paid form and clears the
// tick in the same keystroke, so a consent given for
// the gift can never cover a paid order; re-entering
// the bound
// email revives the gift form on the same page load
// (BUG-334). The mystery tease stands for a gift
// holder too: Screen C draws it, and the founder
// approved it as drawn. The consent tick's legal
// function (the report is made straight away; the
// 14-day change-of-mind right ends on delivery) holds
// for a gifted report too — only its paying word is
// swapped for the ordering word. BUG-325: the
// visit-time gift state never outlives the server's
// answer — if the intent answers as a payment for a
// gift visit, the page reconciles to the paid form,
// clears the consent, and says the gift is
// no longer available.

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
  payLabel,
  consented,
  orderRef,
  preferredMethod,
  onPaid,
  onDeclined,
}: {
  view: ReportPaymentView;
  // BUG-267: the button's label as the page now
  // stands (effectivePayLabel, lib/report-payment.ts)
  // — handed down, never re-derived here, so the
  // mounted element and the fallback button can never
  // disagree about what the order is.
  payLabel: string;
  consented: boolean;
  // BUG-367: the method the buyer tapped on the
  // method rows, or null where no row was tapped
  // (Pay itself carries no preference) — handed
  // down so the element lists it first.
  preferredMethod: PreferredPaymentMethod | null;
  // The started payment's own id — the order's
  // reference (M9.7): the confirm call's return_url
  // names it, so a payment that leaves the page (the
  // bank-approval detour) returns to the order's own
  // landing, which reads the order's true state and
  // routes from it.
  orderRef: string | null;
  onPaid: () => void;
  // BUG-339: a declined card retires the payment it
  // was confirmed against — the parent clears the
  // started payment, so the retry starts a FRESH
  // payment instead of re-confirming the dead one.
  onDeclined: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  // BUG-367: the element's own options — the tapped
  // method stands first in its list (paymentMethodOrder
  // is a Payment Element option, not an Elements
  // option, per the installed provider types:
  // StripePaymentElementOptions carries it,
  // StripeElementsOptionsClientSecret does not). No
  // tap means the provider's default order
  // (paymentMethodOrderFor returns undefined, never
  // an invented one). Memoised on the preference so
  // the element is not handed a new options object
  // on every render.
  const paymentElementOptions = useMemo(
    () => ({ paymentMethodOrder: paymentMethodOrderFor(preferredMethod) }),
    [preferredMethod],
  );
  // BUG-341: the ONE source of truth for card-field
  // errors — updated on every change event from the
  // provider's element, and read by both the field
  // error under the element and the summary above Pay,
  // so the two can never disagree. BUG-339: editing
  // clears it at once — a corrected number never
  // waits for the next Pay click to lose its stale
  // "invalid".
  const [cardError, setCardError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  function focusFirstCardField() {
    // BUG-340: a failed submit keeps the card fields
    // in view — the panel scrolls back to the buyer
    // and the provider's first field takes focus —
    // instead of jumping past the panel to the
    // optional section below it.
    // getElement(PaymentElement) is typed as the broad
    // StripeElement union, and only the members built
    // on StripeElementBase carry focus() — the
    // messaging and display-only members do not — so
    // the call is narrowed to the members that have
    // it. The element mounted here is a Payment
    // Element, which does carry focus().
    formRef.current?.scrollIntoView({ block: "center" });
    const paymentElement = elements?.getElement(PaymentElement);
    if (paymentElement && "focus" in paymentElement) paymentElement.focus();
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements || busy || !consented) return;
    setBusy(true);
    setCardError(null);
    const returnUrl = orderRef
      ? `${window.location.origin}/report/return?order=${encodeURIComponent(orderRef)}`
      : `${window.location.origin}/report/return`;
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: "if_required",
    });
    if (result.error) {
      // BUG-339: a decline is answered once, in the
      // site's own voice — the provider's decline
      // line never reaches the page (the parent
      // renders PAYMENT_DECLINED_LINE with its next
      // step and the link back to the free check).
      // The decline retires this payment: the retry
      // is a fresh payment, never a re-confirmation
      // of the dead one.
      if (result.error.code === "card_declined") {
        setBusy(false);
        onDeclined();
        return;
      }
      // Any other confirm error is a field error —
      // the provider's field wording, carried as the
      // one card error above: the summary above Pay
      // and the field error are the same state
      // (BUG-341). The payment stands, so the buyer
      // fixes the field and tries again against it.
      setCardError(result.error.message ?? PAYMENT_DECLINED_FALLBACK_LINE);
      setBusy(false);
      focusFirstCardField();
      return;
    }
    onPaid();
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate>
      <PaymentElement
        options={paymentElementOptions}
        onChange={(event) => {
          // BUG-341: the change event carries no error
          // — only empty, complete, collapsed and value
          // (StripePaymentElementChangeEvent) — so the
          // one card error is refreshed here only by
          // what the event actually reports: a complete
          // element is well-formed, so no field error
          // can stand. The error itself arrives on the
          // fieldchange event below.
          if (event.complete) setCardError(null);
        }}
        onFieldChange={(event) => {
          // BUG-341: every field change refreshes the
          // one card error — a field error appears as
          // it is typed (including a too-short CVC,
          // once the provider reports it), and a
          // corrected field clears its error at once
          // (state.error is null on correction).
          // BUG-341 note: the provider's element
          // reports its fields as one combined
          // element — there is no per-field CVC-length
          // signal beyond the error it surfaces here,
          // and no site code rewrites an expiry: the
          // 13/99 → 01/39 rewrite is the provider's
          // element's own behaviour, not this page's.
          // The provider's types mark this event as
          // needing beta access — without it the
          // handler never fires, and the change
          // handler above is the only clear path.
          setCardError(event.state.error ? event.state.error.message : null);
        }}
      />
      {cardError && (
        <p className="field__message field__message--error" role="alert">
          {cardError}
        </p>
      )}
      {/* BUG-341: the summary above Pay is the same
          state as the field error — never a second
          wording ("invalid" under the field against
          "incomplete" above Pay is the defect this
          closes). BUG-339: Pay is never left disabled
          with no message — while the provider is
          still loading, the panel says so. */}
      {cardError && <p className="field__message field__message--error">{cardError}</p>}
      {!stripe && (
        <p className="field__message" role="status">
          Loading the card panel...
        </p>
      )}
      <button
        type="submit"
        className="btn btn--brass report-payment__pay"
        disabled={!stripe || busy || !consented}
      >
        {payLabel}
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
  // BUG-223: the bound email stands pre-filled for a
  // gift holder — the gift is tied to that email, and
  // the intent's gift recognition keys on it.
  const [email, setEmail] = useState(view.giftEmail ?? "");
  // BUG-327: the email error carries WHICH line, not
  // just that there is one — a blank field and a
  // mistyped one are answered differently
  // (emailErrorFor, lib/report-payment.ts).
  const [emailError, setEmailError] = useState<string | null>(null);
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
  // BUG-348: the consent starts UNCHECKED for a gift
  // holder exactly as for a payer — the claimant ticks
  // it actively, and the button stays in its disabled
  // dress until then. The old pre-tick (BUG-223's
  // Screen C as drawn, consent set on arrival) is
  // gone: a consent the claimant never actively gives
  // is no consent. The order still starts only when
  // the claimant clicks "Get my free report" (BUG-335:
  // the paid flow starts only on the Pay click, never
  // on the tick), so the tick alone never places it.
  const [consentAt, setConsentAt] = useState<string | null>(null);
  const [started, setStarted] = useState<StartedPayment | null>(null);
  // BUG-367: the method the buyer tapped on the
  // method rows, or null where no row was tapped
  // (Pay itself carries no preference). Recorded
  // only once a start passes validation, in
  // onStartClick below — a failed tap records
  // nothing — and read by the element's options, so
  // the tapped method stands first in its list.
  const [preferredMethod, setPreferredMethod] = useState<PreferredPaymentMethod | null>(null);
  // The start-click count: every Pay click that
  // reaches for a payment counts, including retries
  // after a failed start or a decline.
  const [attempt, setAttempt] = useState(0);
  // BUG-325: the visit's gift, lost at intent time —
  // the server answered a payment for a gift visit, so
  // the gift is gone for this page load and the page
  // stays on its paid form. Set only by the server's
  // answer, never by anything the visitor clicks:
  // the visit-time gift state must never outlive it.
  const [giftLost, setGiftLost] = useState(false);
  // BUG-339: a declined card — the message stands at
  // this level so it survives the card panel
  // unmounting when the dead payment is retired.
  const [declined, setDeclined] = useState(false);
  // BUG-334: the email field's one-shot unlock — the
  // visitor chose "Use a different email", so the
  // locked field opens for typing. Unlocking alone
  // abandons nothing: the gift stands until the
  // field's value actually changes away from the
  // bound email, and re-entering it re-locks the
  // field with the gift form revived.
  const [emailUnlocked, setEmailUnlocked] = useState(false);
  // BUG-326: the provider's script failed to load —
  // the card panel cannot mount, so the page says so
  // with a retry instead of leaving a dead Pay
  // button. stripeLoadAttempt re-runs the load on
  // retry (the failed promise is dropped from the
  // per-key cache first, or the retry would replay
  // the same dead promise).
  const [stripeFailed, setStripeFailed] = useState(false);
  const [stripeLoadAttempt, setStripeLoadAttempt] = useState(0);
  const creatingFor = useRef<string | null>(null);
  // The claim reference of the payment this page
  // started — the success surface's key, kept from the
  // intent answer in a ref of its own, so the navigation
  // after a confirmed payment reads it without waiting
  // on a state round-trip.
  const startedRef = useRef<string | null>(null);
  // BUG-340: the first field with an error takes
  // focus on a failed submit — the email field, the
  // consent tick, and (inside PaySection) the card
  // panel's first field.
  const emailRef = useRef<HTMLInputElement | null>(null);
  const consentRef = useRef<HTMLInputElement | null>(null);
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

  // BUG-223 + BUG-334: the gift applies while the
  // entered email still matches the email the gift is
  // bound to (giftEmailMatches, lib/report-payment.ts
  // — the canonical match, BUG-267). The rule is
  // value-driven and nothing else: no click abandons
  // the gift, and re-entering the bound email revives
  // the gift form on the same page load.
  const giftApplies = giftEmailMatches(view.giftEmail, email);

  // BUG-287 + BUG-325: the gift in force on this page
  // — the email match, unless the server has said at
  // intent time that the gift is gone. While it
  // stands the delivery email field is locked to the
  // claimant address (until the visitor unlocks it to
  // type); losing it switches the page to its paid
  // form for this order. The gift itself stays live
  // server-side (the claim stands) unless the server
  // said otherwise, so reloading restores the gift
  // form — except after a BUG-325 reconcile, where
  // the server has already answered that it is gone.
  const giftActive = giftApplies && !giftLost;

  // The payment that belongs to the page as it now
  // stands: a payment started for any other address, or
  // under a consent that no longer stands, simply does
  // not count — unticking the box or editing the email
  // retires the old payment without any state surgery
  // (liveStartedPayment, lib/report-payment.ts).
  const activeIntent = liveStartedPayment(started, { emailValid, email: normalised, consentAt });

  // BUG-267: the button follows the page's actual
  // state — the gift label only while the gift applies
  // and no payment stands; the paid label the moment
  // the email leaves the bound address, or a payment
  // stands. One derivation feeds both buttons (the
  // fallback and the mounted element's), so they can
  // never disagree.
  const payLabel = effectivePayLabel(view, giftActive, activeIntent !== null);

  // The element initialises from the key of the set
  // that created the standing payment (the lane's key
  // where the intent answer carried one — the test
  // lane, M9.6), falling back to the page's own key.
  const elementKey = paymentElementKey(activeIntent, publishableKey);
  const stripePromise = useMemo(() => {
    // BUG-326: the attempt is read only to key this
    // memo — the retry drops the cached promise
    // first, so the re-run loads the provider fresh.
    void stripeLoadAttempt;
    return typeof window !== "undefined" && elementKey ? stripePromiseFor(elementKey) : null;
  }, [elementKey, stripeLoadAttempt]);

  // BUG-326: watch the provider promise's resolution.
  // A null resolution is the script failing to load —
  // the card panel cannot mount, and the page must
  // say so (stripeFailed) instead of leaving a dead
  // Pay button. While the promise is still in flight
  // the failure is not set: the panel is loading, not
  // dead. The flag resets when the promise identity
  // changes — adjusted during render, the endorsed
  // reset-on-change pattern, never inside the effect
  // (a synchronous setState there is a cascading
  // render).
  const [prevStripePromise, setPrevStripePromise] = useState(stripePromise);
  if (prevStripePromise !== stripePromise) {
    setPrevStripePromise(stripePromise);
    setStripeFailed(false);
  }
  useEffect(() => {
    if (!stripePromise) return;
    let live = true;
    stripePromise
      .then((stripe) => {
        if (live) setStripeFailed(stripe === null);
      })
      .catch(() => {
        if (live) setStripeFailed(true);
      });
    return () => {
      live = false;
    };
  }, [stripePromise]);

  function onRetryCardPanel() {
    // BUG-326: the retry re-runs the load from scratch
    // — the dead promise is dropped from the per-key
    // cache first, and the attempt count re-keys the
    // memo above so a fresh loadStripe runs.
    if (elementKey) stripePromises.delete(elementKey);
    setStripeFailed(false);
    setStripeLoadAttempt((value) => value + 1);
  }

  // BUG-335: the paid flow starts ONLY here, on the
  // Pay button click — never on the consent tick, and
  // never on page load. The tick authorises; this
  // click pays. The answer lands in state from the
  // fetch, never synchronously. A failed start leaves
  // the notice standing and the Pay button as the
  // retry — and the retry is a FRESH payment per
  // attempt: no started payment is ever reused across
  // attempts, and a declined payment is retired
  // outright (onDeclined, below), never re-confirmed.
  async function startPayment() {
    if (creatingFor.current) return;
    if (consentAt === null) return;
    if (liveStartedPayment(started, { emailValid, email: normalised, consentAt })) return;
    const consentTimestamp = consentAt;
    // BUG-325: whether this click arrived as a gift
    // visit — read BEFORE the fetch, because the
    // answer may reconcile the page away from it.
    const giftVisit = giftActive;
    creatingFor.current = `${normalised}|${consentTimestamp}`;
    setAttempt((value) => value + 1);
    try {
      const response = await fetch("/api/payments/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postcode,
          homeKey,
          email: normalised,
          consent: { ticked: true, timestamp: consentTimestamp },
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        clientSecret?: string;
        intentId?: string;
        publishableKey?: string | null;
        gifted?: boolean;
        ref?: string;
        error?: string;
        // BUG-325 follow-up: why the visit's gift was
        // gone — expired, or already used — where the
        // server could tell. Absent, the line names
        // both causes, as before.
        giftGoneReason?: GiftGoneReason;
      } | null;
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
        if (giftVisit) {
          // BUG-325: the server answered a payment
          // for a gift visit — the gift's standing
          // changed between page load and this click.
          // The server's answer is the authority: the
          // page reconciles to the paid form — the gift
          // line goes, the card methods and the
          // "Powered by Stripe" line show, and the
          // consent is cleared so the buyer ticks
          // knowingly for £4.99, with a
          // plain line saying the gift is gone. The
          // follow-up names the one that happened
          // where the answer carried the reason
          // (expired, or already used); without one
          // the line names both, as before. The
          // payment this click created is NOT kept:
          // it was created under a consent that no
          // longer stands, so the buyer's knowing
          // tick and next Pay click start a fresh one.
          setGiftLost(true);
          setConsentAt(null);
          setPreferredMethod(null);
          setNotice(paymentGiftGoneLine(data.giftGoneReason));
          return;
        }
        setNotice(null);
        setDeclined(false);
        startedRef.current = data.intentId ?? null;
        setStarted({
          clientSecret: data.clientSecret,
          email: normalised,
          consentAt: consentTimestamp,
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
      setNotice(PAYMENT_START_FAILED_LINE);
    } finally {
      creatingFor.current = null;
    }
  }

  function onDeclined() {
    // BUG-339: a declined card retires this payment —
    // the dead intent is never re-confirmed, and the
    // derivation above retires it on an email edit or
    // an untick just the same. The retry is the next
    // Pay click, which starts a FRESH payment. The
    // decline message stands at this level (the
    // `declined` flag, rendered in the panel) so it
    // survives the card panel unmounting with the
    // retired payment.
    startedRef.current = null;
    setStarted(null);
    setDeclined(true);
  }

  function onConsentChange(checked: boolean) {
    // Ticking stamps the consent with its moment;
    // unticking withdraws it — and with it, through the
    // derivation above, any payment it had started.
    // Ticking also clears the consent error (BUG-132).
    setConsentAt(checked ? new Date().toISOString() : null);
    if (checked) setConsentError(false);
  }

  function onUseDifferentEmail() {
    // BUG-334: the escape ONLY unlocks the field and
    // focuses it — it does NOT flip the page to paid
    // and does NOT abandon the gift. The flip happens
    // only when the field's value actually changes
    // away from the bound email (the onChange handler
    // below); while the value still matches, the gift
    // form stands — gift line, ticked consent, "Get
    // my free report".
    setEmailUnlocked(true);
    emailRef.current?.focus();
  }

  function onStartClick(preferred?: PreferredPaymentMethod) {
    // BUG-328: BOTH checks are evaluated before any
    // return — a missing email AND a missing tick are
    // named together, on the first click. BUG-327: a
    // blank field gets the empty line, a mistyped one
    // the "doesn't look quite right" line
    // (emailErrorFor, lib/report-payment.ts).
    const emailErr = emailErrorFor(email);
    if (emailErr) {
      setEmailError(emailErr);
    } else {
      setEmailError(null);
    }
    if (consentAt === null) {
      // BUG-132: an attempt without the tick is answered
      // where the tick stands — the message under the
      // tick line, and the tick outlined.
      setConsentError(true);
    }
    if (emailErr || consentAt === null) {
      // BUG-340: the first field with an error takes
      // focus — the buyer lands on what to fix, not
      // past the card panel. No payment starts: the
      // click handler is the only start, and it
      // requires both the email and the consent.
      const target = emailErr ? emailRef.current : consentRef.current;
      target?.scrollIntoView({ block: "center" });
      target?.focus();
      return;
    }
    if (!publishableKey && !giftActive) {
      // A gift order creates no payment at all, so the
      // payment key's absence must not block a gift
      // holder (BUG-223): the intent answers gifted
      // without any key. A payer still needs the key.
      setNotice(PAYMENT_START_FAILED_LINE);
      return;
    }
    // BUG-335: this click — and only this click —
    // starts the payment. The button is the affordance
    // for a buyer whose card panel has not mounted
    // yet — and the retry when a start has failed or
    // a card has been declined (a fresh payment per
    // attempt, startPayment above). BUG-367: a method
    // row's tap arrives here too, with its method —
    // recorded only now, once the start has passed
    // validation, so a failed tap records nothing;
    // Pay itself passes none, clearing any stale
    // preference from an earlier tap.
    setPreferredMethod(preferred ?? null);
    void startPayment();
  }

  return (
    <main className="journey-page report-door report-payment">
      <h1>{view.heading}</h1>
      {view.subline && <p className="type-lead report-door__subline">{view.subline}</p>}

      {/* BUG-223: the gift-applied line stands first for
          a gift holder — before any card field or price
          — so the gift is visible the moment the page
          opens, not only after the intent answers.
          BUG-347: the founder-chosen pill stands with
          it — the same "Your full report is free" the
          free-page header carries, alongside the
          banner, never in place of it. */}
      {giftActive && view.giftLine && (
        <>
          {view.giftPill && <p className="report-payment__gift-pill">{view.giftPill}</p>}
          <p className="report-payment__gift" role="status">
            {view.giftLine}
          </p>
        </>
      )}

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
                    ref={consentRef}
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
                  ref={emailRef}
                  className="field__input"
                  id="payment-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder={view.emailPlaceholder}
                  value={email}
                  // BUG-287 + BUG-334: while a claimed
                  // gift applies the field is locked to
                  // the claimant address — read-only,
                  // until the visitor chooses "Use a
                  // different email", which unlocks it
                  // for typing (and only unlocks it:
                  // the gift stands until the value
                  // actually changes away). The lock is
                  // a UI lock, not a trust boundary: the
                  // server still enforces the match
                  // (giftFor / findClaimedByEmail,
                  // lib/server/payment-intent.ts +
                  // gifts.ts).
                  readOnly={giftActive && !emailUnlocked}
                  aria-readonly={(giftActive && !emailUnlocked) || undefined}
                  aria-invalid={emailError !== null || undefined}
                  aria-describedby={emailError ? "payment-email-error" : undefined}
                  onChange={(event) => {
                    const next = event.target.value;
                    // The match is read off the values,
                    // not the state being set: was the
                    // field on the bound email before
                    // this keystroke, and is it on it
                    // now.
                    const wasMatching = giftEmailMatches(view.giftEmail, email);
                    const nowMatching = giftEmailMatches(view.giftEmail, next);
                    setEmail(next);
                    setEmailError(null);
                    setNotice(null);
                    // BUG-223: the moment the email leaves
                    // the bound address, the tick clears
                    // in the same keystroke, so a consent
                    // given for the gift can never cover
                    // a paid order. (An effect could not
                    // do this: the Pay click handler would
                    // still see the tick standing in the
                    // same commit.)
                    if (view.giftEmail !== null && !nowMatching) {
                      setConsentAt(null);
                    }
                    // BUG-334: the value returning to
                    // the bound email revives the gift
                    // form on the same page load — the
                    // field locks again to the claimant
                    // address. The tick does NOT come
                    // back with it (BUG-348): the gift
                    // form is restored as it arrived,
                    // unticked, and the claimant ticks
                    // actively.
                    if (view.giftEmail !== null && nowMatching && !wasMatching) {
                      setEmailUnlocked(false);
                    }
                  }}
                  onBlur={() => {
                    if (email.trim() !== "" && !emailValid) setEmailError(PAYMENT_EMAIL_ERROR);
                  }}
                />
                {emailError && (
                  <p
                    className="field__message field__message--error"
                    id="payment-email-error"
                    role="alert"
                  >
                    {emailError}
                  </p>
                )}
                {/* BUG-287 + BUG-334: the locked-field
                    form — the note names whose gift it
                    is, and the escape unlocks the field
                    so a different email can be typed.
                    The escape abandons nothing on its
                    own: the gift stands until the
                    field's value actually changes away
                    from the bound email, and re-entering
                    it revives the gift form on the same
                    page load. */}
                {giftActive && view.giftEmail !== null && (
                  <>
                    <p className="report-payment__gift-note">
                      {paymentGiftLockedNote(view.giftEmail)}
                    </p>
                    <button
                      type="button"
                      className="report-payment__gift-escape"
                      onClick={onUseDifferentEmail}
                    >
                      {PAYMENT_GIFT_USE_DIFFERENT_EMAIL}
                    </button>
                  </>
                )}
              </div>

              <section className="report-payment__panel">
                <div className="report-payment__panel-head">
                  <span className="report-payment__panel-title">{view.cardTitle}</span>
                  {/* BUG-223: no "Powered by Stripe" for a gift
                      holder — no payment is powered by anyone. */}
                  {!giftActive && (
                    <span className="report-payment__panel-powered">
                      Powered by <strong>Stripe</strong>
                    </span>
                  )}
                </div>
                {notice && (
                  <p className="field__message field__message--error" role="alert">
                    {notice}
                  </p>
                )}
                {/* BUG-339: the ONE decline message, in
                    the site's voice, with its next step
                    and the link back to the free check —
                    the provider's decline line never
                    stands beside it. It renders at this
                    level so it survives the card panel
                    unmounting when the dead payment is
                    retired; the retry is the Pay button
                    below, starting a fresh payment. */}
                {declined && (
                  <p className="field__message field__message--error" role="alert">
                    {PAYMENT_DECLINED_LINE}{" "}
                    {postcode && <a href={homeRoute(postcode, homeKey)}>Back to your free check</a>}
                  </p>
                )}
                {activeIntent && stripePromise ? (
                  stripeFailed ? (
                    <>
                      {/* BUG-326: the card panel could
                          not load — the provider's
                          script failed — so the page
                          says so and offers the retry,
                          and keeps the Pay button out of
                          the way until the panel is
                          alive. Never a disabled Pay
                          button as the only signal. */}
                      <p className="field__message field__message--error" role="alert">
                        {PAYMENT_CARD_LOAD_FAILED_LINE}
                      </p>
                      <button
                        type="button"
                        className="btn btn--brass report-payment__pay"
                        onClick={onRetryCardPanel}
                      >
                        Try again
                      </button>
                    </>
                  ) : (
                    <Elements
                      // A fresh payment per attempt gets a
                      // fresh element: the attempt count
                      // re-keys the tree, so a retry never
                      // inherits the retired payment's
                      // element state.
                      key={attempt}
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
                        payLabel={payLabel}
                        consented={consentAt !== null}
                        orderRef={activeIntent.intentId || null}
                        preferredMethod={preferredMethod}
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
                        // BUG-339: a declined card retires
                        // this payment — the retry is a fresh
                        // payment from the next Pay click.
                        onDeclined={onDeclined}
                      />
                    </Elements>
                  )
                ) : (
                  <>
                    {/* Sample 2: the payment methods are
                        visible from the start — BUG-367
                        (26 Nov 2026, founder ruling):
                        the rows are buttons on the same
                        start path as Pay, not the page's
                        old static list — tapping one
                        starts the payment and mounts
                        the element with that method
                        first (onStartClick, above).
                        The accepted-brand marks stand
                        on the rows from the start too
                        (founder, 25 Nov 2026): the four
                        card brands on the Card row, the
                        Revolut mark on the Revolut Pay
                        row — components/
                        PaymentBrandMarks.tsx. */}
                    {/* BUG-223: no payment-method rows for a
                        gift holder — a free order has no
                        payment method (approved Screen C
                        draws no card panel). */}
                    {!giftActive && (
                      <ul className="report-payment__methods" aria-label="Payment methods">
                        <li>
                          <button
                            type="button"
                            className="report-payment__method"
                            onClick={() => onStartClick("card")}
                          >
                            <span className="report-payment__method-label">Card</span>
                            <span className="report-payment__method-marks" aria-hidden="true">
                              <VisaMark />
                              <MastercardMark />
                              <AmexMark />
                              <DiscoverMark />
                            </span>
                          </button>
                        </li>
                        <li>
                          <button
                            type="button"
                            className="report-payment__method"
                            onClick={() => onStartClick("revolut_pay")}
                          >
                            <span className="report-payment__method-label">Revolut Pay</span>
                            <span className="report-payment__method-marks" aria-hidden="true">
                              <RevolutMark />
                            </span>
                          </button>
                        </li>
                      </ul>
                    )}
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
                        the click handler requires the consent. */}
                    <button
                      type="button"
                      className="btn btn--brass report-payment__pay"
                      onClick={() => onStartClick()}
                      aria-disabled={consentAt === null || undefined}
                    >
                      {payLabel}
                    </button>
                    {/* BUG-223: Screen C draws no closing line
                        under the button for a gift holder —
                        the gift variant's closing line is
                        empty, and no empty paragraph stands
                        in its place. */}
                    {view.closingLine !== "" && (
                      <p className="report-payment__smallprint">{view.closingLine}</p>
                    )}
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
