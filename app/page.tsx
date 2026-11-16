import Link from "next/link";

import AudienceCards from "../components/AudienceCards";
import PostcodeBox from "../components/PostcodeBox";
import {
  HOME_HERO_ART,
  HOME_HERO_ART_ALT,
  HOME_HERO_SUBLINE,
  HOME_MANIFESTO_HEADLINE,
  HOME_MANIFESTO_WHY,
  HOME_WHAT_IT_CHECKS,
  HOME_WHAT_IT_CHECKS_HEADING,
  SAMPLE_REPORT_HEADING,
  SAMPLE_REPORT_LINE,
  SAMPLE_REPORT_LINK_TEXT,
  SAMPLE_REPORT_PATH,
} from "../lib/home";
import { HOME_HERO_HEADLINE, SITE_MANIFESTO, SITE_TAGLINE } from "../lib/site";

// M7.2 — the home page. Family-first, as designed (D12) and as
// ruled at the step's gap check (founder, 16 Nov 2026):
//
//   Hero, in its pinned order — the manifesto as kicker, the
//   D44 headline as H1, the sub-line, the postcode box (the
//   page's main action; inert at this step, M7.3 wires the
//   journey into it), and the tagline closing the hero. The
//   order is identical on mobile — it is simply the document
//   order. The hero's scene is one of this step's one-line
//   illustrations, drawn in the Roof-Tick's own language.
//   The three audience cards directly under the hero.
//   "What it checks" — the checking screen's nine rows in
//   family language, items carrying no links at this step.
//   The manifesto block, once, mid-page.
//   The SAMPLE report link, clearly labelled — its page is
//   M8.9's, so the link is a known dead end until then.
//
// Not on this page, by ruling: no disclaimer (the D9 short form
// sits beside the results, M7.4), and no price or "free" lines
// (the £4.99 model lives at M9's surfaces). The page's metadata
// is the locked PAGE_SEO["/"] entry, consumed by the root
// layout — unchanged by this step.
export default function Home() {
  return (
    <main>
      <section className="hero">
        <p className="hero__kicker">{SITE_MANIFESTO}</p>
        <h1>{HOME_HERO_HEADLINE}</h1>
        <p className="type-lead">{HOME_HERO_SUBLINE}</p>
        <PostcodeBox />
        <p className="hero__tagline">{SITE_TAGLINE}</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- the illustrations are plain static assets; next/image adds nothing on a static export */}
        <img
          className="hero__art"
          src={HOME_HERO_ART}
          alt={HOME_HERO_ART_ALT}
          width="960"
          height="640"
        />
      </section>

      <AudienceCards />

      <section className="home-section" aria-labelledby="what-it-checks">
        <h2 id="what-it-checks">{HOME_WHAT_IT_CHECKS_HEADING}</h2>
        <ul className="checks-list">
          {HOME_WHAT_IT_CHECKS.map((check) => (
            <li key={check.name}>
              <span className="checks-list__name">{check.name}</span>
              <span>{check.line}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="manifesto-block">
        <p className="manifesto-block__headline">{HOME_MANIFESTO_HEADLINE}</p>
        <p className="manifesto-block__line">{SITE_MANIFESTO}</p>
        <p>{HOME_MANIFESTO_WHY}</p>
      </section>

      <section className="home-section" aria-labelledby="sample-report">
        <h2 id="sample-report">{SAMPLE_REPORT_HEADING}</h2>
        <p>{SAMPLE_REPORT_LINE}</p>
        <p>
          <Link href={SAMPLE_REPORT_PATH}>{SAMPLE_REPORT_LINK_TEXT}</Link>
        </p>
      </section>
    </main>
  );
}
