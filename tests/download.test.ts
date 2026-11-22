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
    // The HTML part wears view 11's designed shell
    // (BUG-134): the anchor carries the button's inline
    // dress, so href and label are pinned separately.
    expect(email.html).toContain(`href="${DOWNLOAD_URL}"`);
    expect(email.html).toContain(`>Read your report (PDF)</a>`);
    expect(email.text).toContain(
      "It opens as a PDF in your browser — you can save or print it from there. The link is just for you, so keep this email.",
    );
    expect(email.text).toContain("Happy Home Hunting,\nThe Check My Next Home team");
    expect(email.text).toContain(
      "Questions about your report? Write to us any time at contact@checkmynexthome.co.uk — a real person will reply.",
    );
    expect(email.text).toContain("Check My Next Home · checkmynexthome.co.uk");
  });

  it("wears the sample's shell in HTML: brand band, brass button, footer (BUG-134)", () => {
    const email = deliveryEmail({ ...base, giftClaimUrl: null });
    // The forest-deep header band with the wordmark,
    // "Next Home" in brass-pale.
    expect(email.html).toContain("background-color:#1E402C");
    expect(email.html).toContain(`Check My <span style="color:#E4CF9A;">Next Home</span>`);
    // The cream sheet in the sample's measure.
    expect(email.html).toContain("background-color:#FDF8E8");
    expect(email.html).toContain("max-width:600px");
    // The report link as the full-width brass button.
    expect(email.html).toContain("background-color:#C29A3B");
    // The centred small print under the button.
    expect(email.html).toContain("text-align:center");
    // The hairline footer's contact line, its address
    // standing as a mailto link, over the name line.
    expect(email.html).toContain("border-top:1px solid #E3DCC4");
    expect(email.html).toContain(`href="mailto:contact@checkmynexthome.co.uk"`);
    expect(email.html).toContain("Check My Next Home · checkmynexthome.co.uk");
    // The gifted variant (no gift URL) wears the same
    // shell with no gift card.
    expect(email.html).not.toContain("border:1.5px solid #C29A3B");
  });

  it("carries the gift block, with its words, only when a gift URL is passed", () => {
    const withGift = deliveryEmail({ ...base, giftClaimUrl: GIFT_URL });
    expect(withGift.text).toContain(DOWNLOAD_GIFT_HEADING);
    expect(withGift.text).toContain(DOWNLOAD_GIFT_LINE);
    expect(withGift.text).toContain(DOWNLOAD_GIFT_BODY);
    expect(withGift.text).toContain(GIFT_URL);
    expect(withGift.text).toContain(DOWNLOAD_GIFT_TERMS);
    // Exactly one gift link in each body. The text part
    // carries the full URL once; in the HTML the full
    // URL stands once, as the gift box link's href —
    // view 11 draws the link's text without its scheme
    // (BUG-134), pinned below.
    expect(withGift.text.split(GIFT_URL)).toHaveLength(2);
    expect(withGift.html.split(GIFT_URL)).toHaveLength(2); // the href alone
    // The gift card: brass border, the eyebrow pill,
    // and the dashed pale box whose text is the
    // scheme-stripped claim URL.
    expect(withGift.html).toContain("border:1.5px solid #C29A3B");
    expect(withGift.html).toContain("background-color:#E4CF9A");
    expect(withGift.html).toContain("border:1px dashed #C29A3B");
    expect(withGift.html).toContain(`>${GIFT_URL.replace("https://", "")}</a>`);

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

  it("wears view 34's own shell in HTML: serif brand line, forest button (BUG-134)", () => {
    const email = reissueEmail({
      homeTitle: DOWNLOAD_HOME_TITLE,
      homeAddressLine: DOWNLOAD_HOME_ADDRESS_LINE,
      downloadUrl: DOWNLOAD_URL,
    });
    // The wordmark as a serif line, "Next Home" in
    // brass — not view 11's forest-deep band.
    expect(email.html).toContain(`Check My <span style="color:#C29A3B;">Next Home</span>`);
    expect(email.html).not.toContain("background-color:#1E402C");
    // The link as the forest button, on the download URL.
    expect(email.html).toContain("background-color:#2F5D3E");
    expect(email.html).toContain(`href="${DOWNLOAD_URL}"`);
    expect(email.html).toContain(`>Read your report (PDF)</a>`);
    // The shared hairline footer, contact address linked.
    expect(email.html).toContain("border-top:1px solid #E3DCC4");
    expect(email.html).toContain(`href="mailto:contact@checkmynexthome.co.uk"`);
    expect(email.html).toContain("Check My Next Home · checkmynexthome.co.uk");
  });
});
