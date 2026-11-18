import { redirect } from "next/navigation";

import PostcodeBox from "../../components/PostcodeBox";
import ResultsPage from "../../components/ResultsPage";
import ShortlistButton from "../../components/ShortlistButton";
import WholeCheckFailure from "../../components/WholeCheckFailure";
import { createAddressSource, resolveAddressInput } from "../../lib/address";
import { homeKeyOf } from "../../lib/bundle-cache";
import {
  UNPLACED_NOTICE_URL,
  WIDER_AREA_BANNER_HEADING,
  WIDER_AREA_BANNER_LINE,
  homeRoute,
  postcodeNotFoundLine,
  widerAreaRoute,
} from "../../lib/journey";
import { buildWiderAreaView } from "../../lib/results";
import { checkResultsWider, resolutionForPostcodeRoute } from "../../lib/server/serve";
import { buildShortlistCard } from "../../lib/shortlist-card";
import { getDbPool } from "../../lib/server/db";

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
// search box, never a page of its own).

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    postcode?: string;
    outward?: string;
    notfound?: string;
    street?: string;
    building?: string;
    picked?: string;
  }>;
}) {
  const params = await searchParams;

  if (params.outward) {
    // The wider-area landing (rung 3): the scope label is
    // the resolution's own; a typed full postcode the
    // directory does not hold adds its not-found line.
    // M7.4: below the unlock banner the same results page
    // renders in its rung-3 form — every section its named
    // state, no this-home figures, no this-home report
    // offered (ruling 3).
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
    let view;
    let card;
    try {
      const { short } = await checkResultsWider(resolution);
      view = buildWiderAreaView(short);
      // M7.5: a wider-area result is shortlistable (D44) —
      // its card carries the wider-area headline facts
      // under the scope label and counts toward the 3. The
      // record is assembled from this same derivation and
      // embedded in the control beside the scope label
      // (fold-in 8).
      card = buildShortlistCard({ resolution, short });
    } catch {
      return <WholeCheckFailure retryHref={widerAreaRoute(resolution.outward, params.notfound)} />;
    }
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
  redirect(homeRoute(postcode));
}
