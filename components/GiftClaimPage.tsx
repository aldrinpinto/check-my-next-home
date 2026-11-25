import type { ReactNode } from "react";

import {
  GIFT_CLAIM_BODY,
  GIFT_CLAIM_BUTTON,
  GIFT_CLAIM_FINE_PRINT,
  GIFT_CLAIM_HEADING,
  GIFT_CLAIMED_BODY,
  GIFT_CLAIMED_CHIP,
  GIFT_CLAIMED_HEADING,
  GIFT_CLAIMED_SEARCH_HEADING,
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
  GIFT_SUPPORT_EMAIL,
  GIFT_USED_BODY,
  GIFT_USED_HEADING,
  GIFT_USED_SEARCH_HEADING,
  GIFT_VOIDED_BODY,
  GIFT_VOIDED_HEADING,
  GIFT_VOIDED_SEARCH_HEADING,
  giftClaimPath,
  giftClaimPostPath,
  type GiftClaimVariant,
} from "../lib/gift";
import { Button, TextField } from "./kit";
import PostcodeBox from "./PostcodeBox";

// M7.13 — the Check Together claim flow's screens
// (decision D21). Every state is a screen on the claim
// flow in the same card pattern (placement ruling,
// 18 Nov 2026): no gift state touches the landing page,
// and none is shown there as a banner.
//
// The card furniture is the finalised samples' (Master
// views 17–27): the icon badge in its gift / ok /
// neutral / warn forms, the claimed card's chip, the
// two refusal screens' message box (heading and body in
// the error-tinted box, no badge — the samples' own
// form, restored by the conform pass of 19 Nov 2026),
// and the search block — heading, line, and the site's
// bare postcode box — that the claimed, used, expired
// and not-recognised screens carry. The claim form is
// the kit's standard field block in markup, dressed as
// the sample's side-by-side field row in globals.css
// (the payment-flow parity stack, 22 Nov 2026, PF-26 —
// the founder reversed the fold-in departure the step
// first built with: the row stands on wide screens and
// stacks at narrow widths). One ruled departure from
// the samples' drawing stands, recorded in the step's
// build note and kept by the same ruling (PF-29):
// heading levels follow the product's page discipline
// (the card's heading is the page's h1, the search
// heading its h2), where the sample's card sits under
// a shelf heading of its own — and the search block
// keeps the site's bare postcode box.
//
// Copy is lib/gift.ts's constants — the samples'
// verbatim text. The sample's shelf notes ("In this
// sample…", "Sample only — …") are not product copy and
// appear nowhere.

// The samples' **…** bold markers, rendered — the
// lib/site-pages.ts convention — with the support
// address linkified where it appears (the used screen's
// body).
function rich(text: string): ReactNode[] {
  return text.split("**").flatMap((part, index) => {
    const segments = part.split(GIFT_SUPPORT_EMAIL);
    const nodes = segments.flatMap((segment, segIndex) =>
      segIndex === 0
        ? [segment]
        : [
            <a key={`m${index}-${segIndex}`} href={`mailto:${GIFT_SUPPORT_EMAIL}`}>
              {GIFT_SUPPORT_EMAIL}
            </a>,
            segment,
          ],
    );
    return index % 2 === 1 ? [<strong key={`s${index}`}>{nodes}</strong>] : nodes;
  });
}

// The samples' badge icons, verbatim paths.
function GiftIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="8" width="18" height="4" />
      <path d="M5 12v9h14v-9" />
      <path d="M12 8v13" />
      <path d="M12 8s-4.5.2-6-1.5C4.7 5 5.6 3 7.4 3 9.6 3 12 8 12 8Z" />
      <path d="M12 8s4.5.2 6-1.5C19.3 5 18.4 3 16.6 3 14.4 3 12 8 12 8Z" />
    </svg>
  );
}

// The pending screen's badge glyph (Master view 20):
// the envelope, in the gift badge's brass-pale disc.
function MailIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

// BUG-271: the pending success state's tick — the
// claimed chip's own tick path (Master view 22's pill,
// BUG-222), drawn large in the ok badge.
function TickIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function BrokenLinkIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 14a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 10a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
      <path d="m4 4 16 16" />
    </svg>
  );
}

// The voided screen's badge glyph (M9.8): the refund's
// returning arrow, the download card's own mark.
function RefundIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

function Badge({
  form,
  children,
}: {
  form: "gift" | "ok" | "neutral" | "warn";
  children: ReactNode;
}) {
  return (
    <span className={`gift-badge gift-badge--${form}`} aria-hidden="true">
      {children}
    </span>
  );
}

// The search block the four forward screens carry: the
// samples' heading and line, and the bare postcode box
// — the same box every content page closes with
// (components/SearchBlock.tsx), so the gift holder goes
// claim → search without the marketing landing in
// between.
function GiftSearchBlock({ heading }: { heading: string }) {
  return (
    <>
      <hr className="gift-divider" />
      <h2 className="gift-search-heading">{heading}</h2>
      <p className="gift-search-line">{GIFT_SEARCH_LINE}</p>
      <PostcodeBox bare />
    </>
  );
}

export function GiftPageShell({ children }: { children: ReactNode }) {
  return (
    <main className="site-pages gift-page">
      <div className="site-pages__inner">
        <div className="gift-wrap">{children}</div>
      </div>
    </main>
  );
}

// The claim page's card, in its four served variants:
//   claim      — the happy path (view 17); with the
//                format error over it (view 18) the
//                field stands pre-filled with the
//                visitor's own just-typed entry (the
//                entryEmail prop, from the one-shot
//                entry cookie — lib/gift.ts);
//   same-email — Text 4 over the claim form (view 23);
//   different  — Text 3 over the bound gift's form
//                (view 24: "Continue", the helper line,
//                the holder's placeholder);
//   pending    — the confirmation step's intermediate
//                screen (view 20). BUG-271: it now has
//                two presentations — the success state
//                (default): a tick, the address as
//                plain text, resend as a quiet link
//                that confirms, and a change-it link;
//                and the change-email form
//                (pendingForm): the old screen, the
//                form again pre-filled with the address
//                the link went to, so a wrong address
//                is corrected in place and a fresh link
//                sent.
// The variant union itself is lib/gift.ts's — the pure
// view builder there selects among them.

const CLAIM_VARIANTS: Record<
  GiftClaimVariant,
  {
    heading: string;
    body: string;
    button: string;
    placeholder: string;
    finePrint?: string;
    helper?: string;
  }
> = {
  claim: {
    heading: GIFT_CLAIM_HEADING,
    body: GIFT_CLAIM_BODY,
    button: GIFT_CLAIM_BUTTON,
    placeholder: GIFT_EMAIL_PLACEHOLDER,
    finePrint: GIFT_CLAIM_FINE_PRINT,
  },
  "same-email": {
    heading: GIFT_SAME_EMAIL_HEADING,
    body: GIFT_SAME_EMAIL_BODY,
    button: GIFT_CLAIM_BUTTON,
    placeholder: GIFT_EMAIL_PLACEHOLDER,
  },
  different: {
    heading: GIFT_DIFFERENT_HEADING,
    body: GIFT_DIFFERENT_BODY,
    button: GIFT_DIFFERENT_BUTTON,
    placeholder: GIFT_DIFFERENT_PLACEHOLDER,
    helper: GIFT_DIFFERENT_HELPER,
  },
  pending: {
    heading: GIFT_PENDING_HEADING,
    body: GIFT_PENDING_BODY,
    button: GIFT_PENDING_BUTTON,
    placeholder: GIFT_EMAIL_PLACEHOLDER,
    finePrint: GIFT_PENDING_FINE_PRINT,
  },
};

export function GiftClaimCard({
  token,
  variant,
  pendingEmail,
  pendingForm = false,
  resent = false,
  emailError = false,
  entryEmail,
  sendFailed = false,
}: {
  token: string;
  variant: GiftClaimVariant;
  pendingEmail?: string;
  // BUG-271: the pending screen's presentations —
  // pendingForm serves the change-email form
  // (?change-email=1); resent serves the resent
  // confirmation line (?resent=1). Both are false on
  // the plain ?sent=1 success state.
  pendingForm?: boolean;
  resent?: boolean;
  emailError?: boolean;
  entryEmail?: string;
  sendFailed?: boolean;
}) {
  const copy = CLAIM_VARIANTS[variant];
  // BUG-271: the pending success state — the screen
  // after the click, and after a resend. No form: the
  // tick, the address as plain text, resend as a quiet
  // link that confirms when used, and the change-it
  // link that brings the form back. The claim is still
  // not complete until the emailed link is clicked —
  // this state says only that the email is sent.
  if (variant === "pending" && !pendingForm) {
    const successBody = pendingEmail
      ? GIFT_PENDING_SUCCESS_BODY.replace("{email}", pendingEmail)
      : GIFT_PENDING_SUCCESS_BODY;
    return (
      <div className="card gift-card">
        <Badge form="ok">
          <TickIcon />
        </Badge>
        <h1>{GIFT_PENDING_SUCCESS_HEADING}</h1>
        <p>{rich(successBody)}</p>
        {resent && pendingEmail && (
          <p className="gift-notice" role="status">
            {rich(GIFT_PENDING_RESENT_LINE.replace("{email}", pendingEmail))}
          </p>
        )}
        {pendingEmail && (
          <form method="post" action={giftClaimPostPath(token)} className="gift-resend">
            <input type="hidden" name="email" value={pendingEmail} />
            <button type="submit" className="gift-link-button">
              {GIFT_PENDING_RESEND_LABEL}
            </button>
          </form>
        )}
        <p className="gift-change">
          <a href={`${giftClaimPath(token)}?change-email=1`}>{GIFT_PENDING_CHANGE_LABEL}</a>
        </p>
        <p className="gift-fine-print">{GIFT_PENDING_FINE_PRINT}</p>
      </div>
    );
  }
  const body =
    variant === "pending" && pendingEmail ? copy.body.replace("{email}", pendingEmail) : copy.body;
  // The samples' furniture: the claim screen carries
  // the gift badge and the pending screen the envelope
  // badge; the two refusal screens carry NO badge —
  // their heading and body stand in the error-tinted
  // message box above the form (the samples' own form
  // for Texts 3 and 4, restored by the conform pass of
  // 19 Nov 2026 — the shell as first built gave them
  // the used screen's send badge, which no sample
  // draws).
  const refusal = variant === "same-email" || variant === "different";
  return (
    <div className="card gift-card">
      {refusal ? (
        <div className="gift-message">
          <h1>{copy.heading}</h1>
          <p>{rich(body)}</p>
        </div>
      ) : (
        <>
          <Badge form="gift">{variant === "pending" ? <MailIcon /> : <GiftIcon />}</Badge>
          <h1>{copy.heading}</h1>
          <p>{rich(body)}</p>
        </>
      )}
      {sendFailed && (
        <p className="gift-alert" role="alert">
          {GIFT_SEND_FAILED_LINE}
        </p>
      )}
      {/* noValidate: the flow's own shape check is the
          one judge of an address (view 18's inline error
          is its answer) — the browser's native bubble
          must not intercept a mistyped entry before the
          server can refuse it in the designed form. The
          samples' form carries novalidate for the same
          reason. */}
      <form method="post" action={giftClaimPostPath(token)} noValidate>
        <TextField
          id="gift-email"
          name="email"
          type="email"
          autoComplete="email"
          label={GIFT_EMAIL_LABEL}
          placeholder={copy.placeholder}
          defaultValue={
            variant === "pending" ? pendingEmail : emailError || sendFailed ? entryEmail : undefined
          }
          error={emailError ? GIFT_EMAIL_ERROR : undefined}
          required
        />
        <Button type="submit">{copy.button}</Button>
        {copy.finePrint && <p className="gift-fine-print">{copy.finePrint}</p>}
        {copy.helper && <p className="gift-helper">{copy.helper}</p>}
      </form>
    </div>
  );
}

// The dedicated claimed page's confirmation card
// (view 22): the "Gift saved" chip carrying the one
// tick (BUG-222, founder ruling 24 Nov 2026 — one
// tick, the Master changed first: the standalone
// badge tick is gone, the pill's tick stands), the
// claimed message, and its own postcode search field.
export function GiftClaimedCard() {
  return (
    <div className="card gift-card">
      <p className="gift-chip">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m4.5 12.5 5 5 10-11" />
        </svg>
        {GIFT_CLAIMED_CHIP}
      </p>
      <h1>{GIFT_CLAIMED_HEADING}</h1>
      <p>{rich(GIFT_CLAIMED_BODY)}</p>
      <GiftSearchBlock heading={GIFT_CLAIMED_SEARCH_HEADING} />
    </div>
  );
}

// The closed screens: already used (view 25), expired
// (view 26), link not recognised (view 27) — and, since
// M9.8, voided (the refund of the issuing order ended
// the gift; DRAFT copy from the M9.8 draft samples,
// never the expired or used words) — each its own
// claim-flow screen carrying its pinned text in full
// and its own search block.
export function GiftClosedCard({
  variant,
}: {
  variant: "used" | "expired" | "not-recognised" | "voided";
}) {
  if (variant === "voided") {
    return (
      <div className="card gift-card">
        <Badge form="neutral">
          <RefundIcon />
        </Badge>
        <h1>{GIFT_VOIDED_HEADING}</h1>
        <p>{rich(GIFT_VOIDED_BODY)}</p>
        <GiftSearchBlock heading={GIFT_VOIDED_SEARCH_HEADING} />
      </div>
    );
  }
  if (variant === "used") {
    return (
      <div className="card gift-card">
        <Badge form="neutral">
          <SendIcon />
        </Badge>
        <h1>{GIFT_USED_HEADING}</h1>
        <p>{rich(GIFT_USED_BODY)}</p>
        <GiftSearchBlock heading={GIFT_USED_SEARCH_HEADING} />
      </div>
    );
  }
  if (variant === "expired") {
    return (
      <div className="card gift-card">
        <Badge form="warn">
          <ClockIcon />
        </Badge>
        <h1>{GIFT_EXPIRED_HEADING}</h1>
        <p>{rich(GIFT_EXPIRED_BODY)}</p>
        <GiftSearchBlock heading={GIFT_EXPIRED_SEARCH_HEADING} />
      </div>
    );
  }
  return (
    <div className="card gift-card">
      <Badge form="neutral">
        <BrokenLinkIcon />
      </Badge>
      <h1>{GIFT_NOT_RECOGNISED_HEADING}</h1>
      <p>{rich(GIFT_NOT_RECOGNISED_BODY)}</p>
      <GiftSearchBlock heading={GIFT_NOT_RECOGNISED_SEARCH_HEADING} />
    </div>
  );
}
