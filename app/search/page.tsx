import { redirect } from "next/navigation";

import PostcodeBox from "../../components/PostcodeBox";
import ResultsPage from "../../components/ResultsPage";
import ShortlistButton from "../../components/ShortlistButton";
import StreetChoice from "../../components/StreetChoice";
import WholeCheckFailure from "../../components/WholeCheckFailure";
import { createAddressSource, displayText, resolveAddressInput } from "../../lib/address";
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
import { buildDistrictResultsView, buildWiderAreaView } from "../../lib/results";
import { checkDistrictWider, resolutionForPostcodeRoute } from "../../lib/server/serve";
import { buildShortlistCard } from "../../lib/shortlist-card";
import { getDbPool } from "../../lib/server/db";
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
// in exactly one).

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
      return <WholeCheckFailure />;
    }
    if (resolution.rung !== 3) {
      // Not a wider area: a full postcode that arrived in
      // the outward slot re-enters through the postcode
      // form (which re-decides its rung); anything
      // unplaceable returns to the landing page with the
      // unplaced notice (the retired no-location page's
      // replacement, 18 Nov 2026).
      if (resolution.rung === 4) redirect(UNPLACED_NOTICE_URL);
      if (resolution.rung === 1)
        redirect(homeRoute(resolution.directory.postcode, homeKeyOf(resolution)));
      redirect(homeRoute(resolution.directory.postcode));
    }
    let served;
    try {
      served = await checkDistrictWider(resolution);
    } catch {
      return <WholeCheckFailure retryHref={widerAreaRoute(resolution.outward, params.notfound)} />;
    }
    const { short, district } = served;
    // M7.5: a wider-area result is shortlistable (D44) —
    // its card carries the wider-area headline facts
    // under the scope label and counts toward the 3. The
    // record is assembled from this same derivation and
    // embedded in the control beside the scope label
    // (fold-in 8).
    const card = buildShortlistCard({ resolution, short });
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
      return (
        <main className="journey-page main--wide">
          <header className="results-head">
            <div className="head-text">
              <h1 className="page-title">{resolution.label}</h1>
              <p className="results-scope-line">
                Facts about the {resolution.outward} district as a whole — not about one home. For
                one home, check its full postcode.
              </p>
              <div className="district-chips">
                {head.region && <span className="chip">{head.region}</span>}
                {head.postTown && <span className="chip">Part of {head.postTown} post town</span>}
                {councilsChip && <span className="chip">{councilsChip}</span>}
                <span className="chip">Grain: whole district</span>
              </div>
            </div>
            {card && (
              <div className="results-actions">
                <ShortlistButton card={card} />
              </div>
            )}
          </header>
          {params.notfound && (
            <p className="journey-notice">{postcodeNotFoundLine(params.notfound)}</p>
          )}
          <ResultsPage view={view} />
        </main>
      );
    }
    // Scotland / Northern Ireland keep the rung-3 form
    // whole (Phase 3 owns their district treatment): the
    // unlock banner above the results page in its rung-3
    // named-state form.
    const view = buildWiderAreaView(short);
    return (
      <main className="journey-page main--wide">
        <header className="results-header results-header--row">
          <h1>{resolution.label}</h1>
          {card && <ShortlistButton card={card} />}
        </header>
        {params.notfound && (
          <p className="journey-notice">{postcodeNotFoundLine(params.notfound)}</p>
        )}
        <section className="unlock-banner">
          <h2>{WIDER_AREA_BANNER_HEADING}</h2>
          <p>{WIDER_AREA_BANNER_LINE}</p>
          <PostcodeBox autoFocus />
        </section>
        <ResultsPage view={view} />
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
      return <WholeCheckFailure />;
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

  if (!params.postcode) redirect(UNPLACED_NOTICE_URL);

  const postcode = params.postcode;
  let resolution;
  try {
    resolution = await resolutionForPostcodeRoute(postcode, {
      street: params.street ?? null,
      building: params.building ?? null,
    });
  } catch {
    return <WholeCheckFailure />;
  }

  if (resolution.rung === 1) {
    redirect(homeRoute(postcode, homeKeyOf(resolution)));
  }
  if (resolution.rung === 3) {
    redirect(widerAreaRoute(resolution.outward, postcode));
  }
  if (resolution.rung === 4) {
    redirect(UNPLACED_NOTICE_URL);
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
