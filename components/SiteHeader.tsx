import Link from "next/link";

import { SITE_NAME, SITE_TAGLINE } from "../lib/site";
import ShortlistCountBadge from "./ShortlistCountBadge";

// M7.1 — the header shell, built once for every page. White
// header: the Roof-Tick mark (the finalised Logo 1, served from
// /brand/) plus the name and tagline as LIVE TEXT from
// lib/site.ts — never a baked lockup image, so the header
// wording can never drift from the one source. The manifesto
// is never in the header (D12); it is the homepage hero's
// kicker. Navigation was the V1 set (D44): How we check,
// Guides, Sample report, Shortlist. The pages behind Sample
// report and Shortlist do not exist yet — dead-end
// links this step are expected and land with their steps.
// The Shortlist count badge's styling is defined in the kit
// now (app/globals.css); the count itself arrived at M7.5 as
// a client island (ShortlistCountBadge — the server header
// cannot read browser storage), so the prop still renders
// the badge directly when a count is passed, and the island
// renders it otherwise.
//
// Fidelity pass 2 (founder, 17 Nov 2026): the navigation is
// now the decided sample page's set — How we check, Sample
// report, About, Shortlist — with no "Check a home" button.
// The sample governs the landing chrome, and the header is
// shared, so the set changes site-wide; D44's Guides item is
// superseded for the chrome and returns when guide pages
// exist (their SEO entries in lib/seo.ts are untouched).

export const PRIMARY_NAV = [
  { label: "How we check", href: "/how-we-check" },
  { label: "Sample report", href: "/sample-report" },
  { label: "About", href: "/about" },
  { label: "Shortlist", href: "/shortlist" },
  // D77(g) (fold-in build): Contact joins the header nav;
  // the footer set is unchanged.
  { label: "Contact", href: "/contact" },
] as const;

export default function SiteHeader({ shortlistCount }: { shortlistCount?: number }) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="brand" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element -- the kit serves the mark as a plain static asset; next/image adds nothing on a static export */}
          <img className="brand__mark" src="/brand/logo-mark.svg" alt="" width="44" height="44" />
          <span>
            <span className="brand__name">{SITE_NAME}</span>
            <span className="brand__tagline">{SITE_TAGLINE}</span>
          </span>
        </Link>
        <nav className="site-nav" aria-label="Primary">
          <ul className="site-nav__list">
            {PRIMARY_NAV.map((item) => (
              <li key={item.href}>
                <Link className="site-nav__link" href={item.href}>
                  {item.label}
                  {item.label === "Shortlist" &&
                    (shortlistCount !== undefined ? (
                      <span className="shortlist-count">{shortlistCount}</span>
                    ) : (
                      <ShortlistCountBadge />
                    ))}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
