import { Suspense } from "react";
import { redirect } from "next/navigation";

import CheckingScreen from "../../../components/CheckingScreen";
import HomeList, { type PickerAddress } from "../../../components/HomeList";
import { CheckCompletedBeacon } from "../../../components/JourneyBeacon";
import ReportLink from "../../../components/ReportLink";
import ResultsPage from "../../../components/ResultsPage";
import ShortlistButton from "../../../components/ShortlistButton";
import WholeCheckFailure from "../../../components/WholeCheckFailure";
import { displayText, type AddressResolution } from "../../../lib/address";
import { homeKeyOf } from "../../../lib/bundle-cache";
import {
  CHECKING_HEADING_HOME,
  CHECKING_HEADING_POSTCODE,
  NOT_COVERED_INTRO,
  PICK_FALLBACK_FLAG,
  PICK_FALLBACK_LINE,
  SEARCH_ROUTE,
  homeRoute,
  nationOfLsoa,
  notCoveredHeading,
  widerAreaRoute,
} from "../../../lib/journey";
import { REPORT_PRICE_LABEL } from "../../../lib/site";
import { sectionsAndStatesOf } from "../../../lib/journey-events";
import { buildResultsView, resultsScopeLabel } from "../../../lib/results";
import {
  checkResults,
  pickerRowsFor,
  promoteTransientIfFiled,
  resolutionForPostcodeRoute,
  resolutionForRoute,
  resolutionNotCovered,
} from "../../../lib/server/serve";
import { logEntry, newRequestId } from "../../../lib/server/entry-log";
import { isResolveToken } from "../../../lib/server/resolve-records";
import { SITE_MANIFESTO } from "../../../lib/site";
import { buildShortlistCard } from "../../../lib/shortlist-card";
import type { ShortBundle } from "../../../lib/short-bundle";

import type { Metadata } from "next";

import { pageMetadata } from "../../../lib/seo";

// M7.8: explicit production noindex — see app/search/page.tsx.
// This is the results page itself: a specific home's facts,
// never an indexable page, in every environment.
export const metadata: Metadata = pageMetadata({
  title: "Your check | Check My Next Home",
  description: "The facts for the home you checked, from official sources.",
  path: "/search/home",
  noindex: true,
});

// The home form of the journey's route family (plan step
// M7.3, fold-in 1): /search/home carrying the normalised
// postcode and, for a picked home, its shareable key. The
// page re-derives the resolution from loaded data on every
// request — a refresh re-serves from the D29 cache; a stale
// or unknown key returns to that postcode's check (whose
// home list carries every home), never to a guessed home.
//
// M7.4: the checking screen's auto-advance lands on the real
// results page (components/ResultsPage.tsx over
// lib/results.ts's view model), server-rendered through the
// serve layer's results derivation — no client bundle
// fetch. Scotland / NI render the same results page here
// (ruling 4): postcode-level, the check never refused,
// every section carrying its served not-covered line in
// place, under the not-covered heading and intro.

export const dynamic = "force-dynamic";

// M7.14: the check's completion, counted from the served
// bundle itself — rung and nation from the resolution,
// the sections served and their named states from the
// short bundle (classes and state names only; the payload
// scan in lib/journey-events.ts proves the rest). The
// beacon renders inside the results, so it mounts — and
// fires — exactly when the results reach the visitor.
function completionBeacon(resolution: AddressResolution, short: ShortBundle) {
  const derived =
    short.kind === "short-bundle"
      ? sectionsAndStatesOf(short.sections as unknown as Record<string, unknown>)
      : { sections: Object.keys(short.sections), states: {} as Record<string, string> };
  // This page serves rungs 1–2 only (rung 3 lives on
  // /search, rung 4 redirects away); the wider union is
  // narrowed here so the nation's source — the
  // directory's LSOA — is only read where it exists.
  const nation =
    resolution.rung === 1 || resolution.rung === 2
      ? nationOfLsoa(resolution.directory.lsoaCode)
      : "unknown";
  return (
    <CheckCompletedBeacon
      rung={resolution.rung}
      nation={nation}
      sections={derived.sections}
      states={derived.states}
    />
  );
}

// The results half of the page, streamed in behind the
// checking screen: the derivation awaits the cached brains
// (the checking screen's own calls warm the same D29 cache
// in this process), and a derivation that fails outright is
// the whole-check failure state on this route (D44(7)) —
// the results route is the retry.
async function Results({
  postcode,
  homeKey,
  resolution,
  pickerAddresses,
  pickerHeading,
  pickFallback,
}: {
  postcode: string;
  homeKey: string | null;
  resolution: AddressResolution;
  pickerAddresses: PickerAddress[];
  pickerHeading: string;
  pickFallback: boolean;
}) {
  let view;
  let results;
  try {
    results = await checkResults(resolution);
    view = buildResultsView({ resolution, ...results, homeKey });
  } catch {
    return <WholeCheckFailure initialValue={postcode} />;
  }
  // M7.5: the shortlist card record, rung 1 only (ruling 4
  // — rung 2 has no home to shortlist, and the not-covered
  // branch below never reaches this component). The record
  // is assembled from this same derivation (fold-in 8).
  const card =
    resolution.rung === 1
      ? buildShortlistCard({
          resolution,
          nearby: results.nearby,
          sold: results.sold,
          short: results.short,
          routeKey: homeKey,
        })
      : null;
  // The results head (parity fix batch, items 5/6): the
  // Master's flex row — the H1 carrying the postcode
  // ("19 Birkdale Rise, CM3 2JT") with the manifesto line
  // under it, and at rung 1 the Shortlist control and the
  // priced report button level with it. The head renders
  // HERE, inside the results, so the checking screen
  // stands alone before it (item 2). The buy bar below
  // the tabs keeps its own unpriced button and control —
  // the Master carries both.
  const heading =
    resolution.rung === 1
      ? `${resolution.address.label}, ${postcode}`
      : resultsScopeLabel(resolution);
  return (
    <>
      <header className="results-head">
        <div className="head-text">
          <h1 className="page-title">{heading}</h1>
          {/* D77(b): the line under the Results heading is
              the manifesto line. */}
          <p className="results-manifesto-line">{SITE_MANIFESTO}</p>
        </div>
        {resolution.rung === 1 && (
          <div className="results-actions">
            {card && <ShortlistButton card={card} />}
            {view.reportHref && (
              <ReportLink className="report-btn" href={view.reportHref}>
                Get the full report — {REPORT_PRICE_LABEL}
              </ReportLink>
            )}
          </div>
        )}
      </header>
      {pickFallback && <p className="journey-notice">{PICK_FALLBACK_LINE}</p>}
      {resolution.rung === 2 && (
        <HomeList postcode={postcode} heading={pickerHeading} addresses={pickerAddresses} />
      )}
      <ResultsPage view={view} shortlistCard={card} />
      {completionBeacon(resolution, results.short)}
    </>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    postcode?: string;
    home?: string;
    notfound?: string;
    street?: string;
    building?: string;
  }>;
}) {
  const params = await searchParams;
  const postcode = params.postcode;
  if (!postcode) redirect(SEARCH_ROUTE);
  const homeKey = params.home ?? null;
  const req = newRequestId();

  // The narrowed form of this route (M7.15C, 18 Nov
  // 2026): a street pick lands here carrying the street
  // it picked. With no home key named, the ladder
  // re-derives the narrowed resolution from the route's
  // own parameters — the same derivation the postcode
  // form runs — so the check opens with its home list
  // already narrowed to the street, under the street's
  // name as its heading. A home key outranks the
  // narrowing entirely: a picked home is a picked home.
  let narrowed: AddressResolution | null = null;
  let resolution;
  try {
    if (!homeKey && (params.street || params.building)) {
      narrowed = await resolutionForPostcodeRoute(postcode, {
        street: params.street ?? null,
        building: params.building ?? null,
      });
    }
    resolution = await resolutionForRoute(postcode, homeKey, req);
  } catch {
    return <WholeCheckFailure initialValue={postcode} />;
  }
  if (!resolution) {
    // A key the directory no longer holds: back to the
    // postcode's own check, whose home list carries every
    // home (fold-in 1; the picker page it used to name was
    // removed 18 Nov 2026).
    if (homeKey) redirect(homeRoute(postcode));
    redirect(SEARCH_ROUTE);
  }
  if (narrowed?.rung === 1) {
    // The narrowing named one home outright (a building
    // that is a single home): its own check, canonically.
    redirect(homeRoute(postcode, homeKeyOf(narrowed)));
  }
  if (narrowed?.rung === 2) resolution = narrowed;
  if (resolution.rung === 3) redirect(widerAreaRoute(resolution.outward, postcode));
  if (resolution.rung === 4) redirect(SEARCH_ROUTE);

  // The identity the URLs on this page carry: a transient
  // token while the home is Postio-only, its home key once
  // it is filed (entry-point build, D72).
  const viaToken = homeKey !== null && isResolveToken(homeKey);
  if (viaToken && resolution.rung === 1) {
    // Promotion: the pick's own check cold-loads the
    // postcode's filings; once the home is among them, the
    // canonical home key takes over the URL and the
    // transient record lapses.
    const promoted = await promoteTransientIfFiled(postcode, homeKey, resolution, req).catch(
      () => null,
    );
    if (promoted) redirect(homeRoute(postcode, promoted));
  }
  const routeKey = viaToken ? homeKey : resolution.rung === 1 ? homeKeyOf(resolution) : null;

  // The mid-pick fallback notice (D72 item 3): a pick that
  // degraded to this postcode-level page is announced;
  // degradation before any pick never sets the flag.
  const pickFallback = params.notfound === PICK_FALLBACK_FLAG && !homeKey;
  if (pickFallback) {
    logEntry(req, "fallback.notice", {
      layer: "fallback",
      reason: "pick-unresolved",
      postcode,
    });
  }

  if (resolutionNotCovered(resolution)) {
    let view;
    let results;
    try {
      results = await checkResults(resolution);
      view = buildResultsView({ resolution, ...results, homeKey });
    } catch {
      return <WholeCheckFailure initialValue={postcode} />;
    }
    const nation = nationOfLsoa(resolution.directory.lsoaCode);
    return (
      <main className="journey-page main--wide">
        <h1>{notCoveredHeading(postcode, nation)}</h1>
        <p className="results-manifesto-line">{SITE_MANIFESTO}</p>
        <p className="type-lead">{NOT_COVERED_INTRO}</p>
        <ResultsPage view={view} />
        {completionBeacon(resolution, results.short)}
      </main>
    );
  }

  const pickerAddresses: PickerAddress[] =
    resolution.rung === 2
      ? await pickerRowsFor(
          postcode,
          resolution.addresses,
          { street: resolution.street, building: resolution.building },
          req,
        )
          .then((rows) =>
            rows.map((row) => ({
              key: row.key,
              label: row.label,
              source: row.source,
              udprn: row.udprn,
            })),
          )
          .catch(() =>
            resolution.addresses.map((address) => ({
              key: homeKeyOf({ rung: 1, kind: "home", address, directory: resolution.directory }),
              label: address.label,
            })),
          )
      : [];
  const pickerHeading =
    resolution.rung === 2
      ? (resolution.building ?? (resolution.street ? displayText(resolution.street) : postcode))
      : "";

  // The checking screen's eyebrow (item 2): the address
  // label and town at rung 1; the postcode alone at rung 2.
  const eyebrow =
    resolution.rung === 1
      ? {
          lead: resolution.address.label,
          town: resolution.address.town ? displayText(resolution.address.town) : null,
        }
      : { lead: postcode, town: null };

  return (
    <main className="journey-page main--wide">
      {/* Item 2 (parity fix batch): nothing of the results
          shell renders above the checking screen — the
          results head, the fallback notice and the home
          list all render inside Results, after the check
          completes. */}
      <CheckingScreen
        postcode={postcode}
        homeKey={routeKey}
        heading={resolution.rung === 1 ? CHECKING_HEADING_HOME : CHECKING_HEADING_POSTCODE}
        eyebrow={eyebrow}
      >
        <Suspense fallback={<p className="results-loading">Opening your results…</p>}>
          <Results
            postcode={postcode}
            homeKey={routeKey}
            resolution={resolution}
            pickerAddresses={pickerAddresses}
            pickerHeading={pickerHeading}
            pickFallback={pickFallback}
          />
        </Suspense>
      </CheckingScreen>
    </main>
  );
}
