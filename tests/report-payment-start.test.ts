// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ReportPaymentPage from "../components/ReportPaymentPage";
import type { ReportDoorIdentity } from "../lib/report-door";
import { buildReportPaymentView, PAYMENT_STARTING_LINE } from "../lib/report-payment";

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

import type { Stripe } from "@stripe/stripe-js";

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
  PaymentElement: () => null,
  useStripe: () => null,
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

    // The intent settles: the starting state leaves
    // with it — the rows unmount for the card panel —
    // and still no second intent was created.
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
    expect(container.textContent).toContain("Loading the card panel...");
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
});
