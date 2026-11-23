import { describe, expect, it } from "vitest";

import { createMemorySearchCountingStore } from "../lib/server/search-counting";

// The search counting (M9.11; the founder's ruling of
// 22 Nov 2026): aggregate counts at full-postcode
// grain, never tied to a visitor, raw search text
// never stored. These tests pin the memory shelf's
// arithmetic — the bumps a serve makes, the last-touch
// attribution a purchase reads, the test split, and
// the period windows the admin page reads.

const AT = new Date("2026-11-23T10:15:00.000Z");
const WINDOW = {
  from: new Date("2026-11-23T00:00:00.000Z"),
  to: new Date("2026-11-24T00:00:00.000Z"),
};

describe("search counting — the serve bumps", () => {
  it("a postcode serve counts under its type and its full postcode", async () => {
    const store = createMemorySearchCountingStore();
    await store.noteCheck({
      type: "postcode",
      postcode: "cm3 2jt",
      street: null,
      setsLastType: true,
      now: AT,
    });
    const read = await store.readPeriod(WINDOW);
    expect(read.checksByType).toEqual({ postcode: 1, street: 0, "wider-area": 0 });
    expect(read.checksByPostcode).toEqual([{ postcode: "CM3 2JT", checks: 1 }]);
    expect(read.checksByStreet).toEqual([]);
  });

  it("a street serve counts under its type, its postcode and its street", async () => {
    const store = createMemorySearchCountingStore();
    await store.noteCheck({
      type: "street",
      postcode: "CM3 2JT",
      street: { key: "BIRKDALE RISE|HATFIELD PEVEREL", label: "Birkdale Rise, Hatfield Peverel" },
      setsLastType: true,
      now: AT,
    });
    const read = await store.readPeriod(WINDOW);
    expect(read.checksByType.street).toBe(1);
    expect(read.checksByPostcode).toEqual([{ postcode: "CM3 2JT", checks: 1 }]);
    expect(read.checksByStreet).toEqual([{ label: "Birkdale Rise, Hatfield Peverel", checks: 1 }]);
  });

  it("a wider-area serve counts under its type only — a district carries no postcode", async () => {
    const store = createMemorySearchCountingStore();
    await store.noteCheck({
      type: "wider-area",
      postcode: null,
      street: null,
      setsLastType: false,
      now: AT,
    });
    const read = await store.readPeriod(WINDOW);
    expect(read.checksByType["wider-area"]).toBe(1);
    expect(read.checksByPostcode).toEqual([]);
  });

  it("counts outside the window stay outside the read", async () => {
    const store = createMemorySearchCountingStore();
    await store.noteCheck({
      type: "postcode",
      postcode: "CM3 2JT",
      street: null,
      setsLastType: true,
      now: new Date("2026-11-20T10:00:00.000Z"),
    });
    const read = await store.readPeriod(WINDOW);
    expect(read.checksByType.postcode).toBe(0);
    expect(read.checksByPostcode).toEqual([]);
  });
});

describe("search counting — purchase attribution", () => {
  it("a purchase follows the postcode's last-touch type", async () => {
    const store = createMemorySearchCountingStore();
    await store.noteCheck({
      type: "street",
      postcode: "CM3 2JT",
      street: { key: "BIRKDALE RISE|HATFIELD PEVEREL", label: "Birkdale Rise, Hatfield Peverel" },
      setsLastType: true,
      now: AT,
    });
    await store.notePurchase({ postcode: "CM3 2JT", testOrder: false, now: AT });
    const read = await store.readPeriod(WINDOW);
    expect(read.purchasesByType).toEqual({ postcode: 0, street: 1, "wider-area": 0 });
  });

  it("a rung-1 serve does not move the last touch; a purchase with no touch reads as a postcode search's", async () => {
    const store = createMemorySearchCountingStore();
    await store.noteCheck({
      type: "street",
      postcode: "CM3 2JT",
      street: { key: "BIRKDALE RISE|HATFIELD PEVEREL", label: "Birkdale Rise, Hatfield Peverel" },
      setsLastType: true,
      now: AT,
    });
    await store.noteCheck({
      type: "postcode",
      postcode: "CM3 2JT",
      street: null,
      setsLastType: false,
      now: AT,
    });
    await store.notePurchase({ postcode: "CM3 2JT", testOrder: false, now: AT });
    await store.notePurchase({ postcode: "E16 1AS", testOrder: false, now: AT });
    const read = await store.readPeriod(WINDOW);
    expect(read.purchasesByType.street).toBe(1);
    expect(read.purchasesByType.postcode).toBe(1);
  });

  it("a test purchase is shelved apart, so the page can leave it out", async () => {
    const store = createMemorySearchCountingStore();
    await store.notePurchase({ postcode: "CM3 2JT", testOrder: true, now: AT });
    const read = await store.readPeriod(WINDOW);
    expect(read.purchasesByType.postcode).toBe(0);
    expect(read.purchasesByTypeTest.postcode).toBe(1);
  });
});
