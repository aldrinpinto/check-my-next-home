import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Metadata } from "next";

import { CheckPageView, GuidePageView, GuidesHubView } from "../components/ContentPage";
import { CHECK_PAGES, CHECK_PAGE_PATHS, GUIDES, GUIDE_PATHS } from "../lib/check-pages";
import { HOME_CHECK_TILES } from "../lib/home";
import { PAGE_SEO, breadcrumbSchema } from "../lib/seo";
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
  "/guides": () => import("../app/guides/page"),
  "/guides/checks-before-buying-a-house": () =>
    import("../app/guides/checks-before-buying-a-house/page"),
  "/guides/buying-a-leasehold-flat": () => import("../app/guides/buying-a-leasehold-flat/page"),
  "/guides/is-this-area-good-for-families": () =>
    import("../app/guides/is-this-area-good-for-families/page"),
  "/how-we-check": () => import("../app/how-we-check/page"),
  "/about": () => import("../app/about/page"),
  "/sample-report": () => import("../app/sample-report/page"),
  "/contact": () => import("../app/contact/page"),
  "/privacy": () => import("../app/privacy/page"),
};

const JOURNEY_ROUTES: Record<string, () => Promise<MetadataModule>> = {
  "/search": () => import("../app/search/page"),
  "/search/home": () => import("../app/search/home/page"),
  "/search/failed": () => import("../app/search/failed/page"),
  "/shortlist": () => import("../app/shortlist/page"),
  "/report": () => import("../app/report/page"),
  // M7.13 — the Check Together claim flow: explicit
  // noindex in every environment (the routes carry it
  // inline, not via PAGE_SEO).
  "/gift": () => import("../app/gift/page"),
  "/gift/[token]": () => import("../app/gift/[token]/page"),
  "/gift/[token]/claimed": () => import("../app/gift/[token]/claimed/page"),
};

const loaded = new Map<string, Metadata>();

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SITE_ENV = "production";
  for (const [path, load] of Object.entries({ ...INDEXABLE_ROUTES, ...JOURNEY_ROUTES })) {
    loaded.set(path, (await load()).metadata);
  }
});

afterAll(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.NEXT_PUBLIC_SITE_ENV;
  else process.env.NEXT_PUBLIC_SITE_ENV = ORIGINAL_ENV;
});

describe("per-route metadata under the production name (M7.8)", () => {
  it("covers every locked pair with a route, and no route is left over", () => {
    expect(Object.keys(INDEXABLE_ROUTES).sort()).toEqual(Object.keys(PAGE_SEO).sort());
  });

  it("serves each indexable route its own locked pair, canonical and indexable", () => {
    for (const [path, pair] of Object.entries(PAGE_SEO)) {
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
