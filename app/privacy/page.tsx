import type { Metadata } from "next";
import type { ReactNode } from "react";

import Breadcrumb from "../../components/Breadcrumb";
import BreadcrumbLd from "../../components/BreadcrumbLd";
import { PAGE_SEO, pageMetadata } from "../../lib/seo";
import {
  PRIVACY_CARDS,
  PRIVACY_DATE_LINE,
  PRIVACY_EMAIL_ADDRESS,
  PRIVACY_EYEBROW,
  PRIVACY_H1,
  PRIVACY_LEAD,
  PRIVACY_LEAD_REST,
  type PrivacyBlock,
} from "../../lib/site-pages";

// M7.8 — Privacy policy (Final Sample Master view 8). Its
// locked pair is newly locked at /privacy under the adopted
// scope ruling (the sample's mock URL bar shows
// /privacy-policy; the ruling's path is /privacy, and the
// pair, the route and the sitemap all use it — recorded in
// the build note). Copy is the finalised sample's, held in
// lib/site-pages.ts; its **…** markers are the sample's bold
// lead-ins, rendered here, and the privacy address is
// linkified where it appears.
export const metadata: Metadata = pageMetadata({ ...PAGE_SEO["/privacy"], path: "/privacy" });

function rich(text: string): ReactNode[] {
  const parts = text.split("**");
  return parts.flatMap((part, index) => {
    const segments = part.split(PRIVACY_EMAIL_ADDRESS);
    const nodes = segments.flatMap((segment, segIndex) =>
      segIndex === 0
        ? [segment]
        : [
            <a key={`m${index}-${segIndex}`} href={`mailto:${PRIVACY_EMAIL_ADDRESS}`}>
              {PRIVACY_EMAIL_ADDRESS}
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

export default function PrivacyPage() {
  return (
    <main className="site-pages">
      <div className="site-pages__inner">
        <BreadcrumbLd name="Privacy policy" path="/privacy" />
        <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Privacy policy" }]} />
        {/* D5 (parity fix stack, 18 Nov 2026): the policy
            sits in the sample's 820px .privacy-wrap inside
            the 1080px measure. */}
        <div className="privacy-wrap">
          <p className="eyebrow">{PRIVACY_EYEBROW}</p>
          <h1>{PRIVACY_H1}</h1>
          <p className="lead">
            <strong>{PRIVACY_LEAD}</strong> {PRIVACY_LEAD_REST}
          </p>
          <p className="privacy-date">{PRIVACY_DATE_LINE}</p>
          <div className="rule" />

          <div className="stack">
            {PRIVACY_CARDS.map((card) => (
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
