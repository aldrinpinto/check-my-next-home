import type { Metadata } from "next";

import BreadcrumbLd from "../../components/BreadcrumbLd";
import SearchBlock from "../../components/SearchBlock";
import { PAGE_SEO, pageMetadata } from "../../lib/seo";
import {
  ABOUT_CARDS,
  ABOUT_EYEBROW,
  ABOUT_H1,
  ABOUT_LEAD,
  ABOUT_MANIFESTO_CLOSING,
  ABOUT_MANIFESTO_HEADING,
  ABOUT_MANIFESTO_TEXT,
  ABOUT_TAGLINE_LINE,
} from "../../lib/site-pages";

// M7.8 — About (Final Sample Master view 5). The page's
// locked pair is re-locked at /about (the adopted M7.8
// scope ruling, superseding /about-the-data): the chrome
// links /about, the samples show /about, and the pair now
// lives there. Copy is the finalised sample's, held in
// lib/site-pages.ts.
export const metadata: Metadata = pageMetadata({ ...PAGE_SEO["/about"], path: "/about" });

export default function AboutPage() {
  return (
    <main className="site-pages">
      <div className="site-pages__inner">
        <BreadcrumbLd name="About" path="/about" />
        {/* D1a (parity fix stack, 18 Nov 2026): the hero
            takes the sample's .about-hero wrap and the six
            cards its .about-grid — three across at the full
            measure, not a single stacked column. */}
        <div className="about-hero">
          <p className="eyebrow">{ABOUT_EYEBROW}</p>
          <h1>{ABOUT_H1}</h1>
          <p className="about-tagline">{ABOUT_TAGLINE_LINE}</p>
          <p className="lead">{ABOUT_LEAD}</p>
        </div>
        <div className="rule" />

        <div className="about-grid">
          {ABOUT_CARDS.map((card) => (
            <article className="card" key={card.heading}>
              <h2>{card.heading}</h2>
              {card.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 32)}>{paragraph}</p>
              ))}
              {card.priceLine && <p className="price-line">{card.priceLine}</p>}
            </article>
          ))}
        </div>

        <div className="manifesto">
          <p className="manifesto-kicker">{ABOUT_MANIFESTO_HEADING}.</p>
          <p>{ABOUT_MANIFESTO_TEXT}</p>
          <p className="manifesto-close">{ABOUT_MANIFESTO_CLOSING}</p>
        </div>

        <SearchBlock />
      </div>
    </main>
  );
}
