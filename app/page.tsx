import { Suspense } from "react";

import AudienceCards from "../components/AudienceCards";
import CheckTiles from "../components/CheckTiles";
import HowItWorks from "../components/HowItWorks";
import PostcodeBox from "../components/PostcodeBox";
import ReportBand from "../components/ReportBand";
import UnplacedNotice from "../components/UnplacedNotice";
import {
  HOME_CARDS_HEADING,
  HOME_CARDS_SUB,
  HOME_CHECK_TILES_HEADING,
  HOME_CHECK_TILES_SUB,
  HOME_HERO_SMALL_LINE,
  HOME_HERO_SUBLINE,
  HOME_HOW_IT_WORKS_HEADING,
  HOME_HOW_IT_WORKS_SUB,
  HOME_MANIFESTO_HEADLINE,
  HOME_MANIFESTO_WHY,
} from "../lib/home";
import { HOME_HERO_HEADLINE, SITE_KICKER, SITE_MANIFESTO } from "../lib/site";
import type { Metadata } from "next";

import { PAGE_SEO, pageMetadata } from "../lib/seo";

// M7.8: the homepage exports its own locked pair — the
// layout no longer supplies it (see app/layout.tsx).
export const metadata: Metadata = pageMetadata({ ...PAGE_SEO["/"], path: "/" });

// M7.2 — the home page. Family-first, as designed (D12) and as
// ruled at the step's gap check (founder, 16 Nov 2026).
//
// D70 (the design-alignment pass) rebuilt the composition
// to the governing sources, and the founder follow-on
// (17 Nov 2026) ruled the decided landing page (13 Nov 2026)
// governs the landing exactly.
//
// Fidelity pass 2 (founder, 17 Nov 2026) closes the
// founder's 31-item section-by-section comparison of the
// play site against that sample. The composition is now the
// sample's, top to bottom:
//
//   Hero on Cream — the manifesto as kicker (Brass,
//   uppercase, tracked), the D44 headline in Deep Forest at
//   the sample's narrow measure, the sub-line, then the
//   search row in the sample's bare form (no label, no hint,
//   no example-check action; the Brass "Check this home"
//   button) with the sample's small line under it. The three
//   imagery panels D70 R2 placed here are retired — the
//   sample goes from the sub-line straight to the search.
//   "Moving looks different for every family" — the three
//   audience cards (the decided page's intros and check
//   lists, Cream-filled) on a white panel section.
//   "What we check for you" — the nine-tile grid on the
//   Cream band. The family-names annotation panel and the
//   "What it checks" ruled list are retired: the sample
//   carries no annotation box, and the grid is the page's
//   only tour of the checks.
//   "How it works" — the four steps on a white panel
//   section, then the detailed-report band, inset in the
//   page's column as the sample's band sits in its frame.
//   The manifesto block — the sample's centred form on
//   Cream, its headline in dark sans.
//   The SAMPLE report section — its page is M8.9's, so the
//   link is a known dead end until then. (Not a sample
//   element: the sample's own sample door is the band's
//   action. The section stays from M7.2 — see the pass note
//   in docs/frontend-design-pass.md.)
//
// The page takes the sample's measure (the .main--home
// column, app/globals.css), not the wide container. Its
// metadata is the locked PAGE_SEO["/"] entry, consumed by
// the root layout — unchanged.
export default function Home() {
  return (
    <main className="main--home">
      <section className="hero">
        <p className="hero__kicker">{SITE_KICKER}</p>
        <h1>{HOME_HERO_HEADLINE}</h1>
        <p className="type-lead">{HOME_HERO_SUBLINE}</p>
        <PostcodeBox bare />
        <Suspense fallback={null}>
          <UnplacedNotice />
        </Suspense>
        <p className="hero__small">{HOME_HERO_SMALL_LINE}</p>
      </section>

      <section className="home-section home-section--alt" aria-labelledby="audience-cards-heading">
        <h2 id="audience-cards-heading">{HOME_CARDS_HEADING}</h2>
        <p className="home-section__sub">{HOME_CARDS_SUB}</p>
        <AudienceCards />
      </section>

      <section className="home-section" aria-labelledby="what-we-check">
        <h2 id="what-we-check">{HOME_CHECK_TILES_HEADING}</h2>
        <p className="home-section__sub">{HOME_CHECK_TILES_SUB}</p>
        <CheckTiles />
      </section>

      <section className="home-section home-section--alt" aria-labelledby="how-it-works">
        <h2 id="how-it-works">{HOME_HOW_IT_WORKS_HEADING}</h2>
        <p className="home-section__sub">{HOME_HOW_IT_WORKS_SUB}</p>
        <HowItWorks />
      </section>

      <ReportBand />

      <section className="manifesto-block">
        <p className="manifesto-block__headline">{HOME_MANIFESTO_HEADLINE}</p>
        <p className="manifesto-block__line">{SITE_MANIFESTO}</p>
        <p className="manifesto-block__why">{HOME_MANIFESTO_WHY}</p>
      </section>
    </main>
  );
}
