// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ReportPaymentPage from "../components/ReportPaymentPage";
import type { ReportDoorIdentity } from "../lib/report-door";
import {
  buildReportPaymentView,
  PAYMENT_CARD_LOAD_FAILED_LINE,
  PAYMENT_START_FAILED_LINE,
  PAYMENT_STARTING_LINE,
} from "../lib/report-payment";

// BUG-398 — the payment page's Card / Revolut Pay rows
// needed TWO taps before the card-detail fields
// appeared: while the intent fetch was in flight
// nothing changed visibly, and the second tap hit the
// creatingFor guard — a silent no-op — so it looked
// like the second click did it. The proof here is
// behavioural, in jsdom: one tap shows the starting
// state on the tapped row at once (before the intent
// resolves), and further taps during the flight create
// no second intent. The provider's element is mocked
// out entirely — the rows live before any intent, and
// the panel mounts from the mocked load, never from
// the provider's script — and the intent itself is a
// deferred fetch, so the flight can be held open.
//
// The Playwright harness cannot carry this proof: the
// served app there has no payment keys, so no payment
// can start, and the sandbox has no Postgres for the
// served harness at all. This file is the proof, and
// it runs in the prepush vitest gate.
//
// BUG-398 follow-up (28 Nov 2026, founder video):
// the first fix stopped at the intent — the starting
// state cleared the moment the fetch resolved, but
// the element still had to load, and in that window
// there was no in-flight feedback at all: the panel
// stood blank with a live Pay button, so a second
// tap looked like the one that did it. The starting
// state now lives until the element reports ready
// (onReady), and the panel's Pay button and status
// line carry it. The mocked element captures its
// onReady so the tests can fire it; the mocked
// useStripe returns a controllable value so the
// tests can stand in the loaded-but-not-ready
// window (stripe resolved, element not ready).

import type { Stripe } from "@stripe/stripe-js";
import { loadStripe } from "@stripe/stripe-js";

// The mocked provider's controllable state: the
// onReady the mocked PaymentElement captured, and
// the value the mocked useStripe returns. Both
// default to null — the existing tests' world,
// where the provider never resolves.
const stripeTestState = vi.hoisted(() => ({
  onReady: null as (() => void) | null,
  stripe: null as unknown,
}));

vi.mock("@stripe/stripe-js", () => ({
  // A null resolution IS the BUG-326 load failure, so
  // the mock resolves a fake object. Nothing calls a
  // method on it: the panel's own stripe comes from
  // the mocked useStripe below, which stays null, so
  // the panel stands on its loading line after the
  // intent.
  loadStripe: vi.fn(async () => ({ fakeStripe: true }) as unknown as Stripe),
}));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: (props: { children?: ReactNode }) => props.children ?? null,
  PaymentElement: (props: { onReady?: () => void }) => {
    stripeTestState.onReady = props.onReady ?? null;
    return null;
  },
  useStripe: () => stripeTestState.stripe,
  useElements: () => null,
}));

const HOME: ReportDoorIdentity = {
  kind: "home",
  subject: "19 Birkdale Rise",
  subline: "Hatfield Peverel, CM3 2JT",
  postcode: "CM3 2JT",
  homeKey: "19||BIRKDALE RISE",
};

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
}

describe("BUG-398 — one tap starts the payment visibly", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;
  let resolveIntent!: (value: unknown) => void;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const intentPromise = new Promise((resolve) => {
      resolveIntent = resolve;
    });
    fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/payments/intent") return intentPromise;
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    stripeTestState.onReady = null;
    stripeTestState.stripe = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function renderPage() {
    act(() => {
      root.render(
        createElement(ReportPaymentPage, {
          view: buildReportPaymentView(HOME),
          publishableKey: "pk_test_throwaway",
          postcode: "CM3 2JT",
          homeKey: "19||BIRKDALE RISE",
        }),
      );
    });
  }

  function methodRows(): HTMLButtonElement[] {
    return [...container.querySelectorAll<HTMLButtonElement>(".report-payment__method")];
  }

  function payButton(): HTMLButtonElement {
    const button = container.querySelector<HTMLButtonElement>(".report-payment__pay");
    if (!button) throw new Error("expected the Pay button");
    return button;
  }

  function intentCalls(): unknown[][] {
    return fetchMock.mock.calls.filter(([url]) => url === "/api/payments/intent");
  }

  it("one tap on the Card row shows its starting state at once, and further taps during the flight start no second intent", async () => {
    renderPage();
    const email = container.querySelector<HTMLInputElement>('input[type="email"]');
    const consent = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!email || !consent) throw new Error("expected the email field and the consent tick");
    act(() => {
      setInputValue(email, "buyer@example.co.uk");
      consent.click();
    });

    const [cardRow, revolutRow] = methodRows();
    if (!cardRow || !revolutRow) throw new Error("expected both method rows");
    expect(cardRow.textContent).toContain("Card");

    // The first tap: the intent fetch is held open, so
    // the row must ALREADY show its starting state —
    // before anything resolves.
    act(() => {
      cardRow.click();
    });
    expect(intentCalls()).toHaveLength(1);
    expect(cardRow.textContent).toContain(PAYMENT_STARTING_LINE);
    expect(cardRow.disabled).toBe(true);
    expect(revolutRow.disabled).toBe(true);
    expect(payButton().disabled).toBe(true);

    // Further taps during the flight — the same row,
    // the other row, Pay — start no second intent.
    act(() => {
      cardRow.click();
      revolutRow.click();
      payButton().click();
    });
    expect(intentCalls()).toHaveLength(1);

    // The intent settles: the rows unmount for the
    // card panel — and still no second intent was
    // created. The starting state does NOT leave
    // with the intent (BUG-398 follow-up): it lives
    // until the element reports ready, and the panel
    // stands on that same line while it loads.
    await act(async () => {
      resolveIntent({
        ok: true,
        json: async () => ({
          clientSecret: "pi_test_secret",
          intentId: "pi_test_123",
          publishableKey: "pk_test_throwaway",
        }),
      });
    });
    expect(intentCalls()).toHaveLength(1);
    expect(methodRows()).toHaveLength(0);
    expect(container.textContent).toContain(PAYMENT_STARTING_LINE);
    expect(container.textContent).not.toContain("Loading the card panel...");
  });

  it("one tap on the Revolut Pay row shows its starting state at once, and the Card row keeps its label", async () => {
    renderPage();
    const email = container.querySelector<HTMLInputElement>('input[type="email"]');
    const consent = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!email || !consent) throw new Error("expected the email field and the consent tick");
    act(() => {
      setInputValue(email, "buyer@example.co.uk");
      consent.click();
    });

    const [cardRow, revolutRow] = methodRows();
    if (!cardRow || !revolutRow) throw new Error("expected both method rows");
    act(() => {
      revolutRow.click();
    });
    expect(intentCalls()).toHaveLength(1);
    expect(revolutRow.textContent).toContain(PAYMENT_STARTING_LINE);
    expect(revolutRow.disabled).toBe(true);
    expect(cardRow.disabled).toBe(true);
    expect(cardRow.textContent).toContain("Card");

    await act(async () => {
      resolveIntent({
        ok: true,
        json: async () => ({
          clientSecret: "pi_test_secret",
          intentId: "pi_test_123",
          publishableKey: "pk_test_throwaway",
        }),
      });
    });
    expect(intentCalls()).toHaveLength(1);
    expect(methodRows()).toHaveLength(0);
  });

  it("one tap on Pay shows its starting state at once, and the rows go disabled with it", async () => {
    renderPage();
    const email = container.querySelector<HTMLInputElement>('input[type="email"]');
    const consent = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!email || !consent) throw new Error("expected the email field and the consent tick");
    act(() => {
      setInputValue(email, "buyer@example.co.uk");
      consent.click();
    });

    const pay = payButton();
    const [cardRow, revolutRow] = methodRows();
    if (!cardRow || !revolutRow) throw new Error("expected both method rows");
    act(() => {
      pay.click();
    });
    expect(intentCalls()).toHaveLength(1);
    expect(pay.textContent).toContain(PAYMENT_STARTING_LINE);
    expect(pay.disabled).toBe(true);
    expect(cardRow.disabled).toBe(true);
    expect(revolutRow.disabled).toBe(true);

    await act(async () => {
      resolveIntent({
        ok: true,
        json: async () => ({
          clientSecret: "pi_test_secret",
          intentId: "pi_test_123",
          publishableKey: "pk_test_throwaway",
        }),
      });
    });
    expect(intentCalls()).toHaveLength(1);
    expect(methodRows()).toHaveLength(0);
  });

  describe("element-ready follow-up — starting lives until the element is ready", () => {
    beforeEach(() => {
      stripeTestState.onReady = null;
      stripeTestState.stripe = null;
    });

    function fillEmailAndTick() {
      const email = container.querySelector<HTMLInputElement>('input[type="email"]');
      const consent = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
      if (!email || !consent) throw new Error("expected the email field and the consent tick");
      act(() => {
        setInputValue(email, "buyer@example.co.uk");
        consent.click();
      });
    }

    async function resolveIntentOk(publishableKey = "pk_test_throwaway") {
      await act(async () => {
        resolveIntent({
          ok: true,
          json: async () => ({
            clientSecret: "pi_test_secret",
            intentId: "pi_test_123",
            publishableKey,
          }),
        });
      });
    }

    it("after the intent resolves, the panel still reads Starting… and its Pay stays disabled until the element reports ready", async () => {
      renderPage();
      fillEmailAndTick();
      const [cardRow] = methodRows();
      if (!cardRow) throw new Error("expected the Card row");
      act(() => {
        cardRow.click();
      });
      expect(cardRow.textContent).toContain(PAYMENT_STARTING_LINE);
      // The provider has loaded (stripe resolved) but
      // the element has not reported ready — the
      // video's window: skeleton, no fields yet.
      stripeTestState.stripe = { fakeStripe: true };
      await resolveIntentOk();
      expect(intentCalls()).toHaveLength(1);
      expect(methodRows()).toHaveLength(0);
      // The starting state lives on: the panel's Pay
      // button reads it and stays disabled, and the
      // panel says so — until onReady fires.
      const pay = payButton();
      expect(pay.textContent).toContain(PAYMENT_STARTING_LINE);
      expect(pay.disabled).toBe(true);
      expect(container.textContent).toContain(PAYMENT_STARTING_LINE);
      expect(stripeTestState.onReady).not.toBeNull();
    });

    it("the element-ready event clears Starting… and the panel's Pay stands enabled with its label", async () => {
      renderPage();
      fillEmailAndTick();
      const [cardRow] = methodRows();
      if (!cardRow) throw new Error("expected the Card row");
      act(() => {
        cardRow.click();
      });
      stripeTestState.stripe = { fakeStripe: true };
      await resolveIntentOk();
      const pay = payButton();
      expect(pay.textContent).toContain(PAYMENT_STARTING_LINE);
      expect(pay.disabled).toBe(true);
      // The element reports ready: the fields are on
      // screen now, so the starting state leaves.
      // (The mocked element renders no fields, so
      // readiness here is the Pay button standing
      // enabled with its label and the line gone.)
      act(() => {
        stripeTestState.onReady?.();
      });
      expect(pay.textContent).toContain("Pay £4.99");
      expect(pay.disabled).toBe(false);
      expect(container.textContent).not.toContain(PAYMENT_STARTING_LINE);
    });

    it("an intent failure clears Starting… at once — the rows come back, nothing sticks", async () => {
      renderPage();
      fillEmailAndTick();
      const [cardRow] = methodRows();
      if (!cardRow) throw new Error("expected the Card row");
      act(() => {
        cardRow.click();
      });
      expect(cardRow.textContent).toContain(PAYMENT_STARTING_LINE);
      await act(async () => {
        resolveIntent({
          ok: false,
          json: async () => ({ error: "start_failed" }),
        });
      });
      expect(intentCalls()).toHaveLength(1);
      expect(container.textContent).not.toContain(PAYMENT_STARTING_LINE);
      expect(container.textContent).toContain(PAYMENT_START_FAILED_LINE);
      expect(methodRows()).toHaveLength(2);
      const [cardAgain, revolutAgain] = methodRows();
      expect(cardAgain?.disabled).toBe(false);
      expect(revolutAgain?.disabled).toBe(false);
      expect(payButton().disabled).toBe(false);
    });

    it("retiring the payment before the element is ready clears Starting… — the rows come back, nothing sticks", async () => {
      renderPage();
      fillEmailAndTick();
      const [cardRow] = methodRows();
      if (!cardRow) throw new Error("expected the Card row");
      act(() => {
        cardRow.click();
      });
      stripeTestState.stripe = { fakeStripe: true };
      await resolveIntentOk();
      expect(payButton().textContent).toContain(PAYMENT_STARTING_LINE);
      // The buyer edits the delivery email while the
      // element still loads: the payment stops
      // counting, the panel unmounts, and no ready
      // event can ever come — so the starting state
      // must clear here, or the rows would stand
      // disabled on "Starting…" with no way back.
      const email = container.querySelector<HTMLInputElement>('input[type="email"]');
      if (!email) throw new Error("expected the email field");
      act(() => {
        setInputValue(email, "someone-else@example.co.uk");
      });
      expect(container.textContent).not.toContain(PAYMENT_STARTING_LINE);
      expect(methodRows()).toHaveLength(2);
      const [cardAgain, revolutAgain] = methodRows();
      expect(cardAgain?.disabled).toBe(false);
      expect(revolutAgain?.disabled).toBe(false);
      expect(payButton().disabled).toBe(false);
    });

    it("a Stripe load failure clears Starting… too, and the retry starts it again until the element is ready", async () => {
      renderPage();
      fillEmailAndTick();
      // The load fails for this payment's key only —
      // the key is distinct, so the per-key promise
      // cache cannot hand back an earlier success.
      vi.mocked(loadStripe).mockResolvedValueOnce(null as unknown as Stripe);
      const [cardRow] = methodRows();
      if (!cardRow) throw new Error("expected the Card row");
      act(() => {
        cardRow.click();
      });
      await resolveIntentOk("pk_test_stripe_load_fails");
      await act(async () => {});
      expect(intentCalls()).toHaveLength(1);
      expect(container.textContent).not.toContain(PAYMENT_STARTING_LINE);
      expect(container.textContent).toContain(PAYMENT_CARD_LOAD_FAILED_LINE);
      const retry = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
        button.textContent?.includes("Try again"),
      );
      if (!retry) throw new Error("expected the Try again button");
      expect(retry.disabled).toBe(false);
      // The retry reloads the element: the starting
      // state stands again until it reports ready.
      stripeTestState.stripe = { fakeStripe: true };
      act(() => {
        retry.click();
      });
      await act(async () => {});
      const pay = payButton();
      expect(pay.textContent).toContain(PAYMENT_STARTING_LINE);
      expect(pay.disabled).toBe(true);
      act(() => {
        stripeTestState.onReady?.();
      });
      expect(pay.textContent).toContain("Pay £4.99");
      expect(pay.disabled).toBe(false);
      expect(container.textContent).not.toContain(PAYMENT_STARTING_LINE);
    });
  });
});
