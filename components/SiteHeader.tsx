import Link from "next/link";
import { Fragment } from "react";

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

export default function SiteHeader({
  shortlistCount,
  variant = "app",
  currentPath,
}: {
  shortlistCount?: number;
  // The samples' second chrome family (D2, parity fix
  // stack, 18 Nov 2026): "content" renders the site pages'
  // chrome of views 4–8 — the 1080px container, the 44px
  // Forest-square mark, the Newsreader wordmark with the
  // tagline under it in plain case, and the nav as a
  // second row under a hairline, dot-separated, the
  // current page as a Forest pill. The default render —
  // the app chrome every existing test pins — is
  // unchanged. The content nav keeps all five primary
  // items as live links, Shortlist with its count badge
  // included; the Master shows Shortlist as a muted span
  // only because its sample pages are static snapshots.
  variant?: "app" | "content";
  currentPath?: string;
}) {
  if (variant === "content") {
    return (
      <header className="site-header site-header--content">
        <div className="site-header-in">
          <div className="brand-row">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 11.5 12 4l8 7.5"
                  stroke="#FDF8E8"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M9.5 20v-5.5h5V20"
                  stroke="#FDF8E8"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M15.8 8.6l2.6-2.6"
                  stroke="#C29A3B"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span>
              <span className="wordmark">{SITE_NAME}</span>
              <span className="wordmark-tag">{SITE_TAGLINE}</span>
            </span>
          </div>
          <nav className="site-nav" aria-label="Primary">
            {PRIMARY_NAV.map((item, index) => (
              <Fragment key={item.href}>
                {index > 0 && (
                  <span className="nav-sep" aria-hidden="true">
                    ·
                  </span>
                )}
                <Link
                  href={item.href}
                  aria-current={currentPath === item.href ? "page" : undefined}
                >
                  {item.label}
                  {item.label === "Shortlist" &&
                    (shortlistCount !== undefined ? (
                      <span className="shortlist-count">{shortlistCount}</span>
                    ) : (
                      <ShortlistCountBadge />
                    ))}
                </Link>
              </Fragment>
            ))}
          </nav>
        </div>
      </header>
    );
  }
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
