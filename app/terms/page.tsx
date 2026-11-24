import type { Metadata } from "next";
import type { ReactNode } from "react";

import Breadcrumb from "../../components/Breadcrumb";
import BreadcrumbLd from "../../components/BreadcrumbLd";
import { PAGE_SEO, pageMetadata } from "../../lib/seo";
import {
  TERMS_CARDS,
  TERMS_DATE_LINE,
  TERMS_EMAIL_ADDRESS,
  TERMS_EYEBROW,
  TERMS_H1,
  TERMS_LEAD,
  TERMS_LEAD_REST,
  type PrivacyBlock,
} from "../../lib/site-pages";

// M9.4 — Terms of service, in the Privacy page's pattern
// (the step's build; the 18 Nov 2026 Terms adoption).
// The site carries these words before the first paid
// report is sold: what the report is and is not, the
// purchase and delivery terms, the gift, and the refund
// rules. Copy is held in lib/site-pages.ts, drafted in
// the build and approved by the founder before the
// push; the page is also the full-wording home of the
// D9 standing disclaimer. Its **…** markers are bold
// lead-ins, rendered here, and the contact address is
// linkified where it appears — the Privacy renderer's
// conventions, carried over whole.
export const metadata: Metadata = pageMetadata({ ...PAGE_SEO["/terms"], path: "/terms" });

function rich(text: string): ReactNode[] {
  const parts = text.split("**");
  return parts.flatMap((part, index) => {
    const segments = part.split(TERMS_EMAIL_ADDRESS);
    const nodes = segments.flatMap((segment, segIndex) =>
      segIndex === 0
        ? [segment]
        : [
            <a key={`m${index}-${segIndex}`} href={`mailto:${TERMS_EMAIL_ADDRESS}`}>
              {TERMS_EMAIL_ADDRESS}
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

export default function TermsPage() {
  return (
    <main className="site-pages">
      <div className="site-pages__inner">
        <BreadcrumbLd name="Terms of service" path="/terms" />
        <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Terms of service" }]} />
        <div className="privacy-wrap">
          <p className="eyebrow">{TERMS_EYEBROW}</p>
          <h1>{TERMS_H1}</h1>
          <p className="lead">
            <strong>{TERMS_LEAD}</strong> {TERMS_LEAD_REST}
          </p>
          <p className="privacy-date">{TERMS_DATE_LINE}</p>
          <div className="rule" />

          <div className="stack">
            {TERMS_CARDS.map((card) => (
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
