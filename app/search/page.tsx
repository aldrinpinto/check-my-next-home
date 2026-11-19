import { Suspense } from "react";
import { redirect } from "next/navigation";

import { CheckCompletedBeacon } from "../../components/JourneyBeacon";
import DistrictCheckingScreen from "../../components/DistrictCheckingScreen";
import PlaceChoice from "../../components/PlaceChoice";
import PostcodeBox from "../../components/PostcodeBox";
import ResultsPage from "../../components/ResultsPage";
import StreetChoice from "../../components/StreetChoice";
import WholeCheckFailure from "../../components/WholeCheckFailure";
import {
  classifyAddressInput,
  createAddressSource,
  displayText,
  resolveAddressInput,
  type AddressResolution,
} from "../../lib/address";
import { homeKeyOf } from "../../lib/bundle-cache";
import {
  UNPLACED_NOTICE_URL,
  WIDER_AREA_BANNER_HEADING,
  WIDER_AREA_BANNER_LINE,
  homeRoute,
  narrowedHomeRoute,
  postcodeNotFoundLine,
  postcodeRoute,
  widerAreaRoute,
} from "../../lib/journey";
import { sectionsAndStatesOf } from "../../lib/journey-events";
import { buildDistrictResultsView, buildWiderAreaView } from "../../lib/results";
import {
  checkDistrictWider,
  placeChoiceUrl,
  resolutionForPostcodeRoute,
} from "../../lib/server/serve";
import { getDbPool } from "../../lib/server/db";
import { createPlaceSource, placeNormOf } from "../../lib/server/places";
import { createStreetSource, streetNormOf } from "../../lib/server/streets";

import type { Metadata } from "next";

import { pageMetadata } from "../../lib/seo";

// M7.8: explicit production noindex for the journey's
// routes. A specific search's results are one family's
// check, never an indexable page — until this step the
// production build would have indexed them (the old
// environment rule only locked non-production builds).
// noindex here is unconditional: it holds in every
// environment, production included.
export const metadata: Metadata = pageMetadata({
  title: "Your check | Check My Next Home",
  description: "The facts for the home you checked, from official sources.",
  path: "/search",
  noindex: true,
});

// The postcode form of the journey's route family (plan
// step M7.3, fold-in 1): /search carrying an outward code
// renders the wider-area landing (rung 3); carrying a full
// postcode it redirects to that postcode's check (the home
// check at rung 1, the whole-postcode check at rung 2) —
// the picker page that used to render here was removed by
// the founder's ruling of 18 Nov 2026, its home list moved
// onto the whole-postcode check; carrying nothing it
// redirects to the landing page with the unplaced notice —
// the standalone no-location page was retired by the same
// day's earlier ruling (an input that can't be placed
// returns to the landing page with a small notice at its
// search box, never a page of its own). Since M7.15C it
// also carries the street form: a street picked from the
// dropdown that spans postcodes arrives as (street, town)
// and renders the short postcode choice (or redirects to
// the one postcode's narrowed check when the street sits
// in exactly one). Since the founder's ruling of 19 Nov
// 2026 it carries the place form the same way: a place
// picked from the dropdown arrives as (place) and renders
// the district choice (or redirects to the one district's
// wider-area search when the place serves exactly one).

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    postcode?: string;
    outward?: string;
    notfound?: string;
    street?: string;
    town?: string;
    building?: string;
    picked?: string;
    place?: string;
  }>;
}) {
  const params = await searchParams;

  if (params.outward) {
    // The wider-area landing (rung 3): the scope label is
    // the resolution's own; a typed full postcode the
    // directory does not hold adds its not-found line.
    // England & Wales districts render the district page
    // (18 Nov 2026 ruling); Scotland / NI keep the M7.4
    // rung-3 form — unlock banner over the named-state
    // results page, no this-home figures, no report.
    let resolution;
    try {
      resolution = await resolveAddressInput(params.outward, createAddressSource(getDbPool()));
    } catch {
      return <WholeCheckFailure initialValue={params.outward} />;
    }
    if (resolution.rung !== 3) {
      // Not a wider area: a full postcode that arrived in
      // the outward slot re-enters through the postcode
      // form (which re-decides its rung); anything
      // unplaceable returns to the landing page — with
      // one exception (founder fix batch, 19 Nov 2026):
      // an input that exactly names a known place is not
      // unplaceable, it is a place pick that arrived by
      // URL, and it lands on the place page — never the
      // unplaced notice, never a failure page.
      if (resolution.rung === 4) {
        const placeUrl = await placeChoiceUrl(params.outward);
        redirect(placeUrl ?? UNPLACED_NOTICE_URL);
      }
      if (resolution.rung === 1)
        redirect(homeRoute(resolution.directory.postcode, homeKeyOf(resolution)));
      redirect(homeRoute(resolution.directory.postcode));
    }
    // The wider-area checking screen (founder ruling,
    // 19 Nov 2026): the district results stream in
    // behind the screen, which holds them until its
    // payload settles and its four groups complete —
    // the home page's held reveal, on the district
    // page. The screen's payload call and the streamed
    // results share one bundle build (the district
    // cache's single-flight), so the lines the screen
    // lands are the results' own facts.
    return (
      <main className="journey-page main--wide">
        <DistrictCheckingScreen outward={resolution.outward}>
          <Suspense fallback={<p className="results-loading">Opening your results…</p>}>
            <DistrictResults resolution={resolution} notfound={params.notfound} />
          </Suspense>
        </DistrictCheckingScreen>
      </main>
    );
  }

  if (params.street && !params.postcode) {
    // The street choice (M7.15C, 18 Nov 2026): a street
    // picked from the dropdown that spans postcodes
    // lands here as (street, town). The street table
    // answers which postcodes it sits in: none — the
    // pick named a street we hold nothing on now — the
    // unplaced notice; exactly one — straight to that
    // postcode's check, narrowed to the street (the
    // postcode form below re-decides it); several — the
    // short choice, in the picker's list style. The
    // parameters carry display forms; the lookup
    // normalises them against the filed table, so a
    // hand-typed variant of this URL resolves against
    // filed fact, never against its own text.
    let rows;
    try {
      rows = await createStreetSource(getDbPool()).streetPostcodes(
        streetNormOf(params.street),
        streetNormOf(params.town ?? ""),
      );
    } catch {
      return <WholeCheckFailure initialValue={displayText(params.street)} />;
    }
    if (rows.length === 0) redirect(UNPLACED_NOTICE_URL);
    if (rows.length === 1) {
      redirect(postcodeRoute(rows[0].postcode, { street: rows[0].street }));
    }
    return (
      <StreetChoice
        street={displayText(params.street)}
        town={params.town ? displayText(params.town) : null}
        rows={rows}
      />
    );
  }

  if (params.place && !params.postcode && !params.outward && !params.street) {
    // The place page (founder ruling, 19 Nov 2026,
    // reversing the 18 Nov in-dropdown chooser): a place
    // picked from the dropdown — or a bare place name the
    // serve layer routed here — lands on the place's own
    // page, the street choice's twin. The place table
    // answers which districts it serves: none — the pick
    // named a place we hold no served district on now —
    // the unplaced notice; exactly one — straight to that
    // district's wider-area search (the street choice's
    // one-postcode rule); several — the choice, in the
    // picker's list style, ALL of the districts with no
    // cap. The parameter carries the display form; the
    // lookup normalises it against the filed table, so a
    // hand-typed variant of this URL resolves against
    // filed fact, never against its own text. The heading
    // is the FILED place's display form, as the street
    // page's heading is the filed street's.
    let place;
    try {
      place = await createPlaceSource(getDbPool()).placeByNorm(placeNormOf(params.place));
    } catch {
      return <WholeCheckFailure initialValue={displayText(params.place)} />;
    }
    if (!place || place.districts.length === 0) redirect(UNPLACED_NOTICE_URL);
    if (place.districts.length === 1) redirect(widerAreaRoute(place.districts[0]));
    // The rows' area descriptions and the bridge's
    // example postcode (fix batch, 19 Nov 2026 —
    // BUG-026/BUG-027): one set read over the place's
    // districts. The read is furniture, not the page's
    // substance — a failure degrades to bare rows and a
    // form-only bridge, never to the failure page.
    const areas = await createPlaceSource(getDbPool())
      .districtAreas(place.districts)
      .catch(() =>
        place.districts.map((outward) => ({
          outward,
          settlements: [] as string[],
          examplePostcode: null,
        })),
      );
    return <PlaceChoice place={displayText(place.place)} districts={areas} />;
  }

  if (!params.postcode) redirect(UNPLACED_NOTICE_URL);

  // The postcode parameter is normalised before ANY use
  // (fix batch, 19 Nov 2026 — BUG-031): the resolver
  // uppercases internally for its own decision, but the
  // raw parameter used to leak into this route's
  // redirects — /search/home's directory lookup is
  // case-sensitive, so a lowercase ?postcode=cm3+2jt
  // resolved here and then failed there, landing the
  // visitor on the couldn't-place notice. The outward
  // route never had the defect because it carries no
  // postcode onward. An input that does not parse as a
  // full postcode keeps its raw form — the branches
  // below decide its rung (a bare place name routes to
  // the place page, anything else to the notice).
  const postcode = classifyAddressInput(params.postcode).postcode ?? params.postcode;
  let resolution;
  try {
    resolution = await resolutionForPostcodeRoute(postcode, {
      street: params.street ?? null,
      building: params.building ?? null,
    });
  } catch {
    return <WholeCheckFailure initialValue={postcode} />;
  }

  if (resolution.rung === 1) {
    redirect(homeRoute(postcode, homeKeyOf(resolution)));
  }
  if (resolution.rung === 3) {
    redirect(widerAreaRoute(resolution.outward, postcode));
  }
  if (resolution.rung === 4) {
    // A bare place name in the postcode slot (founder fix
    // batch): a known place routes to the place page —
    // the same graceful route as the outward slot's.
    const placeUrl = await placeChoiceUrl(postcode);
    redirect(placeUrl ?? UNPLACED_NOTICE_URL);
  }

  // Rung 2. Founder ruling, 18 Nov 2026 (parity fix
  // batch): the picker page is REMOVED — this route
  // redirects to the whole-postcode check, which carries
  // the postcode's full home list itself (the picker's
  // list, moved). Old links and bookmarks to
  // /search?postcode=… land on the check, never a 404.
  // Scotland / NI take the same redirect (ruling 4's
  // destination was always the home route).
  //
  // M7.15C: a resolution carrying a street (or building)
  // narrowing — a street pick's landing — keeps it: the
  // redirect names the narrowed home route, so the
  // check opens with its list already narrowed to the
  // street, as the adopted design rules.
  if (resolution.street || resolution.building) {
    redirect(
      narrowedHomeRoute(postcode, {
        street: resolution.street,
        building: resolution.building,
      }),
    );
  }
  redirect(homeRoute(postcode));
}

// The wider-area results, streamed in behind the
// checking screen: the district page (England & Wales)
// and the Scotland / NI not-covered form, exactly as
// this route served them before the screen — the same
// serves, the same views, the same completion beacons.
// A serve that throws renders the whole-check failure
// in place of the results (the home page's Results
// pattern).
async function DistrictResults({
  resolution,
  notfound,
}: {
  resolution: Extract<AddressResolution, { rung: 3 }>;
  notfound?: string;
}) {
  let served;
  try {
    served = await checkDistrictWider(resolution);
  } catch {
    return <WholeCheckFailure initialValue={resolution.outward} />;
  }
  const { short, district } = served;
  // District and not-covered surfaces carry NO shortlist
  // control (D40; fix batch, 19 Nov 2026 — BUG-018): the
  // earlier batch took the control off the England /
  // Wales district page, and this batch takes it off the
  // Scotland / NI not-covered branch below too — a
  // not-covered page has no home and no facts to save,
  // and its only forward path is the full-postcode
  // search in the unlock banner. Wider-area cards filed
  // before the removal still render on the shortlist
  // page from storage; nothing here builds a new one.
  if (district.kind === "district") {
    // The district page (founder ruling, 18 Nov 2026):
    // the results page's own layout system — same shell,
    // heading block and four D76 tabs — carrying the
    // district's twelve sections at district grain. No
    // unlock banner and no upsell anywhere: the only
    // forward path is the bridge into a full-postcode
    // check, rendered by the view after the tabs.
    const view = buildDistrictResultsView(district);
    const head = district.head;
    const councilsChip =
      head.councils.length === 0
        ? null
        : head.councils.length === 1
          ? head.councils[0]
          : `Straddles ${head.councils.join(" & ")} councils`;
    // The first chip is the county, in the sample's
    // form (founder fix batch — audit item 4): the
    // build used to serve the region here, a recorded
    // departure; the sample's chip is the county the
    // district's sales rows file. Several counties
    // straddle in the councils chip's own form; no
    // filed county, no chip.
    const countyChip =
      head.counties.length === 0
        ? null
        : head.counties.length === 1
          ? head.counties[0]
          : `Straddles ${head.counties.join(" & ")} counties`;
    return (
      <>
        <header className="results-head">
          <div className="head-text">
            {/* The sample's head (founder fix batch —
                audit items 2 and 3): the addr-line above
                the H1, and the H1 in the sample's own
                form. The not-this-home meaning rides in
                the scope line below, verbatim, exactly
                as it always has. */}
            <p className="addr-line">
              Wider area · <b>Postcode district</b>
            </p>
            <h1 className="page-title">Wider area — {resolution.outward}</h1>
            <p className="results-scope-line">
              Facts about the {resolution.outward} district as a whole — not about one home. For one
              home, check its full postcode.
            </p>
            <div className="district-chips">
              {countyChip && <span className="chip">{countyChip}</span>}
              {head.postTown && <span className="chip">Part of {head.postTown} post town</span>}
              {councilsChip && <span className="chip">{councilsChip}</span>}
              <span className="chip">Grain: whole district</span>
            </div>
          </div>
        </header>
        {notfound && <p className="journey-notice">{postcodeNotFoundLine(notfound)}</p>}
        <ResultsPage view={view} />
        {/* M7.14: the wider-area check's completion —
            rung 3, the nation from the district head's
            own region (the collapse the head itself
            makes: "Wales" is Welsh, any other filed
            region English, none recorded as unknown),
            the sections and their named states from the
            district bundle (the bridge is a hand-off,
            not a section, and is not counted as one). */}
        <CheckCompletedBeacon
          rung={3}
          nation={head.region === "Wales" ? "wales" : head.region ? "england" : "unknown"}
          sections={Object.keys(district.sections).filter((key) => key !== "bridge")}
          states={
            sectionsAndStatesOf(
              Object.fromEntries(
                Object.entries(district.sections).filter(([key]) => key !== "bridge"),
              ),
            ).states
          }
        />
      </>
    );
  }
  // Scotland / Northern Ireland keep the rung-3 form
  // whole (Phase 3 owns their district treatment): the
  // unlock banner above the results page in its rung-3
  // named-state form.
  const view = buildWiderAreaView(short);
  return (
    <>
      <header className="results-header results-header--row">
        <h1>{resolution.label}</h1>
      </header>
      {notfound && <p className="journey-notice">{postcodeNotFoundLine(notfound)}</p>}
      <section className="unlock-banner">
        <h2>{WIDER_AREA_BANNER_HEADING}</h2>
        <p>{WIDER_AREA_BANNER_LINE}</p>
        <PostcodeBox autoFocus bare />
      </section>
      <ResultsPage view={view} />
      {/* M7.14: a Scotland / NI wider-area serve counts
          as a completed rung-3 check too — its nation is
          the bundle's own, and its sections carry their
          named not-covered states. This counting is the
          demand evidence Phase 3 sequences from. */}
      {district.kind === "not-covered" && (
        <CheckCompletedBeacon
          rung={3}
          nation={district.nation}
          sections={sectionsAndStatesOf(short.sections as Record<string, unknown>).sections}
          states={sectionsAndStatesOf(short.sections as Record<string, unknown>).states}
        />
      )}
    </>
  );
}
