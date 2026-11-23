// The serve layer (plan step M7.3, ruling 1): the production
// architecture in miniature — the one Next codebase serving
// pages and API route handlers that call the frozen brains.
//
// Nothing here re-implements a brain. Resolution is
// lib/address.ts's resolveAddressInput; the bundles come
// from lib/bundle-cache.ts's wired cached set (the D29
// cache) plus the sold-prices builder (deliberately uncached
// since M6.3). The serve layer's own jobs are only: turn a
// route's parameters back into a resolution, decide the
// journey's routing from it, and derive checking-screen row
// states from the served bundles (lib/journey.ts).

import {
  classifyAddressInput,
  createAddressSource,
  displayText,
  labelForAddressParts,
  parsePaon,
  resolveAddressInput,
  type AddressResolution,
  type ResolvedAddress,
} from "../address";
import { buildAreaBundle, createAreaSource } from "../area-bundle";
import { createCachedBrains, homeKeyOf } from "../bundle-cache";
import { buildCrimeBundle, createCrimeSource } from "../crime";
import { createDistrictSource, createDistrictWarningSource } from "../district";
import {
  buildDistrictBundleCached,
  createDistrictCache,
  districtBuildFor,
} from "../district-cache";
import {
  districtCheckingGroupPayload,
  type DistrictCheckingGroupPayload,
  type DistrictCheckingRowKey,
} from "../district-checking";
import { buildFloodBundle, createFloodSource } from "../flood";
import { buildNearbyBundle, createNearbySource, reportListSizeFor } from "../nearby";
import { buildShortBundle } from "../short-bundle";
import {
  journeyDestination,
  placeChoiceRoute,
  type JourneyDestination,
  nationOfLsoa,
  isNotCoveredNation,
} from "../journey";
import { buildSoldPricesBundle, createSoldPricesSource } from "../sold-prices";
import { getDbPool } from "./db";
import { logEntry } from "./entry-log";
import {
  pickerList,
  postioSupplementEnabled,
  promotionKeyFor,
  supplementPickerList,
  type PickerRow,
} from "./hybrid";
import { createPickingIndexSource } from "./picking-index";
import { createPlaceSource, placeNormOf, type PlaceQueryable } from "./places";
import { getPostioClient } from "./postio";
import { createDbResolveRecordStore, isResolveToken } from "./resolve-records";

// The typed input's classification rides along so the
// journey can tell "typed a full postcode we don't hold"
// (rung 3 with a postcode) from "typed an outward code"
// (rung 3 without one) — fold-in 2's not-found line depends
// on the distinction.
// The bare-place-name route (founder fix batch, 19 Nov
// 2026; destination ruled again the same day): where an
// input the ladder cannot place exactly names a known
// place — exact normalised equality with a filed place
// that serves at least one district — the graceful
// destination is the place page carrying the place's
// filed display name, exactly where the in-dropdown
// place pick now lands (founder ruling, 19 Nov 2026:
// places behave like streets — the pick navigates to a
// page listing the districts). Anything else answers
// null and the caller takes its ordinary unplaced path.
// Exact matches only: the fuzzy tier is choices-only
// (the places read model's own rule) and is never
// applied silently to a submitted input. A place name
// is never served the bare failure page.
export async function placeChoiceUrl(
  raw: string,
  db: PlaceQueryable = getDbPool(),
): Promise<string | null> {
  const typed = classifyAddressInput(raw);
  // Only a bare name can be a place pick: an input
  // carrying a postcode or an outward code has its own
  // ladder answer, and a multi-part address string is
  // not a place name.
  if (typed.postcode || typed.outward) return null;
  const norm = placeNormOf(raw);
  if (norm.length === 0) return null;
  const place = await createPlaceSource(db).placeByNorm(norm);
  if (!place || place.districts.length === 0) return null;
  // The route is contracted for the DISPLAY form
  // (placeChoiceRoute's placeDisplay): the read model
  // files the place in its as-filed casing ("CHELMSFORD"),
  // and every other surface applies displayText at the
  // presentation edge — placeItemOf in
  // lib/server/suggestions.ts, whose filed name the
  // dropdown names the pick by. Passing the filed form
  // through put "?place=CHELMSFORD" in the URL and the
  // raw casing in front of the visitor (Regression run
  // 44535680408 follow-up, 19 Nov 2026).
  return placeChoiceRoute(displayText(place.place));
}

export async function resolveTypedInput(raw: string): Promise<{
  resolution: AddressResolution;
  destination: JourneyDestination;
}> {
  const db = getDbPool();
  const source = createAddressSource(db);
  const resolution = await resolveAddressInput(raw, source);
  const typed = classifyAddressInput(raw);
  const homeKey = resolution.rung === 1 ? homeKeyOf(resolution) : null;
  if (resolution.rung === 4) {
    // A bare place name submitted as a search (founder
    // fix batch): the place route above, never the
    // unplaced notice — the input CAN be placed, as a
    // place.
    const placeUrl = await placeChoiceUrl(raw);
    if (placeUrl) {
      return { resolution, destination: { kind: "place", url: placeUrl } };
    }
  }
  return {
    resolution,
    destination: journeyDestination(resolution, { postcode: typed.postcode }, homeKey),
  };
}

// Re-derive the resolution a route's parameters name. The
// postcode must be one the directory holds (the routes are
// only ever linked with held postcodes; anything else is a
// hand-typed URL and lands back on the landing page with
// the unplaced notice). A home key that no longer resolves
// returns null — the page sends the visitor back to that
// postcode's picker, never to a guessed home (fold-in 1).
export async function resolutionForRoute(
  postcode: string,
  homeKey: string | null,
  req?: string,
): Promise<AddressResolution | null> {
  const db = getDbPool();
  const source = createAddressSource(db);
  const directory = await source.directoryPostcode(postcode);
  if (!directory) return null;

  if (!homeKey) {
    // The postcode-level resolution: the resolver over the
    // bare postcode (rung 2, or the honest lower rung if the
    // data moved).
    return resolveAddressInput(postcode, source);
  }

  if (isResolveToken(homeKey)) {
    // A transient resolve token (entry-point build, D72):
    // the home was resolved through Postio and is carried
    // by its record, not by filed data. An expired or
    // unknown token answers null, exactly like a stale home
    // key — the page returns to the picker, never to a
    // guessed home.
    const record = await createDbResolveRecordStore(db).get(homeKey, req);
    if (!record || record.postcode !== postcode) return null;
    if (req) {
      logEntry(req, "transient.served", {
        layer: "transient",
        reason: "record",
        postcode,
        udprn: record.udprn ?? undefined,
      });
    }
    const address: ResolvedAddress = {
      ...record.parts,
      label: labelForAddressParts(record.parts),
    };
    return { rung: 1, kind: "home", address, directory };
  }

  // A durable home key resolves against the UNION of the
  // filed rows and the picking index (M7.15B): an
  // index-only home is a first-class local home — its key
  // is derived from its index parts exactly as a filed
  // home's is from its price_paid parts, and the resolved
  // address it serves from is those parts. No token, no
  // TTL, no Postio call. The filed rows are tried first:
  // where both name the home, the filed form serves.
  const union = await createPickingIndexSource(db).unionAddressesInPostcode(postcode);
  for (const parts of union) {
    const address: ResolvedAddress = { ...parts, label: labelForAddressParts(parts) };
    const candidate: AddressResolution = { rung: 1, kind: "home", address, directory };
    if (homeKeyOf(candidate) === homeKey) return candidate;
  }
  return null;
}

// The picker's local union for a route (entry-point
// build, D72; union from M7.15B): the ladder's filed rows
// (the caller's `local` — already narrowed by the frozen
// resolver) plus the picking index's index-only rows for
// the postcode, narrowed here by the route's own
// street/building so a narrowed picker never widens back
// to the whole postcode. An index read that fails leaves
// the filed list standing — the picker degrades to the
// pre-preload behaviour, never to an error.
async function unionLocalFor(
  postcode: string,
  local: ResolvedAddress[],
  narrowing: { street: string | null; building: string | null },
): Promise<ResolvedAddress[]> {
  let unionLocal = local;
  try {
    const indexOnly =
      await createPickingIndexSource(getDbPool()).indexOnlyAddressesInPostcode(postcode);
    if (indexOnly.length > 0) {
      const narrowed = indexOnly.filter((parts) => {
        if (narrowing.street && (parts.street ?? null) !== narrowing.street) {
          return false;
        }
        if (narrowing.building) {
          const name = parsePaon(parts.paon ?? "").name;
          if ((name ?? "").toUpperCase() !== narrowing.building.toUpperCase()) {
            return false;
          }
        }
        return true;
      });
      unionLocal = [
        ...local,
        ...narrowed.map((parts) => ({
          ...parts,
          label: labelForAddressParts(parts),
        })),
      ];
    }
  } catch {
    // The filed list stands (see the header note).
  }
  return unionLocal;
}

// The picker's rows for a route: the local union, as
// filed — the ONLY rows a page load ever serves
// (BUG-185: the Postio supplement is the visitor's
// click, never the page's). The hybrid brain
// (lib/server/hybrid.ts) owns the ordering and the
// decision log; this is only its wiring to the real deps.
export async function pickerRowsFor(
  postcode: string,
  local: ResolvedAddress[],
  narrowing: { street: string | null; building: string | null },
  req: string,
): Promise<PickerRow[]> {
  const unionLocal = await unionLocalFor(postcode, local, narrowing);
  const { rows } = pickerList({ postcode, local: unionLocal, req });
  return rows;
}

// The supplemented rows for a route — the answer to the
// visitor's click on the "Don't see your home?" row
// (BUG-185): the same local union the picker served,
// merged with Postio's list for the postcode under the
// hybrid's dedupe, the kill switch read here at the
// wiring edge. Nothing about this runs on a page load.
export async function supplementedPickerRowsFor(
  postcode: string,
  local: ResolvedAddress[],
  narrowing: { street: string | null; building: string | null },
  req: string,
): Promise<PickerRow[]> {
  const unionLocal = await unionLocalFor(postcode, local, narrowing);
  const { rows } = await supplementPickerList({
    postio: getPostioClient(),
    postcode,
    local: unionLocal,
    narrowing,
    enabled: postioSupplementEnabled(),
    req,
  });
  return rows;
}

// The supplement for a bare route (the /api/supplement
// endpoint): the local side is rebuilt exactly as the
// check page built it — the ladder re-run over the
// route's narrowing gives the filed rows, the union adds
// the index-only rows — so the refreshed list is the
// page's own list, widened. A narrowing that resolved to
// a single home (rung 1) or to nothing listable falls
// back to the whole-postcode union: the click asked for
// the postcode's full address list.
export async function supplementForRoute(
  postcode: string,
  narrowing: { street: string | null; building: string | null },
  req: string,
): Promise<PickerRow[]> {
  let local: ResolvedAddress[] = [];
  try {
    const resolution = await resolutionForPostcodeRoute(postcode, narrowing);
    if (resolution.rung === 2) local = resolution.addresses;
  } catch {
    // The whole-postcode union stands (see the header note).
  }
  return supplementedPickerRowsFor(postcode, local, narrowing, req);
}

// Promotion (entry-point build, D72 fold-in): when a
// transient record's home has become filed locally — the
// pick's own check cold-loads the postcode's sales — the
// canonical home key takes over. Returns the key to
// redirect to (the record is deleted and the promotion
// logged), or null when the home is still Postio-only.
export async function promoteTransientIfFiled(
  postcode: string,
  token: string,
  resolution: AddressResolution,
  req: string,
): Promise<string | null> {
  if (resolution.rung !== 1) return null;
  const db = getDbPool();
  const source = createAddressSource(db);
  const filed = await source.addressesInPostcode(postcode);
  const key = promotionKeyFor(resolution.address, filed);
  if (!key) return null;
  await createDbResolveRecordStore(db).delete(token);
  logEntry(req, "transient.promoted", {
    layer: "local",
    reason: "filed-after-pick",
    postcode,
  });
  return key;
}

// The narrowing a postcode route carries (fold-in 1): the
// resolver is re-run over a composed input built from the
// filed forms — "Minerva House, KT17 1FH", "Birkdale Rise,
// CM3 2JT" — so the frozen brain, not the page, decides the
// narrowed list.
export async function resolutionForPostcodeRoute(
  postcode: string,
  narrowing: { street: string | null; building: string | null },
): Promise<AddressResolution> {
  const db = getDbPool();
  const source = createAddressSource(db);
  const lead = narrowing.building ?? narrowing.street;
  return resolveAddressInput(lead ? `${lead}, ${postcode}` : postcode, source);
}

// True when the resolution's home sits in Scotland or
// Northern Ireland (the directory's filed area code decides,
// never the outward letters).
export function resolutionNotCovered(resolution: AddressResolution): boolean {
  if (resolution.rung !== 1 && resolution.rung !== 2) return false;
  return isNotCoveredNation(nationOfLsoa(resolution.directory.lsoaCode));
}

// The checking screen's brain calls — one per part the
// screen fires. Each returns the served bundle(s) its
// rows derive from; the route handlers turn them into
// row states through lib/journey.ts.
export async function checkNearby(resolution: AddressResolution) {
  const brains = createCachedBrains(getDbPool());
  return brains.buildNearbyBundle(resolution);
}

export async function checkFlood(resolution: AddressResolution) {
  const brains = createCachedBrains(getDbPool());
  return brains.buildFloodBundle(resolution);
}

// The crime part (BUG-144): the crime bundle, plus the
// area bundle the safety line's air rider derives from.
// The two build in parallel, and the area bundle is the
// cached build the area part below also reads — the
// crime half of the safety group no longer waits on
// sold prices or the costs/history derivation.
export async function checkCrime(resolution: AddressResolution) {
  const brains = createCachedBrains(getDbPool());
  const [crime, area] = await Promise.all([
    brains.buildCrimeBundle(resolution),
    brains.buildAreaBundle(resolution),
  ]);
  return { crime, area };
}

export async function checkArea(resolution: AddressResolution) {
  const db = getDbPool();
  const brains = createCachedBrains(db);
  const [area, sold] = await Promise.all([
    brains.buildAreaBundle(resolution),
    buildSoldPricesBundle(resolution, createSoldPricesSource(db)),
  ]);
  return { area, sold };
}

// Every bundle, for the not-covered page (ruling 4): each
// section's served not-covered line renders in place, so the
// page reads the same bundles the results page will.
export async function checkAll(resolution: AddressResolution) {
  const db = getDbPool();
  const brains = createCachedBrains(db);
  const [nearby, flood, area, sold, crime] = await Promise.all([
    brains.buildNearbyBundle(resolution),
    brains.buildFloodBundle(resolution),
    brains.buildAreaBundle(resolution),
    buildSoldPricesBundle(resolution, createSoldPricesSource(db)),
    brains.buildCrimeBundle(resolution),
  ]);
  return { nearby, flood, area, sold, crime };
}

// Every bundle, for the detailed report (the report view
// route and the PDF twin's generation): identical to
// checkAll except the nearby bundle, which the report
// builds at report depth — the school lists name five,
// not three (BUG-044). The deeper bundle is built
// UNCACHED, on the district builder's own pattern (the
// uncached buildNearbyBundle call below): a bought
// report is a rare, deliberate event, and a variant
// entry in the shared bundle cache could otherwise
// serve report depth to the results page (or the
// reverse) under the same key. The results page's own
// assembly (checkAll / checkResults) is untouched.
export async function checkReport(resolution: AddressResolution) {
  const db = getDbPool();
  const brains = createCachedBrains(db);
  const [nearby, flood, area, sold, crime] = await Promise.all([
    buildNearbyBundle(resolution, createNearbySource(db), {
      // OBS-012: the report's school depth is read from
      // the one serving table (reportListSizeFor), the
      // same table the results page's truncation seam
      // caps its numerals against.
      schoolListSize: reportListSizeFor("schools-primary"),
    }),
    brains.buildFloodBundle(resolution),
    brains.buildAreaBundle(resolution),
    buildSoldPricesBundle(resolution, createSoldPricesSource(db)),
    brains.buildCrimeBundle(resolution),
  ]);
  return { nearby, flood, area, sold, crime };
}

// The results page's derivation (plan step M7.4): the five
// bundles plus the SHORT bundle, derived on read from the
// cached brains by the frozen lib/short-bundle.ts — the
// page renders headline depth from these and nothing else.
// No client bundle fetch exists: the results HTML is
// server-rendered from this derivation.
export async function checkResults(resolution: AddressResolution) {
  const { nearby, flood, area, sold, crime } = await checkAll(resolution);
  const short = buildShortBundle({ nearby, soldPrices: sold, crime, flood, area });
  if (short.kind !== "short-bundle")
    throw new Error(`results derivation: unexpected short bundle kind ${short.kind}`);
  return { nearby, flood, area, sold, crime, short };
}

// The rung-3 (wider-area) derivation: the brains answer a
// rung-3 resolution with named states only and never touch
// their sources doing it, so the plain builders over the
// real sources are the whole path — nothing is filed,
// loaded or cached for a wider area.
export async function checkResultsWider(resolution: AddressResolution) {
  const db = getDbPool();
  const [nearby, flood, area, sold, crime] = await Promise.all([
    buildNearbyBundle(resolution, createNearbySource(db)),
    buildFloodBundle(resolution, createFloodSource(db)),
    buildAreaBundle(resolution, createAreaSource(db)),
    buildSoldPricesBundle(resolution, createSoldPricesSource(db)),
    buildCrimeBundle(resolution, createCrimeSource(db)),
  ]);
  const short = buildShortBundle({ nearby, soldPrices: sold, crime, flood, area });
  if (short.kind !== "wider-area")
    throw new Error(`wider-area derivation: unexpected short bundle kind ${short.kind}`);
  return { short };
}

// The district bundle alone, through its D29-pattern
// cache (lib/district-cache.ts) — a repeat view of a
// district is near-instant, and the live warnings are
// still composed fresh on every serve. This is the whole
// of the checking screen's payload path: the screen's
// gate must settle on the district bundle alone, never
// behind the five-bundle short derivation below.
export async function checkDistrictBundleOnly(resolution: AddressResolution) {
  if (resolution.rung !== 3)
    throw new Error(`district derivation: unexpected rung ${resolution.rung}`);
  const db = getDbPool();
  return buildDistrictBundleCached(
    resolution.outward,
    createDistrictSource(db),
    createDistrictCache(db),
    {
      warningSource: createDistrictWarningSource(),
    },
  );
}

// One district checking group, settled on its own
// slice of the one staged build (BUG-171): the build
// comes through the district cache's single flight, so
// the four group parts and the streamed results behind
// the screen share the one build — a part awaits the
// settlement (the Scotland / NI gate, from the
// directory read alone) and then only its own group's
// sections, so a group completes as its own data lands
// instead of waiting for the district's slowest read.
export async function checkDistrictGroup(
  resolution: AddressResolution,
  group: DistrictCheckingRowKey,
): Promise<DistrictCheckingGroupPayload> {
  if (resolution.rung !== 3)
    throw new Error(`district derivation: unexpected rung ${resolution.rung}`);
  const db = getDbPool();
  const outward = resolution.outward;
  const build = districtBuildFor(outward, createDistrictSource(db), createDistrictCache(db), {
    warningSource: createDistrictWarningSource(),
  });
  const settlement = await build.settlement;
  if (settlement.kind === "not-covered") {
    return { kind: "not-covered", outward, nation: settlement.nation };
  }
  switch (group) {
    case "family":
      return districtCheckingGroupPayload("family", outward, {
        schools: await build.sections.schools,
        outward,
      });
    case "neighbourhood": {
      const [head, district, census, crime, deprivation, air] = await Promise.all([
        build.head,
        build.sections.district,
        build.sections.census,
        build.sections.crime,
        build.sections.deprivation,
        build.sections.air,
      ]);
      return districtCheckingGroupPayload("neighbourhood", outward, {
        head,
        district,
        census,
        crime,
        deprivation,
        air,
      });
    }
    case "home": {
      const [soldPrices, councilTax, connectivity, flood] = await Promise.all([
        build.sections.soldPrices,
        build.sections.councilTax,
        build.sections.connectivity,
        build.sections.flood,
      ]);
      return districtCheckingGroupPayload("home", outward, {
        soldPrices,
        councilTax,
        connectivity,
        flood,
        outward,
      });
    }
    case "nearby":
      return districtCheckingGroupPayload("nearby", outward, {
        everyday: await build.sections.everyday,
        outward,
      });
  }
}

// The rung-3 route's full serve (district page, 18 Nov
// 2026): the district bundle plus the short bundle the
// Scotland / NI form renders (named states only). Fix
// batch, 19 Nov 2026 — BUG-017: the district bundle
// builds FIRST. For a Scotland / NI outward it answers
// not-covered from a single directory query, and the
// checking screen completes on that settlement without
// playing; building the five-bundle short first put the
// whole derivation in front of an answer the district
// bundle already had, so the not-covered page waited out
// the full staged sequence behind it.
export async function checkDistrictWider(resolution: AddressResolution) {
  const district = await checkDistrictBundleOnly(resolution);
  const { short } = await checkResultsWider(resolution);
  return { short, district };
}
