import { describe, expect, it } from "vitest";

import { decideClaimAttempt, giftServedState, isGiftTokenForm } from "../lib/gift";
import { createMemoryFulfilmentClaimStore } from "../lib/server/fulfilment";
import { claimedGiftForVisit, createMemoryGiftStore, newConfirmToken } from "../lib/server/gifts";
import { GIFT_BUYER, GIFT_FRIEND } from "./fixtures/gift";

// M7.13 — the gift store's lifecycle, run against the
// in-memory implementation (the database implementation
// is the same operations over migration 0034; the
// database proof in db/prove.mjs carries the table's
// own checks). The named behaviours are D44's tests
// (d)–(j) at the level the shell owns: (f)'s delivery
// half and (i)'s order half are M9's, and land there.

const T0 = new Date("2026-11-19T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(T0.getTime() + days * DAY_MS);

describe("issue and read", () => {
  it("issues an Issued gift expiring exactly 30 days on, with a built-form token", async () => {
    const store = createMemoryGiftStore();
    const gift = await store.issue({ buyerEmail: " Buyer@Example.co.uk ", now: T0 });
    expect(gift.status).toBe("issued");
    expect(gift.buyerEmail).toBe(GIFT_BUYER);
    expect(gift.claimantEmail).toBeNull();
    expect(gift.expiresAt.getTime() - gift.issuedAt.getTime()).toBe(30 * DAY_MS);
    expect(isGiftTokenForm(gift.token)).toBe(true);
    expect(await store.getByToken(gift.token)).toEqual(gift);
    expect(await store.getByToken("no-such-token-000000000000000")).toBeNull();
  });

  it("never repeats a token", async () => {
    const store = createMemoryGiftStore();
    const a = await store.issue({ buyerEmail: GIFT_BUYER, now: T0 });
    const b = await store.issue({ buyerEmail: GIFT_BUYER, now: T0 });
    expect(a.token).not.toBe(b.token);
  });
});

describe("the confirmation binding", () => {
  it("binds the pending email on the matching confirmation, and clears the pending", async () => {
    const store = createMemoryGiftStore();
    const gift = await store.issue({ buyerEmail: GIFT_BUYER, now: T0 });
    const pending = newConfirmToken();
    await store.setPending(gift.token, " Friend@Example.co.uk ", pending, T0);
    const bound = await store.bindByConfirm(gift.token, pending, at(1));
    expect(bound?.status).toBe("claimed");
    expect(bound?.claimantEmail).toBe(GIFT_FRIEND);
    expect(bound?.claimedAt).toEqual(at(1));
    expect(bound?.pendingEmail).toBeNull();
    expect(bound?.pendingToken).toBeNull();
    // The spent link binds nothing twice.
    expect(await store.bindByConfirm(gift.token, pending, at(1))).toBeNull();
  });

  it("binds nothing on a wrong or superseded confirmation token", async () => {
    const store = createMemoryGiftStore();
    const gift = await store.issue({ buyerEmail: GIFT_BUYER, now: T0 });
    const first = newConfirmToken();
    const second = newConfirmToken();
    await store.setPending(gift.token, GIFT_FRIEND, first, T0);
    expect(await store.bindByConfirm(gift.token, second, T0)).toBeNull();
    // A fresh attempt replaces the pending wholesale:
    // the older link is inert, the latest binds.
    await store.setPending(gift.token, "other@example.co.uk", second, T0);
    expect(await store.bindByConfirm(gift.token, first, T0)).toBeNull();
    const bound = await store.bindByConfirm(gift.token, second, T0);
    expect(bound?.claimantEmail).toBe("other@example.co.uk");
  });

  it("(j) binds nothing after day 30", async () => {
    const store = createMemoryGiftStore();
    const gift = await store.issue({ buyerEmail: GIFT_BUYER, now: T0 });
    const pending = newConfirmToken();
    await store.setPending(gift.token, GIFT_FRIEND, pending, at(29));
    expect(await store.bindByConfirm(gift.token, pending, at(31))).toBeNull();
    const record = await store.getByToken(gift.token);
    expect(record?.status).toBe("issued");
    expect(giftServedState(record, at(31))).toBe("expired");
  });

  it("a cleared pending (a failed send) binds nothing and leaves the gift claimable", async () => {
    const store = createMemoryGiftStore();
    const gift = await store.issue({ buyerEmail: GIFT_BUYER, now: T0 });
    const pending = newConfirmToken();
    await store.setPending(gift.token, GIFT_FRIEND, pending, T0);
    await store.clearPending(gift.token);
    expect(await store.bindByConfirm(gift.token, pending, T0)).toBeNull();
    const record = await store.getByToken(gift.token);
    expect(record?.status).toBe("issued");
    expect(record?.pendingEmail).toBeNull();
  });
});

describe("(e) the same-email refusal does not burn the link", () => {
  it("a refused attempt writes nothing, and a later different-email claim still works", async () => {
    const store = createMemoryGiftStore();
    const gift = await store.issue({ buyerEmail: GIFT_BUYER, now: T0 });
    const before = (await store.getByToken(gift.token))!;
    // The route's decision for the buyer's own email —
    // the handler writes nothing on this branch.
    expect(decideClaimAttempt(before, GIFT_BUYER, T0)).toEqual({ kind: "same-email" });
    expect(await store.getByToken(gift.token)).toEqual(before);
    // The link is still fully usable by someone else.
    const pending = newConfirmToken();
    await store.setPending(gift.token, GIFT_FRIEND, pending, T0);
    const bound = await store.bindByConfirm(gift.token, pending, T0);
    expect(bound?.status).toBe("claimed");
    expect(bound?.claimantEmail).toBe(GIFT_FRIEND);
  });

  it("a refusal also leaves an outstanding pending for another address untouched", async () => {
    const store = createMemoryGiftStore();
    const gift = await store.issue({ buyerEmail: GIFT_BUYER, now: T0 });
    const pending = newConfirmToken();
    await store.setPending(gift.token, GIFT_FRIEND, pending, T0);
    const record = (await store.getByToken(gift.token))!;
    expect(decideClaimAttempt(record, GIFT_BUYER, T0)).toEqual({ kind: "same-email" });
    // Nothing was written: the friend's link still binds.
    const bound = await store.bindByConfirm(gift.token, pending, T0);
    expect(bound?.claimantEmail).toBe(GIFT_FRIEND);
  });
});

describe("(d) redemption consumes the gift, once", () => {
  it("a delivered gift serves already-used and refuses every further claim", async () => {
    const store = createMemoryGiftStore();
    const gift = await store.issue({ buyerEmail: GIFT_BUYER, now: T0 });
    const pending = newConfirmToken();
    await store.setPending(gift.token, GIFT_FRIEND, pending, T0);
    await store.bindByConfirm(gift.token, pending, T0);
    const redeemed = await store.markRedeemed(gift.token, at(2));
    expect(redeemed?.status).toBe("redeemed");
    expect(redeemed?.redeemedAt).toEqual(at(2));
    const record = (await store.getByToken(gift.token))!;
    expect(giftServedState(record, at(2))).toBe("already-used");
    expect(decideClaimAttempt(record, GIFT_FRIEND, at(2))).toEqual({ kind: "closed" });
    // A duplicate delivery call is a no-op, not an error.
    const again = await store.markRedeemed(gift.token, at(3));
    expect(again?.status).toBe("redeemed");
    expect(again?.redeemedAt).toEqual(at(2));
    // And the claimed lookup no longer finds it.
    expect(await store.findClaimedByEmail(GIFT_FRIEND, at(2))).toBeNull();
  });
});

describe("(g) and (i)'s lookup — the bound gift stays findable by its email", () => {
  it("finds the claimed gift for the bound email, case-insensitively, until day 30", async () => {
    const store = createMemoryGiftStore();
    const gift = await store.issue({ buyerEmail: GIFT_BUYER, now: T0 });
    expect(await store.findClaimedByEmail(GIFT_FRIEND, T0)).toBeNull();
    const pending = newConfirmToken();
    await store.setPending(gift.token, GIFT_FRIEND, pending, T0);
    await store.bindByConfirm(gift.token, pending, at(1));
    const found = await store.findClaimedByEmail(" Friend@Example.co.uk ", at(2));
    expect(found?.token).toBe(gift.token);
    expect(await store.findClaimedByEmail("someone-else@example.co.uk", at(2))).toBeNull();
    expect(await store.findClaimedByEmail(GIFT_BUYER, at(2))).toBeNull();
    // Past day 30 the gift is gone even though it was
    // claimed in time and never used.
    expect(await store.findClaimedByEmail(GIFT_FRIEND, at(31))).toBeNull();
  });
});

describe("the gift visit (BUG-223) — the cookie's token resolves to the bound email", () => {
  async function claimedStore() {
    const store = createMemoryGiftStore();
    const claims = createMemoryFulfilmentClaimStore();
    const gift = await store.issue({ buyerEmail: GIFT_BUYER, now: T0 });
    const pending = newConfirmToken();
    await store.setPending(gift.token, GIFT_FRIEND, pending, T0);
    await store.bindByConfirm(gift.token, pending, at(1));
    return { store, claims, gift };
  }
  const visit = (
    store: ReturnType<typeof createMemoryGiftStore>,
    claims: ReturnType<typeof createMemoryFulfilmentClaimStore>,
    token: string | undefined,
    days: number,
  ) => claimedGiftForVisit(store, token, at(days), claims);

  it("resolves a claimed, unconsumed, in-date gift to the email it is bound to", async () => {
    const { store, claims, gift } = await claimedStore();
    expect(await visit(store, claims, gift.token, 2)).toEqual({
      token: gift.token,
      claimantEmail: GIFT_FRIEND,
    });
  });

  it("resolves nothing without a cookie, or for a malformed token, or an unknown token", async () => {
    const { store, claims } = await claimedStore();
    expect(await visit(store, claims, undefined, 2)).toBeNull();
    expect(await visit(store, claims, "not-a-token", 2)).toBeNull();
    expect(await visit(store, claims, "00000000000000000000000000000000", 2)).toBeNull();
  });

  it("resolves nothing for an unclaimed gift", async () => {
    const store = createMemoryGiftStore();
    const claims = createMemoryFulfilmentClaimStore();
    const gift = await store.issue({ buyerEmail: GIFT_BUYER, now: T0 });
    expect(await visit(store, claims, gift.token, 2)).toBeNull();
  });

  it("resolves nothing once the gift is redeemed", async () => {
    const { store, claims, gift } = await claimedStore();
    await store.markRedeemed(gift.token, at(2));
    expect(await visit(store, claims, gift.token, 2)).toBeNull();
  });

  it("resolves nothing once the gift is voided by a refund", async () => {
    const store = createMemoryGiftStore();
    const claims = createMemoryFulfilmentClaimStore();
    const gift = await store.issue({ buyerEmail: GIFT_BUYER, orderRef: "order-1", now: T0 });
    const pending = newConfirmToken();
    await store.setPending(gift.token, GIFT_FRIEND, pending, T0);
    await store.bindByConfirm(gift.token, pending, at(1));
    await store.voidByOrderRef("order-1", at(2));
    expect(await visit(store, claims, gift.token, 2)).toBeNull();
  });

  it("resolves nothing past day 30, even for a gift claimed in time and never used", async () => {
    const { store, claims, gift } = await claimedStore();
    expect(await visit(store, claims, gift.token, 31)).toBeNull();
  });
});

// BUG-224 — one gift, one home. The gift record stays
// "claimed" between the order being placed and the
// worker delivering it, so the record alone cannot
// tell a spent gift from a waiting one; the gifted
// fulfilment claim is the spend. These scenarios run
// the reader against the two stores in order, the way
// the free page and the payment page read it per
// request: a null answer is the £4.99 checkout, a
// resolved answer is the free report.
describe("the gift visit (BUG-224) — one gift, one home", () => {
  async function claimedStore() {
    const store = createMemoryGiftStore();
    const claims = createMemoryFulfilmentClaimStore();
    const gift = await store.issue({ buyerEmail: GIFT_BUYER, now: T0 });
    const pending = newConfirmToken();
    await store.setPending(gift.token, GIFT_FRIEND, pending, T0);
    await store.bindByConfirm(gift.token, pending, at(1));
    return { store, claims, gift };
  }
  const visit = (
    store: ReturnType<typeof createMemoryGiftStore>,
    claims: ReturnType<typeof createMemoryFulfilmentClaimStore>,
    token: string | undefined,
    days: number,
  ) => claimedGiftForVisit(store, token, at(days), claims);
  const orderFree = (
    claims: ReturnType<typeof createMemoryFulfilmentClaimStore>,
    token: string,
    homeKey: string,
    days: number,
  ) =>
    claims.claim({
      ref: token,
      kind: "gifted",
      email: GIFT_FRIEND,
      postcode: "CM3 2JT",
      homeKey,
      giftToken: token,
      now: at(days),
    });

  it("(a) claim, order home A free, then check home B — £4.99 is asked", async () => {
    const { store, claims, gift } = await claimedStore();
    // Home A: the gift stands, the free report is offered.
    expect(await visit(store, claims, gift.token, 2)).toEqual({
      token: gift.token,
      claimantEmail: GIFT_FRIEND,
    });
    // The order is placed — and the record STILL says
    // "claimed": delivery has not consumed it yet. The
    // claim, not the record, is what spends the gift.
    expect(await orderFree(claims, gift.token, "home-a", 2)).toBe(true);
    expect((await store.getByToken(gift.token))?.status).toBe("claimed");
    // Home B: nothing resolves, so the free page and
    // the payment page show £4.99.
    expect(await visit(store, claims, gift.token, 2)).toBeNull();
  });

  it("(b) claim, abandon home A without ordering, order home B free, then check home C — £4.99 is asked", async () => {
    const { store, claims, gift } = await claimedStore();
    // Home A is looked at and left: no order, no claim,
    // so the gift is still waiting.
    expect(await visit(store, claims, gift.token, 2)).toEqual({
      token: gift.token,
      claimantEmail: GIFT_FRIEND,
    });
    // Home B is the one ordered free — the gift follows
    // the claimant, not the home, until an order is
    // placed.
    expect(await visit(store, claims, gift.token, 2)).toEqual({
      token: gift.token,
      claimantEmail: GIFT_FRIEND,
    });
    expect(await orderFree(claims, gift.token, "home-b", 2)).toBe(true);
    // Home C: the gift is spent.
    expect(await visit(store, claims, gift.token, 2)).toBeNull();
  });

  it("(c) back-navigation from the success page to a different home — £4.99 is asked", async () => {
    const { store, claims, gift } = await claimedStore();
    // Home A is ordered free; the success page stands.
    expect(await orderFree(claims, gift.token, "home-a", 2)).toBe(true);
    // The success page's own read: no gift state.
    expect(await visit(store, claims, gift.token, 2)).toBeNull();
    // Going back re-runs the same per-request read
    // against the live store — nothing about the
    // navigation carries the gift state, and the
    // browser session holds only the token, never a
    // "free" flag — so the different home still shows
    // £4.99.
    expect(await visit(store, claims, gift.token, 2)).toBeNull();
  });

  it("a failed gifted claim leaves the gift usable — the M9.7 retake road (ruling R3)", async () => {
    const { store, claims, gift } = await claimedStore();
    expect(await orderFree(claims, gift.token, "home-a", 2)).toBe(true);
    // The delivery failed and exhausted: the claim
    // stands failed, so the gift was never consumed.
    await claims.recordFailure(gift.token, { error: "delivery failed", maxAttempts: 1 });
    expect((await claims.getByRef(gift.token))?.status).toBe("failed");
    expect(await visit(store, claims, gift.token, 2)).toEqual({
      token: gift.token,
      claimantEmail: GIFT_FRIEND,
    });
  });
});
