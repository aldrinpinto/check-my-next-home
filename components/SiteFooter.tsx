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
// the decided sample page's form — the wordmark block on
// the left and the middle links as one line. The middle set
// is the sample's own, not the header's (no Shortlist;
// Contact joins) — so the footer carries its own list now,
// no longer the header's PRIMARY_NAV.
//
// Founder's ruling, 18 Nov 2026: Guides joins the middle
// line between About and Contact, pointing at the /guides
// hub — FOOTER ONLY. This supersedes the M7.8 ruling that
// the guides stay out of the chrome, for the footer only:
// the header keeps its set with no Guides, exactly as the
// Final Sample Master now shows in every view. D77(g)'s
// footer set is therefore: How we check · Sample report ·
// About · Guides · Contact.
//
// Chrome unification (founder ruling, 18 Nov 2026): this is
// the ONE footer on every page. The content chrome's
// stacked footer — and its long closing line as footer
// small print — is retired; there is no variant. Privacy
// policy joins the link row after Contact. The sources
// line that stood at the bottom row's extreme right
// ("Data from named official sources. Facts, not
// scores.") is REMOVED (BUG-197, founder-directed
// 23 Nov 2026) — the bottom row now carries the legal
// block alone (see .site-footer__bottom in
// app/globals.css). The same sentence in the paid
// report PDF's footer (lib/report-pdf.ts) is a separate
// surface and stands untouched by that ruling.
const FOOTER_LINKS = [
  { label: "How we check", href: "/how-we-check" },
  { label: "Sample report", href: "/sample-report" },
  { label: "About", href: "/about" },
  { label: "Guides", href: "/guides" },
  { label: "Contact", href: "/contact" },
  { label: "Privacy policy", href: "/privacy" },
  // M9.4 — Terms of service joins after Privacy policy:
  // the site carries the words before the first paid
  // report is sold (the 18 Nov 2026 Terms adoption), and
  // the Final Sample Master's footer is conformed in the
  // same build.
  { label: "Terms of service", href: "/terms" },
] as const;

// Footer batch (founder, folded into the BUG-185 build
// 23 Nov 2026): the bottom row gains the © line and the
// brand's two social icons on its left. The icon links carry
// the brand's own handles — instagram.com/checkmynexthome
// and facebook.com/checkmynexthome — drawn as inline SVG
// glyphs in the footer's Brass pale, like the links.
export const FOOTER_SOCIALS = [
  {
    label: "Instagram",
    href: "https://www.instagram.com/checkmynexthome",
    ariaLabel: "Check My Next Home on Instagram",
  },
  {
    label: "Facebook",
    href: "https://www.facebook.com/checkmynexthome",
    ariaLabel: "Check My Next Home on Facebook",
  },
] as const;

function SocialIcon({ label }: { label: string }) {
  if (label === "Instagram") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="17.2" cy="6.8" r="1.3" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13.5 21v-7h2.4l.4-3h-2.8V9.1c0-.9.3-1.5 1.6-1.5h1.3V4.9c-.3 0-1.1-.1-2-.1-2 0-3.4 1.2-3.4 3.5V11H8.5v3H11v7h2.5Z" />
    </svg>
  );
}

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
      </div>
      <div className="site-footer__bottom">
        <div className="site-footer__legal">
          <p className="site-footer__copyright">
            © {new Date().getFullYear()} {SITE_NAME}
          </p>
          <span className="site-footer__social">
            {FOOTER_SOCIALS.map((social) => (
              <a
                key={social.label}
                className="site-footer__social-link"
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={social.ariaLabel}
              >
                <SocialIcon label={social.label} />
              </a>
            ))}
          </span>
        </div>
      </div>
    </footer>
  );
}
