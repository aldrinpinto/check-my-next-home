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
  noindex = false,
}: {
  title: string;
  description: string;
  path: string; // the page's own path, e.g. "/" or "/check/flood-risk"
  // M7.8: pages that must stay out of search in EVERY
  // environment — the journey's results pages above all —
  // pass noindex and get the robots lock unconditionally,
  // independent of the environment name. A specific home's
  // results page is never an indexable page (its facts are
  // one family's check), and until this step the production
  // build would have indexed it: the environment rule below
  // only locks non-production environments.
  noindex?: boolean;
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
    // the search wording. The og:image landed at M7.1: one
    // composed card for the whole site (the lockup on Cream,
    // name + tagline — the pairing the social-card rule
    // requires), served from the canonical host.
    openGraph: {
      title,
      description,
      type: "website",
      url: path,
      images: [
        {
          url: OG_IMAGE_PATH,
          width: OG_IMAGE_WIDTH,
          height: OG_IMAGE_HEIGHT,
          alt: OG_IMAGE_ALT,
        },
      ],
    },
    // Play/test environments stay out of search engines (M2.7 — also
    // enforced by the X-Robots-Tag header in public/_headers). Only the
    // real site (environment name "production") is indexable — and
    // even there, a page that passes noindex stays out (M7.8).
    robots: noindex || !isProductionEnv() ? { index: false, follow: false } : undefined,
  };
}

// The Open Graph card (M7.1): composed from the brand pack as
// a static 1200x630 asset — the Roof-Tick lockup on Cream with
// the name and the D12 tagline, so a shared link shows the
// brand pairing, never a bare square avatar platforms would
// crop. The PNG itself is carried as public/og-image.png.b64
// and materialised at build time (scripts/
// materialise-binary-assets.mjs).
export const OG_IMAGE_PATH = "/og-image.png";
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const OG_IMAGE_ALT = `${SITE_NAME} — ${SITE_TAGLINE}`;

// The served brand mark: the master SVG under public/brand/.
// Structured data names it by its canonical-host URL, so the
// schema and the header always point at one location.
export const LOGO_PATH = "/brand/logo-mark.svg";
export const LOGO_URL = `${SITE_URL}${LOGO_PATH}`;

// M6.10 (decision D38) — the locked SEO wording set: every public
// page's title and meta description, fixed here as constants, ONE
// source that M7's pages consume — never retyped per page.
//
// The per-page rule is locked by construction: this record holds
// NO default title or description, and every entry carries its
// own — there is nothing here for a page to inherit. (Until
// M7.8 the root layout was the single call site, consuming the
// homepage entry for every route; M7.8 performed the move of
// metadata into the pages, bound by this rule — every page now
// exports its own.) Every path except the trust and chrome
// pages has a row on the SEO intent map
// (docs/seo-intent-map.md); those pages are not search targets
// but still carry their own title and meta — every page does.
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
  // 18 Nov 2026 — the guides hub's pair, locked under the
  // same D38 process when the founder's footer ruling made
  // /guides a real page (the footer's Guides destination).
  // The hub is a chrome page, not a search target in its own
  // right, but every page carries its own pair — this one
  // included. The sitemap derives from this record, so the
  // hub joins it by construction.
  "/guides": {
    title: "Guides | Check My Next Home",
    description:
      "The Check My Next Home guides, in plain English: what to check before buying a house, the questions to ask when buying a leasehold flat, and the facts that bear on whether an area suits a family. Each guide links to the checks it draws on.",
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
  "/check/building-safety": {
    title:
      "Building safety check — tribunal decisions and the high-rise register | Check My Next Home",
    description:
      "The building-safety records for a postcode: the tribunal's published remediation decisions naming it, and the Building Safety Regulator's register of high-rise residential buildings — and what an empty answer does and does not mean.",
  },
  "/how-we-check": {
    title: "How we check | Check My Next Home",
    description:
      "How each check is worked out — the data behind every figure, where it comes from, and its known limits, in plain English.",
  },
  // M7.8 — the chrome pages' pairs, locked here under the
  // same D38 process at the paths the chrome itself uses.
  // About's pair is re-locked at /about (the path the header,
  // the footer and the finalised samples all link), superseding
  // the /about-the-data pair M6.10 locked before the About page
  // existed: that path was never linked from anywhere and no
  // page ever stood behind it. The standing wording the old
  // pair described lives on the How we check page and in the
  // About page's own copy — the pair's subject did not vanish,
  // its path was corrected.
  "/about": {
    title: "About | Check My Next Home",
    description:
      "About Check My Next Home — an independent checker that gathers the facts about a home from official sources onto one page, every fact shown with its source and date, written for the family who'll live there.",
  },
  // M8.8 — the sample report's pair, re-locked for the
  // step's mapped intent ("home buyer report / property
  // check example"): the title and description both say
  // "example" in plain words, so the page can never be
  // mistaken for a live result for a real home. The page
  // it dresses stays noindexed until the go-live flip —
  // see SAMPLE_REPORT_INDEXABLE below.
  "/sample-report": {
    title:
      "Home buyer report example — the full property check, worked on one example home | Check My Next Home",
    description:
      "An example home buyer report, worked in full on one invented example home — every section the detailed property check carries, so you can see exactly what a report holds before you order one.",
  },
  "/contact": {
    title: "Contact | Check My Next Home",
    description:
      "How to contact Check My Next Home — write through the page or by email with a question, a correction, or something that looks off. We reply within two working days.",
  },
  "/privacy": {
    title: "Privacy policy | Check My Next Home",
    description:
      "The privacy policy for Check My Next Home, in plain English — what the site collects when you run a check or buy a report, the services that handle it, and what we never do with it.",
  },
  // M9.4 — the Terms page's locked pair, in the Privacy
  // pair's form. No figure in the pair (D38's
  // snippet-risk lock): the price is named on the page,
  // never in a title or a meta.
  "/terms": {
    title: "Terms of service | Check My Next Home",
    description:
      "The terms of service for Check My Next Home — what the detailed report is and is not, how it is bought and delivered, and the refund rules.",
  },
} as const;

// M8.8 — the sample report's go-live gate: THE one place
// the sample's indexable switch lives. Everything the
// switch governs reads this constant and nothing else:
//   - the page's metadata (app/sample-report/page.tsx
//     passes noindex: !SAMPLE_REPORT_INDEXABLE, so the
//     robots lock holds in EVERY environment, the
//     production name included — the environment rule
//     alone would open the page the day the real site's
//     name is set, gate or no gate);
//   - the sitemap (app/sitemap.ts omits /sample-report
//     while this is false — T-SEO-02: a noindexed page is
//     absent from the sitemap);
//   - the sample PDF download (app/sample-report.pdf
//     carries X-Robots-Tag: noindex while this is false).
// It stays false through the play period: the sample is
// fully built, linked and downloadable, but no search
// engine is invited to it yet. THE FLIP, at go-live
// (M12, on the real domain): set this constant to true
// and update the one pin that names its current value
// (tests/seo-pages.test.ts). Nothing else changes —
// metadata, sitemap and the PDF header all follow.
export const SAMPLE_REPORT_INDEXABLE = false;

export type PageSeoPath = keyof typeof PAGE_SEO;

// The homepage entry, named for its consumer — the homepage
// itself since M7.8 moved metadata into the pages.
export const HOME_PAGE_SEO = PAGE_SEO["/"];

// Structured data, sitewide (card D: "Structured data only where
// honest"). Organization + WebSite only, and only facts that are true
// today: no search action (no live site search to point at yet). The
// logo joined at M7.1, when the brand pack was applied — M2.11
// shipped without one because the logo was not final then.
// Rendered by app/JsonLd.tsx.
export const ORGANIZATION_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  logo: LOGO_URL,
} as const;

export const WEBSITE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  inLanguage: "en-GB",
} as const;

// M7.8 — BreadcrumbList structured data for the content
// pages (the check pages, the guides and the chrome pages).
// The trail is the honest form the step settled: Home →
// this page, with a middle item where the page genuinely
// has a parent. There is no /check index page to name as
// a middle item, so the check pages keep the two-item
// form; the /guides hub IS the guides' parent, so a guide
// page takes the three-item form Home → Guides → guide.
// (BUG-229, 24 Nov 2026: the visible trail is drawn now,
// and the structured data matches it. This supersedes the
// M7.8 decision that the guides keep the two-item form —
// the hub was then "a footer destination, not a breadcrumb
// parent"; the founder's BUG-229 ruling makes it the
// parent of the guide pages in the trail, visible and
// structured alike. The hub stays footer-only in the
// chrome: no Guides link in the header.)
// The trail is rendered visibly too (components/Breadcrumb,
// BUG-229) — the samples showed none before.
export function breadcrumbSchema({
  name,
  path,
  parents = [],
}: {
  name: string; // the page's own short name, e.g. "Flood risk check"
  path: string; // the page's own path, e.g. "/check/flood-risk"
  parents?: { name: string; path: string }[]; // middle items, e.g. Guides
}) {
  const trail = [
    { name: "Home", item: `${SITE_URL}/` },
    ...parents.map((parent) => ({ name: parent.name, item: `${SITE_URL}${parent.path}` })),
    { name, item: `${SITE_URL}${path}` },
  ];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: entry.item,
    })),
  } as const;
}
