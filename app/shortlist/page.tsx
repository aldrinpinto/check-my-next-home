import ShortlistPage from "../../components/ShortlistPage";

import type { Metadata } from "next";

import { pageMetadata } from "../../lib/seo";

// M7.8: the shortlist is declared non-indexable (the
// adopted scope ruling): a visitor's own saved homes are
// never a search page. Explicit noindex metadata, in every
// environment — and no sitemap entry.
export const metadata: Metadata = pageMetadata({
  title: "Your shortlist | Check My Next Home",
  description: "The homes you have saved, side by side — kept only in this browser.",
  path: "/shortlist",
  noindex: true,
});

// The shortlist page (plan step M7.5): the header's
// Shortlist item has pointed here since M7.1; this step
// builds the page. The server renders the framed shell
// only — the list itself lives in the visitor's browser
// (D40) and resolves client-side from storage
// (components/ShortlistPage.tsx), so this route makes no
// serve call and works while the play server is down.
//
// Shortlist sample-parity fix (18 Nov 2026): the page head
// (h1, lead, brass rule) renders inside the client island,
// not here — whether the lead appears is part of the state
// (the sample's empty state carries no lead; the saved
// states carry the one sentence), and only the island
// knows the state. The shell's one job is the frame: the
// sample's cream surface at 1080px (see .shortlist-page in
// app/globals.css).
export default function ShortlistRoute() {
  return (
    <main className="journey-page main--wide shortlist-page">
      <ShortlistPage />
    </main>
  );
}
