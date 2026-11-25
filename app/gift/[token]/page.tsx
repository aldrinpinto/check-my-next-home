import type { Metadata } from "next";
import { cookies } from "next/headers";

import { GiftClaimCard, GiftClosedCard, GiftPageShell } from "../../../components/GiftClaimPage";
import {
  GIFT_ENTRY_COOKIE_NAME,
  giftClaimPageView,
  isGiftTokenForm,
  type GiftRecord,
} from "../../../lib/gift";
import { pageMetadata } from "../../../lib/seo";
import { getDbPool } from "../../../lib/server/db";
import { createDbGiftStore } from "../../../lib/server/gifts";

// The Check Together claim page (plan step M7.13,
// decision D21) — reached only via the gift link from a
// paid report's delivery email; nothing on the site
// links here and the gift is never mentioned on any
// other surface (the D21 surprise rule). The page
// serves by the gift's stored state, in the placement
// ruling's forms: the claim form (with Texts 3 and 4
// over it, in their cases) on this page; the expired
// and already-used states as their own screens in the
// same card pattern; a made-up or miscopied link as
// the plain not-recognised page, confirming no state.
// The dedicated claimed page is the sibling route
// (./claimed).
//
// Journey-page conventions: explicit noindex metadata
// in every environment (the M7.8 pattern — this route
// also joins the robots disallow set), no sitemap
// entry, the TEST label via the layout.

export const metadata: Metadata = pageMetadata({
  title: "Claim your free report | Check My Next Home",
  description:
    "Claim the free detailed report gift passed to you with a Check My Next Home report.",
  path: "/gift",
  noindex: true,
});

export const dynamic = "force-dynamic";

async function recordFor(token: string): Promise<GiftRecord | null> {
  // A token that fails the form check is answered
  // without a database read: the not-recognised page
  // confirms nothing, and a made-up link costs no query.
  if (!isGiftTokenForm(token)) return null;
  try {
    return await createDbGiftStore(getDbPool()).getByToken(token);
  } catch {
    // A failed read serves the not-recognised page
    // rather than an error: the page confirms no state
    // either way, and the visitor keeps the search
    // block's way forward.
    return null;
  }
}

export default async function GiftClaimRoute({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{
    refused?: string;
    sent?: string;
    resent?: string;
    "change-email"?: string;
    sendfailed?: string;
    error?: string;
  }>;
}) {
  const { token } = await params;
  const flags = await searchParams;
  const record = await recordFor(token);
  // The entry flash is read for the format-error
  // presentation and, since the fix batch of 19 Nov
  // 2026 (BUG-029), the send-failure presentation: the
  // cookie the claim route set on its redirect, holding
  // the address just typed, so the field stands
  // pre-filled under the error line (view 18) or the
  // failure line (view 19) alike. It is read on no
  // other presentation, never logged, and never
  // counted — counting derives its route patterns from
  // the pathname alone.
  const entryEmail =
    flags.error === "email" || flags.sendfailed === "1"
      ? (await cookies()).get(GIFT_ENTRY_COOKIE_NAME)?.value
      : undefined;
  const view = giftClaimPageView(record, new Date(), {
    refusedSameEmail: flags.refused === "same-email",
    sent: flags.sent === "1",
    resent: flags.resent === "1",
    changeEmail: flags["change-email"] === "1",
    sendFailed: flags.sendfailed === "1",
    emailError: flags.error === "email",
    rateLimited: flags.error === "rate-limited",
    entryEmail,
  });

  return (
    <GiftPageShell>
      {view.kind === "closed" ? (
        <GiftClosedCard variant={view.variant} />
      ) : (
        <GiftClaimCard
          token={token}
          variant={view.variant}
          pendingEmail={view.pendingEmail}
          pendingForm={view.pendingForm}
          resent={view.resent}
          emailError={view.emailError}
          entryEmail={view.entryEmail}
          sendFailed={view.sendFailed}
          rateLimited={view.rateLimited}
        />
      )}
    </GiftPageShell>
  );
}
