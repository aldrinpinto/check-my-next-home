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
  labelForAddressParts,
  resolveAddressInput,
  type AddressResolution,
  type ResolvedAddress,
} from "../address";
import { buildAreaBundle, createAreaSource } from "../area-bundle";
import { createCachedBrains, homeKeyOf } from "../bundle-cache";
import { buildCrimeBundle, createCrimeSource } from "../crime";
import { buildFloodBundle, createFloodSource } from "../flood";
import { buildNearbyBundle, createNearbySource } from "../nearby";
import { buildShortBundle } from "../short-bundle";
import {
  journeyDestination,
  type JourneyDestination,
  nationOfLsoa,
  isNotCoveredNation,
} from "../journey";
import { buildSoldPricesBundle, createSoldPricesSource } from "../sold-prices";
import { getDbPool } from "./db";
import { logEntry } from "./entry-log";
import { pickerList, promotionKeyFor, type PickerRow } from "./hybrid";
import { getPostioClient } from "./postio";
import { createDbResolveRecordStore, isResolveToken } from "./resolve-records";

// The typed input's classification rides along so the
// journey can tell "typed a full postcode we don't hold"
// (rung 3 with a postcode) from "typed an outward code"
// (rung 3 without one) — fold-in 2's not-found line depends
// on the distinction.
export async function resolveTypedInput(raw: string): Promise<{
  resolution: AddressResolution;
  destination: JourneyDestination;
}> {
  const db = getDbPool();
  const source = createAddressSource(db);
  const resolution = await resolveAddressInput(raw, source);
  const typed = classifyAddressInput(raw);
  const homeKey = resolution.rung === 1 ? homeKeyOf(resolution) : null;
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

  const rows = await source.addressesInPostcode(postcode);
  for (const parts of rows) {
    const address: ResolvedAddress = { ...parts, label: labelForAddressParts(parts) };
    const candidate: AddressResolution = { rung: 1, kind: "home", address, directory };
    if (homeKeyOf(candidate) === homeKey) return candidate;
  }
  return null;
}

// The picker's rows for a route (entry-point build, D72):
// the ladder's local list, supplemented by Postio when it
// is short — the hybrid brain (lib/server/hybrid.ts) owns
// the merge, the dedupe and the decision log; this is only
// its wiring to the real deps.
export async function pickerRowsFor(
  postcode: string,
  local: ResolvedAddress[],
  narrowing: { street: string | null; building: string | null },
  req: string,
): Promise<PickerRow[]> {
  const { rows } = await pickerList({
    postio: getPostioClient(),
    postcode,
    local,
    narrowing,
    req,
  });
  return rows;
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

// The checking screen's three brain calls. Each returns the
// served bundle(s) its rows derive from; the route handlers
// turn them into row states through lib/journey.ts.
export async function checkNearby(resolution: AddressResolution) {
  const brains = createCachedBrains(getDbPool());
  return brains.buildNearbyBundle(resolution);
}

export async function checkFlood(resolution: AddressResolution) {
  const brains = createCachedBrains(getDbPool());
  return brains.buildFloodBundle(resolution);
}

export async function checkArea(resolution: AddressResolution) {
  const db = getDbPool();
  const brains = createCachedBrains(db);
  const [area, sold, crime] = await Promise.all([
    brains.buildAreaBundle(resolution),
    buildSoldPricesBundle(resolution, createSoldPricesSource(db)),
    brains.buildCrimeBundle(resolution),
  ]);
  return { area, sold, crime };
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
