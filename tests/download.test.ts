import { describe, expect, it } from "vitest";

import {
  DOWNLOAD_EMAIL_LABEL,
  DOWNLOAD_EXPIRED_BODY,
  DOWNLOAD_EXPIRED_FINE_PRINT,
  DOWNLOAD_EXPIRED_HEADING,
  DOWNLOAD_GIFT_BODY,
  DOWNLOAD_GIFT_HEADING,
  DOWNLOAD_GIFT_LINE,
  DOWNLOAD_GIFT_TERMS,
  DOWNLOAD_LINK_VALIDITY_MS,
  DOWNLOAD_REISSUE_BUTTON,
  DOWNLOAD_SENT_AGAIN_LINE,
  DOWNLOAD_SENT_BODY,
  DOWNLOAD_SENT_HEADING,
  decideReissue,
  deliveryEmail,
  downloadContentDisposition,
  downloadFilePath,
  downloadLandingView,
  downloadPath,
  downloadReissuePostPath,
  isDownloadTokenForm,
  reissueEmail,
  type DownloadVerification,
} from "../lib/download";
import { giftClaimPath } from "../lib/gift";
import {
  DOWNLOAD_BUYER,
  DOWNLOAD_HOME_ADDRESS_LINE,
  DOWNLOAD_HOME_TITLE,
  deliveryRecord,
} from "./fixtures/download";

// M8.6 — the download flow's pure half: the samples'
// verbatim copy (Master views 32–34, and view 11 for
// the delivery email), the landing page's served
// states, the re-issue decision and the emails'
// composition — pinned character-for-character where
// the samples pin the words, as tests/gift.test.ts
// pins the claim flow's.

const GIFT_TOKEN = "giftTokenFixture00000000000000000000";
const DOWNLOAD_URL = "https://play.checkmynexthome.co.uk/report/download/some-token";
const GIFT_URL = `https://play.checkmynexthome.co.uk${giftClaimPath(GIFT_TOKEN)}`;

describe("the link's life and form", () => {
  it("lives seven days", () => {
    expect(DOWNLOAD_LINK_VALIDITY_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("accepts the built token form and refuses everything else", () => {
    const id = "a".repeat(32);
    const sig = "b".repeat(43);
    expect(isDownloadTokenForm(`${id}.1795000000000.${sig}`)).toBe(true);
    expect(isDownloadTokenForm("x7k2-together")).toBe(false);
    expect(isDownloadTokenForm(`${id}.1795000000000`)).toBe(false);
    expect(isDownloadTokenForm(`${id}.not-a-date.${sig}`)).toBe(false);
    expect(isDownloadTokenForm(`${id}.1795000000000.${sig}.extra`)).toBe(false);
    expect(isDownloadTokenForm("")).toBe(false);
  });

  it("builds the route shapes", () => {
    expect(downloadPath("tok")).toBe("/report/download/tok");
    expect(downloadFilePath("tok")).toBe("/report/download/tok/file");
    expect(downloadReissuePostPath("tok")).toBe("/report/download/tok/reissue");
  });

  it("names the download in both disposition forms", () => {
    const disposition = downloadContentDisposition(
      "Check My Next Home — 12 Willow Close MB3 4QX.pdf",
    );
    expect(disposition).toContain('filename="Check My Next Home - 12 Willow Close MB3 4QX.pdf"');
    expect(disposition).toContain(
      "filename*=UTF-8''Check%20My%20Next%20Home%20%E2%80%94%2012%20Willow%20Close%20MB3%204QX.pdf",
    );
  });
});

describe("the landing page's served states", () => {
  const ok: DownloadVerification = {
    kind: "ok",
    deliveryId: "d".repeat(32),
    expiresAt: new Date(),
  };
  const expired: DownloadVerification = {
    kind: "expired",
    deliveryId: "d".repeat(32),
    expiresAt: new Date(),
  };
  const invalid: DownloadVerification = { kind: "invalid" };

  it("serves the file while the link lives — the sent flag cannot hold it back", () => {
    expect(downloadLandingView(ok, {})).toEqual({ kind: "serve" });
    expect(downloadLandingView(ok, { sent: true })).toEqual({ kind: "serve" });
  });

  it("serves the expired card, and the sent card over it after a re-issue request", () => {
    expect(downloadLandingView(expired, {})).toEqual({ kind: "expired" });
    expect(downloadLandingView(expired, { sent: true })).toEqual({ kind: "sent" });
  });

  it("gives a link that is not genuine one answer, whatever the flag", () => {
    expect(downloadLandingView(invalid, {})).toEqual({ kind: "not-recognised" });
    expect(downloadLandingView(invalid, { sent: true })).toEqual({ kind: "not-recognised" });
  });
});

describe("the re-issue decision", () => {
  it("sends only to the delivery's own address", () => {
    expect(decideReissue(deliveryRecord(), DOWNLOAD_BUYER)).toBe("send");
  });

  it("refuses every other address — and a missing delivery — with the same no-send", () => {
    expect(decideReissue(deliveryRecord(), "someone-else@example.co.uk")).toBe("no-send");
    expect(decideReissue(deliveryRecord(), "")).toBe("no-send");
    expect(decideReissue(null, DOWNLOAD_BUYER)).toBe("no-send");
  });
});

describe("the pages' copy (views 32 and 33)", () => {
  it("pins the expired card's words", () => {
    expect(DOWNLOAD_EXPIRED_HEADING).toBe("This link has expired");
    expect(DOWNLOAD_EXPIRED_BODY).toBe(
      "Download links last 7 days, so they don't wander. Your report itself never expires — enter the email address you checked out with and we'll send a fresh link, free, as often as you need.",
    );
    expect(DOWNLOAD_EMAIL_LABEL).toBe("Your email address");
    expect(DOWNLOAD_REISSUE_BUTTON).toBe("Send me a fresh link");
    expect(DOWNLOAD_EXPIRED_FINE_PRINT).toBe(
      "The fresh link goes to that inbox only — it never appears on screen.",
    );
  });

  it("pins the sent card's uniform answer", () => {
    expect(DOWNLOAD_SENT_HEADING).toBe("Check your email");
    expect(DOWNLOAD_SENT_BODY).toBe(
      "If that email address matches a report, a fresh download link is on its way. It should arrive within a few minutes — if it isn't there, have a quick look in your spam or junk folder, as first emails from us sometimes land there.",
    );
    expect(DOWNLOAD_SENT_AGAIN_LINE).toBe(
      "Typed the wrong address? Enter it again below and we'll send another.",
    );
  });
});

describe("the delivery email (view 11)", () => {
  const base = {
    homeTitle: DOWNLOAD_HOME_TITLE,
    homeAddressLine: DOWNLOAD_HOME_ADDRESS_LINE,
    downloadUrl: DOWNLOAD_URL,
  };

  it("follows the sample's dress: subject, heading, link line, sign-off", () => {
    const email = deliveryEmail({ ...base, giftClaimUrl: null });
    expect(email.subject).toBe("Your detailed report for 12 Willow Close");
    expect(email.text).toContain("Your report for 12 Willow Close is ready");
    expect(email.text).toContain(
      "Thank you for checking 12 Willow Close, Millbrook MB3 4QX with us. Your detailed report is ready — all ten sections, with the breakdowns, the flood findings and location maps, the fuller energy detail, and the questions to ask the seller.",
    );
    expect(email.text).toContain(`Read your report (PDF): ${DOWNLOAD_URL}`);
    expect(email.html).toContain(`<a href="${DOWNLOAD_URL}">Read your report (PDF)</a>`);
    expect(email.text).toContain(
      "It opens as a PDF in your browser — you can save or print it from there. The link is just for you, so keep this email.",
    );
    expect(email.text).toContain("Happy Home Hunting,\nThe Check My Next Home team");
    expect(email.text).toContain(
      "Questions about your report? Write to us any time at contact@checkmynexthome.co.uk — a real person will reply.",
    );
    expect(email.text).toContain("Check My Next Home · checkmynexthome.co.uk");
  });

  it("carries the gift block, with its words, only when a gift URL is passed", () => {
    const withGift = deliveryEmail({ ...base, giftClaimUrl: GIFT_URL });
    expect(withGift.text).toContain(DOWNLOAD_GIFT_HEADING);
    expect(withGift.text).toContain(DOWNLOAD_GIFT_LINE);
    expect(withGift.text).toContain(DOWNLOAD_GIFT_BODY);
    expect(withGift.text).toContain(GIFT_URL);
    expect(withGift.text).toContain(DOWNLOAD_GIFT_TERMS);
    // Exactly one gift link in each body.
    expect(withGift.text.split(GIFT_URL)).toHaveLength(2);
    expect(withGift.html.split(GIFT_URL)).toHaveLength(3); // href + link text

    const without = deliveryEmail({ ...base, giftClaimUrl: null });
    expect(without.text).not.toContain("A gift, from us");
    expect(without.text).not.toContain("/gift/");
    expect(without.html).not.toContain("/gift/");
  });
});

describe("the re-issue email (view 34)", () => {
  it("mirrors the delivery email, minus the gift block — always", () => {
    const email = reissueEmail({
      homeTitle: DOWNLOAD_HOME_TITLE,
      homeAddressLine: DOWNLOAD_HOME_ADDRESS_LINE,
      downloadUrl: DOWNLOAD_URL,
    });
    expect(email.subject).toBe("Your new download link for 12 Willow Close");
    expect(email.text).toContain(
      "Here's a fresh link to your detailed report for 12 Willow Close, Millbrook MB3 4QX.",
    );
    expect(email.text).toContain(`Read your report (PDF): ${DOWNLOAD_URL}`);
    expect(email.text).toContain(
      "It opens as a PDF in your browser — you can save or print it from there.",
    );
    expect(email.text).toContain(
      "This link is just for you, and it works for 7 days from today. If it ever expires, you can ask for another — your report never expires.",
    );
    expect(email.text).toContain("Happy Home Hunting,\nThe Check My Next Home team");
    expect(email.text).not.toContain("A gift, from us");
    expect(email.text).not.toContain("/gift/");
    expect(email.html).not.toContain("/gift/");
  });
});
