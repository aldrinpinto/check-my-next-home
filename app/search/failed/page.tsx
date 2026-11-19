import ErrorPage from "../../../components/ErrorPage";

import type { Metadata } from "next";

import { pageMetadata } from "../../../lib/seo";

// M7.8: explicit production noindex — see app/search/page.tsx.
export const metadata: Metadata = pageMetadata({
  title: "Your check | Check My Next Home",
  description: "The facts for the home you checked, from official sources.",
  path: "/search/failed",
  noindex: true,
});

// /search/failed — where the search box lands when the
// serve layer cannot resolve at all (plan step M7.3,
// fold-in 10): the whole-check failure state (D44(7)).
// The route stays — existing links, beacons and specs
// reference it, and it is still the failure landing —
// but since the error-page build (19 Nov 2026) its face
// is the site's single error page (Final Sample Master
// view 26), the same page the error boundary and
// unmatched routes serve. The search box carries the
// attempted postcode where the route carries it: the
// box's own failure navigation appends what the visitor
// typed as ?postcode= (components/PostcodeBox.tsx), and
// the box arrives holding it, under the kept note.

export default async function FailedPage({
  searchParams,
}: {
  searchParams: Promise<{ postcode?: string }>;
}) {
  const params = await searchParams;
  return <ErrorPage initialValue={params.postcode ?? ""} />;
}
