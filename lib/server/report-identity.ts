// The door's identity ladder, shared by the
// post-payment surfaces (plan steps M9.6 and M9.7):
// name an order's home the way the door names it, from
// the serve layer's resolution — never from the order
// record's own strings alone, and never a guessed
// home. A key the directory no longer holds falls back
// to the postcode's form; a failed read falls back to
// the postcode's bare form; neither is ever an error.

import { displayText } from "../address";
import { homeKeyOf } from "../bundle-cache";
import type { ReportDoorIdentity } from "../report-door";
import { resultsScopeLabel } from "../results";
import { resolutionForRoute } from "./serve";

export async function identityForOrder(
  postcode: string,
  homeKey: string | null,
): Promise<ReportDoorIdentity> {
  try {
    let resolution = await resolutionForRoute(postcode, homeKey);
    if (!resolution && homeKey) {
      resolution = await resolutionForRoute(postcode, null);
    }
    if (!resolution) return { kind: "postcode", postcode, subline: null };
    if (resolution.rung === 1) {
      const address = resolution.address;
      const locality = address.locality ? displayText(address.locality) : null;
      return {
        kind: "home",
        subject: address.label,
        subline: locality ? `${locality}, ${address.postcode}` : address.postcode,
        postcode: address.postcode,
        homeKey: homeKeyOf(resolution),
      };
    }
    if (resolution.rung === 2) {
      return {
        kind: "postcode",
        postcode: resolution.directory.postcode,
        subline: resultsScopeLabel(resolution),
      };
    }
    return { kind: "postcode", postcode, subline: null };
  } catch {
    return { kind: "postcode", postcode, subline: null };
  }
}
