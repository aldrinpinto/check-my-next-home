import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Home from "../app/page";
import AudienceCards from "../components/AudienceCards";
import PostcodeBox from "../components/PostcodeBox";
import {
  AUDIENCE_CARD_BUTTON,
  HOME_AUDIENCE_CARDS,
  HOME_HERO_ART,
  HOME_HERO_SUBLINE,
  HOME_MANIFESTO_HEADLINE,
  HOME_MANIFESTO_WHY,
  HOME_WHAT_IT_CHECKS,
  HOME_WHAT_IT_CHECKS_HEADING,
  POSTCODE_BOX_BUTTON,
  POSTCODE_BOX_HINT,
  POSTCODE_BOX_LABEL,
  SAMPLE_REPORT_HEADING,
  SAMPLE_REPORT_LINE,
  SAMPLE_REPORT_LINK_TEXT,
  SAMPLE_REPORT_PATH,
} from "../lib/home";
import {
  DISCLAIMER_SHORT_FORM,
  HOME_HERO_HEADLINE,
  SITE_MANIFESTO,
  SITE_TAGLINE,
} from "../lib/site";

// M7.2 — the home page's pins. The page's copy lives in
// lib/home.ts (and the identity constants in lib/site.ts) and
// is pinned verbatim here; the rendered page is checked for
// the hero's pinned order, the postcode box, the
// manifesto block's single appearance, the SAMPLE link's
// labelling, and the absences the step rules on (no disclaimer,
// no price or "free" lines, no M3 headline anywhere).
// M7.3 re-pins the box's label and hint for the wider input
// and wires the journey into it (fold-in 7); the box's own
// behaviour is pinned in tests/journey.test.ts and the E2E
// journey specs.

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

// The retired M3 headline (D44). It is named here once, as the
// forbidden string the guards below assert against — the same
// pattern as the header guard in tests/look-feel-kit.test.ts.
const M3_LINE = "Your family's next home — check what the listing doesn't tell you.";

describe("home page copy (lib/home.ts)", () => {
  it("pins the hero sub-line verbatim (M7.2's step text)", () => {
    expect(HOME_HERO_SUBLINE).toBe(
      "We check what the listing doesn't tell you — schools and nurseries, safety in plain numbers, flood risk, and the real cost of living there.",
    );
  });

  it("pins the postcode box's furniture (label and hint re-pinned at M7.3)", () => {
    expect(POSTCODE_BOX_LABEL).toBe("Postcode or address");
    expect(POSTCODE_BOX_HINT).toBe(
      "For example, CM3 2JT — or the full address, with its postcode.",
    );
    expect(POSTCODE_BOX_BUTTON).toBe("Check a home");
    expect(AUDIENCE_CARD_BUTTON).toBe("Start with a postcode");
  });

  it("pins the three audience cards verbatim, in order", () => {
    expect(HOME_AUDIENCE_CARDS.map((card) => card.title)).toEqual([
      "Moving as a couple",
      "Moving with kids",
      "Moving with pets",
    ]);
    expect(HOME_AUDIENCE_CARDS.map((card) => card.line)).toEqual([
      "Shops and stations for the everyday, broadband for working from home, and the real cost of living there — council tax, energy, and what homes nearby have sold for.",
      "Schools and nurseries, doctors and hospitals, parks to play in — and safety in plain numbers: the recorded crime counts for the area.",
      "Parks and dog-walking areas on the doorstep, the nearest vet, and green space for muddy paws.",
    ]);
    expect(HOME_AUDIENCE_CARDS.map((card) => card.art)).toEqual([
      "/illustrations/card-key.svg",
      "/illustrations/card-boxes.svg",
      "/illustrations/card-dog.svg",
    ]);
  });

  it("pins 'what it checks' verbatim — one item per checking-screen row (M7.3)", () => {
    expect(HOME_WHAT_IT_CHECKS_HEADING).toBe("What it checks");
    expect(HOME_WHAT_IT_CHECKS).toHaveLength(9);
    expect(HOME_WHAT_IT_CHECKS.map((check) => check.name)).toEqual([
      "Schools near the home",
      "Nurseries and pre-schools",
      "Doctors, dentists and pharmacies",
      "Hospitals, A&E and maternity care",
      "Parks, vets and dog walks",
      "Shops and getting about",
      "Eating out, keeping fit and days out",
      "Flood risk",
      "What homes sell for, and the running costs",
    ]);
    expect(HOME_WHAT_IT_CHECKS.map((check) => check.line)).toEqual([
      "The primary and secondary schools closest to the front door, with the distance to each.",
      "Places for the youngest children, nearest first.",
      "The nearest GP surgery, NHS dentist and pharmacy.",
      "The nearest hospital, emergency department and maternity unit.",
      "Green spaces to play in and walk the dog, and the nearest vet.",
      "The nearest shops, bus stops and stations.",
      "Food and drink, gyms and leisure, places to visit, places of worship and libraries.",
      "The published flood maps for the area, shown exactly as they are published.",
      "Sold prices nearby, the council tax scale, energy certificates, planning constraints and ownership.",
    ]);
  });

  it("pins the manifesto block's lines", () => {
    expect(HOME_MANIFESTO_HEADLINE).toBe("A house is bricks. A home is family.");
    expect(HOME_MANIFESTO_WHY).toBe(
      "Every check exists because a listing shows a house — and your family will live in the home.",
    );
  });

  it("pins the SAMPLE link's route and labelling", () => {
    // The route is the header's own (PRIMARY_NAV, M7.1); the
    // page behind it is M8.9's.
    expect(SAMPLE_REPORT_PATH).toBe("/sample-report");
    expect(SAMPLE_REPORT_HEADING).toBe("See a full example");
    expect(SAMPLE_REPORT_LINK_TEXT).toBe("See a SAMPLE report");
    expect(SAMPLE_REPORT_LINE).toContain("marked SAMPLE");
  });
});

describe("the rendered home page", () => {
  // React escapes & and ' in static markup; decode the two
  // entities this page's copy produces so the assertions read
  // against the copy itself.
  const html = renderToStaticMarkup(createElement(Home))
    .replaceAll("&amp;", "&")
    .replaceAll("&#x27;", "'");

  it("renders the hero in its pinned order: kicker, H1, sub-line, box, tagline", () => {
    const kicker = html.indexOf(SITE_MANIFESTO);
    const headline = html.indexOf(`<h1>${HOME_HERO_HEADLINE}</h1>`);
    const subline = html.indexOf(HOME_HERO_SUBLINE);
    const box = html.indexOf('id="postcode"');
    const tagline = html.indexOf(SITE_TAGLINE, box);
    for (const index of [kicker, headline, subline, box, tagline]) {
      expect(index).toBeGreaterThan(-1);
    }
    expect(kicker).toBeLessThan(headline);
    expect(headline).toBeLessThan(subline);
    expect(subline).toBeLessThan(box);
    expect(box).toBeLessThan(tagline);
  });

  it("carries the hero's one-line illustration", () => {
    expect(html).toContain(`src="${HOME_HERO_ART}"`);
    expect(html).toContain("moving boxes being carried in");
  });

  it("renders the three cards, the nine checks and the sample link", () => {
    for (const card of HOME_AUDIENCE_CARDS) {
      expect(html).toContain(card.title);
      expect(html).toContain(card.line);
    }
    for (const check of HOME_WHAT_IT_CHECKS) {
      expect(html).toContain(check.name);
      expect(html).toContain(check.line);
    }
    expect(html).toContain(`href="${SAMPLE_REPORT_PATH}"`);
    expect(html).toContain(SAMPLE_REPORT_LINK_TEXT);
  });

  it("shows the manifesto block once, mid-page", () => {
    expect(html.split(HOME_MANIFESTO_HEADLINE)).toHaveLength(2);
    expect(html).toContain(HOME_MANIFESTO_WHY);
    // The block sits between the checks list and the sample
    // section — mid-page, as the step rules.
    const checks = html.indexOf(HOME_WHAT_IT_CHECKS_HEADING);
    const block = html.indexOf(HOME_MANIFESTO_HEADLINE);
    const sample = html.indexOf(SAMPLE_REPORT_HEADING);
    expect(checks).toBeLessThan(block);
    expect(block).toBeLessThan(sample);
  });

  it("keeps the ruled absences: no disclaimer, no price or free lines, no placeholder", () => {
    expect(html).not.toContain(DISCLAIMER_SHORT_FORM);
    expect(html).not.toContain("£");
    expect(html).not.toMatch(/\bfree\b/i);
    expect(html).not.toContain("Coming soon");
  });

  it("never carries the retired M3 headline", () => {
    expect(html).not.toContain(M3_LINE);
  });
});

describe("the postcode box (inert at M7.2; wired at M7.3)", () => {
  const html = renderToStaticMarkup(createElement(PostcodeBox));

  it("renders the kit's field and button, with no form action", () => {
    expect(html).toContain("<form");
    expect(html).not.toContain("action=");
    expect(html).toContain('id="postcode"');
    expect(html).toContain(POSTCODE_BOX_LABEL);
    expect(html).toContain(POSTCODE_BOX_HINT);
    expect(html).toContain(POSTCODE_BOX_BUTTON);
  });

  it("carries no validation of any kind — a partial postcode is never invalid", () => {
    expect(html).not.toContain("pattern");
    expect(html).not.toContain("required");
    expect(html).not.toContain("aria-invalid");
    expect(html).not.toContain("field__message");
  });
});

describe("the audience cards' one target", () => {
  it("renders one button per card, all the same — no audience state or mode", () => {
    const html = renderToStaticMarkup(createElement(AudienceCards));
    expect(html.split(AUDIENCE_CARD_BUTTON)).toHaveLength(4);
    for (const card of HOME_AUDIENCE_CARDS) {
      expect(html).toContain(`src="${card.art}"`);
      expect(html).toContain(card.artAlt);
    }
  });
});

describe("the one-line illustrations", () => {
  it("exist at their served paths, in the Roof-Tick's stroke language only", () => {
    for (const path of [HOME_HERO_ART, ...HOME_AUDIENCE_CARDS.map((card) => card.art)]) {
      const file = join(ROOT, "public", path);
      expect(existsSync(file), path).toBe(true);
      const svg = readFileSync(file, "utf8");
      // Brand strokes only, round caps and joins, no raster
      // imagery and no fills painting shapes — the mark's own
      // language (public/brand/logo-mark.svg).
      expect(svg).toContain('stroke="#2F5D3E"');
      expect(svg).toContain('stroke="#C29A3B"');
      expect(svg).toContain('stroke-linecap="round"');
      expect(svg).not.toContain("<image");
      expect(svg).not.toMatch(/fill="(?!none)/);
    }
  });
});

describe("the M3 correction (D44) — the retired line survives nowhere live", () => {
  it("is absent from the page, the constants and the brand record", () => {
    for (const path of [
      "app/page.tsx",
      "lib/site.ts",
      "lib/home.ts",
      "docs/brand.md",
      "README.md",
    ]) {
      expect(read(path), path).not.toContain(M3_LINE);
    }
    expect(read("docs/brand.md")).not.toContain("survives only as homepage hero copy");
  });
});
