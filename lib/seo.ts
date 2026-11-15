import type { Metadata } from "next";

import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL, isProductionEnv } from "./site";

// M2.11 — technical SEO skeleton (plan, SEO appendix card D).
//
// The metadata helper: every page builds its metadata through
// pageMetadata() so each page gets its OWN title, description and
// canonical URL — there are deliberately no shared defaults that could
// duplicate across pages. Canonicals resolve against the canonical host
// (metadataBase), checkmynexthome.co.uk.
export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string; // the page's own path, e.g. "/" or "/check/flood-risk"
}): Metadata {
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: { canonical: path },
    // Open Graph fields, locked at M6.10 (D38): og:title,
    // og:description, og:type and og:url are derived from the
    // SAME per-page title, description and canonical the search
    // metadata carries, so a shared link can never drift from
    // the search wording. Deliberately NO og:image yet — the
    // image lands at M7.1 from the brand asset pack.
    openGraph: {
      title,
      description,
      type: "website",
      url: path,
    },
    // Play/test environments stay out of search engines (M2.7 — also
    // enforced by the X-Robots-Tag header in public/_headers). Only the
    // real site (environment name "production") is indexable.
    robots: isProductionEnv() ? undefined : { index: false, follow: false },
  };
}

// M6.10 (decision D38) — the locked SEO wording set: every public
// page's title and meta description, fixed here as constants, ONE
// source that M7's pages consume — never retyped per page.
//
// The per-page rule is locked by construction: this record holds
// NO default title or description, and every entry carries its
// own — there is nothing here for a page to inherit. (The root
// layout's metadata is today's single call site and consumes the
// homepage entry below; M7 performs the move of metadata into
// the pages, bound by this rule.) Every path except the two
// trust pages has a row on the SEO intent map
// (docs/seo-intent-map.md); the trust pages are not search
// targets but still carry their own title and meta — every page
// does.
//
// The wording rules the set is locked under (D38):
//   - NO figures in any title or meta, ever — titles and metas
//     are postcode-independent, so a figure would be a claim
//     about everywhere. The only digits in the set are names and
//     basis phrases ("Article 4", "the 12 months named"), never
//     data. No "%", no "£".
//   - Meta descriptions are descriptive, with the as-published
//     frame — what is checked and from what official source
//     family. Never mover-addressed questions, never outcome
//     promises.
//   - A title may carry the searcher's question verbatim, never
//     our answer to it (the families guide). Interrogative
//     titles are the searcher's words; declarative titles get
//     no such shelter from the banned-wording scan.
//   - The banned-wording union (tests/banned-wording.ts) runs
//     over every string in this set (tests/seo.test.ts).
export const PAGE_SEO = {
  "/": {
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  "/guides/checks-before-buying-a-house": {
    title: "Checks before buying a house | Check My Next Home",
    description:
      "The full checklist of checks to run before buying a house in the UK — what each check covers, where its facts come from, and how to run them all from one postcode.",
  },
  "/check/flood-risk": {
    title: "Flood risk check — the published flood facts for a postcode | Check My Next Home",
    description:
      "The flood zones and the river, sea and surface-water bands published for a postcode, from Environment Agency data as published. We hold no record of past flooding at any home.",
  },
  "/check/crime": {
    title: "Crime check — recorded crime counts near a postcode | Check My Next Home",
    description:
      "Recorded crime counts near a postcode, from police data as published, over the 12 months named.",
  },
  "/check/sold-prices": {
    title: "Sold prices — recorded sale prices in a postcode | Check My Next Home",
    description:
      "Recorded sale prices in a postcode, from HM Land Registry Price Paid data as published, with the postcode's middle recorded sale price. It is not a valuation of this home.",
  },
  "/check/schools": {
    title: "Schools check — the nearest schools to a postcode | Check My Next Home",
    description:
      "The nearest schools and nurseries to a postcode, with straight-line distances, from Department for Education data as published. The check holds no catchment position and never promises a school place.",
  },
  "/check/epc": {
    title: "EPC check — the recorded energy certificate for a home | Check My Next Home",
    description:
      "The energy performance certificate recorded for a home, shown as recorded, from the official register — its band, its figures, and how the postcode's recorded certificates spread across the bands.",
  },
  "/check/council-tax-band": {
    title: "Council tax check — the council's charges for a postcode | Check My Next Home",
    description:
      "A home's own council tax band is not published in the data we hold, so the check shows the council's scale instead: the average Band D charge for the area, as published, and each band's charge on that scale.",
  },
  "/guides/buying-a-leasehold-flat": {
    title: "What to check when buying a leasehold flat | Check My Next Home",
    description:
      "A guide to the leasehold questions to ask before buying a flat — lease length, service charge and ground rent — and where each answer lives: the lease and the management pack. There is no per-home leasehold check.",
  },
  "/check/planning-constraints": {
    title: "Planning constraints check — the recorded position for a home | Check My Next Home",
    description:
      "Conservation area, Article 4 and listed-building facts for a home, as recorded in the national data. Planning applications are not held here — the check names the council and links to its own register.",
  },
  "/check/ev-charging": {
    title: "EV charging check — public charge points near a postcode | Check My Next Home",
    description:
      "Public electric car charge points near a postcode, by site, with straight-line distances, from the national charge point data as published.",
  },
  "/check/broadband": {
    title: "Broadband check — the published coverage for a postcode | Check My Next Home",
    description:
      "The share of premises in a postcode where each broadband service is available, from Ofcom data as published — a postcode share, not a prediction for one address, and never a speed any home will get.",
  },
  "/check/public-transport": {
    title: "Public transport check — stops and stations near a postcode | Check My Next Home",
    description:
      "The nearest bus stops and stations to a postcode, the routes serving them, and straight-line distances, from the national stops and stations data as published.",
  },
  "/check/family-essentials": {
    title: "Family essentials check — the nearest schools, nurseries and GPs | Check My Next Home",
    description:
      "One combined view of the family essentials near a postcode — the nearest schools, nurseries, GP surgeries and hospitals, with straight-line distances, each from its official data as published.",
  },
  "/guides/is-this-area-good-for-families": {
    // The searcher's question, verbatim — never our answer (D38).
    title: "Is this area good for families? | Check My Next Home",
    description:
      "The facts a family move turns on, laid out for a postcode — schools, nurseries, GPs, hospitals, crime counts and green space, each as published. The guide states the facts and leaves the judgement to the family.",
  },
  "/check/noise": {
    title: "Noise check — the published noise bands for a postcode | Check My Next Home",
    description:
      "The road, rail and airport noise bands published for a postcode, day and night, in the publisher's own band wording, from Defra data as published.",
  },
  "/check/air-quality": {
    title: "Air quality check — modelled figures for a postcode | Check My Next Home",
    description:
      "Modelled air quality figures for the square around a postcode — nitrogen dioxide and fine particles — from Defra data as published, with no comparison to legal limits in the answer.",
  },
  "/check/solar-potential": {
    title: "Solar yield check — the modelled yield for this location | Check My Next Home",
    description:
      "The modelled solar yield for a location, from PVGIS data as published — a fact about the place, worked out on a standard unshaded, south-facing basis. It says nothing about any one roof.",
  },
  "/check/mobile-coverage": {
    title:
      "Mobile coverage check — the published coverage for the council area | Check My Next Home",
    description:
      "Modelled mobile coverage for the council area a postcode sits in, from Ofcom data as published — the council is named in every answer, and the figures describe the area, not the signal inside one home.",
  },
  "/how-we-check": {
    title: "How we check | Check My Next Home",
    description:
      "How each check is worked out — the data behind every figure, where it comes from, and its known limits, in plain English.",
  },
  "/about-the-data": {
    title: "About the data | Check My Next Home",
    description:
      "The data the checks present, who publishes it, and the standing wording that travels with it: official data as it is published, with its source and date.",
  },
} as const;

export type PageSeoPath = keyof typeof PAGE_SEO;

// The homepage entry, named for its one current consumer (the
// root layout, until M7 moves metadata into the pages).
export const HOME_PAGE_SEO = PAGE_SEO["/"];

// Structured data, sitewide (card D: "Structured data only where
// honest"). Organization + WebSite only, and only facts that are true
// today: no logo (not finalised), no search action (no live site search
// to point at yet). Rendered by app/JsonLd.tsx.
export const ORGANIZATION_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: `${SITE_URL}/`,
} as const;

export const WEBSITE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  inLanguage: "en-GB",
} as const;
