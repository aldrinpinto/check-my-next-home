import { redirect } from "next/navigation";

import AddressPicker, { type PickerAddress } from "../../components/AddressPicker";
import PostcodeBox from "../../components/PostcodeBox";
import ResultsPage from "../../components/ResultsPage";
import ShortlistButton from "../../components/ShortlistButton";
import WholeCheckFailure from "../../components/WholeCheckFailure";
import { createAddressSource, displayText, resolveAddressInput } from "../../lib/address";
import { homeKeyOf } from "../../lib/bundle-cache";
import {
  NO_LOCATION_HEADING,
  NO_LOCATION_LINE,
  WIDER_AREA_BANNER_HEADING,
  WIDER_AREA_BANNER_LINE,
  homeRoute,
  postcodeNotFoundLine,
  widerAreaRoute,
} from "../../lib/journey";
import { buildWiderAreaView } from "../../lib/results";
import {
  checkResultsWider,
  resolutionForPostcodeRoute,
  resolutionNotCovered,
} from "../../lib/server/serve";
import { buildShortlistCard } from "../../lib/shortlist-card";
import { getDbPool } from "../../lib/server/db";

// The postcode form of the journey's route family (plan
// step M7.3, fold-in 1): /search carrying the normalised
// postcode renders the picker or the postcode-level state;
// carrying an outward code it renders the wider-area
// landing (rung 3); carrying nothing it is the no-location
// fix route only (T-WEB-09). Server-rendered from the
// frozen ladder — the page never guesses an address: a
// narrowing rides as the filed street / display building
// and the brain re-decides the list.

export const dynamic = "force-dynamic";

function NoLocation() {
  return (
    <main className="journey-page">
      <h1>{NO_LOCATION_HEADING}</h1>
      <p className="type-lead">{NO_LOCATION_LINE}</p>
      <PostcodeBox autoFocus />
    </main>
  );
}

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
    if (resolution.rung !== 3) return <NoLocation />;
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

  if (!params.postcode) return <NoLocation />;

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
    redirect("/search");
  }

  // Rung 2. Scotland / NI never render a picker (ruling 4).
  if (resolutionNotCovered(resolution)) redirect(homeRoute(postcode));

  const heading =
    resolution.building ?? (resolution.street ? displayText(resolution.street) : postcode);
  const addresses: PickerAddress[] = resolution.addresses.map((address) => ({
    key: homeKeyOf({ rung: 1, kind: "home", address, directory: resolution.directory }),
    label: address.label,
  }));

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
