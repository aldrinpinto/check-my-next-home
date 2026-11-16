import Link from "next/link";

import { SITE_NAME, SITE_TAGLINE } from "../lib/site";

// M7.1 — the header shell, built once for every page. White
// header: the Roof-Tick mark (the finalised Logo 1, served from
// /brand/) plus the name and tagline as LIVE TEXT from
// lib/site.ts — never a baked lockup image, so the header
// wording can never drift from the one source. The manifesto
// is never in the header (D12); it is the homepage hero's
// kicker. Navigation is the V1 set (D44): How we check,
// Guides, Sample report, Shortlist. The pages behind Guides,
// Sample report and Shortlist do not exist yet — dead-end
// links this step are expected and land with their steps.
// The Shortlist count badge's styling is defined in the kit
// now (app/globals.css); the count itself arrives at M7.5, so
// the badge renders only when a count is passed.

export const PRIMARY_NAV = [
  { label: "How we check", href: "/how-we-check" },
  { label: "Guides", href: "/guides" },
  { label: "Sample report", href: "/sample-report" },
  { label: "Shortlist", href: "/shortlist" },
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
                  {item.label === "Shortlist" && shortlistCount !== undefined && (
                    <span className="shortlist-count">{shortlistCount}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
