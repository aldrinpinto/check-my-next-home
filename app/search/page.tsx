import { redirect } from "next/navigation";

import AddressPicker, { type PickerAddress } from "../../components/AddressPicker";
import PostcodeBox from "../../components/PostcodeBox";
import ResultsPage from "../../components/ResultsPage";
import ShortlistButton from "../../components/ShortlistButton";
import WholeCheckFailure from "../../components/WholeCheckFailure";
import { createAddressSource, displayText, resolveAddressInput } from "../../lib/address";
import { homeKeyOf } from "../../lib/bundle-cache";
import {
  UNPLACED_NOTICE_URL,
  WIDER_AREA_BANNER_HEADING,
  WIDER_AREA_BANNER_LINE,
  homeRoute,
  postcodeNotFoundLine,
  postcodeRoute,
  widerAreaRoute,
} from "../../lib/journey";
import { buildWiderAreaView } from "../../lib/results";
import {
  checkResultsWider,
  pickerRowsFor,
  resolutionForPostcodeRoute,
  resolutionNotCovered,
} from "../../lib/server/serve";
import { newRequestId } from "../../lib/server/entry-log";
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
// step M7.3, fold-in 1): /search carrying the normalised
// postcode renders the picker or the postcode-level state;
// carrying an outward code it renders the wider-area
// landing (rung 3); carrying nothing it redirects to the
// landing page with the unplaced notice — the standalone
// no-location page was retired by the founder's ruling of
// 18 Nov 2026 (an input that can't be placed returns to
// the landing page with a small notice at its search box,
// never a page of its own). Server-rendered from the
// frozen ladder — the page never guesses an address: a
// narrowing rides as the filed street / display building
// and the brain re-decides the list.

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
      redirect(postcodeRoute(resolution.directory.postcode));
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

  // Rung 2. Scotland / NI never render a picker (ruling 4).
  if (resolutionNotCovered(resolution)) redirect(homeRoute(postcode));

  const heading =
    resolution.building ?? (resolution.street ? displayText(resolution.street) : postcode);
  // The hybrid list (entry-point build, D72): the ladder's
  // local rows, Postio's supplement merged in when
  // the local list is short — one list, deduplicated, in
  // natural address order. A
  // merge that fails outright degrades to the local rows:
  // the picker must never dead-end on the backstop.
  let addresses: PickerAddress[];
  try {
    const rows = await pickerRowsFor(
      postcode,
      resolution.addresses,
      { street: resolution.street, building: resolution.building },
      newRequestId(),
    );
    addresses = rows.map((row) => ({
      key: row.key,
      label: row.label,
      source: row.source,
      udprn: row.udprn,
    }));
  } catch {
    addresses = resolution.addresses.map((address) => ({
      key: homeKeyOf({ rung: 1, kind: "home", address, directory: resolution.directory }),
      label: address.label,
    }));
  }

  return (
    <main className="journey-page main--wide">
      <AddressPicker
        postcode={postcode}
        heading={heading}
        headingLevel={1}
        addresses={addresses}
        pickedKey={params.picked ?? null}
      />
    </main>
  );
}
