import { describe, expect, it } from "vitest";

import { createMemoryGiftStore, giftSourceTestOrder } from "../lib/server/gifts";
import { createMemoryOrderStore } from "../lib/server/orders";

// BUG-290 — a gifted order inherits the test standing of
// the paid order that issued the gift: a gift carries no
// payment of its own, so its mode is its source's. The
// admin page's test toggle could not hide gifted orders
// either — all 7 gifted orders on the play site read as
// real — because the gifted claim and record were always
// written unflagged.
describe("giftSourceTestOrder — a gifted order inherits its issuing order's standing", () => {
  async function worldWithSource(testOrder: boolean) {
    const gifts = createMemoryGiftStore();
    const orders = createMemoryOrderStore();
    await orders.recordClaim({
      ref: "pi_source_1",
      kind: "paid",
      email: "buyer@example.co.uk",
      postcode: "CM3 2JT",
      homeKey: "19||BIRKDALE RISE",
      amount: 499,
      currency: "gbp",
      providerRef: "pi_source_1",
      testOrder,
      now: new Date(),
    });
    const gift = await gifts.issue({
      buyerEmail: "buyer@example.co.uk",
      orderRef: "pi_source_1",
    });
    return { gifts, orders, gift };
  }

  it("a gift issued from a test order reads as a test order", async () => {
    const { gifts, orders, gift } = await worldWithSource(true);
    await expect(giftSourceTestOrder({ gifts, orders }, gift.token)).resolves.toBe(true);
  });

  it("a gift issued from a real order reads as a real order", async () => {
    const { gifts, orders, gift } = await worldWithSource(false);
    await expect(giftSourceTestOrder({ gifts, orders }, gift.token)).resolves.toBe(false);
  });

  it("a gift with no issuing order reads as a real order", async () => {
    const gifts = createMemoryGiftStore();
    const orders = createMemoryOrderStore();
    const gift = await gifts.issue({ buyerEmail: "buyer@example.co.uk" });
    await expect(giftSourceTestOrder({ gifts, orders }, gift.token)).resolves.toBe(false);
  });

  it("an unknown token reads as a real order", async () => {
    const gifts = createMemoryGiftStore();
    const orders = createMemoryOrderStore();
    await expect(giftSourceTestOrder({ gifts, orders }, "no-such-token")).resolves.toBe(false);
  });

  it("a gift whose issuing order's record is missing reads as a real order", async () => {
    const gifts = createMemoryGiftStore();
    const orders = createMemoryOrderStore();
    const gift = await gifts.issue({
      buyerEmail: "buyer@example.co.uk",
      orderRef: "pi_missing_1",
    });
    await expect(giftSourceTestOrder({ gifts, orders }, gift.token)).resolves.toBe(false);
  });
});
