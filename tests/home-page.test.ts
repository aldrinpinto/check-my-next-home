import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Home from "../app/page";
import AudienceCards from "../components/AudienceCards";
import PostcodeBox from "../components/PostcodeBox";
import {
  EXAMPLE_CHECK_LABEL,
  HOME_AUDIENCE_CARDS,
  HOME_CARDS_HEADING,
  HOME_CARDS_SUB,
  HOME_FAMILY_NAMES,
  HOME_FAMILY_NAMES_LEAD,
  HOME_FAMILY_NAMES_NOTE,
  HOME_HERO_PANELS,
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
import { CHECKING_ROWS } from "../lib/journey";
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
// D70 re-pins (the design-alignment pass, 17 Nov 2026): the
// hero's order (the tagline line dropped; the imagery panels
// and the example-check action in), the audience cards (the
// decided landing page's intros and check lists, text-only),
// "what it checks" re-based on the plain check names, the
// family-names panel added, and the manifesto's why line
// (the chosen homepage's, verbatim). Each re-pin is named in
// docs/frontend-design-pass.md.

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
    // D70 R2: the example-check action beside the box.
    expect(EXAMPLE_CHECK_LABEL).toBe("See an example check");
  });

  it("pins the hero's imagery panels verbatim, in order (D70 R2)", () => {
    expect(HOME_HERO_PANELS.map((panel) => panel.title)).toEqual([
      "Moving-in day",
      "Keys in hand",
      "A dog at the door",
    ]);
    expect(HOME_HERO_PANELS.map((panel) => panel.line)).toEqual([
      "Boxes in the hall, kettle on",
      "The first morning in the new home",
      "Pets are family too",
    ]);
    expect(HOME_HERO_PANELS.map((panel) => panel.art)).toEqual([
      "/illustrations/card-boxes.svg",
      "/illustrations/card-key.svg",
      "/illustrations/card-dog.svg",
    ]);
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

  it("pins the family-names panel verbatim (D70 R4)", () => {
    expect(HOME_FAMILY_NAMES_LEAD).toBe("On the homepage, checks speak family language:");
    expect(HOME_FAMILY_NAMES).toEqual([
      "Schools & nurseries near the door",
      "Safety in plain numbers",
      "Flood risk at this address",
      "The real cost of living there",
      "Health near the door",
      "Room to walk the dog",
    ]);
    expect(HOME_FAMILY_NAMES_NOTE).toBe(
      "Homepage only — the panel and report keep their plain names.",
    );
  });

  it("pins 'what it checks' — one item per checking-screen row, under the plain names (D70 R4)", () => {
    expect(HOME_WHAT_IT_CHECKS_HEADING).toBe("What it checks");
    expect(HOME_WHAT_IT_CHECKS).toHaveLength(9);
    // The names are the checking screen's own row labels —
    // the contents list can never drift from the rows.
    expect(HOME_WHAT_IT_CHECKS.map((check) => check.name)).toEqual(
      CHECKING_ROWS.map((row) => row.label),
    );
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
    // D70 R3: the chosen homepage's why line, verbatim.
    expect(HOME_MANIFESTO_WHY).toBe(
      "Every check on this page exists because a family will live with the answer — the school run, the dog walk, the monthly bills, the street after dark — long after the listing is forgotten.",
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

  it("renders the hero in its pinned order: kicker, H1, sub-line, panels, box, example (D70 R2)", () => {
    const kicker = html.indexOf(SITE_MANIFESTO);
    const headline = html.indexOf(`<h1>${HOME_HERO_HEADLINE}</h1>`);
    const subline = html.indexOf(HOME_HERO_SUBLINE);
    const panels = html.indexOf("hero__panels");
    const box = html.indexOf('id="postcode"');
    const example = html.indexOf(EXAMPLE_CHECK_LABEL);
    for (const index of [kicker, headline, subline, panels, box, example]) {
      expect(index).toBeGreaterThan(-1);
    }
    expect(kicker).toBeLessThan(headline);
    expect(headline).toBeLessThan(subline);
    expect(subline).toBeLessThan(panels);
    expect(panels).toBeLessThan(box);
    expect(box).toBeLessThan(example);
    // The hero tagline line is dropped (D70 R2/D20): the
    // tagline lives in the header/footer lockups, and this
    // page renders neither — so it appears nowhere here.
    expect(html).not.toContain(SITE_TAGLINE);
  });

  it("carries the hero's three captioned panels, in the line-illustration language", () => {
    for (const panel of HOME_HERO_PANELS) {
      expect(html).toContain(`src="${panel.art}"`);
      expect(html).toContain(panel.artAlt);
      expect(html).toContain(panel.title);
      expect(html).toContain(panel.line);
    }
  });

  it("renders the three cards, the family-names panel, the nine checks and the sample link", () => {
    for (const card of HOME_AUDIENCE_CARDS) {
      expect(html).toContain(card.title);
      expect(html).toContain(card.intro);
      for (const check of card.checks) expect(html).toContain(check);
    }
    expect(html).toContain(HOME_CARDS_HEADING);
    expect(html).toContain(HOME_FAMILY_NAMES_LEAD);
    for (const name of HOME_FAMILY_NAMES) expect(html).toContain(name);
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
    for (const path of HOME_HERO_PANELS.map((panel) => panel.art)) {
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
