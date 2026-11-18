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
// builds the page. The server renders the shell and page
// furniture only — the list itself lives in the visitor's
// browser (D40) and resolves client-side from storage
// (components/ShortlistPage.tsx), so this route makes no
// serve call and works while the play server is down.
export default function ShortlistRoute() {
  return (
    // D8 (parity fix stack, 18 Nov 2026): the page takes
    // the sample's shell — the 1080px frame at the
    // sample's padding, its h1, lead and brass rule.
    <main className="journey-page main--wide shortlist-page">
      <h1>Your shortlist</h1>
      <p className="shortlist-lead">
        The homes you&rsquo;ve saved, side by side. Nothing about which homes you are considering is
        stored on any server.
      </p>
      <div className="shortlist-rule" aria-hidden="true" />
      <ShortlistPage />
    </main>
  );
}
