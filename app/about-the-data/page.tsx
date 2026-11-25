import type { Metadata } from "next";
import type { ReactNode } from "react";

import Breadcrumb from "../../components/Breadcrumb";
import BreadcrumbLd from "../../components/BreadcrumbLd";
import { PAGE_SEO, pageMetadata } from "../../lib/seo";
import {
  ABOUT_DATA_CARDS,
  ABOUT_DATA_DATE_LINE,
  ABOUT_DATA_EMAIL_ADDRESS,
  ABOUT_DATA_EYEBROW,
  ABOUT_DATA_H1,
  ABOUT_DATA_LEAD,
  ABOUT_DATA_LEAD_REST,
  type PrivacyBlock,
} from "../../lib/site-pages";

// M10.4 — About the data, in the Privacy page's pattern
// (the step's build; the 25 Nov 2026 addition). The
// sources, licences, freshness dates and the
// no-valuation / no-verdict wording as their own page:
// the product's own words, drawn from the Terms, the
// How we check cards and the paid report's Section 10
// in lib/site-pages.ts — no new claim is invented here.
// Its **…** markers are bold lead-ins, rendered here,
// and the contact address is linkified where it appears
// — the Privacy renderer's conventions, carried over
// whole. The About page (app/about) is the brand page
// and is untouched by this step.
export const metadata: Metadata = pageMetadata({
  ...PAGE_SEO["/about-the-data"],
  path: "/about-the-data",
});

function rich(text: string): ReactNode[] {
  const parts = text.split("**");
  return parts.flatMap((part, index) => {
    const segments = part.split(ABOUT_DATA_EMAIL_ADDRESS);
    const nodes = segments.flatMap((segment, segIndex) =>
      segIndex === 0
        ? [segment]
        : [
            <a key={`m${index}-${segIndex}`} href={`mailto:${ABOUT_DATA_EMAIL_ADDRESS}`}>
              {ABOUT_DATA_EMAIL_ADDRESS}
            </a>,
            segment,
          ],
    );
    return index % 2 === 1 ? [<strong key={`s${index}`}>{nodes}</strong>] : nodes;
  });
}

function Block({ block }: { block: PrivacyBlock }) {
  if (block.kind === "ul") {
    return (
      <ul>
        {block.items.map((item) => (
          <li key={item.slice(0, 32)}>{rich(item)}</li>
        ))}
      </ul>
    );
  }
  return <p>{rich(block.text)}</p>;
}

export default function AboutDataPage() {
  return (
    <main className="site-pages">
      {/* BUG-250 (24 Nov 2026): the chrome pages take the
          wider inner (app/globals.css) — the 1080px
          column read as lost on a wide viewport. */}
      <div className="site-pages__inner site-pages__inner--wide">
        <BreadcrumbLd name="About the data" path="/about-the-data" />
        <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "About the data" }]} />
        <div className="privacy-wrap">
          <p className="eyebrow">{ABOUT_DATA_EYEBROW}</p>
          <h1>{ABOUT_DATA_H1}</h1>
          <p className="lead">
            <strong>{ABOUT_DATA_LEAD}</strong> {ABOUT_DATA_LEAD_REST}
          </p>
          <p className="privacy-date">{ABOUT_DATA_DATE_LINE}</p>
          <div className="rule" />

          <div className="stack">
            {ABOUT_DATA_CARDS.map((card) => (
              <article className="card privacy-card" key={card.heading}>
                <h2>{card.heading}</h2>
                {card.blocks.map((block, index) => (
                  <Block key={index} block={block} />
                ))}
              </article>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
