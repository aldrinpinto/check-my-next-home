import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { GiftClaimedCard, GiftPageShell } from "../../../../components/GiftClaimPage";
import { giftClaimedPageServes, giftClaimPath, isGiftTokenForm } from "../../../../lib/gift";
import { pageMetadata } from "../../../../lib/seo";
import { getDbPool } from "../../../../lib/server/db";
import { createDbGiftStore } from "../../../../lib/server/gifts";

// The dedicated claimed page (plan step M7.13,
// placement ruling 18 Nov 2026): a successful claim
// lands here, inside the claim flow — the full
// confirmation card with the "Gift saved to your email
// address" pill, the claimed message, and its own
// postcode search field, so the gift holder goes
// claim → search without the marketing landing in
// between.
//
// It serves only while the gift stands claimed —
// bound, unconsumed, in date. The gift link itself is
// the credential (the flow's settled design: before
// any claim, anyone holding the link can claim; after
// it, the binding gates redemption at order time, not
// this page). Anything else — an unclaimed, redeemed,
// expired or unknown token — goes back to the claim
// route, which serves the state that actually stands.

export const metadata: Metadata = pageMetadata({
  title: "Your free report is claimed | Check My Next Home",
  description: "Your free detailed report gift is claimed and saved to your email address.",
  path: "/gift",
  noindex: true,
});

export const dynamic = "force-dynamic";

export default async function GiftClaimedRoute({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let serves = false;
  if (isGiftTokenForm(token)) {
    try {
      const record = await createDbGiftStore(getDbPool()).getByToken(token);
      serves = giftClaimedPageServes(record, new Date());
    } catch {
      serves = false;
    }
  }
  if (!serves) redirect(giftClaimPath(token));
  return (
    <GiftPageShell>
      <GiftClaimedCard />
    </GiftPageShell>
  );
}
