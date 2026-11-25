import { describe, expect, it } from "vitest";

import { downloadPath, type ComposedEmail } from "../lib/download";
import { giftClaimPath } from "../lib/gift";
import { createDownloadSigner } from "../lib/server/download-links";
import { createMemoryGiftStore, type GiftStore } from "../lib/server/gifts";
import { createMemoryDeliveryStore } from "../lib/server/report-deliveries";
import {
  createReportDeliveryService,
  type ReportDeliveryService,
} from "../lib/server/report-delivery";
import type { ReportMailer } from "../lib/server/report-mailer";
import {
  DOWNLOAD_BUYER,
  DOWNLOAD_FILE_NAME,
  DOWNLOAD_HOME_ADDRESS_LINE,
  DOWNLOAD_HOME_TITLE,
  DOWNLOAD_NOW,
  DOWNLOAD_ORIGIN,
  DOWNLOAD_PDF_KEY,
  DOWNLOAD_SECRET,
} from "./fixtures/download";

// M8.6 — the delivery service end to end, over the
// in-memory seams and the throwaway signing secret:
// delivery writes the record, mints the link and sends
// the email; re-issue decides by the delivery's own
// address and mints fresh without touching the old
// link. THE D21 TESTS are the first describe — the
// step's three named pins, in the prep's own words:
// (a) a free report's delivery email carries NO gift
// token; (b) a gifted report's email carries NO gift
// token; (c) a paid report's delivery email carries
// EXACTLY ONE gift token.

const DAY_MS = 24 * 60 * 60 * 1000;

interface SentEmail {
  kind: "delivery" | "reissue";
  to: string;
  email: ComposedEmail;
}

function harness() {
  const sent: SentEmail[] = [];
  const mailer: ReportMailer = {
    sendDeliveryEmail: async ({ to, email }) => {
      sent.push({ kind: "delivery", to, email });
      return { sent: true };
    },
    sendReissueEmail: async ({ to, email }) => {
      sent.push({ kind: "reissue", to, email });
      return { sent: true };
    },
  };
  const gifts = createMemoryGiftStore(() => DOWNLOAD_NOW);
  let issueCalls = 0;
  const countingGifts: GiftStore = {
    ...gifts,
    issue: async (input) => {
      issueCalls += 1;
      return gifts.issue(input);
    },
  };
  const deliveries = createMemoryDeliveryStore(() => DOWNLOAD_NOW);
  const signer = createDownloadSigner(DOWNLOAD_SECRET);
  const service: ReportDeliveryService = createReportDeliveryService({
    deliveries,
    gifts: countingGifts,
    mailer,
    signer,
  });
  return { service, sent, gifts, deliveries, signer, issueCalls: () => issueCalls };
}

function deliverInput(kind: "free" | "paid" | "gifted") {
  return {
    email: DOWNLOAD_BUYER,
    kind,
    pdfKey: DOWNLOAD_PDF_KEY,
    fileName: DOWNLOAD_FILE_NAME,
    homeTitle: DOWNLOAD_HOME_TITLE,
    homeAddressLine: DOWNLOAD_HOME_ADDRESS_LINE,
    orderRef: "order-fixture-1",
    origin: DOWNLOAD_ORIGIN,
    now: DOWNLOAD_NOW,
  };
}

const giftUrlOf = (token: string) => `${DOWNLOAD_ORIGIN}${giftClaimPath(token)}`;

describe("the D21 tests — the gift block is the only paid-only part", () => {
  it("(a) a free report's delivery email carries NO gift token", async () => {
    const h = harness();
    const outcome = await h.service.deliverReport(deliverInput("free"));
    expect(h.issueCalls()).toBe(0);
    expect(outcome.delivery.giftToken).toBeNull();
    expect(outcome.mail).toEqual({ sent: true });
    const mail = h.sent.find((m) => m.kind === "delivery")!;
    expect(mail.to).toBe(DOWNLOAD_BUYER);
    expect(mail.email.text).not.toContain("A gift, from us");
    expect(mail.email.text).not.toContain("/gift/");
    expect(mail.email.html).not.toContain("/gift/");
    // But the free report DOES get its signed link —
    // links are not the paid-only part.
    expect(outcome.downloadUrl).toContain("/report/download/");
    expect(
      h.signer.verify(outcome.downloadUrl.split("/report/download/")[1]!, DOWNLOAD_NOW).kind,
    ).toBe("ok");
  });

  it("(b) a gifted report's delivery email carries NO gift token", async () => {
    const h = harness();
    const outcome = await h.service.deliverReport(deliverInput("gifted"));
    expect(h.issueCalls()).toBe(0);
    expect(outcome.delivery.giftToken).toBeNull();
    const mail = h.sent.find((m) => m.kind === "delivery")!;
    expect(mail.email.text).not.toContain("A gift, from us");
    expect(mail.email.text).not.toContain("/gift/");
    expect(mail.email.html).not.toContain("/gift/");
  });

  it("(c) a paid report's delivery email carries EXACTLY ONE gift token", async () => {
    const h = harness();
    const outcome = await h.service.deliverReport(deliverInput("paid"));
    // Exactly one gift was issued, for this buyer, and
    // the delivery record carries its token.
    expect(h.issueCalls()).toBe(1);
    expect(outcome.delivery.giftToken).not.toBeNull();
    const gift = await h.gifts.getByToken(outcome.delivery.giftToken!);
    expect(gift?.buyerEmail).toBe(DOWNLOAD_BUYER);
    expect(gift?.status).toBe("issued");
    // Exactly one gift link in the email — one block,
    // one token, in text and in HTML alike.
    const url = giftUrlOf(outcome.delivery.giftToken!);
    const mail = h.sent.find((m) => m.kind === "delivery")!;
    expect(mail.email.text.split(url)).toHaveLength(2);
    expect(mail.email.text.split("A gift, from us")).toHaveLength(2);
    expect(mail.email.html.split("A gift, from us")).toHaveLength(2);
    // The download link itself is live.
    const token = outcome.downloadUrl.split("/report/download/")[1]!;
    expect(h.signer.verify(token, DOWNLOAD_NOW)).toMatchObject({
      kind: "ok",
      deliveryId: outcome.delivery.id,
    });
    expect(outcome.downloadUrl).toBe(`${DOWNLOAD_ORIGIN}${downloadPath(token)}`);
  });

  it("(d) a paid report's delivery email repeats the receipt — and a free one's carries none (BUG-337)", async () => {
    const paid = harness();
    await paid.service.deliverReport(deliverInput("paid"));
    const paidMail = paid.sent.find((m) => m.kind === "delivery")!;
    expect(paidMail.email.text).toContain("Order order-fixture-1 — £4.99 paid.");
    expect(paidMail.email.html).toContain("Order order-fixture-1 — £4.99 paid.");
    // No card words: the delivery service never sees
    // the card, so the card line is page-only.
    expect(paidMail.email.text).not.toContain("ending in");

    const free = harness();
    await free.service.deliverReport(deliverInput("free"));
    const freeMail = free.sent.find((m) => m.kind === "delivery")!;
    expect(freeMail.email.text).not.toContain("Order order-fixture-1");
    expect(freeMail.email.text).not.toContain("paid.");
  });
});

describe("re-issue", () => {
  it("sends a fresh link to the delivery's own address — and the old link still works", async () => {
    const h = harness();
    const outcome = await h.service.deliverReport(deliverInput("paid"));
    const oldToken = outcome.downloadUrl.split("/report/download/")[1]!;

    const at = new Date(DOWNLOAD_NOW.getTime() + 3 * DAY_MS);
    const result = await h.service.reissueDownloadLink({
      token: oldToken,
      email: "  Buyer@Example.co.uk ",
      origin: DOWNLOAD_ORIGIN,
      now: at,
    });
    expect(result).toEqual({ kind: "answered", sent: true });

    const mail = h.sent.find((m) => m.kind === "reissue")!;
    expect(mail.to).toBe(DOWNLOAD_BUYER);
    expect(mail.email.subject).toBe("Your new download link for 12 Willow Close");
    // The re-issue email never carries a gift block —
    // not even for a paid delivery.
    expect(mail.email.text).not.toContain("A gift, from us");
    expect(mail.email.text).not.toContain("/gift/");

    // The fresh link is a new token over the same
    // delivery; the old link is untouched and still
    // verifies — and outlives nothing: on the old
    // link's seventh day it is spent while the fresh
    // one still has four days.
    const freshToken = mail.email.text.match(/\/report\/download\/(\S+)/)?.[1];
    expect(freshToken).toBeTruthy();
    expect(freshToken).not.toBe(oldToken);
    expect(h.signer.verify(freshToken!, at)).toMatchObject({
      kind: "ok",
      deliveryId: outcome.delivery.id,
    });
    const daySeven = new Date(DOWNLOAD_NOW.getTime() + 7 * DAY_MS);
    expect(h.signer.verify(oldToken, daySeven).kind).toBe("expired");
    expect(h.signer.verify(freshToken!, daySeven).kind).toBe("ok");
  });

  it("answers a non-matching address the same way, and sends nothing", async () => {
    const h = harness();
    const outcome = await h.service.deliverReport(deliverInput("paid"));
    const token = outcome.downloadUrl.split("/report/download/")[1]!;
    const result = await h.service.reissueDownloadLink({
      token,
      email: "someone-else@example.co.uk",
      origin: DOWNLOAD_ORIGIN,
      now: DOWNLOAD_NOW,
    });
    // The same "answered" the match gets — only the
    // send differs, and that never reaches the visitor.
    expect(result).toEqual({ kind: "answered", sent: false });
    expect(h.sent.filter((m) => m.kind === "reissue")).toHaveLength(0);
  });

  it("the report itself never expires: a year-old delivery re-issues from its spent link", async () => {
    const h = harness();
    const outcome = await h.service.deliverReport(deliverInput("free"));
    const token = outcome.downloadUrl.split("/report/download/")[1]!;
    const aYearOn = new Date(DOWNLOAD_NOW.getTime() + 365 * DAY_MS);
    expect(h.signer.verify(token, aYearOn).kind).toBe("expired");
    const result = await h.service.reissueDownloadLink({
      token,
      email: DOWNLOAD_BUYER,
      origin: DOWNLOAD_ORIGIN,
      now: aYearOn,
    });
    expect(result).toEqual({ kind: "answered", sent: true });
    const mail = h.sent.find((m) => m.kind === "reissue")!;
    const freshToken = mail.email.text.match(/\/report\/download\/(\S+)/)?.[1];
    expect(h.signer.verify(freshToken!, aYearOn).kind).toBe("ok");
  });
});

describe("resendDeliveryEmail — the buyer re-send (M9.7, gap 5)", () => {
  it("sends the standing delivery's own email again: same delivery, same gift, nothing new created", async () => {
    const h = harness();
    const outcome = await h.service.deliverReport(deliverInput("paid"));
    expect(h.issueCalls()).toBe(1);
    h.sent.length = 0;

    const result = await h.service.resendDeliveryEmail({
      deliveryId: outcome.delivery.id,
      origin: DOWNLOAD_ORIGIN,
      now: DOWNLOAD_NOW,
    });
    expect(result).toEqual({ sent: true });
    // One email, the DELIVERY email (not the re-issue
    // email), to the delivery's own address…
    expect(h.sent).toHaveLength(1);
    const mail = h.sent[0]!;
    expect(mail.kind).toBe("delivery");
    expect(mail.to).toBe(DOWNLOAD_BUYER);
    // …carrying the gift this delivery already carries
    // — the same token, exactly once — and a live link
    // over the SAME delivery id. No new gift was issued
    // (the count stands at one) and no new delivery was
    // recorded: the store still answers only the
    // original record under its id.
    const url = giftUrlOf(outcome.delivery.giftToken!);
    expect(mail.email.text.split(url)).toHaveLength(2);
    expect(h.issueCalls()).toBe(1);
    const token = mail.email.text.match(/\/report\/download\/(\S+)/)?.[1];
    expect(token?.split(".")[0]).toBe(outcome.delivery.id);
    expect(h.signer.verify(token!, DOWNLOAD_NOW).kind).toBe("ok");
    expect(await h.deliveries.getById(outcome.delivery.id)).toEqual(outcome.delivery);
  });

  it("a free delivery's re-send carries no gift block, exactly as its first send did not", async () => {
    const h = harness();
    const outcome = await h.service.deliverReport(deliverInput("free"));
    h.sent.length = 0;
    const result = await h.service.resendDeliveryEmail({
      deliveryId: outcome.delivery.id,
      origin: DOWNLOAD_ORIGIN,
      now: DOWNLOAD_NOW,
    });
    expect(result).toEqual({ sent: true });
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.email.text).not.toContain("/gift/");
  });

  it("answers null for a delivery that does not stand — and sends nothing", async () => {
    const h = harness();
    await expect(
      h.service.resendDeliveryEmail({
        deliveryId: "delivery_unknown",
        origin: DOWNLOAD_ORIGIN,
        now: DOWNLOAD_NOW,
      }),
    ).resolves.toBeNull();
    expect(h.sent).toHaveLength(0);
  });
});

describe("reissueDownloadLink — the standing pins", () => {
  it("refuses a tampered link outright — no answer, no email", async () => {
    const h = harness();
    const outcome = await h.service.deliverReport(deliverInput("paid"));
    const token = outcome.downloadUrl.split("/report/download/")[1]!;
    const [id, expiry, sig] = token.split(".") as [string, string, string];
    const forged = `${id}.${expiry}.${sig.startsWith("a") ? "b" : "a"}${sig.slice(1)}`;
    const result = await h.service.reissueDownloadLink({
      token: forged,
      email: DOWNLOAD_BUYER,
      origin: DOWNLOAD_ORIGIN,
      now: DOWNLOAD_NOW,
    });
    expect(result).toEqual({ kind: "invalid" });
    expect(h.sent.filter((m) => m.kind === "reissue")).toHaveLength(0);
  });
});
