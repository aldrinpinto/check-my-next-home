import Link from "next/link";

import { SITE_NAME, SITE_TAGLINE } from "../lib/site";
import { PRIMARY_NAV } from "./SiteHeader";

// M7.1 — the footer shell, built with the header so no later
// step has to invent it: Deep Forest (the brand's dark
// surface), the reversed mark, and the name and tagline as
// live text from lib/site.ts, paired the way the brand pairs
// them (the pairing the plan's own test record checks). The
// link list fills in as pages land; the legal pages complete
// it later.
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
          <ul className="site-footer__list">
            {PRIMARY_NAV.map((item) => (
              <li key={item.href}>
                <Link className="site-footer__link" href={item.href}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
