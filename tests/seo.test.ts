import { afterEach, describe, expect, it } from "vitest";

import robots from "../app/robots";
import sitemap from "../app/sitemap";
import { CHECK_PAGES, GUIDES } from "../lib/check-pages";
import {
  HOME_PAGE_SEO,
  ORGANIZATION_SCHEMA,
  PAGE_SEO,
  SAMPLE_REPORT_INDEXABLE,
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

  it("keeps a noindex page out of search even on the real site (M7.8)", () => {
    // The production-noindex fix: until M7.8 the helper only
    // locked non-production environments, so a specific
    // home's results page would have been indexable in
    // production. noindex is unconditional now.
    setEnv("production");
    const meta = pageMetadata({
      title: "A",
      description: "a",
      path: "/search/home",
      noindex: true,
    });
    expect(meta.robots).toMatchObject({ index: false, follow: false });
    setEnv("play");
    const playMeta = pageMetadata({
      title: "A",
      description: "a",
      path: "/search/home",
      noindex: true,
    });
    expect(playMeta.robots).toMatchObject({ index: false, follow: false });
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

  it("carries the og:image composed at M7.1 from the brand pack", () => {
    // Until M7.1 this pin held the images field undefined —
    // the image had not landed. The pin change IS the record
    // that it has: one composed card (lockup on Cream, name +
    // tagline), at the pinned dimensions, resolved against the
    // canonical host at render.
    const meta = pageMetadata({ title: "T", description: "d", path: "/" });
    expect(meta.openGraph?.images).toEqual([
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Check My Next Home — Check the house. Choose the home.",
      },
    ]);
  });
});

describe("sitemap generator (M2.11)", () => {
  it("is empty on play/test — test hosts are never in the sitemap", () => {
    setEnv("play");
    expect(sitemap()).toEqual([]);
  });

  it("lists indexable pages only on the real site", () => {
    setEnv("production");
    // M7.8: the sitemap is exactly the locked set — every
    // PAGE_SEO key, in the record's order, homepage first.
    // The journey routes and /kitchen-sink are never here.
    // M8.8: one gated exception — /sample-report is listed
    // only once its go-live gate opens
    // (SAMPLE_REPORT_INDEXABLE); while the gate is shut
    // the page is noindexed and T-SEO-02 keeps it out of
    // the sitemap. The expectation follows the constant,
    // so the flip is the constant alone.
    const expected = Object.keys(PAGE_SEO)
      .filter((path) => path !== "/sample-report" || SAMPLE_REPORT_INDEXABLE)
      .map((path) => `${SITE_URL}${path}`);
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toEqual(expected);
    expect(urls.includes(`${SITE_URL}/sample-report`)).toBe(SAMPLE_REPORT_INDEXABLE);
    expect(sitemap()[0]).toMatchObject({ url: `${SITE_URL}/`, priority: 1 });
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
    // M7.8: the disallow list names the journey and utility
    // route family as it exists (it previously named
    // /results, /checkout and /account — routes that have
    // never existed). M7.13 adds /gift — the Check
    // Together claim flow, reached only via a private
    // link. M8.8 adds /sample-report/print — the sample
    // PDF's internal print view. M9.11 adds /admin —
    // the owner page behind the Access wall.
    expect(result.rules).toMatchObject({
      userAgent: "*",
      allow: "/",
      disallow: [
        "/search",
        "/search/home",
        "/search/failed",
        "/report",
        "/shortlist",
        "/gift",
        "/sample-report/print",
        "/kitchen-sink",
        "/admin",
        "/api",
      ],
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
    // ratings schema of any kind, ever. The logo was the one
    // absence M7.1 was due to close, and it is closed with
    // exactly the served mark's canonical URL — nothing else
    // the rule forbids has joined it.
    expect("potentialAction" in WEBSITE_SCHEMA).toBe(false);
    expect(ORGANIZATION_SCHEMA.logo).toBe(`${SITE_URL}/brand/logo-mark.svg`);
    expect(JSON.stringify([ORGANIZATION_SCHEMA, WEBSITE_SCHEMA])).not.toMatch(
      /AggregateRating|Review|SearchAction/i,
    );
  });
});

describe("locked SEO wording set (M6.10, D38)", () => {
  const entries = Object.entries(PAGE_SEO);

  it("covers every public page on the intent map, plus the trust and chrome pages", () => {
    // M7.8: About's pair is re-locked at /about (superseding
    // /about-the-data), and the chrome pages' pairs are
    // locked at their chrome paths — /sample-report,
    // /contact, /privacy — under the same D38 process.
    // 18 Nov 2026: the /guides hub's pair joins the set
    // (the founder's footer ruling — the hub is the footer's
    // Guides destination).
    // M9.4: the /terms pair joins the set with the Terms
    // page (the 18 Nov 2026 Terms adoption).
    // Follow-up stack (BUG-128): the /check/building-safety
    // pair joins the set with the building-safety check
    // page, created to carry the report block's full
    // explanation.
    // M10.4 (25 Nov 2026): the /refunds and /about-the-data
    // pairs join the set with the step's two new pages.
    expect(Object.keys(PAGE_SEO).sort()).toEqual(
      [
        "/",
        "/about",
        "/about-the-data",
        "/check/air-quality",
        "/check/broadband",
        "/check/building-safety",
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
        "/guides",
        "/guides/buying-a-leasehold-flat",
        "/guides/checks-before-buying-a-house",
        "/guides/is-this-area-good-for-families",
        "/how-we-check",
        "/contact",
        "/privacy",
        "/refunds",
        "/sample-report",
        "/terms",
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
  //   - The statutory name (follow-up stack, BUG-128):
  //     "Building Safety" is a proper noun — the Building
  //     Safety Act 2022, the Building Safety Regulator, and
  //     the report section's own ruled name — not a claim
  //     that a home or an area is "safe". The name's two
  //     forms (spaced, and the check page's hyphenated slug)
  //     are stripped before the union scan in both wording
  //     scans; the ban on "safe" as a claim stands
  //     everywhere else.
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

  function stripStatutoryName(text: string): string {
    return text.toLowerCase().split("building safety").join("").split("building-safety").join("");
  }

  function expectUnionClean(text: string) {
    const stripped = text.split(VALUATION_DISCLAIMER).join("");
    expect(stripped.toLowerCase()).not.toContain("valuation");
    for (const term of BANNED_WORDING)
      expect(stripStatutoryName(text), `banned term: ${term}`).not.toContain(term);
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

describe("page body copy scan (M7.8)", () => {
  // The adopted M7.8 gap check made body copy a first-class
  // build input: the check pages' and guides' prose lives as
  // locked constants (lib/check-pages.ts), and the
  // banned-wording scan extends over those strings too.
  //
  // The scan's shape differs from the locked-pair scan in
  // exactly two ruled ways: body copy legitimately carries
  // figures (the crime window, the EPC bands, the £4.99
  // report price the guides name) and the word "free" (the
  // headlines are always free — a product fact, stated in
  // the open), so the no-figure and no-"free" rules do not
  // run here. Everything else runs: the union, the valuation
  // rule (the D23 disclaimer sentence stripped, as in the
  // pair scan), the portal names, and the gift's other two
  // unmentionables. A string carrying the searcher's
  // question (the families guide's H1) is sheltered from the
  // union exactly as its locked title is — never from the
  // rest.
  function everyString(value: unknown, out: string[] = []): string[] {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) for (const item of value) everyString(item, out);
    else if (value && typeof value === "object")
      for (const item of Object.values(value)) everyString(item, out);
    return out;
  }

  const bodyStrings = [...everyString(CHECK_PAGES), ...everyString(GUIDES)];

  it("scans a real body of copy, not an empty set", () => {
    expect(bodyStrings.length).toBeGreaterThan(200);
  });

  it("keeps the union, the portals and the gift out of the body copy", () => {
    for (const text of bodyStrings) {
      const lower = text.toLowerCase();
      for (const portal of ["rightmove", "zoopla", "onthemarket"])
        expect(lower, `portal named: ${portal} in "${text.slice(0, 60)}"`).not.toContain(portal);
      for (const gift of ["gift", "check together"])
        expect(lower, `gift wording: ${gift} in "${text.slice(0, 60)}"`).not.toContain(gift);
      if (text.includes("?")) continue;
      const stripped = text.split(VALUATION_DISCLAIMER).join("");
      expect(stripped.toLowerCase(), `valuation in "${text.slice(0, 60)}"`).not.toContain(
        "valuation",
      );
      // The statutory-name exception (BUG-128), as in the
      // locked-pair scan above: "building safety" /
      // "building-safety" is the Act's and the Regulator's
      // proper name, stripped before the union runs.
      const unionText = lower.split("building safety").join("").split("building-safety").join("");
      for (const term of BANNED_WORDING)
        expect(unionText, `banned term: ${term} in "${text.slice(0, 60)}"`).not.toContain(term);
    }
  });
});
