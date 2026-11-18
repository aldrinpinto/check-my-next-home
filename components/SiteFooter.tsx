import Link from "next/link";

import { SITE_NAME, SITE_TAGLINE } from "../lib/site";

// M7.1 — the footer shell, built with the header so no later
// step has to invent it: Deep Forest (the brand's dark
// surface), the reversed mark, and the name and tagline as
// live text from lib/site.ts, paired the way the brand pairs
// them (the pairing the plan's own test record checks). The
// link list fills in as pages land; the legal pages complete
// it later.
//
// Fidelity pass 2 (founder, 17 Nov 2026): the footer takes
// the decided sample page's three-part form — the wordmark
// block on the left, the middle links as one line, and the
// sources line on the right: "Data from named official
// sources. Facts, not scores." The middle set is the
// sample's own, not the header's (no Shortlist; Contact
// joins) — so the footer carries its own list now, no longer
// the header's PRIMARY_NAV.
//
// Founder's ruling, 18 Nov 2026: Guides joins the middle
// line between About and Contact, pointing at the /guides
// hub — FOOTER ONLY. This supersedes the M7.8 ruling that
// the guides stay out of the chrome, for the footer only:
// the header keeps its set with no Guides, exactly as the
// Final Sample Master now shows in every view. D77(g)'s
// footer set is therefore: How we check · Sample report ·
// About · Guides · Contact.
const FOOTER_LINKS = [
  { label: "How we check", href: "/how-we-check" },
  { label: "Sample report", href: "/sample-report" },
  { label: "About", href: "/about" },
  { label: "Guides", href: "/guides" },
  { label: "Contact", href: "/contact" },
] as const;

export const FOOTER_SOURCES_LINE = "Data from named official sources. Facts, not scores.";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <span className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- plain static asset, as in the header */}
          <img
            className="brand__mark"
            src="/brand/logo-mark-reversed.svg"
            alt=""
            width="44"
            height="44"
          />
          <span>
            <span className="brand__name">{SITE_NAME}</span>
            <span className="brand__tagline">{SITE_TAGLINE}</span>
          </span>
        </span>
        <nav className="site-footer__nav" aria-label="Footer">
          {FOOTER_LINKS.map((item, index) => (
            <span key={item.href}>
              {index > 0 && (
                <span className="site-footer__sep" aria-hidden="true">
                  {" · "}
                </span>
              )}
              <Link className="site-footer__link" href={item.href}>
                {item.label}
              </Link>
            </span>
          ))}
        </nav>
        <p className="site-footer__sources">{FOOTER_SOURCES_LINE}</p>
      </div>
    </footer>
  );
}
