import { Suspense } from "react";
import { redirect } from "next/navigation";

import AddressPicker, { type PickerAddress } from "../../../components/AddressPicker";
import CheckingScreen from "../../../components/CheckingScreen";
import ResultsPage from "../../../components/ResultsPage";
import ShortlistButton from "../../../components/ShortlistButton";
import WholeCheckFailure from "../../../components/WholeCheckFailure";
import { displayText, type AddressResolution } from "../../../lib/address";
import { homeKeyOf } from "../../../lib/bundle-cache";
import {
  CHECKING_HEADING_HOME,
  CHECKING_HEADING_POSTCODE,
  NOT_COVERED_INTRO,
  SEARCH_ROUTE,
  homeRoute,
  nationOfLsoa,
  notCoveredHeading,
  postcodeRoute,
  widerAreaRoute,
} from "../../../lib/journey";
import { buildResultsView, resultsScopeLabel } from "../../../lib/results";
import { checkResults, resolutionForRoute, resolutionNotCovered } from "../../../lib/server/serve";
import { buildShortlistCard } from "../../../lib/shortlist-card";

// The home form of the journey's route family (plan step
// M7.3, fold-in 1): /search/home carrying the normalised
// postcode and, for a picked home, its shareable key. The
// page re-derives the resolution from loaded data on every
// request — a refresh re-serves from the D29 cache; a stale
// or unknown key returns to that postcode's picker, never
// to a guessed home.
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
}: {
  postcode: string;
  homeKey: string | null;
  resolution: AddressResolution;
  pickerAddresses: PickerAddress[];
  pickerHeading: string;
}) {
  let view;
  let results;
  try {
    results = await checkResults(resolution);
    view = buildResultsView({ resolution, ...results });
  } catch {
    return <WholeCheckFailure retryHref={homeRoute(postcode, homeKey)} />;
  }
  // M7.5: the shortlist add control, rung 1 only (ruling 4
  // — rung 2 has no home to shortlist, and the not-covered
  // branch below never reaches this component). The card
  // record is assembled from this same derivation and
  // embedded in the control at render (fold-in 8); it sits
  // in the results header area, directly under the page
  // header, because the record exists only once the
  // derivation has run.
  const card =
    resolution.rung === 1
      ? buildShortlistCard({
          resolution,
          nearby: results.nearby,
          sold: results.sold,
          short: results.short,
        })
      : null;
  return (
    <>
      {resolution.rung === 2 && (
        <AddressPicker postcode={postcode} heading={pickerHeading} addresses={pickerAddresses} />
      )}
      {card && (
        <div className="results-actions">
          <ShortlistButton card={card} />
        </div>
      )}
      <ResultsPage view={view} />
    </>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ postcode?: string; home?: string }>;
}) {
  const params = await searchParams;
  const postcode = params.postcode;
  if (!postcode) redirect(SEARCH_ROUTE);
  const homeKey = params.home ?? null;

  let resolution;
  try {
    resolution = await resolutionForRoute(postcode, homeKey);
  } catch {
    return <WholeCheckFailure retryHref={homeRoute(postcode, homeKey)} />;
  }
  if (!resolution) {
    // A key the directory no longer holds: back to the
    // picker for this postcode (fold-in 1).
    if (homeKey) redirect(postcodeRoute(postcode));
    redirect(SEARCH_ROUTE);
  }
  if (resolution.rung === 3) redirect(widerAreaRoute(resolution.outward, postcode));
  if (resolution.rung === 4) redirect(SEARCH_ROUTE);

  if (resolutionNotCovered(resolution)) {
    let view;
    try {
      const results = await checkResults(resolution);
      view = buildResultsView({ resolution, ...results });
    } catch {
      return <WholeCheckFailure retryHref={homeRoute(postcode, homeKey)} />;
    }
    const nation = nationOfLsoa(resolution.directory.lsoaCode);
    return (
      <main className="journey-page main--wide">
        <h1>{notCoveredHeading(postcode, nation)}</h1>
        <p className="type-lead">{NOT_COVERED_INTRO}</p>
        <ResultsPage view={view} />
      </main>
    );
  }

  const heading = resolution.rung === 1 ? resolution.address.label : resultsScopeLabel(resolution);
  const backHref =
    resolution.rung === 1
      ? postcodeRoute(postcode, { picked: homeKeyOf(resolution) })
      : postcodeRoute(postcode);
  const pickerAddresses: PickerAddress[] =
    resolution.rung === 2
      ? resolution.addresses.map((address) => ({
          key: homeKeyOf({ rung: 1, kind: "home", address, directory: resolution.directory }),
          label: address.label,
        }))
      : [];
  const pickerHeading =
    resolution.rung === 2
      ? (resolution.building ?? (resolution.street ? displayText(resolution.street) : postcode))
      : "";

  return (
    <main className="journey-page main--wide">
      <header className="results-header">
        <h1>{heading}</h1>
        {resolution.rung === 1 && (
          <p className="results-header__scope">{resultsScopeLabel(resolution)}</p>
        )}
      </header>
      <CheckingScreen
        postcode={postcode}
        homeKey={resolution.rung === 1 ? homeKeyOf(resolution) : null}
        heading={resolution.rung === 1 ? CHECKING_HEADING_HOME : CHECKING_HEADING_POSTCODE}
        backHref={backHref}
      >
        <Suspense fallback={<p className="results-loading">Opening your results…</p>}>
          <Results
            postcode={postcode}
            homeKey={resolution.rung === 1 ? homeKeyOf(resolution) : null}
            resolution={resolution}
            pickerAddresses={pickerAddresses}
            pickerHeading={pickerHeading}
          />
        </Suspense>
      </CheckingScreen>
    </main>
  );
}
