import type { Metadata } from "next";
import type { ReactNode } from "react";

import Breadcrumb from "../../components/Breadcrumb";
import BreadcrumbLd from "../../components/BreadcrumbLd";
import { PAGE_SEO, pageMetadata } from "../../lib/seo";
import {
  REFUNDS_CARDS,
  REFUNDS_DATE_LINE,
  REFUNDS_EMAIL_ADDRESS,
  REFUNDS_EYEBROW,
  REFUNDS_H1,
  REFUNDS_LEAD,
  REFUNDS_LEAD_REST,
  type PrivacyBlock,
} from "../../lib/site-pages";

// M10.4 — Refunds, in the Privacy page's pattern (the
// step's build; the 25 Nov 2026 addition). The refund
// rules as their own page: the Terms' words, restated
// from lib/site-pages.ts — no new rule is invented
// here. Its **…** markers are bold lead-ins, rendered
// here, and the contact address is linkified where it
// appears — the Privacy renderer's conventions, carried
// over whole.
export const metadata: Metadata = pageMetadata({ ...PAGE_SEO["/refunds"], path: "/refunds" });

function rich(text: string): ReactNode[] {
  const parts = text.split("**");
  return parts.flatMap((part, index) => {
    const segments = part.split(REFUNDS_EMAIL_ADDRESS);
    const nodes = segments.flatMap((segment, segIndex) =>
      segIndex === 0
        ? [segment]
        : [
            <a key={`m${index}-${segIndex}`} href={`mailto:${REFUNDS_EMAIL_ADDRESS}`}>
              {REFUNDS_EMAIL_ADDRESS}
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

export default function RefundsPage() {
  return (
    <main className="site-pages">
      {/* BUG-250 (24 Nov 2026): the chrome pages take the
          wider inner (app/globals.css) — the 1080px
          column read as lost on a wide viewport. */}
      <div className="site-pages__inner site-pages__inner--wide">
        <BreadcrumbLd name="Refunds" path="/refunds" />
        <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Refunds" }]} />
        <div className="privacy-wrap">
          <p className="eyebrow">{REFUNDS_EYEBROW}</p>
          <h1>{REFUNDS_H1}</h1>
          <p className="lead">
            <strong>{REFUNDS_LEAD}</strong> {REFUNDS_LEAD_REST}
          </p>
          <p className="privacy-date">{REFUNDS_DATE_LINE}</p>
          <div className="rule" />

          <div className="stack">
            {REFUNDS_CARDS.map((card) => (
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
