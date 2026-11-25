import { describe, expect, it } from "vitest";

import {
  GIFT_CLAIM_BODY,
  GIFT_CLAIM_BUTTON,
  GIFT_CLAIM_FINE_PRINT,
  GIFT_CLAIM_HEADING,
  GIFT_CLAIMED_BODY,
  GIFT_CLAIMED_CHIP,
  GIFT_CLAIMED_HEADING,
  GIFT_CLAIMED_SEARCH_HEADING,
  GIFT_CONFIRM_BUTTON,
  GIFT_CONFIRM_FALLBACK,
  GIFT_CONFIRM_IGNORE,
  GIFT_CONFIRM_INTRO,
  GIFT_CONFIRM_SUBJECT,
  GIFT_DIFFERENT_BODY,
  GIFT_DIFFERENT_BUTTON,
  GIFT_DIFFERENT_HEADING,
  GIFT_DIFFERENT_HELPER,
  GIFT_DIFFERENT_PLACEHOLDER,
  GIFT_EMAIL_ERROR,
  GIFT_EMAIL_LABEL,
  GIFT_EMAIL_PLACEHOLDER,
  GIFT_EXPIRED_BODY,
  GIFT_EXPIRED_HEADING,
  GIFT_EXPIRED_SEARCH_HEADING,
  GIFT_NOT_RECOGNISED_BODY,
  GIFT_NOT_RECOGNISED_HEADING,
  GIFT_NOT_RECOGNISED_SEARCH_HEADING,
  GIFT_PENDING_BODY,
  GIFT_PENDING_BUTTON,
  GIFT_PENDING_CHANGE_LABEL,
  GIFT_PENDING_FINE_PRINT,
  GIFT_PENDING_HEADING,
  GIFT_PENDING_RESEND_LABEL,
  GIFT_PENDING_RESENT_LINE,
  GIFT_PENDING_SUCCESS_BODY,
  GIFT_PENDING_SUCCESS_HEADING,
  GIFT_SAME_EMAIL_BODY,
  GIFT_SAME_EMAIL_HEADING,
  GIFT_SEARCH_LINE,
  GIFT_SEND_FAILED_LINE,
  GIFT_USED_BODY,
  GIFT_USED_HEADING,
  GIFT_USED_SEARCH_HEADING,
  GIFT_VALIDITY_MS,
  decideClaimAttempt,
  giftClaimPath,
  giftClaimPostPath,
  giftClaimedPageServes,
  giftClaimedPath,
  giftClaimPageView,
  giftConfirmPath,
  giftServedState,
  isEmailShape,
  isGiftTokenForm,
  normaliseEmail,
} from "../lib/gift";
import { newConfirmToken, newGiftToken } from "../lib/server/gifts";
import {
  GIFT_BUYER,
  GIFT_FRIEND,
  GIFT_NOW,
  claimedExpiredGift,
  claimedGift,
  expiredGift,
  issuedGift,
  pendingGift,
  redeemedGift,
} from "./fixtures/gift";

// M7.13 — the Check Together claim flow's pure rules
// (decision D21; Master views 17–27). The copy pins are
// the samples' text character-for-character — the four
// refusal/closed texts are D44(14)'s pinned texts in
// their founder-approved shorter forms (18 Nov 2026),
// and the confirmation step's four texts (views 18–21)
// are the founder-approved forms of 19 Nov 2026, pinned
// by the conform pass of the same day. If a sample's
// words ever change by the founder's ruling, the pin
// changes with the sample, in the same change.

describe("the eleven states' copy, verbatim from the samples", () => {
  it("pins the claim screen (view 17)", () => {
    expect(GIFT_CLAIM_HEADING).toBe("You've been given a free home check");
    expect(GIFT_CLAIM_BODY).toBe(
      "Someone who bought a full report from us has passed you a free one. It's for **any home** you're thinking about — just tell us your email address and the gift is yours.",
    );
    expect(GIFT_EMAIL_LABEL).toBe("Your email address");
    expect(GIFT_EMAIL_PLACEHOLDER).toBe("e.g. you@example.co.uk");
    expect(GIFT_CLAIM_BUTTON).toBe("Claim my free report");
    expect(GIFT_CLAIM_FINE_PRINT).toBe(
      "The gift is valid for 30 days from the day the report was bought, and it can be claimed once — so use the email address you'll order your report with.",
    );
  });

  it("pins the claimed screen (view 22)", () => {
    expect(GIFT_CLAIMED_CHIP).toBe("Gift saved to your email address");
    expect(GIFT_CLAIMED_HEADING).toBe("Your free report is claimed");
    expect(GIFT_CLAIMED_BODY).toBe(
      "This gift is now yours, and it stays tied to the email address you claimed it with. When you're ready, find the home below and order its full report using that same email address — **we'll apply your free report for you, so there's nothing to pay.**",
    );
    expect(GIFT_CLAIMED_SEARCH_HEADING).toBe("Check a home now");
  });

  it("pins Text 4, the same-email refusal (view 23; D44(14) Text 4)", () => {
    expect(GIFT_SAME_EMAIL_HEADING).toBe("This gift is for someone else");
    expect(GIFT_SAME_EMAIL_BODY).toBe(
      "This gift came with a report you bought, so it can't be claimed with the same email address. Nothing is used up — your link is still valid. Send it to the person choosing the home with you, and they can claim a free full report for any home.",
    );
  });

  it("pins Text 3, the claimed-different-email guard (view 24; D44(14) Text 3)", () => {
    expect(GIFT_DIFFERENT_HEADING).toBe("This gift is already claimed");
    expect(GIFT_DIFFERENT_BODY).toBe(
      "Someone has claimed this gift with a different email address, and it can only be used with that address. If it was you, enter the same address below — if someone forwarded you this link after claiming it, only they can use it.",
    );
    expect(GIFT_DIFFERENT_PLACEHOLDER).toBe("The address you claimed it with");
    expect(GIFT_DIFFERENT_BUTTON).toBe("Continue");
    expect(GIFT_DIFFERENT_HELPER).toBe(
      "If you claimed this gift yourself, entering that same address here will take you through to checking a home.",
    );
  });

  it("pins Text 2, already redeemed (view 25; D44(14) Text 2)", () => {
    expect(GIFT_USED_HEADING).toBe("This gift has already been used");
    expect(GIFT_USED_BODY).toBe(
      "The free report from this gift link has already been delivered, so the link can't be used again. If the report was delivered to you, you'll find it in the email we sent when it was ready. If you think something has gone wrong, email us at support@checkmynexthome.co.uk and we'll look into it.",
    );
    expect(GIFT_USED_SEARCH_HEADING).toBe("Check another home");
  });

  it("pins Text 1, expired (view 26; D44(14) Text 1)", () => {
    expect(GIFT_EXPIRED_HEADING).toBe("This gift link has expired");
    expect(GIFT_EXPIRED_BODY).toBe(
      "This free report gift was valid for 30 days from the day the report was bought, and that time has run out, so the link no longer works. Gift links can't be extended or replaced. You can still check any home on our website — the headline facts are free — and a full report costs £4.99.",
    );
    expect(GIFT_EXPIRED_SEARCH_HEADING).toBe("Check a home anyway");
  });

  it("pins the not-recognised screen (view 27)", () => {
    expect(GIFT_NOT_RECOGNISED_HEADING).toBe("This link doesn't work");
    expect(GIFT_NOT_RECOGNISED_BODY).toBe(
      "This gift link may have been copied incompletely, so we can't find the gift it belongs to. You can still check any home on our website — the headline facts are free.",
    );
    expect(GIFT_NOT_RECOGNISED_SEARCH_HEADING).toBe("Check a home");
  });

  it("pins the confirmation step's four texts (views 18–21; founder-approved 19 Nov 2026)", () => {
    // View 18 — the inline email error.
    expect(GIFT_EMAIL_ERROR).toBe("Enter an email address, like you@example.co.uk");
    // View 19 — the send-failure line.
    expect(GIFT_SEND_FAILED_LINE).toBe(
      "We couldn't send the confirmation email just now — nothing has been claimed. Check the address and try again.",
    );
    // View 20 — the confirmation-pending screen.
    expect(GIFT_PENDING_HEADING).toBe("Check your email to finish claiming");
    expect(GIFT_PENDING_BODY).toBe(
      "We've sent a confirmation email to **{email}**. Click the link in it and the gift is yours — it stays tied to that address. The gift isn't claimed until you click, so if the address looks wrong, enter it again below and we'll send a fresh link.",
    );
    expect(GIFT_PENDING_BUTTON).toBe("Send a fresh link");
    expect(GIFT_PENDING_FINE_PRINT).toBe(
      "The gift is valid for 30 days from the day the report was bought, and it can be claimed once.",
    );
    // BUG-271: view 20's DEFAULT state is now the
    // success state — the form above is only the
    // change-email state. The success state's texts
    // say the email is sent, never that the claim is
    // complete.
    expect(GIFT_PENDING_SUCCESS_HEADING).toBe("You're nearly there");
    expect(GIFT_PENDING_SUCCESS_BODY).toBe(
      "Check your inbox — we've sent a confirmation email to **{email}**. Click the link in it and the gift is yours — it stays tied to that address. The gift isn't claimed until you click.",
    );
    expect(GIFT_PENDING_RESENT_LINE).toBe(
      "We've sent another email to **{email}** — it should arrive in a moment. Check your spam folder if you don't see it.",
    );
    expect(GIFT_PENDING_RESEND_LABEL).toBe("Didn't get it? Send it again");
    expect(GIFT_PENDING_CHANGE_LABEL).toBe("Wrong email? Change it");
    // View 21 — the confirmation email.
    expect(GIFT_CONFIRM_SUBJECT).toBe("Confirm your free report gift");
    expect(GIFT_CONFIRM_INTRO).toBe(
      "You asked to claim a free detailed report gift on Check My Next Home. Click the link below to confirm this email address and finish claiming:",
    );
    expect(GIFT_CONFIRM_BUTTON).toBe("Confirm and finish claiming");
    expect(GIFT_CONFIRM_FALLBACK).toBe("Or copy this link into your browser:");
    expect(GIFT_CONFIRM_IGNORE).toBe(
      "The gift is then tied to this address. If you didn't ask for this, ignore this email — nothing has been claimed.",
    );
  });

  it("pins the search blocks' shared line and the 30-day validity", () => {
    expect(GIFT_SEARCH_LINE).toBe("Enter a postcode to see the headline facts for a home, free.");
    expect(GIFT_VALIDITY_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe("the served state", () => {
  it("serves claim for a live unclaimed gift", () => {
    expect(giftServedState(issuedGift(), GIFT_NOW)).toBe("claim");
    expect(giftServedState(pendingGift(), GIFT_NOW)).toBe("claim");
  });

  it("serves the guard for a bound gift", () => {
    expect(giftServedState(claimedGift(), GIFT_NOW)).toBe("claimed-guard");
  });

  it("serves already-used for a redeemed gift — finally, even past day 30", () => {
    expect(giftServedState(redeemedGift(), GIFT_NOW)).toBe("already-used");
    const longPast = new Date(GIFT_NOW.getTime() + 90 * 24 * 60 * 60 * 1000);
    expect(giftServedState(redeemedGift(), longPast)).toBe("already-used");
  });

  it("serves expired for an unclaimed gift past day 30, and for a claimed-but-unused one", () => {
    expect(giftServedState(expiredGift(), GIFT_NOW)).toBe("expired");
    expect(giftServedState(claimedExpiredGift(), GIFT_NOW)).toBe("expired");
  });

  it("serves not-recognised for no record", () => {
    expect(giftServedState(null, GIFT_NOW)).toBe("not-recognised");
  });

  it("gates the dedicated claimed page to a live claimed gift", () => {
    expect(giftClaimedPageServes(claimedGift(), GIFT_NOW)).toBe(true);
    expect(giftClaimedPageServes(issuedGift(), GIFT_NOW)).toBe(false);
    expect(giftClaimedPageServes(redeemedGift(), GIFT_NOW)).toBe(false);
    expect(giftClaimedPageServes(claimedExpiredGift(), GIFT_NOW)).toBe(false);
    expect(giftClaimedPageServes(null, GIFT_NOW)).toBe(false);
  });
});

describe("the claim page's view selection", () => {
  it("serves each state its ruled placement", () => {
    expect(giftClaimPageView(null, GIFT_NOW, {})).toEqual({
      kind: "closed",
      variant: "not-recognised",
    });
    expect(giftClaimPageView(redeemedGift(), GIFT_NOW, {})).toEqual({
      kind: "closed",
      variant: "used",
    });
    expect(giftClaimPageView(expiredGift(), GIFT_NOW, {})).toEqual({
      kind: "closed",
      variant: "expired",
    });
    expect(giftClaimPageView(claimedGift(), GIFT_NOW, {})).toEqual({
      kind: "card",
      variant: "different",
    });
    expect(giftClaimPageView(issuedGift(), GIFT_NOW, {})).toEqual({
      kind: "card",
      variant: "claim",
    });
  });

  it("lets the flags present the state the record is in — and no other", () => {
    expect(giftClaimPageView(issuedGift(), GIFT_NOW, { refusedSameEmail: true })).toEqual({
      kind: "card",
      variant: "same-email",
    });
    expect(giftClaimPageView(pendingGift(), GIFT_NOW, { sent: true })).toEqual({
      kind: "card",
      variant: "pending",
      pendingEmail: GIFT_FRIEND,
    });
    // ?sent= with no pending standing falls back to the form.
    expect(giftClaimPageView(issuedGift(), GIFT_NOW, { sent: true })).toEqual({
      kind: "card",
      variant: "claim",
    });
    // A flag never outranks the record: refused on an
    // expired gift still serves Text 1; sent on a bound
    // gift still serves the guard.
    expect(giftClaimPageView(expiredGift(), GIFT_NOW, { refusedSameEmail: true })).toEqual({
      kind: "closed",
      variant: "expired",
    });
    expect(giftClaimPageView(claimedGift(), GIFT_NOW, { sent: true })).toEqual({
      kind: "card",
      variant: "different",
    });
  });

  it("the resend and change-email flags steer the pending card only (BUG-271)", () => {
    // ?resent=1 on a pending record serves the success
    // state with the confirmation line; ?change-email=1
    // serves the same card with the field back. Both
    // are ignored where no pending stands, exactly as
    // ?sent= is.
    expect(giftClaimPageView(pendingGift(), GIFT_NOW, { resent: true })).toEqual({
      kind: "card",
      variant: "pending",
      pendingEmail: GIFT_FRIEND,
      resent: true,
    });
    expect(giftClaimPageView(pendingGift(), GIFT_NOW, { changeEmail: true })).toEqual({
      kind: "card",
      variant: "pending",
      pendingEmail: GIFT_FRIEND,
      pendingForm: true,
    });
    expect(giftClaimPageView(issuedGift(), GIFT_NOW, { resent: true })).toEqual({
      kind: "card",
      variant: "claim",
    });
    expect(giftClaimPageView(issuedGift(), GIFT_NOW, { changeEmail: true })).toEqual({
      kind: "card",
      variant: "claim",
    });
    // The refused leg still outranks the resend leg: a
    // resent flag never shows the confirmation on a
    // record whose buyer email was refused.
    expect(
      giftClaimPageView(pendingGift(), GIFT_NOW, { resent: true, refusedSameEmail: true }),
    ).toEqual({
      kind: "card",
      variant: "same-email",
    });
  });

  it("the format-error flag carries the typed entry into the field — view 18's standing entry", () => {
    // The entry arrives from the one-shot entry cookie
    // (the page reads it only alongside ?error=email);
    // the view passes it to the card untouched.
    expect(
      giftClaimPageView(issuedGift(), GIFT_NOW, { emailError: true, entryEmail: "name@exampl" }),
    ).toEqual({
      kind: "card",
      variant: "claim",
      emailError: true,
      entryEmail: "name@exampl",
    });
    // Without the cookie the same flag serves the bare
    // error, entry-less.
    expect(giftClaimPageView(issuedGift(), GIFT_NOW, { emailError: true })).toEqual({
      kind: "card",
      variant: "claim",
      emailError: true,
      entryEmail: undefined,
    });
    // An entry never presents where the claim form does
    // not stand: on an expired gift the flag and the
    // entry alike are ignored, and Text 1 serves.
    expect(
      giftClaimPageView(expiredGift(), GIFT_NOW, { emailError: true, entryEmail: "name@exampl" }),
    ).toEqual({
      kind: "closed",
      variant: "expired",
    });
  });

  it("the send-failure flag carries the typed entry into the field too — BUG-029", () => {
    // Fix batch, 19 Nov 2026: after a send failure the
    // typed address used to be dropped while a format
    // error retained it. The route now re-arms the entry
    // cookie on ?sendfailed=1, the page reads it
    // alongside that flag, and the view passes it to the
    // card exactly as the format-error path does.
    expect(
      giftClaimPageView(issuedGift(), GIFT_NOW, {
        sendFailed: true,
        entryEmail: "friend@example.co.uk",
      }),
    ).toEqual({
      kind: "card",
      variant: "claim",
      sendFailed: true,
      entryEmail: "friend@example.co.uk",
    });
    // Without the cookie the failure line serves over an
    // empty field, as before.
    expect(giftClaimPageView(issuedGift(), GIFT_NOW, { sendFailed: true })).toEqual({
      kind: "card",
      variant: "claim",
      sendFailed: true,
      entryEmail: undefined,
    });
  });
});

describe("the claim-attempt decision (named tests (d)–(j), decision level)", () => {
  // The decision takes the record and the NORMALISED
  // email — the route normalises before it decides (and
  // an unknown token never reaches the decision: the
  // route answers it with the not-recognised page). The
  // case-and-spaces cases below compose the two exactly
  // as the route does.
  it("(e) refuses the buyer's own email — case and stray spaces ignored", () => {
    expect(decideClaimAttempt(issuedGift(), GIFT_BUYER, GIFT_NOW)).toEqual({
      kind: "same-email",
    });
    expect(
      decideClaimAttempt(issuedGift(), normaliseEmail("  Buyer@Example.co.uk "), GIFT_NOW),
    ).toEqual({ kind: "same-email" });
  });

  it("(f) starts a confirmation for a different email on a live gift", () => {
    expect(decideClaimAttempt(issuedGift(), GIFT_FRIEND, GIFT_NOW)).toEqual({
      kind: "send-confirmation",
      email: GIFT_FRIEND,
    });
    // A pending for someone else does not block a fresh
    // attempt — it is replaced.
    expect(decideClaimAttempt(pendingGift(), "other@example.co.uk", GIFT_NOW)).toEqual({
      kind: "send-confirmation",
      email: "other@example.co.uk",
    });
  });

  it("(g) resumes for the bound email — abandoning after claiming loses nothing", () => {
    expect(decideClaimAttempt(claimedGift(), GIFT_FRIEND, GIFT_NOW)).toEqual({
      kind: "resume",
    });
    expect(
      decideClaimAttempt(claimedGift(), normaliseEmail(" Friend@Example.co.uk"), GIFT_NOW),
    ).toEqual({ kind: "resume" });
  });

  it("(h) refuses any other email on a bound gift — Text 3 wins over Text 4", () => {
    expect(decideClaimAttempt(claimedGift(), "third@example.co.uk", GIFT_NOW)).toEqual({
      kind: "refused-claimed",
    });
    // Even the buyer's own email: once bound, the guard
    // is Text 3's, never Text 4's.
    expect(decideClaimAttempt(claimedGift(), GIFT_BUYER, GIFT_NOW)).toEqual({
      kind: "refused-claimed",
    });
  });

  it("(d) closes a redeemed gift to every attempt", () => {
    expect(decideClaimAttempt(redeemedGift(), GIFT_FRIEND, GIFT_NOW)).toEqual({
      kind: "closed",
    });
    expect(decideClaimAttempt(redeemedGift(), GIFT_BUYER, GIFT_NOW)).toEqual({
      kind: "closed",
    });
  });

  it("(j) closes an expired gift — unclaimed or claimed — to every attempt", () => {
    expect(decideClaimAttempt(expiredGift(), GIFT_FRIEND, GIFT_NOW)).toEqual({
      kind: "closed",
    });
    expect(decideClaimAttempt(claimedExpiredGift(), GIFT_FRIEND, GIFT_NOW)).toEqual({
      kind: "closed",
    });
  });

  it("an unknown token never reaches a decision — every flag still serves not-recognised", () => {
    expect(giftClaimPageView(null, GIFT_NOW, { refusedSameEmail: true })).toEqual({
      kind: "closed",
      variant: "not-recognised",
    });
    expect(giftClaimPageView(null, GIFT_NOW, { sent: true })).toEqual({
      kind: "closed",
      variant: "not-recognised",
    });
  });
});

describe("emails", () => {
  it("normalises case and stray spaces", () => {
    expect(normaliseEmail("  Friend@Example.CO.UK ")).toBe("friend@example.co.uk");
  });

  it("accepts ordinary addresses and refuses malformed ones", () => {
    expect(isEmailShape("friend@example.co.uk")).toBe(true);
    expect(isEmailShape("a.b+c@sub.example.com")).toBe(true);
    expect(isEmailShape("")).toBe(false);
    expect(isEmailShape("no-at-sign")).toBe(false);
    expect(isEmailShape("two@@example.co.uk")).toBe(false);
    expect(isEmailShape("@example.co.uk")).toBe(false);
    expect(isEmailShape("friend@")).toBe(false);
    expect(isEmailShape("friend@localhost")).toBe(false);
    expect(isEmailShape("friend @example.co.uk")).toBe(false);
  });
});

describe("the token form — long and un-guessable, never enumerable", () => {
  it("mints 32-character base64url tokens, unique per call", () => {
    const a = newGiftToken();
    const b = newGiftToken();
    expect(a).toHaveLength(32);
    expect(a).not.toBe(b);
    expect(isGiftTokenForm(a)).toBe(true);
    expect(isGiftTokenForm(newConfirmToken())).toBe(true);
  });

  it("refuses the sample's mock slug and every short or shaped guess", () => {
    // The Master's illustrative link — view 11's
    // x7k2-together — is NOT a buildable token form.
    expect(isGiftTokenForm("x7k2-together")).toBe(false);
    expect(isGiftTokenForm("")).toBe(false);
    expect(isGiftTokenForm("a".repeat(23))).toBe(false);
    expect(isGiftTokenForm("a".repeat(65))).toBe(false);
    expect(isGiftTokenForm("a".repeat(24))).toBe(true);
    expect(isGiftTokenForm("a".repeat(64))).toBe(true);
    expect(isGiftTokenForm("has spaces in it........")).toBe(false);
    expect(isGiftTokenForm("dots.are.not.allowed....")).toBe(false);
    expect(isGiftTokenForm("slash/es/are/not/allowed")).toBe(false);
  });

  it("builds the flow's paths from the token", () => {
    expect(giftClaimPath("tok")).toBe("/gift/tok");
    expect(giftClaimedPath("tok")).toBe("/gift/tok/claimed");
    expect(giftClaimPostPath("tok")).toBe("/gift/tok/claim");
    expect(giftConfirmPath("tok", "pend")).toBe("/gift/tok/confirm/pend");
  });
});
