import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import KitchenSinkPage from "../app/kitchen-sink/page";
import SiteFooter from "../components/SiteFooter";
import SiteHeader from "../components/SiteHeader";
import Tabs from "../components/Tabs";
import { Button, DataTable, Notice, SummaryPill, TextField } from "../components/kit";
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
    const labels = ["How we check", "Sample report", "About", "Shortlist"];
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
    expect(header).not.toContain('href="/guides"');
  });

  it("renders the footer's sample form: middle links and the sources line (fidelity pass 2)", () => {
    for (const label of ["How we check", "Sample report", "About", "Contact"]) {
      expect(footer, label).toContain(`>${label}<`);
    }
    expect(footer).toContain('href="/contact"');
    expect(footer).toContain("Data from named official sources. Facts, not scores.");
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

  it("is not a public page — PAGE_SEO is unchanged and holds no entry for it", () => {
    expect("/kitchen-sink" in PAGE_SEO).toBe(false);
    expect(Object.keys(PAGE_SEO)).toHaveLength(21);
    expect(PAGE_SEO["/"].title).toBe(`Check My Next Home — ${SITE_TAGLINE}`);
  });
});
