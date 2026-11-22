import type { Metadata } from "next";

import BreadcrumbLd from "../../components/BreadcrumbLd";
import HowWeCheckIcon from "../../components/HowWeCheckIcon";
import ReportBand from "../../components/ReportBand";
import SearchBlock from "../../components/SearchBlock";
import { PAGE_SEO, pageMetadata } from "../../lib/seo";
import {
  HOW_WE_CHECK_CARDS,
  HOW_WE_CHECK_EYEBROW,
  HOW_WE_CHECK_H1,
  HOW_WE_CHECK_INTRO,
  HOW_WE_CHECK_LEAD,
  NEVER_HEADING,
  NEVER_INTRO,
  NEVER_ITEMS,
} from "../../lib/site-pages";

// M7.8 — How we check (Final Sample Master view 4): the
// trust page the header and footer already link. Copy is
// the finalised sample's, held as constants in
// lib/site-pages.ts; this page is its composition.
export const metadata: Metadata = pageMetadata({
  ...PAGE_SEO["/how-we-check"],
  path: "/how-we-check",
});

export default function HowWeCheckPage() {
  return (
    <main className="site-pages">
      <div className="site-pages__inner">
        <BreadcrumbLd name="How we check" path="/how-we-check" />
        <p className="eyebrow">{HOW_WE_CHECK_EYEBROW}</p>
        <h1>{HOW_WE_CHECK_H1}</h1>
        <p className="lead">
          <strong>{HOW_WE_CHECK_LEAD}</strong>
        </p>
        <p className="lead-second">{HOW_WE_CHECK_INTRO}</p>
        <div className="rule" />

        <div className="stack">
          {HOW_WE_CHECK_CARDS.map((card) => (
            <article className="card how-card" key={card.heading}>
              <div className="card-head">
                <span className="card-icon" aria-hidden="true">
                  {/* BUG-157: the tile draws the section's
                      own glyph (components/HowWeCheckIcon),
                      keyed by the card's icon key. */}
                  <HowWeCheckIcon name={card.icon} />
                </span>
                <h2>{card.heading}</h2>
                <span className="source-tag">{card.source}</span>
              </div>
              {card.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 32)}>{paragraph}</p>
              ))}
              <p className="how-line">
                <strong>{card.howLabel}</strong> {card.howText}
              </p>
            </article>
          ))}
        </div>

        <div className="note-box">
          <h2>{NEVER_HEADING}</h2>
          <p>{NEVER_INTRO}</p>
          <div className="never-grid">
            {NEVER_ITEMS.map((item) => (
              <div className="never-item" key={item.heading}>
                <h3>{item.heading}</h3>
                <p>{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* BUG-149(4) (22 Nov 2026): the sample-report
            band — the homepage's strip — stands on the
            hub too, above the search block. */}
        <ReportBand />
        <SearchBlock />
      </div>
    </main>
  );
}
