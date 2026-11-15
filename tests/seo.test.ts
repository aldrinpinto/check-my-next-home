import { afterEach, describe, expect, it } from "vitest";

import robots from "../app/robots";
import sitemap from "../app/sitemap";
import {
  HOME_PAGE_SEO,
  ORGANIZATION_SCHEMA,
  PAGE_SEO,
  WEBSITE_SCHEMA,
  pageMetadata,
} from "../lib/seo";
import {
  DISCLAIMER_SHORT_FORM,
  HOME_HERO_HEADLINE,
  SITE_DESCRIPTION,
  SITE_MANIFESTO,
  SITE_TAGLINE,
  SITE_URL,
} from "../lib/site";
import { BANNED_WORDING, VALUATION_DISCLAIMER } from "./banned-wording";

const ORIGINAL_ENV = process.env.NEXT_PUBLIC_SITE_ENV;

function setEnv(value: string | undefined) {
  if (value === undefined) delete process.env.NEXT_PUBLIC_SITE_ENV;
  else process.env.NEXT_PUBLIC_SITE_ENV = value;
}

afterEach(() => {
  setEnv(ORIGINAL_ENV);
});

describe("metadata helper (M2.11)", () => {
  it("gives each page its own canonical path on the canonical host", () => {
    const home = pageMetadata({ title: "A", description: "a", path: "/" });
    const flood = pageMetadata({ title: "B", description: "b", path: "/check/flood-risk" });
    expect(home.alternates?.canonical).toBe("/");
    expect(flood.alternates?.canonical).toBe("/check/flood-risk");
    expect(home.metadataBase?.toString()).toBe(`${SITE_URL}/`);
  });

  it("keeps play/test environments out of search engines", () => {
    setEnv("play");
    const meta = pageMetadata({ title: "A", description: "a", path: "/" });
    expect(meta.robots).toMatchObject({ index: false, follow: false });
  });

  it("lets the real site be indexed", () => {
    setEnv("production");
    const meta = pageMetadata({ title: "A", description: "a", path: "/" });
    expect(meta.robots).toBeUndefined();
  });

  it("derives the Open Graph fields from the same per-page wording (M6.10, D38)", () => {
    const meta = pageMetadata({ title: "T", description: "d", path: "/check/crime" });
    expect(meta.openGraph).toMatchObject({
      title: "T",
      description: "d",
      type: "website",
      url: "/check/crime",
    });
  });

  it("carries no og:image yet — the image lands at M7.1 from the brand pack", () => {
    const meta = pageMetadata({ title: "T", description: "d", path: "/" });
    expect(meta.openGraph?.images).toBeUndefined();
  });
});

describe("sitemap generator (M2.11)", () => {
  it("is empty on play/test — test hosts are never in the sitemap", () => {
    setEnv("play");
    expect(sitemap()).toEqual([]);
  });

  it("lists indexable pages only on the real site", () => {
    setEnv("production");
    expect(sitemap().map((entry) => entry.url)).toEqual([`${SITE_URL}/`]);
  });
});

describe("robots generator (M2.11)", () => {
  it("disallows everything on play/test", () => {
    setEnv("play");
    const result = robots();
    expect(result.rules).toMatchObject({ userAgent: "*", disallow: "/" });
    expect(result.sitemap).toBeUndefined();
  });

  it("allows indexable pages and protects private paths on the real site", () => {
    setEnv("production");
    const result = robots();
    expect(result.rules).toMatchObject({
      userAgent: "*",
      allow: "/",
      disallow: ["/results", "/checkout", "/account"],
    });
    expect(result.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});

describe("structured data (M2.11)", () => {
  it("describes the Organization honestly", () => {
    expect(ORGANIZATION_SCHEMA["@type"]).toBe("Organization");
    expect(ORGANIZATION_SCHEMA.name).toBe("Check My Next Home");
    expect(ORGANIZATION_SCHEMA.url).toBe(`${SITE_URL}/`);
  });

  it("describes the WebSite", () => {
    expect(WEBSITE_SCHEMA["@type"]).toBe("WebSite");
    expect(WEBSITE_SCHEMA.url).toBe(`${SITE_URL}/`);
  });

  it("serialises to valid JSON-LD", () => {
    for (const schema of [ORGANIZATION_SCHEMA, WEBSITE_SCHEMA]) {
      const parsed = JSON.parse(JSON.stringify(schema));
      expect(parsed["@context"]).toBe("https://schema.org");
      expect(parsed["@type"]).toBe(schema["@type"]);
    }
  });

  it("adds nothing the honesty rule forbids (M6.10, D38)", () => {
    // No SearchAction (no live site search to point at), no
    // logo until M7.1 applies the brand pack, no ratings
    // schema of any kind, ever.
    expect("potentialAction" in WEBSITE_SCHEMA).toBe(false);
    expect("logo" in ORGANIZATION_SCHEMA).toBe(false);
    expect(JSON.stringify([ORGANIZATION_SCHEMA, WEBSITE_SCHEMA])).not.toMatch(
      /AggregateRating|Review|SearchAction/i,
    );
  });
});

describe("locked SEO wording set (M6.10, D38)", () => {
  const entries = Object.entries(PAGE_SEO);

  it("covers every public page on the intent map, plus the two trust pages", () => {
    expect(Object.keys(PAGE_SEO).sort()).toEqual(
      [
        "/",
        "/about-the-data",
        "/check/air-quality",
        "/check/broadband",
        "/check/council-tax-band",
        "/check/crime",
        "/check/epc",
        "/check/ev-charging",
        "/check/family-essentials",
        "/check/flood-risk",
        "/check/mobile-coverage",
        "/check/noise",
        "/check/planning-constraints",
        "/check/public-transport",
        "/check/schools",
        "/check/solar-potential",
        "/check/sold-prices",
        "/guides/buying-a-leasehold-flat",
        "/guides/checks-before-buying-a-house",
        "/guides/is-this-area-good-for-families",
        "/how-we-check",
      ].sort(),
    );
  });

  it("gives every page its own title and description — nothing exists to inherit", () => {
    // The per-page rule, locked by construction: PAGE_SEO holds
    // no defaults, and every entry carries both fields itself.
    for (const [path, entry] of entries) {
      expect(entry.title, path).toBeTruthy();
      expect(entry.description, path).toBeTruthy();
    }
  });

  it("keeps every title unique and every description unique", () => {
    const titles = entries.map(([, entry]) => entry.title);
    const descriptions = entries.map(([, entry]) => entry.description);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("leads the homepage title with the D12 tagline", () => {
    expect(HOME_PAGE_SEO.title).toBe("Check My Next Home — Check the house. Choose the home.");
    expect(HOME_PAGE_SEO.title).toBe(`Check My Next Home — ${SITE_TAGLINE}`);
    expect(HOME_PAGE_SEO.description).toBe(SITE_DESCRIPTION);
  });
});

describe("SEO wording scan (M6.10, D38)", () => {
  // The banned-wording union is ONE shared list
  // (tests/banned-wording.ts) — this scan and the short
  // bundle's inherited scan both import it.
  //
  // Ruled exceptions, in the existing scans' pattern:
  //   - The sold-prices meta ends with the D23 disclaimer
  //     sentence; it is stripped, then "valuation" must appear
  //     nowhere.
  //   - The D9 short form states the ABSENCE of scoring in
  //     D9's own words ("We do not score, rate or recommend
  //     homes or areas."); that sentence is stripped before the
  //     union scan, as both brain scans strip ruled negations.
  //   - The only digits allowed in any locked string are names
  //     and basis phrases — "Article 4" (a direction's name)
  //     and "the 12 months named" (the crime window's basis).
  //     They are stripped before the no-figure scan; every
  //     other digit fails.
  const D9_NEGATION = "We do not score, rate or recommend homes or areas.";
  const FIGURE_BASIS_PHRASES = ["12 months", "Article 4"];

  function stripBasisPhrases(text: string): string {
    let out = text;
    for (const phrase of FIGURE_BASIS_PHRASES) out = out.split(phrase).join("");
    return out;
  }

  function expectNoFiguresOrMarks(text: string) {
    expect(text).not.toContain("%");
    expect(text).not.toContain("£");
    expect(stripBasisPhrases(text)).not.toMatch(/\d/);
    const lower = text.toLowerCase();
    for (const portal of ["rightmove", "zoopla", "onthemarket"])
      expect(lower, `portal named: ${portal}`).not.toContain(portal);
    // The gift is unmentionable in public wording (D21).
    for (const gift of ["gift", "check together", "free"])
      expect(lower, `gift wording: ${gift}`).not.toContain(gift);
  }

  function expectUnionClean(text: string) {
    const stripped = text.split(VALUATION_DISCLAIMER).join("");
    expect(stripped.toLowerCase()).not.toContain("valuation");
    for (const term of BANNED_WORDING)
      expect(text.toLowerCase(), `banned term: ${term}`).not.toContain(term);
  }

  it("scans every locked title and meta", () => {
    for (const [path, entry] of Object.entries(PAGE_SEO)) {
      for (const text of [entry.title, entry.description]) {
        expectNoFiguresOrMarks(text);
        // Interrogative titles are the searcher's words (D38):
        // they are sheltered from the union, never from the
        // figure/portal/gift scans. Every other string is
        // declarative and gets no shelter.
        if (!text.includes("?")) expectUnionClean(text);
        else expect(path).toBe("/guides/is-this-area-good-for-families");
      }
    }
  });

  it("keeps the families guide's question-form title, as the searcher's words", () => {
    expect(PAGE_SEO["/guides/is-this-area-good-for-families"].title).toBe(
      "Is this area good for families? | Check My Next Home",
    );
  });

  it("scans the D9 short form and the identity constants", () => {
    expectNoFiguresOrMarks(DISCLAIMER_SHORT_FORM);
    expectUnionClean(DISCLAIMER_SHORT_FORM.split(D9_NEGATION).join(""));
    for (const text of [SITE_TAGLINE, SITE_MANIFESTO, HOME_HERO_HEADLINE, SITE_DESCRIPTION]) {
      expectNoFiguresOrMarks(text);
      expectUnionClean(text);
    }
  });

  it("keeps the manifesto out of every title and meta (D12: hero kicker only)", () => {
    for (const [, entry] of Object.entries(PAGE_SEO)) {
      expect(entry.title).not.toContain(SITE_MANIFESTO);
      expect(entry.description).not.toContain(SITE_MANIFESTO);
    }
  });
});
