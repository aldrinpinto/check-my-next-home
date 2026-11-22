import type { Metadata } from "next";
import { redirect } from "next/navigation";

import ReportSuccessPage from "../../../components/ReportSuccessPage";
import { displayText } from "../../../lib/address";
import { homeKeyOf } from "../../../lib/bundle-cache";
import type { ReportDoorIdentity } from "../../../lib/report-door";
import { buildReportSuccessView } from "../../../lib/report-success";
import { resultsScopeLabel } from "../../../lib/results";
import { pageMetadata } from "../../../lib/seo";
import { getDbPool } from "../../../lib/server/db";
import { createDbFulfilmentClaimStore } from "../../../lib/server/fulfilment";
import { resolutionForRoute } from "../../../lib/server/serve";

// The success surface's route (plan step M9.6; Sample
// 10): /report/success?order=<the fulfilment claim's
// reference>. The page reads the claim SERVER-SIDE and
// renders by its state — "preparing" while the worker
// composes, the full surface once the claim stands
// fulfilled. The claim reference is the only key: a
// payment id, a gift token or a free-window id, each
// unguessable in its own right.
//
// A reference with no claim behind it — a stale tab, a
// typed URL, a revisit after the trail has gone —
// falls back to the report door, never to an error
// page (the prep's pin). The surface is viewing-only:
// the report itself is read through /report/view, and
// the PDF only ever through the delivery email's
// signed link (named test (k) pins the absence of any
// download or share affordance).
//
// A claim the worker has exhausted ("failed") still
// renders the preparing frame at this step: the
// failure journeys are M9.7's surfaces to build, and
// the buyer's durable copy — the delivery record and
// the support path — does not depend on this page.

export const metadata: Metadata = pageMetadata({
  title: "Your report | Check My Next Home",
  description: "Your detailed report — its delivery state and the on-screen copy.",
  path: "/report/success",
  noindex: true,
});

export const dynamic = "force-dynamic";

// The door's identity ladder, in this page's terms:
// name the claim's home the way the door names it, from
// the serve layer's resolution — never from the claim's
// own strings alone, and never a guessed home.
async function identityFor(postcode: string, homeKey: string | null): Promise<ReportDoorIdentity> {
  try {
    let resolution = await resolutionForRoute(postcode, homeKey);
    if (!resolution && homeKey) {
      resolution = await resolutionForRoute(postcode, null);
    }
    if (!resolution) return { kind: "postcode", postcode, subline: null };
    if (resolution.rung === 1) {
      const address = resolution.address;
      const locality = address.locality ? displayText(address.locality) : null;
      return {
        kind: "home",
        subject: address.label,
        subline: locality ? `${locality}, ${address.postcode}` : address.postcode,
        postcode: address.postcode,
        homeKey: homeKeyOf(resolution),
      };
    }
    if (resolution.rung === 2) {
      return {
        kind: "postcode",
        postcode: resolution.directory.postcode,
        subline: resultsScopeLabel(resolution),
      };
    }
    return { kind: "postcode", postcode, subline: null };
  } catch {
    return { kind: "postcode", postcode, subline: null };
  }
}

export default async function ReportSuccessRoute({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const params = await searchParams;
  const ref = params.order ?? null;
  if (!ref) redirect("/report");
  const claims = createDbFulfilmentClaimStore(getDbPool());
  const claim = await claims.getByRef(ref).catch(() => null);
  if (!claim) redirect("/report");

  const identity = await identityFor(claim.postcode, claim.homeKey);
  const view = buildReportSuccessView({
    state: claim.status === "fulfilled" ? "ready" : "preparing",
    kind: claim.kind,
    identity,
    email: claim.email,
  });
  return <ReportSuccessPage view={view} />;
}
