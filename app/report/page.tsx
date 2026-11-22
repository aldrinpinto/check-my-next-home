import ReportDoorPage from "../../components/ReportDoorPage";
import ReportPaymentPage from "../../components/ReportPaymentPage";
import ReportWindowPage from "../../components/ReportWindowPage";
import { displayText } from "../../lib/address";
import { homeKeyOf } from "../../lib/bundle-cache";
import { nationOfLsoa, type Nation } from "../../lib/journey";
import { nationOfPostcode } from "../../lib/nation";
import {
  buildReportDoorView,
  buildReportWindowView,
  effectiveReportDoorState,
  type ReportDoorIdentity,
} from "../../lib/report-door";
import { buildReportPaymentView } from "../../lib/report-payment";
import { resultsScopeLabel } from "../../lib/results";
import { paymentPublishableKey } from "../../lib/server/payments";
import { resolutionForRoute } from "../../lib/server/serve";

// The report door (plan step M7.6): /report, the route
// every truncation line, section upsell, buy bar and
// shortlist report button has pointed at since M7.4.
// The door renders by its checked-in state
// (REPORT_DOOR_STATE in lib/site.ts) as the nation hold
// filters it (effectiveReportDoorState in
// lib/report-door.ts — Scotland and Northern Ireland
// always render the holding form, founder ruling
// 22 Nov 2026, Road B): "paid" — the payment page —
// since M9.6 flipped it with fulfilment behind it;
// "window" — the free launch window's page — filled at
// M9.6 and opened by its own later flip; and the
// holding form (M7.6's build), which names the home
// the link carried when it can, and renders its generic
// form when it cannot — a stale key falls back to the
// postcode's form, a failed directory read to the
// generic form, never an error page and never a guessed
// home. The page derives nothing from the check bundles,
// so a cold deep link renders whole. Journey-page
// conventions: no sitemap entry (D38 locks the SEO
// set); the TEST label arrives via the layout. M7.8
// superseded the no-metadata convention: with per-page
// metadata moved into the pages, this route exports
// explicit noindex metadata like the rest of the
// journey family.

import type { Metadata } from "next";

import { pageMetadata } from "../../lib/seo";

// M7.8: explicit production noindex — see app/search/page.tsx.
export const metadata: Metadata = pageMetadata({
  title: "The detailed report | Check My Next Home",
  description: "The detailed report for the home you checked.",
  path: "/report",
  noindex: true,
});

export const dynamic = "force-dynamic";

async function identityFor(
  postcode: string | null,
  homeKey: string | null,
): Promise<{ identity: ReportDoorIdentity; nation: Nation }> {
  if (!postcode) return { identity: { kind: "generic" }, nation: "unknown" };
  try {
    let resolution = await resolutionForRoute(postcode, homeKey);
    if (!resolution && homeKey) {
      // A key the directory no longer holds: the
      // postcode's own form, as the results route's
      // picker fallback does — never a guessed home.
      resolution = await resolutionForRoute(postcode, null);
    }
    if (!resolution) return { identity: { kind: "generic" }, nation: "unknown" };
    // The nation hold's evidence (Road B): the
    // directory's filed area code for this postcode,
    // read by the brains' own detector — the same
    // resolution that names the home carries it. A
    // wider-area resolution names no single postcode's
    // directory and carries no nation.
    // BUG-106: the postcode area outranks the filed
    // small-area code for the door — a border postcode
    // (DG16) files an English small area but is Scottish.
    const nation: Nation =
      resolution.rung === 1 || resolution.rung === 2
        ? (nationOfPostcode(resolution.directory.postcode) ??
          nationOfLsoa(resolution.directory.lsoaCode))
        : "unknown";
    if (resolution.rung === 1) {
      const address = resolution.address;
      const locality = address.locality ? displayText(address.locality) : null;
      return {
        identity: {
          kind: "home",
          subject: address.label,
          subline: locality ? `${locality}, ${address.postcode}` : address.postcode,
          postcode: address.postcode,
          homeKey: homeKeyOf(resolution),
        },
        nation,
      };
    }
    if (resolution.rung === 2) {
      return {
        identity: {
          kind: "postcode",
          postcode: resolution.directory.postcode,
          subline: resultsScopeLabel(resolution),
        },
        nation,
      };
    }
    return { identity: { kind: "generic" }, nation: "unknown" };
  } catch {
    return { identity: { kind: "generic" }, nation: "unknown" };
  }
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ postcode?: string; home?: string }>;
}) {
  const params = await searchParams;
  const postcode = params.postcode ?? null;
  const { identity, nation } = await identityFor(postcode, params.home ?? null);
  // The door's three states (lib/site.ts), each filled
  // by its own step and rendered only in its state:
  // "paid" is the payment page (M9.4/M9.5, flipped live
  // at M9.6 with fulfilment behind it — the publishable
  // key is read on the server and handed to the page as
  // data, and the lane's own key arrives with each
  // started payment); "window" is the free launch
  // window's page (M9.6 — its opening is a later flip
  // commit of its own); "holding" is the M7.6 form
  // below, unchanged.
  //
  // The nation hold (founder ruling, 22 Nov 2026 —
  // Road B): the state this arrival renders by is the
  // EFFECTIVE state for its nation — Scotland and
  // Northern Ireland render the holding form whatever
  // the checked-in state says, until their own
  // milestone lifts the hold.
  const doorState = effectiveReportDoorState(nation);
  if (doorState === "paid") {
    return (
      <ReportPaymentPage
        view={buildReportPaymentView(identity)}
        publishableKey={paymentPublishableKey()}
        postcode={postcode}
        homeKey={identity.kind === "home" ? identity.homeKey : null}
      />
    );
  }
  if (doorState === "window") {
    return (
      <ReportWindowPage
        view={buildReportWindowView(identity, {
          freeNation: nation === "scotland" || nation === "northern-ireland",
        })}
        postcode={postcode}
        homeKey={identity.kind === "home" ? identity.homeKey : null}
      />
    );
  }
  return <ReportDoorPage view={buildReportDoorView(identity)} />;
}
