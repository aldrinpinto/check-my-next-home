import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Metadata } from "next";

import { CheckPageView, GuidePageView, GuidesHubView } from "../components/ContentPage";
import { CHECK_PAGES, CHECK_PAGE_PATHS, GUIDES, GUIDE_PATHS } from "../lib/check-pages";
import { HOME_CHECK_TILES } from "../lib/home";
import { PAGE_SEO, SAMPLE_REPORT_INDEXABLE, breadcrumbSchema } from "../lib/seo";
import { SITE_URL } from "../lib/site";

// M7.8 — the per-route metadata harness. The indexing
// assertions run at metadata level under a production
// environment name, as the step's adopted gap check ruled:
// each route's exported metadata is rendered here in node,
// not read off the play-configured server (which noindexes
// everything by design and could never prove the production
// behaviour). The environment name is set BEFORE the page
// modules are imported, because a page's metadata is
// computed when its module loads.

const ORIGINAL_ENV = process.env.NEXT_PUBLIC_SITE_ENV;

type MetadataModule = { metadata: Metadata };

const INDEXABLE_ROUTES: Record<string, () => Promise<MetadataModule>> = {
  "/": () => import("../app/page"),
  "/check/flood-risk": () => import("../app/check/flood-risk/page"),
  "/check/crime": () => import("../app/check/crime/page"),
  "/check/sold-prices": () => import("../app/check/sold-prices/page"),
  "/check/schools": () => import("../app/check/schools/page"),
  "/check/epc": () => import("../app/check/epc/page"),
  "/check/council-tax-band": () => import("../app/check/council-tax-band/page"),
  "/check/planning-constraints": () => import("../app/check/planning-constraints/page"),
  "/check/ev-charging": () => import("../app/check/ev-charging/page"),
  "/check/broadband": () => import("../app/check/broadband/page"),
  "/check/public-transport": () => import("../app/check/public-transport/page"),
  "/check/family-essentials": () => import("../app/check/family-essentials/page"),
  "/check/noise": () => import("../app/check/noise/page"),
  "/check/air-quality": () => import("../app/check/air-quality/page"),
  "/check/solar-potential": () => import("../app/check/solar-potential/page"),
  "/check/mobile-coverage": () => import("../app/check/mobile-coverage/page"),
  // Follow-up stack (BUG-128) — the building-safety
  // check page joins the indexable set with its own
  // locked pair.
  "/check/building-safety": () => import("../app/check/building-safety/page"),
  "/guides": () => import("../app/guides/page"),
  "/guides/checks-before-buying-a-house": () =>
    import("../app/guides/checks-before-buying-a-house/page"),
  "/guides/buying-a-leasehold-flat": () => import("../app/guides/buying-a-leasehold-flat/page"),
  "/guides/is-this-area-good-for-families": () =>
    import("../app/guides/is-this-area-good-for-families/page"),
  "/how-we-check": () => import("../app/how-we-check/page"),
  "/about": () => import("../app/about/page"),
  "/contact": () => import("../app/contact/page"),
  "/privacy": () => import("../app/privacy/page"),
  // M9.4 — the Terms page joins the indexable set with
  // its own locked pair, in the Privacy page's pattern.
  "/terms": () => import("../app/terms/page"),
  // M10.4 — the Refunds and About the data pages join
  // the indexable set with their own locked pairs.
  "/refunds": () => import("../app/refunds/page"),
  "/about-the-data": () => import("../app/about-the-data/page"),
};

// M8.8 — the sample report stands apart from the
// indexable set: it holds a locked pair like any page,
// but its indexability is gated (SAMPLE_REPORT_INDEXABLE,
// lib/seo.ts) and it stays noindexed until the go-live
// flip. Its metadata is asserted in its own describe
// below, not in the indexable sweep.
const SAMPLE_ROUTE: Record<string, () => Promise<MetadataModule>> = {
  "/sample-report": () => import("../app/sample-report/page"),
};

const JOURNEY_ROUTES: Record<string, () => Promise<MetadataModule>> = {
  "/search": () => import("../app/search/page"),
  "/search/home": () => import("../app/search/home/page"),
  "/search/failed": () => import("../app/search/failed/page"),
  "/shortlist": () => import("../app/shortlist/page"),
  "/report": () => import("../app/report/page"),
  // M8.8 — the sample PDF's internal print view: explicit
  // noindex in every environment (inline, not via
  // PAGE_SEO), like the journey routes.
  "/sample-report/print": () => import("../app/sample-report/print/page"),
  // M7.13 — the Check Together claim flow: explicit
  // noindex in every environment (the routes carry it
  // inline, not via PAGE_SEO).
  "/gift": () => import("../app/gift/page"),
  "/gift/[token]": () => import("../app/gift/[token]/page"),
  "/gift/[token]/claimed": () => import("../app/gift/[token]/claimed/page"),
  // M8.6 — the download link's landing page: explicit
  // noindex in every environment (inline, like the gift
  // routes), reached only via the private link in a
  // delivery or re-issue email.
  "/report/download/[token]": () => import("../app/report/download/[token]/page"),
};

const loaded = new Map<string, Metadata>();

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SITE_ENV = "production";
  for (const [path, load] of Object.entries({
    ...INDEXABLE_ROUTES,
    ...SAMPLE_ROUTE,
    ...JOURNEY_ROUTES,
  })) {
    loaded.set(path, (await load()).metadata);
  }
});

afterAll(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.NEXT_PUBLIC_SITE_ENV;
  else process.env.NEXT_PUBLIC_SITE_ENV = ORIGINAL_ENV;
});

describe("per-route metadata under the production name (M7.8)", () => {
  it("covers every locked pair with a route, and no route is left over", () => {
    expect(Object.keys({ ...INDEXABLE_ROUTES, ...SAMPLE_ROUTE }).sort()).toEqual(
      Object.keys(PAGE_SEO).sort(),
    );
  });

  it("serves each indexable route its own locked pair, canonical and indexable", () => {
    for (const [path, pair] of Object.entries(PAGE_SEO)) {
      // The sample report's pair is asserted in its own
      // describe below (M8.8): same locked pair, gated
      // indexability.
      if (path === "/sample-report") continue;
      const metadata = loaded.get(path);
      expect(metadata, path).toBeDefined();
      expect(metadata?.title, path).toBe(pair.title);
      expect(metadata?.description, path).toBe(pair.description);
      expect(metadata?.alternates?.canonical, path).toBe(path);
      // Indexable on the production name: no robots lock.
      expect(metadata?.robots, path).toBeUndefined();
    }
  });

  it("keeps every journey route noindexed in production, with its own title", () => {
    for (const path of Object.keys(JOURNEY_ROUTES)) {
      const metadata = loaded.get(path);
      expect(metadata, path).toBeDefined();
      expect(metadata?.title, path).toBeTruthy();
      expect(metadata?.robots, path).toMatchObject({ index: false, follow: false });
    }
  });
});

describe("the sample report's metadata (M8.8)", () => {
  it("serves its locked pair and canonical, like any indexable page", () => {
    const metadata = loaded.get("/sample-report");
    const pair = PAGE_SEO["/sample-report"];
    expect(metadata).toBeDefined();
    expect(metadata?.title).toBe(pair.title);
    expect(metadata?.description).toBe(pair.description);
    expect(metadata?.alternates?.canonical).toBe("/sample-report");
  });

  it("stays noindexed under the production name while the go-live gate is shut", () => {
    // THE go-live pin (M8.8): the gate is shut today, on
    // purpose — the sample is built, linked and
    // downloadable, but no search engine is invited to it
    // until the flip at go-live. Flipping means setting
    // SAMPLE_REPORT_INDEXABLE to true in lib/seo.ts and
    // updating this one expectation; the metadata, the
    // sitemap and the sample PDF's header all follow the
    // constant, and the consistency assertion below holds
    // either way.
    expect(SAMPLE_REPORT_INDEXABLE).toBe(false);
    const metadata = loaded.get("/sample-report");
    if (SAMPLE_REPORT_INDEXABLE) {
      expect(metadata?.robots).toBeUndefined();
    } else {
      expect(metadata?.robots).toMatchObject({ index: false, follow: false });
    }
  });

  it("says example in plain words, in both halves of the pair", () => {
    // The step's honesty rule: the sample never wears a
    // live result's clothes. Both halves of the locked
    // pair name it an example, and neither names a real
    // place or postcode.
    const pair = PAGE_SEO["/sample-report"];
    expect(pair.title.toLowerCase()).toContain("example");
    expect(pair.description.toLowerCase()).toContain("example");
    expect(pair.title).not.toContain("MB3 4QX");
    expect(pair.description).not.toContain("MB3 4QX");
  });
});

describe("breadcrumb structured data (M7.8)", () => {
  it("is the two-item Home → page form, items only where a page exists", () => {
    const schema = breadcrumbSchema({ name: "Flood risk check", path: "/check/flood-risk" });
    expect(schema["@type"]).toBe("BreadcrumbList");
    expect(schema.itemListElement).toHaveLength(2);
    expect(schema.itemListElement[0]).toMatchObject({
      position: 1,
      name: "Home",
      item: `${SITE_URL}/`,
    });
    expect(schema.itemListElement[1]).toMatchObject({
      position: 2,
      name: "Flood risk check",
      item: `${SITE_URL}/check/flood-risk`,
    });
    expect(JSON.parse(JSON.stringify(schema))["@context"]).toBe("https://schema.org");
  });

  it("gives a guide page the three-item Home → Guides → guide form (BUG-229)", () => {
    const schema = breadcrumbSchema({
      name: "Is this area good for families?",
      path: "/guides/is-this-area-good-for-families",
      parents: [{ name: "Guides", path: "/guides" }],
    });
    expect(schema.itemListElement).toHaveLength(3);
    expect(schema.itemListElement[0]).toMatchObject({
      position: 1,
      name: "Home",
      item: `${SITE_URL}/`,
    });
    expect(schema.itemListElement[1]).toMatchObject({
      position: 2,
      name: "Guides",
      item: `${SITE_URL}/guides`,
    });
    expect(schema.itemListElement[2]).toMatchObject({
      position: 3,
      name: "Is this area good for families?",
      item: `${SITE_URL}/guides/is-this-area-good-for-families`,
    });
  });

  it("keeps the two-item form when no parents are given (BUG-229)", () => {
    const schema = breadcrumbSchema({ name: "Crime check", path: "/check/crime" });
    expect(schema.itemListElement).toHaveLength(2);
    expect(schema.itemListElement[1]).toMatchObject({
      position: 2,
      name: "Crime check",
      item: `${SITE_URL}/check/crime`,
    });
  });
});

describe("the related-links mapping (M7.8)", () => {
  it("gives every check page 2–3 related checks and exactly one guide", () => {
    for (const [path, page] of Object.entries(CHECK_PAGES)) {
      expect(page.related.length, path).toBeGreaterThanOrEqual(2);
      expect(page.related.length, path).toBeLessThanOrEqual(3);
      expect(new Set(page.related).size, path).toBe(page.related.length);
      for (const related of page.related) {
        expect(CHECK_PAGE_PATHS, `${path} -> ${related}`).toContain(related);
        expect(related, path).not.toBe(path);
      }
      expect(GUIDE_PATHS, `${path} -> guide`).toContain(page.guide);
    }
  });

  it("names every check page and guide the content constants claim", () => {
    expect(CHECK_PAGE_PATHS.sort()).toEqual(
      Object.keys(PAGE_SEO)
        .filter((path) => path.startsWith("/check/"))
        .sort(),
    );
    // The /guides hub itself (18 Nov 2026) starts with
    // "/guides" but not "/guides/" — it is the index of the
    // guides, not a fourth guide, so it stays out of this
    // comparison by construction.
    expect(GUIDE_PATHS.sort()).toEqual(
      Object.keys(PAGE_SEO)
        .filter((path) => path.startsWith("/guides/"))
        .sort(),
    );
  });

  it("points every guide at real check pages only", () => {
    for (const [path, guide] of Object.entries(GUIDES)) {
      expect(guide.relatedChecks.length, path).toBeGreaterThan(0);
      for (const check of guide.relatedChecks)
        expect(CHECK_PAGE_PATHS, `${path} -> ${check}`).toContain(check);
      for (const section of guide.sections)
        for (const link of section.links ?? [])
          expect(CHECK_PAGE_PATHS, `${path} section link ${link.href}`).toContain(link.href);
    }
  });

  it("answers each check page's query in its first paragraph", () => {
    // The SEO Everywhere rule, pinned as presence: the lead
    // exists, is a real paragraph, and names the check's own
    // subject (its breadcrumb name's first word is not the
    // test — the lead must at least be a full sentence about
    // the page's own check, which the copy review holds; here
    // we pin that no lead is a stub).
    for (const [path, page] of Object.entries(CHECK_PAGES)) {
      expect(page.lead.length, path).toBeGreaterThan(80);
      expect(page.lead.endsWith("."), path).toBe(true);
      expect(page.sections.length, path).toBeGreaterThanOrEqual(2);
      expect(page.sources.length, path).toBeGreaterThan(20);
    }
  });
});

describe("the rendered content pages (M7.8)", () => {
  it("renders the flood-risk template with its links and the checker", () => {
    const html = renderToString(
      createElement(CheckPageView, { page: CHECK_PAGES["/check/flood-risk"] }),
    );
    expect(html).toContain(CHECK_PAGES["/check/flood-risk"].h1);
    for (const related of CHECK_PAGES["/check/flood-risk"].related)
      expect(html).toContain(`href="${related}"`);
    expect(html).toContain(`href="${CHECK_PAGES["/check/flood-risk"].guide}"`);
    // The checker: the search block and its postcode box.
    expect(html).toContain("Check a home");
    expect(html).toContain('id="postcode"');
    // The BreadcrumbList rides along as structured data.
    expect(html).toContain("BreadcrumbList");
    expect(html).toContain("Flood risk check");
  });

  it("renders a guide with the checks it points to", () => {
    const guide = GUIDES["/guides/is-this-area-good-for-families"];
    const html = renderToString(createElement(GuidePageView, { guide }));
    expect(html).toContain(guide.h1);
    for (const check of guide.relatedChecks) expect(html).toContain(`href="${check}"`);
    expect(html).toContain('id="postcode"');
  });

  it("BUG-243: the leasehold guide hides the checks panel its own section already lists", () => {
    // The guide's "What this site can show you" section
    // already lists the same three checks as links, so
    // the beige "The checks in this guide" panel would
    // read the section twice — and hold only those three
    // chips, two-thirds empty. The panel is hidden for
    // this guide only; the section's links still stand,
    // so the guide still points at its checks.
    const leasehold = GUIDES["/guides/buying-a-leasehold-flat"];
    expect(leasehold.hideChecksBlock).toBe(true);
    const leaseholdHtml = renderToString(createElement(GuidePageView, { guide: leasehold }));
    expect(leaseholdHtml).not.toContain("The checks in this guide");
    for (const check of leasehold.relatedChecks) expect(leaseholdHtml).toContain(`href="${check}"`);
    // The other guides keep their panel.
    const families = GUIDES["/guides/is-this-area-good-for-families"];
    expect(families.hideChecksBlock).toBeUndefined();
    const familiesHtml = renderToString(createElement(GuidePageView, { guide: families }));
    expect(familiesHtml).toContain("The checks in this guide");
  });

  it("renders the guides hub listing every guide from the constants, with the checker", () => {
    // The hub (18 Nov 2026, the footer's Guides destination):
    // every guide in the GUIDES record, named and linked,
    // nothing listed that the record does not hold.
    const html = renderToString(createElement(GuidesHubView));
    for (const [path, guide] of Object.entries(GUIDES)) {
      expect(html, path).toContain(guide.name);
      expect(html, path).toContain(`href="${path}"`);
    }
    expect(html).toContain("BreadcrumbList");
    expect(html).toContain('id="postcode"');
  });
});

describe("the homepage tile wiring (M7.8, discharging M7.11's premise)", () => {
  it("wires the seven tiles that own a check page, and no others", () => {
    const wired = HOME_CHECK_TILES.filter((tile) => "href" in tile);
    expect(wired.map((tile) => tile.title)).toEqual([
      "Schools & nurseries",
      "Doctors, dentists & vets",
      "Safety around the home",
      "Plans that could change the street",
      "Flood risk",
      "The cost of living",
      "What homes here actually sold for",
    ]);
    for (const tile of wired) if ("href" in tile) expect(CHECK_PAGE_PATHS).toContain(tile.href);
    const unwired = HOME_CHECK_TILES.filter((tile) => !("href" in tile));
    expect(unwired.map((tile) => tile.title)).toEqual([
      "Food, leisure & everyday life",
      "Your neighbours & the area",
    ]);
  });
});

describe("the About page's 'What it costs' card (fix batch, BUG-023)", () => {
  it("leads with the large £4.99 figure — the paragraph follows it", async () => {
    const AboutPage = (await import("../app/about/page")).default;
    const html = renderToString(createElement(AboutPage));
    const cardAt = html.indexOf("What it costs");
    const priceAt = html.indexOf('class="price-line"');
    const paragraphAt = html.indexOf("The headlines are free");
    expect(cardAt).toBeGreaterThan(-1);
    expect(priceAt).toBeGreaterThan(cardAt);
    expect(paragraphAt).toBeGreaterThan(priceAt);
    expect(html).toContain("£4.99");
  });
});
