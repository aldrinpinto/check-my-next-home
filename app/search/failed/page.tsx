import WholeCheckFailure from "../../../components/WholeCheckFailure";

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
// fold-in 10): the whole-check failure state (D44(7)),
// built once in the journey shell and reused by M7.4 on
// the results route.

export default function FailedPage() {
  return <WholeCheckFailure />;
}
