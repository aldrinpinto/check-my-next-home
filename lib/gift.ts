// Check Together — the gift claim flow's pure half (plan
// step M7.13, decision D21; the claim shell, built in M7
// and wired to real orders at M9.6).
//
// This module holds everything about the flow that can be
// decided without a database or a clock on the wall: the
// copy, the served-state machine, the claim-attempt
// decisions, the email rules and the route shapes. The
// store and the mailer live behind their server seams
// (lib/server/gifts.ts, lib/server/gift-mailer.ts); M9.6
// creates tokens on paid orders and calls the same
// transitions this shell exercises.
//
// THE COPY is the finalised samples' verbatim text — the
// Check Together gift claim flow samples, founder-approved
// 18 Nov 2026 and folded into the Final Sample Master as
// views 17–23, are the sample authority for these surfaces,
// and the four landing texts are the D44(14) pins as
// replaced at the 18 Nov copy pass (Texts 1 and 2 in their
// original approved wording, Texts 3 and 4 in their
// shorter approved versions). Sample shelf commentary (the
// "In this sample…" and "Sample only — …" notes) is not
// product copy and appears nowhere here.
//
// Three pieces of copy in this module are NOT from the
// samples, because the samples carry no state for them —
// they are build-drafted in the samples' voice and are
// listed in the step's build note for the founder's
// approval before the step ticks at M9.6: the
// confirmation-pending screen (the adopted
// email-confirmation step's intermediate state), the
// send-failure line, the email-format error line, and the
// confirmation email itself.

// ----------------------------------------------------------------
// The lifecycle (D21, as amended 14 Nov 2026)
//
//   Issued    — created only on a paid order (M9.6).
//   Claimed   — bound to the claimant's email, NOT
//               consumed. Binding happens only when the
//               claimant clicks the confirmation link in
//               the email we send (the adopted
//               email-confirmation step, gap check item 1):
//               entering an email starts a pending
//               confirmation and binds nothing, so a typo
//               strands nothing.
//   Redeemed  — consumed when a report is delivered to
//               the bound email (M9.6's delivery path calls
//               the store's markRedeemed).
//   Expired   — 30 days after purchase. Expiry is DERIVED
//               at read time from expiresAt, never stored:
//               "at any point, if 30 days pass, Text 1 ends
//               it" — except that a redeemed gift is final
//               and keeps Text 2 (see giftServedState).
//
// A refund voids the order's gift while it is Issued or
// Claimed; a Redeemed gift stands (M9.8, carried from
// this step) — that transition is M9.8's to build; the
// status set here is D21's four and nothing in this shell
// contradicts it.

export const GIFT_VALIDITY_MS = 30 * 24 * 60 * 60 * 1000;

export type GiftStatus = "issued" | "claimed" | "redeemed";

export interface GiftRecord {
  token: string;
  // Stored normalised (trimmed, lower-cased) — see
  // normaliseEmail. Comparisons never re-normalise stored
  // values; every write path normalises on the way in.
  buyerEmail: string;
  claimantEmail: string | null;
  status: GiftStatus;
  // M9.6's order record id, carried so the gift can be
  // traced to (and voided with) its order at M9.8. Null
  // until M9.6 wires issuance.
  orderRef: string | null;
  issuedAt: Date;
  expiresAt: Date;
  claimedAt: Date | null;
  redeemedAt: Date | null;
  // The pending confirmation: the email awaiting its
  // round-trip and the credential the emailed link
  // carries. Replaced wholesale on every new claim
  // attempt, so only the latest link can bind; cleared
  // at binding.
  pendingEmail: string | null;
  pendingToken: string | null;
  pendingSentAt: Date | null;
}

// The states a visitor can be served. "claimed" (the
// dedicated claimed page) is reached only through the
// flow — the binding confirmation or the resume entry —
// so it is not a state giftServedState returns for the
// claim route; the claimed route checks the record
// itself (status claimed, in date).
export type GiftServedState =
  "not-recognised" | "claim" | "claimed-guard" | "already-used" | "expired";

// The served state for the claim route, in the plan's
// precedence: redemption is final (Text 2 even after the
// 30 days), expiry ends everything unredeemed (Text 1 —
// including a claimed-but-unused gift), a bound gift
// guards itself (Text 3's page), and an unclaimed in-date
// gift offers the claim form.
export function giftServedState(record: GiftRecord | null, now: Date): GiftServedState {
  if (!record) return "not-recognised";
  if (record.status === "redeemed") return "already-used";
  if (now.getTime() > record.expiresAt.getTime()) return "expired";
  if (record.status === "claimed") return "claimed-guard";
  return "claim";
}

// Whether the dedicated claimed page may serve for this
// record: bound, unconsumed, in date.
export function giftClaimedPageServes(record: GiftRecord | null, now: Date): boolean {
  return (
    record !== null && record.status === "claimed" && now.getTime() <= record.expiresAt.getTime()
  );
}

// ----------------------------------------------------------------
// Email rules (gap-check fold-in G9, adopted)
//
// Comparisons ignore case and stray spaces: normalise by
// trimming and lower-casing before comparing and before
// storing. Plus-addressing and other alias forms are
// deliberately NOT policed — an accepted limit, named in
// the prep: disproportionate for a £4.99 gift.

export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// The form's shape check — deliberately permissive (one
// @, non-empty sides, a dot in the domain, no spaces).
// It exists to catch typos of shape, not to judge
// addresses; deliverability is the confirmation
// round-trip's job.
export function isEmailShape(candidate: string): boolean {
  if (candidate.length === 0 || candidate.length > 254) return false;
  if (/\s/.test(candidate)) return false;
  const at = candidate.indexOf("@");
  if (at <= 0 || at !== candidate.lastIndexOf("@")) return false;
  const domain = candidate.slice(at + 1);
  return (
    domain.length > 2 && domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".")
  );
}

// ----------------------------------------------------------------
// The token form
//
// The token is the credential: long and un-guessable
// (the M8.6 standard; the sample's short mock slug is
// illustrative and is never built literally). Generation
// lives with the store (lib/server/gifts.ts — 24 random
// bytes, 32 base64url characters); this is the form a
// route accepts before it spends a database read.

export const GIFT_TOKEN_FORM = /^[A-Za-z0-9_-]{24,64}$/;

export function isGiftTokenForm(candidate: string): boolean {
  return GIFT_TOKEN_FORM.test(candidate);
}

// The strictly functional gift cookie (D21; D44(12);
// test T-LEG-02): set only during a gift visit — when a
// claim binds, and when the bound holder resumes — so
// M9's payment surface can show the 'gift applied'
// banner during that visit. Gift STATE is never held in
// it: state lives server-side against the email and
// survives sessions and devices; the cookie's value is
// the gift token, read only by the server. Its naming
// line joins the Privacy policy when the founder
// approves the wording (see the build note — the ruling
// names the substance; no approved sentence exists yet).
export const GIFT_COOKIE_NAME = "cmnh-gift";

// ----------------------------------------------------------------
// Routes — the claim flow's own shapes. The claim page is
// reached only via the gift link; nothing on the site
// links here (the D21 surprise rule).

export function giftClaimPath(token: string): string {
  return `/gift/${token}`;
}

export function giftClaimedPath(token: string): string {
  return `/gift/${token}/claimed`;
}

export function giftConfirmPath(token: string, pendingToken: string): string {
  return `/gift/${token}/confirm/${pendingToken}`;
}

export function giftClaimPostPath(token: string): string {
  return `/gift/${token}/claim`;
}

// ----------------------------------------------------------------
// The claim page's view
//
// The page serves by STATE, always — the record decides.
// Three presentation flags ride the redirects back from
// a claim attempt (the journey's query-flag pattern —
// the unplaced notice's ?notice= is the precedent): they
// select a presentation of the state the record is
// already in, and can never create one. A flag that
// doesn't fit the state is ignored: ?sent= on a bound
// gift still serves the guard screen, ?refused= on an
// expired gift still serves Text 1.

export type GiftClaimVariant = "claim" | "same-email" | "different" | "pending";

export type GiftClaimPageView =
  | {
      kind: "card";
      variant: GiftClaimVariant;
      pendingEmail?: string;
      emailError?: boolean;
      sendFailed?: boolean;
    }
  | { kind: "closed"; variant: "used" | "expired" | "not-recognised" };

export interface GiftClaimFlags {
  // ?refused=same-email — the attempt just refused was
  // the buyer's own email (Text 4 over the form).
  refusedSameEmail?: boolean;
  // ?sent=1 — a confirmation email has just been sent;
  // serves the pending screen while a pending stands.
  sent?: boolean;
  // ?sendfailed=1 — the send just failed; the claim form
  // again, with the failure line.
  sendFailed?: boolean;
  // ?error=email — the submitted address failed the
  // shape check; the claim form with its inline error.
  emailError?: boolean;
}

export function giftClaimPageView(
  record: GiftRecord | null,
  now: Date,
  flags: GiftClaimFlags,
): GiftClaimPageView {
  const state = giftServedState(record, now);
  if (state === "not-recognised") return { kind: "closed", variant: "not-recognised" };
  if (state === "already-used") return { kind: "closed", variant: "used" };
  if (state === "expired") return { kind: "closed", variant: "expired" };
  if (state === "claimed-guard") return { kind: "card", variant: "different" };
  // state === "claim"
  if (flags.refusedSameEmail) return { kind: "card", variant: "same-email" };
  if (flags.sent && record && record.pendingEmail) {
    return { kind: "card", variant: "pending", pendingEmail: record.pendingEmail };
  }
  if (flags.sendFailed) return { kind: "card", variant: "claim", sendFailed: true };
  if (flags.emailError) return { kind: "card", variant: "claim", emailError: true };
  return { kind: "card", variant: "claim" };
}

// ----------------------------------------------------------------
// The claim-attempt decision
//
// One function decides every form submission, so the
// route handler only executes. The record and the
// submitted email are already normalised by the caller.

export type ClaimAttempt =
  // The state page stands (redeemed or expired): the
  // form is not part of those screens; a stray post
  // changes nothing.
  | { kind: "closed" }
  // The buyer's own email on an unclaimed gift: refused
  // politely under Text 4, and NOTHING is written — the
  // link stays valid and any pending confirmation for
  // another address survives untouched ("Nothing is
  // used up").
  | { kind: "same-email" }
  // A different email on an unclaimed gift: (re)start
  // the pending confirmation for this address and send
  // the confirmation email. Nothing binds until the
  // emailed link is clicked.
  | { kind: "send-confirmation"; email: string }
  // The bound email entered on a claimed gift: the
  // holder is recognised and goes through to the
  // claimed page (resume — abandoning after claiming
  // burns nothing, test (g)).
  | { kind: "resume" }
  // Any other email on a claimed gift — including the
  // buyer's own: refused under Text 3. PRECEDENCE
  // (adopted gap check item 3): once a gift is bound,
  // the claimed-with-a-different-email text wins over
  // the buyer-own-email text, because Text 4's "your
  // link is still valid — send it to them" would be
  // false for the buyer once someone has claimed.
  | { kind: "refused-claimed" };

export function decideClaimAttempt(
  record: GiftRecord,
  normalisedEmail: string,
  now: Date,
): ClaimAttempt {
  const state = giftServedState(record, now);
  if (state === "already-used" || state === "expired") return { kind: "closed" };
  if (state === "claimed-guard") {
    return normalisedEmail === record.claimantEmail
      ? { kind: "resume" }
      : { kind: "refused-claimed" };
  }
  // state === "claim"
  if (normalisedEmail === record.buyerEmail) return { kind: "same-email" };
  return { kind: "send-confirmation", email: normalisedEmail };
}

// ----------------------------------------------------------------
// Copy — the samples' verbatim text (Master views 17–23).
// **…** marks the samples' bold, rendered by the page
// (the lib/site-pages.ts convention).

// View 17 — Claim (the happy path). The heading and
// explanation continue the delivery email's gift block
// (Master view 11: same brass card family, tag and
// voice — adopted gap check item 2).
export const GIFT_CLAIM_HEADING = "You've been given a free home check";
export const GIFT_CLAIM_BODY =
  "Someone who bought a full report from us has passed you a free one. It's for **any home** you're thinking about — just tell us your email address and the gift is yours.";
export const GIFT_EMAIL_LABEL = "Your email address";
export const GIFT_EMAIL_PLACEHOLDER = "e.g. you@example.co.uk";
export const GIFT_CLAIM_BUTTON = "Claim my free report";
export const GIFT_CLAIM_FINE_PRINT =
  "The gift is valid for 30 days from the day the report was bought, and it can be claimed once — so use the email address you'll order your report with.";

// View 19 — Same email as the buyer (Text 4, D44(14), in
// its shorter 18 Nov 2026 approved version). Served on
// the claim page with the claim form below it.
export const GIFT_SAME_EMAIL_HEADING = "This gift is for someone else";
export const GIFT_SAME_EMAIL_BODY =
  "This gift came with a report you bought, so it can't be claimed with the same email address. Nothing is used up — your link is still valid. Send it to the person choosing the home with you, and they can claim a free full report for any home.";

// View 20 — Claimed with a different email (Text 3,
// D44(14), shorter approved version). The claim page's
// form for a bound gift: the button is "Continue", and
// the helper line is the sample's.
export const GIFT_DIFFERENT_HEADING = "This gift is already claimed";
export const GIFT_DIFFERENT_BODY =
  "Someone has claimed this gift with a different email address, and it can only be used with that address. If it was you, enter the same address below — if someone forwarded you this link after claiming it, only they can use it.";
export const GIFT_DIFFERENT_BUTTON = "Continue";
export const GIFT_DIFFERENT_HELPER =
  "If you claimed this gift yourself, entering that same address here will take you through to checking a home.";

// View 18 — Claimed: the dedicated claimed page's
// confirmation card, with its pill and its own postcode
// search field (placement ruling, 18 Nov 2026).
export const GIFT_CLAIMED_CHIP = "Gift saved to your email address";
export const GIFT_CLAIMED_HEADING = "Your free report is claimed";
export const GIFT_CLAIMED_BODY =
  "This gift is now yours, and it stays tied to the email address you claimed it with. When you're ready, find the home below and order its full report using that same email address — **we'll apply your free report for you, so there's nothing to pay.**";
export const GIFT_CLAIMED_SEARCH_HEADING = "Check a home now";

// View 21 — Already used (Text 2, D44(14), original
// approved wording in full, the support line included).
export const GIFT_USED_HEADING = "This gift has already been used";
export const GIFT_USED_BODY =
  "The free report that came with this gift link has already been delivered, so the link can't be used again. If the report was delivered to you, you'll find it in the email we sent when it was ready. If you think something has gone wrong, email us at support@checkmynexthome.co.uk and we'll look into it.";
export const GIFT_USED_SEARCH_HEADING = "Check another home";
export const GIFT_SUPPORT_EMAIL = "support@checkmynexthome.co.uk";

// View 22 — Expired (Text 1, D44(14), original approved
// wording in full).
export const GIFT_EXPIRED_HEADING = "This gift link has expired";
export const GIFT_EXPIRED_BODY =
  "This free report gift was valid for 30 days from the day the report was bought, and that time has run out, so the link no longer works. Gift links can't be extended or replaced. You can still check any home on our website — the headline facts are free — and a full report costs £4.99.";
export const GIFT_EXPIRED_SEARCH_HEADING = "Check a home anyway";

// View 23 — Link not recognised: its own plain page
// (founder-confirmed, 18 Nov 2026). It confirms no state
// — a made-up link and a miscopied real one get exactly
// the same answer.
export const GIFT_NOT_RECOGNISED_HEADING = "This link doesn't work";
export const GIFT_NOT_RECOGNISED_BODY =
  "This gift link may have been copied incompletely, so we can't find the gift it belongs to. You can still check any home on our website — the headline facts are free.";
export const GIFT_NOT_RECOGNISED_SEARCH_HEADING = "Check a home";

// The search block the claimed, used, expired and
// not-recognised screens carry (the samples' line,
// verbatim on all four).
export const GIFT_SEARCH_LINE = "Enter a postcode to see the headline facts for a home, free.";

// ----------------------------------------------------------------
// Build-drafted copy — NO sample exists for these (the
// confirmation step's intermediate state and the form's
// failure lines). Drafted in the samples' voice for the
// founder's approval before the step ticks at M9.6, and
// listed in the build note. The {email} in the pending
// body is the address the visitor just entered.

export const GIFT_PENDING_HEADING = "Check your email to finish claiming";
export const GIFT_PENDING_BODY =
  "We've sent a confirmation email to **{email}**. Click the link in it and the gift is yours — it stays tied to that address. The gift isn't claimed until you click, so if the address looks wrong, enter it again below and we'll send a fresh link.";
export const GIFT_SEND_FAILED_LINE =
  "We couldn't send the confirmation email just now — nothing has been claimed. Check the address and try again.";
export const GIFT_EMAIL_ERROR = "Enter an email address, like you@example.co.uk";

// The confirmation email (build-drafted, minimal and
// functional; the email template machinery is M8.6's,
// which conforms this email's dress when it builds).
export const GIFT_CONFIRM_SUBJECT = "Confirm your free report gift";
export const GIFT_CONFIRM_INTRO =
  "You asked to claim a free detailed report gift on Check My Next Home. Click the link below to confirm this email address and finish claiming:";
export const GIFT_CONFIRM_FALLBACK = "Or copy this link into your browser:";
export const GIFT_CONFIRM_IGNORE =
  "The gift is then tied to this address. If you didn't ask for this, ignore this email — nothing has been claimed.";
