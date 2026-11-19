"use client";

import { useSearchParams } from "next/navigation";

import { PLACE_LANDING_PARAM } from "../lib/journey";
import PostcodeBox from "./PostcodeBox";

// The landing page's search box (founder fix batch,
// 19 Nov 2026): ordinarily the bare box, empty. When the
// URL carries a place — the serve layer's route for a
// bare place name that arrived as a search or a typed
// URL (lib/server/serve.ts's placeLandingUrl) — the box
// mounts with the place's filed name in the field, and
// the box's own suggest fetch opens its panel on the
// place's districts, exactly as the in-dropdown place
// pick behaves. Reading the query client-side keeps the
// landing page itself static — the UnplacedNotice
// island's pattern, one component over.
export default function LandingSearchBox() {
  const params = useSearchParams();
  const place = params.get(PLACE_LANDING_PARAM);
  return <PostcodeBox bare defaultValue={place ?? ""} />;
}
