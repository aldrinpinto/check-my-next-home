import ReportDoorPage from "../../components/ReportDoorPage";
import { displayText } from "../../lib/address";
import { homeKeyOf } from "../../lib/bundle-cache";
import { buildReportDoorView, type ReportDoorIdentity } from "../../lib/report-door";
import { resultsScopeLabel } from "../../lib/results";
import { resolutionForRoute } from "../../lib/server/serve";

// The report door (plan step M7.6): /report, the route
// every truncation line, section upsell, buy bar and
// shortlist report button has pointed at since M7.4.
// Until M9 builds the payment page on this same route,
// the door is in its holding state (REPORT_DOOR_STATE in
// lib/site.ts): a shell that names the home the link
// carried when it can, and renders its generic form when
// it cannot — a stale key falls back to the postcode's
// form, a failed directory read to the generic form,
// never an error page and never a guessed home. The
// page derives nothing from the check bundles, so a cold
// deep link renders whole. Journey-page conventions: no
// sitemap entry (D38 locks the SEO set); the TEST label
// arrives via the layout. M7.8 superseded the no-metadata
// convention: with per-page metadata moved into the pages,
// this route exports explicit noindex metadata like the
// rest of the journey family.

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
): Promise<ReportDoorIdentity> {
  if (!postcode) return { kind: "generic" };
  try {
    let resolution = await resolutionForRoute(postcode, homeKey);
    if (!resolution && homeKey) {
      // A key the directory no longer holds: the
      // postcode's own form, as the results route's
      // picker fallback does — never a guessed home.
      resolution = await resolutionForRoute(postcode, null);
    }
    if (!resolution) return { kind: "generic" };
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
    return { kind: "generic" };
  } catch {
    return { kind: "generic" };
  }
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ postcode?: string; home?: string }>;
}) {
  const params = await searchParams;
  const postcode = params.postcode ?? null;
  const identity = await identityFor(postcode, params.home ?? null);
  return <ReportDoorPage view={buildReportDoorView(identity)} />;
}
