import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import KitchenSinkPage from "../app/kitchen-sink/page";
import SiteChrome from "../components/SiteChrome";
import SiteFooter from "../components/SiteFooter";
import SiteHeader from "../components/SiteHeader";
import Tabs from "../components/Tabs";
import {
  Button,
  DataTable,
  Notice,
  SuggestionShell,
  SummaryPill,
  TextField,
} from "../components/kit";
import {
  LOGO_URL,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_PATH,
  OG_IMAGE_WIDTH,
  ORGANIZATION_SCHEMA,
  PAGE_SEO,
} from "../lib/seo";
import { SITE_MANIFESTO, SITE_NAME, SITE_TAGLINE, SITE_URL } from "../lib/site";
import { BINARY_ASSETS, decodeBase64Text } from "../scripts/materialise-binary-assets.mjs";

// M7.1 — the look & feel kit's pins. The kit is tokens and
// blocks other steps inherit, so what is pinned here is what
// they inherit: the token values in app/globals.css, the
// brand assets at their fixed destinations, the header and
// footer shells rendering the D12 wording from lib/site.ts,
// the kitchen-sink page's production gate, and the SEO
// surfaces this step completed (og:image, the JSON-LD logo)
// with PAGE_SEO untouched.

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const ORIGINAL_ENV = process.env.NEXT_PUBLIC_SITE_ENV;

function setEnv(value: string | undefined) {
  if (value === undefined) delete process.env.NEXT_PUBLIC_SITE_ENV;
  else process.env.NEXT_PUBLIC_SITE_ENV = value;
}

afterEach(() => {
  setEnv(ORIGINAL_ENV);
});

describe("kit tokens (app/globals.css)", () => {
  const css = read("app/globals.css");

  it("carries the six brand colours as tokens, Ink included (R1)", () => {
    expect(css).toContain("--cmnh-forest: #2f5d3e");
    expect(css).toContain("--cmnh-forest-deep: #1e402c");
    expect(css).toContain("--cmnh-brass: #c29a3b");
    expect(css).toContain("--cmnh-brass-pale: #e4cf9a");
    expect(css).toContain("--cmnh-cream: #fdf8e8");
    expect(css).toContain("--cmnh-ink: #17201e");
  });

  it("pins the type scale on the self-hosted faces (D70 R1)", () => {
    // Newsreader display + DM Sans text, self-hosted from
    // /fonts; the system stack is the fallback only. (M7.1
    // pinned the system stack and the fixed display sizes;
    // D70 R1 supersedes both — see docs/frontend-design-pass.md.)
    // (The declaration's value wraps under the repo's print
    // width, so the pin targets the stack itself.)
    expect(css).toContain('"DM Sans", system-ui, -apple-system, "Segoe UI", Roboto');
    expect(css).toContain('--font-family-display: "Newsreader", Georgia');
    expect(css).toContain('url("/fonts/newsreader-latin-700-normal.woff2")');
    expect(css).toContain('url("/fonts/dm-sans-latin-900-normal.woff2")');
    expect(css).toContain("font-display: swap");
    expect(css).toContain("--font-size-caption: 0.8125rem");
    expect(css).toContain("--font-size-small: 0.875rem");
    expect(css).toContain("--font-size-body: 1rem");
    expect(css).toContain("--font-size-lead: 1.125rem");
    expect(css).toContain("--font-size-h3: 1.25rem");
    expect(css).toContain("--font-size-h2: clamp(1.9rem, 1.55rem + 1.5vw, 2.2rem)");
    expect(css).toContain("--font-size-h1: clamp(2.4rem, 1.85rem + 2.4vw, 3.2rem)");
  });

  it("pins the graduated radius scale and the distance pairings (D70 R8/R5)", () => {
    expect(css).toContain("--radius: 0.5rem");
    expect(css).toContain("--radius-tile: 0.625rem");
    expect(css).toContain("--radius-card: 0.75rem");
    expect(css).toContain("--radius-panel: 0.875rem");
    // The design's .dist pairings, the orange corrected (F3).
    expect(css).toContain("--dist-green-bg: #dff3e6");
    expect(css).toContain("--dist-green: #14532d");
    expect(css).toContain("--dist-orange-bg: #ffe3b3");
    expect(css).toContain("--dist-orange: #7a3a00");
    expect(css).toContain("--dist-red-bg: #fbdcdc");
    expect(css).toContain("--dist-red: #7f1d1d");
  });

  it("pins the spacing scale, both containers and the tap target", () => {
    expect(css).toContain("--space-1: 0.25rem");
    expect(css).toContain("--space-4: 1rem");
    expect(css).toContain("--space-9: 4rem");
    expect(css).toContain("--container-reading: 44rem");
    expect(css).toContain("--container-wide: 72rem");
    // 44px — the pinned minimum tap target.
    expect(css).toContain("--tap-target: 2.75rem");
  });

  it("pins ONE focus style, with its on-dark colour swap", () => {
    expect(css).toContain("outline: 3px solid var(--focus-colour)");
    expect(css).toContain("outline-offset: 2px");
    expect(css).toContain("--focus-colour: var(--cmnh-forest)");
    expect(css).toContain("--focus-colour-on-dark: var(--cmnh-brass-pale)");
  });

  it("pins the reduced-motion standard (D44)", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("has no dark mode — light mode only in V1 (D44)", () => {
    // The header comment names the forbidden block in words;
    // what must never exist is the media query itself.
    expect(css).not.toMatch(/@media[^{]*prefers-color-scheme/);
  });

  it("pins the one functional colour the palette lacks: error", () => {
    expect(css).toContain("--cmnh-error: #b3261e");
  });

  // BUG-205/206: the results page's hierarchy dress —
  // the subheading in the sample's subheading form,
  // the detail bullet one list-indent step in.
  const ruleBlock = (selector: string) => {
    const start = css.indexOf(`${selector} {`);
    expect(start).toBeGreaterThanOrEqual(0);
    return css.slice(start, css.indexOf("}", start));
  };

  it("BUG-205: the results subheading wears the sample's subheading dress", () => {
    const block = ruleBlock(".results-subheading");
    expect(block).toContain("font-size: 1.02rem");
    expect(block).toContain("font-weight: 800");
    expect(block).toContain("text-transform: uppercase");
    expect(block).toContain("letter-spacing: 0.08em");
    expect(block).toContain("color: var(--cmnh-forest)");
    expect(block).toContain("border: none");
  });

  it("BUG-206: a detail list item sits one list-indent step in", () => {
    const block = ruleBlock(".results-list__item--sub");
    expect(block).toContain("margin-left: 18px");
  });

  it("BUG-215: the payment consent label IS the small print", () => {
    const block = ruleBlock(".report-payment__consent");
    expect(block).toContain("font-size: 0.62rem");
  });

  it("BUG-232: the suggestions lists cap at a whole number of rows, so the footer never reads as covering one", () => {
    // A suggestion row is 2.5rem (the body's 1.5
    // line-height on 1rem, plus 0.5rem of padding top
    // and bottom — --space-2, pinned above): the
    // single-group cap is exactly eight rows and the
    // grouped cap exactly five per group. A fractional
    // cap cut the last visible row mid-height, and the
    // brass footer directly beneath read as if it
    // covered the row's lower half. The footer itself
    // is a normal-flow sibling below the lists, never
    // positioned over them — the fold was the defect.
    const single = ruleBlock(".suggest__list");
    expect(single).toContain("max-height: min(20rem, 60vh)");
    const grouped = css.slice(
      css.indexOf(
        ".postcode-box__suggestions:has(.suggest__group + .suggest__group) .suggest__list {",
      ),
    );
    expect(grouped).toContain("max-height: min(12.5rem, 40vh)");
  });

  it("BUG-241: the report band's heading stays cream on content pages", () => {
    // The content pages' h2 rule (.site-pages h2, dark
    // --sp-deep, 0,1,1) beats the band's own heading rule
    // (0,1,0); the scoped override wins at 0,2,0.
    const block = ruleBlock(".site-pages .report-band__heading");
    expect(block).toContain("color: var(--cmnh-cream)");
  });

  it("BUG-242: the report band's price block anchors to the top of the text", () => {
    const block = ruleBlock(".report-band");
    expect(block).toContain("align-items: flex-start");
  });

  it("BUG-244: the calculator fieldset's legend clears its border", () => {
    const block = ruleBlock(".calculator-card fieldset legend");
    expect(block).toContain("padding: 0 0.5rem");
  });

  it("BUG-245: the distance pill keeps its own height in any flex row", () => {
    const block = ruleBlock(".place-row__miles");
    expect(block).toContain("height: fit-content");
  });
});

describe("brand assets at their fixed destinations", () => {
  it("serves the finalised mark from public/brand, exactly as finalised", () => {
    const mark = read("public/brand/logo-mark.svg");
    // The One-Line Roof-Tick's own geometry and colours (the
    // pack's master, unmodified — never redrawn or recoloured).
    expect(mark).toContain('stroke="#2F5D3E"');
    expect(mark).toContain('stroke="#C29A3B"');
    expect(mark).toContain('d="M5 29 L19 13 L30 23"');
    expect(existsSync(join(ROOT, "public/brand/logo-mark-reversed.svg"))).toBe(true);
    expect(existsSync(join(ROOT, "public/brand/logo-lockup.svg"))).toBe(true);
  });

  it("uses the same master as the app icon", () => {
    expect(read("app/icon.svg")).toBe(read("public/brand/logo-mark.svg"));
  });

  it("carries every binary asset as .b64, decoding to the real file", () => {
    expect(BINARY_ASSETS.map((asset) => asset.target).sort()).toEqual(
      [
        "app/apple-icon.png",
        "app/favicon.ico",
        "app/icon.png",
        "public/og-image.png",
        // The self-hosted typefaces (D70 R1).
        "public/fonts/dm-sans-latin-400-normal.woff2",
        "public/fonts/dm-sans-latin-600-normal.woff2",
        "public/fonts/dm-sans-latin-700-normal.woff2",
        "public/fonts/dm-sans-latin-800-normal.woff2",
        "public/fonts/dm-sans-latin-900-normal.woff2",
        "public/fonts/newsreader-latin-600-normal.woff2",
        "public/fonts/newsreader-latin-700-normal.woff2",
      ].sort(),
    );
    for (const { source } of BINARY_ASSETS) {
      expect(existsSync(join(ROOT, source)), source).toBe(true);
    }
    const decode = (source: string) => decodeBase64Text(read(source));

    // WOFF2 magic ("wOF2") on every decoded font file.
    for (const { source, target } of BINARY_ASSETS) {
      if (!target.endsWith(".woff2")) continue;
      expect(decode(source).subarray(0, 4).toString("ascii"), target).toBe("wOF2");
    }

    const ico = decode("app/favicon.ico.b64");
    // ICO magic: reserved 0, type 1 (icon).
    expect([...ico.subarray(0, 4)]).toEqual([0, 0, 1, 0]);

    const pngSize = (bytes: Buffer) => ({
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
      magic: [...bytes.subarray(0, 4)],
    });
    expect(pngSize(decode("app/icon.png.b64"))).toMatchObject({ width: 48, height: 48 });
    expect(pngSize(decode("app/apple-icon.png.b64"))).toMatchObject({
      width: 180,
      height: 180,
    });
    expect(pngSize(decode("public/og-image.png.b64"))).toMatchObject({
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
    });
    expect(pngSize(decode("app/icon.png.b64")).magic).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("names the og:image by its pinned path and dimensions", () => {
    expect(OG_IMAGE_PATH).toBe("/og-image.png");
    expect(OG_IMAGE_WIDTH).toBe(1200);
    expect(OG_IMAGE_HEIGHT).toBe(630);
  });

  it("points the Organization JSON-LD logo at the served mark's canonical URL", () => {
    expect(LOGO_URL).toBe(`${SITE_URL}/brand/logo-mark.svg`);
    expect(ORGANIZATION_SCHEMA.logo).toBe(LOGO_URL);
  });
});

describe("header and footer shells", () => {
  const header = renderToStaticMarkup(createElement(SiteHeader));
  const footer = renderToStaticMarkup(createElement(SiteFooter));

  it("renders the mark, the live-text name and the D12 tagline", () => {
    expect(header).toContain('src="/brand/logo-mark.svg"');
    expect(header).toContain(SITE_NAME);
    expect(header).toContain(SITE_TAGLINE);
    // The header is built from live text — no baked lockup
    // image, and never the superseded M3 strapline.
    expect(header).not.toContain("logo-lockup");
    expect(header).not.toContain("doesn’t tell you");
    expect(header).not.toContain("doesn't tell you");
  });

  it("keeps the manifesto out of the header (D12 — hero kicker only)", () => {
    expect(header).not.toContain(SITE_MANIFESTO);
  });

  it("carries the navigation set, in order (D44; the sample's set at fidelity pass 2)", () => {
    // Fidelity pass 2 (founder, 17 Nov 2026): the decided
    // sample page governs the landing chrome — its set is
    // How we check, Sample report, About, Shortlist, with no
    // "Check a home" button. D44's Guides item is superseded
    // for the chrome and returns when guide pages exist.
    // D77(g) adds Contact at the end of the set.
    const labels = ["How we check", "Sample report", "About", "Shortlist", "Contact"];
    let lastIndex = -1;
    for (const label of labels) {
      const index = header.indexOf(`>${label}<`);
      expect(index, label).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
    expect(header).toContain('href="/how-we-check"');
    expect(header).toContain('href="/sample-report"');
    expect(header).toContain('href="/about"');
    expect(header).toContain('href="/shortlist"');
    expect(header).toContain('href="/contact"');
    expect(header).not.toContain('href="/guides"');
  });

  it("renders the brand block as one home link", () => {
    // Chrome unification (18 Nov 2026): mark + name +
    // tagline are ONE Link to "/" in the unified header,
    // so the logo and title take the visitor home from
    // every page.
    expect(header).toContain('<a class="brand" href="/">');
    expect(header).toContain('src="/brand/logo-mark.svg"');
  });

  it("renders the grouped footer (BUG-230): four labeled groups, no separators", () => {
    // BUG-230 (founder-approved prep, 24 Nov 2026): the one
    // long middle line becomes four labeled groups —
    // Product, Guides, Company, Legal — in that order. The
    // Guides group lists the three guides individually
    // under a "Guides" heading that links to the /guides
    // hub; this supersedes the 18 Nov 2026 ruling that the
    // footer carry ONE Guides link (the header's own pin
    // above still stands: no Guides in the header). No "·"
    // separator survives anywhere in the footer.
    const headings = ["Product", "Guides", "Company", "Legal"];
    let lastIndex = -1;
    for (const heading of headings) {
      const index = footer.indexOf(`>${heading}<`);
      expect(index, heading).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
    const labels = [
      "How we check",
      "Sample report",
      "Guides",
      "Buying a leasehold flat",
      "Checks before buying a house",
      "Is this area good for families",
      "About",
      "Contact",
      "Privacy policy",
      "Terms of service",
    ];
    lastIndex = -1;
    for (const label of labels) {
      const index = footer.indexOf(`>${label}<`);
      expect(index, label).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
    expect(footer).toContain('href="/guides"');
    expect(footer).toContain('href="/guides/buying-a-leasehold-flat"');
    expect(footer).toContain('href="/guides/checks-before-buying-a-house"');
    expect(footer).toContain('href="/guides/is-this-area-good-for-families"');
    expect(footer).toContain('href="/contact"');
    expect(footer).toContain('href="/privacy"');
    expect(footer).toContain('href="/terms"');
    expect(footer.match(/site-footer__group"/g)).toHaveLength(4);
    expect(footer.match(/site-footer__group-heading"/g)).toHaveLength(4);
    expect(footer.match(/site-footer__group-links"/g)).toHaveLength(4);
    // No separator anywhere in the grouped form.
    expect(footer).not.toContain("·");
    expect(footer).not.toContain("site-footer__sep");
    // BUG-197 (founder-directed 23 Nov 2026): the sources
    // line is removed from the footer — the sentence
    // stands nowhere in it. (The paid report PDF's
    // footer carries the same sentence on a separate
    // surface and is not this ruling's to remove.)
    expect(footer).not.toContain("Data from named official sources. Facts, not scores.");
    expect(footer).not.toContain("site-footer__sources");
    // The groups stack vertically on a phone: the nav
    // takes the column direction at the 40rem breakpoint
    // and the brand block sits above it.
    const css = read("app/globals.css");
    expect(css).toMatch(
      /@media \(max-width: 40rem\) \{\s*\.site-footer__inner \{[^}]*flex-direction: column;[^}]*\}[\s\S]*?\.site-footer__nav \{[^}]*flex-direction: column;/,
    );
  });

  it("footer v4 conform (BUG-230): tagline 0.5625rem, © 2027, uppercase headings with one Brass dash, brand block top-aligned", () => {
    // Approved draft v4 (founder, 24 Nov 2026): the tagline
    // is 0.5625rem — clearly smaller than the 0.78125rem
    // footer links — and the © line reads 2027 (launch
    // year, not the rendering year). The group headings
    // wear the tagline form (uppercase, letter-spaced,
    // semi-bold) with one short Brass dash each; the
    // Guides heading is a link but carries no underline,
    // so the dash is its only line. The brand block
    // top-aligns with the group headings.
    expect(footer).toContain("© 2027 Check My Next Home");
    const css = read("app/globals.css");
    expect(css).toContain("font-size: 0.5625rem;");
    expect(css).toContain(`.site-footer__inner {
  max-width: var(--container-wide);
  margin: 0 auto;
  padding: 1.625rem var(--space-4) var(--space-2);
  display: flex;
  flex-wrap: wrap;
  /* Approved draft v4 (24 Nov 2026): the brand block
     top-aligns with the group headings. */
  align-items: flex-start;`);
    expect(css).toContain(`.site-footer__group-heading {
  margin: 0 0 var(--space-2);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.4px;
  line-height: 1.3;
  text-transform: uppercase;`);
    expect(css).toContain(`.site-footer__group-heading::after {
  content: "";
  display: block;
  width: 1.5rem;
  height: 2px;
  margin-top: 0.375rem;
  background: var(--cmnh-brass);
}`);
    expect(css).toContain(`.site-footer__group-heading .site-footer__link:hover {
  text-decoration: none;
}`);
  });

  it("places the bottom row after the main footer row, carrying no sources line (BUG-197)", () => {
    // Chrome unification (18 Nov 2026): the bottom row
    // (.site-footer__bottom) follows .site-footer__inner
    // in the markup. Until BUG-197 it carried the
    // sources line at its extreme right; the line is
    // removed and the row carries the legal block alone.
    const innerAt = footer.indexOf("site-footer__inner");
    const bottomAt = footer.indexOf("site-footer__bottom");
    expect(innerAt).toBeGreaterThan(-1);
    expect(bottomAt).toBeGreaterThan(innerAt);
    expect(footer).not.toContain("site-footer__sources");
    expect(footer).not.toContain("site-footer--content");
    // The retired content footer's closing line is gone
    // as footer small print.
    expect(footer).not.toContain("Every fact from an official source, shown with its source");
  });

  it("carries the © line and the two social icons on the bottom row (footer batch, 23 Nov 2026)", () => {
    // The batch folded into the BUG-185 build: the bottom
    // row's left carries the © line and the Instagram and
    // Facebook icon links (the brand's own handles). The
    // sources line that kept the row's right is removed
    // (BUG-197) — the legal block is the row's content.
    const bottomAt = footer.indexOf("site-footer__bottom");
    const legalAt = footer.indexOf("site-footer__legal");
    const copyrightAt = footer.indexOf("site-footer__copyright");
    expect(legalAt).toBeGreaterThan(bottomAt);
    expect(copyrightAt).toBeGreaterThan(legalAt);
    expect(footer).not.toContain("site-footer__sources");
    expect(footer).toContain(`© 2027 ${SITE_NAME}`);
    expect(footer).toContain('href="https://www.instagram.com/checkmynexthome"');
    expect(footer).toContain('href="https://www.facebook.com/checkmynexthome"');
    expect(footer).toContain('aria-label="Check My Next Home on Instagram"');
    expect(footer).toContain('aria-label="Check My Next Home on Facebook"');
    // Exactly the two social links, each opening externally.
    expect(footer.match(/site-footer__social-link/g)).toHaveLength(2);
    expect(footer.match(/target="_blank"/g)).toHaveLength(2);
  });

  it("renders no Shortlist badge until a count is passed (the count is M7.5's)", () => {
    expect(header).not.toContain("shortlist-count");
    const withCount = renderToStaticMarkup(createElement(SiteHeader, { shortlistCount: 2 }));
    expect(withCount).toContain("shortlist-count");
    expect(withCount).toContain(">2<");
  });

  it("renders the footer on Deep Forest with the reversed mark and the pairing", () => {
    expect(footer).toContain("site-footer");
    expect(footer).toContain('src="/brand/logo-mark-reversed.svg"');
    expect(footer).toContain(SITE_NAME);
    expect(footer).toContain(SITE_TAGLINE);
  });
});

describe("unified chrome (founder ruling, 18 Nov 2026)", () => {
  // Route-level rendering is not this suite's pattern — the
  // existing chrome tests render the header/footer shells
  // directly with renderToStaticMarkup. So the four-surface
  // identity is asserted at the SiteChrome level: SiteChrome
  // is the wrapper the root layout puts around EVERY route,
  // it no longer takes a route or a variant, and rendering
  // it with representative children for the four surfaces
  // (landing, a content route, /shortlist and a results
  // route) must yield byte-identical header and footer
  // markup on each. The served-route version of the same
  // assertion lives in e2e/seo.e2e.ts.
  const surfaces = [
    { name: "landing route", marker: "landing-surface" },
    { name: "content route (/about)", marker: "about-surface" },
    { name: "/shortlist", marker: "shortlist-surface" },
    { name: "results route", marker: "results-surface" },
  ] as const;

  const chromeOf = (html: string) => ({
    header: html.match(/<header[\s\S]*?<\/header>/)?.[0],
    footer: html.match(/<footer[\s\S]*?<\/footer>/)?.[0],
  });

  it("renders identical header and footer across the four surfaces", () => {
    const renders = surfaces.map(({ marker }) =>
      renderToStaticMarkup(createElement(SiteChrome, null, createElement("main", null, marker))),
    );
    const first = chromeOf(renders[0]);
    expect(first.header).toBeTruthy();
    expect(first.footer).toBeTruthy();
    for (const [index, html] of renders.entries()) {
      expect(html, surfaces[index].name).toContain(surfaces[index].marker);
      const { header, footer } = chromeOf(html);
      expect(header, surfaces[index].name).toBe(first.header);
      expect(footer, surfaces[index].name).toBe(first.footer);
    }
  });

  it("carries the unified header and footer markers on every surface", () => {
    for (const { name, marker } of surfaces) {
      const html = renderToStaticMarkup(
        createElement(SiteChrome, null, createElement("main", null, marker)),
      );
      // The unified (app) header: Roof-Tick mark, live-text
      // name/tagline, the brand block as one home link, and
      // the PRIMARY_NAV set including Shortlist and Contact.
      expect(html, name).toContain('<header class="site-header">');
      expect(html, name).toContain('<a class="brand" href="/">');
      expect(html, name).toContain('src="/brand/logo-mark.svg"');
      expect(html, name).toContain(SITE_NAME);
      expect(html, name).toContain(SITE_TAGLINE);
      expect(html, name).toContain('href="/shortlist"');
      expect(html, name).toContain('href="/contact"');
      // The unified (app) footer: reversed mark, the link
      // row including Privacy policy, and the bottom row
      // — with no sources line on it (BUG-197).
      expect(html, name).toContain('<footer class="site-footer">');
      expect(html, name).toContain('src="/brand/logo-mark-reversed.svg"');
      expect(html, name).toContain(
        '<a class="site-footer__link" href="/privacy">Privacy policy</a>',
      );
      expect(html, name).toContain('<div class="site-footer__bottom">');
      expect(html, name).not.toContain("site-footer__sources");
      expect(html, name).not.toContain("Data from named official sources. Facts, not scores.");
      // No trace of the retired content chrome on any surface.
      expect(html, name).not.toContain("site-header--content");
      expect(html, name).not.toContain("site-footer--content");
      expect(html, name).not.toContain("Every fact from an official source, shown with its source");
    }
  });

  it("retires the content chrome from the stylesheet and the sources line with it (BUG-197)", () => {
    const css = read("app/globals.css");
    expect(css).not.toContain(".site-header--content");
    expect(css).not.toContain(".site-footer--content");
    // The bottom row stands as the footer's last row,
    // its © line at the site's small-print measure —
    // 0.62rem (BUG-165; the BUG-128 measure) against the
    // footer body's 0.78125rem. Footer batch (23 Nov
    // 2026): the © line and social icons joined the
    // row's left. BUG-197 removes the sources line the
    // row's right carried — its rule is retired from
    // the stylesheet with the element.
    expect(css).toContain(".site-footer__bottom");
    expect(css).toMatch(/\.site-footer__bottom \{[^}]*justify-content: space-between/);
    expect(css).not.toMatch(/\.site-footer__sources \{/);
    expect(css).toMatch(/\.site-footer__copyright \{[^}]*font-size: 0\.62rem/);
    expect(css).toContain(".site-footer__social-link");
  });

  it("exports no content-footer small print from the footer module", async () => {
    const footerModule = await import("../components/SiteFooter");
    expect("FOOTER_CONTENT_SMALL" in footerModule).toBe(false);
    // BUG-197: the sources line's constant is retired
    // with the line itself.
    expect("FOOTER_SOURCES_LINE" in footerModule).toBe(false);
    const headerModule = await import("../components/SiteHeader");
    // PRIMARY_NAV is unchanged by the unification.
    expect(headerModule.PRIMARY_NAV.map((item) => item.label)).toEqual([
      "How we check",
      "Sample report",
      "About",
      "Shortlist",
      "Contact",
    ]);
  });
});

describe("kit blocks", () => {
  it("renders the button variants and the disabled state", () => {
    const html = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement(Button, null, "Primary"),
        createElement(Button, { variant: "quiet" }, "Quiet"),
        createElement(Button, { disabled: true }, "Off"),
      ),
    );
    expect(html).toContain("btn btn--primary");
    expect(html).toContain("btn btn--quiet");
    expect(html).toContain("disabled");
  });

  it("wires the field's label, hint and messages to its input", () => {
    const error = renderToStaticMarkup(
      createElement(TextField, {
        id: "postcode",
        label: "Postcode",
        hint: "For example, CM3 2JT.",
        error: "Enter the full postcode.",
      }),
    );
    expect(error).toContain('for="postcode"');
    expect(error).toContain('aria-describedby="postcode-hint postcode-message"');
    expect(error).toContain('aria-invalid="true"');
    expect(error).toContain('role="alert"');

    const success = renderToStaticMarkup(
      createElement(TextField, { id: "email", label: "Email", success: "That works." }),
    );
    expect(success).toContain("field__message--success");
    expect(success).not.toContain("aria-invalid");
  });

  it("renders the one pill family: label + tinted figure, or the fact form (D70 R5)", () => {
    const withFigure = renderToStaticMarkup(
      createElement(SummaryPill, { label: "Nearest primary", figure: "0.4 mi", band: "green" }),
    );
    expect(withFigure).toContain("pill pill--summary");
    expect(withFigure).toContain('<span class="pill__label">Nearest primary</span>');
    expect(withFigure).toContain('<span class="pill__figure pill__figure--green">0.4 mi</span>');
    const fact = renderToStaticMarkup(
      createElement(SummaryPill, { label: "Flood: 2 separate checks" }),
    );
    expect(fact).toContain("pill pill--summary");
    expect(fact).not.toContain("pill__figure");
  });

  it("renders the three notice variants with their wording labels", () => {
    for (const [variant, label] of [
      ["warning", "Warning"],
      ["stale", "Out of date"],
      ["gap", "Not in the data we hold"],
    ] as const) {
      // TypeScript's createElement overloads require children
      // in props when the component's props type requires them;
      // the lint rule prefers the rest-argument form, which
      // does not type-check here.
      // eslint-disable-next-line react/no-children-prop
      const html = renderToStaticMarkup(createElement(Notice, { variant, children: "Body" }));
      expect(html).toContain(`notice notice--${variant}`);
      expect(html).toContain(label);
    }
  });

  it("carries each table cell's column name for the stacked-row form", () => {
    const html = renderToStaticMarkup(
      createElement(DataTable, {
        caption: "Example",
        columns: ["Place", "Distance"],
        rows: [["School", "0.4 miles"]],
      }),
    );
    expect(html).toContain("<caption>Example</caption>");
    expect(html).toContain('data-label="Place"');
    expect(html).toContain('data-label="Distance"');
  });

  it("renders the tabs with the standard pattern's wiring", () => {
    const html = renderToStaticMarkup(
      createElement(Tabs, {
        ariaLabel: "Example",
        tabs: [
          { id: "a", label: "A", panel: "Panel A" },
          { id: "b", label: "B", panel: "Panel B" },
        ],
      }),
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-selected="false"');
    // Roving tabindex: only the selected tab is in the tab order.
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('role="tabpanel"');
  });
});

describe("kitchen-sink page", () => {
  it("renders every block on the play environment", () => {
    setEnv("play");
    const html = renderToStaticMarkup(createElement(KitchenSinkPage));
    for (const marker of [
      "Kitchen sink",
      "#2F5D3E",
      "#1E402C",
      "#C29A3B",
      "#E4CF9A",
      "#FDF8E8",
      "#17201E",
      "Primary button",
      "First tab",
      "Example table",
      "Warning",
      "Out of date",
      "Not in the data we hold",
    ]) {
      expect(html, marker).toContain(marker);
    }
  });

  it("is never built into the real site — production answers not found", () => {
    setEnv("production");
    let caught: unknown;
    try {
      KitchenSinkPage();
    } catch (error) {
      caught = error;
    }
    // Next's not-found signal (the digest the framework throws
    // for notFound() in this version).
    expect((caught as { digest?: string } | undefined)?.digest).toBe(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
  });

  it("is not a public page — PAGE_SEO holds no entry for it", () => {
    expect("/kitchen-sink" in PAGE_SEO).toBe(false);
    // 24 since M7.8 (the chrome pairs locked and About
    // re-locked at /about); 25 since 18 Nov 2026, when the
    // /guides hub's pair joined under the founder's footer
    // ruling; 26 since M9.4, when the /terms pair joined
    // with the Terms page. The kitchen sink stays outside
    // the set, declared non-indexable.
    expect(Object.keys(PAGE_SEO)).toHaveLength(27);
    expect(PAGE_SEO["/"].title).toBe(`Check My Next Home — ${SITE_TAGLINE}`);
  });
});

describe("suggestion shell — a row's name is its label (Regression run 44535680408 follow-up)", () => {
  // A suggestion row's accessible name is its label,
  // pinned with aria-label: CSS generated content counts
  // towards the accessible name, and the picked place
  // row's ::after marker ("Districts below ↓") renamed
  // the row the moment a pick landed — neither assistive
  // tech nor the e2e specs could find it by the name it
  // had a moment before. The founder's ruling of 19 Nov
  // 2026 took the picked state and its marker away (the
  // place pick navigates now); the pin stays, so no
  // future dress can rename a row again.
  it("an option's accessible name is its label alone — and no picked state exists", () => {
    const html = renderToStaticMarkup(
      createElement(SuggestionShell, {
        groups: [
          {
            label: "Places",
            items: [{ id: "suggest-0", label: "Chelmsford" }],
          },
        ],
      }),
    );
    expect(html).toContain('class="suggest__item"');
    expect(html).not.toContain("suggest__item--picked");
    expect(html).toContain('aria-label="Chelmsford"');
    expect(html).toContain('aria-selected="false"');
  });

  it("the keyboard's active row is selected — its name still its label alone", () => {
    const html = renderToStaticMarkup(
      createElement(SuggestionShell, {
        groups: [
          {
            label: "Streets",
            items: [{ id: "suggest-1", label: "Birkdale Rise, Chelmsford" }],
          },
        ],
        activeId: "suggest-1",
      }),
    );
    expect(html).toContain('aria-label="Birkdale Rise, Chelmsford"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("suggest__item--active");
  });
});
