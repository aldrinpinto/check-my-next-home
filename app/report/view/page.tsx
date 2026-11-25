import type { Metadata } from "next";
import { redirect } from "next/navigation";

import ReportPage from "../../../components/ReportPage";
import { nationOfLsoa } from "../../../lib/journey";
import { nationOfPostcode } from "../../../lib/nation";
import { buildReportView, reportViewGate } from "../../../lib/report";
import { effectiveReportDoorState } from "../../../lib/report-door";
import { reportRoute } from "../../../lib/results";
import { pageMetadata } from "../../../lib/seo";
import { verifyReportViewAccess } from "../../../lib/server/report-view-access";
import { checkReport, resolutionForRoute } from "../../../lib/server/serve";

// The bought report's page (plan step M8.1) — the
// buyer-route seam the later steps land on: this route,
// with the journey family's own parameters (?postcode=
// and &home=, as reportViewRoute in lib/report.ts builds
// them). M8.6's download links, M8.7's tester unlock and
// M9's payment wiring all arrive here; nothing later
// needs a second shape.
//
// THE DOOR HOLDS (M8.1 scope note (i)): while the
// door's state for this home is "holding", this page
// redirects to the report door for the same identity
// BEFORE any bundle is assembled — the complete report
// exists behind the door, and nobody can open one. The
// state is the EFFECTIVE one (M9.6, Road B): since the
// flip to "paid", England and Wales serve — and
// Scotland and Northern Ireland still hold, their
// nation read from the resolved directory's filed area
// code, so a held nation's report stays unopenable
// until its own milestone lifts the hold. An identity
// that no longer resolves falls back to the door too,
// never an error page and never a guessed home (the
// /report pattern).
//
// BUG-324 (25 Nov 2026): a paid door state alone no
// longer opens the report — the page also requires the
// delivery email's signed download token as ?token=,
// verified by lib/server/report-view-access.ts against
// the order behind it (the token genuine and in date,
// its delivery standing, its claim fulfilled for this
// home). A reader without one — a typed URL, a stale
// link, a token for another home — is sent to the door
// the same way, before any bundle is assembled.
export const metadata: Metadata = pageMetadata({
  title: "Detailed report | Check My Next Home",
  description: "The detailed report for the home you checked.",
  path: "/report/view",
  noindex: true,
});

export const dynamic = "force-dynamic";

export default async function ReportViewPage({
  searchParams,
}: {
  searchParams: Promise<{ postcode?: string; home?: string; token?: string }>;
}) {
  const params = await searchParams;
  const postcode = params.postcode ?? null;
  const homeKey = params.home ?? null;
  if (!postcode) redirect("/report");

  let resolution = await resolutionForRoute(postcode, homeKey).catch(() => null);
  if (!resolution && homeKey) {
    // A key the directory no longer holds: the postcode's
    // own report, as the door's fallback does — never a
    // guessed home.
    resolution = await resolutionForRoute(postcode, null).catch(() => null);
  }
  // BUG-324: the token is verified against the REQUESTED
  // identity (the URL's own postcode and home key), not
  // the resolved one — a token minted for another home,
  // or for the whole postcode where a home was named,
  // does not open this report. No token, no access; a
  // verification that cannot be read denies, never
  // serves.
  const token = params.token ?? null;
  const accessVerified = token
    ? await verifyReportViewAccess(token, postcode, homeKey).catch(() => false)
    : false;
  // The gate reads the effective state for the resolved
  // nation (an unresolved identity has no nation — the
  // checked-in state applies, and the resolution failure
  // below sends it to the door regardless).
  const gate = reportViewGate(
    postcode,
    homeKey,
    effectiveReportDoorState(
      resolution && (resolution.rung === 1 || resolution.rung === 2)
        ? (nationOfPostcode(resolution.directory.postcode) ??
            nationOfLsoa(resolution.directory.lsoaCode))
        : nationOfLsoa(null),
    ),
    accessVerified,
  );
  if (gate.action === "door") redirect(gate.href);
  if (!resolution || (resolution.rung !== 1 && resolution.rung !== 2))
    redirect(reportRoute(postcode, homeKey));

  const bundles = await checkReport(resolution);
  const view = buildReportView({ resolution, ...bundles, now: new Date() });
  // The .site-pages wrapper every other content page
  // carries (the sample report's page is the twin): the
  // rpt-* styles are scoped under it, so without it the
  // report renders unstyled the moment the door opens.
  return (
    <main className="site-pages">
      <div className="site-pages__inner">
        <ReportPage view={view} />
      </div>
    </main>
  );
}
