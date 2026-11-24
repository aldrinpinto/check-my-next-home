import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AboutPage from "../app/about/page";
import HowWeCheckPage from "../app/how-we-check/page";
import PrivacyPage from "../app/privacy/page";
import TermsPage from "../app/terms/page";
import Breadcrumb from "../components/Breadcrumb";
import { CheckPageView, GuidePageView, GuidesHubView } from "../components/ContentPage";
import { CHECK_PAGES, GUIDES } from "../lib/check-pages";
import { SITE_URL } from "../lib/site";

// BUG-229 — the visible breadcrumb trail: the same trail
// lib/seo.ts emits as structured data, drawn under the
// header above the eyebrow. Guide pages take Home →
// Guides → guide; check and chrome pages take Home →
// page (a check page has no single honest parent, so no
// Guides middle item is forced in front of it). The
// current page is plain text with aria-current="page",
// never a link.
function breadcrumbNav(html: string): string {
  const match = html.match(/<nav aria-label="Breadcrumb"[^>]*>([\s\S]*?)<\/nav>/);
  expect(match, "breadcrumb nav present").not.toBeNull();
  return match![1];
}

function jsonLd(html: string): {
  itemListElement: { position: number; name: string; item: string }[];
} {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  expect(match, "JSON-LD present").not.toBeNull();
  return JSON.parse(match![1]);
}

describe("the visible breadcrumb trail (BUG-229)", () => {
  it("draws a guide page as Home → Guides → guide, current page plain text", () => {
    const guide = GUIDES["/guides/is-this-area-good-for-families"];
    const html = renderToString(createElement(GuidePageView, { guide }));
    const nav = breadcrumbNav(html);
    expect(nav).toContain('href="/"');
    expect(nav).toContain('href="/guides"');
    expect(nav).toContain(">Guides</a>");
    expect(nav).toContain("Is this area good for families?");
    expect(nav).not.toContain(`href="${guide.path}"`);
    expect(nav).toContain('aria-current="page"');
    expect(nav.match(/›/g)).toHaveLength(2);
    // The structured data matches the visible trail.
    const ld = jsonLd(html);
    expect(ld.itemListElement).toHaveLength(3);
    expect(ld.itemListElement[1]).toMatchObject({
      position: 2,
      name: "Guides",
      item: `${SITE_URL}/guides`,
    });
    expect(ld.itemListElement[2]).toMatchObject({
      position: 3,
      name: guide.name,
      item: `${SITE_URL}${guide.path}`,
    });
  });

  it("draws a check page as Home → check, with no Guides middle item", () => {
    const page = CHECK_PAGES["/check/flood-risk"];
    const html = renderToString(createElement(CheckPageView, { page }));
    const nav = breadcrumbNav(html);
    expect(nav).toContain('href="/"');
    expect(nav).toContain("Flood risk check");
    expect(nav).not.toContain('href="/guides"');
    expect(nav).not.toContain(">Guides</a>");
    expect(nav).not.toContain(`href="${page.path}"`);
    expect(nav).toContain('aria-current="page"');
    expect(nav.match(/›/g)).toHaveLength(1);
    const ld = jsonLd(html);
    expect(ld.itemListElement).toHaveLength(2);
    expect(ld.itemListElement[1]).toMatchObject({
      position: 2,
      name: "Flood risk check",
      item: `${SITE_URL}/check/flood-risk`,
    });
  });

  it("draws the guides hub as Home → Guides", () => {
    const html = renderToString(createElement(GuidesHubView));
    const nav = breadcrumbNav(html);
    expect(nav).toContain('href="/"');
    expect(nav).toContain("Guides");
    expect(nav).not.toContain('href="/guides"');
    expect(nav).toContain('aria-current="page"');
    expect(nav.match(/›/g)).toHaveLength(1);
  });

  it("draws every check page with the two-item trail", () => {
    for (const page of Object.values(CHECK_PAGES)) {
      const html = renderToString(createElement(CheckPageView, { page }));
      const nav = breadcrumbNav(html);
      expect(nav.match(/›/g), page.path).toHaveLength(1);
      expect(nav, page.path).not.toContain('href="/guides"');
      expect(nav, page.path).toContain('aria-current="page"');
    }
  });

  it("draws every guide page with the three-item trail", () => {
    for (const guide of Object.values(GUIDES)) {
      const html = renderToString(createElement(GuidePageView, { guide }));
      const nav = breadcrumbNav(html);
      expect(nav.match(/›/g), guide.path).toHaveLength(2);
      expect(nav, guide.path).toContain('href="/guides"');
      expect(nav, guide.path).toContain('aria-current="page"');
    }
  });

  it("draws the chrome pages as Home → page", () => {
    const pages = [
      { render: HowWeCheckPage, name: "How we check" },
      { render: AboutPage, name: "About" },
      { render: PrivacyPage, name: "Privacy policy" },
      { render: TermsPage, name: "Terms of service" },
    ];
    for (const { render, name } of pages) {
      const html = renderToString(createElement(render));
      const nav = breadcrumbNav(html);
      expect(nav, name).toContain('href="/"');
      expect(nav, name).toContain(name);
      expect(nav, name).toContain('aria-current="page"');
      expect(nav.match(/›/g), name).toHaveLength(1);
    }
  });

  it("renders the Contact items the same way (ContactPage itself is async, so pinned here)", () => {
    const html = renderToString(
      createElement(Breadcrumb, {
        items: [{ label: "Home", href: "/" }, { label: "Contact" }],
      }),
    );
    const nav = breadcrumbNav(html);
    expect(nav).toContain('href="/"');
    expect(nav).toContain("Contact");
    expect(nav).toContain('aria-current="page"');
    expect(nav.match(/›/g)).toHaveLength(1);
  });

  it("links every item except the current page, which is plain text", () => {
    const html = renderToString(
      createElement(Breadcrumb, {
        items: [
          { label: "Home", href: "/" },
          { label: "Guides", href: "/guides" },
          { label: "Is this area good for families?" },
        ],
      }),
    );
    const nav = breadcrumbNav(html);
    expect(nav).toContain('href="/"');
    expect(nav).toContain(">Home</a>");
    expect(nav).toContain('href="/guides"');
    expect(nav).toContain(">Guides</a>");
    expect(nav).toContain('<span aria-current="page">Is this area good for families?</span>');
    expect(nav.match(/<a /g)).toHaveLength(2);
  });
});
