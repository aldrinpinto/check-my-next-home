import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Home from "../app/page";
import AudienceCards from "../components/AudienceCards";
import PostcodeBox from "../components/PostcodeBox";
import {
  HOME_AUDIENCE_CARDS,
  HOME_CARDS_HEADING,
  HOME_CARDS_SUB,
  HOME_CHECK_TILES,
  HOME_CHECK_TILES_HEADING,
  HOME_CHECK_TILES_SUB,
  HOME_HERO_SMALL_LINE,
  HOME_HERO_SUBLINE,
  HOME_HOW_IT_WORKS_HEADING,
  HOME_HOW_IT_WORKS_STEPS,
  HOME_HOW_IT_WORKS_SUB,
  HOME_MANIFESTO_HEADLINE,
  HOME_MANIFESTO_WHY,
  HOME_REPORT_BAND_CTA,
  HOME_REPORT_BAND_HEADING,
  HOME_REPORT_BAND_LINE,
  HOME_REPORT_BAND_PRICE,
  HOME_REPORT_BAND_PRICE_LINES,
  HOME_SOURCE_STRIP_HEADING,
  HOME_SOURCE_STRIP_SOURCES,
  POSTCODE_BOX_BUTTON,
  POSTCODE_BOX_BUTTON_BARE,
  POSTCODE_BOX_HINT,
  POSTCODE_BOX_LABEL,
  POSTCODE_BOX_PLACEHOLDER,
  SAMPLE_REPORT_HEADING,
  SAMPLE_REPORT_LINE,
  SAMPLE_REPORT_LINK_TEXT,
  SAMPLE_REPORT_PATH,
} from "../lib/home";
import {
  DISCLAIMER_SHORT_FORM,
  HOME_HERO_HEADLINE,
  SITE_KICKER,
  SITE_MANIFESTO,
  SITE_TAGLINE,
} from "../lib/site";

// M7.2 — the home page's pins. The page's copy lives in
// lib/home.ts (and the identity constants in lib/site.ts) and
// is pinned verbatim here; the rendered page is checked for
// the hero's pinned order, the postcode box, the
// manifesto block's single appearance, the SAMPLE link's
// labelling, and the absences the step rules on (no disclaimer,
// no M3 headline anywhere; the price/"free" absence M7.2
// ruled was retired by the founder follow-on, 17 Nov 2026).
// M7.3 re-pins the box's label and hint for the wider input
// and wires the journey into it (fold-in 7); the box's own
// behaviour is pinned in tests/journey.test.ts and the E2E
// journey specs.
// D70 re-pins (the design-alignment pass, 17 Nov 2026): the
// hero's order (the tagline line dropped; the imagery panels
// and the example-check action in), the audience cards (the
// decided landing page's intros and check lists, text-only),
// "what it checks" re-based on the plain check names, the
// family-names panel added, and the manifesto's why line
// (the chosen homepage's, verbatim). Each re-pin is named in
// docs/frontend-design-pass.md.
// Founder follow-on re-pins (17 Nov 2026, the sample governs
// the landing): the manifesto's why line re-pinned to the
// decided sample page's line (superseding D70 R3's chosen-
// homepage line), the "no price or 'free' lines" absence
// retired for this page (the sample carries the £4.99 band
// and the steps' free-headlines line), and new pins for the
// tile grid, the steps and the report band. Named in the
// follow-on addendum to docs/frontend-design-pass.md.
// Fidelity pass 2 re-pins (founder, 17 Nov 2026 — the
// 31-item comparison): the hero's order (the panels and the
// example-check action OUT, the small line IN), the box's
// bare hero form pinned beside its standard form, the hint's
// example postcode (the founder's own postcode never appears
// in visitor-facing copy — SW1A 1AA is the neutral example),
// and the family-names panel and "what it checks" list pins
// retired with their sections. Named in the pass's section
// of docs/frontend-design-pass.md.
// Source strip pins (founder's ruling, 18 Nov 2026 — the
// samples' Version B): the strip's heading and the eight
// sources' name lines pinned verbatim, and the rendered
// strip's place under the hero pinned. Named in the strip's
// section of docs/frontend-design-pass.md.

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

  it("pins the postcode box's furniture (label and hint re-pinned at M7.3; example and bare form at fidelity pass 2)", () => {
    expect(POSTCODE_BOX_LABEL).toBe("Postcode or address");
    // Fidelity pass 2: the example is the neutral SW1A 1AA —
    // the founder's own postcode never appears in
    // visitor-facing copy.
    expect(POSTCODE_BOX_HINT).toBe(
      "For example, SW1A 1AA — or the full address, with its postcode.",
    );
    expect(POSTCODE_BOX_BUTTON).toBe("Check a home");
    // The hero's bare form (the sample's search row): the
    // placeholder in the field, the Brass button's words.
    // The placeholder is the one ruled text for every
    // search entry field (founder ruling, 19 Nov 2026).
    expect(POSTCODE_BOX_PLACEHOLDER).toBe("Enter a postcode, street or town — e.g. SW1A 1AA");
    expect(POSTCODE_BOX_BUTTON_BARE).toBe("Check this home");
  });

  it("pins the hero's small line verbatim (fidelity pass 2 — the sample's line)", () => {
    expect(HOME_HERO_SMALL_LINE).toBe(
      "Free headlines for every home, from named official sources. Detailed report £4.99 — one home, no account, no subscription.",
    );
  });

  it("pins the three audience cards verbatim, in order (D70 R3 — the decided page's copy)", () => {
    expect(HOME_CARDS_HEADING).toBe("Moving looks different for every family");
    expect(HOME_CARDS_SUB).toBe(
      "Whoever is moving with you, we lead with the checks that matter to your family's life there.",
    );
    expect(HOME_AUDIENCE_CARDS.map((card) => card.title)).toEqual([
      "Moving as a couple",
      "Moving with kids",
      "Moving with pets",
    ]);
    expect(HOME_AUDIENCE_CARDS.map((card) => card.intro)).toEqual([
      "A first home together, or the next chapter — it's about the life you'll live there.",
      "School runs and childcare shape family life — so these are the first things we check.",
      "A home has to work for your pets too — the dog, the cat, or whoever else shares it.",
    ]);
    expect(HOME_AUDIENCE_CARDS.map((card) => [...card.checks])).toEqual([
      [
        "Places to eat and drink out nearby",
        "Gyms, parks and places to go nearby, for evenings and weekends",
        "Trains and buses for the commute",
        "The real crime numbers for the streets around the home",
      ],
      [
        "Nurseries, pre-schools and childminders nearby",
        "Primary, secondary, grammar and independent schools",
        "Parks and places to visit at weekends",
        "Doctors and dentists nearby",
      ],
      [
        "Vets nearby when your pet needs one",
        "Parks and green spaces nearby, for the daily walk and play",
        "Pet boarding nearby, for holidays",
        "Groomers to keep them looking pretty, pet shops for food and everything else",
      ],
    ]);
  });

  // Retired at fidelity pass 2: the family-names panel pin
  // (D70 R4) and the "what it checks" pin — both sections
  // leave the page (the panel rendered an internal
  // annotation; the list was a second tour of the checks).
  // The rendered-page describe below asserts their absence.

  it("pins the 'what we check for you' tiles verbatim, in order (founder follow-on — the sample's grid)", () => {
    expect(HOME_CHECK_TILES_HEADING).toBe("What we check for you");
    expect(HOME_CHECK_TILES_SUB).toBe(
      "The checks that matter for family life — schools, health, safety, home risks and the cost of living — all from named official sources.",
    );
    expect(HOME_CHECK_TILES.map((tile) => tile.title)).toEqual([
      "Schools, nurseries & childminders",
      "Doctors, dentists & vets",
      "Food, leisure & everyday life",
      "Safety around the home",
      "Your neighbours & the area",
      "Plans that could change the street",
      "Flood risk",
      "The cost of living",
      "What homes here actually sold for",
    ]);
    expect(HOME_CHECK_TILES.map((tile) => tile.line)).toEqual([
      "Find the nearest primaries, secondaries and nurseries — the ones that matter for the school run.",
      "GPs, hospitals, dentists, maternity care and vets — there for the moments you really need them.",
      "Shops, food and drink, gyms, libraries, places of worship and places to visit.",
      "What crimes were recorded in the area over the past year, and what kind they were — the counts, month by month.",
      "The make-up of your new neighbourhood — ages, households and ethnicities.",
      "Planning applications and major schemes nearby.",
      "Rivers, sea and surface water — plus any live flood warnings today.",
      "Council tax, energy rating, broadband and the monthly cost of owning the home.",
      "Recorded sale prices for this home and its street — never a made-up valuation.",
    ]);
  });

  it("pins 'how it works' verbatim (founder follow-on — the sample's steps)", () => {
    expect(HOME_HOW_IT_WORKS_HEADING).toBe("How it works");
    expect(HOME_HOW_IT_WORKS_SUB).toBe("From postcode to peace of mind in a few minutes.");
    expect(HOME_HOW_IT_WORKS_STEPS.map((step) => step.title)).toEqual([
      "Enter the postcode",
      "Pick your home",
      "Read the free headlines",
      "Go deeper for £4.99",
    ]);
    expect(HOME_HOW_IT_WORKS_STEPS.map((step) => step.line)).toEqual([
      "Type the postcode of a home you're looking at — on Rightmove, Zoopla, or anywhere.",
      "Choose the exact address. If we only have part of the postcode, we say so honestly.",
      "Every check's headline fact is free, on every home. No account, no blurred results.",
      "One detailed report for one home — full lists, charts, maps and questions to ask the seller.",
    ]);
  });

  it("pins the report band verbatim (founder follow-on — the sample's band)", () => {
    expect(HOME_REPORT_BAND_HEADING).toBe("The detailed report");
    expect(HOME_REPORT_BAND_LINE).toBe(
      "Everything the listing doesn't tell you, in one document: full school lists, month-by-month crime, genuine flood maps, sold prices nearby, the cost-of-ownership breakdown, planning applications by name, and questions to ask the seller — all sourced, all dated.",
    );
    expect(HOME_REPORT_BAND_CTA).toBe("See a sample report");
    expect(HOME_REPORT_BAND_PRICE).toBe("£4.99");
    expect(HOME_REPORT_BAND_PRICE_LINES).toEqual(["per home · one-off", "no subscription"]);
  });

  it("pins the source strip's heading and the eight sources' lines, in order (founder's ruling, 18 Nov 2026)", () => {
    expect(HOME_SOURCE_STRIP_HEADING).toBe("Powered by official UK data");
    expect(HOME_SOURCE_STRIP_SOURCES.map((source) => source.id)).toEqual([
      "hmlr",
      "ea",
      "police",
      "ofcom",
      "defra",
      "ons",
      "dfe",
      "epc",
    ]);
    expect(HOME_SOURCE_STRIP_SOURCES.map((source) => [...source.lines])).toEqual([
      ["HM Land", "Registry"],
      ["Environment", "Agency"],
      ["Police.uk"],
      ["Ofcom"],
      ["Defra"],
      ["ONS"],
      ["DfE"],
      ["EPC", "Register"],
    ]);
  });

  it("pins the manifesto block's lines", () => {
    expect(HOME_MANIFESTO_HEADLINE).toBe("A house is bricks. A home is family.");
    // Founder follow-on (17 Nov 2026): the decided sample
    // page's why line, verbatim — it supersedes the chosen
    // homepage's line D70 R3 pinned here.
    expect(HOME_MANIFESTO_WHY).toBe(
      "Behind every check is a family's daily life — the school run, the walk to the park, the monthly bills. That's why we check what the listing doesn't tell you.",
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

  it("renders the hero in its pinned order: kicker, H1, sub-line, bare box, small line (fidelity pass 2)", () => {
    // Item 1 (parity fix batch): the hero kicker is the
    // Master's stop-less form (SITE_KICKER); the stopped
    // manifesto line renders only in the manifesto block.
    expect(SITE_KICKER).toBe("For the family who'll live there — not just the buyer");
    expect(SITE_MANIFESTO).toBe(`${SITE_KICKER}.`);
    const kicker = html.indexOf(SITE_KICKER);
    const headline = html.indexOf(`<h1>${HOME_HERO_HEADLINE}</h1>`);
    const subline = html.indexOf(HOME_HERO_SUBLINE);
    const box = html.indexOf('id="postcode"');
    const small = html.indexOf(HOME_HERO_SMALL_LINE);
    for (const index of [kicker, headline, subline, box, small]) {
      expect(index).toBeGreaterThan(-1);
    }
    expect(kicker).toBeLessThan(headline);
    expect(headline).toBeLessThan(subline);
    expect(subline).toBeLessThan(box);
    expect(box).toBeLessThan(small);
    // The hero tagline line is dropped (D70 R2/D20): the
    // tagline lives in the header/footer lockups, and this
    // page renders neither — so it appears nowhere here.
    expect(html).not.toContain(SITE_TAGLINE);
    // Fidelity pass 2's retirements render nowhere: the
    // imagery panels, the example-check action, the
    // family-names annotation panel, the second check tour.
    expect(html).not.toContain("hero__panels");
    expect(html).not.toContain("See an example check");
    expect(html).not.toContain("checks speak family language");
    expect(html).not.toContain("What it checks");
    expect(html).not.toContain("checks-list");
  });

  it("renders the three cards; the 'See a full example' section is removed (fold-in workstream 5)", () => {
    for (const card of HOME_AUDIENCE_CARDS) {
      expect(html).toContain(card.title);
      expect(html).toContain(card.intro);
      for (const check of card.checks) expect(html).toContain(check);
    }
    expect(html).toContain(HOME_CARDS_HEADING);
    // The section (heading, line, link) is gone entirely;
    // the report band's own sample door remains.
    expect(html).not.toContain(SAMPLE_REPORT_HEADING);
    expect(html).not.toContain(SAMPLE_REPORT_LINE);
    expect(html).not.toContain(SAMPLE_REPORT_LINK_TEXT);
  });

  it("renders the source strip under the hero, before the cards (founder's ruling, 18 Nov 2026)", () => {
    const small = html.indexOf(HOME_HERO_SMALL_LINE);
    const strip = html.indexOf("source-strip");
    const head = html.indexOf(HOME_SOURCE_STRIP_HEADING);
    const cards = html.indexOf(HOME_CARDS_HEADING);
    for (const index of [strip, head]) {
      expect(index).toBeGreaterThan(-1);
    }
    expect(small).toBeLessThan(strip);
    expect(strip).toBeLessThan(cards);
    // The eight drawn lockups, each with its pinned name
    // lines — the multi-word names stacked on two lines.
    expect(html.split('class="source-lockup"')).toHaveLength(9);
    for (const source of HOME_SOURCE_STRIP_SOURCES) {
      expect(html).toContain(`source-lockup__name--${source.id}`);
      for (const line of source.lines) {
        expect(html).toContain(`<span class="source-lockup__line">${line}</span>`);
      }
    }
    // Drawn lockups only: the strip's glyphs are inline SVG,
    // and no image carries a body's real logo.
    const stripHtml = html.slice(strip, cards);
    expect(stripHtml).toContain("<svg");
    expect(stripHtml).not.toContain("<img");
  });

  it("shows the manifesto block once, after the tile grid", () => {
    expect(html.split(HOME_MANIFESTO_HEADLINE)).toHaveLength(2);
    expect(html).toContain(HOME_MANIFESTO_WHY);
    // The block sits after the tile grid — with the sample
    // section removed (fold-in), it closes the page.
    const tiles = html.indexOf(HOME_CHECK_TILES_HEADING);
    const block = html.indexOf(HOME_MANIFESTO_HEADLINE);
    expect(tiles).toBeLessThan(block);
  });

  it("renders the sample's sections in the sample's order (founder follow-on)", () => {
    // The tiles, the steps and the band carry the sample's
    // copy, and the page order follows the sample: cards,
    // tile grid, steps, report band, manifesto.
    for (const tile of HOME_CHECK_TILES) {
      expect(html).toContain(tile.title);
      expect(html).toContain(tile.line);
    }
    for (const step of HOME_HOW_IT_WORKS_STEPS) {
      expect(html).toContain(step.title);
      expect(html).toContain(step.line);
    }
    expect(html).toContain(HOME_REPORT_BAND_HEADING);
    expect(html).toContain(HOME_REPORT_BAND_LINE);
    expect(html).toContain(HOME_REPORT_BAND_PRICE);
    for (const line of HOME_REPORT_BAND_PRICE_LINES) expect(html).toContain(line);
    // The band's action is the sample, at the sample's route.
    expect(html).toContain(`href="${SAMPLE_REPORT_PATH}"`);
    expect(html).toContain(HOME_REPORT_BAND_CTA);

    const cards = html.indexOf(HOME_CARDS_HEADING);
    const tiles = html.indexOf(HOME_CHECK_TILES_HEADING);
    const steps = html.indexOf(HOME_HOW_IT_WORKS_HEADING);
    const band = html.indexOf(HOME_REPORT_BAND_HEADING);
    const block = html.indexOf(HOME_MANIFESTO_HEADLINE);
    for (const index of [cards, tiles, steps, band, block]) {
      expect(index).toBeGreaterThan(-1);
    }
    expect(cards).toBeLessThan(tiles);
    expect(tiles).toBeLessThan(steps);
    expect(steps).toBeLessThan(band);
    expect(band).toBeLessThan(block);
  });

  it("keeps the ruled absences: no disclaimer, no placeholder", () => {
    expect(html).not.toContain(DISCLAIMER_SHORT_FORM);
    expect(html).not.toContain("Coming soon");
    // The M7.2 absence of price and "free" lines is retired
    // by the founder follow-on: the sample's band (£4.99) and
    // steps (free headlines) are pinned above, not banned.
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

  it("renders the hero's bare form: no visible label or hint, the sample's placeholder and button (fidelity pass 2)", () => {
    const bare = renderToStaticMarkup(createElement(PostcodeBox, { bare: true }));
    expect(bare).toContain("postcode-box--bare");
    // The label survives only as the field's accessible
    // name — visually hidden, never a visible furniture line.
    expect(bare).toContain("visually-hidden");
    expect(bare).not.toContain("field__label");
    expect(bare).not.toContain("field__hint");
    expect(bare).not.toContain(POSTCODE_BOX_HINT);
    expect(bare).toContain(`placeholder="${POSTCODE_BOX_PLACEHOLDER}"`);
    expect(bare).toContain(POSTCODE_BOX_BUTTON_BARE);
    expect(bare).toContain("btn--brass");
  });

  it("carries no validation of any kind — a partial postcode is never invalid", () => {
    expect(html).not.toContain("pattern");
    expect(html).not.toContain("required");
    expect(html).not.toContain("aria-invalid");
    expect(html).not.toContain("field__message");
  });
});

describe("the audience cards in the design's form (D70 R3)", () => {
  it("renders title, intro and check list per card — text only, no button, no art, no mode", () => {
    const html = renderToStaticMarkup(createElement(AudienceCards))
      .replaceAll("&amp;", "&")
      .replaceAll("&#x27;", "'");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("Start with a postcode");
    for (const card of HOME_AUDIENCE_CARDS) {
      expect(html).toContain(card.title);
      expect(html).toContain(card.intro);
      for (const check of card.checks) expect(html).toContain(check);
    }
  });
});

describe("the one-line illustrations", () => {
  it("exist at their served paths, in the Roof-Tick's stroke language only", () => {
    // The hero strip that carried these three retired at
    // fidelity pass 2; the assets stay the kit's
    // illustration language (the dog still serves the
    // shortlist's empty state), so the stroke guard stays.
    for (const path of [
      "/illustrations/card-boxes.svg",
      "/illustrations/card-key.svg",
      "/illustrations/card-dog.svg",
    ]) {
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
