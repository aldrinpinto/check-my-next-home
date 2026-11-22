import { describe, expect, it } from "vitest";

import { HOW_WE_CHECK_ICON_KEYS } from "../components/HowWeCheckIcon";
import { HOW_WE_CHECK_CARDS } from "../lib/site-pages";

// BUG-157: every How We Check card's icon key must have
// a drawn glyph, and every drawn glyph must belong to a
// card — the two sets are pinned together so a card can
// never silently render an empty tile (the component
// renders nothing for an unknown key by design).
describe("BUG-157 — How We Check icon set", () => {
  it("every card's icon key has a drawn glyph", () => {
    const drawn = new Set<string>(HOW_WE_CHECK_ICON_KEYS);
    for (const card of HOW_WE_CHECK_CARDS) {
      expect(drawn.has(card.icon), `${card.heading} → ${card.icon}`).toBe(true);
    }
  });

  it("every drawn glyph belongs to a card, with no duplicates", () => {
    const used = HOW_WE_CHECK_CARDS.map((card) => card.icon);
    expect(new Set(used).size).toBe(used.length);
    expect([...used].sort()).toEqual([...HOW_WE_CHECK_ICON_KEYS].sort());
  });

  it("no card keeps an abstract typographic glyph", () => {
    for (const card of HOW_WE_CHECK_CARDS) {
      expect(card.icon).toMatch(/^[a-z-]+$/);
    }
  });
});
