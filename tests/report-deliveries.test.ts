import { describe, expect, it } from "vitest";

import { isDownloadTokenForm } from "../lib/download";
import { createMemoryDeliveryStore, newDeliveryId } from "../lib/server/report-deliveries";
import {
  DOWNLOAD_BUYER,
  DOWNLOAD_FILE_NAME,
  DOWNLOAD_HOME_ADDRESS_LINE,
  DOWNLOAD_HOME_TITLE,
  DOWNLOAD_NOW,
  DOWNLOAD_PDF_KEY,
} from "./fixtures/download";
import { GIFT_TOKEN, giftRecord } from "./fixtures/gift";

// M8.6 — the delivery shelf (memory implementation;
// the database implementation shares the interface and
// is exercised against the real table in CI's database
// job): a delivery is written once, read back whole,
// with its email normalised on the way in and its gift
// token carried only where one was issued.

const INPUT = {
  email: "  Buyer@Example.co.uk ",
  kind: "paid" as const,
  pdfKey: DOWNLOAD_PDF_KEY,
  fileName: DOWNLOAD_FILE_NAME,
  homeTitle: DOWNLOAD_HOME_TITLE,
  homeAddressLine: DOWNLOAD_HOME_ADDRESS_LINE,
  orderRef: "order-fixture-1",
  now: DOWNLOAD_NOW,
};

describe("the delivery store", () => {
  it("mints ids in the link payload's form — long and un-guessable", () => {
    const a = newDeliveryId();
    const b = newDeliveryId();
    expect(a).toHaveLength(32);
    expect(a).not.toBe(b);
    expect(isDownloadTokenForm(`${a}.1795000000000.${"s".repeat(43)}`)).toBe(true);
  });

  it("records a delivery and reads it back whole, email normalised", async () => {
    const store = createMemoryDeliveryStore();
    const record = await store.record(INPUT);
    expect(record.email).toBe(DOWNLOAD_BUYER);
    expect(record.kind).toBe("paid");
    expect(record.pdfKey).toBe(DOWNLOAD_PDF_KEY);
    expect(record.fileName).toBe(DOWNLOAD_FILE_NAME);
    expect(record.homeTitle).toBe(DOWNLOAD_HOME_TITLE);
    expect(record.homeAddressLine).toBe(DOWNLOAD_HOME_ADDRESS_LINE);
    expect(record.giftToken).toBeNull();
    expect(record.orderRef).toBe("order-fixture-1");
    expect(record.createdAt).toEqual(DOWNLOAD_NOW);
    await expect(store.getById(record.id)).resolves.toEqual(record);
  });

  it("carries the issued gift's token where the delivery issued one", async () => {
    const store = createMemoryDeliveryStore();
    const record = await store.record({ ...INPUT, gift: giftRecord() });
    expect(record.giftToken).toBe(GIFT_TOKEN);
  });

  it("answers null for an id it does not hold", async () => {
    const store = createMemoryDeliveryStore();
    await expect(store.getById("no-such-delivery")).resolves.toBeNull();
  });
});
