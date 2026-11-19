import type { Metadata } from "next";

import { GiftClosedCard, GiftPageShell } from "../../components/GiftClaimPage";
import { pageMetadata } from "../../lib/seo";

// /gift with no token — a truncated gift link's most
// likely landing. It serves the same plain
// not-recognised page as a made-up token (plan step
// M7.13): the link it came from names no gift we can
// find, and the page confirms no state either way.

export const metadata: Metadata = pageMetadata({
  title: "Claim your free report | Check My Next Home",
  description:
    "Claim the free detailed report gift passed to you with a Check My Next Home report.",
  path: "/gift",
  noindex: true,
});

export default function GiftBareRoute() {
  return (
    <GiftPageShell>
      <GiftClosedCard variant="not-recognised" />
    </GiftPageShell>
  );
}
