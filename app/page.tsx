import Link from "next/link";

import AudienceCards from "../components/AudienceCards";
import PostcodeBox from "../components/PostcodeBox";
import {
  EXAMPLE_CHECK_LABEL,
  HOME_CARDS_HEADING,
  HOME_CARDS_SUB,
  HOME_FAMILY_NAMES,
  HOME_FAMILY_NAMES_LEAD,
  HOME_FAMILY_NAMES_NOTE,
  HOME_HERO_PANELS,
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
import { HOME_HERO_HEADLINE, SITE_MANIFESTO } from "../lib/site";

// M7.2 — the home page. Family-first, as designed (D12) and as
// ruled at the step's gap check (founder, 16 Nov 2026).
//
// D70 (the design-alignment pass) rebuilds the composition
// to the governing sources — the Final Design's chosen
// homepage, with the decided landing page (13 Nov 2026)
// governing wherever the two differ:
//
//   Hero, in its pinned order — the manifesto as kicker, the
//   D44 headline as H1, the sub-line, the three captioned
//   imagery panels, then the postcode box (the page's main
//   action; M7.3 wired the journey into it) with the
//   example-check action beside it. The hero tagline line
//   M7.2 closed the hero with is dropped (D70 R2/D20) — the
//   tagline lives in the header and footer lockups. The
//   order is identical on mobile — it is simply the
//   document order.
//   The three audience cards under their section heading,
//   in the design's text-only form with the decided page's
//   intros and check lists.
//   The family-names panel (D70 R4).
//   "What it checks" — the checking screen's nine rows under
//   their plain names, as a contents list.
//   The manifesto block, once, mid-page — now the design's
//   dark Forest panel with the chosen homepage's why line.
//   The SAMPLE report link, clearly labelled — its page is
//   M8.9's, so the link is a known dead end until then.
//
// Not on this page, by ruling: no disclaimer (the D9 short form
// sits beside the results, M7.4), and no price or "free" lines
// (the £4.99 model lives at M9's surfaces). The page's metadata
// is the locked PAGE_SEO["/"] entry, consumed by the root
// layout — unchanged by this step. The page is a composed
// page, so it takes the wide container (D70 R7).
export default function Home() {
  return (
    <main className="main--wide">
      <section className="hero">
        <p className="hero__kicker">{SITE_MANIFESTO}</p>
        <h1>{HOME_HERO_HEADLINE}</h1>
        <p className="type-lead">{HOME_HERO_SUBLINE}</p>
        <ul className="hero__panels">
          {HOME_HERO_PANELS.map((panel) => (
            <li className="hero__panel" key={panel.title}>
              {/* eslint-disable-next-line @next/next/no-img-element -- the illustrations are plain static assets; next/image adds nothing on a static export */}
              <img
                className="hero__panel-art"
                src={panel.art}
                alt={panel.artAlt}
                width="48"
                height="48"
              />
              <span className="hero__panel-title">{panel.title}</span>
              <span className="hero__panel-line">{panel.line}</span>
            </li>
          ))}
        </ul>
        <div className="hero__actions">
          <PostcodeBox />
          <Link className="hero__example" href={SAMPLE_REPORT_PATH}>
            {EXAMPLE_CHECK_LABEL}
          </Link>
        </div>
      </section>

      <section className="home-section" aria-labelledby="audience-cards-heading">
        <h2 id="audience-cards-heading">{HOME_CARDS_HEADING}</h2>
        <p className="home-section__sub">{HOME_CARDS_SUB}</p>
        <AudienceCards />
      </section>

      <section className="fam-names" aria-label="The checks, in family language">
        <p>
          <b>{HOME_FAMILY_NAMES_LEAD}</b> {HOME_FAMILY_NAMES.join(" · ")}{" "}
          <span className="fam-names__note">{HOME_FAMILY_NAMES_NOTE}</span>
        </p>
      </section>

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
        <p className="manifesto-block__why">{HOME_MANIFESTO_WHY}</p>
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
