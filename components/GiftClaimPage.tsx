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
  GIFT_PENDING_HEADING,
  GIFT_SAME_EMAIL_BODY,
  GIFT_SAME_EMAIL_HEADING,
  GIFT_SEARCH_LINE,
  GIFT_SEND_FAILED_LINE,
  GIFT_SUPPORT_EMAIL,
  GIFT_USED_BODY,
  GIFT_USED_HEADING,
  GIFT_USED_SEARCH_HEADING,
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
// views 17–23): the icon badge in its gift / ok /
// neutral / warn forms, the claimed card's chip, and
// the search block — heading, line, and the site's bare
// postcode box — that the claimed, used, expired and
// not-recognised screens carry. Two ruled departures
// from the samples' drawing, both recorded in the
// step's build note: the claim form is the kit's
// standard field block (the plan's fold-in — label,
// input and inline error stacked, the button below),
// not the sample's side-by-side row; and heading levels
// follow the product's page discipline (the card's
// heading is the page's h1, the search heading its h2),
// where the sample's card sits under a shelf heading of
// its own.
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
//   claim      — the happy path (view 17);
//   same-email — Text 4 over the claim form (view 19);
//   different  — Text 3 over the bound gift's form
//                (view 20: "Continue", the helper line);
//   pending    — the confirmation step's intermediate
//                screen (no sample — build-drafted copy,
//                see lib/gift.ts): the form again, so a
//                wrong address is corrected in place and
//                a fresh link sent.
// The variant union itself is lib/gift.ts's — the pure
// view builder there selects among them.

const CLAIM_VARIANTS: Record<
  GiftClaimVariant,
  { heading: string; body: string; button: string; finePrint?: string; helper?: string }
> = {
  claim: {
    heading: GIFT_CLAIM_HEADING,
    body: GIFT_CLAIM_BODY,
    button: GIFT_CLAIM_BUTTON,
    finePrint: GIFT_CLAIM_FINE_PRINT,
  },
  "same-email": {
    heading: GIFT_SAME_EMAIL_HEADING,
    body: GIFT_SAME_EMAIL_BODY,
    button: GIFT_CLAIM_BUTTON,
  },
  different: {
    heading: GIFT_DIFFERENT_HEADING,
    body: GIFT_DIFFERENT_BODY,
    button: GIFT_DIFFERENT_BUTTON,
    helper: GIFT_DIFFERENT_HELPER,
  },
  pending: {
    heading: GIFT_PENDING_HEADING,
    body: GIFT_PENDING_BODY,
    button: GIFT_CLAIM_BUTTON,
  },
};

export function GiftClaimCard({
  token,
  variant,
  pendingEmail,
  emailError = false,
  sendFailed = false,
}: {
  token: string;
  variant: GiftClaimVariant;
  pendingEmail?: string;
  emailError?: boolean;
  sendFailed?: boolean;
}) {
  const copy = CLAIM_VARIANTS[variant];
  const body =
    variant === "pending" && pendingEmail ? copy.body.replace("{email}", pendingEmail) : copy.body;
  // The samples' badges: the claim screen carries the
  // gift badge; the two refusal screens carry the
  // neutral send badge. The pending screen — the claim
  // mid-step, no sample — keeps the claim's own badge.
  const refusal = variant === "same-email" || variant === "different";
  return (
    <div className="card gift-card">
      {refusal ? (
        <Badge form="neutral">
          <SendIcon />
        </Badge>
      ) : (
        <Badge form="gift">
          <GiftIcon />
        </Badge>
      )}
      <h1>{copy.heading}</h1>
      <p>{rich(body)}</p>
      {sendFailed && (
        <p className="gift-alert" role="alert">
          {GIFT_SEND_FAILED_LINE}
        </p>
      )}
      <form method="post" action={giftClaimPostPath(token)}>
        <TextField
          id="gift-email"
          name="email"
          type="email"
          autoComplete="email"
          label={GIFT_EMAIL_LABEL}
          placeholder={GIFT_EMAIL_PLACEHOLDER}
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
// (view 18): the tick badge, the "Gift saved" chip, the
// claimed message, and its own postcode search field.
export function GiftClaimedCard() {
  return (
    <div className="card gift-card">
      <Badge form="ok">
        <TickIcon />
      </Badge>
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

// The three closed screens: already used (view 21),
// expired (view 22) and link not recognised (view 23) —
// each its own claim-flow screen carrying its pinned
// text in full and its own search block.
export function GiftClosedCard({ variant }: { variant: "used" | "expired" | "not-recognised" }) {
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
